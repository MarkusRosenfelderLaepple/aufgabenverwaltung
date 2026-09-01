/**
 * Die drei Nebendiagramme der Auswertung: Wochentagsprofil, Durchlaufzeit,
 * Projekte.
 *
 * Sie stehen zusammen in **einer** Datei, weil sie zusammen gelesen werden und
 * alle drei dasselbe Muster haben: Option aus Daten und Tokens bauen, an
 * `Chart` geben. Drei Dateien mit je zwanzig Zeilen Kopf wären hier nur mehr
 * Ablage.
 *
 * Alle drei nutzen **waagerechte** Balken, wo die Kategorie einen Namen hat
 * (Projekte, Zeitspannen): Namen brauchen Platz in der Breite, nicht schräg
 * gestellte Achsenbeschriftungen.
 */
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { Analytics } from "../../../shared/schema.ts";
import {
  barEmphasis,
  barFill,
  baseAxisStyle,
  baseLegend,
  baseTooltip,
  Chart,
  readChartTheme,
  shadowPointer,
  useThemeKey,
  withAlpha,
} from "./Chart.tsx";
import { colorValue } from "../colors.ts";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

/** Erstellt und erledigt je Wochentag — beantwortet „wann arbeite ich eigentlich“. */
export function WeekdayChart({ data }: { data: Analytics["weekday"] }) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const axis = baseAxisStyle(theme);
    return {
      grid: { left: 4, right: 12, top: 26, bottom: 0, containLabel: true },
      legend: { ...baseLegend(theme), top: 0, right: 0 },
      tooltip: { ...baseTooltip(theme), trigger: "axis", axisPointer: shadowPointer(theme) },
      xAxis: {
        type: "category",
        data: WEEKDAYS.map((day) => day.slice(0, 2)),
        ...axis,
        splitLine: { show: false },
        axisLabel: {
          ...axis.axisLabel,
          // Wochenende gedämpft: Dass dort weniger passiert, ist keine Lücke,
          // sondern die Antwort.
          formatter: (value: string, index: number) => index > 4 ? `{end|${value}}` : value,
          rich: { end: { color: theme.muted, opacity: 0.7 } },
        },
      },
      yAxis: { type: "value", minInterval: 1, ...axis },
      series: [
        {
          name: "Erstellt",
          type: "bar",
          data: data.map((entry) => entry.created),
          itemStyle: barFill(theme.brand),
          emphasis: barEmphasis(theme.brand),
          barMaxWidth: 22,
        },
        {
          name: "Erledigt",
          type: "bar",
          data: data.map((entry) => entry.done),
          itemStyle: barFill(theme.green),
          emphasis: barEmphasis(theme.green),
          barMaxWidth: 22,
        },
      ],
    };
  }, [data, themeKey]);

  return <Chart option={option} height={220} />;
}

/**
 * Verteilung der Durchlaufzeiten (Anlegen → Erledigen).
 *
 * Ein Histogramm und kein Mittelwert-Balken: Der Mittelwert einer Aufgabenliste
 * ist von den drei Aufgaben bestimmt, die ein halbes Jahr lagen. Die Verteilung
 * zeigt stattdessen, was der Normalfall ist — und wie lang der Rattenschwanz.
 */
export function LeadTimeChart({ leadTime }: { leadTime: Analytics["leadTime"] }) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const axis = baseAxisStyle(theme);
    // Von unten nach oben wachsende Zeitspannen: ECharts zeichnet die
    // Kategorieachse von unten, die Reihenfolge muss also gedreht werden.
    const buckets = [...leadTime.buckets].reverse();
    const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

    return {
      grid: { left: 4, right: 24, top: 8, bottom: 0, containLabel: true },
      tooltip: { ...baseTooltip(theme), trigger: "axis", axisPointer: shadowPointer(theme) },
      xAxis: { type: "value", minInterval: 1, ...axis },
      yAxis: {
        type: "category",
        data: buckets.map((bucket) => bucket.label),
        ...axis,
        splitLine: { show: false },
      },
      series: [{
        type: "bar",
        data: buckets.map((bucket) => ({
          value: bucket.count,
          // Je länger die Aufgabe lag, desto wärmer der Balken — die Farbe
          // trägt hier dieselbe Information wie die Achse, nur schneller.
          itemStyle: barFill(bucket.count === max && max > 1 ? theme.accent : theme.violet, "right"),
        })),
        emphasis: barEmphasis(theme.violet),
        barMaxWidth: 16,
        label: {
          show: true,
          position: "right",
          color: theme.muted,
          fontSize: 11,
          formatter: (params: { value?: unknown }) => Number(params.value) > 0 ? String(params.value) : "",
        },
      }],
    };
  }, [leadTime, themeKey]);

  return <Chart option={option} height={220} />;
}

/**
 * Projekte: erledigt im Zeitraum, offen heute — gestapelt je Projekt.
 *
 * Der Balken ist absichtlich nicht in Projektfarbe, sondern in den Farben der
 * beiden Zustände: Gefragt ist „wo liegt die Arbeit“, und dafür müssen die
 * Segmente über alle Zeilen hinweg vergleichbar sein. Die Projektfarbe steht
 * als Punkt vor dem Namen und im Kreisdiagramm daneben.
 */
export function ProjectChart({ projects }: { projects: Analytics["projects"] }) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const axis = baseAxisStyle(theme);
    // Nur Projekte mit Bewegung, größte unten (ECharts zeichnet von unten).
    const rows = projects
      .filter((entry) => entry.done + entry.open > 0)
      .sort((a, b) => (a.done + a.open) - (b.done + b.open))
      .slice(-10);

    return {
      grid: { left: 4, right: 12, top: 26, bottom: 0, containLabel: true },
      legend: { ...baseLegend(theme), top: 0, right: 0 },
      tooltip: { ...baseTooltip(theme), trigger: "axis", axisPointer: shadowPointer(theme) },
      xAxis: { type: "value", minInterval: 1, ...axis },
      yAxis: {
        type: "category",
        data: rows.map((entry) => entry.name),
        ...axis,
        splitLine: { show: false },
        axisLabel: { ...axis.axisLabel, width: 130, overflow: "truncate" },
      },
      series: [
        {
          name: "Erledigt",
          type: "bar",
          stack: "total",
          data: rows.map((entry) => entry.done),
          // Im Stapel rundet nur das **letzte** Segment außen; ein runder Kopf
          // mitten im Balken reißt eine Lücke zum nächsten Segment.
          itemStyle: { ...barFill(theme.green, "right"), borderRadius: [4, 0, 0, 4] },
          emphasis: barEmphasis(theme.green),
          barMaxWidth: 18,
        },
        {
          name: "Offen",
          type: "bar",
          stack: "total",
          data: rows.map((entry) => entry.open),
          itemStyle: barFill(theme.amber, "right"),
          emphasis: barEmphasis(theme.amber),
          barMaxWidth: 18,
        },
      ],
    };
  }, [projects, themeKey]);

  return <Chart option={option} height={260} />;
}

/** Wie sich der **offene** Bestand auf die Projekte verteilt — in Projektfarben. */
export function OpenShareChart({ projects }: { projects: Analytics["projects"] }) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const rows = projects.filter((entry) => entry.open > 0);

    return {
      tooltip: { ...baseTooltip(theme), trigger: "item" },
      series: [{
        type: "pie",
        // Ring statt Torte: Die Mitte trägt keine Information, und der Ring
        // lässt die Segmente auch bei kleinen Anteilen unterscheiden.
        radius: ["54%", "80%"],
        center: ["50%", "52%"],
        data: rows.map((entry) => ({
          name: entry.name,
          value: entry.open,
          itemStyle: { color: colorValue(entry.color) },
        })),
        // Runde Segmentecken und ein echter Spalt zwischen den Stücken: Der
        // Ring wird damit zur Reihe von Kacheln statt zum geteilten Kuchen.
        itemStyle: { borderColor: theme.panel, borderWidth: 2, borderRadius: 6 },
        padAngle: 1.5,
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 16, shadowColor: withAlpha(theme.text, 0.28) },
        },
        label: { color: theme.muted, fontSize: 11, formatter: "{b}\n{c}" },
        labelLine: { lineStyle: { color: theme.border }, smooth: true },
      }],
    };
  }, [projects, themeKey]);

  return <Chart option={option} height={260} />;
}

/**
 * Jahreskalender als Heatmap — ein Kästchen je Tag, wie die Beitragsfläche bei
 * GitHub.
 *
 * Warum diese Form neben den Balken der Zeitreihe: Balken zeigen die Höhe,
 * dieses Raster zeigt die **Gewohnheit**. Lücken, Wochenenden, Urlaube und
 * Schübe sieht man hier auf einen Blick und in einem Diagramm ohne Achsen.
 *
 * Die Farbstufen werden zur Laufzeit aus den Tokens gemischt (`mix`), nicht als
 * Palette hinterlegt: Die Fläche muss im Dark Mode aus dem Panel heraus
 * wachsen, sonst leuchten die leeren Tage heller als die vollen.
 */
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { CalendarDay } from "../../../shared/schema.ts";
import { baseTooltip, Chart, readChartTheme, useThemeKey, withAlpha } from "./Chart.tsx";
import { fmt } from "../format.ts";

export type HeatMetric = "done" | "created";

/**
 * ECharts indiziert `dayLabel.nameMap` **immer** mit Sonntag = 0, unabhängig von
 * `firstDay`. Die Liste beginnt deshalb bei Sonntag, angezeigt wird trotzdem ab
 * Montag.
 */
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

/** Lineare Blende zwischen zwei `#rrggbb`-Tokens. Kein Hex? Dann die Zielfarbe. */
function mix(from: string, to: string, share: number): string {
  const parse = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? parseInt(value.slice(1), 16) : null;
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return to;
  const channel = (shift: number) => {
    const left = (a >> shift) & 255;
    const right = (b >> shift) & 255;
    return Math.round(left + (right - left) * share);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/**
 * Vier Stufen über dem Maximum. Feste Grenzen (1, 3, 5, …) wären bei einem
 * Import mit 40 Aufgaben an einem Tag eine einfarbige Fläche; anteilige Grenzen
 * bleiben in beiden Größenordnungen lesbar.
 */
function pieces(max: number, empty: string, ramp: string[]) {
  if (max <= 1) return [{ value: 0, color: empty }, { min: 1, color: ramp[3] }];
  const steps = [1, 2, 3, 4].map((step) => Math.max(step, Math.ceil((max * step) / 4)));
  return [
    { value: 0, color: empty, label: "nichts" },
    { min: 1, max: steps[0], color: ramp[0] },
    { min: steps[0] + 1, max: steps[1], color: ramp[1] },
    { min: steps[1] + 1, max: steps[2], color: ramp[2] },
    { min: steps[2] + 1, color: ramp[3] },
  ];
}

export function CalendarHeatmap({ days, metric }: { days: CalendarDay[]; metric: HeatMetric }) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const base = metric === "done" ? theme.green : theme.brand;
    const ramp = [0.35, 0.6, 0.8, 1].map((share) => mix(theme.panel3, base, share));
    const max = days.reduce((top, day) => Math.max(top, day[metric]), 0);
    const byDate = new Map(days.map((day) => [day.date, day]));

    return {
      tooltip: {
        ...baseTooltip(theme),
        // ECharts typisiert `params` nicht brauchbar; gebraucht wird nur das
        // Datum, alles andere kommt aus den eigenen Daten.
        formatter: (params: unknown) => {
          const date = String((params as { data?: [string, number] }).data?.[0] ?? "");
          const day = byDate.get(date);
          if (!day) return "";
          return `<strong>${fmt.weekday(date)}, ${fmt.date(date)}</strong><br/>` +
            `${day.done} erledigt · ${day.created} erstellt`;
        },
      },
      visualMap: {
        type: "piecewise",
        show: false,
        pieces: pieces(max, theme.panel3, ramp),
        outOfRange: { color: theme.panel3 },
      },
      calendar: {
        // Oben Platz für die Monatsnamen, links für die Wochentage.
        top: 26,
        left: 34,
        right: 8,
        bottom: 4,
        cellSize: ["auto", 13],
        range: [days[0]?.date ?? "", days.at(-1)?.date ?? ""],
        // Ein Rahmen in Panelfarbe erzeugt die Lücke zwischen den Kästchen,
        // ohne dass ECharts dafür einen Abstand kennt.
        // `borderRadius` rundet die leeren Kästchen; die gefüllten bekommen
        // denselben Wert unten an der Serie — sonst runden nur die Tage ohne
        // Daten und das Gitter wirkt zerrissen. 4px entspricht `.heat-legend i`.
        itemStyle: { color: theme.panel3, borderColor: theme.panel, borderWidth: 2, borderRadius: 4 },
        // Die Monatsgrenze ist eine Orientierung, kein Tabellenrand: gepunktet
        // und in der Textfarbe mit 10 % statt als durchgezogener Strich.
        splitLine: { show: true, lineStyle: { color: withAlpha(theme.text, 0.1), width: 1, type: "dotted" } },
        yearLabel: { show: false },
        // Montag zuerst — deutscher Kalender, und die Wochenenden liegen dann
        // als Paar unten statt getrennt oben und unten.
        dayLabel: { firstDay: 1, nameMap: WEEKDAYS, color: theme.muted, fontSize: 10 },
        monthLabel: { nameMap: MONTHS, color: theme.muted, fontSize: 10 },
      },
      series: [{
        type: "heatmap",
        coordinateSystem: "calendar",
        itemStyle: { borderColor: theme.panel, borderWidth: 2, borderRadius: 4 },
        data: days.map((day) => [day.date, day[metric]]),
        emphasis: {
          itemStyle: {
            borderColor: theme.brand,
            borderWidth: 2,
            shadowBlur: 8,
            shadowColor: withAlpha(theme.brand, 0.5),
          },
        },
      }],
    };
    // `themeKey` ist der Auslöser, wenn nur das Theme gewechselt hat.
  }, [days, metric, themeKey]);

  return <Chart option={option} height={170} />;
}

/** Die Legende der Heatmap — bewusst als DOM und nicht als ECharts-`visualMap`. */
export function HeatLegend({ metric }: { metric: HeatMetric }) {
  const themeKey = useThemeKey();
  const swatches = useMemo(() => {
    const theme = readChartTheme();
    const base = metric === "done" ? theme.green : theme.brand;
    return [theme.panel3, ...[0.35, 0.6, 0.8, 1].map((share) => mix(theme.panel3, base, share))];
  }, [metric, themeKey]);

  return (
    <span className="heat-legend tiny muted">
      weniger
      {swatches.map((color, index) => <i key={index} style={{ background: color }} />)}
      mehr
    </span>
  );
}

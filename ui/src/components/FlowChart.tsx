/**
 * Zugang, Abgang, Bestand — das Hauptdiagramm der Auswertung.
 *
 * Zwei Balken (erstellt, erledigt) und **eine Linie** (offener Bestand am
 * Tagesende) auf einer zweiten Achse. Die Linie ist der eigentliche Inhalt:
 * Zwei ähnlich hohe Balkenreihen sagen nicht, ob der Berg wächst — die Kurve
 * darüber sagt es.
 *
 * Die Verdichtung auf Wochen oder Monate passiert hier und nicht auf dem
 * Server: Es sind dieselben Tagesdaten, und ein Umschalten ohne Serverrunde
 * fühlt sich wie ein Regler an statt wie eine neue Seite.
 */
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { DayPoint } from "../../../shared/schema.ts";
import { baseAxisStyle, baseTooltip, Chart, readChartTheme, useThemeKey } from "./Chart.tsx";
import { fmt } from "../format.ts";

export type Grain = "day" | "week" | "month";

export const GRAIN_LABEL: Record<Grain, string> = { day: "Tag", week: "Woche", month: "Monat" };

interface Bucket {
  /** Erster Tag des Eimers — Grundlage für Beschriftung und Tooltip. */
  date: string;
  label: string;
  created: number;
  done: number;
  /** Bestand am **Ende** des Eimers, nicht die Summe der Tage. */
  open: number;
}

/** Montag der Woche, in der `isoDate` liegt. */
function weekStart(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function bucketize(daily: DayPoint[], grain: Grain): Bucket[] {
  if (grain === "day") {
    return daily.map((point) => ({ ...point, label: fmt.date(point.date) }));
  }
  const buckets = new Map<string, Bucket>();
  for (const point of daily) {
    const key = grain === "week" ? weekStart(point.date) : `${point.date.slice(0, 7)}-01`;
    const bucket = buckets.get(key) ??
      { date: key, label: "", created: 0, done: 0, open: 0 };
    bucket.created += point.created;
    bucket.done += point.done;
    // Der Bestand wird nicht addiert, sondern überschrieben: Am Ende steht der
    // Wert des letzten Tages im Eimer, und das ist der Bestand des Zeitraums.
    bucket.open = point.open;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    label: grain === "week" ? `KW ${fmt.date(bucket.date)}` : fmt.month(bucket.date),
  }));
}

export function FlowChart({ daily, grain, height = 300 }: {
  daily: DayPoint[];
  grain: Grain;
  height?: number;
}) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const axis = baseAxisStyle(theme);
    const buckets = bucketize(daily, grain);
    // Bei mehr als ~60 Kategorien wird jede zweite Beschriftung zu viel; ECharts
    // rechnet das mit "auto" selbst aus, braucht dafür aber die Erlaubnis.
    const interval = buckets.length > 60 ? "auto" : 0;

    return {
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      legend: {
        // Mittig, nicht rechts: Rechts oben steht der Name der zweiten Achse
        // („Bestand“), und beides an derselben Stelle überlagert sich.
        top: 0,
        left: "center",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: theme.muted, fontSize: 11 },
        data: ["Erstellt", "Erledigt", "Offener Bestand"],
      },
      tooltip: {
        ...baseTooltip(theme),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const index = (params as { dataIndex?: number }[])[0]?.dataIndex ?? 0;
          const bucket = buckets[index];
          if (!bucket) return "";
          const head = grain === "day"
            ? `${fmt.weekday(bucket.date)}, ${fmt.date(bucket.date)}`
            : bucket.label;
          return `<strong>${head}</strong><br/>` +
            `${bucket.created} erstellt<br/>${bucket.done} erledigt<br/>` +
            `<span style="color:${theme.muted}">Bestand danach: ${bucket.open}</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: buckets.map((bucket) => bucket.label),
        ...axis,
        axisLabel: { ...axis.axisLabel, interval, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: "value",
          minInterval: 1,
          name: "Aufgaben",
          nameTextStyle: { color: theme.muted, fontSize: 10 },
          ...axis,
        },
        {
          type: "value",
          minInterval: 1,
          name: "Bestand",
          nameTextStyle: { color: theme.muted, fontSize: 10 },
          ...axis,
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Erstellt",
          type: "bar",
          data: buckets.map((bucket) => bucket.created),
          itemStyle: { color: theme.brand },
          barMaxWidth: 18,
        },
        {
          name: "Erledigt",
          type: "bar",
          data: buckets.map((bucket) => bucket.done),
          itemStyle: { color: theme.green },
          barMaxWidth: 18,
        },
        {
          name: "Offener Bestand",
          type: "line",
          yAxisIndex: 1,
          data: buckets.map((bucket) => bucket.open),
          smooth: true,
          showSymbol: false,
          lineStyle: { color: theme.accent, width: 2 },
          itemStyle: { color: theme.accent },
          // Eine dezente Fläche: Sie ordnet die Linie als „Menge“ ein, ohne mit
          // den Balken um Aufmerksamkeit zu streiten.
          areaStyle: { color: theme.accent, opacity: 0.08 },
        },
      ],
    };
  }, [daily, grain, themeKey]);

  return <Chart option={option} height={height} />;
}

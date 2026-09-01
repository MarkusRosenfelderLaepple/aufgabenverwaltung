/**
 * Erledigt je Tag, letzte drei Wochen.
 *
 * Ein Balkendiagramm und sonst nichts: Die Frage dahinter ist „läuft es?“, und
 * die beantwortet die Form der Reihe. Achsenbeschriftung nur an jedem zweiten
 * Tag, sonst überlappen die Datumsangaben in der schmalen Nebenspalte.
 *
 * Die Farben kommen zur Laufzeit aus den CSS-Tokens (`readChartTheme`), nicht
 * als Literale — sonst folgt das Diagramm dem Dark Mode nicht.
 */
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import {
  barEmphasis,
  barFill,
  baseAxisStyle,
  baseTooltip,
  Chart,
  readChartTheme,
  shadowPointer,
  useThemeKey,
} from "./Chart.tsx";
import { fmt } from "../format.ts";

export function HistoryChart({ history }: { history: { date: string; done: number }[] }) {
  const themeKey = useThemeKey();

  const option = useMemo<EChartsOption>(() => {
    const theme = readChartTheme();
    const axis = baseAxisStyle(theme);
    const last = history[history.length - 1]?.date;

    return {
      grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: {
        ...baseTooltip(theme),
        trigger: "axis",
        axisPointer: shadowPointer(theme),
        // ECharts typisiert `params` nicht brauchbar; gebraucht wird ohnehin nur
        // der Index, der Rest kommt aus den eigenen Daten.
        formatter: (params: unknown) => {
          const index = (params as { dataIndex?: number }[])[0]?.dataIndex ?? 0;
          const entry = history[index];
          if (!entry) return "";
          return `${fmt.weekday(entry.date)}, ${
            fmt.date(entry.date)
          }<br/><strong>${entry.done}</strong> erledigt`;
        },
      },
      xAxis: {
        type: "category",
        data: history.map((entry) => entry.date),
        ...axis,
        // Spread zuerst, dann die Overrides — sonst meldet TS `TS2783`.
        axisLabel: {
          ...axis.axisLabel,
          interval: 2,
          formatter: (value: string) => fmt.date(value).replace(".", ""),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        ...axis,
      },
      series: [{
        type: "bar",
        data: history.map((entry) => ({
          value: entry.done,
          // Der heutige Tag in Akzentfarbe: Er ist der einzige, der sich noch
          // ändern kann, und genau deshalb schaut man hin.
          itemStyle: barFill(entry.date === last ? theme.accent : theme.green),
        })),
        emphasis: barEmphasis(theme.green),
        barMaxWidth: 14,
      }],
    };
    // `themeKey` steht bewusst drin: Er ist der Auslöser, wenn sich nur das
    // Theme geändert hat und die Daten gleich geblieben sind.
  }, [history, themeKey]);

  return <Chart option={option} height={180} />;
}

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";

/** Dünner ECharts-Wrapper: Option rein, Resize und Dispose werden hier erledigt. */
export function Chart({ option, height = 240 }: { option: echarts.EChartsOption; height?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = echarts.init(hostRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(hostRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={hostRef} style={{ width: "100%", height }} />;
}

export interface ChartTheme {
  text: string;
  muted: string;
  border: string;
  brand: string;
  accent: string;
  green: string;
  amber: string;
  red: string;
  violet: string;
  panel: string;
  panel3: string;
}

/** Liest die aktuellen Design-Tokens aus dem DOM, damit Charts dem Theme folgen. */
export function readChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: token("--text", "#232b33"),
    muted: token("--muted", "#7b8794"),
    border: token("--border", "#e0e5ea"),
    brand: token("--brand", "#0052a3"),
    accent: token("--accent", "#f46610"),
    green: token("--green", "#10b981"),
    amber: token("--amber", "#f59e0b"),
    red: token("--red", "#ef4444"),
    violet: token("--violet", "#8b5cf6"),
    panel: token("--panel", "#ffffff"),
    panel3: token("--panel-3", "#e6ebf0"),
  };
}

export function baseAxisStyle(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: theme.border, type: "dashed" as const } },
  };
}

export function baseTooltip(theme: ChartTheme) {
  return {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    textStyle: { color: theme.text, fontSize: 12 },
    extraCssText: "border-radius:0;box-shadow:0 8px 24px -14px rgba(0,0,0,.4);",
  };
}

/**
 * Liefert einen Schlüssel, der sich bei jedem Theme-Wechsel ändert.
 * In `useMemo`-Abhängigkeiten der Chart-Option nutzen, damit Diagramme dem Theme folgen.
 */
export function useThemeKey(): string {
  const [key, setKey] = useState(() => document.documentElement.dataset.theme ?? "system");
  useEffect(() => {
    const observer = new MutationObserver(() => setKey(document.documentElement.dataset.theme ?? "system"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return key;
}

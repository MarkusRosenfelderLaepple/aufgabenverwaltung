import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";

/**
 * Dünner ECharts-Wrapper: Option rein, Resize und Dispose werden hier erledigt.
 *
 * Die Voreinstellungen unten (`DEFAULTS`) stehen **vor** dem Spread der Option:
 * Sie gelten damit für jedes Diagramm, lassen sich aber pro Diagramm
 * überschreiben. Ohne sie zeichnet ECharts in seiner eigenen Schrift und mit
 * seinem eigenen Einblendrhythmus — beides fällt neben der übrigen Oberfläche
 * sofort auf.
 */
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
    chartRef.current?.setOption({
      textStyle: { fontFamily: chartFont() },
      animationDuration: 620,
      animationEasing: "cubicOut",
      // Balken wachsen leicht versetzt aus der Achse heraus statt alle
      // gleichzeitig — das liest sich als Reihe und nicht als Sprung.
      animationDelay: (index: number) => index * 12,
      ...option,
    }, { notMerge: true });
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
  /** Glasfüllung und Tiefenstufe für den Tooltip — direkt aus den Tokens. */
  glass: string;
  elevation: string;
}

/**
 * Die Schrift der Diagramme ist die Schrift der Oberfläche.
 *
 * Sie wird vom `body` abgelesen statt hier wiederholt: Der Stapel steht in
 * `styles.css`, und zwei Quellen für dieselbe Entscheidung laufen auseinander.
 */
function chartFont(): string {
  return getComputedStyle(document.body).fontFamily ||
    "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";
}

/** Liest die aktuellen Design-Tokens aus dem DOM, damit Charts dem Theme folgen. */
export function readChartTheme(): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: token("--text", "#16202b"),
    muted: token("--muted", "#78859a"),
    border: token("--border", "rgba(16,32,64,0.09)"),
    brand: token("--brand", "#0b62d6"),
    accent: token("--accent", "#f4650f"),
    green: token("--green", "#0fb87c"),
    amber: token("--amber", "#f59e0b"),
    red: token("--red", "#ef4444"),
    violet: token("--violet", "#8b5cf6"),
    panel: token("--panel", "#ffffff"),
    panel3: token("--panel-3", "#e5eaf2"),
    glass: token("--glass-strong", "rgba(255,255,255,0.8)"),
    elevation: token("--e3", "0 18px 40px -14px rgba(16,32,64,0.22)"),
  };
}

/**
 * Farbe mit Deckkraft — nimmt `#rgb`, `#rrggbb` und `rgb()`/`rgba()`.
 *
 * Nötig, weil die Verläufe und Flächen unten aus **einer** Tokenfarbe mehrere
 * Stufen brauchen und `color-mix` auf der Canvas nicht zur Verfügung steht.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (short) {
    const [r, g, b] = short.slice(1).map((part) => parseInt(part + part, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (long) {
    const [r, g, b] = long.slice(1).map((part) => parseInt(part, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const parts = /rgba?\(([^)]+)\)/i.exec(hex);
  if (parts) {
    const [r, g, b] = parts[1].split(/[,/\s]+/).filter(Boolean);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

/** Eckenradius der Balken — außen rund, an der Achse eckig. */
export const BAR_RADIUS_UP = [5, 5, 0, 0];
export const BAR_RADIUS_RIGHT = [0, 5, 5, 0];

/**
 * Füllung eines Balkens: satter Verlauf in Wuchsrichtung plus runde Kappe.
 *
 * Eine einzelne Vollfarbe wirkt gedruckt; der Verlauf gibt dem Balken einen
 * Körper und lässt ihn aus der Glasfläche der Karte heraustreten, ohne dass
 * dafür ein Rahmen nötig wäre.
 */
export function barFill(color: string, direction: "up" | "right" = "up") {
  const stops = [
    { offset: 0, color: withAlpha(color, 1) },
    { offset: 1, color: withAlpha(color, 0.62) },
  ];
  const gradient = direction === "up"
    ? new echarts.graphic.LinearGradient(0, 0, 0, 1, stops)
    : new echarts.graphic.LinearGradient(1, 0, 0, 0, stops);
  return {
    color: gradient,
    borderRadius: direction === "up" ? BAR_RADIUS_UP : BAR_RADIUS_RIGHT,
  };
}

/** Flächenverlauf unter einer Linie: oben getönt, unten ausgelaufen. */
export function areaFill(color: string) {
  return {
    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: withAlpha(color, 0.28) },
      { offset: 1, color: withAlpha(color, 0) },
    ]),
  };
}

/** Ein Balken hebt sich beim Überfahren, statt bloß die Farbe zu wechseln. */
export function barEmphasis(color: string) {
  return {
    focus: "series" as const,
    itemStyle: { color: withAlpha(color, 1), shadowBlur: 12, shadowColor: withAlpha(color, 0.45) },
  };
}

export function baseAxisStyle(theme: ChartTheme) {
  return {
    // Keine Achsenlinien: Die Hilfslinien reichen als Bezug, und zwei
    // konkurrierende Linienstärken am Rand sind genau der Tabellenblick,
    // den die Diagramme hier nicht haben sollen.
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: theme.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: withAlpha(theme.text, 0.07) } },
  };
}

/** Getönter Streifen hinter der Kategorie unter dem Zeiger. */
export function shadowPointer(theme: ChartTheme) {
  return { type: "shadow" as const, shadowStyle: { color: withAlpha(theme.brand, 0.07) } };
}

/** Legende in der Typografie und den Punktformen der Oberfläche. */
export function baseLegend(theme: ChartTheme) {
  return {
    icon: "roundRect",
    itemWidth: 9,
    itemHeight: 9,
    itemGap: 14,
    textStyle: { color: theme.muted, fontSize: 11 },
    inactiveColor: withAlpha(theme.muted, 0.35),
  };
}

/**
 * Der Tooltip ist als HTML gebaut und bekommt deshalb dasselbe Milchglas wie
 * die Dialoge: `backgroundColor: "transparent"` schaltet die eigene Füllung von
 * ECharts ab, `extraCssText` wird nach den Inline-Styles gesetzt und gewinnt.
 */
export function baseTooltip(theme: ChartTheme) {
  return {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    textStyle: { color: theme.text, fontSize: 12 },
    extraCssText: "border-radius:12px;padding:9px 12px;line-height:1.5;" +
      `background:${theme.glass};` +
      "backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);" +
      `box-shadow:${theme.elevation}, inset 0 0 0 1px ${theme.border};`,
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

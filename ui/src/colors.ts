/**
 * Projektfarben: Tokenname → CSS-Variable.
 *
 * Gespeichert wird der **Name** (`"green"`), nicht der Wert (`"#10b981"`). Ein
 * Hex-Wert in der Datenbank bricht den Dark Mode für immer — die Farbe steht
 * dann fest, während das Theme wechselt. Über die Variable folgt jede Farbe dem
 * Theme, und ein späterer Palettenwechsel ist eine Änderung in `styles.css`.
 */
import type { ProjectColor } from "../../shared/schema.ts";

export const PROJECT_COLORS: { value: ProjectColor; label: string }[] = [
  { value: "brand", label: "Blau" },
  { value: "accent", label: "Orange" },
  { value: "green", label: "Grün" },
  { value: "amber", label: "Amber" },
  { value: "red", label: "Rot" },
  { value: "violet", label: "Violett" },
  { value: "teal", label: "Türkis" },
  { value: "pink", label: "Pink" },
  { value: "slate", label: "Grau" },
];

/** Für `style={{ color: colorVar(project.color) }}` und Ähnliches. */
export function colorVar(color: ProjectColor): string {
  return `var(--${color})`;
}

/**
 * Gedämpfte Variante für Flächen (Karten-Streifen, Badges). `color-mix` statt
 * einer zweiten Tokenreihe: WebKit und WebView2 können es, und es bleibt bei
 * *einer* Farbdefinition je Token.
 */
export function colorSoft(color: ProjectColor, percent = 14): string {
  return `color-mix(in srgb, var(--${color}) ${percent}%, transparent)`;
}

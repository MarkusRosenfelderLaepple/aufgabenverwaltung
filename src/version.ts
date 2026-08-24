/**
 * Version, Baudatum und Commit für den „Über“-Dialog und für Fehlermeldungen
 * aus dem Kollegenkreis. Im Entwicklungslauf steht hier „dev“; der Build kann
 * die Werte über Umgebungsvariablen setzen
 * (`AUFGABENVERWALTUNG_BUILD_DATE`, `AUFGABENVERWALTUNG_COMMIT`).
 */
export const VERSION = "0.1.0";
export const BUILD_DATE = Deno.env.get("AUFGABENVERWALTUNG_BUILD_DATE") ?? "dev";
export const COMMIT = Deno.env.get("AUFGABENVERWALTUNG_COMMIT") ?? "dev";

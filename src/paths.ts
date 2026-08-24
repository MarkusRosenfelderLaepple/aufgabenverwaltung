/**
 * Alle plattformabhängigen Pfade an einer Stelle — nirgends sonst darf der
 * Anwendungsname hartcodiert stehen.
 */
import { join } from "@std/path";

export const APP_NAME = "Aufgabenverwaltung";
/** Umgebungsvariable, mit der Tests und der Entwicklungslauf die DB umbiegen. */
export const DB_ENV = "AUFGABENVERWALTUNG_DB";
/**
 * Dasselbe für den Datenordner. Ohne diesen Ausweg schreiben die Tests der
 * Anhänge in das echte Verzeichnis des Anwenders — eine Testsuite, die
 * Nutzerdaten anfasst, ist ein Fehler, den man erst bemerkt, wenn es zu spät
 * ist.
 */
export const DATA_ENV = "AUFGABENVERWALTUNG_DATA";

function home(): string {
  return Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
}

/** Nutzerdaten: SQLite-Datei, Lockdatei, Sicherungen. */
export function dataDir(): string {
  const override = Deno.env.get(DATA_ENV);
  if (override) return override;
  if (Deno.build.os === "windows") return join(Deno.env.get("APPDATA") ?? ".", APP_NAME);
  if (Deno.build.os === "darwin") return join(home(), "Library", "Application Support", APP_NAME);
  const base = Deno.env.get("XDG_DATA_HOME") ?? join(home(), ".local", "share");
  return join(base, APP_NAME);
}

/** Protokolldateien — auf macOS bewusst nicht im Datenordner (`~/Library/Logs`). */
export function logDir(): string {
  if (Deno.build.os === "windows") return join(Deno.env.get("LOCALAPPDATA") ?? ".", APP_NAME, "logs");
  if (Deno.build.os === "darwin") return join(home(), "Library", "Logs", APP_NAME);
  const base = Deno.env.get("XDG_STATE_HOME") ?? join(home(), ".local", "state");
  return join(base, APP_NAME, "logs");
}

export function databasePath(): string {
  return Deno.env.get(DB_ENV) ?? join(dataDir(), "data.db");
}

export function logPath(): string {
  return join(logDir(), "app.log");
}

/**
 * Bildanhänge liegen als Dateien neben der Datenbank, nicht als BLOB darin:
 * Ein Screenshot mit 2 MB in einer Zeile bläht jede Abfrage und jede Sicherung
 * auf, und ein Bild an das Webview zu liefern ist über eine Datei ein
 * Einzeiler (`serveFile`). Die Datenbank führt nur Buch.
 */
export function attachmentDir(): string {
  return join(dataDir(), "attachments");
}

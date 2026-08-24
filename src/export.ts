/**
 * Export der Aufgabenliste nach CSV.
 *
 * **Streamend** geschrieben, obwohl eine persönliche Aufgabenliste klein ist:
 * Der Code ist derselbe, und der Speicherverbrauch bleibt konstant. Wer später
 * eine Jahresauswertung mit 50 000 Zeilen zieht, muss hier nichts anfassen.
 */
import { stringify as csvStringify } from "@std/csv/stringify";
import { dirname } from "@std/path";
import type { ExportResult, Project, Task } from "../shared/schema.ts";
import { uniquePath } from "./files.ts";
import { log } from "./log.ts";

/** Spaltendefinition an genau einer Stelle. */
const COLUMNS = [
  "Nr.",
  "Titel",
  "Status",
  "Priorität",
  "Fällig",
  "Projekt",
  "Unterpunkte",
  "Angelegt",
  "Erledigt am",
  "Notizen",
] as const;

const STATUS_LABEL: Record<Task["status"], string> = {
  backlog: "Backlog",
  todo: "Geplant",
  doing: "In Arbeit",
  done: "Erledigt",
};

const PRIORITY_LABEL = ["–", "niedrig", "mittel", "hoch"] as const;

/**
 * Deutsches Datum für die Datei (`24.08.2026`). `Intl` statt einer
 * Datumsbibliothek — für ein festes Format braucht es keine. Die Instanz wird
 * einmal angelegt, weil `Intl`-Konstruktoren teuer sind.
 */
const germanDateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function germanDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : germanDateFormat.format(date);
}

/**
 * CSV für deutsche Empfänger: **Semikolon** als Trennzeichen und **UTF-8 mit
 * BOM**. Ohne BOM zeigt Excel unter Windows „GrÃ¶ÃŸe“ — die Datei ist korrekt,
 * gilt beim Anwender aber als kaputt.
 */
export async function exportCsv(
  tasks: Iterable<Task>,
  projects: Project[],
  target: string,
): Promise<ExportResult> {
  const path = uniquePath(target);
  await Deno.mkdir(dirname(path), { recursive: true });
  const file = await Deno.create(path);
  const encoder = new TextEncoder();
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  let rows = 0;
  let bytes = 0;

  const write = async (text: string) => {
    const chunk = encoder.encode(text);
    bytes += chunk.byteLength;
    await file.write(chunk);
  };

  try {
    await write("﻿"); // BOM
    await write(csvStringify([[...COLUMNS]], { separator: ";" }));
    for (const task of tasks) {
      rows++;
      await write(csvStringify([[
        String(task.id),
        task.title,
        STATUS_LABEL[task.status],
        PRIORITY_LABEL[task.priority] ?? "",
        germanDate(task.due),
        task.projectId === null ? "" : projectName.get(task.projectId) ?? "",
        task.subtaskTotal === 0 ? "" : `${task.subtaskDone}/${task.subtaskTotal}`,
        germanDate(task.createdAt),
        germanDate(task.doneAt),
        // Zeilenumbrüche in Notizen würden die CSV-Zeile sprengen; `stringify`
        // setzt Anführungszeichen, Excel liest sie — aber viele einfachere
        // Werkzeuge nicht. Deshalb hier zu Leerzeichen.
        task.notes.replace(/\s*\n\s*/g, " · "),
      ]], { separator: ";", headers: false }));
    }
  } finally {
    file.close();
  }

  log.info(`CSV-Export: ${rows} Zeilen, ${bytes} Bytes → ${path}`);
  return { path, rows, bytes };
}

/** `Aufgaben-2026-08-24.csv` — sortierbarer Name, keine Sonderzeichen. */
export function exportFileName(appName: string): string {
  return `${appName}-${new Date().toISOString().slice(0, 10)}.csv`;
}

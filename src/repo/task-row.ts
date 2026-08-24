/**
 * Die eine Zeilenform einer Aufgabe: das SELECT und die eine `parse()`-Stelle.
 *
 * Warum eigene Datei: `tasks.ts` (Liste, Board) und `agenda.ts` (Tagesansicht,
 * Auswertung) lesen dieselben Spalten. Zwei Kopien des Mappings sind zwei
 * Stellen, an denen eine neue Spalte fehlen kann — und der Fehler zeigt sich
 * dann nur in einer der beiden Ansichten.
 */
import { Task } from "../../shared/schema.ts";

export type Row = Record<string, unknown>;

/**
 * Die drei Zähler kommen als Unterabfragen mit. Der Grund steht im UI: „3/5 ·
 * 2 Bilder" steht an jeder Karte, und drei Abfragen pro Zeile sind bei 50
 * Zeilen 150 Abfragen für Zahlen, die SQLite hier nebenbei mitliefert.
 */
export const TASK_SELECT = `
  SELECT t.id, t.title, t.notes, t.status, t.priority, t.due, t.projectId, t.position,
         t.createdAt, t.updatedAt, t.startedAt, t.doneAt,
         (SELECT COUNT(*) FROM subtasks s WHERE s.taskId = t.id)                AS subtaskTotal,
         (SELECT COUNT(*) FROM subtasks s WHERE s.taskId = t.id AND s.done = 1) AS subtaskDone,
         (SELECT COUNT(*) FROM attachments a WHERE a.taskId = t.id)             AS attachmentCount
  FROM tasks t`;

export function toTask(row: Row): Task {
  return Task.parse({
    id: Number(row.id),
    title: String(row.title ?? ""),
    notes: String(row.notes ?? ""),
    status: String(row.status ?? "todo"),
    priority: Number(row.priority ?? 0),
    due: row.due == null ? null : String(row.due),
    projectId: row.projectId == null ? null : Number(row.projectId),
    position: Number(row.position ?? 0),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    startedAt: row.startedAt == null ? null : String(row.startedAt),
    doneAt: row.doneAt == null ? null : String(row.doneAt),
    subtaskTotal: Number(row.subtaskTotal ?? 0),
    subtaskDone: Number(row.subtaskDone ?? 0),
    attachmentCount: Number(row.attachmentCount ?? 0),
  });
}

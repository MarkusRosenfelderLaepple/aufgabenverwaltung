/**
 * Tagesansicht und Auswertung.
 *
 * **Das Datum kommt vom Client**, nicht aus `new Date()` auf dem Server. Bei
 * einer lokalen App ist das derselbe Rechner — aber es ist auch die Stelle, an
 * der „heute“ um 00:30 in Kiew und in Berlin verschiedene Tage sind. Ein
 * Parameter kostet nichts und macht die Funktionen testbar, ohne die Systemuhr
 * zu verstellen.
 */
import type { Stats, Task, Today } from "../../shared/schema.ts";
import { getDb } from "../db.ts";
import { type Row, TASK_SELECT as SELECT, toTask } from "./task-row.ts";

function query(sql: string, ...args: (string | number)[]): Task[] {
  return (getDb().prepare(`${SELECT} ${sql}`).all(...args) as Row[]).map(toTask);
}

/** `2026-08-24` + 3 → `2026-08-27`. Über UTC, damit keine Sommerzeit dazwischenkommt. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Fünf Listen in einer Antwort. Einzelne Endpunkte wären fünf Ladezustände,
 * die nacheinander einspringen — die Seite würde beim Öffnen viermal umbauen.
 *
 * Die Sortierung ist überall dieselbe Absicht: Wichtiges oben, dann der Termin,
 * dann die Handreihenfolge.
 */
export function today(date: string): Today {
  const ORDER = "ORDER BY t.priority DESC, t.due IS NULL, t.due, t.position, t.id";
  return {
    date,
    // „In Arbeit“ ignoriert den Termin bewusst: Was angefangen ist, gehört
    // nach oben, auch wenn es erst nächste Woche fällig wäre.
    doing: query(`WHERE t.status = 'doing' ${ORDER}`),
    overdue: query(
      `WHERE t.status IN ('todo', 'backlog') AND t.due IS NOT NULL AND t.due < ? ${ORDER}`,
      date,
    ),
    today: query(`WHERE t.status = 'todo' AND t.due = ? ${ORDER}`, date),
    soon: query(
      `WHERE t.status = 'todo' AND t.due > ? AND t.due <= ? ${ORDER}`,
      date,
      addDays(date, 7),
    ),
    // Nach Abschlusszeit absteigend: Das zuletzt Erledigte steht oben, das
    // fühlt sich beim Abarbeiten richtig an.
    doneToday: query("WHERE t.status = 'done' AND substr(t.doneAt, 1, 10) = ? ORDER BY t.doneAt DESC", date),
  };
}

/** Anzahl erledigter Aufgaben je Tag, aufsteigend — inklusive Nulltage. */
function history(date: string, days: number): { date: string; done: number }[] {
  const from = addDays(date, -(days - 1));
  const rows = getDb().prepare(
    `SELECT substr(doneAt, 1, 10) AS day, COUNT(*) AS done
     FROM tasks
     WHERE status = 'done' AND doneAt IS NOT NULL AND substr(doneAt, 1, 10) BETWEEN ? AND ?
     GROUP BY day`,
  ).all(from, date) as Row[];
  const counts = new Map(rows.map((row) => [String(row.day), Number(row.done)]));
  // Die Lücken müssen aufgefüllt werden: Ein Balkendiagramm ohne Nulltage
  // verschiebt die Tage gegeneinander und zeigt eine Woche, die es nicht gab.
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(from, index);
    return { date: day, done: counts.get(day) ?? 0 };
  });
}

const HISTORY_DAYS = 21;

export function stats(date: string): Stats {
  const db = getDb();
  const counts = db.prepare(
    `SELECT
       SUM(status <> 'done')                                        AS open,
       SUM(status = 'doing')                                        AS doing,
       SUM(status = 'backlog')                                      AS backlog,
       SUM(status IN ('todo','backlog') AND due IS NOT NULL AND due < ?) AS overdue,
       SUM(status <> 'done' AND due = ?)                            AS dueToday,
       SUM(status = 'done' AND substr(doneAt, 1, 10) = ?)           AS doneToday,
       SUM(status = 'done' AND substr(doneAt, 1, 10) >= ?)          AS doneThisWeek
     FROM tasks`,
  ).get(date, date, date, addDays(date, -6)) as Row;

  const days = history(date, HISTORY_DAYS);

  return {
    open: Number(counts.open ?? 0),
    doing: Number(counts.doing ?? 0),
    backlog: Number(counts.backlog ?? 0),
    overdue: Number(counts.overdue ?? 0),
    dueToday: Number(counts.dueToday ?? 0),
    doneToday: Number(counts.doneToday ?? 0),
    doneThisWeek: Number(counts.doneThisWeek ?? 0),
    streak: streak(days),
    history: days,
  };
}

/**
 * Aufeinanderfolgende Tage mit mindestens einer erledigten Aufgabe, vom
 * jüngsten Tag zurück.
 *
 * Der heutige Tag wird übersprungen, solange er leer ist: Um neun Uhr morgens
 * hat man noch nichts erledigt, und eine Serie, die dadurch jeden Morgen auf
 * null fällt, ist keine Serie, sondern eine Nachricht mit dem falschen Inhalt.
 */
function streak(days: { date: string; done: number }[]): number {
  let count = 0;
  for (let index = days.length - 1; index >= 0; index--) {
    if (days[index].done > 0) count++;
    else if (index !== days.length - 1) break;
  }
  return count;
}

/**
 * Auswertung über die ganze Historie: erstellt, erledigt, Bestand, Durchlaufzeit.
 *
 * Zwei Entscheidungen, die den Rest erklären:
 *
 * 1. **Aggregiert wird in SQL, aufgefüllt wird in TypeScript.** Ein `GROUP BY`
 *    liefert nur Tage, an denen etwas passiert ist. Eine Zeitreihe mit Lücken
 *    verschiebt aber die Tage gegeneinander und zeigt eine Woche, die es nie
 *    gab — deshalb geht jede Reihe hier durch `fill()`.
 * 2. **Der offene Bestand wird fortgeschrieben, nicht je Tag gezählt.** „Wie
 *    viele Aufgaben waren am 3. Mai offen“ als eigene Abfrage wäre ein
 *    Korrelat pro Tag; als Startwert plus laufende Summe ist es eine Abfrage.
 *    Das setzt voraus, dass eine Aufgabe genau einen Zugang (`createdAt`) und
 *    höchstens einen Abgang (`doneAt`) hat — genau das garantiert `repo/tasks`.
 *
 * Wie überall in diesem Projekt kommt „heute“ als Parameter vom Client und
 * nicht aus `new Date()`, damit die Funktionen ohne Verstellen der Systemuhr
 * testbar sind.
 */
import type { Analytics, CalendarDay, DayPoint } from "../../shared/schema.ts";
import { LEAD_BUCKETS, type ProjectColor } from "../../shared/schema.ts";
import { getDb } from "../db.ts";
import type { Row } from "./task-row.ts";
import { addDays } from "./agenda.ts";

/** Tage der Heatmap — 53 Wochen, damit ein ganzes Jahr lückenlos ins Raster passt. */
const CALENDAR_DAYS = 371;

type Pair = { created: number; done: number };

function pairs(rows: Row[], key = "day"): Map<string, Pair> {
  const map = new Map<string, Pair>();
  for (const row of rows) {
    map.set(String(row[key]), {
      created: Number(row.created ?? 0),
      done: Number(row.done ?? 0),
    });
  }
  return map;
}

/**
 * Erstellt und erledigt je Tag in einem Zeitraum — als **eine** Abfrage.
 *
 * Die Vereinigung ist nötig, weil ein Tag in der einen Spalte vorkommen kann
 * und in der anderen nicht; ein `JOIN` über zwei Gruppierungen würde genau
 * diese Tage verlieren.
 */
function daysBetween(from: string, to: string): Map<string, Pair> {
  const rows = getDb().prepare(
    `SELECT day, SUM(created) AS created, SUM(done) AS done FROM (
       SELECT substr(createdAt, 1, 10) AS day, 1 AS created, 0 AS done FROM tasks
       UNION ALL
       SELECT substr(doneAt, 1, 10) AS day, 0 AS created, 1 AS done
       FROM tasks WHERE status = 'done' AND doneAt IS NOT NULL
     )
     WHERE day BETWEEN ? AND ?
     GROUP BY day`,
  ).all(from, to) as Row[];
  return pairs(rows);
}

function fill<T>(from: string, days: number, make: (day: string) => T): T[] {
  return Array.from({ length: days }, (_, index) => make(addDays(from, index)));
}

/** Quantil aus einer **sortierten** Liste, linear interpoliert. */
function quantile(sorted: number[], share: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * share;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const value = low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  return Math.round(value * 10) / 10;
}

function leadTime(from: string, to: string) {
  const rows = getDb().prepare(
    `SELECT julianday(doneAt) - julianday(createdAt) AS span
     FROM tasks
     WHERE status = 'done' AND doneAt IS NOT NULL
       AND substr(doneAt, 1, 10) BETWEEN ? AND ?`,
  ).all(from, to) as Row[];

  // Negative Werte sind keine Datenpanne, sondern ein per Hand gesetzter
  // Zeitstempel oder ein Import — auf 0 klemmen ist ehrlicher als wegwerfen.
  const spans = rows.map((row) => Math.max(0, Number(row.span ?? 0))).sort((a, b) => a - b);
  const counts = LEAD_BUCKETS.map((bucket) => ({ label: bucket.label, count: 0 }));
  for (const span of spans) {
    const index = LEAD_BUCKETS.findIndex((bucket) => span < bucket.max);
    counts[index === -1 ? counts.length - 1 : index].count++;
  }

  const sum = spans.reduce((total, span) => total + span, 0);
  return {
    count: spans.length,
    median: quantile(spans, 0.5),
    average: spans.length === 0 ? 0 : Math.round((sum / spans.length) * 10) / 10,
    p90: quantile(spans, 0.9),
    buckets: counts,
  };
}

function projectRows(from: string, to: string) {
  const rows = getDb().prepare(
    `SELECT
       p.id                                                              AS id,
       COALESCE(p.name, 'Eingang')                                       AS name,
       COALESCE(p.color, 'slate')                                        AS color,
       SUM(substr(t.createdAt, 1, 10) BETWEEN ? AND ?)                   AS created,
       SUM(t.status = 'done' AND substr(t.doneAt, 1, 10) BETWEEN ? AND ?) AS done,
       SUM(t.status <> 'done')                                           AS open
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.projectId
     GROUP BY p.id
     ORDER BY done DESC, open DESC, name`,
  ).all(from, to, from, to) as Row[];

  return rows.map((row) => ({
    projectId: row.id === null ? null : Number(row.id),
    name: String(row.name),
    color: String(row.color) as ProjectColor,
    created: Number(row.created ?? 0),
    done: Number(row.done ?? 0),
    open: Number(row.open ?? 0),
  }));
}

export function analytics(date: string, days: number): Analytics {
  const db = getDb();
  const from = addDays(date, -(days - 1));

  const totals = db.prepare(
    `SELECT
       COUNT(*)                                                     AS createdAll,
       SUM(status = 'done')                                         AS doneAll,
       SUM(status <> 'done')                                        AS open,
       MIN(substr(createdAt, 1, 10))                                AS firstEver,
       SUM(substr(createdAt, 1, 10) BETWEEN ? AND ?)                AS created,
       SUM(status = 'done' AND substr(doneAt, 1, 10) BETWEEN ? AND ?) AS done,
       /* Bestand am Tag vor dem Zeitraum: alles Angelegte minus alles Erledigte. */
       SUM(substr(createdAt, 1, 10) < ?)                            AS createdBefore,
       SUM(status = 'done' AND substr(doneAt, 1, 10) < ?)           AS doneBefore
     FROM tasks`,
  ).get(from, date, from, date, from, from) as Row;

  const openStart = Math.max(
    0,
    Number(totals.createdBefore ?? 0) - Number(totals.doneBefore ?? 0),
  );

  // ── Zeitreihe des Zeitraums ───────────────────────────────────────────────
  const window = daysBetween(from, date);
  let open = openStart;
  const daily: DayPoint[] = fill(from, days, (day) => {
    const entry = window.get(day) ?? { created: 0, done: 0 };
    open = Math.max(0, open + entry.created - entry.done);
    return { date: day, created: entry.created, done: entry.done, open };
  });

  // ── Heatmap ───────────────────────────────────────────────────────────────
  // Bewusst unabhängig vom gewählten Zeitraum: Die Kalenderfläche ist immer ein
  // Jahr, sonst wandert bei „30 Tage“ ein Kalenderblatt mit drei Spalten ins Bild.
  const calFrom = addDays(date, -(CALENDAR_DAYS - 1));
  const calendarDays = daysBetween(calFrom, date);
  const calendar: CalendarDay[] = fill(calFrom, CALENDAR_DAYS, (day) => {
    const entry = calendarDays.get(day) ?? { created: 0, done: 0 };
    return { date: day, created: entry.created, done: entry.done };
  });

  // ── Monate ────────────────────────────────────────────────────────────────
  // Aus der Tagesreihe des Zeitraums aufsummiert statt neu abgefragt: dieselbe
  // Grundmenge, garantiert dieselben Summen wie die Balken darüber.
  const months = new Map<string, Pair>();
  for (const point of daily) {
    const key = point.date.slice(0, 7);
    const entry = months.get(key) ?? { created: 0, done: 0 };
    months.set(key, { created: entry.created + point.created, done: entry.done + point.done });
  }

  // ── Wochentage ────────────────────────────────────────────────────────────
  // `getUTCDay()` liefert Sonntag = 0; hier wird auf Montag = 0 gedreht, weil
  // die Ansicht einen deutschen Kalender zeigt.
  const weekday = Array.from({ length: 7 }, (_, index) => ({ weekday: index, created: 0, done: 0 }));
  for (const point of daily) {
    const index = (new Date(`${point.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    weekday[index].created += point.created;
    weekday[index].done += point.done;
  }

  const best = daily.reduce<DayPoint | null>(
    (top, point) => (point.done > 0 && (top === null || point.done > top.done) ? point : top),
    null,
  );

  return {
    from,
    to: date,
    days,
    firstEver: totals.firstEver === null ? null : String(totals.firstEver),
    totals: {
      created: Number(totals.created ?? 0),
      done: Number(totals.done ?? 0),
      open: Number(totals.open ?? 0),
      openStart,
      createdAll: Number(totals.createdAll ?? 0),
      doneAll: Number(totals.doneAll ?? 0),
      activeDays: daily.filter((point) => point.done > 0).length,
      bestDay: best === null ? null : { date: best.date, done: best.done },
    },
    daily,
    calendar,
    monthly: [...months].map(([month, entry]) => ({ month, ...entry })),
    weekday,
    leadTime: leadTime(from, date),
    projects: projectRows(from, date),
  };
}

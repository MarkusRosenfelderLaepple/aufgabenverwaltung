/**
 * Aufgaben. Genau **eine** Stelle macht aus `unknown` einen Typ:
 * `Task.parse(...)` in `toTask()`. Kein `as Row[]` irgendwo sonst.
 *
 * Alles, was die sichtbare Menge bestimmt — Filter, Suche, Sortierung,
 * Blättern —, passiert hier in SQL und nicht in der Oberfläche. Nur so meint
 * „exportiert wird, was man sieht“ wirklich alle Treffer und nicht die gerade
 * geladene Seite.
 */
import {
  type NewTask,
  type Task,
  TaskDetail,
  type TaskMove,
  type TaskPage,
  type TaskPatch,
  type TaskQuery,
  type TaskSort,
  type TaskStatus,
} from "../../shared/schema.ts";
import { getDb, tx } from "../db.ts";
import { notFound } from "../../shared/errors.ts";
import * as subtasks from "./subtasks.ts";
import * as attachments from "./attachments.ts";
import { type Row, TASK_SELECT as SELECT, toTask } from "./task-row.ts";

/**
 * Sortierspalten → SQL. Der Umweg über diese Tabelle ist keine Zierde: Er ist
 * die Stelle, an der aus einem Suchparameter niemals SQL wird. Nur Werte aus
 * `TaskSort` haben hier einen Eintrag, alles andere fällt schon in Zod aus.
 *
 * `manual` sortiert nach Board-Position; die übrigen setzen einen zweiten
 * Schlüssel dahinter, damit gleiche Werte eine stabile Reihenfolge haben.
 */
const ORDER: Record<TaskSort, string> = {
  manual: "t.position",
  // Aufgaben ohne Termin gehören ans Ende, nicht an den Anfang: In SQLite ist
  // NULL kleiner als jeder Wert, ohne das erste Kriterium stünde das ganze
  // Backlog vor der Aufgabe, die heute fällig ist.
  due: "t.due IS NULL, t.due",
  priority: "t.priority DESC, t.due IS NULL, t.due",
  title: "t.title COLLATE NOCASE",
  created: "t.createdAt",
  updated: "t.updatedAt",
};

/** `%`, `_` und `\` sind in LIKE Platzhalter — ohne das sucht `%` alles. */
function escapeLike(text: string): string {
  return text.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * Ein WHERE für alle Verwendungen: Seite, Gesamtzahl, Export. Getrennte
 * Bedingungen wären der sichere Weg zu einer Fußzeile, die etwas anderes
 * zählt als die Liste zeigt.
 */
function where(query: TaskQuery): { sql: string; args: (string | number)[] } {
  const parts: string[] = [];
  const args: (string | number)[] = [];

  // `"open"` ist der Sammelfilter „alles außer erledigt“ und deshalb ein
  // eigener Zweig: Er fragt nicht nach einem Zustand, sondern nach dessen
  // Gegenteil.
  if (query.status === "open") {
    parts.push("t.status <> 'done'");
  } else if (query.status !== "") {
    parts.push("t.status = ?");
    args.push(query.status);
  }
  if (query.search.trim()) {
    // Die Suche greift auch in die Unterpunkte: „Rechnung“ findet die Aufgabe
    // „Monatsabschluss“, wenn dort ein Unterpunkt „Rechnung prüfen“ hängt.
    parts.push(
      `(t.title LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM subtasks s WHERE s.taskId = t.id AND s.title LIKE ? ESCAPE '\\'))`,
    );
    const pattern = `%${escapeLike(query.search.trim())}%`;
    args.push(pattern, pattern, pattern);
  }
  if (query.projectId !== "") {
    // 0 ist die Verabredung für „ohne Projekt“ — als Suchparameter braucht der
    // Eingang einen Wert, den man in eine URL schreiben kann.
    if (query.projectId === 0) parts.push("t.projectId IS NULL");
    else {
      parts.push("t.projectId = ?");
      args.push(query.projectId);
    }
  }
  if (query.minPriority !== "") {
    parts.push("t.priority >= ?");
    args.push(query.minPriority);
  }
  if (query.noDue) parts.push("t.due IS NULL");
  if (query.dueFrom !== "") {
    parts.push("t.due IS NOT NULL AND t.due >= ?");
    args.push(query.dueFrom);
  }
  if (query.dueTo !== "") {
    parts.push("t.due IS NOT NULL AND t.due <= ?");
    args.push(query.dueTo);
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", args };
}

/**
 * `id` als letztes Sortierkriterium ist beim Blättern Pflicht: Ohne eindeutige
 * Reihenfolge darf SQLite gleiche Werte zwischen zwei Abfragen anders anordnen
 * — dann fehlt beim Weiterblättern eine Zeile und eine andere kommt doppelt.
 */
function orderBy(query: TaskQuery): string {
  const direction = query.dir === "asc" ? "ASC" : "DESC";
  return ` ORDER BY ${ORDER[query.sort]} ${direction}, t.id ${direction}`;
}

/** Alle Treffer ohne Seitengrenze — für den Export („was man sieht“). */
export function all(query: TaskQuery): Task[] {
  const { sql, args } = where(query);
  return (getDb().prepare(SELECT + sql + orderBy(query)).all(...args) as Row[]).map(toTask);
}

/**
 * Eine Seite plus die Gesamtzahl über **alle** Treffer.
 *
 * Zwei Abfragen, nicht eine: `COUNT(*) OVER ()` im selben SELECT würde die
 * Gesamtzahl mitliefern, aber nur wenn die Seite überhaupt Zeilen hat — nach
 * einem zu engen Filter stünde dann „0 von 0“ statt „0 von 1.234“.
 */
export function page(query: TaskQuery): TaskPage {
  const { sql, args } = where(query);
  const total = Number(
    (getDb().prepare(`SELECT COUNT(*) AS total FROM tasks t${sql}`).get(...args) as Row).total ?? 0,
  );
  const pages = Math.ceil(total / query.pageSize);
  // Hinter der letzten Seite landet man leicht: Filter enger stellen, während
  // Seite 7 offen ist. Statt einer leeren Liste die letzte echte Seite.
  const current = Math.min(query.page, Math.max(pages, 1));
  const rows = getDb()
    .prepare(`${SELECT}${sql}${orderBy(query)} LIMIT ? OFFSET ?`)
    .all(...args, query.pageSize, (current - 1) * query.pageSize) as Row[];
  return { rows: rows.map(toTask), total, page: current, pageSize: query.pageSize, pages };
}

export function get(id: number): Task {
  const row = getDb().prepare(`${SELECT} WHERE t.id = ?`).get(id) as Row | undefined;
  if (!row) throw notFound(`Aufgabe ${id}`);
  return toTask(row);
}

/** Aufgabe mit Unterpunkten und Anhängen — die Detailansicht in einem Zug. */
export function detail(id: number): TaskDetail {
  return TaskDetail.parse({
    ...get(id),
    subtasks: subtasks.forTask(id),
    attachments: attachments.forTask(id),
  });
}

const now = () => new Date().toISOString();

/**
 * Neue Aufgaben kommen **oben** in ihre Spalte. Der Grund ist banal und
 * wichtig: Was man gerade eingetippt hat, will man sehen, ohne zu scrollen.
 * Deshalb negative Positionen statt `MAX(position) + 1`.
 */
function topPosition(status: TaskStatus): number {
  const row = getDb()
    .prepare("SELECT COALESCE(MIN(position), 0) - 1 AS next FROM tasks WHERE status = ?")
    .get(status) as Row;
  return Number(row.next ?? 0);
}

export function create(input: NewTask): Task {
  return tx(() => {
    const stamp = now();
    const info = getDb().prepare(
      `INSERT INTO tasks(title, notes, status, priority, due, projectId, position,
                         createdAt, updatedAt, startedAt, doneAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.title.trim(),
      input.notes,
      input.status,
      input.priority,
      input.due,
      input.projectId,
      topPosition(input.status),
      stamp,
      stamp,
      input.status === "doing" ? stamp : null,
      input.status === "done" ? stamp : null,
    );
    const id = Number(info.lastInsertRowid);
    input.subtasks.forEach((title) => subtasks.create(id, { title }));
    return get(id);
  });
}

/**
 * Ein Statuswechsel ist mehr als eine Spalte: `doing` merkt sich den Beginn,
 * `done` den Abschluss, und der Weg zurück löscht ihn wieder — sonst zählt die
 * Tagesauswertung eine Aufgabe mit, die wieder offen ist. Diese Regel steht
 * bewusst hier und nicht in der Oberfläche: Es gibt drei Wege zum Statuswechsel
 * (Detailansicht, Board, Tastenkürzel), und alle drei sollen dasselbe tun.
 */
export function update(id: number, patch: TaskPatch): Task {
  const current = get(id);
  const status = patch.status ?? current.status;
  const stamp = now();

  const startedAt = status === "doing"
    ? (current.status === "doing" ? current.startedAt : stamp)
    : (status === "done" ? current.startedAt : null);
  const doneAt = status === "done" ? (current.doneAt ?? stamp) : null;

  const next = {
    title: (patch.title ?? current.title).trim(),
    notes: patch.notes ?? current.notes,
    status,
    priority: patch.priority ?? current.priority,
    due: patch.due === undefined ? current.due : (patch.due ?? null),
    projectId: patch.projectId === undefined ? current.projectId : (patch.projectId ?? null),
    // Beim Spaltenwechsel oben einsortieren, sonst die Position behalten.
    position: patch.position ?? (status === current.status ? current.position : topPosition(status)),
  };

  getDb().prepare(
    `UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, due = ?, projectId = ?,
                      position = ?, updatedAt = ?, startedAt = ?, doneAt = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.notes,
    next.status,
    next.priority,
    next.due,
    next.projectId,
    next.position,
    stamp,
    startedAt,
    doneAt,
    id,
  );
  return get(id);
}

/**
 * Umschalten „erledigt / nicht erledigt“ für die Tastatur und den Haken.
 * Aus `done` geht es dorthin zurück, wo die Aufgabe herkam — `doing`, wenn sie
 * angefangen war, sonst `todo`.
 */
export function toggleDone(id: number): Task {
  const current = get(id);
  if (current.status === "done") {
    return update(id, { status: current.startedAt ? "doing" : "todo" });
  }
  return update(id, { status: "done" });
}

/** „Daran arbeite ich gerade“ ein- und ausschalten. */
export function toggleDoing(id: number): Task {
  const current = get(id);
  return update(id, { status: current.status === "doing" ? "todo" : "doing" });
}

/**
 * Verschieben im Board: Zielspalte plus Zielplatz. Die Positionen der Spalte
 * werden danach neu von 0 durchnummeriert.
 *
 * Warum Neunummerieren und nicht „Position zwischen zwei Nachbarn“: Bei einer
 * Spalte mit ein paar hundert Zeilen kostet ein UPDATE pro Zeile in einer
 * Transaktion Millisekunden, und es kann keine Position doppelt vorkommen.
 * Bruchzahlen-Positionen sparen die Schreibvorgänge, brauchen aber irgendwann
 * doch einen Aufräumlauf — den man dann genau einmal vergisst.
 */
export function move(id: number, target: TaskMove): Task {
  return tx(() => {
    const db = getDb();
    if (target.status !== get(id).status) update(id, { status: target.status });

    const ids = (db.prepare("SELECT id FROM tasks WHERE status = ? ORDER BY position, id")
      .all(target.status) as Row[]).map((row) => Number(row.id)).filter((entry) => entry !== id);
    ids.splice(Math.min(target.index, ids.length), 0, id);

    const statement = db.prepare("UPDATE tasks SET position = ? WHERE id = ?");
    ids.forEach((entry, index) => statement.run(index, entry));
    return get(id);
  });
}

/** Unterpunkte und Anhangzeilen gehen per `ON DELETE CASCADE` mit. */
export function remove(id: number): void {
  get(id);
  // Erst die Dateien, dann die Zeile: Nach dem DELETE ist die Liste der
  // Anhänge weg, und die Bilder lägen für immer im Ordner.
  attachments.removeFilesForTask(id);
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

/** „Erledigte aufräumen“ — gibt die Anzahl der entfernten Aufgaben zurück. */
export function removeDoneBefore(isoStamp: string): number {
  return tx(() => {
    const ids = (getDb().prepare("SELECT id FROM tasks WHERE status = 'done' AND doneAt < ?")
      .all(isoStamp) as Row[]).map((row) => Number(row.id));
    for (const id of ids) {
      attachments.removeFilesForTask(id);
      getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
    }
    return ids.length;
  });
}

/** Massen-Einfügen: eine Transaktion, nicht eine pro Zeile. */
export function insertMany(rows: NewTask[]): Task[] {
  return tx(() => rows.map((row) => create(row)));
}

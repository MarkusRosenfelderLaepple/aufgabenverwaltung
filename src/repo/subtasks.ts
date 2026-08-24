/**
 * Unterpunkte — **eine** Ebene, bewusst keine beliebige Verschachtelung.
 *
 * Ein Baum bräuchte rekursive Abfragen, eine Ein-/Ausklapp-Mechanik und die
 * Frage, was „erledigt“ für einen Zweig bedeutet. Was eine Aufgabe mit
 * Unterpunkten wirklich braucht, ist eine Prüfliste — und die ist flach.
 */
import { type NewSubtask, Subtask, type SubtaskPatch } from "../../shared/schema.ts";
import { getDb, tx } from "../db.ts";
import { AppError, notFound } from "../../shared/errors.ts";

type Row = Record<string, unknown>;

function toSubtask(row: Row): Subtask {
  return Subtask.parse({
    id: Number(row.id),
    taskId: Number(row.taskId),
    title: String(row.title ?? ""),
    done: row.done === 1,
    position: Number(row.position ?? 0),
  });
}

const SELECT = "SELECT id, taskId, title, done, position FROM subtasks";

export function forTask(taskId: number): Subtask[] {
  return (getDb().prepare(`${SELECT} WHERE taskId = ? ORDER BY position, id`).all(taskId) as Row[])
    .map(toSubtask);
}

export function get(id: number): Subtask {
  const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined;
  if (!row) throw notFound(`Unterpunkt ${id}`);
  return toSubtask(row);
}

/** Unterpunkte laufen **nach unten** weiter — eine Prüfliste wächst am Ende. */
export function create(taskId: number, input: NewSubtask): Subtask {
  const db = getDb();
  const next = Number(
    (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM subtasks WHERE taskId = ?")
      .get(taskId) as Row).next,
  );
  const info = db.prepare("INSERT INTO subtasks(taskId, title, position) VALUES(?, ?, ?)")
    .run(taskId, input.title.trim(), next);
  touch(taskId);
  return get(Number(info.lastInsertRowid));
}

export function update(id: number, patch: SubtaskPatch): Subtask {
  const current = get(id);
  const next = {
    title: (patch.title ?? current.title).trim(),
    done: patch.done ?? current.done,
    position: patch.position ?? current.position,
  };
  getDb().prepare("UPDATE subtasks SET title = ?, done = ?, position = ? WHERE id = ?")
    .run(next.title, next.done ? 1 : 0, next.position, id);
  touch(current.taskId);
  return get(id);
}

export function toggle(id: number): Subtask {
  const current = get(id);
  return update(id, { done: !current.done });
}

export function remove(id: number): void {
  const current = get(id);
  getDb().prepare("DELETE FROM subtasks WHERE id = ?").run(id);
  touch(current.taskId);
}

/** Reihenfolge innerhalb einer Aufgabe — vollständige ID-Liste von oben nach unten. */
export function reorder(taskId: number, ids: number[]): Subtask[] {
  return tx(() => {
    const own = new Set(forTask(taskId).map((entry) => entry.id));
    if (ids.length !== own.size || ids.some((id) => !own.has(id))) {
      throw new AppError("bad_request", "Reihenfolge passt nicht zu den Unterpunkten dieser Aufgabe");
    }
    const statement = getDb().prepare("UPDATE subtasks SET position = ? WHERE id = ?");
    ids.forEach((id, index) => statement.run(index, id));
    touch(taskId);
    return forTask(taskId);
  });
}

/**
 * Änderungen an Unterpunkten sind Änderungen an der Aufgabe: Ohne das steht in
 * der Liste „vor 3 Tagen bearbeitet“, obwohl man gerade eben drei Häkchen
 * gesetzt hat, und die Sortierung „zuletzt geändert“ stimmt nicht mehr.
 */
function touch(taskId: number): void {
  getDb().prepare("UPDATE tasks SET updatedAt = ? WHERE id = ?").run(new Date().toISOString(), taskId);
}

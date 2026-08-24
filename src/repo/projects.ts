/**
 * Projekte — die einzige Gruppierungsachse der App.
 *
 * Bewusst *ein* Projekt pro Aufgabe und keine freien Tags: Bei einer
 * Ein-Nutzer-Liste kostet eine n:m-Beziehung eine Zwischentabelle, eine
 * Chips-Eingabe und die Frage „gehört das jetzt in Tag A oder B?“ — und
 * beantwortet dafür keine Frage, die eine farbige Liste in der Seitenleiste
 * nicht auch beantwortet.
 */
import { type NewProject, Project, type ProjectPatch } from "../../shared/schema.ts";
import { getDb, tx } from "../db.ts";
import { AppError, notFound } from "../../shared/errors.ts";

type Row = Record<string, unknown>;

/** Genau **eine** Stelle macht aus `unknown` einen Typ. */
function toProject(row: Row): Project {
  return Project.parse({
    id: Number(row.id),
    name: String(row.name ?? ""),
    color: String(row.color ?? "brand"),
    position: Number(row.position ?? 0),
    archived: row.archived === 1, // SQLite kennt kein BOOLEAN
    open: Number(row.open ?? 0),
  });
}

/**
 * Der Zähler kommt als korreliertes Unterabfrage-Feld mit: Ein zweiter
 * Rundgang „für jedes Projekt die offenen zählen“ wäre N+1 Abfragen für eine
 * Zahl, die in der Seitenleiste ständig sichtbar ist.
 */
const SELECT = `
  SELECT p.id, p.name, p.color, p.position, p.archived,
         (SELECT COUNT(*) FROM tasks t WHERE t.projectId = p.id AND t.status <> 'done') AS open
  FROM projects p`;

export function all(includeArchived = true): Project[] {
  const sql = includeArchived ? SELECT : `${SELECT} WHERE p.archived = 0`;
  return (getDb().prepare(`${sql} ORDER BY p.archived, p.position, p.id`).all() as Row[]).map(toProject);
}

export function get(id: number): Project {
  const row = getDb().prepare(`${SELECT} WHERE p.id = ?`).get(id) as Row | undefined;
  if (!row) throw notFound(`Projekt ${id}`);
  return toProject(row);
}

export function create(input: NewProject): Project {
  const db = getDb();
  const next = Number(
    (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM projects").get() as Row).next,
  );
  const info = db.prepare("INSERT INTO projects(name, color, position) VALUES(?, ?, ?)")
    .run(input.name.trim(), input.color, next);
  return get(Number(info.lastInsertRowid));
}

export function update(id: number, patch: ProjectPatch): Project {
  const current = get(id);
  const next = {
    name: (patch.name ?? current.name).trim(),
    color: patch.color ?? current.color,
    archived: patch.archived ?? current.archived,
    position: patch.position ?? current.position,
  };
  getDb().prepare("UPDATE projects SET name = ?, color = ?, archived = ?, position = ? WHERE id = ?")
    .run(next.name, next.color, next.archived ? 1 : 0, next.position, id);
  return get(id);
}

/**
 * Löschen lässt die Aufgaben stehen — `ON DELETE SET NULL` schiebt sie in den
 * Eingang. Ein Projekt zu löschen und dabei zwanzig Aufgaben mitzureißen ist
 * ein Datenverlust, den niemand erwartet; wer aufräumen will, archiviert.
 */
export function remove(id: number): void {
  get(id);
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

/** Reihenfolge der Seitenleiste — die vollständige Liste der IDs von oben nach unten. */
export function reorder(ids: number[]): Project[] {
  const db = getDb();
  const known = new Set((db.prepare("SELECT id FROM projects").all() as Row[]).map((row) => Number(row.id)));
  for (const id of ids) {
    if (!known.has(id)) throw new AppError("bad_request", `Unbekanntes Projekt: ${id}`);
  }
  const statement = db.prepare("UPDATE projects SET position = ? WHERE id = ?");
  tx(() => ids.forEach((id, index) => statement.run(index, id)));
  return all();
}

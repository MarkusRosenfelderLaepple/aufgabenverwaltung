/**
 * Bildanhänge: Zeile in der Datenbank, Datei im Anhangordner.
 *
 * Zwei Regeln, die den Rest erklären:
 *
 * 1. **Der Dateiname des Anwenders wird nie zum Pfad.** Gespeichert wird unter
 *    `<id>.<ext>`, wobei `ext` aus dem geprüften MIME-Typ kommt. Damit sind
 *    `../`, Doppelnamen, Umlaute und 300 Zeichen lange Namen kein Thema mehr —
 *    der Originalname überlebt nur als Anzeigetext in der Spalte `name`.
 * 2. **Der MIME-Typ wird gegen eine Liste geprüft**, nicht übernommen. Was das
 *    Webview nicht als Bild darstellen kann, hat hier nichts zu suchen.
 */
import { basename, extname, join } from "@std/path";
import { Attachment, ATTACHMENT_MIME } from "../../shared/schema.ts";
import { getDb } from "../db.ts";
import { AppError, notFound } from "../../shared/errors.ts";
import { attachmentDir } from "../paths.ts";
import { log } from "../log.ts";

type Row = Record<string, unknown>;

/** 25 MB — ein Screenshot ist selten größer, ein versehentlich gezogenes Video schon. */
export const MAX_BYTES = 25 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

function toAttachment(row: Row): Attachment {
  return Attachment.parse({
    id: Number(row.id),
    taskId: Number(row.taskId),
    name: String(row.name ?? ""),
    mime: String(row.mime ?? ""),
    bytes: Number(row.bytes ?? 0),
    createdAt: String(row.createdAt),
  });
}

const SELECT = "SELECT id, taskId, name, mime, ext, bytes, createdAt FROM attachments";

export function forTask(taskId: number): Attachment[] {
  return (getDb().prepare(`${SELECT} WHERE taskId = ? ORDER BY id`).all(taskId) as Row[])
    .map(toAttachment);
}

export function get(id: number): Attachment & { path: string } {
  const row = getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Row | undefined;
  if (!row) throw notFound(`Anhang ${id}`);
  return { ...toAttachment(row), path: join(attachmentDir(), `${Number(row.id)}.${String(row.ext)}`) };
}

/**
 * Speichert die Bytes und legt die Zeile an. Erst die Zeile (für die ID), dann
 * die Datei — schlägt das Schreiben fehl, verschwindet die Zeile wieder, sonst
 * zeigte die Oberfläche einen Anhang, den es nicht gibt.
 */
export async function store(
  taskId: number,
  input: { name: string; mime: string; data: Uint8Array },
): Promise<Attachment> {
  const mime = normalizeMime(input.mime, input.name);
  if (input.data.byteLength === 0) throw new AppError("bad_request", "Datei ist leer");
  if (input.data.byteLength > MAX_BYTES) {
    throw new AppError("bad_request", `Datei ist größer als ${Math.round(MAX_BYTES / 1024 / 1024)} MB`);
  }

  const db = getDb();
  const ext = EXTENSION[mime];
  const info = db.prepare(
    "INSERT INTO attachments(taskId, name, mime, ext, bytes, createdAt) VALUES(?, ?, ?, ?, ?, ?)",
  ).run(taskId, displayName(input.name, ext), mime, ext, input.data.byteLength, new Date().toISOString());
  const id = Number(info.lastInsertRowid);

  try {
    await Deno.mkdir(attachmentDir(), { recursive: true });
    await Deno.writeFile(join(attachmentDir(), `${id}.${ext}`), input.data);
  } catch (error) {
    db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
    throw new AppError("io_error", `Anhang konnte nicht gespeichert werden: ${error}`);
  }
  db.prepare("UPDATE tasks SET updatedAt = ? WHERE id = ?").run(new Date().toISOString(), taskId);
  log.info(`Anhang ${id} zu Aufgabe ${taskId} (${mime}, ${input.data.byteLength} Bytes)`);
  return get(id);
}

/**
 * Dieselbe Ablage, aber die Datei liegt schon auf der Platte: Der native
 * Auswahldialog liefert Pfade (`src/dialog.ts`). Der MIME-Typ kommt hier
 * ausschließlich aus der Endung — das Betriebssystem hat keinen mitgeliefert,
 * und geprüft wird er in `store` ohnehin gegen die Liste.
 */
export async function importFile(taskId: number, path: string): Promise<Attachment> {
  let data: Uint8Array;
  try {
    data = await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) throw notFound(`Datei ${path}`);
    throw new AppError("io_error", `Datei konnte nicht gelesen werden: ${error}`);
  }
  return await store(taskId, { name: basename(path), mime: "", data });
}

/**
 * Eingefügte Screenshots heißen im Webview `image.png` oder gar nichts. Ein
 * sprechender Name entsteht deshalb hier, sonst steht in der Liste dreimal
 * dieselbe Zeile.
 */
function displayName(name: string, ext: string): string {
  const trimmed = name.trim();
  if (trimmed && trimmed !== "image.png" && trimmed !== "blob") return trimmed.slice(0, 200);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "-");
  return `Screenshot ${stamp}.${ext}`;
}

/**
 * MIME aus dem Formular ist eine Behauptung des Clients. Sie wird gegen die
 * erlaubte Liste geprüft; fehlt sie, entscheidet die Endung des Namens.
 */
function normalizeMime(mime: string, name: string): string {
  const claimed = mime.split(";")[0].trim().toLowerCase();
  if ((ATTACHMENT_MIME as readonly string[]).includes(claimed)) return claimed;
  const byExtension: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
  };
  const guess = byExtension[extname(name).toLowerCase()];
  if (guess) return guess;
  throw new AppError("bad_request", `Nur Bilder werden angehängt (${claimed || "unbekannter Typ"})`);
}

export function remove(id: number): void {
  const entry = get(id);
  getDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
  removeFile(entry.path);
  getDb().prepare("UPDATE tasks SET updatedAt = ? WHERE id = ?")
    .run(new Date().toISOString(), entry.taskId);
}

/**
 * Vor dem Löschen einer Aufgabe aufrufen: Die Zeilen verschwinden per
 * `ON DELETE CASCADE`, die Dateien nicht.
 */
export function removeFilesForTask(taskId: number): void {
  for (const row of getDb().prepare("SELECT id, ext FROM attachments WHERE taskId = ?").all(taskId)) {
    const entry = row as Row;
    removeFile(join(attachmentDir(), `${Number(entry.id)}.${String(entry.ext)}`));
  }
}

/**
 * Eine fehlende Datei ist kein Fehler: Sie kann von Hand gelöscht worden sein
 * oder aus einer Sicherung fehlen. Das Löschen der Zeile darf daran nicht
 * scheitern — sonst hängt ein Anhang für immer in der Liste.
 */
function removeFile(path: string): void {
  try {
    Deno.removeSync(path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) log.warn(`Anhang nicht gelöscht: ${path} (${error})`);
  }
}

/** Verwaiste Dateien im Anhangordner — nach Wiederherstellen einer Sicherung. */
export async function pruneOrphans(): Promise<number> {
  const known = new Set(
    (getDb().prepare("SELECT id, ext FROM attachments").all() as Row[])
      .map((row) => `${Number(row.id)}.${String(row.ext)}`),
  );
  let removed = 0;
  try {
    for await (const entry of Deno.readDir(attachmentDir())) {
      if (entry.isFile && !known.has(entry.name)) {
        removeFile(join(attachmentDir(), entry.name));
        removed++;
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  if (removed > 0) log.info(`${removed} verwaiste Anhangdatei(en) entfernt`);
  return removed;
}

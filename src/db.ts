/**
 * Verbindung + Migrationen.
 *
 * **Regel: Migrationen werden nie geändert, nur angehängt.** Eine bereits
 * ausgelieferte Zeile in `MIGRATIONS` zu bearbeiten heißt, dass Rechner mit
 * alter Datei und Rechner mit Neuinstallation unterschiedliche Schemata haben.
 * Wer eine Spalte anders braucht, hängt eine neue Migration an.
 */
import { DatabaseSync } from "node:sqlite";
import { dirname } from "@std/path";
import { databasePath } from "./paths.ts";
import { log } from "./log.ts";

/** Index + 1 == `PRAGMA user_version` nach Anwendung. */
const MIGRATIONS: string[] = [
  // 1 — Ausgangsschema
  `CREATE TABLE projects (
     id       INTEGER PRIMARY KEY AUTOINCREMENT,
     name     TEXT    NOT NULL,
     color    TEXT    NOT NULL DEFAULT 'brand',
     position INTEGER NOT NULL DEFAULT 0,
     archived INTEGER NOT NULL DEFAULT 0
   );

   CREATE TABLE tasks (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     title     TEXT    NOT NULL,
     notes     TEXT    NOT NULL DEFAULT '',
     status    TEXT    NOT NULL DEFAULT 'todo',
     priority  INTEGER NOT NULL DEFAULT 0,
     due       TEXT,
     projectId INTEGER REFERENCES projects(id) ON DELETE SET NULL,
     position  INTEGER NOT NULL DEFAULT 0,
     createdAt TEXT    NOT NULL,
     updatedAt TEXT    NOT NULL,
     startedAt TEXT,
     doneAt    TEXT
   );

   -- ON DELETE CASCADE statt Aufraeumcode: Unterpunkte ohne Aufgabe sind
   -- unerreichbarer Datenmuell, und die Sperre steht in der Datenbank statt in
   -- einer Funktion, die man beim naechsten Loeschweg vergisst.
   CREATE TABLE subtasks (
     id       INTEGER PRIMARY KEY AUTOINCREMENT,
     taskId   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     title    TEXT    NOT NULL,
     done     INTEGER NOT NULL DEFAULT 0,
     position INTEGER NOT NULL DEFAULT 0
   );

   -- Die Datei selbst liegt unter attachmentDir()/<id>.<ext>; hier steht nur
   -- die Buchführung. Die Endung kommt vom Server aus dem geprüften MIME-Typ,
   -- nie aus dem Namen der hochgeladenen Datei.
   CREATE TABLE attachments (
     id        INTEGER PRIMARY KEY AUTOINCREMENT,
     taskId    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     name      TEXT    NOT NULL,
     mime      TEXT    NOT NULL,
     ext       TEXT    NOT NULL,
     bytes     INTEGER NOT NULL,
     createdAt TEXT    NOT NULL
   );

   CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );

   -- Indizes für die Wege, die die Oberfläche wirklich geht: Board-Spalte,
   -- Tagesansicht (Termin), Projektfilter, Tagesauswertung.
   CREATE INDEX idx_tasks_status   ON tasks(status, position);
   CREATE INDEX idx_tasks_due      ON tasks(due);
   CREATE INDEX idx_tasks_project  ON tasks(projectId);
   CREATE INDEX idx_tasks_doneAt   ON tasks(doneAt);
   CREATE INDEX idx_subtasks_task  ON subtasks(taskId, position);
   CREATE INDEX idx_attach_task    ON attachments(taskId);`,
];

export function migrate(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = Number(row.user_version);
  for (; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      // Achtung: PRAGMA nimmt keine Platzhalter — daher Template-String.
      // Der Wert stammt aus dem Schleifenzähler, nicht aus Eingaben.
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    log.info(`Migration ${version + 1} angewendet`);
  }
  return version;
}

/** Öffnet (und migriert) eine Datenbank. Tests übergeben `":memory:"`. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") Deno.mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  // Ohne das sind `ON DELETE CASCADE` und `SET NULL` oben reine Deko —
  // SQLite hat Fremdschlüssel je Verbindung standardmäßig **aus**.
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) db = openDatabase(databasePath());
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

/**
 * Führt `fn` in einer Transaktion aus — für alles, was mehrere Zeilen anfasst.
 *
 * **Verschachtelbar**, und das ist nicht Bequemlichkeit: `create()` ist selbst
 * transaktional (Aufgabe + Unterpunkte), und `insertMany()` ruft es in einer
 * Schleife. Ein zweites `BEGIN` wirft in SQLite
 * („cannot start a transaction within a transaction“), also zählt der innere
 * Aufruf nur mit und die äußerste Klammer schreibt fest. Ein Fehler tief innen
 * verwirft damit den ganzen Vorgang — genau das, was man will.
 */
let depth = 0;

export function tx<T>(fn: () => T): T {
  const database = getDb();
  if (depth > 0) {
    depth++;
    try {
      return fn();
    } finally {
      depth--;
    }
  }
  database.exec("BEGIN");
  depth = 1;
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    depth = 0;
  }
}

/**
 * Konsistente Sicherung im laufenden Betrieb — ein Einzeiler. `VACUUM INTO`
 * scheitert, wenn die Zieldatei existiert; der Aufrufer sorgt mit
 * `uniquePath()` für einen freien Namen.
 */
export function backupTo(target: string): string {
  getDb().prepare("VACUUM INTO ?").run(target);
  log.info(`Sicherung geschrieben: ${target}`);
  return target;
}

export { databasePath };

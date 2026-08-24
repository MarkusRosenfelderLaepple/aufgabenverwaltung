/**
 * Repository gegen eine `:memory:`-Datenbank.
 *
 * Schnell, ohne Aufräumen und ohne Rücksicht auf die echte Datei. Die
 * Umgebungsvariable muss *vor* dem ersten `getDb()` stehen — `getDb()` ist
 * bewusst faul, deshalb reicht die Zuweisung hier oben.
 */
import { assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import { DB_ENV } from "../src/paths.ts";

Deno.env.set(DB_ENV, ":memory:");

const { getDb, migrate } = await import("../src/db.ts");
const tasks = await import("../src/repo/tasks.ts");
const projects = await import("../src/repo/projects.ts");
const subtasks = await import("../src/repo/subtasks.ts");
const agenda = await import("../src/repo/agenda.ts");
const analytics = await import("../src/repo/analytics.ts");
const { readSetting, writeSetting } = await import("../src/settings.ts");
const { DEFAULT_TASK_QUERY } = await import("../shared/schema.ts");

const query = DEFAULT_TASK_QUERY;
const newTask = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  notes: "",
  status: "todo" as const,
  priority: 0,
  due: null,
  projectId: null,
  subtasks: [],
  ...extra,
});

/** Damit jeder Test von einer bekannten Lage aus startet. */
function clear() {
  getDb().exec("DELETE FROM tasks; DELETE FROM projects;");
}

Deno.test("Migrationen laufen bis zur letzten Version und sind idempotent", () => {
  const version = (getDb().prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  assertEquals(version > 0, true);
  assertEquals(migrate(getDb()), version);
});

Deno.test("Aufgabe anlegen, umschalten, löschen", () => {
  clear();
  const created = tasks.create(newTask("Angebot prüfen", { due: "2026-09-01", priority: 2 }));
  assertEquals(created.status, "todo");
  assertEquals(created.due, "2026-09-01");
  assertEquals(created.doneAt, null);

  const done = tasks.toggleDone(created.id);
  assertEquals(done.status, "done");
  // Der Zeitstempel ist die Grundlage der Tagesauswertung — ohne ihn zählt
  // nichts.
  assertNotEquals(done.doneAt, null);

  // Zurück nach „geplant“, und der Zeitstempel muss weg sein: Sonst zählt die
  // Auswertung eine Aufgabe mit, die wieder offen ist.
  const reopened = tasks.toggleDone(created.id);
  assertEquals(reopened.status, "todo");
  assertEquals(reopened.doneAt, null);

  tasks.remove(created.id);
  assertThrows(() => tasks.get(created.id));
});

Deno.test("„In Arbeit“ merkt sich den Beginn und gibt ihn beim Verlassen frei", () => {
  clear();
  const task = tasks.create(newTask("Bericht schreiben"));
  assertEquals(task.startedAt, null);

  const doing = tasks.toggleDoing(task.id);
  assertEquals(doing.status, "doing");
  assertNotEquals(doing.startedAt, null);

  // Zweimal „in Arbeit“ darf den Beginn nicht neu setzen — sonst zeigt die
  // Anzeige „seit 0 Minuten“, obwohl man seit zwei Stunden dran ist.
  const again = tasks.update(task.id, { status: "doing" });
  assertEquals(again.startedAt, doing.startedAt);

  assertEquals(tasks.toggleDoing(task.id).startedAt, null);
});

Deno.test("Aus „erledigt“ führt der Weg zurück nach „in Arbeit“, wenn es begonnen war", () => {
  clear();
  const task = tasks.create(newTask("Halb fertig"));
  tasks.toggleDoing(task.id);
  assertEquals(tasks.toggleDone(task.id).status, "done");
  assertEquals(tasks.toggleDone(task.id).status, "doing");
});

Deno.test("Filter, Suche und Projektzuordnung wirken in SQL", () => {
  clear();
  const project = projects.create({ name: "Vertrieb", color: "green" });
  const a = tasks.create(newTask("Alpha Bericht", { projectId: project.id }));
  const b = tasks.create(newTask("Beta Notiz", { status: "backlog" as const }));
  tasks.create(newTask("Gamma", { notes: "Steht im Bericht auf Seite 4" }));
  const withSubtask = tasks.create(newTask("Monatsabschluss"));
  subtasks.create(withSubtask.id, { title: "Rechnung prüfen" });

  assertEquals(tasks.all({ ...query, status: "backlog" }).map((task) => task.id), [b.id]);
  assertEquals(tasks.all({ ...query, projectId: project.id }).map((task) => task.id), [a.id]);
  // 0 ist die Verabredung für „ohne Projekt“.
  assertEquals(tasks.all({ ...query, projectId: 0 }).length, 3);

  // Die Suche greift in Titel, Notizen **und** Unterpunkte.
  assertEquals(tasks.all({ ...query, search: "alpha" }).length, 1);
  assertEquals(tasks.all({ ...query, search: "bericht" }).length, 2);
  assertEquals(tasks.all({ ...query, search: "rechnung" }).map((task) => task.id), [withSubtask.id]);
  // Prozentzeichen darf kein Platzhalter werden.
  assertEquals(tasks.all({ ...query, search: "%" }).length, 0);
});

Deno.test("Aufgaben ohne Termin stehen bei Sortierung nach Termin am Ende", () => {
  clear();
  const ohne = tasks.create(newTask("Irgendwann"));
  const spaet = tasks.create(newTask("Später", { due: "2026-12-01" }));
  const frueh = tasks.create(newTask("Bald", { due: "2026-01-05" }));

  assertEquals(
    tasks.all({ ...query, sort: "due", dir: "asc" }).map((task) => task.id),
    [frueh.id, spaet.id, ohne.id],
  );
});

Deno.test("Seite, Gesamtzahl und Klemmen hinter der letzten Seite kommen aus SQL", () => {
  clear();
  for (let index = 0; index < 12; index++) tasks.create(newTask(`Aufgabe ${index}`));

  const page = tasks.page({ ...query, pageSize: 5, page: 2 });
  assertEquals(page.total, 12);
  assertEquals(page.pages, 3);
  assertEquals(page.rows.length, 5);

  // Hinter der letzten Seite gibt der Server die letzte echte Seite zurück.
  const beyond = tasks.page({ ...query, pageSize: 5, page: 9 });
  assertEquals(beyond.page, 3);
  assertEquals(beyond.rows.length, 2);
});

Deno.test("Verschieben im Board nummeriert die Zielspalte lückenlos neu", () => {
  clear();
  const a = tasks.create(newTask("A"));
  const b = tasks.create(newTask("B"));
  const c = tasks.create(newTask("C"));

  // Neue Aufgaben kommen oben in ihre Spalte: C, B, A.
  const order = () =>
    tasks.all({ ...query, status: "todo", sort: "manual", dir: "asc" }).map((task) => task.title);
  assertEquals(order(), ["C", "B", "A"]);

  tasks.move(a.id, { status: "todo", index: 0 });
  assertEquals(order(), ["A", "C", "B"]);

  // Positionen sind danach 0,1,2 — keine Lücken, keine Doppelungen.
  const positions = tasks.all({ ...query, status: "todo", sort: "manual", dir: "asc" })
    .map((task) => task.position);
  assertEquals(positions, [0, 1, 2]);

  // In eine andere Spalte verschieben ändert den Zustand mit.
  assertEquals(tasks.move(b.id, { status: "doing", index: 0 }).status, "doing");
  assertEquals(tasks.get(c.id).status, "todo");
});

Deno.test("Unterpunkte: Zähler an der Aufgabe, Reihenfolge, Kaskade beim Löschen", () => {
  clear();
  const task = tasks.create(newTask("Umzug", { subtasks: ["Kisten", "Transporter", "Schlüssel"] }));
  assertEquals(tasks.get(task.id).subtaskTotal, 3);
  assertEquals(tasks.get(task.id).subtaskDone, 0);

  const list = subtasks.forTask(task.id);
  assertEquals(list.map((entry) => entry.title), ["Kisten", "Transporter", "Schlüssel"]);

  subtasks.toggle(list[1].id);
  assertEquals(tasks.get(task.id).subtaskDone, 1);

  subtasks.reorder(task.id, [list[2].id, list[0].id, list[1].id]);
  assertEquals(
    subtasks.forTask(task.id).map((entry) => entry.title),
    ["Schlüssel", "Kisten", "Transporter"],
  );

  // Eine unvollständige Reihenfolge darf nicht durchgehen — sonst verschwinden
  // Unterpunkte aus der Anzeige, obwohl sie noch in der Tabelle stehen.
  assertThrows(() => subtasks.reorder(task.id, [list[0].id]));

  // `ON DELETE CASCADE` — nur wirksam, weil `PRAGMA foreign_keys` gesetzt ist.
  tasks.remove(task.id);
  assertEquals(subtasks.forTask(task.id).length, 0);
});

Deno.test("Projekt löschen schiebt die Aufgaben in den Eingang", () => {
  clear();
  const project = projects.create({ name: "Altes Projekt", color: "red" });
  const task = tasks.create(newTask("Bleibt", { projectId: project.id }));
  assertEquals(projects.get(project.id).open, 1);

  projects.remove(project.id);
  assertEquals(tasks.get(task.id).projectId, null);
});

Deno.test("Projektzähler zählt nur Offenes", () => {
  clear();
  const project = projects.create({ name: "Zähltest", color: "brand" });
  const a = tasks.create(newTask("Eins", { projectId: project.id }));
  tasks.create(newTask("Zwei", { projectId: project.id }));
  assertEquals(projects.get(project.id).open, 2);
  tasks.toggleDone(a.id);
  assertEquals(projects.get(project.id).open, 1);
});

Deno.test("Tagesansicht sortiert nach Dringlichkeit und trennt die Abschnitte", () => {
  clear();
  const today = "2026-08-24";
  const overdue = tasks.create(newTask("Überfällig", { due: "2026-08-20" }));
  const heute = tasks.create(newTask("Heute", { due: today }));
  const soon = tasks.create(newTask("Nächste Woche", { due: "2026-08-28" }));
  tasks.create(newTask("Weit weg", { due: "2026-10-01" }));
  const doing = tasks.create(newTask("Läuft", { due: "2026-09-30" }));
  tasks.toggleDoing(doing.id);

  const view = agenda.today(today);
  assertEquals(view.doing.map((task) => task.id), [doing.id]);
  assertEquals(view.overdue.map((task) => task.id), [overdue.id]);
  assertEquals(view.today.map((task) => task.id), [heute.id]);
  // „Bald“ heißt: die nächsten sieben Tage, ohne heute.
  assertEquals(view.soon.map((task) => task.id), [soon.id]);
  assertEquals(view.doneToday.length, 0);
});

Deno.test("Auswertung: Verlauf füllt Nulltage und zählt heute Erledigtes", () => {
  clear();
  const today = new Date().toISOString().slice(0, 10);
  const task = tasks.create(newTask("Fertig heute"));
  tasks.toggleDone(task.id);

  const stats = agenda.stats(today);
  assertEquals(stats.doneToday, 1);
  assertEquals(stats.open, 0);
  // Der Verlauf hat für jeden Tag einen Eintrag, auch für die leeren.
  assertEquals(stats.history.length, 21);
  assertEquals(stats.history[stats.history.length - 1].date, today);
  assertEquals(stats.history[stats.history.length - 1].done, 1);
  assertEquals(stats.streak, 1);
});

Deno.test("addDays rechnet über UTC und springt nicht bei Zeitumstellung", () => {
  assertEquals(agenda.addDays("2026-03-28", 1), "2026-03-29"); // Sommerzeitbeginn in DE
  assertEquals(agenda.addDays("2026-10-24", 1), "2026-10-25"); // Winterzeitbeginn
  assertEquals(agenda.addDays("2026-12-31", 1), "2027-01-01");
  assertEquals(agenda.addDays("2026-01-01", -1), "2025-12-31");
});

Deno.test("Aufräumen entfernt nur alte Erledigte", () => {
  clear();
  const alt = tasks.create(newTask("Lang fertig"));
  tasks.toggleDone(alt.id);
  getDb().prepare("UPDATE tasks SET doneAt = ? WHERE id = ?").run("2020-01-01T10:00:00.000Z", alt.id);
  const neu = tasks.create(newTask("Gerade fertig"));
  tasks.toggleDone(neu.id);
  const offen = tasks.create(newTask("Noch offen"));

  assertEquals(tasks.removeDoneBefore("2021-01-01T00:00:00.000Z"), 1);
  assertThrows(() => tasks.get(alt.id));
  assertEquals(tasks.get(neu.id).status, "done");
  assertEquals(tasks.get(offen.id).status, "todo");
});

Deno.test("Einstellungen fallen bei kaputtem Wert auf die Vorgabe zurück", () => {
  assertEquals(writeSetting("dailyGoal", 8), 8);
  assertEquals(readSetting("dailyGoal"), 8);

  getDb().prepare("UPDATE settings SET value = ? WHERE key = ?").run('"kein Zahl"', "dailyGoal");
  assertEquals(readSetting("dailyGoal"), 5);
});

Deno.test("Auswertung: Zeitreihe, Bestand und Durchlaufzeit", () => {
  clear();
  const stamp = (day: string, time = "09:00:00") => `${day}T${time}.000Z`;
  const set = (id: number, createdAt: string, doneAt: string | null) =>
    getDb().prepare("UPDATE tasks SET createdAt = ?, updatedAt = ?, doneAt = ?, status = ? WHERE id = ?")
      .run(createdAt, createdAt, doneAt, doneAt === null ? "todo" : "done", id);

  // Zwei Aufgaben vor dem Zeitraum: eine erledigt, eine offen — die offene ist
  // der Startbestand, den die Kurve mitschleppen muss.
  const alt1 = tasks.create(newTask("Alt fertig"));
  set(alt1.id, stamp("2026-01-05"), stamp("2026-01-06"));
  const alt2 = tasks.create(newTask("Alt offen"));
  set(alt2.id, stamp("2026-01-05"), null);

  // Im Zeitraum: am 10. angelegt, am 13. fertig (Durchlaufzeit 3 Tage).
  const neu = tasks.create(newTask("Neu"));
  set(neu.id, stamp("2026-02-10"), stamp("2026-02-13"));

  const result = analytics.analytics("2026-02-14", 14);
  assertEquals(result.from, "2026-02-01");
  assertEquals(result.daily.length, 14);
  assertEquals(result.totals.openStart, 1);
  assertEquals(result.totals.created, 1);
  assertEquals(result.totals.done, 1);
  assertEquals(result.totals.open, 1);
  assertEquals(result.totals.createdAll, 3);

  const day = (date: string) => result.daily.find((point) => point.date === date);
  assertEquals(day("2026-02-09")?.open, 1); // nur der Altbestand
  assertEquals(day("2026-02-10")?.created, 1);
  assertEquals(day("2026-02-10")?.open, 2); // Zugang, noch kein Abgang
  assertEquals(day("2026-02-13")?.done, 1);
  assertEquals(day("2026-02-13")?.open, 1); // wieder auf Altbestand
  assertEquals(result.totals.bestDay?.date, "2026-02-13");

  // Durchlaufzeit: genau ein Wert, 3 Tage — Median wie Mittel.
  assertEquals(result.leadTime.count, 1);
  assertEquals(result.leadTime.median, 3);
  assertEquals(result.leadTime.buckets.find((bucket) => bucket.label === "3–7 Tage")?.count, 1);

  // Der 13. Februar 2026 ist ein Freitag: Montag = 0, Freitag = 4.
  assertEquals(result.weekday[4].done, 1);
  assertEquals(result.monthly.length, 1);
  assertEquals(result.monthly[0], { month: "2026-02", created: 1, done: 1 });

  // Die Heatmap hängt nicht am gewählten Zeitraum, sondern ist immer ein Jahr.
  assertEquals(result.calendar.length, 371);
  assertEquals(result.calendar.at(-1)?.date, "2026-02-14");
});

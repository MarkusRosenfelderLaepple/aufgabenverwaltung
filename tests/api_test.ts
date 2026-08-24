/**
 * API-Handler direkt aufgerufen — `app.request()` braucht keinen Server, keinen
 * Port und keine Wartezeit. Das ist der Grund, warum die Routen in `src/api.ts`
 * als Funktion und nicht als Nebenwirkung von `main.ts` entstehen.
 */
import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { DATA_ENV, DB_ENV } from "../src/paths.ts";

Deno.env.set(DB_ENV, ":memory:");
// Anhänge landen als Dateien auf der Platte — in einem Wegwerfordner, nicht im
// echten Datenverzeichnis des Anwenders.
const dataDir = Deno.makeTempDirSync({ prefix: "aufgaben-test-" });
Deno.env.set(DATA_ENV, dataDir);
addEventListener("unload", () => Deno.removeSync(dataDir, { recursive: true }));

const { createApp } = await import("../src/api.ts");
const { app } = createApp({ requestLog: false });

const send = (path: string, method: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const json = async <T>(response: Response): Promise<T> => await response.json() as T;

Deno.test("POST /api/tasks legt an und antwortet mit 201", async () => {
  const response = await send("/api/tasks", "POST", { title: "Aus dem Test", due: "2026-09-01" });
  assertEquals(response.status, 201);
  const task = await json<{ title: string; status: string; due: string }>(response);
  assertEquals(task.title, "Aus dem Test");
  assertEquals(task.status, "todo");
  assertEquals(task.due, "2026-09-01");
});

Deno.test("Validierungsfehler kommt in der einen Fehlerform", async () => {
  const response = await send("/api/tasks", "POST", { title: "" });
  assertEquals(response.status, 400);
  const body = await json<{ error: { code: string; details: unknown[] } }>(response);
  assertEquals(body.error.code, "bad_request");
  assertEquals(Array.isArray(body.error.details), true);
});

Deno.test("Unbekannte Aufgabe ergibt 404 mit Code", async () => {
  const response = await send("/api/tasks/999999/toggle", "POST");
  assertEquals(response.status, 404);
  assertEquals((await json<{ error: { code: string } }>(response)).error.code, "not_found");
});

Deno.test("Suchparameter werden gegen das Schema geprüft", async () => {
  assertEquals((await app.request("/api/tasks?status=quatsch")).status, 400);
  assertEquals((await app.request("/api/tasks?status=doing&sort=due&dir=asc")).status, 200);
  // `open` ist kein Zustand einer Aufgabe, aber ein erlaubter Filterwert.
  assertEquals((await app.request("/api/tasks?status=open")).status, 200);
  // Unbekannte Sortierspalte und unsinnige Seitengröße kommen nie bis ins SQL.
  assertEquals((await app.request("/api/tasks?sort=drop_table")).status, 400);
  assertEquals((await app.request("/api/tasks?pageSize=99999")).status, 400);
});

Deno.test('noDue="false" schaltet den Filter wirklich ab', async () => {
  // Der Fall, den `z.coerce.boolean()` falsch macht: Jede nichtleere
  // Zeichenkette wäre `true`, und der Filter ließe sich nicht mehr abschalten,
  // sobald er einmal in der URL steht.
  await send("/api/tasks", "POST", { title: "Mit Termin", due: "2026-09-09" });
  const off = await json<{ total: number }>(await app.request("/api/tasks?noDue=false"));
  const on = await json<{ total: number }>(await app.request("/api/tasks?noDue=true"));
  assertEquals(off.total > on.total, true);
});

Deno.test("Teiländerung leert ein Feld nur, wenn null geschickt wird", async () => {
  const created = await json<{ id: number }>(
    await send("/api/tasks", "POST", { title: "Patch-Test", due: "2026-09-01", priority: 3 }),
  );

  // `undefined`/fehlendes Feld heißt „nicht anfassen“.
  const untouched = await json<{ due: string; priority: number }>(
    await send(`/api/tasks/${created.id}`, "PATCH", { priority: 1 }),
  );
  assertEquals(untouched.due, "2026-09-01");
  assertEquals(untouched.priority, 1);

  // `null` heißt „leeren“.
  const cleared = await json<{ due: string | null }>(
    await send(`/api/tasks/${created.id}`, "PATCH", { due: null }),
  );
  assertEquals(cleared.due, null);
});

Deno.test("Detailantwort enthält Unterpunkte und Anhänge", async () => {
  const created = await json<{ id: number }>(
    await send("/api/tasks", "POST", { title: "Mit Unterpunkten", subtasks: ["Eins", "Zwei"] }),
  );
  const detail = await json<{ subtasks: unknown[]; attachments: unknown[] }>(
    await send(`/api/tasks/${created.id}`, "GET"),
  );
  assertEquals(detail.subtasks.length, 2);
  assertEquals(detail.attachments.length, 0);
});

Deno.test("Anhang: nur Bilder, und die Bytes kommen zurück", async () => {
  const created = await json<{ id: number }>(await send("/api/tasks", "POST", { title: "Mit Bild" }));

  // Ein minimales PNG (1×1, transparent) — echte Bytes, kein Platzhalter.
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAX+d1LQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );

  const form = new FormData();
  form.set("file", new File([png], "screenshot.png", { type: "image/png" }));
  const response = await app.request(`/api/tasks/${created.id}/attachments`, {
    method: "POST",
    body: form,
  });
  assertEquals(response.status, 201);
  const attachment = await json<{ id: number; mime: string; bytes: number }>(response);
  assertEquals(attachment.mime, "image/png");
  assertEquals(attachment.bytes, png.byteLength);

  const file = await app.request(`/api/attachments/${attachment.id}/file`);
  assertEquals(file.status, 200);
  assertEquals(file.headers.get("content-type"), "image/png");
  assertEquals(new Uint8Array(await file.arrayBuffer()).byteLength, png.byteLength);

  // Eine Textdatei wird abgelehnt — mit der einen Fehlerform.
  const bad = new FormData();
  bad.set("file", new File(["kein Bild"], "notiz.txt", { type: "text/plain" }));
  const rejected = await app.request(`/api/tasks/${created.id}/attachments`, {
    method: "POST",
    body: bad,
  });
  assertEquals(rejected.status, 400);
  assertEquals((await json<{ error: { code: string } }>(rejected)).error.code, "bad_request");

  assertEquals((await send(`/api/attachments/${attachment.id}`, "DELETE")).status, 200);
  assertEquals((await app.request(`/api/attachments/${attachment.id}/file`)).status, 404);
});

/**
 * Die Hälfte des nativen Auswahldialogs, die sich ohne Bildschirm prüfen lässt:
 * Aus einem **Pfad** wird ein Anhang. Der Dialog selbst (`pickImageFiles`)
 * bleibt außen vor — er öffnet ein Fenster des Betriebssystems.
 */
Deno.test("Anhang aus einem Pfad: MIME kommt aus der Endung, Fremdformat fliegt raus", async () => {
  const attachments = await import("../src/repo/attachments.ts");
  const created = await json<{ id: number }>(await send("/api/tasks", "POST", { title: "Aus Datei" }));

  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAX+d1LQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  const source = `${dataDir}/Bildschirmfoto 2026-08-24.png`;
  await Deno.writeFile(source, png);

  const stored = await attachments.importFile(created.id, source);
  // Der Dialog liefert keinen MIME-Typ — die Endung muss reichen.
  assertEquals(stored.mime, "image/png");
  assertEquals(stored.bytes, png.byteLength);
  // Der Originalname bleibt als Anzeigetext erhalten, nicht als Pfad.
  assertEquals(stored.name, "Bildschirmfoto 2026-08-24.png");

  const served = await app.request(`/api/attachments/${stored.id}/file`);
  assertEquals(served.status, 200);
  assertEquals(new Uint8Array(await served.arrayBuffer()).byteLength, png.byteLength);

  const text = `${dataDir}/notiz.txt`;
  await Deno.writeTextFile(text, "kein Bild");
  await assertRejects(() => attachments.importFile(created.id, text), Error, "Nur Bilder");

  await assertRejects(() => attachments.importFile(created.id, `${dataDir}/gibtsnicht.png`));
});

Deno.test("Projekte: anlegen, umbenennen, sortieren", async () => {
  const first = await json<{ id: number }>(await send("/api/projects", "POST", { name: "Eins" }));
  const second = await json<{ id: number }>(
    await send("/api/projects", "POST", { name: "Zwei", color: "green" }),
  );

  const renamed = await json<{ name: string }>(
    await send(`/api/projects/${first.id}`, "PATCH", { name: "Eins neu" }),
  );
  assertEquals(renamed.name, "Eins neu");

  const ordered = await json<{ id: number }[]>(
    await send("/api/projects/order", "POST", { ids: [second.id, first.id] }),
  );
  assertEquals(ordered[0].id, second.id);

  // Eine unbekannte ID darf die Reihenfolge nicht durcheinanderbringen.
  assertEquals((await send("/api/projects/order", "POST", { ids: [999999] })).status, 400);

  // Ungültige Farbe fällt schon im Schema aus.
  assertEquals((await send("/api/projects", "POST", { name: "X", color: "neon" })).status, 400);
});

Deno.test("/api/today und /api/stats prüfen das Datum", async () => {
  assertEquals((await app.request("/api/today?date=24.08.2026")).status, 400);
  assertEquals((await app.request("/api/today?date=2026-08-24")).status, 200);
  // Ohne Datum gilt heute — der Endpunkt ist dann trotzdem gültig.
  assertEquals((await app.request("/api/stats")).status, 200);
});

Deno.test("/api/analytics klemmt den Zeitraum und liefert die volle Reihe", async () => {
  // Zu klein, zu groß, kein Zahl — alles drei fällt im Schema aus, nicht erst
  // in der Abfrage.
  assertEquals((await app.request("/api/analytics?days=3")).status, 400);
  assertEquals((await app.request("/api/analytics?days=99999")).status, 400);
  assertEquals((await app.request("/api/analytics?days=viele")).status, 400);

  const response = await app.request("/api/analytics?date=2026-08-24&days=30");
  assertEquals(response.status, 200);
  const body = await json<{
    from: string;
    to: string;
    daily: unknown[];
    calendar: unknown[];
    weekday: unknown[];
    leadTime: { buckets: unknown[] };
  }>(response);
  assertEquals(body.from, "2026-07-26");
  assertEquals(body.to, "2026-08-24");
  // Die Reihe ist immer vollständig — auch an Tagen ohne Bewegung.
  assertEquals(body.daily.length, 30);
  assertEquals(body.calendar.length, 371);
  assertEquals(body.weekday.length, 7);
  assertEquals(body.leadTime.buckets.length, 7);
});

Deno.test("Einstellungen: unbekannter Schlüssel und ungültiger Wert werden abgelehnt", async () => {
  assertEquals((await send("/api/settings/quatsch", "PUT", { value: 1 })).status, 400);
  assertEquals((await send("/api/settings/dailyGoal", "PUT", { value: 999 })).status, 400);
  assertEquals((await send("/api/settings/dailyGoal", "PUT", { value: 7 })).status, 200);
  const all = await json<{ dailyGoal: number }>(await app.request("/api/settings"));
  assertEquals(all.dailyGoal, 7);
});

Deno.test("Unbekannter API-Pfad bleibt JSON, keine index.html", async () => {
  const response = await app.request("/api/gibtsnicht");
  assertEquals(response.status, 404);
  assertNotEquals(response.headers.get("content-type")?.includes("text/html"), true);
});

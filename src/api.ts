/**
 * Der gesamte HTTP-Teil an einer Stelle: Hono-Router, Validierung gegen die
 * Schemata aus `shared/schema.ts`, eine Fehlerform, ein Typ-Export für den
 * Client.
 *
 * Der Gewinn steckt in `export type AppType`: `ui/src/api.ts` erzeugt daraus
 * mit `hc<AppType>()` einen Client, der Pfade, Methoden, Bodies *und*
 * Antworttypen kennt — ohne Codegenerierung und ohne ein einziges
 * `as Task[]`.
 */
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { serveDir, serveFile } from "@std/http/file-server";
import { basename, dirname, join } from "@std/path";
import { z, type ZodType } from "zod";

import {
  AnalyticsQuery,
  ExportRequest,
  IsoDate,
  NewProject,
  NewSubtask,
  NewTask,
  type PickResult,
  ProjectPatch,
  SettingKeyEnum,
  SETTINGS,
  SubtaskPatch,
  TaskMove,
  TaskPatch,
  TaskQuery,
} from "../shared/schema.ts";
import { AppError, badRequest, toErrorBody } from "../shared/errors.ts";
import * as tasks from "./repo/tasks.ts";
import * as projects from "./repo/projects.ts";
import * as subtasks from "./repo/subtasks.ts";
import * as attachments from "./repo/attachments.ts";
import * as agenda from "./repo/agenda.ts";
import * as analytics from "./repo/analytics.ts";
import { allSettings, readSetting, writeSettingChecked } from "./settings.ts";
import { backupTo, databasePath } from "./db.ts";
import { pickImageFiles, pickSaveFile, revealPath, uniquePath } from "./files.ts";
import { APP_NAME, attachmentDir, dataDir, logPath } from "./paths.ts";
import { flushLog, log } from "./log.ts";
import { guard } from "./security.ts";
import { exportCsv, exportFileName } from "./export.ts";
import { FOCUS_HEADER, FOCUS_PATH, INSTANCE_SECRET } from "./instance.ts";
import { hasBrowserWindow } from "./window.ts";
import { BUILD_DATE, COMMIT, VERSION } from "./version.ts";

const UI_DIR = join(import.meta.dirname ?? ".", "..", "ui", "dist");

/**
 * Letzte Verteidigungslinie. Bewusst als **Header** und nicht als `<meta>` in
 * der index.html: Im Entwicklungslauf liefert Vite das HTML aus, dort würde
 * eine Meta-CSP die HMR-Verbindung und die Refresh-Skripte blockieren.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React-`style`-Attribute
  // `blob:` ist für die Bildanhänge nötig — die Lupe zeigt sie aus einem Blob.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export interface ApiOptions {
  /** Kann im Test auf `false` gesetzt werden, damit die Ausgabe ruhig bleibt. */
  requestLog?: boolean;
  /** HTML-Nachbearbeitung — im Betrieb das Einsetzen des App-Tokens. */
  transformHtml?: (html: string) => string;
  /** Zweitstart holt das vorhandene Fenster nach vorn (siehe `src/instance.ts`). */
  onFocusRequest?: () => void;
}

/**
 * `zValidator` antwortet von sich aus mit einer eigenen ZodError-Form. Damit es
 * **eine** Fehlerform gibt, wird der Fehler stattdessen geworfen und von
 * `app.onError()` übersetzt.
 */
function check<T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) throw badRequest("Eingabe ungültig", result.error.issues);
  });
}

/** Pfad-`:id` kommt als String an — genau eine Stelle wandelt und prüft. */
const IdParam = z.object({ id: z.coerce.number().int().positive() });

/**
 * „Heute“ kommt vom Client. Auf demselben Rechner ist das dieselbe Uhr — aber
 * der Server soll bei einem Tageswechsel um Mitternacht nicht anders rechnen
 * als die Oberfläche, die das Datum ohnehin schon anzeigt.
 */
const DateQuery = z.object({ date: IsoDate.default(() => new Date().toISOString().slice(0, 10)) });

export function createApp(options: ApiOptions = {}) {
  const app = new Hono();

  if (options.requestLog !== false) app.use("*", honoLogger((message) => log.debug(message.trim())));

  // Genau eine Fehlerform für die ganze App — die UI hat damit eine Stelle zum
  // Anzeigen, und keine geworfene Exception ist mehr ein 500 ohne Body.
  app.onError((error, c) => {
    const { body, status } = toErrorBody(error);
    if (status >= 500) log.error(`${c.req.method} ${c.req.path}: ${body.error.message}`);
    else log.warn(`${c.req.method} ${c.req.path}: ${body.error.code} — ${body.error.message}`);
    return c.json(body, status as 400);
  });

  app.use("/api/*", guard);

  /**
   * Bewusst **außerhalb** von `/api/*` und damit außerhalb der Token-Prüfung:
   * Der zweite Prozess kennt das App-Token nicht. Er weist sich stattdessen mit
   * dem Geheimnis aus der Lockdatei aus, die nur das eigene Benutzerkonto lesen
   * kann.
   */
  app.post(FOCUS_PATH, (c) => {
    if (c.req.header(FOCUS_HEADER) !== INSTANCE_SECRET) {
      throw new AppError("forbidden", "Falsches Instanz-Geheimnis");
    }
    options.onFocusRequest?.();
    return c.json({ ok: true } as const);
  });

  const routes = app
    .get("/api/health", (c) => c.json({ ok: true } as const))
    .get("/api/info", (c) =>
      c.json({
        name: APP_NAME,
        version: VERSION,
        buildDate: BUILD_DATE,
        commit: COMMIT,
        databasePath: databasePath(),
        attachmentDir: attachmentDir(),
        logPath: logPath(),
        deno: Deno.version.deno,
        desktop: hasBrowserWindow,
        // Im Browserlauf (`deno task api` + Vite) wäre ein Dialog auf der
        // Serverseite falsch — er erschiene auf dem Rechner des Servers.
        // Dort tut das Dateifeld genau das Richtige, also bleibt es dabei.
        canPickFiles: hasBrowserWindow,
      }))
    // ── Aufgaben ───────────────────────────────────────────────────────────
    /**
     * Eine **Seite**, nicht die ganze Liste: Filter, Suche, Sortierung und
     * Seitengröße stehen im validierten Query (`TaskQuery`), gezählt und
     * geschnitten wird in SQL. Der Export unten nimmt denselben Query — aber
     * ohne Seitengrenze.
     */
    .get("/api/tasks", check("query", TaskQuery), (c) => c.json(tasks.page(c.req.valid("query"))))
    /** Alle Treffer ohne Seitengrenze — das Board zeigt Spalten, keine Seiten. */
    .get("/api/tasks/all", check("query", TaskQuery), (c) => c.json(tasks.all(c.req.valid("query"))))
    .post("/api/tasks", check("json", NewTask), (c) => c.json(tasks.create(c.req.valid("json")), 201))
    .get(
      "/api/tasks/:id",
      check("param", IdParam),
      (c) => c.json(tasks.detail(c.req.valid("param").id)),
    )
    .patch(
      "/api/tasks/:id",
      check("param", IdParam),
      check("json", TaskPatch),
      (c) => c.json(tasks.update(c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/api/tasks/:id/toggle",
      check("param", IdParam),
      (c) => c.json(tasks.toggleDone(c.req.valid("param").id)),
    )
    .post(
      "/api/tasks/:id/doing",
      check("param", IdParam),
      (c) => c.json(tasks.toggleDoing(c.req.valid("param").id)),
    )
    /** Verschieben im Board: Zielspalte plus Zielplatz innerhalb der Spalte. */
    .post(
      "/api/tasks/:id/move",
      check("param", IdParam),
      check("json", TaskMove),
      (c) => c.json(tasks.move(c.req.valid("param").id, c.req.valid("json"))),
    )
    .delete("/api/tasks/:id", check("param", IdParam), (c) => {
      tasks.remove(c.req.valid("param").id);
      return c.json({ ok: true } as const);
    })
    // ── Unterpunkte ────────────────────────────────────────────────────────
    .post(
      "/api/tasks/:id/subtasks",
      check("param", IdParam),
      check("json", NewSubtask),
      (c) => {
        const id = c.req.valid("param").id;
        tasks.get(id); // 404, bevor ein Unterpunkt ins Leere zeigt
        return c.json(subtasks.create(id, c.req.valid("json")), 201);
      },
    )
    .post(
      "/api/tasks/:id/subtasks/order",
      check("param", IdParam),
      check("json", z.object({ ids: z.array(z.number().int().positive()) })),
      (c) => c.json(subtasks.reorder(c.req.valid("param").id, c.req.valid("json").ids)),
    )
    .patch(
      "/api/subtasks/:id",
      check("param", IdParam),
      check("json", SubtaskPatch),
      (c) => c.json(subtasks.update(c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/api/subtasks/:id/toggle",
      check("param", IdParam),
      (c) => c.json(subtasks.toggle(c.req.valid("param").id)),
    )
    .delete("/api/subtasks/:id", check("param", IdParam), (c) => {
      subtasks.remove(c.req.valid("param").id);
      return c.json({ ok: true } as const);
    })
    // ── Anhänge ────────────────────────────────────────────────────────────
    /**
     * Bild an eine Aufgabe hängen. Multipart, weil das Webview beim Ablegen
     * oder Einfügen ein `File`/`Blob` in der Hand hat und **keinen Pfad** —
     * daran führt kein Weg vorbei. Der Server nimmt die Bytes und legt sie
     * unter einem selbst gewählten Namen ab (`src/repo/attachments.ts`).
     */
    .post("/api/tasks/:id/attachments", check("param", IdParam), async (c) => {
      const id = c.req.valid("param").id;
      tasks.get(id);
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw badRequest('Feld "file" fehlt');
      const stored = await attachments.store(id, {
        name: file.name,
        mime: file.type,
        data: new Uint8Array(await file.arrayBuffer()),
      });
      return c.json(stored, 201);
    })
    /**
     * Bilder über den **nativen** Auswahldialog. Im Webview öffnet ein
     * Dateifeld nichts (Begründung in `src/dialog.ts`), also übernimmt der
     * Server: Er fragt das Betriebssystem, bekommt Pfade und liest die Dateien
     * selbst. Ohne Fenster — also im Browserlauf — gibt es diesen Weg nicht;
     * dort bleibt es beim Dateifeld.
     */
    .post("/api/tasks/:id/attachments/pick", check("param", IdParam), async (c) => {
      const id = c.req.valid("param").id;
      tasks.get(id);
      const paths = await pickImageFiles();
      // Der Dialog gehört einem anderen Prozess (`osascript` & Co.) — danach
      // ist nicht unser Fenster vorn. Dieselbe Brücke, die der Zweitstart
      // benutzt, holt es zurück.
      options.onFocusRequest?.();
      // Nichts zurück heißt abgebrochen — der häufigste Ausgang eines
      // Dateidialogs. Die Oberfläche meldet dann bewusst gar nichts.
      if (paths.length === 0) {
        return c.json({ canceled: true, attachments: [], rejected: [] } satisfies PickResult);
      }
      const stored: PickResult["attachments"] = [];
      const rejected: string[] = [];
      // Eine unpassende Datei darf die anderen nicht mitreißen: Wer fünf
      // Bilder und versehentlich ein PDF auswählt, will die fünf Bilder.
      for (const path of paths) {
        try {
          stored.push(await attachments.importFile(id, path));
        } catch (error) {
          log.warn(`Anhang übersprungen: ${path} (${error})`);
          rejected.push(basename(path));
        }
      }
      return c.json({ canceled: false, attachments: stored, rejected } satisfies PickResult);
    })
    /**
     * Das Bild selbst. `<img src>` kann keine Header setzen — deshalb erlaubt
     * `guard` das Token auch als Suchparameter, und `ui/src/api.ts` baut die
     * URL an genau einer Stelle.
     */
    .get("/api/attachments/:id/file", check("param", IdParam), (c) => {
      const entry = attachments.get(c.req.valid("param").id);
      return serveFile(c.req.raw, entry.path).then((response) => {
        // Der Inhalt ist unveränderlich (die ID wird nie neu belegt) — damit
        // holt das Webview ein Bild nicht bei jedem Rendern erneut.
        response.headers.set("cache-control", "private, max-age=31536000, immutable");
        response.headers.set("content-type", entry.mime);
        // Bilder aus fremder Quelle nie im Browserkontext ausführen lassen:
        // Eine SVG mit Skript wäre sonst genau das.
        response.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
        response.headers.set("x-content-type-options", "nosniff");
        return response;
      });
    })
    .delete("/api/attachments/:id", check("param", IdParam), (c) => {
      attachments.remove(c.req.valid("param").id);
      return c.json({ ok: true } as const);
    })
    // ── Projekte ───────────────────────────────────────────────────────────
    .get("/api/projects", (c) => c.json(projects.all()))
    .post(
      "/api/projects",
      check("json", NewProject),
      (c) => c.json(projects.create(c.req.valid("json")), 201),
    )
    .patch(
      "/api/projects/:id",
      check("param", IdParam),
      check("json", ProjectPatch),
      (c) => c.json(projects.update(c.req.valid("param").id, c.req.valid("json"))),
    )
    .post(
      "/api/projects/order",
      check("json", z.object({ ids: z.array(z.number().int().positive()) })),
      (c) => c.json(projects.reorder(c.req.valid("json").ids)),
    )
    /** Die Aufgaben bleiben stehen und landen im Eingang (`ON DELETE SET NULL`). */
    .delete("/api/projects/:id", check("param", IdParam), (c) => {
      projects.remove(c.req.valid("param").id);
      return c.json({ ok: true } as const);
    })
    // ── Tag und Auswertung ─────────────────────────────────────────────────
    .get("/api/today", check("query", DateQuery), (c) => c.json(agenda.today(c.req.valid("query").date)))
    .get("/api/stats", check("query", DateQuery), (c) => c.json(agenda.stats(c.req.valid("query").date)))
    /**
     * Die große Auswertung. Ein Endpunkt für alle Diagramme der Seite: Sechs
     * einzelne Abfragen wären sechs Ladezustände auf einer Seite, die als
     * Ganzes gelesen wird — und sechs Gelegenheiten, dass zwei Diagramme
     * verschiedene Zeiträume zeigen.
     */
    .get("/api/analytics", check("query", AnalyticsQuery), (c) => {
      const { date, days } = c.req.valid("query");
      return c.json(analytics.analytics(date, days));
    })
    // ── Einstellungen ──────────────────────────────────────────────────────
    .get("/api/settings", (c) => c.json(allSettings()))
    .put(
      "/api/settings/:key",
      check("param", z.object({ key: SettingKeyEnum })),
      check("json", z.object({ value: z.unknown() })),
      (c) => {
        const { key } = c.req.valid("param");
        const parsed = SETTINGS[key].safeParse(c.req.valid("json").value);
        if (!parsed.success) throw badRequest(`Wert für "${key}" ungültig`, parsed.error.issues);
        return c.json({ key, value: writeSettingChecked(key, parsed.data) });
      },
    )
    // ── Export ─────────────────────────────────────────────────────────────
    /**
     * Exportiert genau das, was die Liste zeigt — derselbe `TaskQuery`, der sie
     * filtert. Alles andere ist für den Anwender überraschend.
     */
    .post("/api/export", check("json", ExportRequest), async (c) => {
      const { query } = c.req.valid("json");
      const suggested = exportFileName(APP_NAME);
      const chosen = await pickSaveFile(suggested, readSetting("lastDir") || dataDir());
      const target = chosen ?? join(dataDir(), "exports", suggested);
      return c.json(await exportCsv(tasks.all(query), projects.all(), target));
    })
    // ── Wartung ────────────────────────────────────────────────────────────
    .post("/api/backup", async (c) => {
      const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      const suggested = `${APP_NAME}-${stamp}.db`;
      const chosen = await pickSaveFile(suggested, join(dataDir(), "backups"));
      const target = uniquePath(chosen ?? join(dataDir(), "backups", suggested));
      await Deno.mkdir(dirname(target), { recursive: true });
      return c.json({ path: backupTo(target) });
    })
    /** „Erledigte aufräumen“: alles, was länger als `days` Tage fertig ist. */
    .post(
      "/api/maintenance/purge-done",
      check("json", z.object({ days: z.number().int().min(0).max(3650) })),
      async (c) => {
        const cutoff = new Date(Date.now() - c.req.valid("json").days * 86_400_000).toISOString();
        const removed = tasks.removeDoneBefore(cutoff);
        const orphans = await attachments.pruneOrphans();
        return c.json({ removed, orphans });
      },
    )
    .get("/api/log", async (c) => {
      flushLog();
      const path = logPath();
      const text = await Deno.readTextFile(path).catch(() => "");
      const lines = text.split("\n").filter(Boolean).slice(-300);
      return c.json({ path, lines });
    })
    .post("/api/log/reveal", async (c) => {
      flushLog();
      await revealPath(logPath());
      return c.json({ ok: true } as const);
    })
    .post("/api/reveal", check("json", z.object({ path: z.string().min(1) })), async (c) => {
      await revealPath(c.req.valid("json").path);
      return c.json({ ok: true } as const);
    });

  // Statik zuletzt: alles, was keine API-Route war, kommt aus `ui/dist`.
  app.notFound(async (c) => {
    const url = new URL(c.req.url);
    if (url.pathname.startsWith("/api/")) {
      return c.json({ error: { code: "not_found", message: `Kein Endpunkt: ${url.pathname}` } }, 404);
    }
    // Die index.html geht **nicht** über serveDir: sie muss durch
    // `transformHtml` laufen, sonst fehlt das App-Token im Fenster und jede
    // API-Anfrage der UI bekäme 403.
    const wantsIndex = url.pathname === "/" || url.pathname === "/index.html";
    if (!wantsIndex) {
      const response = await serveDir(c.req.raw, { fsRoot: UI_DIR, quiet: true });
      // Pfade mit Punkt sind Dateien: fehlt die Datei, bleibt es bei 404.
      if (response.status !== 404 || url.pathname.includes(".")) return response;
    }
    const html = await Deno.readTextFile(join(UI_DIR, "index.html")).catch(() => null);
    if (html === null) return c.text("ui/dist fehlt — `deno task ui:build` ausführen", 404);
    return c.html(options.transformHtml ? options.transformHtml(html) : html, 200, {
      "content-security-policy": CSP,
    });
  });

  return { app, routes };
}

/** Nur für den Typ-Export gedacht — der Client hängt nicht an der Instanz. */
export type AppType = ReturnType<typeof createApp>["routes"];

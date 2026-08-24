/**
 * Einzige Quelle der Wahrheit für alle Daten, die die HTTP-Grenze überqueren.
 *
 * Regel: Ein Schema pro Ressource, der TS-Typ wird daraus abgeleitet (`z.infer`).
 * Server *und* UI importieren aus dieser Datei — es gibt keinen zweiten Ort, an
 * dem eine `Task` definiert wird, und keinen `as Task[]`-Cast.
 */
import { z } from "zod";

/** ISO-Datum ohne Zeit (`2026-08-24`) — SQLite speichert das als TEXT. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss YYYY-MM-DD sein");

/** Zeitstempel als ISO-8601 in UTC — sortiert lexikografisch korrekt. */
export const IsoStamp = z.string().min(20);

// ── Projekte ────────────────────────────────────────────────────────────────

/**
 * Farbwahl bewusst als geschlossene Liste von **Token-Namen**, nicht als
 * Hex-Wert: Ein gespeichertes `#3b82f6` bricht den Dark Mode, ein Tokenname
 * folgt ihm. Die Zuordnung Name → CSS-Variable steht in `ui/src/colors.ts`.
 */
export const ProjectColor = z.enum([
  "brand",
  "accent",
  "green",
  "amber",
  "red",
  "violet",
  "teal",
  "pink",
  "slate",
]);
export type ProjectColor = z.infer<typeof ProjectColor>;

export const Project = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1, "Name darf nicht leer sein").max(80),
  color: ProjectColor,
  /** Manuelle Reihenfolge in der Seitenleiste. */
  position: z.number().int(),
  archived: z.boolean(),
  /** Offene Aufgaben (alles außer `done`) — die Seitenleiste zeigt sie als Zähler. */
  open: z.number().int().nonnegative(),
});
export type Project = z.infer<typeof Project>;

export const NewProject = z.object({
  name: Project.shape.name,
  color: ProjectColor.default("brand"),
});
export type NewProject = z.infer<typeof NewProject>;

export const ProjectPatch = z.object({
  name: Project.shape.name.optional(),
  color: ProjectColor.optional(),
  archived: z.boolean().optional(),
  position: z.number().int().optional(),
});
export type ProjectPatch = z.infer<typeof ProjectPatch>;

// ── Aufgaben ────────────────────────────────────────────────────────────────

/**
 * Der Lebenslauf einer Aufgabe — vier Zustände, keiner mehr:
 *
 * - `backlog` — irgendwann, ohne Terminzusage („Sammelbecken“)
 * - `todo`    — eingeplant, wartet
 * - `doing`   — **daran arbeite ich gerade** (die Frage, die der Tag stellt)
 * - `done`    — fertig, mit Zeitstempel für die Tagesauswertung
 */
export const TaskStatus = z.enum(["backlog", "todo", "doing", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Die vier Spalten des Boards in Anzeigereihenfolge — an genau einer Stelle. */
export const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "Geplant" },
  { status: "doing", label: "In Arbeit" },
  { status: "done", label: "Erledigt" },
];

/** 0 = ohne, 1 = niedrig, 2 = mittel, 3 = hoch. Zahl, damit SQL sortieren kann. */
export const Priority = z.number().int().min(0).max(3);

export const Subtask = z.object({
  id: z.number().int().positive(),
  taskId: z.number().int().positive(),
  title: z.string().min(1).max(300),
  done: z.boolean(),
  position: z.number().int(),
});
export type Subtask = z.infer<typeof Subtask>;

export const Attachment = z.object({
  id: z.number().int().positive(),
  taskId: z.number().int().positive(),
  /** Ursprünglicher Dateiname — nur zur Anzeige, nie als Pfad verwendet. */
  name: z.string(),
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  createdAt: IsoStamp,
});
export type Attachment = z.infer<typeof Attachment>;

/** Bildformate, die das Webview zuverlässig darstellt. */
export const ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
] as const;

export const Task = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1, "Titel darf nicht leer sein").max(300),
  notes: z.string().max(20_000),
  status: TaskStatus,
  priority: Priority,
  /** `null` heißt „ohne Termin“ — im Backlog der Normalfall. */
  due: IsoDate.nullable(),
  projectId: z.number().int().positive().nullable(),
  /** Manuelle Reihenfolge innerhalb einer Board-Spalte. */
  position: z.number().int(),
  createdAt: IsoStamp,
  updatedAt: IsoStamp,
  /** Wann zuletzt auf `doing` gestellt — speist „seit 2 Std. in Arbeit“. */
  startedAt: IsoStamp.nullable(),
  /** Wann erledigt — Grundlage der Tagesauswertung. */
  doneAt: IsoStamp.nullable(),
  /** Mitgelieferte Kennzahlen, damit die Liste nicht pro Zeile nachfragt. */
  subtaskTotal: z.number().int().nonnegative(),
  subtaskDone: z.number().int().nonnegative(),
  attachmentCount: z.number().int().nonnegative(),
});
export type Task = z.infer<typeof Task>;

/** Aufgabe samt Unterpunkten und Anhängen — die Detailansicht. */
export const TaskDetail = Task.extend({
  subtasks: z.array(Subtask),
  attachments: z.array(Attachment),
});
export type TaskDetail = z.infer<typeof TaskDetail>;

export const NewTask = z.object({
  title: Task.shape.title,
  notes: z.string().max(20_000).nullish().transform((value) => value ?? ""),
  status: TaskStatus.default("todo"),
  priority: Priority.nullish().transform((value) => value ?? 0),
  due: IsoDate.nullish().transform((value) => value ?? null),
  projectId: z.number().int().positive().nullish().transform((value) => value ?? null),
  /** Unterpunkte direkt beim Anlegen — die Schnellerfassung nutzt das. */
  subtasks: z.array(z.string().min(1).max(300)).default([]),
});
export type NewTask = z.infer<typeof NewTask>;

/**
 * Teiländerung. `undefined` heißt „nicht anfassen“, `null` bei `due`/`projectId`
 * heißt „leeren“ — die Unterscheidung ist der Grund, warum hier `nullish()` und
 * nicht `optional()` steht.
 */
export const TaskPatch = z.object({
  title: Task.shape.title.optional(),
  notes: z.string().max(20_000).optional(),
  status: TaskStatus.optional(),
  priority: Priority.optional(),
  due: IsoDate.nullish(),
  projectId: z.number().int().positive().nullish(),
  position: z.number().int().optional(),
});
export type TaskPatch = z.infer<typeof TaskPatch>;

export const NewSubtask = z.object({ title: Subtask.shape.title });
export type NewSubtask = z.infer<typeof NewSubtask>;

export const SubtaskPatch = z.object({
  title: Subtask.shape.title.optional(),
  done: z.boolean().optional(),
  position: z.number().int().optional(),
});
export type SubtaskPatch = z.infer<typeof SubtaskPatch>;

/** Verschieben im Board: Zielspalte plus Zielplatz innerhalb der Spalte. */
export const TaskMove = z.object({
  status: TaskStatus,
  /** 0 = ganz oben. Der Server rechnet daraus die Positionen der Spalte neu. */
  index: z.number().int().nonnegative(),
});
export type TaskMove = z.infer<typeof TaskMove>;

// ── Filter, Sortierung, Seiten ──────────────────────────────────────────────

export const TaskSort = z.enum(["manual", "due", "priority", "title", "created", "updated"]);
export type TaskSort = z.infer<typeof TaskSort>;

export const SortDir = z.enum(["asc", "desc"]);
export type SortDir = z.infer<typeof SortDir>;

/**
 * Optionaler Filterwert: `""` heißt „nicht gesetzt“.
 *
 * Bewusst kein `null` und kein `undefined` — beides überlebt die Runde durch
 * URL und `URLSearchParams` nicht unversehrt. Die leere Zeichenkette überlebt
 * sie immer und ist in der Ansicht genau das, was in einem leeren Feld steht.
 */
const optionalFilter = <T extends z.ZodType>(schema: T) => z.union([z.literal(""), schema]).default("");

/**
 * Ja/Nein als Suchparameter. **Nicht** `z.coerce.boolean()`: das macht aus der
 * Zeichenkette `"false"` ein `true` (jede nichtleere Zeichenkette ist truthy) —
 * ein Filter, der sich nicht mehr abschalten lässt, sobald er einmal in der URL
 * steht.
 */
const boolFilter = z.union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("")])
  .default(false)
  .transform((value) => value === true || value === "true");

/**
 * Der Zustandsfilter der Liste: die vier echten Zustände, dazu zwei
 * Sammelwerte.
 *
 * `"open"` ist bewusst **kein** eigener Zustand einer Aufgabe, sondern nur ein
 * Filter: „alles, was noch Arbeit ist“. Als abgeleiteter Filter bleibt er
 * automatisch richtig, wenn später ein fünfter Zustand dazukommt — als
 * gespeicherter Zustand wäre er ein zweiter Ort für dieselbe Wahrheit.
 */
export const TaskStatusFilter = z.union([z.literal(""), z.literal("open"), TaskStatus]).default("");
export type TaskStatusFilter = z.infer<typeof TaskStatusFilter>;

export const PAGE_SIZES = [25, 50, 100, 250] as const;

/**
 * Alles, was die sichtbare Aufgabenmenge bestimmt — identisch als
 * Suchparameter im Router und als Query-Parameter der API. Gefiltert,
 * durchsucht, sortiert und geblättert wird auf dem **Server**
 * (`src/repo/tasks.ts`).
 */
export const TaskQuery = z.object({
  /** `""` = alle Zustände, `"open"` = alles außer erledigt, sonst genau einer. */
  status: TaskStatusFilter,
  /** Volltext über Titel, Notizen und Unterpunkte — über alle Seiten hinweg. */
  search: z.string().default(""),
  /** `""` = alle Projekte, `0` = ohne Projekt (Eingang). */
  projectId: optionalFilter(z.coerce.number().int().min(0)),
  minPriority: optionalFilter(z.coerce.number().int().min(0).max(3)),
  dueFrom: optionalFilter(IsoDate),
  dueTo: optionalFilter(IsoDate),
  /** `true` = nur Aufgaben ohne Termin. */
  noDue: boolFilter,
  sort: TaskSort.default("manual"),
  dir: SortDir.default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(1000).default(50),
});
export type TaskQuery = z.infer<typeof TaskQuery>;

/** Vorgabewerte an genau einer Stelle — Links schicken nie ein halbes Query. */
export const DEFAULT_TASK_QUERY: TaskQuery = TaskQuery.parse({});

/**
 * `total` bezieht sich auf **alle** Treffer des Filters, nicht auf `rows` —
 * sonst zeigt die Fußzeile die Zahl der sichtbaren 50 Zeilen.
 */
export const TaskPage = z.object({
  rows: z.array(Task),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});
export type TaskPage = z.infer<typeof TaskPage>;

// ── Tagesansicht und Auswertung ─────────────────────────────────────────────

/**
 * Alles, was die Tagesansicht braucht, in **einer** Antwort. Vier einzelne
 * Abfragen wären vier Ladezustände, die nacheinander einspringen — die Seite
 * würde beim Öffnen dreimal umbauen.
 */
export const Today = z.object({
  /** Der Tag, auf den sich alles bezieht (Ortszeit des Clients, siehe API). */
  date: IsoDate,
  doing: z.array(Task),
  overdue: z.array(Task),
  today: z.array(Task),
  /** Nächste sieben Tage, ohne „heute“. */
  soon: z.array(Task),
  /** Heute erledigt — auch Aufgaben, deren Termin nicht heute war. */
  doneToday: z.array(Task),
});
export type Today = z.infer<typeof Today>;

export const Stats = z.object({
  open: z.number().int().nonnegative(),
  doing: z.number().int().nonnegative(),
  backlog: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  dueToday: z.number().int().nonnegative(),
  doneToday: z.number().int().nonnegative(),
  doneThisWeek: z.number().int().nonnegative(),
  /** Aufeinanderfolgende Tage mit mindestens einer erledigten Aufgabe. */
  streak: z.number().int().nonnegative(),
  /** Erledigt je Tag, aufsteigend — Grundlage des Balkendiagramms. */
  history: z.array(z.object({ date: IsoDate, done: z.number().int().nonnegative() })),
});
export type Stats = z.infer<typeof Stats>;

// ── Auswertung ──────────────────────────────────────────────────────────────

/**
 * Ein Tag der Zeitreihe. `open` ist der **Bestand am Tagesende**, nicht die
 * Differenz des Tages: Erst damit beantwortet die Kurve die Frage, ob der Berg
 * wächst oder schrumpft — zwei Balken allein tun das nicht.
 */
export const DayPoint = z.object({
  date: IsoDate,
  created: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
});
export type DayPoint = z.infer<typeof DayPoint>;

/** Ein Tag der Kalender-Heatmap — ohne Bestand, die Fläche zeigt nur Aktivität. */
export const CalendarDay = z.object({
  date: IsoDate,
  created: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
});
export type CalendarDay = z.infer<typeof CalendarDay>;

/**
 * Zeitraum der Auswertung. `days` als Fenster **zurück von `date`** und nicht
 * als Von-Bis-Paar: Die Ansicht hat genau vier Schalter (30/90/365/alles), und
 * ein Fenster ist ein Wert im Cache-Schlüssel statt zwei, die auseinanderlaufen.
 */
export const AnalyticsQuery = z.object({
  date: IsoDate.default(() => new Date().toISOString().slice(0, 10)),
  days: z.coerce.number().int().min(7).max(3650).default(90),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;

export const LEAD_BUCKETS = [
  { label: "am selben Tag", max: 1 },
  { label: "1–2 Tage", max: 3 },
  { label: "3–7 Tage", max: 8 },
  { label: "1–2 Wochen", max: 15 },
  { label: "2–4 Wochen", max: 31 },
  { label: "1–3 Monate", max: 91 },
  { label: "über 3 Monate", max: Infinity },
] as const;

export const Analytics = z.object({
  from: IsoDate,
  to: IsoDate,
  days: z.number().int().positive(),
  /** Erster Tag mit Daten überhaupt — die Ansicht schreibt daran „seit …“. */
  firstEver: IsoDate.nullable(),
  totals: z.object({
    created: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    /** Bestand heute, nicht im Zeitraum. */
    open: z.number().int().nonnegative(),
    openStart: z.number().int().nonnegative(),
    createdAll: z.number().int().nonnegative(),
    doneAll: z.number().int().nonnegative(),
    /** Tage mit mindestens einer erledigten Aufgabe. */
    activeDays: z.number().int().nonnegative(),
    bestDay: z.object({ date: IsoDate, done: z.number().int().nonnegative() }).nullable(),
  }),
  daily: z.array(DayPoint),
  /** Kalenderjahr(e) für die Heatmap — immer die letzten 371 Tage. */
  calendar: z.array(CalendarDay),
  monthly: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    created: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
  })),
  /** 0 = Montag, 6 = Sonntag — Reihenfolge wie im deutschen Kalender. */
  weekday: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    created: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
  })),
  /** Zeit von Anlegen bis Erledigen, in Tagen. */
  leadTime: z.object({
    count: z.number().int().nonnegative(),
    median: z.number().nonnegative(),
    average: z.number().nonnegative(),
    p90: z.number().nonnegative(),
    buckets: z.array(z.object({ label: z.string(), count: z.number().int().nonnegative() })),
  }),
  projects: z.array(z.object({
    projectId: z.number().int().positive().nullable(),
    name: z.string(),
    color: ProjectColor,
    created: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
  })),
});
export type Analytics = z.infer<typeof Analytics>;

// ── Einstellungen ───────────────────────────────────────────────────────────

/**
 * Registry der erlaubten Schlüssel. Jeder Wert hat ein Schema — damit ist auch
 * eine per Hand editierte oder aus einer alten Version stammende Zeile in der
 * `settings`-Tabelle nie ein Laufzeitfehler, sondern fällt auf den Vorgabewert.
 */
export const SETTINGS = {
  theme: z.enum(["system", "light", "dark"]).default("system"),
  /** Tagesziel für die Fortschrittsanzeige („4 von 6 erledigt“). */
  dailyGoal: z.number().int().min(1).max(50).default(5),
  /** Erledigte im Board ausblenden — nach ein paar Wochen sonst endlos. */
  hideDoneOlderThanDays: z.number().int().min(1).max(365).default(14),
  lastDir: z.string().default(""),
  /**
   * Fenstergröße und -position. `null` = noch nie gemerkt, dann entscheidet
   * das Betriebssystem. Wird beim Start auf den sichtbaren Bereich geprüft.
   */
  windowBounds: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    x: z.number().int(),
    y: z.number().int(),
  }).nullable().default(null),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<typeof SETTINGS[K]>;
export const SettingKeyEnum = z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]);

export const AppInfo = z.object({
  name: z.string(),
  version: z.string(),
  buildDate: z.string(),
  commit: z.string(),
  databasePath: z.string(),
  attachmentDir: z.string(),
  logPath: z.string(),
  deno: z.string(),
  /**
   * Läuft die Oberfläche im App-Fenster? Im Browserlauf ist das `false`, und
   * die Oberfläche muss sich anders verhalten — siehe `canPickFiles`.
   */
  desktop: z.boolean(),
  /**
   * Kann der Server einen nativen Dateiauswahl-Dialog öffnen? Im Webview
   * öffnet `<input type="file">` nichts, also fragt die Oberfläche hier, ob
   * sie den Knopf „Hinzufügen“ über den Server oder über das Dateifeld führt.
   */
  canPickFiles: z.boolean(),
});
export type AppInfo = z.infer<typeof AppInfo>;

/**
 * Ergebnis des nativen Auswahldialogs. `canceled` ist ausdrücklich kein
 * Fehler und auch nicht dasselbe wie „nichts ausgewählt“: Die Oberfläche
 * meldet dann schlicht nichts, statt „0 Bilder angehängt“ zu behaupten.
 */
export const PickResult = z.object({
  canceled: z.boolean(),
  attachments: z.array(Attachment),
  /** Dateien, die der Dialog geliefert hat, der Server aber ablehnt. */
  rejected: z.array(z.string()),
});
export type PickResult = z.infer<typeof PickResult>;

// ── Export ──────────────────────────────────────────────────────────────────

export const ExportRequest = z.object({
  /** Dieselben Filter wie die Liste — exportiert wird, was man sieht. */
  query: TaskQuery,
});
export type ExportRequest = z.infer<typeof ExportRequest>;

export const ExportResult = z.object({
  path: z.string(),
  rows: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});
export type ExportResult = z.infer<typeof ExportResult>;

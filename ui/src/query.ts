/**
 * Serverzustand: eine Query-Option pro Ressource, an einer Stelle definiert.
 *
 * Damit verschwindet das Muster „jede Mutation gibt die ganze Liste zurück und
 * die Komponente lädt danach alles neu": Mutationen invalidieren gezielt, das
 * Nachladen erledigt Query — inklusive Fehler-, Lade- und Aktualisierungs-
 * zustand, den die UI anzeigen kann.
 */
import { keepPreviousData, QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  Analytics,
  AppInfo,
  Project,
  Stats,
  Task,
  TaskDetail,
  TaskPage,
  TaskQuery,
  Today,
} from "../../shared/schema.ts";
import { client, errorMessage, unwrap } from "./api.ts";
import { toast } from "./store/ui.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      // Desktop-App: das Fenster ist oft lange im Hintergrund, ein Neuladen
      // beim Fokussieren ist hier erwünscht — zwischendurch wird die Liste
      // schnell einmal woanders bearbeitet (zweites Fenster, Neustart).
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Ein Netzwerk- oder Validierungsfehler muss sichtbar werden, nicht
      // stillschweigend den alten Zustand hinterlassen.
      onError: (error) => toast.error(errorMessage(error)),
    },
  },
});

/**
 * Der typisierte Client schickt Suchparameter als **Text** — Zahlen und
 * Wahrheitswerte also ausdrücklich umwandeln. Zurück in `number`/`boolean`
 * kommen sie auf dem Server durch `TaskQuery`, an genau einer Stelle.
 */
function asParams(query: TaskQuery): Record<string, string> {
  return {
    status: query.status,
    search: query.search,
    projectId: String(query.projectId),
    minPriority: String(query.minPriority),
    dueFrom: query.dueFrom,
    dueTo: query.dueTo,
    noDue: String(query.noDue),
    sort: query.sort,
    dir: query.dir,
    page: String(query.page),
    pageSize: String(query.pageSize),
  };
}

/**
 * Eine **Seite** Aufgaben. Der Query steckt im Schlüssel — jede Kombination aus
 * Filter, Sortierung und Seite ist damit ein eigener Cache-Eintrag, und
 * Zurückblättern kostet keine Runde zum Server.
 *
 * `keepPreviousData` ist beim Blättern der ganze Unterschied: Ohne das ist die
 * Liste zwischen zwei Seiten für einen Wimpernschlag leer und springt in der
 * Höhe. Mit dem Flag bleibt die alte Seite stehen, bis die neue da ist.
 */
export const tasksQuery = (query: TaskQuery) =>
  queryOptions({
    queryKey: ["tasks", "page", query] as const,
    queryFn: () => unwrap<TaskPage>(client.api.tasks.$get({ query: asParams(query) })),
    placeholderData: keepPreviousData,
  });

/** Alle Treffer ohne Seitengrenze — das Board zeigt Spalten, keine Seiten. */
export const boardQuery = (query: TaskQuery) =>
  queryOptions({
    queryKey: ["tasks", "board", query] as const,
    queryFn: () => unwrap<Task[]>(client.api.tasks.all.$get({ query: asParams(query) })),
    placeholderData: keepPreviousData,
  });

/** Aufgabe samt Unterpunkten und Anhängen — die Detailansicht. */
export const taskQuery = (id: number) =>
  queryOptions({
    queryKey: ["tasks", "detail", id] as const,
    queryFn: () => unwrap<TaskDetail>(client.api.tasks[":id"].$get({ param: { id: String(id) } })),
  });

export const todayQuery = (date: string) =>
  queryOptions({
    queryKey: ["today", date] as const,
    queryFn: () => unwrap<Today>(client.api.today.$get({ query: { date } })),
  });

export const statsQuery = (date: string) =>
  queryOptions({
    queryKey: ["stats", date] as const,
    queryFn: () => unwrap<Stats>(client.api.stats.$get({ query: { date } })),
  });

/**
 * Die große Auswertung. Zeitraum im Schlüssel: Ein Wechsel von 90 auf 365 Tage
 * ist damit ein eigener Cache-Eintrag, und der Rückweg kostet keine Runde zum
 * Server. `placeholderData` hält die alten Diagramme stehen, solange die neuen
 * laden — sonst springt die Seitenhöhe bei jedem Klick auf den Zeitraum.
 */
export const analyticsQuery = (date: string, days: number) =>
  queryOptions({
    queryKey: ["analytics", date, days] as const,
    queryFn: () => unwrap<Analytics>(client.api.analytics.$get({ query: { date, days: String(days) } })),
    placeholderData: keepPreviousData,
  });

export const projectsQuery = queryOptions({
  queryKey: ["projects"] as const,
  queryFn: () => unwrap<Project[]>(client.api.projects.$get()),
  // Projekte ändern sich selten, stehen aber in jeder Ansicht.
  staleTime: 60_000,
});

export const settingsQuery = queryOptions({
  queryKey: ["settings"] as const,
  queryFn: () => unwrap<Record<string, unknown>>(client.api.settings.$get()),
});

export const infoQuery = queryOptions({
  queryKey: ["info"] as const,
  queryFn: () => unwrap<AppInfo>(client.api.info.$get()),
  staleTime: Infinity,
});

export const logQuery = queryOptions({
  queryKey: ["log"] as const,
  queryFn: () => unwrap<{ path: string; lines: string[] }>(client.api.log.$get()),
  staleTime: 0,
});

/**
 * Nach **jeder** Aufgabenänderung: Liste, Board, Detail, Tagesansicht,
 * Auswertung und die Projektzähler sind betroffen.
 *
 * Ein gezielterer Schnitt wäre möglich, aber falsch: Ein Häkchen ändert den
 * Status, damit die Board-Spalte, damit die Tageszahlen, damit den Zähler in
 * der Seitenleiste. Wer hier nur `["tasks"]` invalidiert, sieht in der
 * Seitenleiste noch die alte Zahl — und sucht den Fehler an der falschen
 * Stelle.
 */
export function invalidateTasks(): void {
  for (const key of [["tasks"], ["today"], ["stats"], ["analytics"], ["projects"]]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

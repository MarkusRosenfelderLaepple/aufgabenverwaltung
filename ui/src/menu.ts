/**
 * Brücke vom **nativen Menü** in die Oberfläche.
 *
 * `src/window.ts` schickt jeden Menüklick per `executeJs` als CustomEvent
 * `appmenu` ins Fenster. Hier wird daraus eine Navigation oder eine Aktion.
 * Die IDs sind der Vertrag zwischen beiden Dateien — beim Ergänzen also dort
 * *und* hier eintragen.
 *
 * Im Browser-Entwicklungslauf gibt es kein natives Menü; alles hier bleibt dann
 * einfach ungenutzt, nichts bricht. Genau deshalb hat jede Menüaktion auch ein
 * Tastenkürzel in `keys.ts`: Im Browser ist das der einzige Weg.
 */
export type MenuAction =
  | "new-task"
  | "search"
  | "palette"
  | "export"
  | "backup"
  | "log"
  | "about"
  | "settings"
  | "shortcuts"
  | "view-today"
  | "view-board"
  | "view-tasks"
  | "view-analytics"
  | "view-projects";

type Handler = (action: MenuAction) => void;

const handlers = new Set<Handler>();

/**
 * Meldet einen Empfänger an. Jeder Empfänger sieht jede Aktion und greift sich
 * heraus, was ihn angeht: `App.tsx` die Navigation und die globalen Dialoge,
 * die jeweils offene Ansicht ihre eigenen Punkte (Export). Rückgabewert ist die
 * Abmeldung — direkt als Aufräumfunktion eines `useEffect` verwendbar.
 *
 * Diese Datei kennt den Router bewusst **nicht**: Ein Import von `router.tsx`
 * wäre ein Kreis (Router → Ansicht → Menü → Router) und kostet die Typinferenz
 * der Suchparameter.
 */
export function onMenuAction(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** Auch aus der Oberfläche auslösbar — der Knopf „Exportieren“ nimmt denselben Weg. */
export function fireMenuAction(action: MenuAction): void {
  for (const handler of handlers) handler(action);
}

let started = false;

/** Einmal beim Start aufrufen (in `main.tsx`). */
export function startMenuBridge(): void {
  if (started) return;
  started = true;
  globalThis.addEventListener("appmenu", (event) => {
    const id = String((event as CustomEvent<{ id?: string }>).detail?.id ?? "");
    if (!id) return;
    for (const handler of handlers) handler(id as MenuAction);
  });
}

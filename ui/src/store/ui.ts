/**
 * Globaler UI-Zustand: Theme, Seitenleiste, Toasts, Overlays, Tastaturcursor.
 *
 * Bewusst *nicht* Serverzustand — der liegt in React Query (`query.ts`). Hier
 * steht nur, was die Oberfläche über sich selbst weiß.
 *
 * Warum das hier und nicht als `useState` im Layout: Die Detailansicht wird von
 * fünf Stellen geöffnet (Klick auf eine Zeile, Board-Karte, Befehlspalette,
 * Tastenkürzel, Toast-Verweis). Ein Callback durch fünf Ebenen zu reichen ist
 * der Weg, auf dem am Ende jede Komponente `onOpenTask` als Prop kennt.
 */
import { Store } from "@tanstack/react-store";

export type Theme = "system" | "light" | "dark";
export type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Bei Fehlern der kopierbare Zusatztext (Feldpfade, Stacktrace). */
  detail?: string;
}

export interface UiState {
  theme: Theme;
  collapsed: boolean;
  toasts: Toast[];
  /** Offene Detailansicht — `null` heißt geschlossen. */
  openTaskId: number | null;
  /** Befehlspalette (⌘K), Tastenkürzel-Übersicht (⌘/), „Über“. */
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  aboutOpen: boolean;
  /**
   * Die Aufgabe unter dem Tastaturcursor (j/k). Sie ist **nicht** dasselbe wie
   * eine offene Detailansicht: Der Cursor bewegt sich durch die Liste, ohne
   * etwas zu öffnen — genau das macht Tastaturbedienung schnell.
   */
  cursorTaskId: number | null;
}

export const uiStore = new Store<UiState>({
  theme: "system",
  collapsed: false,
  toasts: [],
  openTaskId: null,
  paletteOpen: false,
  shortcutsOpen: false,
  aboutOpen: false,
  cursorTaskId: null,
});

const set = (patch: Partial<UiState> | ((state: UiState) => Partial<UiState>)) =>
  uiStore.setState((state) => ({ ...state, ...(typeof patch === "function" ? patch(state) : patch) }));

let nextId = 1;

export const ui = {
  setTheme: (theme: Theme) => set({ theme }),
  setCollapsed: (collapsed: boolean) => set({ collapsed }),
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),

  openTask: (openTaskId: number) => set({ openTaskId, cursorTaskId: openTaskId }),
  closeTask: () => set({ openTaskId: null }),

  setCursor: (cursorTaskId: number | null) => set({ cursorTaskId }),

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  setShortcuts: (shortcutsOpen: boolean) => set({ shortcutsOpen }),
  setAbout: (aboutOpen: boolean) => set({ aboutOpen }),

  /**
   * Escape schließt genau **eine** Ebene, von oben nach unten. Rückgabe sagt,
   * ob etwas geschlossen wurde — der Aufrufer in `keys.ts` entscheidet daran,
   * ob er das Ereignis noch weitergibt (etwa an ein Suchfeld).
   */
  escape(): boolean {
    const state = uiStore.state;
    const layer = state.paletteOpen
      ? { paletteOpen: false }
      : state.shortcutsOpen
      ? { shortcutsOpen: false }
      : state.aboutOpen
      ? { aboutOpen: false }
      : state.openTaskId !== null
      ? { openTaskId: null }
      : null;
    if (!layer) return false;
    set(layer);
    return true;
  },

  dismiss(id: number) {
    set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }));
  },
};

function push(tone: ToastTone, message: string, detail?: string): number {
  const id = nextId++;
  set((state) => ({ toasts: [...state.toasts, { id, tone, message, detail }] }));
  // Fehler bleiben stehen, bis sie weggeklickt werden — sie sind der Fall, den
  // man lesen und weitergeben können muss.
  if (tone !== "error") setTimeout(() => ui.dismiss(id), 3200);
  return id;
}

export const toast = {
  info: (message: string) => push("info", message),
  success: (message: string) => push("success", message),
  error: (message: string, detail?: string) => push("error", message, detail),
};

/** `system` auf die tatsächliche Vorliebe auflösen und ans `<html>` schreiben. */
export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" ||
    (theme === "system" && (globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

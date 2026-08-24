/**
 * Tastaturbedienung — die eine Stelle, an der Tastendrücke zu Aktionen werden.
 *
 * Zwei Regeln, an denen App-Tastenkürzel sonst reihenweise scheitern:
 *
 * 1. **Beim Tippen gilt nichts.** Steht der Fokus in einem Eingabefeld, darf
 *    `d` nicht „in Arbeit“ bedeuten. Ausgenommen sind nur Escape und echte
 *    Tastenkombinationen mit ⌘/Strg — die tippt niemand versehentlich.
 * 2. **`event.preventDefault()` nur bei Treffern.** Wer vorbeugend abbricht,
 *    zerstört Systemkürzel und die Textnavigation.
 *
 * Die Kürzel selbst stehen in `SHORTCUTS` und werden von genau dort auch in der
 * Übersicht (⌘/) angezeigt — eine Liste, keine zwei, die auseinanderlaufen.
 */
import { useEffect, useRef } from "react";

export interface Shortcut {
  keys: string;
  description: string;
  group: "Allgemein" | "Navigation" | "Aufgabe" | "Liste";
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "N", description: "Neue Aufgabe", group: "Allgemein" },
  { keys: "/", description: "Suchen", group: "Allgemein" },
  { keys: "⌘K", description: "Springen zu · Befehlspalette", group: "Allgemein" },
  { keys: "⌘/", description: "Diese Übersicht", group: "Allgemein" },
  { keys: "⌘B", description: "Seitenleiste ein-/ausblenden", group: "Allgemein" },
  { keys: "Esc", description: "Dialog schließen · Auswahl aufheben", group: "Allgemein" },

  { keys: "G H", description: "Heute", group: "Navigation" },
  { keys: "G B", description: "Board", group: "Navigation" },
  { keys: "G A", description: "Alle Aufgaben", group: "Navigation" },
  { keys: "G W", description: "Auswertung", group: "Navigation" },
  { keys: "G P", description: "Projekte", group: "Navigation" },
  { keys: "G E", description: "Einstellungen", group: "Navigation" },

  { keys: "J / ↓", description: "Nächste Aufgabe", group: "Liste" },
  { keys: "K / ↑", description: "Vorige Aufgabe", group: "Liste" },
  { keys: "↵", description: "Aufgabe öffnen", group: "Liste" },

  { keys: "Leer", description: "Erledigt / offen", group: "Aufgabe" },
  { keys: "D", description: "In Arbeit / zurück", group: "Aufgabe" },
  { keys: "E", description: "Bearbeiten", group: "Aufgabe" },
  { keys: "T", description: "Termin auf heute", group: "Aufgabe" },
  { keys: "M", description: "Termin auf morgen", group: "Aufgabe" },
  { keys: "R", description: "Termin entfernen", group: "Aufgabe" },
  { keys: "1 2 3", description: "Priorität niedrig · mittel · hoch", group: "Aufgabe" },
  { keys: "0", description: "Priorität entfernen", group: "Aufgabe" },
  { keys: "⌫", description: "Löschen", group: "Aufgabe" },
];

/**
 * Steht der Fokus in einem Feld, in dem Text entsteht? Radix-Dialoge und
 * `contenteditable` zählen mit — sonst schluckt die Liste Buchstaben, die
 * jemand in ein Notizfeld schreibt.
 */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}

/**
 * Fokussiertes Feld zum Schreiben zwingen.
 *
 * Felder in der Detailansicht schreiben beim Verlassen (`onBlur`). Wird das
 * Feld aber mitsamt Dialog aus dem DOM entfernt — genau das macht Escape —,
 * feuert `blur` nie und die Eingabe ist weg. Deshalb **vor** jedem Schließen
 * ausdrücklich den Fokus abgeben: `blur()` ist synchron, der `onBlur`-Handler
 * läuft also noch, solange die Komponente steht.
 */
export function flushFocus(): void {
  const element = document.activeElement;
  if (element instanceof HTMLElement && isTyping(element)) element.blur();
}

/** ⌘ auf macOS, Strg sonst — nie beide gleichzeitig prüfen müssen. */
export function isMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export type KeyHandler = (event: KeyboardEvent) => boolean | void;

/**
 * Registriert einen Tastaturhörer auf `window`, dessen Rückgabe entscheidet, ob
 * das Ereignis verbraucht ist.
 *
 * Der Ref-Umweg ist Absicht: Ohne ihn müsste jeder Aufrufer seinen Handler in
 * `useCallback` wickeln, sonst würde bei jedem Rendern ab- und neu angemeldet —
 * und ein `keydown`, der genau dazwischen fällt, geht verloren.
 */
export function useKeys(handler: KeyHandler, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      // Wiederholungen beim Halten einer Taste sind für j/k erwünscht, für
      // alles andere nicht — das entscheidet der jeweilige Handler.
      if (ref.current(event) === true) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * Zwei-Tasten-Folgen à la Vim (`g` dann `h`). Zeitfenster, damit ein `g` von
 * vorgestern nicht die nächste Taste umdeutet.
 */
export function createChord(timeoutMs = 900) {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    /** `true`, wenn die Taste als Präfix verbraucht wurde. */
    start(key: string): boolean {
      pending = key;
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending = null;
      }, timeoutMs);
      return true;
    },
    /** Liefert das offene Präfix und löscht es. */
    take(): string | null {
      const value = pending;
      pending = null;
      clearTimeout(timer);
      return value;
    },
    get isPending(): boolean {
      return pending !== null;
    },
  };
}

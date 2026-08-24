/**
 * Die eine Stelle, über die `/` und ⌘F in das Suchfeld der offenen Ansicht
 * springen.
 *
 * Warum ein Modul-Merker und **kein** Store-Eintrag: Es ist eine
 * DOM-Fokusfunktion, kein Zustand — sie löst kein Neuzeichnen aus und gilt nur
 * so lange, wie die Ansicht steht. Im Store wäre sie ein Wert, der bei jedem
 * Ansichtswechsel einen Render auslöst, ohne dass sich etwas Sichtbares ändert.
 */
import { useEffect } from "react";

const registry = { focus: null as (() => void) | null };

/** Ruft das angemeldete Suchfeld nach vorn; ohne Anmeldung passiert nichts. */
export function focusSearch(): void {
  registry.focus?.();
}

/** In der Ansicht aufrufen: meldet ihr Suchfeld an und beim Verlassen wieder ab. */
export function useSearchFocus(focus: () => void): void {
  useEffect(() => {
    registry.focus = focus;
    return () => {
      if (registry.focus === focus) registry.focus = null;
    };
  }, [focus]);
}

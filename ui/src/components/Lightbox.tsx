/**
 * Bild in voller Größe.
 *
 * Bewusst **kein** Radix-Dialog: Der liegt hier über einem anderen Dialog (der
 * Detailansicht), und zwei geschachtelte Fokus-Fallen streiten sich um den
 * Fokus — Escape schließt dann beide auf einmal. Diese Ebene ist reine Anzeige
 * mit drei Tasten, also reicht ein eigenes Overlay mit eigenem Tastaturhörer.
 */
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import type { Attachment } from "../../../shared/schema.ts";
import { attachmentUrl } from "../api.ts";
import { fmt } from "../format.ts";

export function Lightbox(
  { attachments, index, onIndex, onClose }: {
    attachments: Attachment[];
    index: number;
    onIndex: (index: number) => void;
    onClose: () => void;
  },
) {
  const entry = attachments[index];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Nicht weitergeben: Sonst schließt Escape auch die Detailansicht.
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
      if (event.key === "ArrowRight") onIndex((index + 1) % attachments.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + attachments.length) % attachments.length);
    };
    // `capture: true`, damit dieser Hörer **vor** dem globalen aus `keys.ts`
    // greift — die oberste Ebene entscheidet zuerst.
    globalThis.addEventListener("keydown", onKey, { capture: true });
    return () => globalThis.removeEventListener("keydown", onKey, { capture: true });
  }, [index, attachments.length, onIndex, onClose]);

  if (!entry) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-label={entry.name}
      onClick={onClose}
    >
      <header className="lightbox-bar" onClick={(event) => event.stopPropagation()}>
        <span className="grow">{entry.name}</span>
        <span className="tiny muted num">
          {index + 1}/{attachments.length} · {fmt.bytes(entry.bytes)}
        </span>
        <a
          className="btn ghost icon"
          href={attachmentUrl(entry.id)}
          target="_blank"
          rel="noreferrer"
          title="In eigenem Fenster öffnen"
        >
          <ExternalLink size={15} />
        </a>
        <button type="button" className="btn ghost icon" title="Schließen (Esc)" onClick={onClose}>
          <X size={15} />
        </button>
      </header>

      {attachments.length > 1 && (
        <>
          <button
            type="button"
            className="lightbox-nav left"
            title="Voriges Bild (←)"
            onClick={(event) => {
              event.stopPropagation();
              onIndex((index - 1 + attachments.length) % attachments.length);
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="lightbox-nav right"
            title="Nächstes Bild (→)"
            onClick={(event) => {
              event.stopPropagation();
              onIndex((index + 1) % attachments.length);
            }}
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <img
        src={attachmentUrl(entry.id)}
        alt={entry.name}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

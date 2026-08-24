/**
 * Schnellerfassung — die wichtigste Eingabe der App.
 *
 * Anforderung an dieses Feld: **eine Zeile, eine Taste, fertig.** Deshalb
 * - Enter legt an und lässt den Fokus stehen (die nächste Aufgabe kommt sofort),
 * - Zusätze wie `morgen`, `#Projekt`, `!2` werden aus dem Text gelesen
 *   (`quickparse.ts`) und unter dem Feld angezeigt, bevor man abschickt,
 * - Termin, Projekt und Zustand stehen zusätzlich als Bedienelemente daneben,
 *   für alle Fälle, in denen man die Kürzel nicht im Kopf hat.
 *
 * Bewusst **kein** Formularpaket: Es gibt ein Pflichtfeld, eine Regel
 * („nicht leer“) und keinen Absendeknopf, der Zustände bräuchte. TanStack Form
 * ist in der Detailansicht richtig, hier wäre es Zeremonie.
 */
import { useRef, useState } from "react";
import { CornerDownLeft, Plus } from "lucide-react";
import type { NewTask, Project, TaskStatus } from "../../../shared/schema.ts";
import { parseQuickInput } from "../quickparse.ts";
import { isoDay } from "../format.ts";
import { Kbd } from "./atoms.tsx";

export function QuickAdd(
  { projects, onCreate, defaultStatus = "todo", defaultDue = null, defaultProjectId = null, busy, autoFocus }:
    {
      projects: Project[];
      onCreate: (task: NewTask) => void;
      /** Die Ansicht gibt vor, wo eine neue Aufgabe landet (Board-Spalte, Backlog …). */
      defaultStatus?: TaskStatus;
      defaultDue?: string | null;
      defaultProjectId?: number | null;
      busy?: boolean;
      autoFocus?: boolean;
    },
) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState(defaultDue ?? "");
  const [projectId, setProjectId] = useState<number | null>(defaultProjectId);
  const [priority, setPriority] = useState(0);

  const parsed = parseQuickInput(text, projects, isoDay());
  const title = parsed.title;

  const submit = () => {
    if (!title) return;
    onCreate({
      title,
      notes: "",
      status: defaultStatus,
      // Der Text gewinnt gegen die Bedienelemente: Wer „morgen“ tippt, hat
      // gerade eben eine Entscheidung getroffen — das Feld daneben stand schon
      // vorher da.
      due: parsed.due ?? (due || null),
      priority: parsed.priority ?? priority,
      projectId: parsed.projectId !== undefined ? parsed.projectId : projectId,
      subtasks: [],
    });
    setText("");
    // Termin, Projekt und Priorität bleiben stehen: Wer drei Aufgaben für
    // Freitag einträgt, will nicht dreimal Freitag einstellen.
    input.current?.focus();
  };

  return (
    <div className="quick-add">
      <div className="row nowrap" style={{ gap: 8 }}>
        <span className="quick-icon">
          <Plus size={16} />
        </span>
        <input
          ref={input}
          className="input grow quick-input"
          value={text}
          autoFocus={autoFocus}
          placeholder="Neue Aufgabe … (morgen · #Projekt · !2)"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            // Escape leert erst das Feld und gibt den Fokus dann frei — zwei
            // Bedeutungen für eine Taste, aber in der Reihenfolge, die man
            // erwartet.
            if (event.key === "Escape") {
              if (text) {
                event.stopPropagation();
                setText("");
              } else input.current?.blur();
            }
          }}
        />

        <input
          className="input"
          type="date"
          style={{ width: 140 }}
          value={parsed.due ?? due}
          title="Termin"
          onChange={(event) => setDue(event.target.value)}
        />

        <select
          className="select"
          style={{ maxWidth: 160 }}
          value={String(parsed.projectId !== undefined ? parsed.projectId ?? 0 : projectId ?? 0)}
          title="Projekt"
          onChange={(event) => setProjectId(Number(event.target.value) || null)}
        >
          <option value="0">Eingang</option>
          {projects.filter((project) => !project.archived).map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>

        <select
          className="select"
          style={{ width: 108 }}
          value={String(parsed.priority ?? priority)}
          title="Priorität"
          onChange={(event) => setPriority(Number(event.target.value))}
        >
          <option value="0">Prio –</option>
          <option value="1">niedrig</option>
          <option value="2">mittel</option>
          <option value="3">hoch</option>
        </select>

        <button type="button" className="btn primary" disabled={!title || busy} onClick={submit}>
          <CornerDownLeft size={14} /> Anlegen
        </button>
      </div>

      {
        /* Was erkannt wurde, steht **vor** dem Abschicken da — sonst ist die
          Kurzschreibweise ein Ratespiel. */
      }
      {(parsed.hints.length > 0 || (text && !title)) && (
        <p className="tiny muted quick-hints">
          {text && !title
            ? (
              <span style={{ color: "var(--amber)" }}>
                Der Titel fehlt noch — Zusätze allein genügen nicht.
              </span>
            )
            : parsed.hints.join(" · ")}
        </p>
      )}
    </div>
  );
}

/** Kleine Legende für die Kurzschreibweise — steht in der Tastenkürzel-Übersicht. */
export const QUICK_SYNTAX: { token: string; meaning: string }[] = [
  { token: "heute · morgen · übermorgen", meaning: "Termin" },
  { token: "Mo … So", meaning: "nächster Wochentag" },
  { token: "24.8. · 24.08.2026", meaning: "Datum" },
  { token: "+3", meaning: "in drei Tagen" },
  { token: "#Projekt", meaning: "Projekt (Name oder Anfang)" },
  { token: "! · !! · !!!", meaning: "Priorität niedrig · mittel · hoch" },
];

export function QuickSyntaxHelp() {
  return (
    <dl className="kv">
      {QUICK_SYNTAX.map((entry) => (
        <div key={entry.token} style={{ display: "contents" }}>
          <dt>
            <Kbd>{entry.token}</Kbd>
          </dt>
          <dd>{entry.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

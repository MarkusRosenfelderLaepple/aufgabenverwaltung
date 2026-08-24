/**
 * Befehlspalette (⌘K) — ein Feld für alles: Aufgaben finden, Ansicht wechseln,
 * Aufgabe anlegen.
 *
 * Warum selbst gebaut und nicht `cmdk`: Es braucht eine gefilterte Liste, einen
 * Cursor und Enter. Die Bibliothek bringt außerdem eine eigene Fokus- und
 * Portal-Mechanik mit, die sich mit dem Radix-Dialog darunter reibt — und die
 * Suche selbst läuft ohnehin auf dem Server, weil nur er alle Aufgaben kennt und
 * nicht bloß die geladene Seite.
 *
 * Die Suche ist **entprellt** (200 ms): Ohne das löst jeder Tastendruck eine
 * Abfrage aus, und die Antworten kommen in beliebiger Reihenfolge zurück.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import {
  ArrowRight,
  CalendarDays,
  FolderKanban,
  KanbanSquare,
  ListChecks,
  Plus,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import type { Task } from "../../../shared/schema.ts";
import { DEFAULT_TASK_QUERY } from "../../../shared/schema.ts";
import { projectsQuery, tasksQuery } from "../query.ts";
import { useTaskMutations } from "../mutations.ts";
import { fmt, isoDay } from "../format.ts";
import { ui } from "../store/ui.ts";
import { DueBadge, Kbd, PriorityFlag, ProjectChip } from "./atoms.tsx";

export type PaletteTarget = "/" | "/board" | "/aufgaben" | "/projekte" | "/einstellungen";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({ onNavigate }: { onNavigate: (to: PaletteTarget) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [debounced] = useDebouncedValue(text, { wait: 200 });
  const projects = useQuery(projectsQuery);
  const { create } = useTaskMutations();
  const today = isoDay();

  // Ohne Suchtext keine Abfrage: Die Palette geht oft nur auf, um in eine
  // Ansicht zu springen.
  const results = useQuery({
    ...tasksQuery({
      ...DEFAULT_TASK_QUERY,
      search: debounced.trim(),
      sort: "updated",
      dir: "desc",
      pageSize: 25,
    }),
    enabled: debounced.trim().length > 0,
  });

  useEffect(() => input.current?.focus(), []);
  // Jede neue Eingabe setzt den Cursor zurück — sonst zeigt er auf ein Ergebnis
  // von vorher, und Enter öffnet die falsche Aufgabe.
  useEffect(() => setCursor(0), [debounced]);

  const commands = useMemo<Command[]>(() => {
    const trimmed = text.trim();
    const navigation: Command[] = [
      {
        id: "nav-today",
        label: "Heute",
        hint: "G H",
        icon: <CalendarDays size={15} />,
        run: () => onNavigate("/"),
      },
      {
        id: "nav-board",
        label: "Board",
        hint: "G B",
        icon: <KanbanSquare size={15} />,
        run: () => onNavigate("/board"),
      },
      {
        id: "nav-tasks",
        label: "Alle Aufgaben",
        hint: "G A",
        icon: <ListChecks size={15} />,
        run: () => onNavigate("/aufgaben"),
      },
      {
        id: "nav-projects",
        label: "Projekte",
        hint: "G P",
        icon: <FolderKanban size={15} />,
        run: () => onNavigate("/projekte"),
      },
      {
        id: "nav-settings",
        label: "Einstellungen",
        hint: "G E",
        icon: <SettingsIcon size={15} />,
        run: () => onNavigate("/einstellungen"),
      },
    ];

    const matching = trimmed
      ? navigation.filter((entry) => entry.label.toLowerCase().includes(trimmed.toLowerCase()))
      : navigation;

    // „Anlegen“ steht **oben**, sobald etwas getippt ist: Wer die Palette
    // aufmacht und einen Satz eintippt, will meistens genau das.
    if (trimmed) {
      return [
        {
          id: "create",
          label: `„${trimmed}“ als Aufgabe anlegen`,
          hint: "↵",
          icon: <Plus size={15} />,
          run: () =>
            create.mutate({
              title: trimmed,
              notes: "",
              status: "todo",
              priority: 0,
              due: null,
              projectId: null,
              subtasks: [],
            }),
        },
        ...matching,
      ];
    }
    return matching;
  }, [text, onNavigate, create]);

  const tasks: Task[] = debounced.trim() ? results.data?.rows ?? [] : [];
  const total = commands.length + tasks.length;

  const runAt = (index: number) => {
    if (index < commands.length) commands[index].run();
    else {
      const task = tasks[index - commands.length];
      if (task) ui.openTask(task.id);
    }
    ui.closePalette();
  };

  return (
    <div className="palette-overlay" onClick={ui.closePalette}>
      <div
        className="palette"
        role="dialog"
        aria-label="Befehlspalette"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-input">
          <Search size={16} className="muted" />
          <input
            ref={input}
            value={text}
            placeholder="Aufgabe suchen, Ansicht wechseln, Aufgabe anlegen …"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
                event.preventDefault();
                setCursor((value) => Math.min(value + 1, Math.max(total - 1, 0)));
              }
              if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
                event.preventDefault();
                setCursor((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runAt(cursor);
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                ui.closePalette();
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="palette-list">
          {commands.map((command, index) => (
            <button
              type="button"
              key={command.id}
              className={`palette-item ${index === cursor ? "on" : ""}`}
              onMouseMove={() => setCursor(index)}
              onClick={() => runAt(index)}
            >
              {command.icon}
              <span className="grow">{command.label}</span>
              {command.hint && <Kbd>{command.hint}</Kbd>}
            </button>
          ))}

          {debounced.trim() && (
            <>
              <div className="palette-label">
                Aufgaben
                {results.isFetching && <span className="tiny muted">· sucht …</span>}
              </div>
              {tasks.length === 0 && !results.isFetching && (
                <p className="palette-empty tiny muted">Keine Aufgabe gefunden.</p>
              )}
              {tasks.map((task, index) => {
                const position = commands.length + index;
                return (
                  <button
                    type="button"
                    key={task.id}
                    className={`palette-item ${position === cursor ? "on" : ""} ${
                      task.status === "done" ? "muted" : ""
                    }`}
                    onMouseMove={() => setCursor(position)}
                    onClick={() => runAt(position)}
                  >
                    <ArrowRight size={15} />
                    <span className="grow">{task.title}</span>
                    <PriorityFlag value={task.priority} />
                    <ProjectChip
                      project={projects.data?.find((project) => project.id === task.projectId)}
                      dim
                    />
                    <DueBadge due={task.due} today={today} done={task.status === "done"} />
                    <span className="tiny muted">{fmt.ago(task.updatedAt)}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <footer className="palette-foot tiny muted">
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> wählen · <Kbd>↵</Kbd>{" "}
          öffnen · Suche läuft über alle Aufgaben, Notizen und Unterpunkte
        </footer>
      </div>
    </div>
  );
}

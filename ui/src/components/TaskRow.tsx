/**
 * Eine Aufgabenzeile — der am häufigsten gezeichnete Baustein der App.
 *
 * Drei Entscheidungen stecken darin:
 *
 * 1. **Die Zeile ist ein `<div>` mit `role="button"`, kein `<button>`.** In
 *    einem Button darf kein Button stehen, und die Zeile enthält zwei (Häkchen
 *    und Menü). Tastaturbedienung liefert stattdessen der Cursor aus
 *    `keys.ts` — die Zeile ist nie das Tab-Ziel.
 * 2. **Der Cursor ist eine Klasse, kein Fokus.** Ein echter DOM-Fokus würde bei
 *    jedem `j` das Scrollen übernehmen und mit Radix-Dialogen kämpfen;
 *    `scrollIntoView({ block: "nearest" })` reicht und bleibt ruhig.
 * 3. **Alles Wichtige steht in einer Zeile.** Titel, Projekt, Termin,
 *    Priorität, Unterpunkte. Wer für den Termin die Aufgabe öffnen muss, hat
 *    eine Liste, die man nicht überfliegen kann.
 */
import { useEffect, useRef } from "react";
import { MoreHorizontal, Play, Square } from "lucide-react";
import type { Project, Task } from "../../../shared/schema.ts";
import { colorVar } from "../colors.ts";
import { addDays, isoDay } from "../format.ts";
import { CheckButton, DueBadge, PriorityFlag, ProjectChip, TaskMeta } from "./atoms.tsx";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./Menu.tsx";

export interface TaskRowActions {
  onOpen: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onToggleDoing: (task: Task) => void;
  onDue: (task: Task, due: string | null) => void;
  onPriority: (task: Task, priority: number) => void;
  onProject: (task: Task, projectId: number | null) => void;
  onDelete: (task: Task) => void;
}

export function TaskRow(
  { task, projects, today, cursor, actions, hideProject }: {
    task: Task;
    projects: Project[];
    today: string;
    cursor: boolean;
    actions: TaskRowActions;
    /** In einer Projektansicht ist der Projekt-Chip an jeder Zeile nur Rauschen. */
    hideProject?: boolean;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  const project = projects.find((entry) => entry.id === task.projectId);

  // Der Cursor darf nie außerhalb des Sichtfensters stehen — sonst tippt man
  // j/k ins Leere und weiß nicht, wo die Auswahl gerade ist.
  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      className={`task-row ${cursor ? "cursor" : ""} ${task.status === "done" ? "done" : ""} ${
        task.status === "doing" ? "doing" : ""
      }`}
      style={project ? { borderLeftColor: colorVar(project.color) } : undefined}
      onClick={() => actions.onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") actions.onOpen(task);
      }}
    >
      <CheckButton done={task.status === "done"} onToggle={() => actions.onToggleDone(task)} />

      <span className="task-title grow">
        {task.status === "doing" && <span className="doing-pulse" title="In Arbeit" />}
        {task.title}
      </span>

      <PriorityFlag value={task.priority} />
      {!hideProject && <ProjectChip project={project} dim={task.projectId === null} />}
      <DueBadge due={task.due} today={today} done={task.status === "done"} />
      <TaskMeta task={task} />

      {/* „In Arbeit“ ist die Frage, die der Tag stellt — deshalb ein eigener Knopf. */}
      <button
        type="button"
        className={`btn ghost icon ${task.status === "doing" ? "on" : ""}`}
        title={task.status === "doing" ? "Arbeit unterbrechen (D)" : "Jetzt daran arbeiten (D)"}
        onClick={(event) => {
          event.stopPropagation();
          actions.onToggleDoing(task);
        }}
      >
        {task.status === "doing" ? <Square size={13} /> : <Play size={13} />}
      </button>

      <TaskMenu task={task} projects={projects} actions={actions} />
    </div>
  );
}

/**
 * Das Kontextmenü. Es ist die Stelle, an der alles erreichbar ist, was
 * Tastenkürzel schneller können — beides zu haben ist kein Widerspruch, sondern
 * der Weg, auf dem man die Kürzel überhaupt lernt (sie stehen daneben).
 */
export function TaskMenu(
  { task, projects, actions }: { task: Task; projects: Project[]; actions: TaskRowActions },
) {
  // Immer frisch beim Öffnen des Menüs berechnet: Eine App, die über Nacht
  // offen steht, würde sonst „Heute“ auf gestern setzen.
  const iso = (offset: number) => addDays(isoDay(), offset);

  return (
    <Menu
      trigger={
        <button
          type="button"
          className="btn ghost icon"
          title="Aktionen"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={15} />
        </button>
      }
    >
      <MenuLabel>Termin</MenuLabel>
      <MenuItem shortcut="T" onSelect={() => actions.onDue(task, iso(0))}>Heute</MenuItem>
      <MenuItem shortcut="M" onSelect={() => actions.onDue(task, iso(1))}>Morgen</MenuItem>
      <MenuItem onSelect={() => actions.onDue(task, iso(7))}>In einer Woche</MenuItem>
      <MenuItem shortcut="R" onSelect={() => actions.onDue(task, null)}>Ohne Termin</MenuItem>

      <MenuSeparator />
      <MenuLabel>Priorität</MenuLabel>
      <MenuItem shortcut="3" onSelect={() => actions.onPriority(task, 3)}>Hoch</MenuItem>
      <MenuItem shortcut="2" onSelect={() => actions.onPriority(task, 2)}>Mittel</MenuItem>
      <MenuItem shortcut="1" onSelect={() => actions.onPriority(task, 1)}>Niedrig</MenuItem>
      <MenuItem shortcut="0" onSelect={() => actions.onPriority(task, 0)}>Keine</MenuItem>

      {projects.length > 0 && (
        <>
          <MenuSeparator />
          <MenuLabel>Projekt</MenuLabel>
          <MenuItem onSelect={() => actions.onProject(task, null)}>Eingang</MenuItem>
          {projects.filter((project) => !project.archived).map((project) => (
            <MenuItem
              key={project.id}
              onSelect={() => actions.onProject(task, project.id)}
            >
              {project.name}
            </MenuItem>
          ))}
        </>
      )}

      <MenuSeparator />
      <MenuItem onSelect={() => void navigator.clipboard?.writeText(task.title)}>Titel kopieren</MenuItem>
      <MenuItem danger shortcut="⌫" onSelect={() => actions.onDelete(task)}>Löschen …</MenuItem>
    </Menu>
  );
}

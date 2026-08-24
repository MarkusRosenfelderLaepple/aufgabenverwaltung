/**
 * Board-Karte. Dieselben Daten wie eine Listenzeile, andere Form: Im Board ist
 * die Breite knapp, also stehen Titel und Marker untereinander statt neben-
 * einander.
 *
 * `draggable` liegt auf der Karte selbst und nicht auf einem Griff: Auf einer
 * Karte dieser Größe ist die ganze Fläche der bessere Griff, und ein Klick
 * bleibt trotzdem ein Klick (das Browser-Ziehen startet erst nach Bewegung).
 */
import { useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import { Play, Square } from "lucide-react";
import type { Project, Task } from "../../../shared/schema.ts";
import { colorVar } from "../colors.ts";
import { uiStore } from "../store/ui.ts";
import { CheckButton, DueBadge, PriorityFlag, ProjectChip, TaskMeta } from "./atoms.tsx";
import { TaskMenu, type TaskRowActions } from "./TaskRow.tsx";

export function TaskCard(
  { task, projects, today, actions, dragging, onDragStart, onDragEnd }: {
    task: Task;
    projects: Project[];
    today: string;
    actions: TaskRowActions;
    dragging: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  const cursor = useStore(uiStore, (state) => state.cursorTaskId === task.id);
  const project = projects.find((entry) => entry.id === task.projectId);

  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      draggable
      className={`task-card ${cursor ? "cursor" : ""} ${dragging ? "dragging" : ""} ${
        task.status === "done" ? "done" : ""
      }`}
      style={project ? { borderLeftColor: colorVar(project.color) } : undefined}
      onDragStart={(event) => {
        // Ohne gesetzte Daten bricht Firefox das Ziehen ab; der Inhalt ist
        // gleichgültig, das Vorhandensein nicht.
        event.dataTransfer.setData("text/plain", String(task.id));
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => actions.onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") actions.onOpen(task);
      }}
    >
      <div className="row nowrap" style={{ gap: 8, alignItems: "flex-start" }}>
        <CheckButton done={task.status === "done"} onToggle={() => actions.onToggleDone(task)} size={17} />
        <span className="card-title grow">{task.title}</span>
        <TaskMenu task={task} projects={projects} actions={actions} />
      </div>

      <div className="row card-marks">
        <PriorityFlag value={task.priority} />
        <ProjectChip project={project} dim />
        <DueBadge due={task.due} today={today} done={task.status === "done"} />
        <TaskMeta task={task} />
        <span className="grow" />
        <button
          type="button"
          className={`btn ghost icon ${task.status === "doing" ? "on" : ""}`}
          title={task.status === "doing" ? "Arbeit unterbrechen (D)" : "Jetzt daran arbeiten (D)"}
          onClick={(event) => {
            event.stopPropagation();
            actions.onToggleDoing(task);
          }}
        >
          {task.status === "doing" ? <Square size={12} /> : <Play size={12} />}
        </button>
      </div>
    </div>
  );
}

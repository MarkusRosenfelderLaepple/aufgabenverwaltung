/**
 * Aufgabenliste samt Tastaturbedienung.
 *
 * Hier steckt der Grund, warum die App sich schnell anfühlt: **Jede Ansicht
 * benutzt dieselben Aktionen und dieselben Tasten.** Wer in der Tagesansicht
 * `d` gelernt hat, kann es im Board und in der Liste. Und weil `useTaskActions`
 * die Mutationen kapselt, kann keine Ansicht eine Variante davon erfinden.
 */
import { type ReactNode, useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { ListChecks } from "lucide-react";
import type { Project, Task } from "../../../shared/schema.ts";
import { useTaskMutations } from "../mutations.ts";
import { isMod, isTyping, useKeys } from "../keys.ts";
import { addDays, isoDay } from "../format.ts";
import { ui, uiStore } from "../store/ui.ts";
import { ConfirmDialog, Empty } from "./atoms.tsx";
import { TaskRow, type TaskRowActions } from "./TaskRow.tsx";

/**
 * Die Aktionen einer Aufgabe, einmal verdrahtet — plus der Bestätigungsdialog,
 * den das Löschen braucht. Der Dialog wird als Knoten zurückgegeben, weil er in
 * den Baum der Ansicht gehört, sein Zustand aber hierher.
 */
export function useTaskActions(): { actions: TaskRowActions; confirm: ReactNode } {
  const { patch, toggleDone, toggleDoing, remove } = useTaskMutations();
  const [pending, setPending] = useState<Task | null>(null);

  const actions = useMemo<TaskRowActions>(() => ({
    onOpen: (task) => ui.openTask(task.id),
    onToggleDone: (task) => toggleDone.mutate(task.id),
    onToggleDoing: (task) => toggleDoing.mutate(task.id),
    onDue: (task, due) => patch.mutate({ id: task.id, patch: { due } }),
    onPriority: (task, priority) => patch.mutate({ id: task.id, patch: { priority } }),
    onProject: (task, projectId) => patch.mutate({ id: task.id, patch: { projectId } }),
    onDelete: (task) => setPending(task),
  }), [patch, toggleDone, toggleDoing]);

  const confirm = pending
    ? (
      <ConfirmDialog
        title="Aufgabe löschen"
        message={
          <>
            „{pending.title}“ wird endgültig entfernt — mit allen Unterpunkten und Bildern.
          </>
        }
        onClose={() => setPending(null)}
        onConfirm={() => remove.mutate(pending.id)}
      />
    )
    : null;

  return { actions, confirm };
}

/**
 * Tastaturbedienung für eine geordnete Aufgabenmenge.
 *
 * `tasks` ist die Reihenfolge, die auf dem Bildschirm steht — auch über mehrere
 * Abschnitte hinweg (Tagesansicht) oder Spalten (Board). Der Cursor läuft
 * dadurch genau so, wie das Auge liest.
 */
export function useTaskKeys(tasks: Task[], actions: TaskRowActions, enabled = true): void {
  const cursorId = useStore(uiStore, (state) => state.cursorTaskId);
  const blocked = useStore(
    uiStore,
    (state) => state.openTaskId !== null || state.paletteOpen || state.shortcutsOpen || state.aboutOpen,
  );

  useKeys((event) => {
    // Overlays haben eigene Tastaturregeln; die Liste hält dann still.
    if (blocked || isMod(event) || event.altKey) return;
    if (isTyping(event.target)) return;

    const index = tasks.findIndex((task) => task.id === cursorId);
    const current = index >= 0 ? tasks[index] : undefined;

    // ── Cursor bewegen ────────────────────────────────────────────────────
    if (event.key === "j" || event.key === "ArrowDown") {
      if (tasks.length === 0) return;
      ui.setCursor(tasks[Math.min(index + 1, tasks.length - 1)]?.id ?? tasks[0].id);
      return true;
    }
    if (event.key === "k" || event.key === "ArrowUp") {
      if (tasks.length === 0) return;
      // Vom „nichts ausgewählt“ nach oben landet man am Ende der Liste — das
      // ist die Erwartung, wenn man von unten kommt.
      ui.setCursor(index <= 0 ? tasks[tasks.length - 1].id : tasks[index - 1].id);
      return true;
    }

    if (!current) return;

    // ── Aktionen auf der Aufgabe unter dem Cursor ─────────────────────────
    switch (event.key) {
      case "Enter":
        actions.onOpen(current);
        return true;
      case " ":
        actions.onToggleDone(current);
        return true;
      case "d":
        actions.onToggleDoing(current);
        return true;
      case "e":
        actions.onOpen(current);
        return true;
      case "t":
        actions.onDue(current, isoDay());
        return true;
      case "m":
        actions.onDue(current, addDays(isoDay(), 1));
        return true;
      case "r":
        actions.onDue(current, null);
        return true;
      case "0":
      case "1":
      case "2":
      case "3":
        actions.onPriority(current, Number(event.key));
        return true;
      case "Backspace":
      case "Delete":
        actions.onDelete(current);
        return true;
    }
  }, enabled);
}

export function TaskList(
  { tasks, projects, today, actions, hideProject, empty }: {
    tasks: Task[];
    projects: Project[];
    today: string;
    actions: TaskRowActions;
    hideProject?: boolean;
    empty?: ReactNode;
  },
) {
  const cursorId = useStore(uiStore, (state) => state.cursorTaskId);

  if (tasks.length === 0) {
    return <Empty icon={<ListChecks size={18} />}>{empty ?? "Nichts zu tun."}</Empty>;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          projects={projects}
          today={today}
          cursor={task.id === cursorId}
          actions={actions}
          hideProject={hideProject}
        />
      ))}
    </div>
  );
}

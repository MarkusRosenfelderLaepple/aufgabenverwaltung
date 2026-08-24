/**
 * Alle schreibenden Zugriffe auf Aufgaben an einer Stelle.
 *
 * Der Grund ist nicht Ordnungsliebe: Ein Häkchen wird an fünf Stellen gesetzt
 * (Tagesansicht, Board-Karte, Liste, Detailansicht, Tastenkürzel). Lägen die
 * `useMutation`-Aufrufe in den Ansichten, gäbe es fünf Kopien von
 * „invalidieren, Toast, Fehlerbehandlung“ — und die fünfte vergisst das
 * Invalidieren der Auswertung.
 */
import { useMutation } from "@tanstack/react-query";
import type {
  NewTask,
  PickResult,
  Project,
  ProjectPatch,
  Task,
  TaskMove,
  TaskPatch,
  TaskStatus,
} from "../../shared/schema.ts";
import { apiFetch, client, unwrap } from "./api.ts";
import { invalidateTasks, queryClient } from "./query.ts";
import { toast, ui } from "./store/ui.ts";

const id = (value: number) => ({ id: String(value) });

/** Aufgaben: anlegen, ändern, umschalten, verschieben, löschen. */
export function useTaskMutations() {
  const create = useMutation({
    mutationFn: (input: NewTask) => unwrap<Task>(client.api.tasks.$post({ json: input })),
    onSuccess: invalidateTasks,
  });

  const patch = useMutation({
    mutationFn: (input: { id: number; patch: TaskPatch }) =>
      unwrap<Task>(client.api.tasks[":id"].$patch({ param: id(input.id), json: input.patch })),
    onSuccess: invalidateTasks,
  });

  const toggleDone = useMutation({
    mutationFn: (taskId: number) => unwrap<Task>(client.api.tasks[":id"].toggle.$post({ param: id(taskId) })),
    onSuccess: (task) => {
      invalidateTasks();
      // Kurze Rückmeldung nur beim Abschließen: Beim Wiedereröffnen sieht man
      // die Bewegung in der Liste, ein Toast wäre dort nur Lärm.
      if (task.status === "done") toast.success(`„${short(task.title)}“ erledigt`);
    },
  });

  const toggleDoing = useMutation({
    mutationFn: (taskId: number) => unwrap<Task>(client.api.tasks[":id"].doing.$post({ param: id(taskId) })),
    onSuccess: invalidateTasks,
  });

  const move = useMutation({
    mutationFn: (input: { id: number; target: TaskMove }) =>
      unwrap<Task>(client.api.tasks[":id"].move.$post({ param: id(input.id), json: input.target })),
    onSuccess: invalidateTasks,
  });

  const remove = useMutation({
    mutationFn: (taskId: number) =>
      unwrap<{ ok: true }>(client.api.tasks[":id"].$delete({ param: id(taskId) })),
    onSuccess: () => {
      invalidateTasks();
      ui.closeTask();
      toast.info("Aufgabe gelöscht");
    },
  });

  return { create, patch, toggleDone, toggleDoing, move, remove };
}

/** Unterpunkte. `taskId` steckt im Aufruf, damit nur dieses Detail neu lädt. */
export function useSubtaskMutations(taskId: number) {
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks", "detail", taskId] });
    // Die Liste zeigt „3/5“ an der Zeile — sie muss mit.
    invalidateTasks();
  };

  const create = useMutation({
    mutationFn: (title: string) =>
      unwrap<unknown>(client.api.tasks[":id"].subtasks.$post({ param: id(taskId), json: { title } })),
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: (input: { id: number; title: string }) =>
      unwrap<unknown>(
        client.api.subtasks[":id"].$patch({ param: id(input.id), json: { title: input.title } }),
      ),
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: (subtaskId: number) =>
      unwrap<unknown>(client.api.subtasks[":id"].toggle.$post({ param: id(subtaskId) })),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (subtaskId: number) =>
      unwrap<{ ok: true }>(client.api.subtasks[":id"].$delete({ param: id(subtaskId) })),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) =>
      unwrap<unknown>(
        client.api.tasks[":id"].subtasks.order.$post({ param: id(taskId), json: { ids } }),
      ),
    onSuccess: invalidate,
  });

  return { create, patch, toggle, remove, reorder };
}

/** Anhänge: Bild hochladen und löschen. */
export function useAttachmentMutations(taskId: number) {
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks", "detail", taskId] });
    invalidateTasks();
  };

  const upload = useMutation({
    /**
     * Multipart läuft über `apiFetch` und nicht über den typisierten Client —
     * Dateiuploads sind der eine Fall, den `hc` nicht sinnvoll typisiert.
     */
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const form = new FormData();
        form.set("file", file, file.name || "bild.png");
        await unwrap<unknown>(
          apiFetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form }),
        );
      }
      return files.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(count === 1 ? "Bild angehängt" : `${count} Bilder angehängt`);
    },
  });

  /**
   * Der Weg über den **nativen** Auswahldialog. In der gebauten App öffnet ein
   * `<input type="file">` nichts (Begründung in `src/files.ts`), deshalb fragt
   * dort der Server das Betriebssystem. Er liefert die fertigen Anhänge
   * zurück — hochzuladen gibt es nichts, die Dateien lagen ja schon da.
   */
  const pick = useMutation({
    mutationFn: () =>
      unwrap<PickResult>(apiFetch(`/api/tasks/${taskId}/attachments/pick`, { method: "POST" })),
    onSuccess: (result) => {
      // Abgebrochen ist kein Ereignis: keine Meldung, kein Neuladen.
      if (result.canceled) return;
      invalidate();
      const count = result.attachments.length;
      if (count > 0) toast.success(count === 1 ? "Bild angehängt" : `${count} Bilder angehängt`);
      if (result.rejected.length > 0) {
        toast.error(
          result.rejected.length === 1
            ? `Nicht angehängt: ${result.rejected[0]}`
            : `${result.rejected.length} Dateien nicht angehängt`,
          result.rejected.join(", "),
        );
      }
    },
  });

  const remove = useMutation({
    mutationFn: (attachmentId: number) =>
      unwrap<{ ok: true }>(client.api.attachments[":id"].$delete({ param: id(attachmentId) })),
    onSuccess: invalidate,
  });

  return { upload, pick, remove };
}

/** Projekte. */
export function useProjectMutations() {
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    invalidateTasks();
  };

  const create = useMutation({
    mutationFn: (input: { name: string; color: Project["color"] }) =>
      unwrap<Project>(client.api.projects.$post({ json: input })),
    onSuccess: invalidate,
  });

  const patch = useMutation({
    mutationFn: (input: { id: number; patch: ProjectPatch }) =>
      unwrap<Project>(client.api.projects[":id"].$patch({ param: id(input.id), json: input.patch })),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => unwrap<Project[]>(client.api.projects.order.$post({ json: { ids } })),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (projectId: number) =>
      unwrap<{ ok: true }>(client.api.projects[":id"].$delete({ param: id(projectId) })),
    onSuccess: () => {
      invalidate();
      toast.info("Projekt gelöscht — die Aufgaben liegen jetzt im Eingang");
    },
  });

  return { create, patch, reorder, remove };
}

/** Statuswechsel mit Rückmeldung — vom Board und von der Detailansicht benutzt. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Geplant",
  doing: "In Arbeit",
  done: "Erledigt",
};

function short(text: string): string {
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

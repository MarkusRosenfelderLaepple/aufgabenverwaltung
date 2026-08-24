/**
 * Detailansicht einer Aufgabe — alles ist hier bearbeitbar.
 *
 * Die Leitentscheidung: **kein Speichern-Knopf.** Jedes Feld schreibt beim
 * Verlassen (oder bei Enter), Häkchen und Auswahlfelder sofort. Ein Dialog mit
 * „Speichern“/„Abbrechen“ erzwingt eine Entscheidung, die es hier nicht gibt —
 * es ist die eigene Aufgabenliste, nicht ein Formular an eine Behörde. Der
 * Preis dafür ist ein Request pro Feld; bei einer lokalen SQLite-Datei sind das
 * Mikrosekunden.
 *
 * Zweite Entscheidung: **Bilder kommen per Einfügen.** Screenshot machen, ⌘V —
 * das ist der Weg, den man wirklich nutzt. Ziehen und Auswählen gibt es
 * zusätzlich, weil beides billig ist, wenn der Upload schon steht.
 */
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Check, Circle, Clock, GripVertical, ImagePlus, Plus, Trash2, X } from "lucide-react";
import type { Subtask, TaskStatus } from "../../../shared/schema.ts";
import { BOARD_COLUMNS } from "../../../shared/schema.ts";
import { infoQuery, projectsQuery, taskQuery } from "../query.ts";
import { useAttachmentMutations, useSubtaskMutations, useTaskMutations } from "../mutations.ts";
import { attachmentUrl, errorMessage } from "../api.ts";
import { addDays, fmt, isoDay } from "../format.ts";
import { toast, ui } from "../store/ui.ts";
import { ConfirmDialog, Empty, Kbd, Modal, ProgressBar } from "./atoms.tsx";
import { Lightbox } from "./Lightbox.tsx";

/** Nur Bilder — alles andere lehnt der Server ohnehin ab, hier ist es Rückmeldung. */
const isImage = (file: File) => file.type.startsWith("image/");

export function TaskDetail({ taskId }: { taskId: number }) {
  const detail = useQuery(taskQuery(taskId));
  const projects = useQuery(projectsQuery);
  const { patch, remove } = useTaskMutations();
  const subtasks = useSubtaskMutations(taskId);
  const attachments = useAttachmentMutations(taskId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const info = useQuery(infoQuery);
  const task = detail.data;
  const today = isoDay();
  const native = info.data?.canPickFiles ?? false;
  const busy = attachments.upload.isPending || attachments.pick.isPending;

  /**
   * Einfügen aus der Zwischenablage. `preventDefault` **nur**, wenn wirklich
   * ein Bild dabei ist — sonst kann man in Notizen keinen Text mehr einfügen.
   */
  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter(isImage);
    if (files.length === 0) return;
    event.preventDefault();
    attachments.upload.mutate(files);
  };

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const images = files.filter(isImage);
    if (images.length < files.length) toast.error("Nur Bilder können angehängt werden");
    if (images.length > 0) attachments.upload.mutate(images);
  };

  if (detail.isError) {
    return (
      <Modal title="Aufgabe" onClose={ui.closeTask}>
        <p className="empty" style={{ color: "var(--red)" }}>{errorMessage(detail.error)}</p>
      </Modal>
    );
  }

  if (!task) {
    return (
      <Modal title="Aufgabe" onClose={ui.closeTask}>
        <p className="empty">Wird geladen …</p>
      </Modal>
    );
  }

  const done = task.subtasks.filter((entry) => entry.done).length;

  return (
    <>
      <Modal
        wide
        onPaste={onPaste}
        onClose={ui.closeTask}
        icon={<Circle size={13} style={{ color: `var(--${task.status === "done" ? "green" : "brand"})` }} />}
        title={
          <span className="row nowrap" style={{ gap: 8 }}>
            <span>Aufgabe #{task.id}</span>
            <span className="tiny muted">{fmt.ago(task.updatedAt)} bearbeitet</span>
          </span>
        }
        footer={
          <>
            <button type="button" className="btn danger ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Löschen
            </button>
            <span className="grow" />
            <span className="tiny muted row nowrap" style={{ gap: 6 }}>
              <Kbd>Esc</Kbd> schließen — Änderungen sind schon gespeichert
            </span>
          </>
        }
      >
        <div
          className={`detail ${dragOver ? "drag" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          {/* ── Titel ─────────────────────────────────────────────────────── */}
          <AutoField
            value={task.title}
            className="input title-input"
            placeholder="Titel"
            onCommit={(title) => title.trim() && patch.mutate({ id: task.id, patch: { title } })}
          />

          {/* ── Zustand, Termin, Projekt, Priorität ───────────────────────── */}
          <div className="detail-grid">
            <label className="field">
              <span>Zustand</span>
              <select
                className="select"
                value={task.status}
                onChange={(event) =>
                  patch.mutate({ id: task.id, patch: { status: event.target.value as TaskStatus } })}
              >
                {BOARD_COLUMNS.map((column) => (
                  <option key={column.status} value={column.status}>{column.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Termin</span>
              <div className="row nowrap" style={{ gap: 4 }}>
                <input
                  className="input grow"
                  type="date"
                  value={task.due ?? ""}
                  onChange={(event) =>
                    patch.mutate({ id: task.id, patch: { due: event.target.value || null } })}
                />
                <button
                  type="button"
                  className="btn ghost icon"
                  title="Heute"
                  onClick={() => patch.mutate({ id: task.id, patch: { due: today } })}
                >
                  <Calendar size={14} />
                </button>
                <button
                  type="button"
                  className="btn ghost icon"
                  title="Morgen"
                  onClick={() => patch.mutate({ id: task.id, patch: { due: addDays(today, 1) } })}
                >
                  <Clock size={14} />
                </button>
                {task.due && (
                  <button
                    type="button"
                    className="btn ghost icon"
                    title="Termin entfernen"
                    onClick={() => patch.mutate({ id: task.id, patch: { due: null } })}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </label>

            <label className="field">
              <span>Projekt</span>
              <select
                className="select"
                value={String(task.projectId ?? 0)}
                onChange={(event) =>
                  patch.mutate({
                    id: task.id,
                    patch: { projectId: Number(event.target.value) || null },
                  })}
              >
                <option value="0">Eingang</option>
                {(projects.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.archived ? " (archiviert)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Priorität</span>
              <select
                className="select"
                value={String(task.priority)}
                onChange={(event) =>
                  patch.mutate({ id: task.id, patch: { priority: Number(event.target.value) } })}
              >
                <option value="0">keine</option>
                <option value="1">niedrig</option>
                <option value="2">mittel</option>
                <option value="3">hoch</option>
              </select>
            </label>
          </div>

          {/* ── Notizen ───────────────────────────────────────────────────── */}
          <label className="field">
            <span>Notizen</span>
            <AutoField
              multiline
              value={task.notes}
              className="textarea"
              placeholder="Kontext, Links, Zwischenstände …"
              onCommit={(notes) => patch.mutate({ id: task.id, patch: { notes } })}
            />
          </label>

          {/* ── Unterpunkte ───────────────────────────────────────────────── */}
          <section className="detail-section">
            <header className="row nowrap">
              <h3>Unterpunkte</h3>
              {task.subtasks.length > 0 && (
                <span className="tiny muted num">{done}/{task.subtasks.length}</span>
              )}
              <span className="grow" />
            </header>

            {task.subtasks.length > 0 && (
              <ProgressBar value={done} total={task.subtasks.length} tone="green" thin />
            )}

            <SubtaskList
              subtasks={task.subtasks}
              onToggle={(id) => subtasks.toggle.mutate(id)}
              onRename={(id, title) => subtasks.patch.mutate({ id, title })}
              onRemove={(id) => subtasks.remove.mutate(id)}
              onReorder={(ids) => subtasks.reorder.mutate(ids)}
            />

            <SubtaskAdd onAdd={(title) => subtasks.create.mutate(title)} />
          </section>

          {/* ── Bilder ────────────────────────────────────────────────────── */}
          <section className="detail-section">
            <header className="row nowrap">
              <h3>Bilder</h3>
              <span className="grow" />
              <button
                type="button"
                className="btn ghost"
                // Zwei Wege für denselben Knopf: In der App fragt der Server
                // das Betriebssystem (das Dateifeld öffnet dort nichts), im
                // Browser bleibt es beim Dateifeld. Entschieden wird nach
                // `canPickFiles` aus `/api/info` — nicht nach einer
                // Vermutung über den User-Agent.
                onClick={() => native ? attachments.pick.mutate() : fileInput.current?.click()}
                disabled={busy}
              >
                <ImagePlus size={14} /> {busy ? "Wird übernommen …" : "Hinzufügen"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </header>

            {task.attachments.length === 0
              ? (
                <Empty icon={<ImagePlus size={16} />}>
                  Screenshot einfügen (<Kbd>⌘V</Kbd>), Datei hierher ziehen oder auswählen.
                </Empty>
              )
              : (
                <div className="thumbs">
                  {task.attachments.map((entry, index) => (
                    <figure key={entry.id} className="thumb">
                      <button
                        type="button"
                        className="thumb-open"
                        title={`${entry.name} · ${fmt.bytes(entry.bytes)}`}
                        onClick={() => setLightbox(index)}
                      >
                        <img src={attachmentUrl(entry.id)} alt={entry.name} loading="lazy" />
                      </button>
                      <button
                        type="button"
                        className="thumb-remove"
                        title="Bild entfernen"
                        onClick={() => attachments.remove.mutate(entry.id)}
                      >
                        <X size={12} />
                      </button>
                      <figcaption className="tiny muted">{fmt.bytes(entry.bytes)}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
          </section>

          {/* ── Verlauf ───────────────────────────────────────────────────── */}
          <dl className="kv tiny">
            <dt>Angelegt</dt>
            <dd>{fmt.ago(task.createdAt)}</dd>
            {task.startedAt && (
              <>
                <dt>Begonnen</dt>
                <dd>{fmt.ago(task.startedAt)}</dd>
              </>
            )}
            {task.doneAt && (
              <>
                <dt>Erledigt</dt>
                <dd>{fmt.ago(task.doneAt)} um {fmt.time(task.doneAt)}</dd>
              </>
            )}
          </dl>
        </div>
      </Modal>

      {lightbox !== null && task.attachments[lightbox] && (
        <Lightbox
          attachments={task.attachments}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Aufgabe löschen"
          message={<>„{task.title}“ wird endgültig entfernt — mit allen Unterpunkten und Bildern.</>}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate(task.id)}
        />
      )}
    </>
  );
}

/**
 * Feld, das beim Verlassen schreibt.
 *
 * Der lokale Entwurf ist nötig, weil sonst jeder Tastendruck einen Request
 * auslöste; der `useEffect` gleicht ihn nach, wenn der Wert von außen wechselt
 * (andere Aufgabe geöffnet, Änderung an anderer Stelle). Ohne diesen Abgleich
 * zeigt das Feld beim zweiten Öffnen den Text der ersten Aufgabe.
 */
function AutoField(
  { value, onCommit, className, placeholder, multiline }: {
    value: string;
    onCommit: (value: string) => void;
    className: string;
    placeholder?: string;
    multiline?: boolean;
  },
) {
  const [draft, setDraft] = useState(value);
  // Was zuletzt hinausgegangen ist. Nötig, weil `commit` auf mehreren Wegen
  // fällig wird — Enter, Escape, Verlassen des Feldes, Schließen des Dialogs —
  // und `value` erst nach der Antwort des Servers nachzieht. Ohne diese Marke
  // schickt Escape (schreiben) samt darauffolgendem `blur` dieselbe Änderung
  // zweimal.
  const sent = useRef(value);
  useEffect(() => {
    setDraft(value);
    sent.current = value;
  }, [value]);

  const commit = () => {
    if (draft === sent.current) return;
    sent.current = draft;
    onCommit(draft);
  };

  if (multiline) {
    return (
      <textarea
        className={className}
        rows={4}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        // ⌘↵ schreibt sofort — im mehrzeiligen Feld ist Enter ein Zeilenumbruch.
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          }
          // Escape schreibt und lässt den Dialog dann zu (siehe Kommentar oben).
          if (event.key === "Escape") commit();
        }}
      />
    );
  }

  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          (event.target as HTMLInputElement).blur();
        }
        // Escape schreibt auch. Ein Zurücknehmen wäre die elegantere Lesart,
        // aber „kein Speichern-Knopf“ heißt: keine Taste darf Getipptes
        // stillschweigend wegwerfen — und Escape ist hier zugleich die Taste,
        // die den Dialog schließt.
        if (event.key === "Escape") commit();
      }}
    />
  );
}

/**
 * Unterpunkte mit Ziehen zum Sortieren.
 *
 * Umgesetzt mit der HTML5-Drag-and-Drop-API und nicht mit einer Bibliothek: Es
 * ist eine flache Liste in einem Container, und `dnd-kit` wäre 40 kB für eine
 * Prüfliste. Die eine Falle dabei ist `preventDefault()` in `dragover` — ohne
 * das feuert `drop` nie.
 */
function SubtaskList(
  { subtasks, onToggle, onRename, onRemove, onReorder }: {
    subtasks: Subtask[];
    onToggle: (id: number) => void;
    onRename: (id: number, title: string) => void;
    onRemove: (id: number) => void;
    onReorder: (ids: number[]) => void;
  },
) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  if (subtasks.length === 0) return null;

  const drop = (targetId: number) => {
    setOverId(null);
    if (dragId === null || dragId === targetId) return;
    const ids = subtasks.map((entry) => entry.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    onReorder(ids);
  };

  return (
    <ul className="subtasks">
      {subtasks.map((subtask) => (
        <li
          key={subtask.id}
          className={`subtask ${subtask.done ? "done" : ""} ${overId === subtask.id ? "over" : ""}`}
          draggable
          onDragStart={() => setDragId(subtask.id)}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setOverId(subtask.id);
          }}
          onDrop={() => drop(subtask.id)}
        >
          <span className="grip" title="Ziehen zum Sortieren">
            <GripVertical size={13} />
          </span>
          <button
            type="button"
            className={`check small ${subtask.done ? "on" : ""}`}
            onClick={() => onToggle(subtask.id)}
            title={subtask.done ? "Als offen markieren" : "Als erledigt markieren"}
          >
            <Check size={10} strokeWidth={3.2} />
          </button>
          <AutoField
            value={subtask.title}
            className="input flat grow"
            onCommit={(title) => title.trim() && onRename(subtask.id, title)}
          />
          <button
            type="button"
            className="btn ghost icon"
            title="Unterpunkt entfernen"
            onClick={() => onRemove(subtask.id)}
          >
            <X size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Eigenes Feld statt „leere Zeile anhängen“: Enter legt an, der Fokus bleibt.
 *
 * Halb getippter Text zählt trotzdem: Beim Verlassen des Feldes — Klick
 * woandershin, Escape, Dialog zu — wird er angelegt statt verworfen. Sonst ist
 * „ich habe den Unterpunkt doch eingetippt“ ein täglicher Verlust.
 */
function SubtaskAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [text, setText] = useState("");

  // Wie in `AutoField`: Escape schreibt und löst danach ein `blur` aus, das
  // sonst denselben Unterpunkt ein zweites Mal anlegen würde. Der Ref hält
  // deshalb den Stand, den React noch nicht neu gerendert hat.
  const pending = useRef("");
  const add = () => {
    const title = pending.current.trim();
    if (!title) return;
    pending.current = "";
    setText("");
    onAdd(title);
  };

  return (
    <div className="row nowrap subtask-add">
      <Plus size={13} className="muted" />
      <input
        className="input flat grow"
        value={text}
        placeholder="Unterpunkt hinzufügen …"
        onChange={(event) => {
          pending.current = event.target.value;
          setText(event.target.value);
        }}
        onBlur={add}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
          if (event.key === "Escape") add();
        }}
      />
    </div>
  );
}

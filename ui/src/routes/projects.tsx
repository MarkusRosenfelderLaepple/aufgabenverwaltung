/**
 * Projekte verwalten: anlegen, umbenennen, Farbe wählen, sortieren, archivieren.
 *
 * **Archivieren statt löschen** ist hier die eigentliche Entscheidung. Ein
 * Projekt zu löschen reißt nichts mit (die Aufgaben landen per
 * `ON DELETE SET NULL` im Eingang), aber es nimmt der Historie ihren Namen: Die
 * Aufgaben von letztem Jahr stehen dann ohne Zuordnung da. Archivierte Projekte
 * verschwinden aus Seitenleiste und Auswahlfeldern, bleiben aber an ihren
 * Aufgaben stehen.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, FolderPlus, GripVertical, Trash2 } from "lucide-react";
import type { Project, ProjectColor } from "../../../shared/schema.ts";
import { projectsQuery } from "../query.ts";
import { useProjectMutations } from "../mutations.ts";
import { colorSoft, colorVar, PROJECT_COLORS } from "../colors.ts";
import { Card, ConfirmDialog, Empty } from "../components/atoms.tsx";
import { fmt } from "../format.ts";

export function ProjectsRoute() {
  const projects = useQuery(projectsQuery);
  const { create, patch, reorder, remove } = useProjectMutations();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>("brand");
  const [pending, setPending] = useState<Project | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const all = projects.data ?? [];
  const active = all.filter((project) => !project.archived);
  const archived = all.filter((project) => project.archived);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), color });
    setName("");
  };

  const drop = (targetId: number) => {
    setOverId(null);
    if (dragId === null || dragId === targetId) return;
    // Nur die aktiven werden sortiert; die archivierten hängen hinten dran und
    // behalten ihre Reihenfolge.
    const ids = active.map((project) => project.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    reorder.mutate([...ids, ...archived.map((project) => project.id)]);
  };

  return (
    <div className="stack">
      <Card title="Neues Projekt" icon={<FolderPlus size={15} />}>
        <div className="row nowrap">
          <input
            className="input grow"
            value={name}
            placeholder="Projektname …"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <ColorPicker value={color} onChange={setColor} />
          <button type="button" className="btn primary" disabled={!name.trim()} onClick={submit}>
            Anlegen
          </button>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Beim Anlegen einer Aufgabe reicht danach <code>#{name.trim() || "Projektname"}</code> im Text.
        </p>
      </Card>

      <Card title={`Projekte (${active.length})`}>
        {active.length === 0 && <Empty>Noch kein Projekt — alles landet im Eingang.</Empty>}

        {active.map((project) => (
          <div
            key={project.id}
            className={`project-row ${overId === project.id ? "over" : ""}`}
            draggable
            onDragStart={() => setDragId(project.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOverId(project.id);
            }}
            onDrop={() => drop(project.id)}
            style={{ borderLeftColor: colorVar(project.color) }}
          >
            <span className="grip" title="Ziehen zum Sortieren">
              <GripVertical size={14} />
            </span>

            <input
              className="input flat grow"
              defaultValue={project.name}
              // `onBlur` statt `onChange`: Jeder Tastendruck wäre ein Request,
              // und `defaultValue` lässt das Feld beim Nachladen in Ruhe.
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== project.name) patch.mutate({ id: project.id, patch: { name: next } });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
            />

            <ColorPicker
              value={project.color}
              onChange={(next) => patch.mutate({ id: project.id, patch: { color: next } })}
            />

            <span
              className="chip"
              style={{ color: colorVar(project.color), background: colorSoft(project.color) }}
              title="Offene Aufgaben"
            >
              {fmt.int(project.open)} offen
            </span>

            <button
              type="button"
              className="btn ghost icon"
              title="Archivieren — verschwindet aus Seitenleiste und Auswahl"
              onClick={() => patch.mutate({ id: project.id, patch: { archived: true } })}
            >
              <Archive size={14} />
            </button>
            <button
              type="button"
              className="btn ghost icon danger"
              title="Löschen — die Aufgaben wandern in den Eingang"
              onClick={() => setPending(project)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </Card>

      {archived.length > 0 && (
        <Card title={`Archiv (${archived.length})`} icon={<Archive size={15} />}>
          {archived.map((project) => (
            <div key={project.id} className="project-row archived">
              <i className="dot" style={{ background: colorVar(project.color) }} />
              <span className="grow muted">{project.name}</span>
              <span className="tiny muted num">{fmt.int(project.open)} offen</span>
              <button
                type="button"
                className="btn ghost icon"
                title="Aus dem Archiv holen"
                onClick={() => patch.mutate({ id: project.id, patch: { archived: false } })}
              >
                <ArchiveRestore size={14} />
              </button>
              <button
                type="button"
                className="btn ghost icon danger"
                title="Löschen"
                onClick={() => setPending(project)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {pending && (
        <ConfirmDialog
          title="Projekt löschen"
          message={
            <>
              „{pending.name}“ wird entfernt. Die {pending.open}{" "}
              offenen Aufgaben bleiben erhalten und liegen danach im Eingang.
            </>
          }
          onClose={() => setPending(null)}
          onConfirm={() => remove.mutate(pending.id)}
        />
      )}
    </div>
  );
}

/**
 * Farbwahl als Punktreihe statt `<select>`: Es sind neun Werte, und die Farbe
 * selbst ist die Beschriftung — ein Auswahlfeld mit Wörtern („Türkis“) wäre
 * langsamer zu lesen als die Punkte.
 */
function ColorPicker({ value, onChange }: { value: ProjectColor; onChange: (color: ProjectColor) => void }) {
  return (
    <div className="color-picker">
      {PROJECT_COLORS.map((entry) => (
        <button
          type="button"
          key={entry.value}
          className={`swatch ${entry.value === value ? "on" : ""}`}
          style={{ background: colorVar(entry.value) }}
          title={entry.label}
          aria-label={entry.label}
          aria-pressed={entry.value === value}
          onClick={() => onChange(entry.value)}
        />
      ))}
    </div>
  );
}

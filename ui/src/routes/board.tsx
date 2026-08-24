/**
 * Board — vier Spalten, Ziehen zum Verschieben.
 *
 * Zwei Dinge, die das Board von einer Liste unterscheiden und beide bewusst so
 * gebaut sind:
 *
 * 1. **Es blättert nicht.** Ein Board mit Seiten ist kein Board. Deshalb
 *    `/api/tasks/all` (ohne Seitengrenze) plus ein Filter, der Erledigtes nach
 *    n Tagen ausblendet — sonst wächst die letzte Spalte unbegrenzt.
 * 2. **Ziehen ohne Bibliothek.** HTML5-Drag-and-Drop reicht für Karten in vier
 *    Containern; `dnd-kit` wären ~40 kB für Tastaturunterstützung, die hier
 *    schon anders vorhanden ist (`D` verschiebt nach „In Arbeit“, die
 *    Detailansicht setzt jeden Zustand). Die Falle ist `preventDefault()` im
 *    `dragover` — ohne das feuert `drop` nie.
 */
import { useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Filter, Search, X } from "lucide-react";
import { BOARD_COLUMNS, type Task, type TaskQuery, type TaskStatus } from "../../../shared/schema.ts";
import { boardQuery, projectsQuery, settingsQuery } from "../query.ts";
import { useTaskMutations } from "../mutations.ts";
import { useTaskActions, useTaskKeys } from "../components/TaskList.tsx";
import { QuickAdd } from "../components/QuickAdd.tsx";
import { TaskCard } from "../components/TaskCard.tsx";
import { Empty } from "../components/atoms.tsx";
import { useSearchFocus } from "../search-focus.ts";
import { addDays, isoDay } from "../format.ts";
import { errorMessage } from "../api.ts";

const route = getRouteApi("/board");

export function BoardRoute() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const today = isoDay();

  const tasks = useQuery(boardQuery(search));
  const projects = useQuery(projectsQuery);
  const settings = useQuery(settingsQuery);
  const { create, move } = useTaskMutations();
  const { actions, confirm } = useTaskActions();

  const [dragged, setDragged] = useState<Task | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);

  const setSearch = (patch: Partial<TaskQuery>) =>
    navigate({ search: (prev: TaskQuery) => ({ ...prev, ...patch, page: 1 }), replace: true });

  // Sucheingabe: lokal sofort, URL entprellt — ohne das löst jeder Tastendruck
  // eine Navigation und eine Abfrage aus.
  const [draft, setDraft] = useState(search.search);
  const pushSearch = useDebouncedCallback((value: string) => setSearch({ search: value }), { wait: 300 });
  const focus = useMemo(
    () => () => document.querySelector<HTMLInputElement>(".board-search input")?.focus(),
    [],
  );
  useSearchFocus(focus);

  /**
   * Erledigtes wird nach n Tagen ausgeblendet. Ohne diese Grenze ist die letzte
   * Spalte nach zwei Monaten die längste der App und macht das Board unbrauchbar
   * — die Aufgaben sind nicht gelöscht, sie stehen in „Alle Aufgaben“.
   */
  const doneCutoff = addDays(today, -((settings.data?.hideDoneOlderThanDays as number | undefined) ?? 14));

  const columns = useMemo(() => {
    const all = tasks.data ?? [];
    return BOARD_COLUMNS.map((column) => ({
      ...column,
      tasks: all.filter((task) =>
        task.status === column.status &&
        (column.status !== "done" || (task.doneAt ?? "") >= doneCutoff)
      ),
    }));
  }, [tasks.data, doneCutoff]);

  // Der Cursor läuft spaltenweise von links nach rechts, innerhalb der Spalte
  // von oben nach unten — dieselbe Reihenfolge, in der man das Board liest.
  const ordered = useMemo(() => columns.flatMap((column) => column.tasks), [columns]);
  useTaskKeys(ordered, actions);

  const drop = (status: TaskStatus, index: number) => {
    const task = dragged;
    setDragged(null);
    setOverColumn(null);
    if (!task) return;
    // Nichts zu tun, wenn die Karte an derselben Stelle landet — ein Request,
    // der die Reihenfolge neu schreibt, wäre reines Flackern.
    const column = columns.find((entry) => entry.status === status);
    const currentIndex = column?.tasks.findIndex((entry) => entry.id === task.id) ?? -1;
    if (task.status === status && (currentIndex === index || currentIndex === index - 1)) return;
    move.mutate({ id: task.id, target: { status, index } });
  };

  const activeFilters = search.projectId !== "" || search.minPriority !== "" || search.search !== "";

  return (
    <div className="stack">
      <QuickAdd
        projects={projects.data ?? []}
        defaultDue={null}
        defaultProjectId={search.projectId === "" || search.projectId === 0 ? null : search.projectId}
        onCreate={(task) => create.mutate(task)}
        busy={create.isPending}
      />

      <div className="row nowrap filter-bar">
        <span className="search grow board-search">
          <Search size={14} />
          <input
            className="input"
            value={draft}
            placeholder="Suchen … (/)"
            onChange={(event) => {
              setDraft(event.target.value);
              pushSearch(event.target.value);
            }}
          />
        </span>

        <select
          className="select"
          style={{ maxWidth: 180 }}
          value={String(search.projectId)}
          onChange={(event) =>
            setSearch({ projectId: event.target.value === "" ? "" : Number(event.target.value) })}
        >
          <option value="">Alle Projekte</option>
          <option value="0">Eingang</option>
          {(projects.data ?? []).filter((project) => !project.archived).map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>

        <select
          className="select"
          style={{ width: 150 }}
          value={String(search.minPriority)}
          onChange={(event) =>
            setSearch({ minPriority: event.target.value === "" ? "" : Number(event.target.value) })}
        >
          <option value="">Jede Priorität</option>
          <option value="1">ab niedrig</option>
          <option value="2">ab mittel</option>
          <option value="3">nur hoch</option>
        </select>

        {activeFilters && (
          <button
            type="button"
            className="btn ghost"
            title="Filter zurücksetzen"
            onClick={() => {
              setDraft("");
              setSearch({ projectId: "", minPriority: "", search: "" });
            }}
          >
            <X size={14} /> Filter
          </button>
        )}
        {!activeFilters && (
          <span className="tiny muted row nowrap">
            <Filter size={13} /> ohne Filter
          </span>
        )}
      </div>

      {tasks.isError && <p className="empty" style={{ color: "var(--red)" }}>{errorMessage(tasks.error)}</p>}

      <div className="board">
        {columns.map((column) => (
          <section
            key={column.status}
            className={`board-column ${overColumn === column.status ? "over" : ""} ${column.status}`}
            onDragOver={(event) => {
              event.preventDefault();
              setOverColumn(column.status);
            }}
            onDragLeave={() => setOverColumn((current) => (current === column.status ? null : current))}
            // Ablegen auf die Spaltenfläche heißt „ans Ende“.
            onDrop={() => drop(column.status, column.tasks.length)}
          >
            <header className="board-head">
              <h2>{column.label}</h2>
              <span className="count num">{column.tasks.length}</span>
            </header>

            <div className="board-body">
              {column.tasks.length === 0 && (
                <Empty>{column.status === "done" ? "Noch nichts erledigt." : "Leer."}</Empty>
              )}

              {column.tasks.map((task, index) => (
                <div
                  key={task.id}
                  // Die Ablegezone liegt **über** der Karte: So landet eine
                  // gezogene Karte vor derjenigen, auf der die Maus steht.
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.stopPropagation();
                    drop(column.status, index);
                  }}
                >
                  <TaskCard
                    task={task}
                    projects={projects.data ?? []}
                    today={today}
                    actions={actions}
                    dragging={dragged?.id === task.id}
                    onDragStart={() => setDragged(task)}
                    onDragEnd={() => {
                      setDragged(null);
                      setOverColumn(null);
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {confirm}
    </div>
  );
}

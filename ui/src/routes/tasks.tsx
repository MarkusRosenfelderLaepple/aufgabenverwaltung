/**
 * Alle Aufgaben — Suchen, Filtern, Sortieren, Blättern, Exportieren.
 *
 * Der Kern dieser Ansicht ist eine Entscheidung, die man einmal trifft und dann
 * überall gewinnt: **Filter, Suche, Sortierung und Seite stehen als validiertes
 * Schema in der URL** (`TaskQuery`), und derselbe Query geht unverändert an die
 * API. Daraus folgt der Rest von selbst:
 *
 * - Ein Filter gilt für **alle** Seiten, nicht für die geladene.
 * - Zurück-Taste und Neuladen landen auf derselben Ansicht.
 * - Der Export nimmt denselben Query ohne Seitengrenze — „exportiert wird, was
 *   man sieht" stimmt damit wirklich.
 * - Ein Link aus der Seitenleiste („Projekt X“) ist nichts weiter als andere
 *   Suchparameter.
 */
import { useEffect, useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { Download, Inbox, Search, SlidersHorizontal, X } from "lucide-react";
import {
  type ExportResult,
  PAGE_SIZES,
  type TaskQuery,
  type TaskSort,
  type TaskStatusFilter,
} from "../../../shared/schema.ts";
import { projectsQuery, tasksQuery } from "../query.ts";
import { useTaskMutations } from "../mutations.ts";
import { client, errorMessage, unwrap } from "../api.ts";
import { TaskList, useTaskActions, useTaskKeys } from "../components/TaskList.tsx";
import { QuickAdd } from "../components/QuickAdd.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { Card, Segmented } from "../components/atoms.tsx";
import { useSearchFocus } from "../search-focus.ts";
import { onMenuAction } from "../menu.ts";
import { isoDay } from "../format.ts";
import { toast, ui, uiStore } from "../store/ui.ts";

const route = getRouteApi("/aufgaben");

const STATUS_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
  { value: "", label: "Alle" },
  // Der Alltagsfilter: „was ist noch zu tun“. Steht direkt neben „Alle“, weil
  // er in der Praxis der Standardblick ist und nicht ein Sonderfall.
  { value: "open", label: "Offen" },
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Geplant" },
  { value: "doing", label: "In Arbeit" },
  { value: "done", label: "Erledigt" },
];

const SORT_OPTIONS: { value: `${TaskSort}:${"asc" | "desc"}`; label: string }[] = [
  { value: "manual:asc", label: "Handreihenfolge" },
  { value: "due:asc", label: "Termin zuerst" },
  { value: "priority:desc", label: "Priorität" },
  { value: "updated:desc", label: "Zuletzt geändert" },
  { value: "created:desc", label: "Neueste zuerst" },
  { value: "created:asc", label: "Älteste zuerst" },
  { value: "title:asc", label: "Alphabetisch" },
];

export function TasksRoute() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const today = isoDay();
  const [showFilters, setShowFilters] = useState(
    search.dueFrom !== "" || search.dueTo !== "" || search.noDue,
  );

  const page = useQuery(tasksQuery(search));
  const projects = useQuery(projectsQuery);
  const { create } = useTaskMutations();
  const { actions, confirm } = useTaskActions();

  /**
   * Jede Änderung außer dem Seitenwechsel geht zurück auf Seite 1 — sonst steht
   * man nach dem Umstellen des Filters auf einer Seite, die es in der neuen
   * Ergebnismenge nicht mehr gibt.
   */
  const setSearch = (patch: Partial<TaskQuery>) =>
    navigate({
      search: (prev: TaskQuery) => ({ ...prev, ...patch, page: patch.page ?? 1 }),
      replace: true,
    });

  const [draft, setDraft] = useState(search.search);
  const pushSearch = useDebouncedCallback((value: string) => setSearch({ search: value }), { wait: 300 });
  // Navigation von außen (Seitenleiste, natives Menü, Zurück-Taste) muss das
  // Feld mitnehmen.
  useEffect(() => setDraft(search.search), [search.search]);

  const focus = useMemo(
    () => () => document.querySelector<HTMLInputElement>(".tasks-search input")?.focus(),
    [],
  );
  useSearchFocus(focus);

  const rows = page.data?.rows ?? [];
  useTaskKeys(rows, actions);

  // Der Cursor darf nicht auf einer Zeile stehen bleiben, die nach dem
  // Blättern nicht mehr auf dem Bildschirm ist.
  useEffect(() => {
    const cursor = uiStore.state.cursorTaskId;
    if (cursor !== null && !rows.some((task) => task.id === cursor)) ui.setCursor(rows[0]?.id ?? null);
  }, [rows]);

  const exportCsv = useMutation({
    mutationFn: () => unwrap<ExportResult>(client.api.export.$post({ json: { query: search } })),
    onSuccess: (result) => toast.success(`${result.rows} Aufgaben exportiert: ${result.path}`),
  });

  // ⌘E aus dem nativen Menü: Der Export gehört zu **dieser** Ansicht, weil nur
  // sie den Filter kennt, der exportiert werden soll.
  useEffect(() => onMenuAction((action) => action === "export" && exportCsv.mutate()), [exportCsv]);

  const projectName = search.projectId === ""
    ? null
    : search.projectId === 0
    ? "Eingang"
    : projects.data?.find((project) => project.id === search.projectId)?.name ?? null;

  const filtersActive = search.dueFrom !== "" || search.dueTo !== "" || search.noDue ||
    search.minPriority !== "";

  return (
    <div className="stack">
      <QuickAdd
        projects={projects.data ?? []}
        defaultDue={null}
        defaultStatus={search.status === "backlog" ? "backlog" : "todo"}
        defaultProjectId={search.projectId === "" || search.projectId === 0 ? null : search.projectId}
        onCreate={(task) => create.mutate(task)}
        busy={create.isPending}
      />

      <Card
        className="tight"
        title={projectName ? `Projekt: ${projectName}` : "Aufgaben"}
        icon={projectName === "Eingang" ? <Inbox size={15} /> : undefined}
        actions={
          <div className="row nowrap">
            <button
              type="button"
              className="btn ghost"
              onClick={() => exportCsv.mutate()}
              disabled={exportCsv.isPending}
              title="Gefilterte Liste als CSV speichern (⌘E)"
            >
              <Download size={14} /> {exportCsv.isPending ? "Exportiert …" : "CSV"}
            </button>
          </div>
        }
      >
        <div className="row filter-bar">
          <span className="search grow tasks-search">
            <Search size={14} />
            <input
              className="input"
              value={draft}
              placeholder="Titel, Notizen und Unterpunkte durchsuchen … (/)"
              onChange={(event) => {
                setDraft(event.target.value);
                pushSearch(event.target.value);
              }}
            />
          </span>

          <Segmented
            value={search.status}
            options={STATUS_OPTIONS}
            onChange={(status) => setSearch({ status })}
          />

          <select
            className="select"
            style={{ maxWidth: 170 }}
            value={String(search.projectId)}
            onChange={(event) =>
              setSearch({ projectId: event.target.value === "" ? "" : Number(event.target.value) })}
          >
            <option value="">Alle Projekte</option>
            <option value="0">Eingang</option>
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.archived ? " (archiviert)" : ""}
              </option>
            ))}
          </select>

          <select
            className="select"
            style={{ width: 175 }}
            value={`${search.sort}:${search.dir}`}
            onChange={(event) => {
              const [sort, dir] = event.target.value.split(":") as [TaskSort, "asc" | "desc"];
              setSearch({ sort, dir });
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            className={`btn ghost ${showFilters || filtersActive ? "on" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Weitere Filter"
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>

        {
          /* Der zweite Filterblock ist eingeklappt, solange er ungenutzt ist:
            Terminbereiche braucht man selten, sie stünden sonst dauerhaft im Weg. */
        }
        {showFilters && (
          <div className="row filter-bar second">
            <label className="field">
              <span>Termin von</span>
              <input
                className="input"
                type="date"
                value={search.dueFrom}
                onChange={(event) => setSearch({ dueFrom: event.target.value })}
              />
            </label>
            <label className="field">
              <span>bis</span>
              <input
                className="input"
                type="date"
                value={search.dueTo}
                onChange={(event) => setSearch({ dueTo: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Priorität</span>
              <select
                className="select"
                value={String(search.minPriority)}
                onChange={(event) =>
                  setSearch({ minPriority: event.target.value === "" ? "" : Number(event.target.value) })}
              >
                <option value="">jede</option>
                <option value="1">ab niedrig</option>
                <option value="2">ab mittel</option>
                <option value="3">nur hoch</option>
              </select>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={search.noDue}
                onChange={(event) => setSearch({ noDue: event.target.checked, dueFrom: "", dueTo: "" })}
              />
              <span>nur ohne Termin</span>
            </label>
            {filtersActive && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setSearch({ dueFrom: "", dueTo: "", noDue: false, minPriority: "" })}
              >
                <X size={14} /> zurücksetzen
              </button>
            )}
          </div>
        )}

        {page.isPending && <p className="empty">Wird geladen …</p>}
        {page.isError && <p className="empty" style={{ color: "var(--red)" }}>{errorMessage(page.error)}</p>}

        {page.isSuccess && (
          <TaskList
            tasks={rows}
            projects={projects.data ?? []}
            today={today}
            actions={actions}
            hideProject={search.projectId !== ""}
            empty={search.search
              ? `Kein Treffer für „${search.search}“.`
              : "Für diesen Filter gibt es keine Aufgabe."}
          />
        )}

        <Pagination
          page={page.data?.page ?? 1}
          pages={page.data?.pages ?? 0}
          total={page.data?.total ?? 0}
          pageSize={search.pageSize}
          pageSizes={PAGE_SIZES}
          onPage={(next) => setSearch({ page: next })}
          onPageSize={(size) => setSearch({ pageSize: size })}
          busy={page.isFetching}
        />
      </Card>

      {confirm}
    </div>
  );
}

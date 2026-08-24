/**
 * Rahmen für alle Ansichten: Seitenleiste, Kopfzeile, Fangnetz, Overlays.
 *
 * Alles, was **überall** gilt, steht hier und nur hier: die globalen
 * Tastenkürzel, die Detailansicht (die von jeder Ansicht aus geöffnet wird),
 * Befehlspalette, Tastenkürzel-Übersicht, „Über“. Die Ansichten selbst kennen
 * davon nichts — sie setzen `ui.openTask(id)` und sind fertig.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import {
  CalendarDays,
  ChartColumnIncreasing,
  CheckCheck,
  FolderKanban,
  Inbox,
  Info,
  KanbanSquare,
  Keyboard,
  ListChecks,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { DEFAULT_TASK_QUERY } from "../../shared/schema.ts";
import { infoQuery, projectsQuery, queryClient, settingsQuery, statsQuery } from "./query.ts";
import { client, unwrap } from "./api.ts";
import { fireMenuAction, onMenuAction } from "./menu.ts";
import { createChord, flushFocus, isMod, isTyping, useKeys } from "./keys.ts";
import { focusSearch } from "./search-focus.ts";
import { colorVar } from "./colors.ts";
import { fmt, isoDay } from "./format.ts";
import { applyTheme, ui, uiStore } from "./store/ui.ts";
import type { Theme } from "./store/ui.ts";
import { Kbd, Modal } from "./components/atoms.tsx";
import { AppErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Toaster } from "./components/Toaster.tsx";
import { TaskDetail } from "./components/TaskDetail.tsx";
import { CommandPalette, type PaletteTarget } from "./components/CommandPalette.tsx";
import { ShortcutsDialog } from "./components/ShortcutsDialog.tsx";

const TITLE: Record<string, { title: string; sub: string }> = {
  "/": { title: "Heute", sub: "Woran arbeite ich, was ist fällig, was ist geschafft" },
  "/board": { title: "Board", sub: "Backlog · Geplant · In Arbeit · Erledigt" },
  "/aufgaben": { title: "Alle Aufgaben", sub: "Suchen, filtern, sortieren, exportieren" },
  "/auswertung": { title: "Auswertung", sub: "Erstellt, erledigt, Bestand, Durchlaufzeit" },
  "/projekte": { title: "Projekte", sub: "Farben, Reihenfolge, Archiv" },
  "/einstellungen": { title: "Einstellungen", sub: "Darstellung, Daten, Protokoll" },
};

/** Route-Ziele der Seitenleiste — dieselbe Liste bedient `g`-Kürzel und Palette. */
const VIEWS: { to: PaletteTarget; label: string; icon: typeof CalendarDays; chord: string }[] = [
  { to: "/", label: "Heute", icon: CalendarDays, chord: "h" },
  { to: "/board", label: "Board", icon: KanbanSquare, chord: "b" },
  { to: "/aufgaben", label: "Alle Aufgaben", icon: ListChecks, chord: "a" },
  { to: "/auswertung", label: "Auswertung", icon: ChartColumnIncreasing, chord: "w" },
  { to: "/projekte", label: "Projekte", icon: FolderKanban, chord: "p" },
  { to: "/einstellungen", label: "Einstellungen", icon: SettingsIcon, chord: "e" },
];

export function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const state = useStore(uiStore);
  const today = isoDay();

  const stats = useQuery(statsQuery(today));
  const projects = useQuery(projectsQuery);
  const settings = useQuery(settingsQuery);
  const info = useQuery(infoQuery);

  const [chord] = useState(() => createChord());

  /**
   * Der Umschalter in der Seitenleiste **speichert** die Wahl. Ohne das ist
   * die Einstellung beim nächsten Start wieder weg — und der Anwender lernt,
   * dass der Knopf „nicht richtig funktioniert“.
   */
  const saveTheme = useMutation({
    mutationFn: (value: Theme) =>
      unwrap<unknown>(
        client.api.settings[":key"].$put({ param: { key: "theme" }, json: { value } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const setTheme = (next: Theme) => {
    // Erst anwenden, dann speichern: Auf die Serverantwort zu warten macht aus
    // einem Klick eine sichtbare Verzögerung.
    ui.setTheme(next);
    applyTheme(next);
    saveTheme.mutate(next);
  };

  const goto = useMemo(() => (to: PaletteTarget) => {
    // Die beiden Listenansichten haben ein Suchparameter-Schema; ohne Vorgaben
    // fehlten beim Sprung aus dem Menü die Pflichtparameter.
    if (to === "/" || to === "/board" || to === "/aufgaben") {
      void navigate({ to, search: DEFAULT_TASK_QUERY });
    } else void navigate({ to });
  }, [navigate]);

  // ── Natives Menü ──────────────────────────────────────────────────────────
  useEffect(() =>
    onMenuAction((action) => {
      if (action === "view-today") goto("/");
      if (action === "view-board") goto("/board");
      if (action === "view-tasks") goto("/aufgaben");
      if (action === "view-analytics") goto("/auswertung");
      if (action === "view-projects") goto("/projekte");
      if (action === "settings" || action === "log") goto("/einstellungen");
      if (action === "palette") ui.openPalette();
      if (action === "shortcuts") ui.setShortcuts(true);
      if (action === "about") ui.setAbout(true);
      if (action === "search") focusSearch();
      if (action === "new-task") {
        // „Neue Aufgabe“ heißt: in eine Ansicht mit Erfassungsfeld und den
        // Fokus hinein. Ein eigener Dialog dafür wäre ein Klick mehr für
        // etwas, das die Ansicht schon kann.
        if (pathname !== "/" && pathname !== "/board") goto("/");
        setTimeout(() => document.querySelector<HTMLInputElement>(".quick-input")?.focus(), 60);
      }
    }), [goto, pathname]);

  // ── Globale Tastenkürzel ──────────────────────────────────────────────────
  useKeys((event) => {
    // ⌘-Kombinationen gelten auch beim Tippen — sie sind der Weg *aus* einem
    // Feld heraus.
    if (isMod(event)) {
      const key = event.key.toLowerCase();
      if (key === "k") {
        ui.openPalette();
        return true;
      }
      if (key === "b") {
        ui.toggleCollapsed();
        return true;
      }
      if (key === "/") {
        ui.setShortcuts(!uiStore.state.shortcutsOpen);
        return true;
      }
      if (key === "f") {
        focusSearch();
        return true;
      }
      // ⌘1…⌘5 im Browser-Entwicklungslauf; im Fenster erledigt das das Menü.
      const index = Number(event.key) - 1;
      if (index >= 0 && index < VIEWS.length) {
        goto(VIEWS[index].to);
        return true;
      }
      return;
    }

    if (event.key === "Escape") {
      // Escape räumt von oben nach unten ab; ist nichts offen, hebt es die
      // Auswahl auf. Vorher schreiben, was im Feld steht — sonst nimmt das
      // Schließen die Eingabe mit (siehe `flushFocus`).
      flushFocus();
      if (ui.escape()) return true;
      if (!isTyping(event.target) && uiStore.state.cursorTaskId !== null) {
        ui.setCursor(null);
        return true;
      }
      return;
    }

    if (isTyping(event.target) || uiStore.state.openTaskId !== null || uiStore.state.paletteOpen) return;

    // ── `g`-Folgen: g h, g b, g a, g p, g e ────────────────────────────────
    if (chord.isPending) {
      const prefix = chord.take();
      if (prefix === "g") {
        const view = VIEWS.find((entry) => entry.chord === event.key.toLowerCase());
        if (view) {
          goto(view.to);
          return true;
        }
      }
    }
    if (event.key === "g") return chord.start("g");

    if (event.key === "n") {
      fireMenuAction("new-task");
      return true;
    }
    if (event.key === "/") {
      focusSearch();
      return true;
    }
    if (event.key === "?") {
      ui.setShortcuts(true);
      return true;
    }
  });

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stored = settings.data?.theme as Theme | undefined;
    if (stored) ui.setTheme(stored);
  }, [settings.data?.theme]);

  useEffect(() => {
    applyTheme(state.theme);
    if (state.theme !== "system") return;
    const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme("system");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);

  // Die Seitenleiste klappt am Breakpoint automatisch zu und wieder auf; ein
  // manueller Klick gilt bis zum nächsten Überschreiten der Grenze.
  useEffect(() => {
    const narrow = globalThis.matchMedia("(max-width: 900px)");
    const apply = () => ui.setCollapsed(narrow.matches);
    apply();
    narrow.addEventListener("change", apply);
    return () => narrow.removeEventListener("change", apply);
  }, []);

  const head = TITLE[pathname] ?? { title: "Aufgabenverwaltung", sub: "" };
  const dark = document.documentElement.dataset.theme === "dark";
  const openProjects = (projects.data ?? []).filter((project) => !project.archived);

  return (
    <div className={`shell ${state.collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">
            <CheckCheck size={16} />
          </span>
          <span className="nav-text">
            <strong>Aufgaben</strong>
            <span>verwaltung</span>
          </span>
        </div>

        <div className="nav-label">Ansichten</div>
        {VIEWS.slice(0, 5).map((view) => (
          <Link
            key={view.to}
            to={view.to}
            search={view.to === "/auswertung" ? undefined : DEFAULT_TASK_QUERY}
            className="nav-item"
            activeOptions={view.to === "/" ? { exact: true } : undefined}
            activeProps={{ className: "active" }}
            title={`${view.label} (G ${view.chord.toUpperCase()})`}
          >
            <view.icon size={15} /> <span className="nav-text">{view.label}</span>
            {view.to === "/" && (stats.data?.dueToday ?? 0) > 0 && (
              <span className="count num">{stats.data?.dueToday}</span>
            )}
            {view.to === "/aufgaben" && (stats.data?.open ?? 0) > 0 && (
              <span className="count num">{stats.data?.open}</span>
            )}
          </Link>
        ))}

        {
          /* Projekte als Filterlinks: ein Klick zeigt die Aufgaben genau dieses
            Projekts — dieselbe Ansicht, andere Suchparameter. */
        }
        <div className="nav-label">Projekte</div>
        <Link
          to="/aufgaben"
          search={{ ...DEFAULT_TASK_QUERY, projectId: 0 }}
          className="nav-item"
          activeProps={{ className: "" }}
        >
          <Inbox size={15} /> <span className="nav-text">Eingang</span>
        </Link>
        {openProjects.map((project) => (
          <Link
            key={project.id}
            to="/aufgaben"
            search={{ ...DEFAULT_TASK_QUERY, projectId: project.id }}
            className="nav-item"
            activeProps={{ className: "" }}
            title={project.name}
          >
            <i className="dot" style={{ background: colorVar(project.color) }} />
            <span className="nav-text grow">{project.name}</span>
            {project.open > 0 && <span className="count num">{project.open}</span>}
          </Link>
        ))}
        {openProjects.length === 0 && (
          <Link to="/projekte" className="nav-item tiny muted">
            <span className="nav-text">Noch keine — anlegen …</span>
          </Link>
        )}

        <div className="nav-label">System</div>
        <Link
          to="/einstellungen"
          className="nav-item"
          activeProps={{ className: "active" }}
          title="Einstellungen (G E)"
        >
          <SettingsIcon size={15} /> <span className="nav-text">Einstellungen</span>
        </Link>

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => setTheme(dark ? "light" : "dark")}
            title="Hell / Dunkel"
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => ui.setShortcuts(true)}
            title="Tastenkürzel (⌘/)"
          >
            <Keyboard size={15} />
          </button>
          <span className="grow" />
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => ui.toggleCollapsed()}
            title={`${state.collapsed ? "Seitenleiste einblenden" : "Seitenleiste ausblenden"} (⌘B)`}
          >
            {state.collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="grow">
            <span className="sub">{head.sub}</span>
            <h1>{head.title}</h1>
          </div>
          <div className="topbar-actions">
            {(stats.data?.doing ?? 0) > 0 && (
              <span className="badge accent" title="In Arbeit">
                <Play size={11} /> {stats.data?.doing}
              </span>
            )}
            {(stats.data?.overdue ?? 0) > 0 && (
              <span className="badge danger" title="Überfällig">{stats.data?.overdue} überfällig</span>
            )}
            <span className="badge" title="Heute erledigt">
              {fmt.int(stats.data?.doneToday ?? 0)} heute erledigt
            </span>
            <button
              type="button"
              className="btn ghost icon"
              onClick={() => ui.openPalette()}
              title="Springen zu … (⌘K)"
            >
              <Kbd>⌘K</Kbd>
            </button>
          </div>
        </header>

        <div className="content">
          {/* Fangnetz je Ansicht: ein Renderfehler kostet die Ansicht, nicht das Fenster. */}
          <AppErrorBoundary>
            <Outlet />
          </AppErrorBoundary>
        </div>
      </main>

      <Toaster />

      {state.openTaskId !== null && <TaskDetail taskId={state.openTaskId} />}
      {state.paletteOpen && <CommandPalette onNavigate={goto} />}
      {state.shortcutsOpen && <ShortcutsDialog />}

      {state.aboutOpen && (
        <Modal
          title={`Über ${info.data?.name ?? "Aufgabenverwaltung"}`}
          icon={<Info size={15} />}
          onClose={() => ui.setAbout(false)}
          description="Version und Pfade dieser Installation."
        >
          <dl className="kv">
            <dt>Version</dt>
            <dd className="num">{info.data?.version}</dd>
            <dt>Baudatum</dt>
            <dd className="num">{info.data?.buildDate}</dd>
            <dt>Commit</dt>
            <dd className="num">{info.data?.commit}</dd>
            <dt>Deno</dt>
            <dd className="num">{info.data?.deno}</dd>
            <dt>Datenbank</dt>
            <dd className="tiny">{info.data?.databasePath}</dd>
            <dt>Bilder</dt>
            <dd className="tiny">{info.data?.attachmentDir}</dd>
            <dt>Protokoll</dt>
            <dd className="tiny">{info.data?.logPath}</dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}

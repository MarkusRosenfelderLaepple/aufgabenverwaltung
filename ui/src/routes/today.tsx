/**
 * Tagesansicht — die Startseite und der eigentliche Arbeitsplatz.
 *
 * Aufbau nach einer einzigen Frage: **Was jetzt?** Deshalb steht „In Arbeit“
 * ganz oben, danach das Überfällige, dann der Tag, dann die Woche. Erledigtes
 * kommt nach unten, aber es kommt vor — der Blick auf das, was heute schon
 * geschafft ist, ist der Teil, der eine Aufgabenliste erträglich macht.
 *
 * Der Tastaturcursor läuft über **alle** Abschnitte in genau dieser Reihenfolge
 * (`ordered`), damit j/k dem Auge folgt und nicht der Datenstruktur.
 */
import { type CSSProperties, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarClock, CalendarDays, CheckCheck, Flame, Play, Target } from "lucide-react";
import { projectsQuery, settingsQuery, statsQuery, todayQuery } from "../query.ts";
import { useTaskMutations } from "../mutations.ts";
import { TaskList, useTaskActions, useTaskKeys } from "../components/TaskList.tsx";
import { QuickAdd } from "../components/QuickAdd.tsx";
import { Card, Empty, ProgressBar, ProgressRing } from "../components/atoms.tsx";
import { HistoryChart } from "../components/HistoryChart.tsx";
import { fmt, isoDay } from "../format.ts";
import { errorMessage } from "../api.ts";
import { ui, uiStore } from "../store/ui.ts";

export function TodayRoute() {
  const today = isoDay();
  const agenda = useQuery(todayQuery(today));
  const stats = useQuery(statsQuery(today));
  const projects = useQuery(projectsQuery);
  const settings = useQuery(settingsQuery);
  const { create } = useTaskMutations();
  const { actions, confirm } = useTaskActions();

  const data = agenda.data;

  /**
   * Die Reihenfolge auf dem Bildschirm — einmal berechnet, für Cursor und
   * Anzeige. Ohne diese eine Liste müsste die Tastatur die Abschnittsgrenzen
   * kennen, und jede neue Sektion wäre eine Stelle, die man vergisst.
   */
  const ordered = useMemo(
    () => [
      ...(data?.doing ?? []),
      ...(data?.overdue ?? []),
      ...(data?.today ?? []),
      ...(data?.soon ?? []),
      ...(data?.doneToday ?? []),
    ],
    [data],
  );

  useTaskKeys(ordered, actions);

  // Beim ersten Laden auf die erste Aufgabe zeigen: Dann wirkt die Leertaste
  // sofort, ohne dass man erst j drücken muss. Ein schon gesetzter Cursor
  // bleibt stehen — ein Nachladen darf die Auswahl nicht verschieben.
  useEffect(() => {
    if (uiStore.state.cursorTaskId === null && ordered.length > 0) ui.setCursor(ordered[0].id);
  }, [ordered]);

  const goal = (settings.data?.dailyGoal as number | undefined) ?? 5;
  const doneToday = stats.data?.doneToday ?? 0;
  const plannedToday = (data?.today.length ?? 0) + (data?.overdue.length ?? 0) + (data?.doing.length ?? 0);

  if (agenda.isError) {
    return <p className="empty" style={{ color: "var(--red)" }}>{errorMessage(agenda.error)}</p>;
  }

  return (
    <div className="stack">
      <QuickAdd
        projects={projects.data ?? []}
        defaultDue={today}
        onCreate={(task) => create.mutate(task)}
        busy={create.isPending}
      />

      <div className="split" style={{ "--split": "1.6fr" } as CSSProperties}>
        <div className="stack">
          {agenda.isPending && <p className="empty">Wird geladen …</p>}

          {/* ── In Arbeit ─────────────────────────────────────────────────── */}
          {(data?.doing.length ?? 0) > 0 && (
            <Card
              className="accent-card"
              title={`In Arbeit (${data?.doing.length})`}
              icon={<Play size={15} />}
            >
              <TaskList
                tasks={data?.doing ?? []}
                projects={projects.data ?? []}
                today={today}
                actions={actions}
              />
            </Card>
          )}

          {/* ── Überfällig ────────────────────────────────────────────────── */}
          {(data?.overdue.length ?? 0) > 0 && (
            <Card
              className="danger-card"
              title={`Überfällig (${data?.overdue.length})`}
              icon={<AlarmClock size={15} />}
            >
              <TaskList
                tasks={data?.overdue ?? []}
                projects={projects.data ?? []}
                today={today}
                actions={actions}
              />
            </Card>
          )}

          {/* ── Heute ─────────────────────────────────────────────────────── */}
          <Card title="Heute fällig" icon={<CalendarDays size={15} />}>
            <TaskList
              tasks={data?.today ?? []}
              projects={projects.data ?? []}
              today={today}
              actions={actions}
              empty={(data?.doing.length ?? 0) > 0
                ? "Für heute ist alles verplant — weiter mit dem, was in Arbeit ist."
                : "Für heute steht nichts an. Oben eintippen oder aus dem Backlog holen."}
            />
          </Card>

          {/* ── Nächste Tage ──────────────────────────────────────────────── */}
          {(data?.soon.length ?? 0) > 0 && (
            <Card title="Nächste sieben Tage" icon={<CalendarClock size={15} />}>
              <TaskList
                tasks={data?.soon ?? []}
                projects={projects.data ?? []}
                today={today}
                actions={actions}
              />
            </Card>
          )}

          {/* ── Heute erledigt ────────────────────────────────────────────── */}
          {(data?.doneToday.length ?? 0) > 0 && (
            <Card
              title={`Heute erledigt (${data?.doneToday.length})`}
              icon={<CheckCheck size={15} />}
              className="done-card"
            >
              <TaskList
                tasks={data?.doneToday ?? []}
                projects={projects.data ?? []}
                today={today}
                actions={actions}
              />
            </Card>
          )}
        </div>

        {/* ── Fortschritt ──────────────────────────────────────────────────── */}
        <div className="stack">
          <Card title={fmt.dateLong(today)} icon={<Target size={15} />}>
            <div className="row" style={{ gap: 18, alignItems: "center" }}>
              <ProgressRing
                value={doneToday}
                total={Math.max(goal, doneToday, 1)}
                label={String(doneToday)}
                sublabel={`von ${goal} Tagesziel`}
              />
              <div className="grow stack tight">
                <Metric label="Offen insgesamt" value={stats.data?.open ?? 0} />
                <Metric label="Für heute geplant" value={plannedToday} />
                <Metric label="Diese Woche erledigt" value={stats.data?.doneThisWeek ?? 0} />
                <Metric label="Im Backlog" value={stats.data?.backlog ?? 0} />
              </div>
            </div>

            <div className="row tiny muted" style={{ justifyContent: "space-between", margin: "14px 0 4px" }}>
              <span>Tagesziel</span>
              <span className="num">{doneToday} / {goal}</span>
            </div>
            <ProgressBar value={doneToday} total={goal} tone="green" />

            {(stats.data?.streak ?? 0) > 1 && (
              <p className="row nowrap tiny" style={{ marginTop: 12, color: "var(--accent)" }}>
                <Flame size={14} />
                <strong>{stats.data?.streak} Tage</strong>
                <span className="muted">in Folge etwas erledigt</span>
              </p>
            )}
          </Card>

          <Card title="Letzte drei Wochen" icon={<CheckCheck size={15} />}>
            {stats.data
              ? <HistoryChart history={stats.data.history} />
              : <Empty>Noch keine Auswertung.</Empty>}
          </Card>
        </div>
      </div>

      {confirm}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="row nowrap" style={{ justifyContent: "space-between" }}>
      <span className="tiny muted">{label}</span>
      <strong className="num">{fmt.int(value)}</strong>
    </div>
  );
}

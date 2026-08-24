/**
 * Auswertung — die Seite, die den Verlauf zeigt statt den Stand.
 *
 * Aufbau nach drei Fragen in dieser Reihenfolge:
 *
 * 1. **Wie läuft es?** — Kennzahlen und die Kalenderfläche des letzten Jahres.
 * 2. **Wird der Berg größer?** — Zugang, Abgang und offener Bestand als Reihe.
 * 3. **Woran liegt es?** — Wochentage, Durchlaufzeit, Projekte.
 *
 * Der Zeitraum gilt für die **ganze** Seite und steht deshalb ganz oben, nicht
 * an jedem Diagramm. Einzige Ausnahme ist die Heatmap: Sie zeigt immer ein
 * Jahr, weil ein Kalenderblatt mit drei Spalten kein Kalenderblatt ist — das
 * steht als Hinweis auch an der Karte.
 *
 * Der gewählte Zeitraum wird **nicht** in den Suchparametern gehalten: Die
 * Seite hat kein Ziel, auf das man verlinkt, und der Router trägt hier das
 * `TaskQuery`-Schema der Listenansichten mit.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarRange,
  ChartColumnIncreasing,
  FolderKanban,
  Hourglass,
  PieChart,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { analyticsQuery } from "../query.ts";
import { Card, Empty, Segmented } from "../components/atoms.tsx";
import { CalendarHeatmap, HeatLegend, type HeatMetric } from "../components/CalendarHeatmap.tsx";
import { FlowChart, type Grain, GRAIN_LABEL } from "../components/FlowChart.tsx";
import { LeadTimeChart, OpenShareChart, ProjectChart, WeekdayChart } from "../components/AnalyticsCharts.tsx";
import { colorVar } from "../colors.ts";
import { fmt, isoDay } from "../format.ts";
import { errorMessage } from "../api.ts";

/** 3650 Tage = „alles“. Ein eigener Sonderwert wäre ein Fall mehr auf dem Server. */
const RANGES: { value: number; label: string }[] = [
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: 365, label: "1 Jahr" },
  { value: 3650, label: "Alles" },
];

/** Tagesbalken sind ab einem Vierteljahr Kleinholz — die Vorgabe wächst mit. */
function defaultGrain(days: number): Grain {
  if (days <= 45) return "day";
  return days <= 400 ? "week" : "month";
}

export function AnalyticsRoute() {
  const today = isoDay();
  const [days, setDays] = useState(90);
  const [grain, setGrain] = useState<Grain>(defaultGrain(90));
  const [metric, setMetric] = useState<HeatMetric>("done");
  const analytics = useQuery(analyticsQuery(today, days));

  const setRange = (next: number) => {
    setDays(next);
    setGrain(defaultGrain(next));
  };

  if (analytics.isError) {
    return <p className="empty" style={{ color: "var(--red)" }}>{errorMessage(analytics.error)}</p>;
  }
  if (!analytics.data) return <p className="empty">Wird geladen …</p>;

  const data = analytics.data;
  const { totals, leadTime } = data;
  // Der Nettowert ist die Zahl, die man eigentlich sucht: Kommt mehr herein,
  // als herausgeht? Vorzeichen deshalb ausdrücklich, nicht nur als Farbe.
  const net = totals.created - totals.done;
  const weeks = Math.max(1, data.days / 7);
  const openProjects = data.projects.filter((entry) => entry.open > 0);

  return (
    <div className="stack">
      {/* ── Zeitraum ─────────────────────────────────────────────────────── */}
      <Card
        className="tight"
        title="Zeitraum"
        icon={<CalendarRange size={15} />}
        actions={
          <div className="row">
            <span className="tiny muted">
              {fmt.date(data.from)} – {fmt.date(data.to)}
              {data.firstEver && (
                <>
                  {" · Daten seit "}
                  <span className="num">{fmt.date(data.firstEver)}</span>
                </>
              )}
            </span>
            <Segmented className="auto" value={days} options={RANGES} onChange={setRange} />
          </div>
        }
      >
        <div className="grid auto-sm">
          <Kpi
            label="Erstellt"
            value={totals.created}
            hint={`${fmt.int(Math.round(totals.created / weeks))} pro Woche`}
            icon={<TrendingUp size={14} />}
            tone="brand"
          />
          <Kpi
            label="Erledigt"
            value={totals.done}
            hint={`${fmt.int(Math.round(totals.done / weeks))} pro Woche`}
            icon={<ChartColumnIncreasing size={14} />}
            tone="green"
          />
          <Kpi
            label="Netto"
            value={net}
            signed
            hint={net > 0 ? "Der Berg wächst" : net < 0 ? "Der Berg schrumpft" : "Gleichstand"}
            icon={net > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            tone={net > 0 ? "amber" : "green"}
          />
          <Kpi
            label="Offen heute"
            value={totals.open}
            hint={`zu Beginn ${fmt.int(totals.openStart)}`}
            icon={<Activity size={14} />}
            tone="accent"
          />
          <Kpi
            label="Durchlaufzeit"
            value={leadTime.median}
            unit="Tage"
            hint={`Median · 90 % unter ${fmt.int(Math.round(leadTime.p90))} Tagen`}
            icon={<Timer size={14} />}
            tone="violet"
          />
          <Kpi
            label="Aktive Tage"
            value={totals.activeDays}
            unit={`von ${data.days}`}
            hint={totals.bestDay
              ? `Bester Tag: ${fmt.date(totals.bestDay.date)} (${totals.bestDay.done})`
              : "noch nichts erledigt"}
            icon={<Hourglass size={14} />}
            tone="brand"
          />
        </div>
      </Card>

      {/* ── Kalenderfläche ───────────────────────────────────────────────── */}
      <Card
        title="Letzte 12 Monate"
        icon={<CalendarRange size={15} />}
        actions={
          <div className="row">
            <HeatLegend metric={metric} />
            <Segmented
              className="auto"
              value={metric}
              options={[
                { value: "done", label: "Erledigt" },
                { value: "created", label: "Erstellt" },
              ] satisfies { value: HeatMetric; label: string }[]}
              onChange={setMetric}
            />
          </div>
        }
      >
        <CalendarHeatmap days={data.calendar} metric={metric} />
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Immer ein ganzes Jahr — unabhängig vom Zeitraum oben.
        </p>
      </Card>

      {/* ── Zugang, Abgang, Bestand ──────────────────────────────────────── */}
      <Card
        title="Erstellt, erledigt und offener Bestand"
        icon={<ChartColumnIncreasing size={15} />}
        actions={
          <Segmented
            className="auto"
            value={grain}
            options={(["day", "week", "month"] as Grain[]).map((value) => ({
              value,
              label: GRAIN_LABEL[value],
            }))}
            onChange={setGrain}
          />
        }
      >
        <FlowChart daily={data.daily} grain={grain} />
      </Card>

      {/* ── Wochentage und Durchlaufzeit ─────────────────────────────────── */}
      <div className="split even">
        <Card title="Nach Wochentag" icon={<Activity size={15} />}>
          <WeekdayChart data={data.weekday} />
        </Card>

        <Card
          title="Durchlaufzeit"
          icon={<Timer size={15} />}
          actions={
            <span className="tiny muted">
              {fmt.int(leadTime.count)} erledigt · Ø {fmt.int(Math.round(leadTime.average))} Tage
            </span>
          }
        >
          {leadTime.count > 0
            ? <LeadTimeChart leadTime={leadTime} />
            : <Empty>Im Zeitraum wurde nichts erledigt.</Empty>}
        </Card>
      </div>

      {/* ── Projekte ─────────────────────────────────────────────────────── */}
      <div className="split even">
        <Card title="Projekte im Zeitraum" icon={<FolderKanban size={15} />}>
          <ProjectChart projects={data.projects} />
        </Card>

        <Card
          title="Offenes nach Projekt"
          icon={<PieChart size={15} />}
          actions={<span className="tiny muted">Stand heute</span>}
        >
          {openProjects.length > 0
            ? (
              <>
                <OpenShareChart projects={data.projects} />
                <div className="grid auto-sm" style={{ marginTop: 4, gap: 6 }}>
                  {openProjects.map((entry) => (
                    <span key={entry.projectId ?? 0} className="row nowrap tiny">
                      <i className="dot" style={{ background: colorVar(entry.color) }} />
                      <span className="grow">{entry.name}</span>
                      <strong className="num">{entry.open}</strong>
                    </span>
                  ))}
                </div>
              </>
            )
            : <Empty>Nichts offen — alles abgearbeitet.</Empty>}
        </Card>
      </div>
    </div>
  );
}

/**
 * Eine Kennzahl. Bewusst kein eigenes Modul in `atoms.tsx`: Die Kachel gibt es
 * genau auf dieser Seite, und ein Baustein mit einem Aufrufer gehört dorthin,
 * wo er benutzt wird.
 */
function Kpi(
  { label, value, unit, hint, icon, tone, signed }: {
    label: string;
    value: number;
    unit?: string;
    hint?: string;
    icon: React.ReactNode;
    tone: "brand" | "green" | "amber" | "accent" | "violet";
    signed?: boolean;
  },
) {
  const shown = signed && value > 0 ? `+${fmt.int(value)}` : fmt.int(value);
  return (
    <div className="kpi">
      <span className="kpi-head tiny muted">
        <i style={{ color: `var(--${tone})` }}>{icon}</i>
        {label}
      </span>
      <strong className="kpi-value num" style={{ color: `var(--${tone})` }}>
        {shown}
        {unit && <span className="kpi-unit muted">{unit}</span>}
      </strong>
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}

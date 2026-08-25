import type { ClipboardEvent, ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Circle, Flag, Paperclip, X } from "lucide-react";
import type { Project, Task, TaskStatus } from "../../../shared/schema.ts";
import { colorSoft, colorVar } from "../colors.ts";
import { daysUntil, fmt } from "../format.ts";
import { flushFocus } from "../keys.ts";

export function ProgressBar(
  { value, total, tone = "brand", thin }: {
    value: number;
    total: number;
    tone?: "brand" | "green" | "accent" | "violet";
    thin?: boolean;
  },
) {
  const ratio = total <= 0 ? 0 : Math.min(1, value / total);
  return (
    <div
      className={`progress ${tone} ${thin ? "thin" : ""}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={Math.max(total, value)}
    >
      <i style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function ProgressRing(
  { value, total, size = 112, label, sublabel, tone = "var(--green)" }: {
    value: number;
    total: number;
    size?: number;
    label?: string;
    sublabel?: string;
    tone?: string;
  },
) {
  const ratio = total <= 0 ? 0 : Math.min(1, value / total);
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--panel-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          style={{ transition: "stroke-dasharray 420ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeContent: "center",
          textAlign: "center",
        }}
      >
        <strong style={{ fontSize: 24, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
          {label ?? `${Math.round(ratio * 100)}%`}
        </strong>
        {sublabel && <span className="tiny muted">{sublabel}</span>}
      </div>
    </div>
  );
}

export function Card(
  { title, icon, actions, children, className = "" }: {
    title?: ReactNode;
    icon?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
  },
) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {icon}
          {title && <h2>{title}</h2>}
          {actions && <div className="spacer">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Dialog auf Basis von **Radix**.
 *
 * Warum eine Abhängigkeit im „kein UI-Framework“-Projekt: Radix liefert
 * *Verhalten*, kein Aussehen — Fokus-Falle, Fokus-Rückgabe beim Schließen,
 * `aria-modal` samt Zurückstellen des Hintergrunds, Escape, Portal,
 * Scroll-Sperre. Das Aussehen bleibt vollständig beim eigenen Token-System.
 */
export function Modal(
  { title, icon, onClose, children, footer, description, wide, onPaste }: {
    title: ReactNode;
    icon?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    description?: string;
    wide?: boolean;
    /** Einfügen aus der Zwischenablage — die Detailansicht nimmt so Bilder an. */
    onPaste?: (event: ClipboardEvent) => void;
  },
) {
  return (
    <Dialog.Root
      open
      // Vor dem Schließen den Fokus abgeben: Felder, die beim Verlassen
      // schreiben (Detailansicht), kämen sonst nie dazu — der Dialog ist samt
      // Feld schon aus dem DOM, wenn `blur` fällig wäre.
      onOpenChange={(open) => {
        if (open) return;
        flushFocus();
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay">
          {
            /* Ohne Beschreibungstext `aria-describedby` ausdrücklich abschalten,
              sonst warnt Radix zur Laufzeit über die fehlende Dialog.Description. */
          }
          <Dialog.Content
            className={`modal ${wide ? "wide" : ""}`}
            onPaste={onPaste}
            {...(description ? {} : { "aria-describedby": undefined })}
          >
            <header className="modal-head">
              {icon}
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="btn ghost icon"
                  style={{ marginLeft: "auto" }}
                  title="Schließen (Esc)"
                  aria-label="Schließen"
                >
                  <X size={15} />
                </button>
              </Dialog.Close>
            </header>
            <div className="modal-body">
              {description && <Dialog.Description className="tiny muted">{description}</Dialog.Description>}
              {children}
            </div>
            {footer && <footer className="modal-foot">{footer}</footer>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Rückfrage vor einer nicht umkehrbaren Aktion. Bewusst ein eigener Baustein:
 * `confirm()` blockiert im Webview den Prozess und sieht auf jeder Plattform
 * anders aus.
 */
export function ConfirmDialog(
  { title, message, confirmLabel = "Löschen", danger = true, onConfirm, onClose }: {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  },
) {
  return (
    <Modal
      title={title}
      icon={<AlertTriangle size={15} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Abbrechen</button>
          <button
            type="button"
            className={`btn ${danger ? "danger" : "primary"}`}
            // Radix gibt den Fokus beim Schließen an das auslösende Element
            // zurück — deshalb erst schließen, dann handeln.
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

export function Segmented<T extends string | number>(
  { value, options, onChange, className = "" }: {
    value: T;
    options: { value: T; label: ReactNode; title?: string }[];
    onChange: (value: T) => void;
    className?: string;
  },
) {
  return (
    <div className={`seg ${className}`}>
      {options.map((option) => (
        <button
          type="button"
          key={String(option.value)}
          title={option.title}
          className={option.value === value ? "on" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="empty">
      {icon}
      {children}
    </p>
  );
}

/** Tastenkürzel im Text — dieselbe Optik wie in der Übersicht (⌘/). */
export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

// ── Aufgabenspezifische Anzeigebausteine ────────────────────────────────────

/**
 * Das Häkchen. Als Knopf und nicht als `<input type="checkbox">`, weil die
 * Fläche größer sein muss als ein Systemkästchen — sie ist das am häufigsten
 * getroffene Ziel der ganzen App.
 */
export function CheckButton(
  { done, onToggle, size = 18 }: { done: boolean; onToggle: () => void; size?: number },
) {
  return (
    <button
      type="button"
      className={`check ${done ? "on" : ""}`}
      style={{ width: size, height: size }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={done ? "Als offen markieren (Leertaste)" : "Als erledigt markieren (Leertaste)"}
      aria-pressed={done}
    >
      <Check size={size - 6} strokeWidth={3.2} />
    </button>
  );
}

const PRIORITY_LABEL = ["ohne Priorität", "niedrige Priorität", "mittlere Priorität", "hohe Priorität"];
const PRIORITY_TONE = ["var(--muted)", "var(--brand)", "var(--amber)", "var(--red)"];

/** Priorität als Fähnchen — Farbe trägt die Bedeutung, Form die Erkennbarkeit. */
export function PriorityFlag({ value, size = 13 }: { value: number; size?: number }) {
  if (value <= 0) return null;
  return (
    <span title={PRIORITY_LABEL[value]} style={{ color: PRIORITY_TONE[value], display: "inline-flex" }}>
      <Flag size={size} strokeWidth={2.5} fill="currentColor" />
    </span>
  );
}

export function ProjectChip({ project, dim }: { project: Project | undefined; dim?: boolean }) {
  if (!project) {
    return dim ? null : <span className="chip muted">Eingang</span>;
  }
  return (
    <span
      className="chip"
      style={{ color: colorVar(project.color), background: colorSoft(project.color) }}
      title={`Projekt: ${project.name}`}
    >
      <Circle size={8} strokeWidth={0} fill="currentColor" />
      {project.name}
    </span>
  );
}

/**
 * Termin als Badge. Die Farbe ist die eigentliche Information: rot = überfällig,
 * amber = heute, sonst neutral. Ohne diese Unterscheidung muss der Anwender
 * jedes Datum im Kopf mit heute vergleichen.
 */
export function DueBadge({ due, today, done }: { due: string | null; today: string; done?: boolean }) {
  if (!due) return null;
  const days = daysUntil(due, today);
  const tone = done ? "" : days < 0 ? "due-past" : days === 0 ? "due-today" : "";
  return (
    <span className={`chip ${tone}`} title={fmt.date(due)}>
      {days >= -1 && days <= 6 ? fmt.due(due, today) : fmt.date(due)}
    </span>
  );
}

/**
 * „3/5“ plus Büroklammer — beides nur, wenn es etwas zu zeigen gibt.
 *
 * Vor der Zahl steht ein kurzer Balken — derselbe wie im Aufgabendetail. Die
 * Zahl sagt, wie viel noch aussteht, der Balken sagt es auf einen Blick, ohne
 * dass das Auge zwei Ziffern ins Verhältnis setzen muss. Grün wird er erst,
 * wenn nichts mehr offen ist — beim Überfliegen einer langen Liste ist genau
 * das die Information, die zählt.
 */
export function TaskMeta({ task }: { task: Task }) {
  if (task.subtaskTotal === 0 && task.attachmentCount === 0) return null;
  return (
    <span className="row nowrap tiny muted" style={{ gap: 8 }}>
      {task.subtaskTotal > 0 && (
        <span
          className="row nowrap subtask-progress"
          title={`Unterpunkte: ${task.subtaskDone} von ${task.subtaskTotal} erledigt`}
        >
          <ProgressBar
            value={task.subtaskDone}
            total={task.subtaskTotal}
            tone={task.subtaskDone === task.subtaskTotal ? "green" : "brand"}
            thin
          />
          <span className="num">
            {task.subtaskDone}/{task.subtaskTotal}
          </span>
        </span>
      )}
      {task.attachmentCount > 0 && (
        <span className="row nowrap" style={{ gap: 2 }} title="Bilder">
          <Paperclip size={12} />
          <span className="num">{task.attachmentCount}</span>
        </span>
      )}
    </span>
  );
}

const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: "slate",
  todo: "brand",
  doing: "accent",
  done: "green",
};

export function StatusDot({ status }: { status: TaskStatus }) {
  return <i className="dot" style={{ background: `var(--${STATUS_TONE[status]})` }} />;
}

/**
 * Schnellerfassung: eine Zeile tippen, fertige Aufgabe daraus machen.
 *
 * Der Sinn dahinter ist Tempo. „Angebot Müller morgen #Vertrieb !2“ ist ein
 * Tastenlauf ohne Maus, ohne Tab durch vier Felder, ohne Kalender-Klick. Die
 * Zusätze sind Ergänzung, nicht Pflicht: Wer nur Text tippt, bekommt eine
 * Aufgabe mit dem Termin, der neben dem Feld eingestellt ist.
 *
 * Bewusst **keine** Bibliothek für Datumssprache: Ein deutscher Wortschatz von
 * einem Dutzend Einträgen ist hier vollständig, und alles darüber („nächsten
 * Dienstag in zwei Wochen") ist eine Genauigkeit, die man beim Eintippen nicht
 * nachprüft — man würde sie also entweder nicht nutzen oder falsche Termine
 * bekommen.
 */
import type { Project } from "../../shared/schema.ts";
import { addDays, isoDay } from "./format.ts";

export interface ParsedInput {
  title: string;
  due: string | null;
  /** `undefined` = im Text nicht angegeben, Vorgabe des Formulars gilt weiter. */
  priority: number | undefined;
  projectId: number | null | undefined;
  /** Was erkannt wurde — die Vorschauzeile unter dem Feld zeigt es an. */
  hints: string[];
}

const WEEKDAYS: Record<string, number> = {
  mo: 1,
  montag: 1,
  di: 2,
  dienstag: 2,
  mi: 3,
  mittwoch: 3,
  do: 4,
  donnerstag: 4,
  fr: 5,
  freitag: 5,
  sa: 6,
  samstag: 6,
  so: 0,
  sonntag: 0,
};

/** Der **nächste** genannte Wochentag, heute ausgenommen — „Freitag“ heißt nie „heute“. */
function nextWeekday(weekday: number, today: string): string {
  const base = new Date(`${today}T00:00:00`);
  const delta = (weekday - base.getDay() + 7) || 7;
  return addDays(today, delta);
}

/**
 * `24.8.` / `24.08.2026` / `24.8.26`. Ohne Jahr gilt das laufende — liegt der
 * Tag schon in der Vergangenheit, das nächste. Wer im Dezember „5.1.“ tippt,
 * meint den Januar und nicht einen Termin vor elf Monaten.
 */
function parseGermanDate(token: string, today: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/.exec(token);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const currentYear = Number(today.slice(0, 4));
  let year = match[3] === undefined
    ? currentYear
    : match[3].length === 2
    ? 2000 + Number(match[3])
    : Number(match[3]);

  const build = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (match[3] === undefined && build(year) < today) year = currentYear + 1;

  const iso = build(year);
  // Rückprobe gegen den Kalender: `31.02.` ergibt sonst stillschweigend den
  // 3. März, und im Feld stand etwas anderes als hinterher im Termin.
  const check = new Date(`${iso}T00:00:00`);
  return check.getDate() === day && check.getMonth() + 1 === month ? iso : null;
}

/**
 * Zerlegt die Eingabe. `projects` dient der Auflösung von `#Name` — gesucht
 * wird zuerst exakt, dann als Präfix, jeweils ohne Rücksicht auf Groß- und
 * Kleinschreibung. Mehrdeutige Präfixe bleiben Text: Lieber im Titel stehen als
 * im falschen Projekt landen.
 */
export function parseQuickInput(
  input: string,
  projects: Project[],
  today = isoDay(),
): ParsedInput {
  const hints: string[] = [];
  let due: string | null = null;
  let priority: number | undefined;
  let projectId: number | null | undefined;

  const words = input.split(/\s+/);
  const rest: string[] = [];

  for (const word of words) {
    if (!word) continue;
    const lower = word.toLowerCase();

    // ── Projekt: #Name ────────────────────────────────────────────────────
    if (word.startsWith("#") && word.length > 1 && projectId === undefined) {
      const needle = word.slice(1).toLowerCase();
      const open = projects.filter((project) => !project.archived);
      const exact = open.filter((project) => project.name.toLowerCase() === needle);
      const prefix = open.filter((project) => project.name.toLowerCase().startsWith(needle));
      const found = exact[0] ?? (prefix.length === 1 ? prefix[0] : undefined);
      if (found) {
        projectId = found.id;
        hints.push(`Projekt: ${found.name}`);
        continue;
      }
      rest.push(word);
      continue;
    }

    // ── Priorität: !1 / !2 / !3 oder ! / !! / !!! ─────────────────────────
    if (/^!{1,3}$/.test(word) && priority === undefined) {
      priority = word.length;
      hints.push(`Priorität ${["", "niedrig", "mittel", "hoch"][priority]}`);
      continue;
    }
    if (/^![0-3]$/.test(word) && priority === undefined) {
      priority = Number(word[1]);
      hints.push(
        priority === 0 ? "ohne Priorität" : `Priorität ${["", "niedrig", "mittel", "hoch"][priority]}`,
      );
      continue;
    }

    // ── Termin ───────────────────────────────────────────────────────────
    if (due === null) {
      const relativeDay = lower === "heute" ? 0 : lower === "morgen" ? 1 : lower === "übermorgen" ? 2 : null;
      if (relativeDay !== null) {
        due = addDays(today, relativeDay);
        hints.push(`Termin: ${lower}`);
        continue;
      }
      // `+3` = in drei Tagen. Kurz genug, um im Fluss getippt zu werden.
      const plus = /^\+(\d{1,3})$/.exec(word);
      if (plus) {
        due = addDays(today, Number(plus[1]));
        hints.push(`Termin: in ${plus[1]} Tagen`);
        continue;
      }
      const weekday = WEEKDAYS[lower];
      if (weekday !== undefined) {
        due = nextWeekday(weekday, today);
        hints.push(`Termin: ${word}`);
        continue;
      }
      const german = parseGermanDate(word, today);
      if (german) {
        due = german;
        hints.push(`Termin: ${word}`);
        continue;
      }
    }

    rest.push(word);
  }

  return { title: rest.join(" ").trim(), due, priority, projectId, hints };
}

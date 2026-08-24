/**
 * Formatierung an genau einer Stelle.
 *
 * Zwei Gründe: `Intl`-Instanzen sind teuer (deshalb einmal anlegen und
 * wiederverwenden), und wenn jede Komponente selbst formatiert, stehen am Ende
 * drei verschiedene Datumsschreibweisen auf einer Seite.
 */
import { formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { de } from "date-fns/locale";

const LOCALE = "de-DE";

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });
const dateOnly = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short" });
const dateLong = new Intl.DateTimeFormat(LOCALE, { dateStyle: "full" });
const timeOnly = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** `2026-08-24` aus einem `Date` — **nicht** `toISOString()`, das rechnet in UTC. */
export function isoDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${
    String(date.getDate()).padStart(2, "0")
  }`;
}

/** `2026-08-24` + n Tage. Über die lokalen Felder, damit kein Tag verschluckt wird. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

/** Ganze Tage zwischen heute und `isoDate` — negativ heißt „überfällig“. */
export function daysUntil(isoDate: string, today = isoDay()): number {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  const base = new Date(`${today}T00:00:00`).getTime();
  return Math.round((target - base) / 86_400_000);
}

export const fmt = {
  int: (value: number) => integer.format(value),
  /** `0.42` → `42 %`. Anteil übergeben, nicht Prozentwert. */
  pct: (ratio: number) => percent.format(ratio),

  /** ISO-Datum (`2026-08-24`) → `24. Aug.` */
  date: (value: string | null | undefined) => {
    if (!value) return "–";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : dateOnly.format(date);
  },

  /** `Montag, 24. August 2026` — die Überschrift der Tagesansicht. */
  dateLong: (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : dateLong.format(date);
  },

  weekday: (value: string) => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : weekday.format(date);
  },

  /** Zeitstempel → `14:32` (für „erledigt um“). */
  time: (value: string | null | undefined) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : timeOnly.format(date);
  },

  /**
   * Termin in Worten: `heute`, `morgen`, `vor 3 Tagen`.
   *
   * `Intl.RelativeTimeFormat` allein kann das nicht — es formatiert eine
   * *vorgegebene* Einheit, sucht sie aber nicht aus. Für Tagesabstände ist die
   * Einheit hier bekannt, deshalb reicht `Intl`; für „vor 2 Monaten bearbeitet“
   * unten braucht es date-fns.
   */
  due: (isoDate: string, today = isoDay()) => {
    const days = daysUntil(isoDate, today);
    if (Math.abs(days) <= 1) return relative.format(days, "day");
    if (days > 1 && days <= 6) return `${relative.format(days, "day")} (${fmt.weekday(isoDate)})`;
    return relative.format(days, "day");
  },

  /** Abstand in Worten („vor 2 Monaten“) — für „zuletzt geändert“. */
  ago: (isoStamp: string) => {
    const target = parseISO(isoStamp);
    if (!isValid(target)) return isoStamp;
    return formatDistanceToNowStrict(target, { addSuffix: true, locale: de });
  },

  bytes: (value: number) => {
    const units = ["B", "kB", "MB", "GB"];
    let size = value;
    let unit = 0;
    while (size >= 1000 && unit < units.length - 1) {
      size /= 1000;
      unit++;
    }
    return `${unit === 0 ? integer.format(size) : size.toFixed(1).replace(".", ",")} ${units[unit]}`;
  },
};

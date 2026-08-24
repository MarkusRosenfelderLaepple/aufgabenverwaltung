/**
 * Blätterleiste zu einer serverseitig geblätterten Liste.
 *
 * Bewusst **ohne** eigenen Zustand: Seite und Seitengröße stehen in den
 * Suchparametern der Ansicht (`ItemQuery`), diese Leiste zeigt sie nur an und
 * meldet Änderungen nach oben. Damit überlebt die Seite einen Neuladen, einen
 * Klick auf „Zurück“ und den Wechsel in eine andere Ansicht und zurück.
 *
 * Die Kennzahlen kommen aus der Antwort des Servers (`ItemPage`), nicht aus
 * `rows.length` — angezeigt wird die Zahl **aller** Treffer, nicht die der
 * geladenen Seite.
 */
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { fmt } from "../format.ts";

/**
 * Sichtbare Seitenzahlen: erste, letzte, und ein Fenster um die aktuelle.
 * Lücken werden zu `null` (`…`) zusammengefasst — sonst steht bei 400 Seiten
 * eine 400 Knöpfe lange Zeile in der Fußzeile.
 */
export function pageWindow(page: number, pages: number, radius = 1): (number | null)[] {
  if (pages <= 1) return pages === 1 ? [1] : [];
  const wanted = new Set<number>([1, pages]);
  for (let index = page - radius; index <= page + radius; index++) {
    if (index >= 1 && index <= pages) wanted.add(index);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const number of sorted) {
    // Genau eine übersprungene Seite als „…“ zu zeigen wäre albern — die
    // Zahl selbst ist genauso breit.
    if (number - previous === 2) out.push(previous + 1);
    else if (number - previous > 2) out.push(null);
    out.push(number);
    previous = number;
  }
  return out;
}

export function Pagination(
  { page, pages, total, pageSize, pageSizes, onPage, onPageSize, busy }: {
    page: number;
    pages: number;
    total: number;
    pageSize: number;
    pageSizes?: readonly number[];
    onPage: (page: number) => void;
    onPageSize?: (size: number) => void;
    /** Blendet einen Hinweis ein, während die nächste Seite geladen wird. */
    busy?: boolean;
  },
) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pager">
      <span className="tiny muted grow">
        {total === 0 ? "Keine Treffer" : `${fmt.int(first)}–${fmt.int(last)} von ${fmt.int(total)}`}
        {busy ? " · wird geladen …" : ""}
      </span>

      {onPageSize && pageSizes && (
        <label className="tiny muted row nowrap" style={{ gap: 6 }}>
          Zeilen
          <select
            className="select tiny"
            style={{ width: 76 }}
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
          >
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      )}

      <div className="pager-pages">
        <button
          type="button"
          className="btn ghost icon"
          title="Erste Seite"
          disabled={page <= 1}
          onClick={() => onPage(1)}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          className="btn ghost icon"
          title="Vorherige Seite"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>

        {pageWindow(page, pages).map((number, index) =>
          number === null ? <span key={`gap-${index}`} className="pager-gap">…</span> : (
            <button
              key={number}
              type="button"
              className={`btn ghost num ${number === page ? "on" : ""}`}
              aria-current={number === page ? "page" : undefined}
              onClick={() => onPage(number)}
            >
              {number}
            </button>
          )
        )}

        <button
          type="button"
          className="btn ghost icon"
          title="Nächste Seite"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className="btn ghost icon"
          title="Letzte Seite"
          disabled={page >= pages}
          onClick={() => onPage(pages)}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}

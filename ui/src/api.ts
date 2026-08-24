/**
 * Typisierter Client.
 *
 * `hc<AppType>` liest Pfade, Methoden, Bodies und Antworttypen direkt aus dem
 * Hono-Router in `src/api.ts` — ohne Codegenerierung. Ein Tippfehler im Pfad
 * oder ein geänderter Antworttyp ist damit ein Übersetzungsfehler und kein
 * `undefined` zur Laufzeit.
 *
 * `AppType` wird als `import type` geholt: Servercode landet nie im Bündel.
 */
import { hc } from "hono/client";
import type { AppType } from "../../src/api.ts";
import { AppError, type ErrorBody } from "../../shared/errors.ts";
import { TOKEN_HEADER, TOKEN_META } from "./token.ts";

/**
 * Das App-Token steckt als `<meta>` im ausgelieferten HTML (siehe
 * `src/security.ts`). Im Entwicklungslauf liefert Vite das HTML aus — dort gibt
 * es kein Token, und der Server verlangt auch keines.
 */
function appToken(): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${TOKEN_META}"]`)?.content ?? "";
}

export const client = hc<AppType>("/", {
  headers: (): Record<string, string> => {
    const token = appToken();
    return token ? { [TOKEN_HEADER]: token } : {};
  },
});

/**
 * Prüft die Antwort und übersetzt die eine Fehlerform aus `shared/errors.ts`
 * zurück in eine `AppError`. Jede Query- und Mutationsfunktion geht hier durch
 * — damit ist „Fehler anzeigen“ in der UI genau ein Fall.
 */
export async function unwrap<T>(response: Promise<Response> | Response): Promise<T> {
  const res = await response;
  if (res.ok) return await res.json() as T;
  let body: ErrorBody | null = null;
  try {
    body = await res.json() as ErrorBody;
  } catch { /* kein JSON — Fallback unten */ }
  throw body?.error
    ? new AppError(body.error.code, body.error.message, body.error.details)
    : new AppError("internal", `${res.status} ${res.statusText}`);
}

/**
 * Für Fälle, die der typisierte Client nicht abdeckt: multipart-Uploads.
 * Setzt dieselben Header wie der Client, damit es nur eine Token-Logik gibt.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = appToken();
  const headers = new Headers(init.headers);
  if (token) headers.set(TOKEN_HEADER, token);
  return fetch(path, { ...init, headers });
}

/**
 * URL für `<img src>`: Ein Bildelement kann keine Header setzen, deshalb nimmt
 * `guard` das Token auch als Suchparameter — und diese Funktion ist die einzige
 * Stelle, die das weiß.
 */
export function attachmentUrl(id: number): string {
  const token = appToken();
  const path = `/api/attachments/${id}/file`;
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

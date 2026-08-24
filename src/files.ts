/**
 * Datei-Ein- und -Ausgabe.
 *
 * **Architekturregel:** Dateiarbeit gehört auf die Deno-Seite, nicht ins
 * Webview. Der Server hat vollen Dateisystemzugriff und echte Dialoge; das
 * Webview bekommt beim Ablegen eines Bildes nur ein `File`-Objekt — **nie**
 * einen Pfad. Sobald ein Pfad im Spiel ist, ist die Zuständigkeit hier.
 */
import { basename, extname, isAbsolute, join, resolve } from "@std/path";
import { AppError } from "../shared/errors.ts";
import { log } from "./log.ts";

// ── Zielpfade ───────────────────────────────────────────────────────────────

/**
 * `aufgaben.csv` → `aufgaben (2).csv`, solange etwas existiert. Ein Export, der
 * kommentarlos überschreibt, ist ein Datenverlust mit Ansage.
 */
export function uniquePath(path: string): string {
  if (!existsSync(path)) return path;
  const extension = extname(path);
  const stem = path.slice(0, path.length - extension.length);
  for (let index = 2; index < 10_000; index++) {
    const candidate = `${stem} (${index})${extension}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new AppError("io_error", `Kein freier Name für ${path}`);
}

function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pfadprüfung für jeden Pfad, der aus dem Client kommt: nach `resolve()` muss
 * er innerhalb des erlaubten Verzeichnisses liegen. Ohne das ist jeder
 * Datei-Endpunkt ein „lies/schreib mir irgendwohin“-Endpunkt.
 */
export function ensureInside(base: string, candidate: string): string {
  const root = resolve(base);
  const target = resolve(isAbsolute(candidate) ? candidate : join(root, candidate));
  if (target !== root && !target.startsWith(root + "/") && !target.startsWith(root + "\\")) {
    throw new AppError("forbidden", `Pfad liegt außerhalb von ${root}`);
  }
  return target;
}

// ── Native Dialoge ──────────────────────────────────────────────────────────

interface DesktopDialogApi {
  open?: (options: unknown) => Promise<string | string[] | null>;
  save?: (options: unknown) => Promise<string | null>;
}

/**
 * Deno Desktop ist jung — ob `Deno.dialog` existiert, ist versionsabhängig.
 * Deshalb: API abtasten, sonst über das Betriebssystem fragen. Der Aufrufer
 * merkt den Unterschied nicht.
 */
function desktopDialog(): DesktopDialogApi | null {
  const api = (Deno as unknown as { dialog?: DesktopDialogApi }).dialog;
  return api && (api.open || api.save) ? api : null;
}

async function run(command: string, args: string[]): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command(command, { args, stdout: "piped", stderr: "piped" })
    .output();
  if (code !== 0) {
    const message = new TextDecoder().decode(stderr).trim();
    // Abbruch durch den Anwender ist kein Fehler.
    if (/cancel|abgebrochen|-128/i.test(message) || !message) return "";
    throw new AppError("io_error", message);
  }
  return new TextDecoder().decode(stdout).trim();
}

export async function pickSaveFile(suggested: string, startDir?: string): Promise<string | null> {
  const dialog = desktopDialog();
  if (dialog?.save) {
    return await dialog.save({ defaultPath: startDir ? join(startDir, suggested) : suggested }) ?? null;
  }
  if (Deno.build.os === "darwin") {
    const script = `POSIX path of (choose file name with prompt "Speichern unter" default name "${
      basename(suggested)
    }"${startDir ? ` default location (POSIX file "${startDir}")` : ""})`;
    return (await run("osascript", ["-e", script])) || null;
  }
  if (Deno.build.os === "windows") {
    const script =
      `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.SaveFileDialog; $d.FileName = '${
        basename(suggested)
      }'; ${
        startDir ? `$d.InitialDirectory = '${startDir}'; ` : ""
      }if ($d.ShowDialog() -eq 'OK') { $d.FileName }`;
    return (await run("powershell", ["-NoProfile", "-Command", script])) || null;
  }
  try {
    return (await run("zenity", ["--file-selection", "--save", "--filename", suggested])) || null;
  } catch {
    log.warn("Kein nativer Speichern-Dialog verfügbar — es wird in den Datenordner geschrieben");
    return null;
  }
}

/**
 * Bilder zum Anhängen auswählen — **nativ**, nicht über `<input type="file">`.
 *
 * Der Grund ist eine Lücke im Webview: Ein Dateifeld braucht auf macOS die
 * Delegate-Methode `runOpenPanelWithParameters` der WKWebView, und die bringt
 * `deno desktop` (2.9, experimentell) nicht mit. `Deno.BrowserWindow` hat auch
 * keine eigene Dialog-API — abgetastet wurde die Instanz, sie kennt nur
 * `setApplicationMenu`, `executeJs`, `showContextMenu` und Geschwister. Der
 * Klick auf „Hinzufügen“ blieb deshalb in der gebauten App wirkungslos,
 * während Einfügen und Ziehen funktionierten: Die kommen ohne Dialog an ihre
 * Bytes.
 *
 * Damit gilt hier genau die Architekturregel von oben — sobald ein Pfad im
 * Spiel ist, ist die Deno-Seite zuständig. Sie fragt das Betriebssystem und
 * liest die Dateien selbst (`repo/attachments.ts`, `importFile`).
 */
export async function pickImageFiles(): Promise<string[]> {
  const dialog = desktopDialog();
  if (dialog?.open) {
    const chosen = await dialog.open({
      multiple: true,
      filters: [{ name: "Bilder", extensions: IMAGE_EXT }],
    });
    return chosen === null || chosen === undefined ? [] : Array.isArray(chosen) ? chosen : [chosen];
  }

  if (Deno.build.os === "darwin") {
    // `choose file` gibt eine Liste zurück; die Schleife macht daraus Zeilen,
    // weil ein AppleScript-Listentext ", " als Trenner benutzt — und der kommt
    // in Dateinamen vor.
    const script =
      `set chosen to choose file with prompt "Bilder anhängen" of type ${appleTypes()} with multiple selections allowed
set out to ""
repeat with entry in chosen
  set out to out & (POSIX path of entry) & linefeed
end repeat
return out`;
    return lines(await run("osascript", ["-e", script]));
  }

  if (Deno.build.os === "windows") {
    const filter = `Bilder|${IMAGE_EXT.map((ext) => `*.${ext}`).join(";")}`;
    const script =
      `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; ` +
      `$d.Multiselect = $true; $d.Filter = '${filter}'; if ($d.ShowDialog() -eq 'OK') { $d.FileNames }`;
    return lines(await run("powershell", ["-NoProfile", "-Command", script]));
  }

  try {
    const out = await run("zenity", [
      "--file-selection",
      "--multiple",
      "--separator=\n",
      `--file-filter=Bilder | ${IMAGE_EXT.map((ext) => `*.${ext}`).join(" ")}`,
    ]);
    return lines(out);
  } catch {
    log.warn("Kein nativer Auswahl-Dialog verfügbar — Bilder per Einfügen oder Ziehen anhängen");
    return [];
  }
}

/** Deckungsgleich mit `ATTACHMENT_MIME` in `shared/schema.ts`. */
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"];

/**
 * `public.image` deckt alles ab, was macOS als Bild kennt; die Endungen
 * daneben fangen die Fälle, in denen eine Datei keinen Typ mitbringt.
 */
const appleTypes = () => `{"public.image", ${IMAGE_EXT.map((ext) => `"${ext}"`).join(", ")}}`;

const lines = (out: string) => out.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

/** Datei oder Ordner im Dateimanager zeigen („Im Finder anzeigen“). */
export async function revealPath(path: string): Promise<void> {
  const command = Deno.build.os === "darwin" ? "open" : Deno.build.os === "windows" ? "explorer" : "xdg-open";
  const args = Deno.build.os === "darwin" ? ["-R", path] : [path];
  await new Deno.Command(command, { args, stdout: "null", stderr: "null" }).output().catch(() => {});
}

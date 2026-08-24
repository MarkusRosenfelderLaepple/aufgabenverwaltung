# Aufgabenverwaltung

Lokale Aufgabenverwaltung für einen Arbeitsplatz: **Deno 2.9 `deno desktop` + React 19 + Vite 7 + SQLite
(`node:sqlite`)**. Ein Prozess, eine Datenbankdatei, ein `.app`-Bündel. Kein Server, kein Konto, keine
Synchronisierung — die Daten liegen in `~/Library/Application Support/Aufgabenverwaltung/`.

Gebaut auf `~/gitrepos/desktop-apps-stack/template`; die Begründungen zum Stack selbst (drei `deno.json`,
Bündelgröße, Fensterverhalten, Stolpersteine) stehen im Kochbuch dort. Diese Datei beschreibt nur, was für
**diese** App gilt.

```bash
deno task install:all   # Abhängigkeiten in Wurzel, ui/ und tools/
deno task api           # Terminal 1: API + Statik auf :8777
deno task ui:dev        # Terminal 2: Vite mit HMR auf :5273
deno task check         # fmt + lint + check in allen drei Projekten
deno task test          # Repository- und API-Tests (28)
deno task start         # Bündel bauen und Fenster öffnen (~71 MB)
```

## Das Modell in vier Begriffen

| Begriff        | Bedeutung                                                           |
| -------------- | ------------------------------------------------------------------- |
| **Aufgabe**    | Titel, Notizen, Termin, Priorität (0–3), Zustand, ein Projekt       |
| **Zustand**    | `backlog` → `todo` → `doing` → `done`                               |
| **Unterpunkt** | flache Prüfliste an einer Aufgabe, sortierbar                       |
| **Projekt**    | die **einzige** Gruppierungsachse, farbig, sortierbar, archivierbar |

Drei Entscheidungen, die man kennen sollte, weil sie die Bedienung prägen:

1. **Ein Projekt pro Aufgabe, keine freien Tags.** Eine n:m-Beziehung kostet eine Zwischentabelle, eine
   Chips-Eingabe und die Frage „gehört das jetzt in Tag A oder B?“ — und beantwortet dafür keine Frage, die
   eine farbige Liste in der Seitenleiste nicht auch beantwortet. Wer später Tags braucht, hängt eine
   Migration und eine Tabelle an; das Schema steht dem nicht im Weg.
2. **`doing` ist ein eigener Zustand, kein Etikett.** „Woran arbeite ich gerade?“ ist die Frage, die den Tag
   strukturiert. Deshalb hat der Zustand eine eigene Board-Spalte, einen eigenen Abschnitt in der
   Tagesansicht, einen eigenen Knopf an jeder Zeile, ein eigenes Tastenkürzel (`D`) — und `startedAt` in der
   Datenbank.
3. **Der Abschluss hat einen Zeitstempel** (`doneAt`). Erst dadurch gibt es eine Tagesauswertung, eine Serie
   und den Verlauf der letzten drei Wochen. Wird eine Aufgabe wieder geöffnet, verschwindet der Zeitstempel —
   sonst zählt die Auswertung Arbeit mit, die noch offen ist.

## Ansichten

| Ansicht                   | Wofür                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Heute** (`G H`)         | In Arbeit · Überfällig · heute fällig · nächste sieben Tage · heute erledigt, plus Tagesziel, Serie und Verlauf |
| **Board** (`G B`)         | vier Spalten, Ziehen zum Verschieben, Erledigtes wird nach n Tagen ausgeblendet                                 |
| **Alle Aufgaben** (`G A`) | Suche über Titel, Notizen **und** Unterpunkte, Filter, Sortierung, Blättern, CSV-Export                         |
| **Projekte** (`G P`)      | anlegen, umbenennen, Farbe, Reihenfolge, Archiv                                                                 |
| **Einstellungen** (`G E`) | Theme, Tagesziel, Aufräumgrenze, Sicherung, Protokoll                                                           |

Dazu drei Ebenen, die überall gelten: die **Detailansicht** (Klick oder `↵`), die **Befehlspalette** (`⌘K`)
und die **Tastenkürzel-Übersicht** (`⌘/` oder `?`).

## Bedienung ohne Maus

Vollständige Liste in der App unter `⌘/`. Das Wesentliche:

```
N          neue Aufgabe (Fokus in die Schnellerfassung)
/          suchen            ⌘K  springen zu · anlegen · suchen
J K ↓ ↑    Cursor bewegen    ↵   öffnen
Leer       erledigt / offen  D   in Arbeit / zurück
T M R      Termin heute / morgen / entfernen
0 1 2 3    Priorität         ⌫   löschen
G + H B A P E   Ansicht wechseln       Esc  Ebene schließen
```

Der **Cursor** (`J`/`K`) ist bewusst kein DOM-Fokus, sondern eine Klasse: Er läuft in der Reihenfolge, in der
die Ansicht gelesen wird — in der Tagesansicht über alle fünf Abschnitte hinweg, im Board spaltenweise. Ein
echter Fokus würde mit den Radix-Dialogen um das Scrollen streiten.

### Schnellerfassung

Eine Zeile genügt; die Zusätze werden aus dem Text gelesen (`ui/src/quickparse.ts`) und **vor** dem Abschicken
unter dem Feld angezeigt:

```
Angebot Müller finalisieren morgen #Vertrieb !3
└── Titel ──────────────────┘ └Termin┘ └Projekt┘ └Prio┘
```

Erkannt werden `heute` · `morgen` · `übermorgen` · `Mo`–`So` (der **nächste** genannte Wochentag) · `24.8.` /
`24.08.2026` · `+3` (in drei Tagen) · `#Projekt` (Name oder eindeutiger Anfang) · `!` `!!` `!!!` bzw.
`!0`–`!3`.

Bewusst **keine** Bibliothek für Datumssprache: Ein deutscher Wortschatz von einem Dutzend Einträgen ist hier
vollständig, und alles darüber („nächsten Dienstag in zwei Wochen“) ist eine Genauigkeit, die man beim
Eintippen nicht nachprüft — man würde sie also entweder nicht nutzen oder falsche Termine bekommen.

### Bilder an Aufgaben

Detailansicht öffnen, **`⌘V`** — Screenshot ist dran. Ziehen und Auswählen gehen genauso. Die Datei landet
unter `~/Library/Application Support/Aufgabenverwaltung/attachments/<id>.<ext>`, die Datenbank führt nur Buch.
Der Dateiname des Anwenders wird **nie** zum Pfad, und der MIME-Typ wird gegen eine Liste geprüft statt
übernommen (`src/repo/attachments.ts`).

**Der Knopf „Hinzufügen“ nimmt in der App einen anderen Weg als im Browser.** Ein `<input type="file">` öffnet
im Webview der gebauten App **nichts**: Auf macOS braucht ein Dateifeld die Delegate-Methode
`runOpenPanelWithParameters` der WKWebView, und die bringt `deno desktop` (2.9) nicht mit; eine eigene
Dialog-API hat `Deno.BrowserWindow` auch nicht (abgetastet — nur `setApplicationMenu`, `executeJs`,
`showContextMenu` und Geschwister). Einfügen und Ziehen waren davon nie betroffen, die kommen ohne Dialog an
ihre Bytes. Also fragt die **Serverseite** das Betriebssystem (`pickImageFiles()` in `src/files.ts`,
`POST /api/tasks/:id/attachments/pick`) und liest die Dateien selbst — sie bekommt Pfade, keine Bytes. Welchen
Weg der Knopf nimmt, entscheidet `canPickFiles` aus `/api/info`, nicht eine Vermutung über den User-Agent: im
Browserlauf erschiene ein Serverdialog auf dem falschen Rechner, dort bleibt es beim Dateifeld.

Ausgeliefert wird das Bild über `GET /api/attachments/:id/file` mit eigener CSP (`default-src 'none'`) und
`nosniff` — eine SVG mit Skript soll im Webview nichts ausführen können. Weil `<img src>` keine Header setzen
kann, nimmt `guard` das App-Token dort auch als Suchparameter; die URL baut `attachmentUrl()` in
`ui/src/api.ts` an genau einer Stelle.

## Aufbau

```
shared/schema.ts        Zod-Schemata = einzige Quelle der Wahrheit (Server + UI)
src/db.ts               Verbindung, Migrationen (PRAGMA user_version), tx()
src/repo/task-row.ts    das eine SELECT und die eine parse()-Stelle einer Aufgabe
src/repo/tasks.ts       Filter, Suche, Seiten, Statuswechsel, Verschieben
src/repo/subtasks.ts    Unterpunkte (eine Ebene, sortierbar)
src/repo/attachments.ts Bilder: Datei schreiben, MIME prüfen, verwaiste aufräumen
src/files.ts            Pfade und native Dialoge (Speichern, Bilder auswählen)
src/repo/projects.ts    Projekte samt Zähler offener Aufgaben
src/repo/agenda.ts      Tagesansicht (5 Listen in einer Antwort) und Auswertung
src/api.ts              Hono-Router + `export type AppType` für den Client
src/export.ts           CSV (Semikolon, BOM) — streamend
ui/src/query.ts         eine Query-Option je Ressource, ein invalidateTasks()
ui/src/mutations.ts     alle schreibenden Zugriffe an einer Stelle
ui/src/keys.ts          Tastaturschicht + SHORTCUTS (Quelle der Hilfeseite)
ui/src/quickparse.ts    Kurzschreibweise der Schnellerfassung
ui/src/colors.ts        Projektfarbe (Tokenname) → CSS-Variable
ui/src/components/      TaskRow, TaskCard, TaskList, TaskDetail, QuickAdd,
                        CommandPalette, Lightbox, HistoryChart, atoms …
ui/src/routes/          today, board, tasks, projects, settings
```

Die Regeln, die dabei wirklich tragen:

- **Ein Query-Schema für URL und API.** `TaskQuery` validiert die Suchparameter des Routers **und** die
  Query-Parameter des Endpunkts. Daraus folgt der Rest: Ein Filter gilt für alle Seiten statt für die
  geladene, die Zurück-Taste funktioniert, ein Projektlink in der Seitenleiste ist nichts als andere
  Suchparameter, und der Export nimmt denselben Query ohne Seitengrenze („exportiert wird, was man sieht“).
- **Alle Mutationen in `ui/src/mutations.ts`.** Ein Häkchen wird an fünf Stellen gesetzt; lägen die
  `useMutation`-Aufrufe in den Ansichten, gäbe es fünf Kopien von „invalidieren, Toast, Fehlerbehandlung“ —
  und die fünfte vergisst die Auswertung.
- **Statuswechsel-Logik im Repository, nicht in der UI.** Es gibt drei Wege zum Statuswechsel (Detailansicht,
  Board, Tastenkürzel); `tasks.update()` ist die Stelle, an der `startedAt` und `doneAt` gesetzt und gelöscht
  werden.
- **Kein Speichern-Knopf in der Detailansicht.** Jedes Feld schreibt beim Verlassen, Häkchen und Auswahlfelder
  sofort. Bei einer lokalen SQLite-Datei kostet das Mikrosekunden; ein Dialog mit „Speichern/Abbrechen“
  erzwingt eine Entscheidung, die es in der eigenen Aufgabenliste nicht gibt. Die Kehrseite dieser Zusage:
  **keine Taste darf Getipptes wegwerfen.** Auch Escape schreibt erst und schließt dann — `flushFocus()` in
  `keys.ts` gibt vor jedem Schließen den Fokus ab, sonst verschwindet das Feld mitsamt Dialog, bevor `blur`
  fällig wäre. Halb getippte Unterpunkte werden beim Verlassen angelegt, nicht verworfen.
- **`SHORTCUTS` in `keys.ts` ist die Quelle der Hilfeseite.** Eine Hilfe, die ihre Kürzel doppelt pflegt, ist
  nach dem dritten neuen Kürzel falsch.

## Ohne Bibliothek gebaut — und warum

| Statt                        | Hier                                        | Grund                                                                                            |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `dnd-kit`                    | HTML5-Drag-and-Drop                         | Karten in vier Containern, flache Prüfliste; Tastaturbedienung gibt es ohnehin schon             |
| `cmdk`                       | eigene Palette (~200 Zeilen)                | eigene Fokus-/Portal-Mechanik reibt sich mit dem Radix-Dialog darunter; Suche läuft serverseitig |
| `chrono-node` & Co.          | `quickparse.ts`                             | ein Dutzend deutscher Wörter ist hier der vollständige Wortschatz                                |
| Datumsbibliothek für Formate | `Intl` (+ date-fns nur für „vor 2 Monaten“) | `Intl.RelativeTimeFormat` formatiert eine _vorgegebene_ Einheit, sucht sie aber nicht aus        |

Geblieben sind: TanStack (Query, Router, Store, Form-frei, Pacer), Radix für Dialog und Menü (**Verhalten**,
kein Aussehen), Lucide für Icons, ECharts für das eine Balkendiagramm.

## Tests

`deno task test` — 28 Tests, keine Wartezeit, keine echte Datei:

- **`tests/repo_test.ts`** gegen `:memory:`. Deckt die Stellen ab, an denen Fehler unsichtbar wären:
  Zeitstempel beim Öffnen/Schließen, `startedAt` beim zweiten „in Arbeit“, NULL-Termine am Ende der
  Sortierung, Neunummerierung der Board-Spalte, Kaskade beim Löschen, Projektzähler, Tagesabschnitte, Nulltage
  im Verlauf, `addDays` über Sommerzeitgrenzen.
- **`tests/api_test.ts`** über `app.request()` — inklusive Bild-Upload mit echten PNG-Bytes, Ablehnung einer
  Textdatei, `noDue=false` (der Fall, den `z.coerce.boolean()` falsch macht) und der Unterscheidung „Feld
  fehlt“ vs. „Feld ist `null`“ beim PATCH.

Die Anhang-Tests schreiben in einen Wegwerfordner: `AUFGABENVERWALTUNG_DATA` biegt `dataDir()` um,
`AUFGABENVERWALTUNG_DB` die Datenbank.

## Datenpflege

- **Sicherung:** Einstellungen ▸ „Daten sichern“ (`VACUUM INTO`, konsistent im laufenden Betrieb). Der Ordner
  `attachments/` gehört mit in die Sicherung — die Bilder liegen als Dateien daneben, nicht als BLOB in der
  Datenbank.
- **Aufräumen:** entfernt Erledigtes, das länger als 90 Tage fertig ist, samt Bildern, und räumt verwaiste
  Dateien auf. Beim Start passiert Letzteres beiläufig — nach dem Zurückspielen einer Sicherung bleiben sonst
  Dateien ohne Zeile liegen.
- **Migrationen werden nie geändert, nur angehängt** (`src/db.ts`). Wer eine ausgelieferte Zeile bearbeitet,
  hat zwei Schemata: eines auf Neuinstallationen, eines auf gewachsenen Rechnern.

## Bewusst nicht drin

Sync und Mehrbenutzerbetrieb (dafür ist der Stack falsch), Wiederholungsaufgaben, Zeiterfassung,
Erinnerungen/Benachrichtigungen, Unterpunkte über mehr als eine Ebene, Markdown-Rendering in den Notizen.
Alles davon ist nachziehbar; nichts davon war für „schnell erfassen, sehen was dran ist, abhaken“ nötig.

# UI-Konventionen dieser App

Destillat der laepple-Design-Guidelines, reduziert auf das, was **ohne** Tailwind, DaisyUI, i18n und die
`@laepple/*`-Komponenten gilt. Die Regeln stecken bereits in `ui/src/styles.css` und
`ui/src/components/atoms.tsx` — das hier ist die Begründung dazu. Der letzte Abschnitt beschreibt die
Bausteine, die für die Aufgabenverwaltung dazugekommen sind.

## Die zehn Regeln

1. **Nur Tokens, keine Literalfarben.** Jede Farbe kommt aus einer CSS-Variable (`var(--brand)`,
   `var(--muted)`, `var(--red)`). Wer `#3b82f6` in eine Komponente schreibt, bricht Dark Mode und Theming.
2. **Radien aus der Leiter, nie frei gewählt.** `--r-xs` (6 px, Häkchen, Menüeinträge) · `--r-sm` (9 px,
   Eingaben, Listenzeilen, Navigation) · `--r` (12 px, Karten in Karten, Menüs, Kacheln) · `--r-lg` (16 px,
   Karten, Board-Spalten) · `--r-xl` (22 px, Dialoge, Befehlspalette) · `--r-pill` (Knöpfe, Chips, Badges,
   Fortschritt). Eine neue Zahl ist fast immer ein Zeichen dafür, dass das Element in eine bestehende Klasse
   gehört.
3. **Tiefe statt Trennstriche.** Flächen tragen `--e1` … `--e4` (ruhend · gehoben · schwebend · Dialog) und
   ihren Rahmen als `inset 0 0 0 1px var(--border)` **im** Schatten. Ein echter `border` liegt außerhalb der
   Rundung und ragt an runden Ecken als Zipfel heraus — deshalb liegen auch Statusstreifen als
   `inset 3px 0 0 <farbe>` innen, nicht als `border-left`. Ausnahme: Wo eine Projektfarbe von React über
   `borderLeftColor` inline gesetzt wird (`.task-row`, `.task-card`), bleibt der echte Rahmen stehen.
4. **Glas nur auf tragender Struktur.** `--glass` / `--glass-strong` / `--glass-soft` plus
   `backdrop-filter: var(--blur)` gehören auf Seitenleiste, Kopfzeile, Karten, Board-Spalten, Dialoge, Menüs,
   Befehlspalette. **Nicht** auf Listenzeilen und Board-Karten: Bei 50 Aufgabenzeilen wären das 50
   Unschärfeebenen, die die WebView bei jedem Bild neu rechnet — die bekommen eine leicht durchsichtige
   Füllung ohne Filter. Und Glas braucht etwas zum Verwischen: Der Farbnebel an `body` (drei
   `radial-gradient`, `background-attachment: fixed`) ist Teil des Systems, nicht Zierde. Über einer einzigen
   Füllfarbe sieht jede Glasfläche aus wie graues Plastik.
5. **Deckend und durchsichtig sind zwei Tokenreihen.** `--panel` … `--panel-3` sind deckend und stehen dort,
   wo Transparenz schadet (hinter Häkchen, als Toast-Textfarbe via `color: var(--panel)`, auf Flächen über
   Bildern). `--well` ist die vertiefte Fläche (Board-Spalte, Rinne des Umschalters, Kennzahlkachel) — eigene
   Reihe, weil `--glass-soft` aufhellt und eine Wanne abdunkeln muss; im Dark Mode wäre sie mit einem
   Weißschleier von 4 % unsichtbar.
6. **Status über Farbe, konsistent.** Grün = erledigt/erfolgreich · Blau = Info/Anzahl · Amber = offen/Warnung
   · Rot = destruktiv/überfällig · Grau = inaktiv.
7. **Icons: nur Lucide, keine Emojis.** Größen 12 px (in `btn.icon`), 14–15 px (Zeilen, Buttons), 16–20 px
   (Kartenköpfe, Leerzustände). Icon-only-Buttons brauchen `title`.
8. **Dark Mode ist abgeleitet, nicht parallel.** Nur die Tokens unter `:root[data-theme="dark"]` werden neu
   belegt — keine zweite Regelmenge, keine `.dark`-Varianten in Komponenten.
9. **Typografie sparsam.** 14 px Standard (dichte UI), 11–12 px für Meta/Badges, 25 px für die
   Seitenüberschrift, Systemschrift (`-apple-system` zuerst). Zahlen mit `font-variant-numeric: tabular-nums`
   (Klasse `.num`), damit Werte nicht springen. **Versalien nur für Kleinstlabels** (`.nav-label`,
   `.section-title`, `.field > label`, Board-Spaltenköpfe) — dort sind sie Beschriftung. Überschriften (`h2`,
   Kartenköpfe, Dialogköpfe) stehen in Normalschrift: gesperrte Großbuchstaben lesen sich langsamer, und für
   die Rangordnung genügen Fettung und Farbe.
10. **Jedes Fenster ist schmal genug.** Ein Desktop-Fenster lässt sich auf 400 px ziehen — das ist kein
    Sonderfall, sondern der Normalfall. Nichts darf horizontal überlaufen; wo es eng wird, wird gestapelt.

## Was das Template mitbringt

| Baustein       | Klassen / Komponenten                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Shell          | `.shell`, `.sidebar`, `.nav-item`, `.main`, `.topbar`, `.content`                                              |
| Container      | `.card` (+ `.tight`), `.card-head`, `.grid`                                                                    |
| Steuerelemente | `.btn` (+ `.primary` `.ghost` `.danger` `.icon`), `.input`, `.textarea`, `.select`, `.field`, `.seg`, `.check` |
| Statusanzeige  | `.badge`, `.dot`, `.progress` (+ `.green` `.accent` `.violet` `.thin`), `.stat`                                |
| Layout         | `.grid` (+ `.auto` `.auto-sm` `.auto-lg`), `.split` (+ `.even`), `.two-col`                                    |
| Hilfsklassen   | `.row` (+ `.nowrap`), `.grow`, `.muted`, `.tiny`, `.num`, `.empty`, `.kbd`, `.toast`, `.spin`                  |
| React-Atome    | `Card`, `Modal`, `Segmented`, `Empty`, `ProgressBar`, `ProgressRing`                                           |

Knöpfe heben sich beim Zeigen um 1 px (`translateY(-1px)` plus eine Tiefenstufe mehr) und gehen beim Drücken
auf die Fläche zurück. Der Hauptknopf bleibt dabei gefüllt und wird **heller** — das frühere Umschlagen auf
Weiß mit blauem Text ließ ihn beim Zeigen schwächer wirken als im Ruhezustand, also genau die falsche Richtung
für die Hauptaktion. `:disabled` bedeutet 45 % Deckkraft und `cursor: not-allowed`.

## Bewusst nicht übernommen

Diese Punkte der Original-Guidelines gelten hier **nicht** — sie hängen an der laepple-Plattform und würden im
Template nur in die Irre führen:

- Tailwind-/DaisyUI-Klassen und der ganze `btn-primary`-Disabled-Sonderfall
- `GlassSelect`/`GlassSelectString` statt `<select>`, `DataTable`, `CardGrid`, `SearchBar`
- i18n-Pflicht (`t("namespace.key")`) — lokale Ein-Nutzer-App, Strings stehen direkt im JSX
- Atomic-Design-Pods mit Barrel-Exports (für ~15 Komponenten Overhead; flaches `components/`-Verzeichnis
  genügt)
- Generierte API-Typen und typisierter Client — hier reicht `shared/types.ts` plus `fetch`

Farbwerte der Corporate-Palette (`#0052a3` Blau, `#f46610` Orange) sind als `--brand` und `--accent`
übernommen, damit Eigenbau-Apps optisch zur restlichen Werkzeugkiste passen. Für ein neutrales Projekt einfach
die zwei Variablen in `:root` austauschen.

## Responsive ohne Media-Query-Wildwuchs

Vier Bausteine reichen für praktisch jedes Layout in einer Desktop-App:

| Situation                                  | Lösung                                                     |
| ------------------------------------------ | ---------------------------------------------------------- |
| Gleichrangige Karten (Kennzahlen, Kacheln) | `.grid auto` / `.auto-sm` (150 px) / `.auto-lg` (320 px)   |
| Haupt- + Nebenspalte (Liste + Fortschritt) | `.split` — stapelt unter 900 px, Verhältnis über `--split` |
| Zwei gleich breite Spalten                 | `.split even`                                              |
| Element soll den Restplatz nehmen          | `.grow` (`flex: 1 1 0` + `min-width: 0`)                   |

Dazu die vier Regeln, die die eigentliche Arbeit machen:

1. **`minmax(0, 1fr)` statt `1fr`** in jedem Grid, das Inhalt mit eigener Mindestbreite enthält. `1fr` ist
   `minmax(auto, 1fr)` — die Spalte wächst auf die `min-content`-Breite ihres Inhalts und schiebt das Layout
   auseinander. Genau das erzeugte in `.shell` die App-weite horizontale Scrollbar.
2. **`min-width: 0` auf alles, was schrumpfen soll.** Flex- und Grid-Kinder haben `min-width: auto`, also
   verhindert langer Text jedes Schrumpfen. Steckt im Template in `.card`, `.row`, `.field`, `.grow`,
   `.input`, `.seg`.
3. **`auto-fit` + `minmax(min(100%, X), 1fr)` statt Media Query.** Die Spaltenzahl folgt der Containerbreite,
   und `min(100%, X)` erlaubt auch unterhalb von X px noch eine einzelne Spalte (ohne das Konstrukt entsteht
   dort Überlauf).
4. **Umbrechen statt abschneiden.** `.row` hat `flex-wrap: wrap`, langer Text `overflow-wrap: anywhere`. Wo
   ein Paar zusammenbleiben muss (Label + Wert), gibt es `.row.nowrap`.

Media Queries bleiben für die Dinge, die sich strukturell ändern: Seitenleiste 232 → 196 → 56 px
(Icon-Schiene, Labels via `.nav-text` ausgeblendet) und Innenabstände 28 → 18 → 12 px.

## Charts

ECharts erst bei Bedarf dazunehmen (`"echarts": "npm:echarts@^6.0.0"`). Farben nie hart codieren, sondern die
Tokens zur Laufzeit lesen:

```ts
const style = getComputedStyle(document.documentElement);
const brand = style.getPropertyValue("--brand").trim();
```

Damit folgen Diagramme automatisch dem Theme. Wrapper-Muster (init, `ResizeObserver`, `dispose`) siehe README,
Abschnitt „UI-Hinweise“.

In diesem Projekt liegt das gebündelt in `ui/src/components/Chart.tsx`: `readChartTheme()` liest die Tokens,
`baseAxisStyle()`/`baseTooltip()`/`baseLegend()` geben Achse, Tooltip und Legende dieselbe Handschrift, und
`useThemeKey()` gehört in die `useMemo`-Abhängigkeiten jeder Option — sonst behält ein Diagramm beim
Theme-Wechsel die alten Farben, weil sich die Daten nicht geändert haben.

**Ein Diagramm ist kein Tabellenblatt.** ECharts liefert von Haus aus den Look einer Tabellenkalkulation:
eigene Schrift, Achsenlinien an allen Rändern, Vollfarbbalken mit scharfen Kanten, ein weißer Kasten mit 1px
Rahmen als Tooltip. Nichts davon steht im übrigen Entwurf, also wird nichts davon übernommen. Die Werkzeuge
dafür stehen alle in `Chart.tsx` und sind die einzige Quelle für Diagrammfläche und -form:

- `Chart` setzt vor jeder Option Schrift (`getComputedStyle(document.body).fontFamily` — nicht wiederholt,
  sondern abgelesen) und Einblendrhythmus. Nur überschreiben, wenn ein Diagramm es wirklich braucht.
- `barFill(color, "up" | "right")` gibt Verlauf **und** runde Kappe. Eine Vollfarbe wirkt gedruckt; der
  Verlauf gibt dem Balken einen Körper über der Glasfläche der Karte. Im **Stapel** rundet nur das äußere
  Segment nach außen — ein runder Kopf mitten im Balken reißt eine Lücke zum nächsten Segment.
- `withAlpha()` statt `color-mix`: Auf der Canvas gibt es kein CSS, Verläufe und Flächen brauchen aber mehrere
  Stufen derselben Tokenfarbe.
- `baseAxisStyle()` schaltet die Achsenlinien ab. Die Hilfslinien (`--text` mit 7 %) reichen als Bezug; zwei
  konkurrierende Linienstärken am Rand sind genau der Tabellenblick.
- `baseTooltip()` baut das Milchglas der Dialoge nach. Der Tooltip von ECharts ist HTML, also greift
  `backdrop-filter`: `backgroundColor: "transparent"` schaltet die eigene Füllung ab, `extraCssText` wird nach
  den Inline-Styles gesetzt und gewinnt. Radius und Tiefe kommen aus `--r`/`--e3`.
- Überfahren heißt **heben**, nicht umfärben: `barEmphasis()` legt einen farbigen Schein unter den Balken,
  `shadowPointer()` tönt den Streifen dahinter in `--brand` mit 7 %.

Vier Regeln, die sich beim Bau der Auswertung als die tragenden erwiesen haben:

1. **Eine Antwort je Seite, nicht je Diagramm.** `/api/analytics` liefert alles auf einmal. Sechs Endpunkte
   wären sechs Ladezustände auf einer Seite, die als Ganzes gelesen wird — und sechs Gelegenheiten, dass zwei
   Diagramme verschiedene Zeiträume zeigen.
2. **Serie ohne Lücken.** Zeitreihen werden serverseitig auf jeden Tag aufgefüllt (`fill()` in
   `src/repo/analytics.ts`). Ein `GROUP BY` allein zeigt eine Woche, die es nie gab.
3. **Verdichten im Client.** Tag/Woche/Monat rechnet `bucketize()` aus denselben Tagesdaten. Der Umschalter
   fühlt sich dadurch wie ein Regler an und nicht wie eine neue Seite.
4. **Farbstufen mischen, nicht hinterlegen.** Die Heatmap blendet `--panel-3` nach `--green` (`mix()` in
   `CalendarHeatmap.tsx`). Eine hinterlegte Palette leuchtet im Dark Mode heller als der Untergrund, aus dem
   die Fläche wachsen soll.

Zwei Formen bleiben von der Radienleiter ausgenommen, weil ECharts sie selbst zeichnet und Pixel statt Tokens
nimmt: die Kästchen der Heatmap (`borderRadius: 4` — derselbe Wert wie `.heat-legend i`, beide Stellen ändern
oder keine) und die Balkenkappen (5 px, in `BAR_RADIUS_UP`/`BAR_RADIUS_RIGHT`). Beim Ring von `OpenShareChart`
macht `padAngle` den Spalt und `borderRadius` die Ecken — aus dem geteilten Kuchen wird damit eine Reihe von
Kacheln.

## Nachträglich dazugekommene Klassen

Diese Klassen stehen in `ui/src/styles.css` und gehören zu den Bausteinen aus Stufe 1 (siehe README-Kapitel zu
Dateien, Jobs und Fehlerbehandlung):

| Klasse                                | Wofür                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.toasts` + `.toast.success`/`.error` | Toast-Stapel unten mittig; verwaltet vom Store, nicht von Komponenten                                           |
| `.toast-detail`                       | kopierbarer Fehlertext im Toast (monospace, scrollbar)                                                          |
| `.dropzone`, `.over`, `.busy`         | Ablegefläche für Dateien inklusive Ziehen-Zustand                                                               |
| `.table-wrap` + `.table`              | schlichte Datentabelle mit klebender Kopfzeile für Vorschauen                                                   |
| `.jobs`, `.job`, `.job-state`         | Vorgangsliste mit Zustandsfarbe (grün/rot/amber/brand)                                                          |
| `.log`                                | Protokoll- und Stacktrace-Blöcke                                                                                |
| `.kv`                                 | Schlüssel-Wert-Liste („Über“-Block)                                                                             |
| `.search`                             | Eingabefeld mit Lupe im Feld (Icon absolut, `padding-left` am Input)                                            |
| `a.nav-item`                          | Navigationseinträge sind mit TanStack Router `<Link>`-Elemente (`<a>`) — Unterstreichung und Farbe zurücksetzen |

Neue Tabellenanforderungen (Sortieren, Spaltenwahl, Gruppieren) nicht in dieses CSS hineinschrauben, sondern
`@tanstack/react-table` dazunehmen: kopflos, das CSS hier bleibt gültig.

## Bausteine der Aufgabenverwaltung

| Klasse / Komponente                                              | Wofür                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `.stack` (+ `.tight`)                                            | senkrechter Abstand zwischen Karten — statt `margin` an den Karten selbst          |
| `.quick-add`, `.quick-input`, `.quick-hints`                     | Schnellerfassung; das Feld ist rahmenlos, die Karte trägt den Rahmen               |
| `.task-list`, `.task-row` (+ `.cursor` `.done` `.doing`)         | Listenzeile samt Tastaturcursor                                                    |
| `.task-card` (+ `.cursor` `.dragging`), `.card-marks`            | Board-Karte                                                                        |
| `.board`, `.board-column`, `.board-head`, `.board-body`          | vier Spalten, waagerecht scrollend                                                 |
| `.chip` (+ `.due-past` `.due-today`)                             | Projekt- und Terminmarker — kleiner und rahmenlos, weil vier davon je Zeile hängen |
| `.doing-pulse`                                                   | die **einzige** Animation der App                                                  |
| `.detail`, `.detail-grid`, `.detail-section`, `.title-input`     | Detailansicht (kein Speichern-Knopf)                                               |
| `.subtasks`, `.subtask`, `.grip`, `.check.small`, `.subtask-add` | Prüfliste mit Ziehen zum Sortieren                                                 |
| `.thumbs`, `.thumb`, `.thumb-open`, `.thumb-remove`              | Bildanhänge (`object-fit: contain`, nicht `cover`)                                 |
| `.lightbox`, `.lightbox-bar`, `.lightbox-nav`                    | Bild in voller Größe — eigenes Overlay über dem Radix-Dialog                       |
| `.palette*`                                                      | Befehlspalette (⌘K), oben angehängt statt mittig                                   |
| `.project-row`, `.color-picker`, `.swatch`                       | Projektverwaltung                                                                  |
| `.input.flat`                                                    | Feld ohne Rahmen für Zeilen, die schon in einer Liste stehen                       |
| `.btn.on`                                                        | aktiver Umschaltknopf (In Arbeit, Filter offen)                                    |
| `.kpi`, `.kpi-head`, `.kpi-value`, `.kpi-unit`                   | Kennzahlkachel der Auswertung — Zelle im Raster einer Karte, keine eigene Karte    |
| `.heat-legend`                                                   | Farbstufen der Heatmap als DOM (dieselben Stufen wie im Diagramm)                  |
| `.seg.auto`                                                      | Umschalter im Kartenkopf: Breite nach Inhalt statt gleich verteilt                 |
| React-Bausteine                                                  | `CheckButton`, `PriorityFlag`, `ProjectChip`, `DueBadge`, `TaskMeta`, `Kbd`        |

Vier Punkte, die dabei wichtiger sind als die Klassenliste:

1. **Drei Farbtokens sind dazugekommen** — `--teal`, `--pink`, `--slate` — damit die Projektfarben eine
   unterscheidbare Palette von neun Werten haben. Gespeichert wird der **Tokenname**, nie ein Hex-Wert: sonst
   steht die Farbe fest, während das Theme wechselt (`ui/src/colors.ts`).
2. **Status trägt Farbe, nicht Form.** Rot = überfällig, Amber = heute, Akzent = in Arbeit, Grün = erledigt.
   Ein Termin ohne farbliche Einordnung zwingt den Anwender, jedes Datum im Kopf mit heute zu vergleichen.
3. **Ebenen haben eine feste Reihenfolge** (`z-index`): Karten 1–20, Radix-Dialog 100, Befehlspalette 250,
   Lupe 300, Toasts 400. Escape schließt genau eine Ebene, von oben nach unten (`ui.escape()`). Wer eine neue
   Ebene einzieht, trägt sie in beide Reihenfolgen ein.
4. **`overflow-wrap: break-word` an Titeln**, nicht das von `.grow` geerbte `anywhere`: Sonst zerlegt ein
   schmales Fenster „Monatsabschluss“ mitten im Wort, obwohl der Umbruch zwischen zwei Wörtern gepasst hätte.

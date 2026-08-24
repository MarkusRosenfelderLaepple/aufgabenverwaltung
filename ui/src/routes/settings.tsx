/**
 * Einstellungen: Darstellung, Tagesziel, Daten, Protokoll.
 *
 * Bewusst kurz. Jede Einstellung, die man hier unterbringt, ist eine
 * Entscheidung, die der Anwender treffen muss — die meisten Fragen beantwortet
 * eine gute Vorgabe besser. Was drin ist, hat einen konkreten Anlass:
 * Theme (Arbeitsplatz), Tagesziel (die Fortschrittsanzeige braucht einen
 * Bezugswert), Aufräumgrenze (das Board wächst sonst zu), Sicherung und
 * Protokoll (der Weg zurück, wenn etwas schiefgeht).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bug, Database, DatabaseBackup, Eraser, FolderOpen, Info, Monitor, Moon, Sun } from "lucide-react";
import type { SettingKey } from "../../../shared/schema.ts";
import { client, errorMessage, unwrap } from "../api.ts";
import { infoQuery, logQuery, queryClient, settingsQuery } from "../query.ts";
import { invalidateTasks } from "../query.ts";
import { Card, ConfirmDialog, Segmented } from "../components/atoms.tsx";
import { applyTheme, toast, ui } from "../store/ui.ts";
import type { Theme } from "../store/ui.ts";

export function SettingsRoute() {
  const settings = useQuery(settingsQuery);
  const info = useQuery(infoQuery);
  const [showLog, setShowLog] = useState(false);
  const [purgeAsked, setPurgeAsked] = useState(false);
  const log = useQuery({ ...logQuery, enabled: showLog });

  /**
   * Ein Endpunkt für alle Schlüssel: `PUT /api/settings/:key`. Der Wert wird
   * serverseitig gegen das Schema des Schlüssels geprüft, deshalb reicht hier
   * `unknown` — die Typsicherheit sitzt im Schema, nicht in fünf Mutationen.
   */
  const save = useMutation({
    mutationFn: (input: { key: SettingKey; value: unknown }) =>
      unwrap<{ key: string; value: unknown }>(
        client.api.settings[":key"].$put({ param: { key: input.key }, json: { value: input.value } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const backup = useMutation({
    mutationFn: () => unwrap<{ path: string }>(client.api.backup.$post()),
    onSuccess: (result) => toast.success(`Sicherung geschrieben: ${result.path}`),
  });

  const purge = useMutation({
    mutationFn: (days: number) =>
      unwrap<{ removed: number; orphans: number }>(
        client.api.maintenance["purge-done"].$post({ json: { days } }),
      ),
    onSuccess: (result) => {
      invalidateTasks();
      toast.success(
        result.removed === 0
          ? "Nichts zu löschen — es gibt keine so alten erledigten Aufgaben."
          : `${result.removed} erledigte Aufgabe(n) entfernt.`,
      );
    },
  });

  const revealLog = useMutation({
    mutationFn: () => unwrap<{ ok: true }>(client.api.log.reveal.$post()),
  });

  const revealData = useMutation({
    mutationFn: (path: string) => unwrap<{ ok: true }>(client.api.reveal.$post({ json: { path } })),
  });

  const theme = (settings.data?.theme as Theme | undefined) ?? "system";
  const goal = (settings.data?.dailyGoal as number | undefined) ?? 5;
  const hideDays = (settings.data?.hideDoneOlderThanDays as number | undefined) ?? 14;

  return (
    <div className="stack">
      <div className="split even">
        <Card title="Darstellung" icon={<Monitor size={15} />}>
          <label className="field">
            <span>Theme</span>
            <Segmented
              value={theme}
              options={[
                {
                  value: "system",
                  label: (
                    <>
                      <Monitor size={13} /> System
                    </>
                  ),
                },
                {
                  value: "light",
                  label: (
                    <>
                      <Sun size={13} /> Hell
                    </>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <>
                      <Moon size={13} /> Dunkel
                    </>
                  ),
                },
              ]}
              onChange={(next) => {
                // Sofort anwenden, dann speichern: Auf die Serverantwort zu
                // warten macht aus einem Klick eine sichtbare Verzögerung.
                ui.setTheme(next);
                applyTheme(next);
                save.mutate({ key: "theme", value: next });
              }}
            />
          </label>

          <label className="field">
            <span>Tagesziel — Bezugswert der Fortschrittsanzeige</span>
            <div className="row nowrap">
              <input
                className="input num"
                type="number"
                min={1}
                max={50}
                style={{ width: 90 }}
                defaultValue={goal}
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (value >= 1 && value <= 50 && value !== goal) {
                    save.mutate({ key: "dailyGoal", value });
                  }
                }}
              />
              <span className="tiny muted">erledigte Aufgaben pro Tag</span>
            </div>
          </label>

          <label className="field">
            <span>Erledigte im Board ausblenden nach</span>
            <div className="row nowrap">
              <input
                className="input num"
                type="number"
                min={1}
                max={365}
                style={{ width: 90 }}
                defaultValue={hideDays}
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (value >= 1 && value <= 365 && value !== hideDays) {
                    save.mutate({ key: "hideDoneOlderThanDays", value });
                  }
                }}
              />
              <span className="tiny muted">
                Tagen — die Aufgaben bleiben in „Alle Aufgaben“ sichtbar
              </span>
            </div>
          </label>
        </Card>

        <Card title="Daten" icon={<Database size={15} />}>
          <p className="tiny muted">
            Alles liegt in einer einzigen SQLite-Datei, die Bilder daneben in einem Ordner. Beides gehört in
            die Sicherung.
          </p>

          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => backup.mutate()}
              disabled={backup.isPending}
            >
              <DatabaseBackup size={14} /> {backup.isPending ? "Sichert …" : "Daten sichern"}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => info.data && revealData.mutate(info.data.databasePath)}
              disabled={!info.data}
            >
              <FolderOpen size={14} /> Ordner zeigen
            </button>
          </div>

          <hr className="sep" />

          <p className="tiny muted">
            Aufräumen entfernt erledigte Aufgaben, die länger als 90 Tage fertig sind — samt ihrer Bilder. Das
            ist nicht umkehrbar.
          </p>
          <button
            type="button"
            className="btn ghost danger"
            style={{ marginTop: 10 }}
            onClick={() => setPurgeAsked(true)}
            disabled={purge.isPending}
          >
            <Eraser size={14} /> Erledigte aufräumen
          </button>
        </Card>
      </div>

      <Card title="Über diese Installation" icon={<Info size={15} />}>
        <dl className="kv">
          <dt>Version</dt>
          <dd className="num">{info.data?.version} ({info.data?.buildDate})</dd>
          <dt>Deno</dt>
          <dd className="num">{info.data?.deno}</dd>
          <dt>Datenbank</dt>
          <dd className="tiny">{info.data?.databasePath}</dd>
          <dt>Bilder</dt>
          <dd className="tiny">{info.data?.attachmentDir}</dd>
          <dt>Protokoll</dt>
          <dd className="tiny">{info.data?.logPath}</dd>
        </dl>
      </Card>

      <Card
        title="Protokoll"
        icon={<Bug size={15} />}
        actions={
          <div className="row nowrap">
            <button type="button" className="btn ghost" onClick={() => setShowLog(!showLog)}>
              {showLog ? "Ausblenden" : "Letzte 300 Zeilen"}
            </button>
            <button type="button" className="btn ghost" onClick={() => revealLog.mutate()}>
              <FolderOpen size={14} /> Datei zeigen
            </button>
          </div>
        }
      >
        <p className="tiny muted">
          Im ausgelieferten Fenster gibt es keine Konsole — hier steht, was der Server protokolliert hat.
        </p>
        {showLog && (
          <>
            {log.isPending && <p className="empty">Wird geladen …</p>}
            {log.isError && (
              <p className="empty" style={{ color: "var(--red)" }}>{errorMessage(log.error)}</p>
            )}
            {log.data && (
              <pre className="log" style={{ maxHeight: 320, marginTop: 10 }}>
                {log.data.lines.join("\n") || "— leer —"}
              </pre>
            )}
          </>
        )}
      </Card>

      {purgeAsked && (
        <ConfirmDialog
          title="Erledigte aufräumen"
          confirmLabel="Endgültig löschen"
          message={
            <>
              Alle Aufgaben, die vor mehr als 90 Tagen erledigt wurden, werden mit ihren Unterpunkten und
              Bildern gelöscht. Vorher eine Sicherung anzulegen ist eine Sekunde Arbeit.
            </>
          }
          onClose={() => setPurgeAsked(false)}
          onConfirm={() => purge.mutate(90)}
        />
      )}
    </div>
  );
}

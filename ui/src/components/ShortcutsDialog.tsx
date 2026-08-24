/**
 * Tastenkürzel-Übersicht (⌘/).
 *
 * Sie liest aus derselben Liste, die `keys.ts` beschreibt — nicht aus einer
 * zweiten Aufzählung. Eine Hilfeseite, die die Kürzel doppelt pflegt, ist nach
 * dem dritten neuen Kürzel falsch, und niemand merkt es.
 */
import { Keyboard } from "lucide-react";
import { type Shortcut, SHORTCUTS } from "../keys.ts";
import { ui } from "../store/ui.ts";
import { Kbd, Modal } from "./atoms.tsx";
import { QuickSyntaxHelp } from "./QuickAdd.tsx";

const GROUPS: Shortcut["group"][] = ["Allgemein", "Navigation", "Liste", "Aufgabe"];

export function ShortcutsDialog() {
  return (
    <Modal
      wide
      title="Tastenkürzel"
      icon={<Keyboard size={15} />}
      description="Auf macOS ⌘, auf Windows und Linux Strg."
      onClose={() => ui.setShortcuts(false)}
    >
      <div className="grid auto-lg">
        {GROUPS.map((group) => (
          <section key={group}>
            <h3 className="section-title">{group}</h3>
            <dl className="kv shortcuts">
              {SHORTCUTS.filter((entry) => entry.group === group).map((entry) => (
                <div key={entry.keys} style={{ display: "contents" }}>
                  <dt>
                    <Kbd>{entry.keys}</Kbd>
                  </dt>
                  <dd>{entry.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <section>
          <h3 className="section-title">Kurzschreibweise beim Anlegen</h3>
          <QuickSyntaxHelp />
        </section>
      </div>
    </Modal>
  );
}

/**
 * Aufklappmenü auf Basis von **Radix DropdownMenu**.
 *
 * Wieder gilt: Radix liefert Verhalten, nicht Aussehen — Tastaturbedienung
 * (Pfeiltasten, Home/End, Buchstabensprung), Fokus-Rückgabe, korrektes
 * `role="menu"`/`menuitem`, Kollisionserkennung am Bildschirmrand, Portal
 * gegen abgeschnittene Menüs in scrollenden Containern. Das sind genau die
 * Details, die man selbst zuverlässig falsch macht.
 */
import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";

export function Menu(
  { trigger, children, align = "end" }: {
    trigger: ReactNode;
    children: ReactNode;
    align?: "start" | "center" | "end";
  },
) {
  return (
    <DropdownMenu.Root>
      {/* `asChild`: Der Auslöser bleibt der eigene Button mit eigenen Klassen. */}
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align={align} sideOffset={4} collisionPadding={8}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem(
  { children, onSelect, danger, disabled, shortcut }: {
    children: ReactNode;
    onSelect: () => void;
    danger?: boolean;
    disabled?: boolean;
    shortcut?: string;
  },
) {
  return (
    <DropdownMenu.Item
      className={`menu-item ${danger ? "danger" : ""}`}
      disabled={disabled}
      onSelect={onSelect}
    >
      <span className="grow">{children}</span>
      {shortcut && <span className="kbd">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

/** Häkchen-Eintrag, z. B. für die Spaltenauswahl einer Tabelle. */
export function MenuCheckItem(
  { children, checked, onChange }: {
    children: ReactNode;
    checked: boolean;
    onChange: (next: boolean) => void;
  },
) {
  return (
    <DropdownMenu.CheckboxItem
      className="menu-item"
      checked={checked}
      // Ohne das schließt sich das Menü nach jedem Häkchen — beim Ein- und
      // Ausblenden mehrerer Spalten ist das eine Zumutung.
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={onChange}
    >
      <span className="menu-check">
        <DropdownMenu.ItemIndicator>
          <Check size={13} strokeWidth={3} />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="grow">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-sep" />;
}

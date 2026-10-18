// Carom — the menus: which items each screen shows, where each item's hit
// region lies, and how a frame's keyboard edges and pointer samples drive them.

import type { PointerSample } from "@clockwyrks/simple-2d";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { MenuPress, MenuRect, Screen } from "./game";

/** The copy of the how-to screen's single item. */
export const HOWTO_ITEM = "BACK TO MENU";

export const MENU_ITEM_W = 360;
export const MENU_ITEM_H = 56;
const MENU_ITEM_GAP = 16;

/** The top edge of each menu's first item, per screen. */
const MENU_TOP: Partial<Record<Screen, number>> = {
  title: 360,
  howto: 600,
  paused: 300,
  matchover: 420,
};

/** The items the menu on `screen` shows, or `null` for a screen with no menu. */
export function menuItems(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return [HOWTO_ITEM];
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "countdown":
    case "playing":
      return null;
  }
}

/** The hit region of item `index` on `screen`'s menu, or `null` if there is none. */
export function menuItemRect(screen: Screen, index: number): MenuRect | null {
  const items = menuItems(screen);
  const top = MENU_TOP[screen];
  if (items === null || top === undefined) return null;
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    return null;
  }
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: top + index * (MENU_ITEM_H + MENU_ITEM_GAP),
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

/** The item on `screen`'s menu whose region holds `(x, y)`, or `null`. */
export function menuItemAt(
  screen: Screen,
  x: number,
  y: number,
): number | null {
  const items = menuItems(screen);
  if (items === null) return null;
  for (let i = 0; i < items.length; i++) {
    const r = menuItemRect(screen, i);
    if (r !== null && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return i;
    }
  }
  return null;
}

/** `index` moved by `step` over `count` items, wrapping both ways. */
export function wrapIndex(index: number, step: number, count: number): number {
  return (((index + step) % count) + count) % count;
}

/** What a frame's pointer and touch samples did to a menu. */
export interface PointerOutcome {
  /** The item the latest selecting sample named, or `null` if none did. */
  readonly selected: number | null;
  /** The item a press-and-release (or land-and-lift) confirmed, or `null`. */
  readonly confirmed: number | null;
  /** The contacts still held, with the item each went down on. */
  readonly presses: readonly MenuPress[];
}

/**
 * Reads a frame's pointer samples against `screen`'s menu. A pointer moving onto
 * an item and a contact landing on or travelling onto one select it; a press
 * whose release falls in the same item's region confirms it.
 */
export function readPointer(
  screen: Screen,
  samples: readonly PointerSample[],
  held: readonly MenuPress[],
): PointerOutcome {
  let selected: number | null = null;
  let confirmed: number | null = null;
  const presses = new Map<number, number | null>(
    held.map((p) => [p.id, p.item]),
  );

  for (const sample of samples) {
    const item = menuItemAt(screen, sample.x, sample.y);
    if (sample.type === "down") {
      presses.set(sample.id, item);
    } else if (sample.type === "up") {
      const pressed = presses.get(sample.id);
      presses.delete(sample.id);
      if (item !== null && pressed === item) confirmed = item;
    }
    if (item !== null) selected = item;
  }

  return {
    selected,
    confirmed,
    presses: [...presses].map(([id, item]) => ({ id, item })),
  };
}

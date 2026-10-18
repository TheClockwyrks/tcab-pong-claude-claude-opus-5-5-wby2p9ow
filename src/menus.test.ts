import { describe, expect, it } from "vitest";
import type { PointerSample } from "@clockwyrks/simple-2d";
import { MATCHOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import {
  HOWTO_ITEM,
  menuItemAt,
  menuItemRect,
  menuItems,
  readPointer,
  wrapIndex,
} from "./menus";

function sample(
  type: PointerSample["type"],
  x: number,
  y: number,
  id = 1,
): PointerSample {
  return {
    type,
    x,
    y,
    id,
    primary: true,
    device: "mouse",
    button: null,
    buttons: [],
  };
}

function center(screen: "title" | "paused", index: number): [number, number] {
  const r = menuItemRect(screen, index);
  if (r === null) throw new Error("no rect");
  return [r.x + r.w / 2, r.y + r.h / 2];
}

describe("menu layout", () => {
  it("lists each screen's items", () => {
    expect(menuItems("title")).toEqual(TITLE_ITEMS);
    expect(menuItems("howto")).toEqual([HOWTO_ITEM]);
    expect(menuItems("paused")).toEqual(PAUSE_ITEMS);
    expect(menuItems("matchover")).toEqual(MATCHOVER_ITEMS);
    expect(menuItems("playing")).toBeNull();
    expect(menuItems("countdown")).toBeNull();
  });

  it("lays items out as disjoint regions inside the field", () => {
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      const count = menuItems(screen)?.length ?? 0;
      for (let i = 0; i < count; i++) {
        const r = menuItemRect(screen, i);
        expect(r).not.toBeNull();
        if (r === null) continue;
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y + r.h).toBeLessThanOrEqual(720);
        expect(menuItemAt(screen, r.x + 1, r.y + 1)).toBe(i);
      }
    }
  });

  it("names no region for a missing item or a screen without a menu", () => {
    expect(menuItemRect("title", 3)).toBeNull();
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", 0.5)).toBeNull();
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemAt("playing", 640, 360)).toBeNull();
    expect(menuItemAt("title", 5, 5)).toBeNull();
  });

  it("wraps indices both ways", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(1, 1, 3)).toBe(2);
  });
});

describe("readPointer", () => {
  it("selects the item a pointer moves onto", () => {
    const out = readPointer(
      "title",
      [sample("move", ...center("title", 2))],
      [],
    );
    expect(out).toEqual({ selected: 2, confirmed: null, presses: [] });
  });

  it("confirms a press and release inside one item, across frames", () => {
    const down = readPointer(
      "paused",
      [sample("down", ...center("paused", 1))],
      [],
    );
    expect(down.presses).toEqual([{ id: 1, item: 1 }]);
    expect(down.confirmed).toBeNull();
    const up = readPointer(
      "paused",
      [sample("up", ...center("paused", 1))],
      down.presses,
    );
    expect(up.confirmed).toBe(1);
    expect(up.presses).toEqual([]);
  });

  it("confirms nothing when the edges fall in different regions or outside", () => {
    const moved = readPointer(
      "title",
      [
        sample("down", ...center("title", 0)),
        sample("up", ...center("title", 1)),
      ],
      [],
    );
    expect(moved.confirmed).toBeNull();
    expect(moved.selected).toBe(1);
    const outside = readPointer(
      "title",
      [sample("down", 10, 10), sample("up", ...center("title", 1))],
      [],
    );
    expect(outside.confirmed).toBeNull();
  });
});

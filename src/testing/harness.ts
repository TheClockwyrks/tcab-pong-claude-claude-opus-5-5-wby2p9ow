// Carom — a headless engine for the test suite: a native canvas, a clock that
// supplies its own deltas, and an event target standing in for the page.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import { BACKGROUND, game } from "../game";
import type { CaromDebugApi, CaromState } from "../game";

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  readonly target: EventTarget;
  /** Every cue played, in order. */
  readonly cues: string[];
  key(type: "keydown" | "keyup", code: string): void;
  /** A key pressed and released between frames, read on the next frame. */
  tap(code: string): Promise<void>;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    pointerType?: "mouse" | "touch",
    pointerId?: number,
  ): void;
}

export async function createHarness(stepMs = 1000 / 60): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();

  const key = (type: "keydown" | "keyup", code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };
  return {
    engine,
    debug: engine.debug,
    target,
    cues,
    key,
    async tap(code) {
      key("keydown", code);
      key("keyup", code);
      await engine.advance(1);
    },
    pointer(type, x, y, pointerType = "mouse", pointerId = 1) {
      const pressing = type === "pointerdown";
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId,
          pointerType,
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          buttons: pressing ? 1 : 0,
        }),
      );
    },
  };
}

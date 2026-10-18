import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  CUES,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  PADDLE_SPEED,
  TITLE_ITEMS,
} from "./constants";
import { createHarness } from "./testing/harness";
import type { Harness } from "./testing/harness";

const snap = (h: Harness) => h.debug.snapshot(h.engine.state);

/** Clicks item `index` of the current menu with a mouse. */
function click(h: Harness, index: number): void {
  const r = h.debug.menuItemRect(h.engine.state, index);
  if (r === null) throw new Error(`no menu item ${String(index)}`);
  h.pointer("pointermove", r.x + 5, r.y + 5);
  h.pointer("pointerdown", r.x + 5, r.y + 5);
  h.pointer("pointerup", r.x + 10, r.y + 10);
}

describe("opening state", () => {
  it("opens on the title screen with the declared values", async () => {
    const h = await createHarness();
    const s = snap(h);
    expect(s).toMatchObject({
      version: 1,
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      muted: false,
      ai: { tracking: true, movement: true },
      simTime: 0,
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      held: true,
      holdTimer: HOLD_TIME,
      speed: 0,
    });
    expect(s.obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
  });

  it("registers diagnostics that read the current state", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.clearWorld(s));
    const readings = h.engine.diagnostics();
    const names = readings.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "screen",
        "mode",
        "score",
        "ball pos",
        "ball speed",
        "ball spin",
      ]),
    );
    expect(readings.find((r) => r.name === "ball pos")?.value).toBe("none");
    h.engine.apply((s) => h.debug.spawnBall(s));
    expect(
      h.engine.diagnostics().find((r) => r.name === "ball pos")?.value,
    ).toBe("640.0, 360.0");
    expect(readings.every((r) => r.error === undefined)).toBe(true);
  });

  it("registers every action on the layout", async () => {
    const h = await createHarness();
    expect(ACTIONS.length).toBe(8);
    expect(h.engine.touchControls()).toBeNull();
  });
});

describe("menus by keyboard", () => {
  it("navigates the title menu, wrapping, and starts a solo match", async () => {
    const h = await createHarness();
    await h.tap("KeyW");
    expect(snap(h).menuIndex).toBe(TITLE_ITEMS.length - 1);
    await h.tap("ArrowDown");
    expect(snap(h).menuIndex).toBe(0);
    await h.tap("Escape");
    expect(snap(h).screen).toBe("title");
    await h.tap("Enter");
    const s = snap(h);
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("solo");
    expect(s.ball?.holdTimer).toBeCloseTo(HOLD_TIME - 1 / 60);
  });

  it("moves only on a frame carrying movement and confirm together", async () => {
    const h = await createHarness();
    h.key("keydown", "KeyS");
    h.key("keydown", "Enter");
    h.key("keydown", "KeyW");
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("visits how-to and returns with the remembered selection", async () => {
    const h = await createHarness();
    await h.tap("KeyS");
    await h.tap("KeyS");
    await h.tap("Space");
    expect(snap(h)).toMatchObject({
      screen: "howto",
      menuIndex: 0,
      titleIndex: 2,
    });
    await h.tap("Escape");
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
    await h.tap("Enter");
    expect(snap(h).screen).toBe("howto");
    await h.tap("Enter");
    expect(snap(h).screen).toBe("title");
  });

  it("starts versus, pauses with Escape, resumes once", async () => {
    const h = await createHarness();
    await h.tap("KeyS");
    await h.tap("Enter");
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
    await h.tap("Escape");
    expect(snap(h)).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
    });
    const frozen = snap(h).ball?.holdTimer;
    await h.engine.advance(10);
    expect(snap(h).ball?.holdTimer).toBe(frozen);
    await h.tap("Escape");
    expect(snap(h).screen).toBe("countdown");
  });

  it("restarts and quits from the pause menu", async () => {
    const h = await createHarness();
    await h.tap("Enter");
    h.engine.apply((s) => h.debug.setScore(s, 4, 2));
    await h.tap("KeyP");
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      score: { p1: 0, p2: 0 },
    });
    await h.tap("KeyP");
    await h.tap("ArrowUp");
    expect(snap(h).menuIndex).toBe(2);
    await h.tap("Enter");
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 0 });
  });

  it("resumes from the pause menu's RESUME item", async () => {
    const h = await createHarness();
    await h.tap("Enter");
    await h.engine.advance(70);
    await h.tap("KeyP");
    expect(snap(h).resumeScreen).toBe("playing");
    await h.tap("Enter");
    expect(snap(h).screen).toBe("playing");
  });

  it("toggles mute from any screen and mirrors the bit", async () => {
    const h = await createHarness();
    await h.tap("KeyM");
    expect(snap(h).muted).toBe(true);
    await h.tap("KeyM");
    expect(snap(h).muted).toBe(false);
    h.engine.apply((s) => h.debug.setMuted(s, true));
    expect(snap(h).muted).toBe(true);
    await h.engine.advance(1);
    expect(snap(h).muted).toBe(true);
    await h.tap("KeyM");
    expect(snap(h).muted).toBe(false);
  });
});

describe("menus by pointer and touch", () => {
  it("hovers to select and clicks to confirm", async () => {
    const h = await createHarness();
    const r = h.debug.menuItemRect(h.engine.state, 1);
    if (r === null) throw new Error("no rect");
    h.pointer("pointermove", r.x + 3, r.y + 3);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 1 });
    click(h, 1);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
  });

  it("confirms a touch that lands and lifts on one item over several frames", async () => {
    const h = await createHarness();
    const r = h.debug.menuItemRect(h.engine.state, 2);
    if (r === null) throw new Error("no rect");
    h.pointer("pointerdown", r.x + 4, r.y + 4, "touch", 7);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "title", menuIndex: 2 });
    await h.engine.advance(3);
    h.pointer("pointerup", r.x + 8, r.y + 8, "touch", 7);
    await h.engine.advance(1);
    expect(snap(h).screen).toBe("howto");
  });

  it("lets a keyboard confirm win over a pointer confirm on one frame", async () => {
    const h = await createHarness();
    click(h, 1);
    h.key("keydown", "Enter");
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ mode: "solo", titleIndex: 0 });
  });

  it("drives the match-over menu", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScreen(s, "matchover"));
    click(h, 0);
    await h.engine.advance(1);
    expect(snap(h)).toMatchObject({ screen: "countdown", mode: "versus" });
    h.engine.apply((s) => h.debug.setScreen(s, "matchover"));
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(snap(h).screen).toBe("title");
    h.engine.apply((s) => h.debug.setScreen(s, "matchover"));
    await h.tap("Escape");
    expect(snap(h).screen).toBe("title");
  });
});

describe("the match", () => {
  it("serves after the hold toward the receiver and moves the human paddle", async () => {
    const h = await createHarness();
    await h.tap("Enter");
    h.key("keydown", "KeyS");
    await h.engine.advance(10);
    expect(snap(h).paddles.left.vy).toBe(PADDLE_SPEED);
    await h.engine.advance(48);
    expect(snap(h).screen).toBe("countdown");
    // Pinned against the bottom bound, the held key no longer moves it.
    expect(snap(h).paddles.left.vy).toBe(0);
    await h.engine.advance(1);
    const s = snap(h);
    expect(s.screen).toBe("playing");
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      held: false,
      holdTimer: 0,
      speed: 520,
    });
    expect(s.ball?.vx).toBeLessThan(0);
    expect(s.ball?.trail).toHaveLength(1);
  });

  it("drives the right paddle from the arrows in versus and by AI in solo", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.key("keydown", "ArrowUp");
    await h.engine.advance(2);
    expect(snap(h).paddles.right.vy).toBe(-PADDLE_SPEED);
    expect(snap(h).paddles.left.vy).toBe(0);
    h.key("keyup", "ArrowUp");
    h.engine.apply((s) => h.debug.setMode(s, "solo"));
    h.engine.apply((s) => h.debug.setPaddleCy(s, "right", 100));
    await h.engine.advance(1);
    expect(snap(h).paddles.right.vy).toBeGreaterThan(0);
  });

  it("scores a point, plays the cue, and parks the ball for the scored-on side", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 1270, 600));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 900, 0));
    await h.engine.advance(2);
    const s = snap(h);
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s).toMatchObject({ screen: "countdown", receiver: "right" });
    expect(s.ball).toMatchObject({
      x: 640,
      y: 360,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect(h.cues).toContain(CUES.score);
  });

  it("ends the match at 11 with a two-point lead", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setScore(s, 10, 10));
    h.engine.apply((s) => h.debug.setBallPosition(s, 5, 600));
    h.engine.apply((s) => h.debug.setBallVelocity(s, -900, 0));
    await h.engine.advance(3);
    expect(snap(h)).toMatchObject({
      screen: "countdown",
      score: { p1: 10, p2: 11 },
      winner: null,
    });

    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallPosition(s, 5, 600));
    h.engine.apply((s) => h.debug.setBallVelocity(s, -900, 0));
    h.engine.apply((s) => h.debug.setMenuIndex(s, 1));
    await h.engine.advance(3);
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "matchover",
      winner: "right",
      menuIndex: 0,
    });
    expect(s.ball?.x).toBeLessThan(0);
  });

  it("plays one cue per event kind per frame", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setBallPosition(s, 640, 20));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 0, -600));
    await h.engine.advance(2);
    expect(h.cues.filter((c) => c === CUES.wallBounce)).toHaveLength(1);
  });

  it("returns a struck ball with the spin of the moving paddle", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    h.engine.apply((s) => h.debug.setPaddleVy(s, "left", 300));
    h.engine.apply((s) => h.debug.setBallPosition(s, 100, 360));
    h.engine.apply((s) => h.debug.setBallVelocity(s, -600, 0));
    await h.engine.advance(6);
    const s = snap(h);
    expect(s.paddles.left.vy).toBe(300);
    expect(s.ball?.vx).toBeGreaterThan(0);
    expect(s.ball?.spin).toBeGreaterThan(0);
    expect(h.cues).toContain(CUES.paddleHit);
  });
});

describe("frame-rate independence", () => {
  /** A rally struck back by a moving right paddle, read at `midSeconds` and `seconds`. */
  async function rally(stepMs: number, midSeconds: number, seconds: number) {
    const h = await createHarness(stepMs);
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "right", true));
    h.engine.apply((s) => h.debug.setPaddleCy(s, "right", 420));
    h.engine.apply((s) => h.debug.setPaddleVy(s, "right", -120));
    h.engine.apply((s) => h.debug.setBallPosition(s, 900, 400));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 600, -40));
    h.engine.apply((s) => h.debug.setBallSpin(s, 150));
    const frames = (t: number) => Math.round((t * 1000) / stepMs);
    await h.engine.advance(frames(midSeconds));
    const mid = snap(h);
    await h.engine.advance(frames(seconds - midSeconds));
    return { mid, snap: snap(h), cues: h.cues };
  }

  it(
    "reaches the same contacts and point under 2 ms and 16 ms frames",
    { timeout: 30_000 },
    async () => {
      const fine = await rally(2, 1.2, 3.2);
      const coarse = await rally(16, 1.2, 3.2);
      expect(fine.cues).toContain(CUES.paddleHit);
      expect(coarse.cues).toEqual(fine.cues);
      expect(fine.snap.score).toEqual({ p1: 0, p2: 1 });
      expect(coarse.snap.score).toEqual(fine.snap.score);
      const a = fine.mid.ball;
      const b = coarse.mid.ball;
      if (a === null || b === null) throw new Error("ball missing");
      expect(Math.abs(a.speed - b.speed)).toBeLessThan(10);
      expect(a.vx).toBeLessThan(0);
      expect(Math.sign(a.vx)).toBe(Math.sign(b.vx));
      expect(Math.sign(a.vy)).toBe(Math.sign(b.vy));
    },
  );
});

describe("rendering", () => {
  it("draws every screen through the engine's context", async () => {
    const h = await createHarness();
    h.engine.startRecording();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      h.engine.apply((s) => h.debug.setScreen(s, screen));
      await h.engine.advance(1);
    }
    h.engine.apply((s) => h.debug.setMuted(s, true));
    h.engine.apply((s) => h.debug.setBallSpin(s, 600));
    h.engine.apply((s) => h.debug.setWinner(s, "left"));
    await h.engine.advance(1);
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setWinner(s, "right"));
    await h.engine.advance(1);
    h.engine.apply((s) => h.debug.setWinner(s, null));
    await h.engine.advance(1);
    h.engine.apply((s) => h.debug.setMode(s, "solo"));
    h.engine.apply((s) => h.debug.setWinner(s, "right"));
    await h.engine.advance(1);
    h.engine.apply((s) => h.debug.clearWorld(s));
    h.engine.apply((s) => h.debug.setScreen(s, "countdown"));
    await h.engine.advance(1);
    const recording = h.engine.stopRecording();
    expect(recording.frames).toHaveLength(11);
    expect(recording.frames.every((f) => f.ops.length > 0)).toBe(true);
  });
});

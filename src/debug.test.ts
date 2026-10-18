import { describe, expect, it } from "vitest";
import { HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type { CaromView, Screen, Side } from "./game";
import { createHarness } from "./testing/harness";
import type { Harness } from "./testing/harness";

const snap = (h: Harness) => h.debug.snapshot(h.engine.state);

describe("debug surface: the world", () => {
  it("clears and respawns the ball and obstacles in their fixed order", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.clearWorld(s));
    expect(snap(h)).toMatchObject({ ball: null, obstacles: [] });
    h.engine.apply((s) => h.debug.spawnObstacle(s, 1));
    h.engine.apply((s) => h.debug.spawnObstacle(s, 0));
    h.engine.apply((s) => h.debug.spawnObstacle(s, 1));
    expect(snap(h).obstacles.map((o) => o.index)).toEqual([0, 1]);
    expect(snap(h).obstacles[1]).toEqual({
      index: 1,
      cx: OBSTACLE_CENTERS[1].x,
      cy: OBSTACLE_CENTERS[1].y,
    });
    h.engine.apply((s) => h.debug.spawnBall(s));
    expect(snap(h).ball).toMatchObject({
      x: 640,
      y: 360,
      held: true,
      holdTimer: HOLD_TIME,
    });
  });

  it("refuses an obstacle index naming no obstacle", async () => {
    const h = await createHarness();
    expect(() => h.engine.apply((s) => h.debug.spawnObstacle(s, 2))).toThrow();
    expect(() => h.engine.apply((s) => h.debug.spawnObstacle(s, -1))).toThrow();
  });

  it("leaves an absent ball out of play", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.clearWorld(s));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    await h.engine.advance(5);
    expect(snap(h)).toMatchObject({
      ball: null,
      screen: "playing",
      score: { p1: 0, p2: 0 },
    });
    h.engine.apply((s) => h.debug.setScreen(s, "countdown"));
    await h.engine.advance(80);
    expect(snap(h).screen).toBe("countdown");
  });

  it("resets every declared field but the mute bit", async () => {
    const h = await createHarness();
    await h.tap("KeyM");
    await h.tap("Enter");
    await h.engine.advance(80);
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "left", true));
    h.engine.apply((s) => h.debug.setPaddleVy(s, "left", 50));
    h.engine.apply((s) => h.debug.setAiMovement(s, false));
    h.engine.apply((s) => h.debug.reset(s));
    const s = snap(h);
    expect(s).toMatchObject({
      screen: "title",
      simTime: 0,
      muted: true,
      titleIndex: 0,
      ai: { tracking: true, movement: true },
    });
    expect(s.paddles.left).toEqual({
      cy: 360,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ball?.trail).toEqual([]);
  });

  it("reconciles without changing anything", async () => {
    const h = await createHarness();
    await h.tap("Enter");
    await h.engine.advance(70);
    h.engine.apply((s) => h.debug.setBallVelocity(s, 30, 40));
    const before = h.engine.state;
    const after = h.debug.reconcile(before);
    expect(after).toEqual(before);
    expect(after).not.toBe(before);
    expect(h.debug.snapshot(after).ball?.speed).toBe(50);
  });
});

describe("debug surface: fields", () => {
  it("sets each screen and menu field alone", async () => {
    const h = await createHarness();
    const screens: Screen[] = [
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
      "title",
    ];
    for (const screen of screens) {
      h.engine.apply((s) => h.debug.setScreen(s, screen));
      expect(snap(h).screen).toBe(screen);
    }
    h.engine.apply((s) => h.debug.setMode(s, "versus"));
    h.engine.apply((s) => h.debug.setMenuIndex(s, 2));
    h.engine.apply((s) => h.debug.setTitleIndex(s, 1));
    h.engine.apply((s) => h.debug.setResumeScreen(s, "countdown"));
    h.engine.apply((s) => h.debug.setScore(s, 7, 9));
    h.engine.apply((s) => h.debug.setWinner(s, "left"));
    h.engine.apply((s) => h.debug.setReceiver(s, "right"));
    expect(snap(h)).toMatchObject({
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      score: { p1: 7, p2: 9 },
      winner: "left",
      receiver: "right",
    });
    h.engine.apply((s) => h.debug.setWinner(s, null));
    expect(snap(h).winner).toBeNull();
  });

  it("sets paddle fields, keeping drivenVy apart from vy", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setPaddleCy(s, "right", 200));
    h.engine.apply((s) => h.debug.setPaddleVy(s, "right", -240));
    expect(snap(h).paddles.right).toEqual({
      cy: 200,
      vy: 0,
      drivenVy: -240,
      driven: false,
    });
    h.engine.apply((s) => h.debug.setPaddleDriven(s, "right", true));
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    await h.engine.advance(1);
    expect(snap(h).paddles.right.vy).toBe(-240);
    expect(snap(h).paddles.right.cy).toBeCloseTo(196);
    expect(snap(h).paddles.left.driven).toBe(false);
  });

  it("sets ball fields and serves through the game's own rule", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setBallPosition(s, 300, 200));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 3, 4));
    h.engine.apply((s) => h.debug.setBallSpin(s, -120));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallServeSign(s, -1));
    expect(snap(h).ball).toMatchObject({
      x: 300,
      y: 200,
      speed: 5,
      spin: -120,
      held: false,
      serveSign: -1,
    });
    h.engine.apply((s) => h.debug.spawnBall(s));
    h.engine.apply((s) => h.debug.setBallServeSign(s, 1));
    h.engine.apply((s) => h.debug.setReceiver(s, "right"));
    h.engine.apply((s) => h.debug.setScreen(s, "countdown"));
    h.engine.apply((s) => h.debug.setBallHoldTimer(s, 0));
    await h.engine.advance(1);
    const s = snap(h);
    expect(s.screen).toBe("playing");
    expect(s.ball?.vx).toBeGreaterThan(0);
    expect(s.ball?.vy).toBeGreaterThan(0);
  });

  it("draws serve signs both ways over many draws", async () => {
    const h = await createHarness();
    const seen = new Set<number>();
    for (let i = 0; i < 64; i++) {
      h.engine.apply((s) => h.debug.drawBallServeSign(s));
      seen.add(snap(h).ball?.serveSign ?? 0);
    }
    expect([...seen].sort()).toEqual([-1, 1]);
  });

  it("gates the AI's faculties", async () => {
    const h = await createHarness();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    h.engine.apply((s) => h.debug.setPaddleCy(s, "right", 100));
    h.engine.apply((s) => h.debug.setAiMovement(s, false));
    await h.engine.advance(3);
    expect(snap(h).paddles.right).toMatchObject({ cy: 100, vy: 0 });
    h.engine.apply((s) => h.debug.setAiMovement(s, true));
    h.engine.apply((s) => h.debug.setAiTracking(s, false));
    h.engine.apply((s) => h.debug.setBallHeld(s, false));
    h.engine.apply((s) => h.debug.setBallPosition(s, 900, 80));
    h.engine.apply((s) => h.debug.setBallVelocity(s, 200, 0));
    await h.engine.advance(1);
    expect(snap(h).paddles.right.vy).toBeGreaterThan(0);
    expect(snap(h).ai).toEqual({ tracking: false, movement: true });
  });

  it("fails loudly on a ball that is not there and on bad arguments", async () => {
    const h = await createHarness();
    const bad: ((s: CaromView) => unknown)[] = [
      (s) => h.debug.setScreen(s, "lobby" as Screen),
      (s) => h.debug.setMode(s, "coop" as "solo"),
      (s) => h.debug.setMenuIndex(s, -1),
      (s) => h.debug.setResumeScreen(s, "title" as "playing"),
      (s) => h.debug.setScore(s, 1.5, 0),
      (s) => h.debug.setReceiver(s, "up" as Side),
      (s) => h.debug.setPaddleCy(s, "left", Number.NaN),
      (s) => h.debug.setPaddleDriven(s, "left", "yes" as unknown as boolean),
      (s) => h.debug.setBallServeSign(s, 0 as 1),
    ];
    for (const pose of bad) expect(() => pose(h.engine.state)).toThrow();

    h.engine.apply((s) => h.debug.clearWorld(s));
    const needBall: ((s: CaromView) => unknown)[] = [
      (s) => h.debug.setBallPosition(s, 1, 1),
      (s) => h.debug.setBallVelocity(s, 1, 1),
      (s) => h.debug.setBallSpin(s, 1),
      (s) => h.debug.setBallHeld(s, true),
      (s) => h.debug.setBallHoldTimer(s, 1),
      (s) => h.debug.setBallServeSign(s, 1),
      (s) => h.debug.drawBallServeSign(s),
    ];
    for (const pose of needBall)
      expect(() => pose(h.engine.state)).toThrow(/no ball/);
  });

  it("reads menu regions on menu screens only", async () => {
    const h = await createHarness();
    expect(h.debug.menuItemRect(h.engine.state, 0)).toMatchObject({
      w: 360,
      h: 56,
    });
    expect(h.debug.menuItemRect(h.engine.state, 3)).toBeNull();
    h.engine.apply((s) => h.debug.setScreen(s, "playing"));
    expect(h.debug.menuItemRect(h.engine.state, 0)).toBeNull();
  });
});

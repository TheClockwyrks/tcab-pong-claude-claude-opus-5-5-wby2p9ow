import { describe, expect, it } from "vitest";
import {
  AI_HOME_Y,
  AI_SPEED,
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  OBSTACLES,
  P1_X1,
  P2_X0,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  TRAIL_TIME,
} from "./constants";
import type { BallState, PaddleState } from "./game";
import {
  advanceBall,
  aiVelocity,
  integratePaddle,
  paddleBounce,
  paddleRect,
  recordTrail,
  resolveRect,
  resolveWalls,
  serveBall,
} from "./physics";

function ball(over: Partial<BallState> = {}): BallState {
  return {
    x: 640,
    y: 360,
    vx: 0,
    vy: 0,
    spin: 0,
    held: false,
    holdTimer: 0,
    serveSign: 1,
    trail: [],
    ...over,
  };
}

const paddle = (cy: number, vy = 0): PaddleState => ({
  cy,
  vy,
  driven: false,
  drivenVy: 0,
});

const AI_ON = { tracking: true, movement: true };

describe("integratePaddle", () => {
  it("moves at the given velocity inside the bounds", () => {
    const p = integratePaddle(paddle(360), 720, 0.1);
    expect(p.cy).toBeCloseTo(432);
    expect(p.vy).toBe(720);
  });

  it("clamps at the bounds and reports the velocity actually travelled", () => {
    const top = integratePaddle(paddle(PADDLE_MIN_CY + 10), -720, 0.1);
    expect(top.cy).toBe(PADDLE_MIN_CY);
    expect(top.vy).toBeCloseTo(-100);
    const pinned = integratePaddle(paddle(PADDLE_MAX_CY), 720, 1 / 60);
    expect(pinned.cy).toBe(PADDLE_MAX_CY);
    expect(pinned.vy).toBe(0);
  });

  it("keeps the velocity when dt is zero", () => {
    expect(integratePaddle(paddle(PADDLE_MAX_CY), 720, 0).vy).toBe(720);
  });
});

describe("aiVelocity", () => {
  it("returns home with the home deadzone while nothing approaches", () => {
    expect(aiVelocity(AI_HOME_Y + 10, AI_ON, null, true, 1 / 60)).toBe(0);
    expect(aiVelocity(100, AI_ON, null, true, 1 / 60)).toBe(AI_SPEED);
    expect(aiVelocity(600, AI_ON, null, true, 1 / 60)).toBe(-AI_SPEED);
  });

  it("tracks an approaching ball on the playing screen only", () => {
    const incoming = ball({ y: 100, vx: 300, vy: 0 });
    expect(aiVelocity(360, AI_ON, incoming, true, 1 / 60)).toBe(-AI_SPEED);
    expect(aiVelocity(360, AI_ON, incoming, false, 1 / 60)).toBe(0);
    const receding = ball({ y: 100, vx: -300 });
    expect(aiVelocity(360, AI_ON, receding, true, 1 / 60)).toBe(0);
  });

  it("leads by the reaction lag and slows to land on its target", () => {
    const incoming = ball({ y: 300, vx: 300, vy: 100 });
    // target = 300 - 100 * 0.12 = 288; diff = -2 is inside the deadzone.
    expect(aiVelocity(290, AI_ON, incoming, true, 1 / 60)).toBe(0);
    // diff = -12 over a 1 s frame is 12 units per second.
    expect(aiVelocity(300, AI_ON, incoming, true, 1)).toBeCloseTo(-12);
  });

  it("is gated by its tracking and movement faculties", () => {
    const incoming = ball({ y: 100, vx: 300 });
    expect(
      aiVelocity(
        360,
        { tracking: false, movement: true },
        incoming,
        true,
        1 / 60,
      ),
    ).toBe(0);
    expect(
      aiVelocity(100, { tracking: true, movement: false }, null, true, 1 / 60),
    ).toBe(0);
  });
});

describe("resolveRect", () => {
  const rect = OBSTACLES[0]; // x 480..500, y 150..290

  it("ignores a ball outside the expanded rectangle", () => {
    expect(resolveRect(ball({ x: rect.x0 - BALL_R, y: 200 }), rect)).toBeNull();
  });

  it("places the ball off the shallowest face and reflects into it", () => {
    const left = resolveRect(ball({ x: rect.x0 - 5, y: 220, vx: 300 }), rect);
    expect(left?.face).toBe("left");
    expect(left?.ball.x).toBe(rect.x0 - BALL_R);
    expect(left?.ball.vx).toBe(-300);

    const right = resolveRect(ball({ x: rect.x1 + 5, y: 220, vx: -300 }), rect);
    expect(right?.face).toBe("right");
    expect(right?.ball.x).toBe(rect.x1 + BALL_R);
    expect(right?.ball.vx).toBe(300);

    const top = resolveRect(ball({ x: 490, y: rect.y0 - 3, vy: 200 }), rect);
    expect(top?.face).toBe("top");
    expect(top?.ball.y).toBe(rect.y0 - BALL_R);
    expect(top?.ball.vy).toBe(-200);

    const bottom = resolveRect(
      ball({ x: 490, y: rect.y1 + 3, vy: -200 }),
      rect,
    );
    expect(bottom?.face).toBe("bottom");
    expect(bottom?.ball.y).toBe(rect.y1 + BALL_R);
    expect(bottom?.ball.vy).toBe(200);
  });

  it("leaves a velocity already leaving the face alone", () => {
    const out = resolveRect(ball({ x: rect.x0 - 5, y: 220, vx: -300 }), rect);
    expect(out?.ball.vx).toBe(-300);
    const outTop = resolveRect(ball({ x: 490, y: rect.y0 - 3, vy: -50 }), rect);
    expect(outTop?.ball.vy).toBe(-50);
    const outRight = resolveRect(
      ball({ x: rect.x1 + 5, y: 220, vx: 10 }),
      rect,
    );
    expect(outRight?.ball.vx).toBe(10);
    const outBottom = resolveRect(
      ball({ x: 490, y: rect.y1 + 3, vy: 50 }),
      rect,
    );
    expect(outBottom?.ball.vy).toBe(50);
  });

  it("breaks a tie toward the earlier face", () => {
    const square = { x0: 0, y0: 0, x1: 10, y1: 10 };
    // Center of a square: all four depths equal, so the left face wins.
    expect(resolveRect(ball({ x: 5, y: 5 }), square)?.face).toBe("left");
  });
});

describe("resolveWalls", () => {
  it("reflects off the top and bottom walls only when heading into them", () => {
    expect(resolveWalls(ball({ y: 5, vy: -100 }))).toMatchObject({
      y: BALL_R,
      vy: 100,
    });
    expect(resolveWalls(ball({ y: FIELD_H - 5, vy: 100 }))).toMatchObject({
      y: FIELD_H - BALL_R,
      vy: -100,
    });
    expect(resolveWalls(ball({ y: 5, vy: 100 }))).toBeNull();
  });
});

describe("paddleBounce", () => {
  it("sends a center hit straight back, faster", () => {
    const out = paddleBounce(ball({ x: 70, y: 360, vx: -500 }), "left", 360, 0);
    expect(out.vx).toBeCloseTo(500 * SPEED_MULT);
    expect(out.vy).toBeCloseTo(0);
    expect(out.x).toBe(P1_X1 + BALL_R);
  });

  it("angles an edge hit at the maximum bounce angle", () => {
    const out = paddleBounce(ball({ y: 360 - 80, vx: 500 }), "right", 360, 0);
    const speed = 500 * SPEED_MULT;
    expect(out.vx).toBeCloseTo(-speed * Math.cos(MAX_BOUNCE_ANGLE));
    expect(out.vy).toBeCloseTo(-speed * Math.sin(MAX_BOUNCE_ANGLE));
    expect(out.x).toBe(P2_X0 - BALL_R);
  });

  it("caps the speed and adds clamped spin from the paddle's motion", () => {
    const fast = paddleBounce(ball({ vx: -SPEED_CAP }), "left", 360, 400);
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(SPEED_CAP);
    expect(fast.spin).toBeCloseTo(400 * SPIN_FROM_PADDLE);
    const clamped = paddleBounce(
      ball({ vx: -500, spin: -800 }),
      "left",
      360,
      -720,
    );
    expect(clamped.spin).toBe(-SPIN_CLAMP);
  });

  it("names a paddle's rectangle by side", () => {
    expect(paddleRect("left", 360)).toEqual({
      x0: 48,
      x1: 64,
      y0: 305,
      y1: 415,
    });
    expect(paddleRect("right", 100)).toEqual({
      x0: 1216,
      x1: 1232,
      y0: 45,
      y1: 155,
    });
  });
});

describe("advanceBall", () => {
  const still = { left: paddle(360), right: paddle(360) };

  it("flies straight without spin", () => {
    const { ball: out, events } = advanceBall(
      ball({ vx: 300 }),
      still,
      [],
      0.1,
    );
    expect(out.x).toBeCloseTo(670);
    expect(out.y).toBeCloseTo(360);
    expect(events).toEqual({
      paddleHit: false,
      wallBounce: false,
      obstacleBounce: false,
    });
  });

  it("curves clockwise under positive spin, keeping speed, as spin decays", () => {
    const { ball: out } = advanceBall(
      ball({ vx: 400, spin: 400 }),
      still,
      [],
      0.4,
    );
    expect(out.vy).toBeGreaterThan(0);
    expect(Math.hypot(out.vx, out.vy)).toBeCloseTo(400);
    expect(out.spin).toBeCloseTo(400 * Math.pow(0.5, 0.5));
  });

  it("does not turn a ball at rest", () => {
    const { ball: out } = advanceBall(ball({ spin: 300 }), still, [], 0.1);
    expect(out.vx).toBe(0);
    expect(out.vy).toBe(0);
  });

  it("raises a paddle hit off the left paddle", () => {
    const start = ball({ x: 90, y: 360, vx: -600 });
    const { ball: out, events } = advanceBall(start, still, [], 0.1);
    expect(events.paddleHit).toBe(true);
    expect(out.vx).toBeGreaterThan(0);
  });

  it("treats a paddle end cap like a wall", () => {
    const start = ball({ x: 56, y: 290, vy: 300 });
    const { ball: out, events } = advanceBall(start, still, [], 1 / 60);
    expect(events.wallBounce).toBe(true);
    expect(events.paddleHit).toBe(false);
    expect(out.vy).toBe(-300);
  });

  it("bounces off present obstacles only", () => {
    const start = ball({ x: 440, y: 220, vx: 600 });
    const hit = advanceBall(
      start,
      still,
      [{ index: 0, cx: 490, cy: 220 }],
      0.2,
    );
    expect(hit.events.obstacleBounce).toBe(true);
    expect(hit.ball.vx).toBe(-600);
    const miss = advanceBall(start, still, [], 0.2);
    expect(miss.events.obstacleBounce).toBe(false);
    expect(miss.ball.vx).toBe(600);
  });

  it("reflects off the walls", () => {
    const { ball: out, events } = advanceBall(
      ball({ y: 30, vy: -500 }),
      still,
      [],
      0.1,
    );
    expect(events.wallBounce).toBe(true);
    expect(out.vy).toBe(500);
  });
});

describe("serve and trail", () => {
  it("serves toward the receiver at the serve angle with the serve sign", () => {
    const out = serveBall(
      ball({ held: true, holdTimer: -0.01, serveSign: -1 }),
      "left",
    );
    expect(out.held).toBe(false);
    expect(out.holdTimer).toBe(0);
    expect(out.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE));
    expect(out.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE));
    expect(serveBall(ball(), "right").vx).toBeGreaterThan(0);
  });

  it("keeps only the samples of the last TRAIL_TIME seconds", () => {
    let b = ball();
    for (let i = 0; i <= 30; i++) b = recordTrail({ ...b, x: i }, i / 60);
    const now = 30 / 60;
    expect(b.trail[b.trail.length - 1]).toEqual({ x: 30, y: 360, t: now });
    expect(b.trail.every((s) => now - s.t <= TRAIL_TIME)).toBe(true);
    expect(b.trail.length).toBe(8);
  });
});

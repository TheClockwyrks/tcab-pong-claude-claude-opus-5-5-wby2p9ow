// Carom — the render-free simulation core: paddle integration, the AI rule, the
// ball's sub-stepped flight and collisions, the serve, and the trail. Every
// function here is pure over plain values and integrates against `dt` seconds.

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
} from "./constants";
import type { Rect } from "./constants";
import type {
  AiState,
  BallState,
  ObstacleState,
  PaddleState,
  Side,
  TrailSample,
} from "./game";

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

// ---- Paddles ---------------------------------------------------------------

/**
 * Moves a paddle at `vy` for `dt` seconds and clamps it to the field. Where the
 * clamp cut the move short, `vy` becomes the velocity actually travelled, so a
 * paddle pinned against a bound carries `vy = 0` (specs/playfield.md).
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const raw = paddle.cy + vy * dt;
  const next = clamp(raw, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== raw && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** The AI's chosen velocity for its paddle this frame (specs/modes/single-player.md). */
export function aiVelocity(
  paddleCy: number,
  ai: AiState,
  ball: BallState | null,
  playing: boolean,
  dt: number,
): number {
  if (!ai.movement) return 0;
  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && playing && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }
  const diff = target - paddleCy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}

// ---- Collision -------------------------------------------------------------

export type Face = "left" | "right" | "top" | "bottom";

/** The rectangle a paddle occupies on `side` with its center at `cy`. */
export function paddleRect(side: Side, cy: number): Rect {
  const [x0, x1] = side === "left" ? [P1_X0, P1_X1] : [P2_X0, P2_X1];
  return { x0, x1, y0: cy - PADDLE_HALF, y1: cy + PADDLE_HALF };
}

interface Contact {
  readonly face: Face;
  readonly ball: BallState;
}

/**
 * Resolves a ball against an axis-aligned rectangle by the shared rule of
 * specs/balls.md: the struck face is the shallowest penetration (ties to the
 * first of left, right, top, bottom), the ball is placed `BALL_R` off it, and
 * the normal velocity is reversed if it points into the face. `null` when the
 * ball's center is not strictly inside the expanded rectangle.
 */
export function resolveRect(ball: BallState, rect: Rect): Contact | null {
  const { x, y } = ball;
  const ex0 = rect.x0 - BALL_R;
  const ex1 = rect.x1 + BALL_R;
  const ey0 = rect.y0 - BALL_R;
  const ey1 = rect.y1 + BALL_R;
  if (!(x > ex0 && x < ex1 && y > ey0 && y < ey1)) return null;

  const depths: readonly [Face, number][] = [
    ["left", x - ex0],
    ["right", ex1 - x],
    ["top", y - ey0],
    ["bottom", ey1 - y],
  ];
  let [face, best] = depths[0];
  for (const [candidate, depth] of depths) {
    if (depth < best) {
      face = candidate;
      best = depth;
    }
  }

  switch (face) {
    case "left":
      return {
        face,
        ball: { ...ball, x: ex0, vx: ball.vx > 0 ? -ball.vx : ball.vx },
      };
    case "right":
      return {
        face,
        ball: { ...ball, x: ex1, vx: ball.vx < 0 ? -ball.vx : ball.vx },
      };
    case "top":
      return {
        face,
        ball: { ...ball, y: ey0, vy: ball.vy > 0 ? -ball.vy : ball.vy },
      };
    case "bottom":
      return {
        face,
        ball: { ...ball, y: ey1, vy: ball.vy < 0 ? -ball.vy : ball.vy },
      };
  }
}

/** Reflects the ball off the top and bottom walls; `null` when it touches neither. */
export function resolveWalls(ball: BallState): BallState | null {
  if (ball.y - BALL_R < 0 && ball.vy < 0) {
    return { ...ball, y: BALL_R, vy: -ball.vy };
  }
  if (ball.y + BALL_R > FIELD_H && ball.vy > 0) {
    return { ...ball, y: FIELD_H - BALL_R, vy: -ball.vy };
  }
  return null;
}

/**
 * The paddle bounce: the outgoing angle from where the ball met the paddle, the
 * speed-up, the spin the paddle's own motion imparts, and the placement off the
 * paddle's front face (specs/balls.md, Paddle bounce and spin).
 */
export function paddleBounce(
  ball: BallState,
  side: Side,
  paddleCy: number,
  paddleVy: number,
): BallState {
  const offset = clamp((ball.y - paddleCy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(ball.vx, ball.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  return {
    ...ball,
    vx: dir * speed * Math.cos(theta),
    vy: speed * Math.sin(theta),
    spin: clamp(
      ball.spin + paddleVy * SPIN_FROM_PADDLE,
      -SPIN_CLAMP,
      SPIN_CLAMP,
    ),
    x: side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R,
  };
}

// ---- Flight ----------------------------------------------------------------

/** Which kinds of contact a frame raised, each played as one cue. */
export interface BallEvents {
  readonly paddleHit: boolean;
  readonly wallBounce: boolean;
  readonly obstacleBounce: boolean;
}

export const NO_EVENTS: BallEvents = {
  paddleHit: false,
  wallBounce: false,
  obstacleBounce: false,
};

/** The paddles as the ball's flight sees them: centers and integrated velocities. */
export interface PaddlePair {
  readonly left: PaddleState;
  readonly right: PaddleState;
}

/**
 * Advances the ball one frame of `dt` seconds in sub-steps of at most
 * `MAX_SUBSTEP` units of travel, each turning by spin, decaying the spin,
 * moving, and resolving the walls, the paddles, and the obstacles present.
 */
export function advanceBall(
  ball: BallState,
  paddles: PaddlePair,
  obstacles: readonly ObstacleState[],
  dt: number,
): { ball: BallState; events: BallEvents } {
  const startSpeed = Math.hypot(ball.vx, ball.vy);
  const n = Math.max(1, Math.ceil((startSpeed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const decay = Math.pow(0.5, h / SPIN_HALFLIFE);
  const rects = obstacles.map((o) => OBSTACLES[o.index]);

  let b = ball;
  let paddleHit = false;
  let wallBounce = false;
  let obstacleBounce = false;

  for (let i = 0; i < n; i++) {
    // 1. Spin turns the velocity, keeping its speed.
    const speed = Math.hypot(b.vx, b.vy);
    let { vx, vy } = b;
    if (speed > 0) {
      const angle = (b.spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      vx = b.vx * cos - b.vy * sin;
      vy = b.vx * sin + b.vy * cos;
    }
    // 2. Spin decays. 3. Advance.
    b = {
      ...b,
      vx,
      vy,
      spin: b.spin * decay,
      x: b.x + vx * h,
      y: b.y + vy * h,
    };

    // 4. Walls, the left paddle, the right paddle, then each obstacle.
    const walled = resolveWalls(b);
    if (walled !== null) {
      b = walled;
      wallBounce = true;
    }
    for (const side of ["left", "right"] as const) {
      const paddle = paddles[side];
      const contact = resolveRect(b, paddleRect(side, paddle.cy));
      if (contact === null) continue;
      if (contact.face === "left" || contact.face === "right") {
        b = paddleBounce(b, side, paddle.cy, paddle.vy);
        paddleHit = true;
      } else {
        b = contact.ball;
        wallBounce = true;
      }
    }
    for (const rect of rects) {
      const contact = resolveRect(b, rect);
      if (contact === null) continue;
      b = contact.ball;
      obstacleBounce = true;
    }
  }

  return { ball: b, events: { paddleHit, wallBounce, obstacleBounce } };
}

/** Serves a held ball toward `receiver` at the serve speed and angle. */
export function serveBall(ball: BallState, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    holdTimer: 0,
    held: false,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

/** Appends the ball's position at `now` and drops samples older than TRAIL_TIME. */
export function recordTrail(ball: BallState, now: number): BallState {
  const trail: TrailSample[] = ball.trail.filter(
    (s) => now - s.t <= TRAIL_TIME,
  );
  trail.push({ x: ball.x, y: ball.y, t: now });
  return { ...ball, trail };
}

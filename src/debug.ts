// Carom — the debug and automation surface (specs/instrumentation.md). Every
// pose builds the next state from the one it is handed; every reading reports
// what that state carries. Calls the game has nothing to act on throw.

import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  CaromView,
  Mode,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { menuItemRect } from "./menus";
import {
  drawServeSign,
  obstacleAt,
  parkedBall,
  thaw,
  titleState,
} from "./model";

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

function fail(message: string): never {
  throw new Error(`Carom debug: ${message}`);
}

function finite(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function flag(name: string, value: boolean): boolean {
  if (typeof value !== "boolean")
    fail(`${name} must be a boolean, got ${String(value)}`);
  return value;
}

function side(value: Side): Side {
  if (value !== "left" && value !== "right")
    fail(`no paddle side ${String(value)}`);
  return value;
}

function index(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${name} must be a whole, non-negative number, got ${String(value)}`);
  }
  return value;
}

/** The state with its ball replaced by `change(ball)`; throws when no ball is present. */
function withBall(
  state: CaromView,
  op: string,
  change: (ball: BallState) => BallState,
): CaromState {
  const next = thaw(state);
  if (next.ball === null) fail(`${op}: no ball is on the field`);
  return { ...next, ball: change(next.ball) };
}

function withPaddle(
  state: CaromView,
  which: Side,
  change: (paddle: PaddleState) => PaddleState,
): CaromState {
  const next = thaw(state);
  const s = side(which);
  return {
    ...next,
    paddles: { ...next.paddles, [s]: change(next.paddles[s]) },
  };
}

/** The whole declared state as plain data, with the ball's speed worked out. */
export function snapshot(state: CaromView): CaromSnapshot {
  const { ball } = state;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ x: s.x, y: s.y, t: s.t })),
          },
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  };
}

/** Builds the surface `initialize` returns beside the state. */
export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    // ---- The world ----
    clearWorld: (s) => ({ ...thaw(s), ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...thaw(s), ball: parkedBall() }),
    spawnObstacle: (s, i) => {
      const placed = obstacleAt(index("obstacle index", i));
      const others = thaw(s).obstacles.filter((o) => o.index !== placed.index);
      const obstacles = [...others, placed].sort((a, b) => a.index - b.index);
      return { ...thaw(s), obstacles };
    },
    reset: (s) => titleState(s.muted),
    // Speed is worked out at every read, so nothing here is ever stale.
    reconcile: (s) => thaw(s),

    // ---- Screens and menus ----
    setScreen: (s, screen) => {
      if (!SCREENS.includes(screen)) fail(`no screen named ${String(screen)}`);
      return { ...thaw(s), screen, menuPresses: [] };
    },
    setMode: (s, mode: Mode) => {
      if (mode !== "solo" && mode !== "versus")
        fail(`no mode named ${String(mode)}`);
      return { ...thaw(s), mode };
    },
    setMenuIndex: (s, i) => ({ ...thaw(s), menuIndex: index("menu index", i) }),
    setTitleIndex: (s, i) => ({
      ...thaw(s),
      titleIndex: index("title index", i),
    }),
    setResumeScreen: (s, screen) => {
      if (screen !== "countdown" && screen !== "playing") {
        fail(`a pause resumes to countdown or playing, not ${String(screen)}`);
      }
      return { ...thaw(s), resumeScreen: screen };
    },

    // ---- Match state ----
    setScore: (s, p1, p2) => ({
      ...thaw(s),
      score: { p1: index("p1 score", p1), p2: index("p2 score", p2) },
    }),
    setWinner: (s, winner) => ({
      ...thaw(s),
      winner: winner === null ? null : side(winner),
    }),
    setReceiver: (s, receiver) => ({ ...thaw(s), receiver: side(receiver) }),

    // ---- Paddles ----
    setPaddleCy: (s, which, cy) =>
      withPaddle(s, which, (p) => ({ ...p, cy: finite("paddle cy", cy) })),
    setPaddleVy: (s, which, vy) =>
      withPaddle(s, which, (p) => ({
        ...p,
        drivenVy: finite("paddle vy", vy),
      })),
    setPaddleDriven: (s, which, driven) =>
      withPaddle(s, which, (p) => ({ ...p, driven: flag("driven", driven) })),

    // ---- The ball ----
    setBallPosition: (s, x, y) =>
      withBall(s, "setBallPosition", (b) => ({
        ...b,
        x: finite("ball x", x),
        y: finite("ball y", y),
      })),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, "setBallVelocity", (b) => ({
        ...b,
        vx: finite("ball vx", vx),
        vy: finite("ball vy", vy),
      })),
    setBallSpin: (s, spin) =>
      withBall(s, "setBallSpin", (b) => ({
        ...b,
        spin: finite("ball spin", spin),
      })),
    setBallHeld: (s, held) =>
      withBall(s, "setBallHeld", (b) => ({ ...b, held: flag("held", held) })),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, "setBallHoldTimer", (b) => ({
        ...b,
        holdTimer: finite("hold timer", seconds),
      })),
    setBallServeSign: (s, sign) => {
      if (sign !== 1 && sign !== -1)
        fail(`serve sign must be 1 or -1, got ${String(sign)}`);
      return withBall(s, "setBallServeSign", (b) => ({
        ...b,
        serveSign: sign,
      }));
    },
    drawBallServeSign: (s) =>
      withBall(s, "drawBallServeSign", (b) => ({
        ...b,
        serveSign: drawServeSign(),
      })),

    // ---- The AI opponent ----
    setAiTracking: (s, enabled) => ({
      ...thaw(s),
      ai: { ...s.ai, tracking: flag("tracking", enabled) },
    }),
    setAiMovement: (s, enabled) => ({
      ...thaw(s),
      ai: { ...s.ai, movement: flag("movement", enabled) },
    }),

    // ---- Audio ----
    // The next update pushes this bit into the runtime before it reads `mute`.
    setMuted: (s, muted) => ({ ...thaw(s), muted: flag("muted", muted) }),

    // ---- Readings ----
    snapshot,
    menuItemRect: (s, i) => menuItemRect(s.screen, i),
  };
}

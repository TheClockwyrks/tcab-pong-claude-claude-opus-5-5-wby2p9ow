// Carom — building whole states and their parts: the parked ball, the
// obstacles, the title state, and the two transitions every menu shares
// (starting a match and returning to the title).

import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import type {
  BallState,
  CaromState,
  CaromView,
  Mode,
  ObstacleState,
  PaddleState,
} from "./game";

/** A fresh serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting out a full hold. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** Obstacle `index` at its fixed center. */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new RangeError(`Carom: no obstacle has index ${String(index)}`);
  }
  return { index, cx: center.x, cy: center.y };
}

/** Every obstacle, in the order of OBSTACLE_CENTERS. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** A paddle at rest at the field's vertical center, handed to the player. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/** The state the game opens on, with the runtime's mute bit mirrored in. */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    menuPresses: [],
  };
}

/**
 * Copies a read-only view into a plain state value. Every field of CaromState is
 * already readonly, so this only rebuilds the containers the view typed as
 * read-only into the ones the state declares.
 */
export function thaw(state: CaromView): CaromState {
  return {
    ...state,
    score: { ...state.score },
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    ai: { ...state.ai },
    ball:
      state.ball === null
        ? null
        : { ...state.ball, trail: [...state.ball.trail] },
    obstacles: state.obstacles.map((o) => ({ ...o })),
    menuPresses: state.menuPresses.map((p) => ({ ...p })),
  };
}

/** Starts a match in `mode`, from any screen (specs/ui.md, Starting a match). */
export function startMatch(state: CaromView, mode: Mode): CaromState {
  const base = thaw(state);
  return {
    ...base,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...base.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...base.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    menuPresses: [],
  };
}

/**
 * Returns to the title: every declared field back to its title value, except
 * `titleIndex`, `simTime`, and `muted`, and `menuIndex` restored from
 * `titleIndex`.
 */
export function returnToTitle(state: CaromView): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

// Carom — the game: its state, its debug surface, and the three functions the
// engine drives. The simulation, the menus, the drawing, and the debug surface
// each live in their own module beside this one; this file declares the types
// they share and wires them to the engine.

import type {
  CueSpec,
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, CUES } from "./constants";
import type { CueName } from "./constants";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { titleState } from "./model";
import { renderGame } from "./render";
import { updateGame } from "./update";

// ---- State (specs/state.md) ------------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /**
   * Transient input bookkeeping beyond the declared contract: the menu item each
   * pointer or touch contact still held went down on (`null` outside every
   * item), so a press and its release on a later frame can be matched. It is
   * not game state proper: every screen change and every reset empties it.
   */
  readonly menuPresses: readonly MenuPress[];
}

/** A pointer or touch contact held down over a menu, by pointer id. */
export interface MenuPress {
  readonly id: number;
  readonly item: number | null;
}

/** The read-only view of the state every reader is handed. */
export type CaromView = DeepReadonly<CaromState>;

// ---- Debug surface (specs/instrumentation.md) ------------------------------

/** A menu item's hit region, in logical units, top-left corner and size. */
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PaddleSnapshot {
  cy: number;
  vy: number;
  drivenVy: number;
  driven: boolean;
}

export interface BallSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  held: boolean;
  holdTimer: number;
  serveSign: 1 | -1;
  trail: { x: number; y: number; t: number }[];
}

export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: { left: PaddleSnapshot; right: PaddleSnapshot };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: BallSnapshot | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

/**
 * The debug and automation surface. Every operation takes the current state
 * first; a pose returns the next state and a reading returns what it read.
 */
export interface CaromDebugApi {
  readonly version: number;

  // The world.
  clearWorld(state: CaromView): CaromState;
  spawnBall(state: CaromView): CaromState;
  spawnObstacle(state: CaromView, index: number): CaromState;
  reset(state: CaromView): CaromState;
  reconcile(state: CaromView): CaromState;

  // Screens and menus.
  setScreen(state: CaromView, screen: Screen): CaromState;
  setMode(state: CaromView, mode: Mode): CaromState;
  setMenuIndex(state: CaromView, index: number): CaromState;
  setTitleIndex(state: CaromView, index: number): CaromState;
  setResumeScreen(
    state: CaromView,
    screen: "countdown" | "playing",
  ): CaromState;

  // Match state.
  setScore(state: CaromView, p1: number, p2: number): CaromState;
  setWinner(state: CaromView, side: Side | null): CaromState;
  setReceiver(state: CaromView, side: Side): CaromState;

  // Paddles.
  setPaddleCy(state: CaromView, side: Side, cy: number): CaromState;
  setPaddleVy(state: CaromView, side: Side, vy: number): CaromState;
  setPaddleDriven(state: CaromView, side: Side, driven: boolean): CaromState;

  // The ball.
  setBallPosition(state: CaromView, x: number, y: number): CaromState;
  setBallVelocity(state: CaromView, vx: number, vy: number): CaromState;
  setBallSpin(state: CaromView, spin: number): CaromState;
  setBallHeld(state: CaromView, held: boolean): CaromState;
  setBallHoldTimer(state: CaromView, seconds: number): CaromState;
  setBallServeSign(state: CaromView, sign: 1 | -1): CaromState;
  drawBallServeSign(state: CaromView): CaromState;

  // The AI opponent.
  setAiTracking(state: CaromView, enabled: boolean): CaromState;
  setAiMovement(state: CaromView, enabled: boolean): CaromState;

  // Audio.
  setMuted(state: CaromView, muted: boolean): CaromState;

  // Readings.
  snapshot(state: CaromView): CaromSnapshot;
  menuItemRect(state: CaromView, index: number): MenuRect | null;
}

// ---- Look and sound --------------------------------------------------------

/** The field background, which also fills the letterbox bars. */
export { BACKGROUND } from "./palette";

/** One short, distinct blip per event (specs/audio.md). */
export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 520,
    freqTo: 780,
    gain: 0.16,
    durationMs: 70,
  },
  [CUES.wallBounce]: {
    wave: "sine",
    freq: 330,
    freqTo: 260,
    gain: 0.2,
    durationMs: 60,
  },
  [CUES.obstacleBounce]: {
    wave: "triangle",
    freq: 880,
    freqTo: 640,
    gain: 0.22,
    durationMs: 90,
  },
  [CUES.score]: {
    wave: "sawtooth",
    freq: 300,
    freqTo: 900,
    gain: 0.14,
    durationMs: 260,
  },
};

// ---- The game --------------------------------------------------------------

/** The game the engine drives (src/main.ts binds it). */
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS)) {
      api.audio.define(cue, spec);
    }
    registerDiagnostics(api.diagnostics);

    // The runtime's mute bit starts clear, and InitApi offers no read of it.
    return [titleState(false), createDebugApi()];
  },

  update(state: CaromView, api: UpdateApi, dt: number): CaromState {
    return updateGame(state, api, dt);
  },

  render(state: CaromView, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};

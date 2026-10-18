// Carom — one frame: mirror the mute bit, read the input the starting screen
// reads, then advance the screen that input left the game on.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import {
  CUES,
  WIN_LEAD,
  WIN_SCORE,
  BALL_R,
  FIELD_W,
  PADDLE_SPEED,
} from "./constants";
import type {
  CaromState,
  CaromView,
  Mode,
  PaddleState,
  Screen,
  Side,
} from "./game";
import { menuItems, readPointer, wrapIndex } from "./menus";
import { parkedBall, returnToTitle, startMatch, thaw } from "./model";
import {
  advanceBall,
  aiVelocity,
  integratePaddle,
  NO_EVENTS,
  recordTrail,
  serveBall,
} from "./physics";
import type { BallEvents } from "./physics";

type Input = UpdateApi["input"];

/** Advances the game one frame of `dt` seconds. */
export function updateGame(
  view: CaromView,
  api: UpdateApi,
  dt: number,
): CaromState {
  const began = view.screen;
  let state: CaromState = { ...thaw(view), simTime: view.simTime + dt };

  state = { ...state, muted: syncMute(state.muted, api) };
  state = readInput(state, api.input);
  if (state.screen !== began) state = { ...state, menuPresses: [] };

  if (state.screen === "countdown" || state.screen === "playing") {
    // Movement is input, so a screen reached this frame moves its human paddles
    // from the following frame on.
    const live = began === "countdown" || began === "playing";
    state = advanceMatch(state, api, dt, live);
  }
  return state;
}

// ---- Mute ------------------------------------------------------------------

/**
 * Brings the runtime's mute bit into line with the state's copy (which the debug
 * surface may have posed), applies a `mute` press, and returns the bit to mirror.
 */
function syncMute(muted: boolean, api: UpdateApi): boolean {
  if (api.audio.muted() !== muted) api.audio.setMuted(muted);
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  return api.audio.muted();
}

// ---- Input -----------------------------------------------------------------

interface MenuEdges {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
}

function readMenuEdges(input: Input): MenuEdges {
  // Every edge is read, so none of them short-circuits another's consumption.
  const up = [input.pressed("p1-up"), input.pressed("p2-up")].some(Boolean);
  const down = [input.pressed("p1-down"), input.pressed("p2-down")].some(
    Boolean,
  );
  return {
    up,
    down,
    confirm: input.pressed("confirm"),
    back: input.pressed("back"),
  };
}

function readInput(state: CaromState, input: Input): CaromState {
  switch (state.screen) {
    case "countdown":
    case "playing":
      if (input.pressed("pause")) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
        };
      }
      return state;
    case "paused": {
      const resume = [input.pressed("pause"), input.pressed("back")].some(
        Boolean,
      );
      if (resume) return { ...state, screen: state.resumeScreen };
      return driveMenu(state, input);
    }
    case "title":
    case "howto":
    case "matchover":
      return driveMenu(state, input);
  }
}

/** Applies a frame's keyboard edges, then its pointer and touch samples, to a menu. */
function driveMenu(state: CaromState, input: Input): CaromState {
  const items = menuItems(state.screen) ?? [];
  const edges = readMenuEdges(input);
  const reads =
    state.screen === "title" ||
    state.screen === "paused" ||
    state.screen === "matchover";

  let menuIndex = state.menuIndex;
  let moved = false;
  if (reads && edges.up) {
    menuIndex = wrapIndex(menuIndex, -1, items.length);
    moved = true;
  } else if (reads && edges.down) {
    menuIndex = wrapIndex(menuIndex, 1, items.length);
    moved = true;
  }
  const keyboardConfirm = !moved && edges.confirm;

  const pointer = readPointer(
    state.screen,
    input.pointerSamples(),
    state.menuPresses,
  );
  const next: CaromState = { ...state, menuPresses: pointer.presses };

  if (keyboardConfirm) return confirmItem({ ...next, menuIndex }, menuIndex);
  if (pointer.selected !== null) menuIndex = pointer.selected;
  if (pointer.confirmed !== null) {
    return confirmItem(
      { ...next, menuIndex: pointer.confirmed },
      pointer.confirmed,
    );
  }
  if (!moved && edges.back) return backOut({ ...next, menuIndex });
  return { ...next, menuIndex };
}

/** The `back` action on a menu screen. */
function backOut(state: CaromState): CaromState {
  switch (state.screen) {
    case "howto":
    case "matchover":
      return returnToTitle(state);
    default:
      return state;
  }
}

/** Confirms item `index` of the menu on the current screen. */
function confirmItem(state: CaromState, index: number): CaromState {
  switch (state.screen) {
    case "title": {
      const remembered = { ...state, titleIndex: index };
      if (index === 0) return startMatch(remembered, "solo");
      if (index === 1) return startMatch(remembered, "versus");
      if (index === 2) return { ...remembered, screen: "howto", menuIndex: 0 };
      return state;
    }
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (index === 0) return { ...state, screen: state.resumeScreen };
      if (index === 1) return startMatch(state, state.mode);
      if (index === 2) return returnToTitle(state);
      return state;
    case "matchover":
      if (index === 0) return startMatch(state, state.mode);
      if (index === 1) return returnToTitle(state);
      return state;
    default:
      return state;
  }
}

// ---- The match ------------------------------------------------------------

/** The `up` and `down` values driving one human paddle (specs/modes/). */
function humanAxis(input: Input, mode: Mode, side: Side): number {
  const held = (name: string): boolean => input.value(name) > 0;
  let up: boolean;
  let down: boolean;
  if (mode === "solo") {
    up = held("p1-up") || held("p2-up");
    down = held("p1-down") || held("p2-down");
  } else {
    const prefix = side === "left" ? "p1" : "p2";
    up = held(`${prefix}-up`);
    down = held(`${prefix}-down`);
  }
  return Number(down) - Number(up);
}

function movePaddle(
  state: CaromState,
  side: Side,
  input: Input,
  dt: number,
  live: boolean,
): PaddleState {
  const paddle = state.paddles[side];
  let vy: number;
  if (paddle.driven) {
    vy = paddle.drivenVy;
  } else if (side === "right" && state.mode === "solo") {
    vy = aiVelocity(
      paddle.cy,
      state.ai,
      state.ball,
      state.screen === "playing",
      dt,
    );
  } else {
    vy = live ? humanAxis(input, state.mode, side) * PADDLE_SPEED : 0;
  }
  return integratePaddle(paddle, vy, dt);
}

function playCues(api: UpdateApi, events: BallEvents): void {
  if (events.paddleHit) api.audio.play(CUES.paddleHit);
  if (events.wallBounce) api.audio.play(CUES.wallBounce);
  if (events.obstacleBounce) api.audio.play(CUES.obstacleBounce);
}

/** Whether `p1`-`p2` ends the match, and for whom. */
export function matchWinner(p1: number, p2: number): Side | null {
  if (p1 >= WIN_SCORE && p1 - p2 >= WIN_LEAD) return "left";
  if (p2 >= WIN_SCORE && p2 - p1 >= WIN_LEAD) return "right";
  return null;
}

/** Advances a `countdown` or `playing` frame: paddles, then the ball, then scoring. */
function advanceMatch(
  state: CaromState,
  api: UpdateApi,
  dt: number,
  live: boolean,
): CaromState {
  const paddles = {
    left: movePaddle(state, "left", api.input, dt, live),
    right: movePaddle(state, "right", api.input, dt, live),
  };
  let next: CaromState = { ...state, paddles };
  if (next.ball === null) return next;

  let ball = next.ball;
  let screen: Screen = next.screen;
  let events = NO_EVENTS;
  if (screen === "countdown") {
    const holdTimer = ball.holdTimer - dt;
    ball = { ...ball, holdTimer };
    if (holdTimer <= 0) {
      ball = serveBall(ball, next.receiver);
      screen = "playing";
    }
  } else {
    ({ ball, events } = advanceBall(ball, paddles, next.obstacles, dt));
  }
  ball = recordTrail(ball, next.simTime);
  playCues(api, events);
  next = { ...next, ball, screen };

  const scorer: Side | null =
    ball.x - BALL_R > FIELD_W ? "left" : ball.x + BALL_R < 0 ? "right" : null;
  if (state.screen !== "playing" || scorer === null) return next;
  return scorePoint(next, scorer, api);
}

function scorePoint(
  state: CaromState,
  scorer: Side,
  api: UpdateApi,
): CaromState {
  api.audio.play(CUES.score);
  const score =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = matchWinner(score.p1, score.p2);
  if (winner !== null) {
    return {
      ...state,
      score,
      winner,
      screen: "matchover",
      menuIndex: 0,
      menuPresses: [],
    };
  }
  return {
    ...state,
    score,
    ball: parkedBall(),
    receiver: scorer === "left" ? "right" : "left",
    screen: "countdown",
  };
}

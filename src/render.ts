// Carom — drawing. Everything is drawn in the field's logical units from the
// read-only state; nothing here feeds back into the simulation.

import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  SPIN_CLAMP,
  TITLE_TEXT,
} from "./constants";
import type { CaromView, Side } from "./game";
import { menuItemRect, menuItems } from "./menus";
import { PALETTE } from "./palette";

type Ctx = CanvasRenderingContext2D;

const FONT = "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif";

function font(size: number, weight = "700"): string {
  return `${weight} ${String(size)}px ${FONT}`;
}

/** Draws the whole frame for `state`. */
export function renderGame(state: CaromView, ctx: Ctx): void {
  ctx.save();
  switch (state.screen) {
    case "title":
      drawField(state, ctx, 0.35);
      drawTitle(state, ctx);
      break;
    case "howto":
      drawField(state, ctx, 0.2);
      drawHowTo(state, ctx);
      break;
    case "countdown":
      drawMatch(state, ctx);
      drawCountdown(state, ctx);
      break;
    case "playing":
      drawMatch(state, ctx);
      break;
    case "paused":
      drawMatch(state, ctx);
      drawShade(ctx);
      drawHeading(ctx, "PAUSED", 220, PALETTE.text);
      drawMenu(state, ctx);
      break;
    case "matchover":
      drawMatch(state, ctx);
      drawShade(ctx);
      drawMatchOver(state, ctx);
      break;
  }
  if (state.muted) drawMuted(ctx);
  ctx.restore();
}

// ---- The field -------------------------------------------------------------

function roundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBackdrop(ctx: Ctx): void {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < FIELD_W; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 40; y < FIELD_H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  // Goal glows, tinted by the side that defends them.
  for (const side of ["left", "right"] as const) {
    const x0 = side === "left" ? 0 : FIELD_W;
    const glow = ctx.createLinearGradient(
      x0,
      0,
      side === "left" ? 90 : FIELD_W - 90,
      0,
    );
    glow.addColorStop(
      0,
      side === "left" ? "rgba(56, 230, 255, 0.16)" : "rgba(255, 79, 158, 0.16)",
    );
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(side === "left" ? 0 : FIELD_W - 90, 0, 90, FIELD_H);
  }

  // The solid walls.
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(0, 0, FIELD_W, 3);
  ctx.fillRect(0, FIELD_H - 3, FIELD_W, 3);

  // The decorative net.
  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 6);
  ctx.lineTo(NET_X, FIELD_H - 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 70, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawGlowingBody(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  roundRect(ctx, x + w * 0.3, y + 6, w * 0.25, h - 12, w * 0.12);
  ctx.fill();
  ctx.restore();
}

function drawPaddle(ctx: Ctx, side: Side, cy: number): void {
  const x = side === "left" ? P1_X0 : P2_X0;
  const color = side === "left" ? PALETTE.left : PALETTE.right;
  drawGlowingBody(ctx, x, cy - PADDLE_H / 2, PADDLE_W, PADDLE_H, color);
}

function drawObstacles(state: CaromView, ctx: Ctx): void {
  for (const o of state.obstacles) {
    drawGlowingBody(
      ctx,
      o.cx - OBSTACLE_W / 2,
      o.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      PALETTE.obstacle,
    );
  }
}

/**
 * The motion trail: one ribbon through the recorded samples, tapering from the
 * ball's width at its head to a point at its tail and fading out behind it, so
 * it follows the curve the flight took.
 */
function drawTrail(state: CaromView, ctx: Ctx): void {
  const trail = state.ball?.trail ?? [];
  const n = trail.length;
  if (n < 2) return;
  const head = trail[n - 1];
  const tail = trail[0];
  if (Math.hypot(head.x - tail.x, head.y - tail.y) < 1) return;

  const sideA: [number, number][] = [];
  const sideB: [number, number][] = [];
  trail.forEach((p, i) => {
    const prev = trail[Math.max(0, i - 1)];
    const next = trail[Math.min(n - 1, i + 1)];
    const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const nx = -(next.y - prev.y) / len;
    const ny = (next.x - prev.x) / len;
    const half = BALL_R * 0.9 * (i / (n - 1));
    sideA.push([p.x + nx * half, p.y + ny * half]);
    sideB.push([p.x - nx * half, p.y - ny * half]);
  });

  const fade = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  fade.addColorStop(0, "rgba(140, 220, 255, 0)");
  fade.addColorStop(1, "rgba(200, 240, 255, 0.6)");
  ctx.save();
  ctx.fillStyle = fade;
  ctx.beginPath();
  ctx.moveTo(sideA[0][0], sideA[0][1]);
  for (const [x, y] of sideA.slice(1)) ctx.lineTo(x, y);
  for (const [x, y] of sideB.reverse()) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBall(state: CaromView, ctx: Ctx): void {
  const ball = state.ball;
  if (ball === null) return;
  ctx.save();
  ctx.shadowColor = "#bfefff";
  ctx.shadowBlur = 22;
  ctx.fillStyle = PALETTE.ball;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // A spin ring: its sweep shows how hard the ball is curving, its turn which way.
  const amount = Math.min(1, Math.abs(ball.spin) / SPIN_CLAMP);
  if (amount > 0.02) {
    const start = state.simTime * Math.sign(ball.spin) * 9;
    ctx.strokeStyle = ball.spin > 0 ? PALETTE.right : PALETTE.left;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 6, start, start + amount * Math.PI * 1.6);
    ctx.stroke();
  }
  ctx.restore();
}

/** The playfield furniture, at `alpha` (dimmed behind a menu). */
function drawField(state: CaromView, ctx: Ctx, alpha: number): void {
  drawBackdrop(ctx);
  ctx.save();
  ctx.globalAlpha = alpha;
  drawObstacles(state, ctx);
  drawPaddle(ctx, "left", state.paddles.left.cy);
  drawPaddle(ctx, "right", state.paddles.right.cy);
  drawBall(state, ctx);
  ctx.restore();
}

function modeLabel(state: CaromView): string {
  return state.mode === "solo" ? "SOLO  ·  VS CPU" : "VERSUS  ·  2 PLAYERS";
}

function drawHud(state: CaromView, ctx: Ctx): void {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = font(60, "800");
  ctx.textAlign = "right";
  ctx.fillStyle = PALETTE.left;
  ctx.fillText(String(state.score.p1), FIELD_CX - 48, 64);
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.right;
  ctx.fillText(String(state.score.p2), FIELD_CX + 48, 64);

  ctx.textAlign = "center";
  ctx.font = font(15, "600");
  ctx.fillStyle = PALETTE.dimText;
  ctx.fillText(modeLabel(state), FIELD_CX, FIELD_H - 24);
  ctx.restore();
}

function drawMatch(state: CaromView, ctx: Ctx): void {
  drawBackdrop(ctx);
  drawHud(state, ctx);
  drawObstacles(state, ctx);
  drawPaddle(ctx, "left", state.paddles.left.cy);
  drawPaddle(ctx, "right", state.paddles.right.cy);
  drawTrail(state, ctx);
  drawBall(state, ctx);
}

// ---- Overlays --------------------------------------------------------------

function drawShade(ctx: Ctx): void {
  ctx.fillStyle = PALETTE.shade;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawHeading(
  ctx: Ctx,
  text: string,
  y: number,
  color: string,
  size = 64,
): void {
  ctx.save();
  ctx.font = font(size, "800");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.fillText(text, FIELD_CX, y);
  ctx.restore();
}

function drawLines(
  ctx: Ctx,
  lines: readonly string[],
  x: number,
  y: number,
  step: number,
): void {
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * step));
}

/** Draws the current screen's menu, the item at `menuIndex` highlighted. */
function drawMenu(state: CaromView, ctx: Ctx): void {
  const items = menuItems(state.screen) ?? [];
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(24, "700");
  items.forEach((label, i) => {
    const r = menuItemRect(state.screen, i);
    if (r === null) return;
    const active = i === state.menuIndex;
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    if (active) {
      ctx.shadowColor = PALETTE.left;
      ctx.shadowBlur = 20;
      ctx.fillStyle = PALETTE.left;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.background;
    } else {
      ctx.fillStyle = "rgba(20, 28, 50, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(141, 151, 184, 0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
    }
    ctx.fillText(
      active ? `›  ${label}  ‹` : label,
      r.x + r.w / 2,
      r.y + r.h / 2 + 1,
    );
  });
  ctx.restore();
}

function drawTitle(state: CaromView, ctx: Ctx): void {
  drawHeading(ctx, TITLE_TEXT, 200, PALETTE.text, 132);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(20, "500");
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillText("a spin-and-bank paddle duel", FIELD_CX, 290);
  ctx.font = font(15, "500");
  ctx.fillStyle = PALETTE.dimText;
  ctx.fillText(
    "W / S or ↑ / ↓ to choose  ·  ENTER to play  ·  M mutes  ·  click or tap works too",
    FIELD_CX,
    FIELD_H - 36,
  );
  ctx.restore();
  drawMenu(state, ctx);
}

function drawHowTo(state: CaromView, ctx: Ctx): void {
  drawHeading(ctx, "HOW TO PLAY", 80, PALETTE.text, 52);
  ctx.save();
  roundRect(ctx, 100, 122, FIELD_W - 200, 380, 20);
  ctx.fillStyle = "rgba(14, 20, 38, 0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(141, 151, 184, 0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const colLeft = 140;
  const colRight = 700;
  ctx.font = font(22, "800");
  ctx.fillStyle = PALETTE.left;
  ctx.fillText("CONTROLS", colLeft, 160);
  ctx.fillStyle = PALETTE.obstacle;
  ctx.fillText("SPIN & BANK SHOTS", colRight, 160);

  ctx.font = font(18, "500");
  ctx.fillStyle = PALETTE.text;
  drawLines(
    ctx,
    [
      "Player one (left):  W / S",
      "Player two (right):  ↑ / ↓",
      "Solo: either set moves your paddle",
      "Pause:  P or ESC",
      "Mute:  M",
      "Menus:  arrows, ENTER, mouse or touch",
      "",
      "First to 11, win by 2.",
    ],
    colLeft,
    205,
    36,
  );
  drawLines(
    ctx,
    [
      "Hit the ball off-center to angle it:",
      "the paddle's edges send it out at 55°.",
      "Move your paddle as you strike to add",
      "spin — the ball curves after the hit,",
      "down-swing curves it clockwise.",
      "Spin fades by half every 0.8 seconds.",
      "Bank off the two amber pylons and the",
      "walls to curl shots past your rival.",
    ],
    colRight,
    205,
    36,
  );
  ctx.restore();
  drawMenu(state, ctx);
}

function drawCountdown(state: CaromView, ctx: Ctx): void {
  const ball = state.ball;
  if (ball === null) return;
  const left = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = PALETTE.obstacle;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 16,
    -Math.PI / 2,
    -Math.PI / 2 + left * Math.PI * 2,
  );
  ctx.stroke();

  ctx.font = font(22, "800");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.text;
  const toward = state.receiver === "left" ? "◀  SERVE" : "SERVE  ▶";
  ctx.fillText(toward, ball.x, ball.y - 56);
  ctx.restore();
}

function winnerText(state: CaromView): string {
  if (state.winner === null) return "MATCH OVER";
  if (state.mode === "solo")
    return state.winner === "left" ? "YOU WIN!" : "CPU WINS";
  return state.winner === "left" ? "PLAYER ONE WINS" : "PLAYER TWO WINS";
}

function drawMatchOver(state: CaromView, ctx: Ctx): void {
  const color =
    state.winner === "right"
      ? PALETTE.right
      : state.winner === "left"
        ? PALETTE.left
        : PALETTE.text;
  drawHeading(ctx, winnerText(state), 220, color, 72);
  ctx.save();
  ctx.font = font(44, "800");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(
    `${String(state.score.p1)}  –  ${String(state.score.p2)}`,
    FIELD_CX,
    320,
  );
  ctx.font = font(16, "500");
  ctx.fillStyle = PALETTE.dimText;
  ctx.fillText("FINAL SCORE", FIELD_CX, 365);
  ctx.restore();
  drawMenu(state, ctx);
}

function drawMuted(ctx: Ctx): void {
  ctx.save();
  ctx.font = font(14, "700");
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PALETTE.dimText;
  ctx.fillText("MUTED  (M)", FIELD_W - 24, 24);
  ctx.restore();
}

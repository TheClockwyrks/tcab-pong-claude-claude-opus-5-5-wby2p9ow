# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off a pair of fixed pylons in the middle of the field.
A player scores when the ball passes the far edge behind their opponent's paddle.
First to 11 points wins, and the winner must lead by 2.

Carom's mechanic is **spin**: a paddle that is moving when it strikes the ball
curves the ball's flight afterwards. Moving down as you hit curves it clockwise,
moving up curves it counter-clockwise, and the spin fades by half every 0.8
seconds. Where the ball meets the paddle sets its outgoing angle (up to 55° at
the paddle's tips), and every paddle hit makes the ball 4% faster, up to a cap.
The pylons turn the open field into a bank-shot puzzle.

Play **Solo** against the CPU, or **Versus** with two players on one keyboard.
Everything is drawn in code on a canvas. No art or audio files ship with the
game, and nothing is fetched at runtime.

## Install

Requires Node.js 20 or newer.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default http://localhost:5173).

## Production build

```sh
npm run build
```

This type-checks the project and emits a self-contained static site into
`dist/`, with `dist/index.html` as its entry point. Serve that directory as-is
from any static file server, for example with `npm run preview`.

## Controls

| Action | Keys |
| --- | --- |
| Player one (left paddle) up / down | `W` / `S` |
| Player two (right paddle) up / down | `↑` / `↓` |
| Confirm a menu item | `Enter` or `Space` |
| Back | `Esc` |
| Pause / resume | `P` or `Esc` |
| Mute / unmute | `M` |
| Debug overlay | `` ` `` (backtick) |

In Solo, either set of movement keys moves your (left) paddle and the CPU plays
the right. In Versus, each player has their own keys. Menus also respond to the
mouse (hover to highlight, click to choose) and to touch, and on a touchscreen
the engine shows on-screen sliders for both paddles plus menu buttons.

## Development

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, in check mode |
| `npm test` | Vitest unit tests with coverage |

The game is built on the Simple 2D engine (documented under `engine/`). The
sources live in `src/`:

- `game.ts` declares the game's state (`CaromState`) and its debug surface
  (`CaromDebugApi`), and binds `initialize`, `update`, and `render`.
- `update.ts` runs one frame: input, menus, paddles, the serve, and scoring.
- `physics.ts` is the render-free simulation core: sub-stepped ball flight,
  spin, collisions, paddle integration, and the AI.
- `menus.ts` lays out the menus and reads pointer and touch input against them.
- `model.ts` builds states: the title state, the parked ball, match starts.
- `render.ts` and `palette.ts` draw everything.
- `debug.ts` and `diagnostics.ts` expose the automation surface and the
  overlay readings.

The tests (`src/**/*.test.ts`) run the real engine headlessly over a native
canvas with a fixed-step clock, so they need no browser.

The store-page showcase (description, carousel, screenshots, and a replay of
live play) lives in `showcase/`.

// Carom — the values the engine's debug overlay shows. Each source is a pure
// read of the state it is handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { CaromState, CaromView } from "./game";

type Diagnostics = InitApi<CaromState>["diagnostics"];

const fixed = (n: number): string => n.toFixed(1);

function ballReading(
  state: CaromView,
  read: (b: NonNullable<CaromView["ball"]>) => string,
): string {
  return state.ball === null ? "none" : read(state.ball);
}

/** Registers every Carom diagnostic source. */
export function registerDiagnostics(diagnostics: Diagnostics): void {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register(
    "score",
    (s) => `${String(s.score.p1)} - ${String(s.score.p2)}`,
  );
  diagnostics.register("ball pos", (s) =>
    ballReading(s, (b) => `${fixed(b.x)}, ${fixed(b.y)}`),
  );
  diagnostics.register("ball vel", (s) =>
    ballReading(s, (b) => `${fixed(b.vx)}, ${fixed(b.vy)}`),
  );
  diagnostics.register("ball speed", (s) =>
    ballReading(s, (b) => fixed(Math.hypot(b.vx, b.vy))),
  );
  diagnostics.register("ball spin", (s) =>
    ballReading(s, (b) => fixed(b.spin)),
  );
  diagnostics.register(
    "left paddle",
    (s) => `cy ${fixed(s.paddles.left.cy)}  vy ${fixed(s.paddles.left.vy)}`,
  );
  diagnostics.register(
    "right paddle",
    (s) => `cy ${fixed(s.paddles.right.cy)}  vy ${fixed(s.paddles.right.vy)}`,
  );
}

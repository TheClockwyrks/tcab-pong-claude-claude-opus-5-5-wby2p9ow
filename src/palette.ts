// Carom — the palette every drawing reads from.

/** The field background, which also fills the letterbox bars. */
export const BACKGROUND = "#0a0e1a";

export const PALETTE = {
  background: BACKGROUND,
  grid: "rgba(120, 150, 220, 0.06)",
  net: "rgba(150, 175, 230, 0.28)",
  wall: "rgba(150, 175, 230, 0.35)",
  left: "#38e6ff",
  right: "#ff4f9e",
  obstacle: "#ffc23d",
  ball: "#f6f8ff",
  text: "#e8ecff",
  dimText: "#8d97b8",
  shade: "rgba(6, 9, 18, 0.72)",
} as const;

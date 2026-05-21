// src/cli/format/format.ts
import { encode as toonEncode } from "@toon-format/toon";

export type OutputFormat = "text" | "json" | "toon";

/** Render a value for output. `text` uses `textRenderer` if supplied,
 *  otherwise falls back to JSON. `json` and `toon` ignore the renderer. */
export function render<T>(
  value: T,
  format: OutputFormat,
  textRenderer?: (v: T) => string,
): string {
  if (format === "json") return JSON.stringify(value, null, 2);
  if (format === "toon") return toonEncode(value as unknown);
  return textRenderer ? textRenderer(value) : JSON.stringify(value, null, 2);
}

/** Format a whole-second duration as "M:SS" or "H:MM:SS". Negatives clamp to 0. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

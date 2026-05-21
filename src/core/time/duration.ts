// src/core/time/duration.ts

/** Parse a human duration ("25m", "1h30m", "45s", "90") into whole seconds.
 *  A bare number is interpreted as minutes. Throws on invalid input. */
export function parseDuration(input: string): number {
  const s = input.trim().toLowerCase();
  if (s === "") throw new Error("duration is empty");
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60;

  const re = /(\d+)\s*(h|m|s)/g;
  let total = 0;
  let matched = false;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    consumed += m[0].length;
    const n = parseInt(m[1]!, 10);
    total += m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : n;
  }
  if (!matched || consumed !== s.replace(/\s/g, "").length) {
    throw new Error(`invalid duration: "${input}"`);
  }
  return total;
}

export * as Duration from "./duration";

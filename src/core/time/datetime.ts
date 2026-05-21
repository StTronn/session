// src/core/time/datetime.ts
import { parseDuration } from "@/core/time/duration";

/** Parse a block time into a unix-seconds timestamp, relative to `nowSec`.
 *  Supports "+<duration>" (relative), "HH:MM" (24h), and "H[:MM](am|pm)".
 *  Absolute times resolve against the local calendar date of `nowSec`. */
export function parseTime(input: string, nowSec: number): number {
  const s = input.trim().toLowerCase();
  if (s === "") throw new Error("time is empty");
  if (s.startsWith("+")) return nowSec + parseDuration(s.slice(1));

  let hh: number | null = null;
  let mm = 0;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) {
    hh = parseInt(m[1]!, 10);
    mm = parseInt(m[2]!, 10);
  } else if ((m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/))) {
    hh = parseInt(m[1]!, 10);
    mm = m[2] ? parseInt(m[2], 10) : 0;
    if (hh < 1 || hh > 12) throw new Error(`invalid time: "${input}"`);
    if (m[3] === "pm" && hh !== 12) hh += 12;
    if (m[3] === "am" && hh === 12) hh = 0;
  }
  if (hh === null || hh > 23 || mm > 59) {
    throw new Error(`invalid time: "${input}"`);
  }
  const d = new Date(nowSec * 1000);
  d.setHours(hh, mm, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export * as DateTime from "./datetime";

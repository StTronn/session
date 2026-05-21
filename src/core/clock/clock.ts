// src/core/clock/clock.ts

/** A source of "now" in unix seconds. Injected so logic is deterministic. */
export interface Clock {
  now(): number;
}

export interface FixedClock extends Clock {
  set(unixSeconds: number): void;
  advance(seconds: number): void;
}

export function systemClock(): Clock {
  return { now: () => Math.floor(Date.now() / 1000) };
}

/** A controllable clock for tests. */
export function fixedClock(startUnixSeconds: number): FixedClock {
  let t = startUnixSeconds;
  return {
    now: () => t,
    set: (v) => { t = v; },
    advance: (s) => { t += s; },
  };
}

export * as Clock from "./clock";

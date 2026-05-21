import { test, expect, describe } from "bun:test";
import { systemClock, fixedClock } from "@/core/clock/clock";

describe("clock", () => {
  test("systemClock returns current unix seconds", () => {
    const t = systemClock().now();
    expect(Math.abs(t - Date.now() / 1000)).toBeLessThan(2);
  });
  test("fixedClock starts at the given time", () => {
    expect(fixedClock(1000).now()).toBe(1000);
  });
  test("fixedClock advances", () => {
    const c = fixedClock(1000);
    c.advance(60);
    expect(c.now()).toBe(1060);
  });
  test("fixedClock can be set", () => {
    const c = fixedClock(1000);
    c.set(5000);
    expect(c.now()).toBe(5000);
  });
});

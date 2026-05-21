import { test, expect, describe } from "bun:test";
import { parseTime } from "@/core/time/datetime";

// Reference "now": 2026-05-21 09:00 local time.
const now = Math.floor(new Date(2026, 4, 21, 9, 0, 0).getTime() / 1000);

function hourOf(unix: number): number {
  return new Date(unix * 1000).getHours();
}

describe("parseTime", () => {
  test("24-hour clock time", () => {
    expect(hourOf(parseTime("14:00", now))).toBe(14);
  });
  test("12-hour pm", () => {
    expect(hourOf(parseTime("2pm", now))).toBe(14);
  });
  test("12-hour am with minutes", () => {
    const t = parseTime("9:30am", now);
    const d = new Date(t * 1000);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });
  test("12am is midnight", () => {
    expect(hourOf(parseTime("12am", now))).toBe(0);
  });
  test("relative offset", () => {
    expect(parseTime("+30m", now)).toBe(now + 1800);
  });
  test("rejects invalid time", () => {
    expect(() => parseTime("25:00", now)).toThrow();
    expect(() => parseTime("nonsense", now)).toThrow();
  });
});

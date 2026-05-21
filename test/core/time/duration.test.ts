import { test, expect, describe } from "bun:test";
import { parseDuration } from "@/core/time/duration";

describe("parseDuration", () => {
  test("bare number is minutes", () => {
    expect(parseDuration("90")).toBe(5400);
  });
  test("minutes suffix", () => {
    expect(parseDuration("25m")).toBe(1500);
  });
  test("hours suffix", () => {
    expect(parseDuration("2h")).toBe(7200);
  });
  test("combined units", () => {
    expect(parseDuration("1h30m")).toBe(5400);
  });
  test("seconds suffix", () => {
    expect(parseDuration("45s")).toBe(45);
  });
  test("rejects empty input", () => {
    expect(() => parseDuration("  ")).toThrow();
  });
  test("rejects garbage", () => {
    expect(() => parseDuration("abc")).toThrow();
  });
});

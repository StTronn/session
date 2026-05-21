// test/cli/args.test.ts
import { test, expect, describe } from "bun:test";
import { parseFormat, flag, requirePositional } from "@/cli/args";

describe("args", () => {
  test("parseFormat reads --format", () => {
    expect(parseFormat({ format: "json" })).toBe("json");
    expect(parseFormat({ format: "toon" })).toBe("toon");
  });
  test("parseFormat treats --json as a shorthand", () => {
    expect(parseFormat({ json: true })).toBe("json");
  });
  test("parseFormat defaults to text", () => {
    expect(parseFormat({})).toBe("text");
  });
  test("parseFormat rejects an unknown format", () => {
    expect(() => parseFormat({ format: "xml" })).toThrow();
  });
  test("requirePositional throws when missing", () => {
    expect(() => requirePositional([], 0, "category")).toThrow();
    expect(requirePositional(["work"], 0, "category")).toBe("work");
  });
  test("flag reads a boolean", () => {
    expect(flag({ note: true }, "note")).toBe(true);
    expect(flag({}, "note")).toBe(false);
  });
});

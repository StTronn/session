import { test, expect, describe } from "bun:test";
import { render, formatDuration, type OutputFormat } from "@/cli/format/format";

describe("format", () => {
  test("json output is pretty-printed JSON", () => {
    const out = render({ a: 1 }, "json");
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });
  test("toon output is a non-empty string distinct from json", () => {
    const value = { items: [{ id: 1 }, { id: 2 }] };
    const toon = render(value, "toon");
    expect(toon.length).toBeGreaterThan(0);
    expect(toon).not.toBe(render(value, "json"));
  });
  test("text output uses the provided text renderer", () => {
    const out = render({ n: 5 }, "text", (v) => `n is ${v.n}`);
    expect(out).toBe("n is 5");
  });
  test("text output falls back to JSON when no renderer is given", () => {
    const out = render({ n: 5 }, "text");
    expect(JSON.parse(out)).toEqual({ n: 5 });
  });
  test("formatDuration renders h/m/s compactly", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

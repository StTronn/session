import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { rmSync } from "node:fs";

const NOW = Math.floor(new Date(2026, 4, 21, 9, 0, 0).getTime() / 1000);

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const notesDir = "/tmp/session-cli-view-test";
  rmSync(notesDir, { recursive: true, force: true });
  const cmds = commands({ db, clock, notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { run };
}

describe("view & setup commands", () => {
  test("agenda returns blocks grouped by time as JSON", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "14:00", "--to", "15:00"]);
    const ag = JSON.parse(run(["agenda", "--json"]).out);
    expect(ag.upcoming.length).toBe(1);
  });
  test("summary reports totals as JSON", () => {
    const { run } = setup();
    run(["start", "work", "--for", "1m"]);
    run(["done", "--reflect", "x"]);
    const sum = JSON.parse(run(["summary", "--today", "--json"]).out);
    expect(sum.session_count).toBe(1);
  });
  test("context returns the agent aggregate as JSON", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "14:00", "--to", "15:00"]);
    const ctx = JSON.parse(run(["context", "--json"]).out);
    expect(Array.isArray(ctx.categories)).toBe(true);
    expect(Array.isArray(ctx.blocks)).toBe(true);
  });
  test("context --toon returns a non-empty string", () => {
    const { run } = setup();
    const { code, out } = run(["context", "--toon"]);
    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
  });
  test("category list shows created categories", () => {
    const { run } = setup();
    run(["category", "add", "research"]);
    const list = JSON.parse(run(["category", "list", "--json"]).out);
    expect(list.some((c: any) => c.name === "research")).toBe(true);
  });
  test("config set and get round-trip", () => {
    const { run } = setup();
    run(["config", "set", "default_duration", "3000"]);
    expect(run(["config", "get", "default_duration"]).out.trim()).toBe("3000");
  });
});

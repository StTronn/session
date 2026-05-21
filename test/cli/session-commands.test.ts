import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { rmSync } from "node:fs";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const notesDir = "/tmp/session-cli-cmd-test";
  rmSync(notesDir, { recursive: true, force: true });
  const cmds = commands({ db, clock, notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { db, clock, run };
}

describe("session commands", () => {
  test("start then status reports the running session as JSON", () => {
    const { clock, run } = setup();
    expect(run(["start", "work", "--for", "25m"]).code).toBe(0);
    clock.advance(300);
    const { code, out } = run(["status", "--json"]);
    expect(code).toBe(0);
    const st = JSON.parse(out);
    expect(st.category).toBe("work");
    expect(st.elapsed_seconds).toBe(300);
  });
  test("start auto-creates the category and tag", () => {
    const { run } = setup();
    expect(run(["start", "study", "calculus", "--for", "10m"]).code).toBe(0);
    const st = JSON.parse(run(["status", "--json"]).out);
    expect(st.category).toBe("study");
    expect(st.tag).toBe("calculus");
  });
  test("starting a second session fails", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    const { code, out } = run(["start", "work", "--for", "25m"]);
    expect(code).toBe(1);
    expect(out).toContain("already running");
  });
  test("add extends the running session", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    expect(run(["add", "10m"]).code).toBe(0);
    const st = JSON.parse(run(["status", "--json"]).out);
    expect(st.planned_seconds).toBe(2100);
  });
  test("pause and resume change status", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    run(["pause"]);
    expect(JSON.parse(run(["status", "--json"]).out).status).toBe("paused");
    run(["resume"]);
    expect(JSON.parse(run(["status", "--json"]).out).status).toBe("active");
  });
  test("done completes with a reflection and clears status", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    expect(run(["done", "--reflect", "shipped"]).code).toBe(0);
    const { out } = run(["status", "--json"]);
    expect(out.trim()).toBe("null");
  });
  test("status --tmux prints a compact line, empty when idle", () => {
    const { clock, run } = setup();
    expect(run(["status", "--tmux"]).out.trim()).toBe("");
    run(["start", "work", "--for", "25m"]);
    clock.advance(65);
    expect(run(["status", "--tmux"]).out).toContain("work");
  });
  test("list shows completed sessions as JSON", () => {
    const { run } = setup();
    run(["start", "work", "--for", "1m"]);
    run(["done", "--reflect", "x"]);
    const arr = JSON.parse(run(["list", "--json"]).out);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(1);
  });
  test("list --tag filters within a category", () => {
    const { run } = setup();
    run(["start", "work", "api", "--for", "1m"]);
    run(["done", "--reflect", "x"]);
    run(["start", "work", "docs", "--for", "1m"]);
    run(["done", "--reflect", "y"]);
    const apiOnly = JSON.parse(
      run(["list", "--category", "work", "--tag", "api", "--json"]).out,
    );
    expect(apiOnly.length).toBe(1);
    expect(run(["list", "--tag", "api", "--json"]).code).toBe(1);
  });
  test("list --since filters by day window", () => {
    const { clock, run } = setup();
    run(["start", "work", "--for", "1m"]);
    run(["done", "--reflect", "x"]);
    clock.advance(3 * 86400);
    expect(JSON.parse(run(["list", "--since", "1", "--json"]).out).length).toBe(
      0,
    );
    expect(JSON.parse(run(["list", "--since", "5", "--json"]).out).length).toBe(
      1,
    );
    expect(run(["list", "--since", "-2", "--json"]).code).toBe(1);
  });
  test("start --block links the session to a block and activates it", () => {
    const { db, clock, run } = setup();
    // create a block directly
    const { Block } = require("@/core/block/block");
    const { Category } = require("@/core/category/category");
    const cat = Category.ensure(db, clock, "work");
    const blk = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 1000,
      scheduled_end: 2500,
    });
    expect(run(["start", "work", "--block", String(blk.id), "--for", "25m"]).code).toBe(0);
    const st = JSON.parse(run(["status", "--json"]).out);
    expect(st.category).toBe("work");
    expect(Block.get(db, blk.id).status).toBe("active");
    expect(run(["start", "work", "--block", "999"]).code).toBe(1);
  });
});

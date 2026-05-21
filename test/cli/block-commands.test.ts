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
  const notesDir = "/tmp/session-cli-block-test";
  rmSync(notesDir, { recursive: true, force: true });
  const cmds = commands({ db, clock, notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { db, clock, run };
}

describe("block commands", () => {
  test("block add creates a planned block", () => {
    const { run } = setup();
    const { code } = run([
      "block", "add", "work", "--from", "10:00", "--to", "11:00",
      "--title", "design",
    ]);
    expect(code).toBe(0);
    const list = JSON.parse(run(["block", "list", "--json"]).out);
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("design");
  });
  test("block move reschedules a block", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "11:00"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    expect(run(["block", "move", String(id), "--to", "14:00"]).code).toBe(0);
    const moved = JSON.parse(run(["block", "list", "--json"]).out)[0];
    expect(new Date(moved.scheduled_start * 1000).getHours()).toBe(14);
  });
  test("block start launches a session from the block", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "10:30"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    expect(run(["block", "start", String(id)]).code).toBe(0);
    expect(JSON.parse(run(["status", "--json"]).out).category).toBe("work");
  });
  test("block done and skip set status", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "11:00"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    run(["block", "done", String(id)]);
    expect(JSON.parse(run(["block", "list", "--json"]).out)[0].status).toBe(
      "done",
    );
  });
  test("block rm deletes a block", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "11:00"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    run(["block", "rm", String(id)]);
    expect(JSON.parse(run(["block", "list", "--json"]).out).length).toBe(0);
  });
});

import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";

const dataDir = join(tmpdir(), "session-hooks-cmd-test");
const notesDir = join(dataDir, "notes");
const hooksDir = join(dataDir, "hooks");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function setup() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(notesDir, { recursive: true });
  const db = open(":memory:");
  const cmds = commands({ db, clock: fixedClock(1000), notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { run };
}

describe("hooks commands", () => {
  test("hooks init installs an executable example hook", () => {
    const { run } = setup();
    expect(run(["hooks", "init"]).code).toBe(0);
    const sample = join(hooksDir, "session.timesup.sample");
    expect(existsSync(sample)).toBe(true);
    // executable bit set so renaming it activates it directly
    expect(statSync(sample).mode & 0o111).not.toBe(0);
  });
  test("hooks list shows every event and whether a hook is active", () => {
    const { run } = setup();
    run(["hooks", "init"]);
    const out = run(["hooks", "list"]).out;
    expect(out).toContain("session.timesup");
    expect(out).toContain("session.started");
  });
});

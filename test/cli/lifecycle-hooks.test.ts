import { test, expect, describe, afterEach } from "bun:test";
import {
  rmSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { Hooks } from "@/core/hooks/hooks";

const dataDir = join(tmpdir(), "session-lifecycle-test");
const notesDir = join(dataDir, "notes");
const hooksDir = join(dataDir, "hooks");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function setup() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(hooksDir, { recursive: true });
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

function recordingHook(event: string, outFile: string) {
  const p = join(hooksDir, event);
  writeFileSync(p, `#!/bin/sh\ncat > "${outFile}"\n`);
  chmodSync(p, 0o755);
}

describe("CLI lifecycle hook emission", () => {
  test("session start fires session.started", async () => {
    const { run } = setup();
    const out = join(dataDir, "started.json");
    recordingHook("session.started", out);
    run(["start", "work", "api", "--for", "25m"]);
    await Hooks.drain();
    expect(existsSync(out)).toBe(true);
    const p = JSON.parse(readFileSync(out, "utf8"));
    expect(p.event).toBe("session.started");
    expect(p.category).toBe("work");
    expect(p.tag).toBe("api");
  });
  test("session done fires session.completed with the reflection", async () => {
    const { run } = setup();
    const out = join(dataDir, "completed.json");
    recordingHook("session.completed", out);
    run(["start", "work", "--for", "25m"]);
    run(["done", "--reflect", "shipped"]);
    await Hooks.drain();
    const p = JSON.parse(readFileSync(out, "utf8"));
    expect(p.event).toBe("session.completed");
    expect(p.reflection).toBe("shipped");
  });
  test("session cancel fires session.abandoned", async () => {
    const { run } = setup();
    const out = join(dataDir, "abandoned.json");
    recordingHook("session.abandoned", out);
    run(["start", "work", "--for", "25m"]);
    run(["cancel"]);
    await Hooks.drain();
    const p = JSON.parse(readFileSync(out, "utf8"));
    expect(p.event).toBe("session.abandoned");
  });
});

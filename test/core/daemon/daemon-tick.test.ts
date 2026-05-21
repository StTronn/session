import { test, expect, describe, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";
import { Daemon } from "@/core/daemon/daemon";

const dataDir = join(tmpdir(), "session-tick-test");
const hooksDir = join(dataDir, "hooks");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function recordingHook(name: string, outFile: string) {
  mkdirSync(hooksDir, { recursive: true });
  const p = join(hooksDir, name);
  writeFileSync(p, `#!/bin/sh\ncat >> "${outFile}"\necho >> "${outFile}"\n`);
  chmodSync(p, 0o755);
}

describe("Daemon.tick", () => {
  test("dispatches a detected event once, then dedups it", async () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    const cat = Category.create(db, clock, "work");
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(1500);
    const out = join(dataDir, "fires.log");
    recordingHook("session.timesup", out);

    await Daemon.tick(db, clock, { hooksDir, dataDir });
    await Daemon.tick(db, clock, { hooksDir, dataDir });

    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines.length).toBe(1); // fired exactly once across two ticks
    db.close();
  });
  test("extending a timed-up session lets timesup fire again", async () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    const cat = Category.create(db, clock, "work");
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(1500);
    const out = join(dataDir, "fires.log");
    recordingHook("session.timesup", out);

    await Daemon.tick(db, clock, { hooksDir, dataDir }); // fires (1500)
    Session.addTime(db, 300); // planned now 1800
    await Daemon.tick(db, clock, { hooksDir, dataDir }); // elapsed 1500 < 1800
    clock.advance(300);
    await Daemon.tick(db, clock, { hooksDir, dataDir }); // fires (1800)

    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    db.close();
  });
  test("a tick with no events does nothing", async () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    await Daemon.tick(db, clock, { hooksDir, dataDir });
    expect(existsSync(join(dataDir, "fires.log"))).toBe(false);
    db.close();
  });
});

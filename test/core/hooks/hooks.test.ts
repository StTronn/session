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
import { Hooks } from "@/core/hooks/hooks";
import type { EventPayload } from "@/core/event/event";

const dataDir = join(tmpdir(), "session-hooks-test");
const hooksDir = join(dataDir, "hooks");

afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function writeHook(name: string, body: string) {
  mkdirSync(hooksDir, { recursive: true });
  const p = join(hooksDir, name);
  writeFileSync(p, body);
  chmodSync(p, 0o755);
}

const payload: EventPayload = {
  event: "session.timesup",
  at: 1000,
  session_id: 1,
  category: "work",
  tag: "api",
  intent: null,
  planned_seconds: 1500,
};

describe("Hooks.dispatch", () => {
  test("runs the matching hook with the payload as JSON on stdin", async () => {
    const out = join(dataDir, "captured.json");
    writeHook("session.timesup", `#!/bin/sh\ncat > "${out}"\n`);
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    expect(existsSync(out)).toBe(true);
    expect(JSON.parse(readFileSync(out, "utf8")).category).toBe("work");
  });
  test("no hook file is a silent no-op", async () => {
    mkdirSync(hooksDir, { recursive: true });
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    expect(true).toBe(true); // did not throw
  });
  test("a non-executable file is ignored", async () => {
    mkdirSync(hooksDir, { recursive: true });
    const out = join(dataDir, "should-not-exist");
    writeFileSync(
      join(hooksDir, "session.timesup"),
      `#!/bin/sh\ntouch "${out}"\n`,
    ); // not chmod +x
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    expect(existsSync(out)).toBe(false);
  });
  test("a hook exceeding the timeout is killed and dispatch still resolves", async () => {
    const out = join(dataDir, "late.txt");
    writeHook("session.timesup", `#!/bin/sh\nsleep 5\ntouch "${out}"\n`);
    const start = Date.now();
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 300,
      log: "stderr",
    });
    expect(Date.now() - start).toBeLessThan(3000);
  });
  test("drain awaits in-flight fire-and-forget dispatches", async () => {
    const out = join(dataDir, "drained.txt");
    writeHook("session.timesup", `#!/bin/sh\ncat > "${out}"\n`);
    void Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    await Hooks.drain();
    expect(existsSync(out)).toBe(true);
  });
});

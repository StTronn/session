import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dataDir = join(tmpdir(), "session-daemon-cmd-test");
// Ensure `bun` is resolvable when spawning child processes — on some systems
// bun lives in ~/.bun/bin which is not in the default PATH.
const bunDir = join(process.execPath, "..");
const env = {
  ...process.env,
  SESSION_DATA_DIR: dataDir,
  PATH: `${bunDir}:${process.env.PATH ?? ""}`,
};
afterEach(() => {
  Bun.spawnSync(["bun", "run", "bin/session.ts", "daemon", "stop"], { env });
  rmSync(dataDir, { recursive: true, force: true });
});

function cli(...args: string[]) {
  const p = Bun.spawnSync(["bun", "run", "bin/session.ts", ...args], { env });
  return {
    code: p.exitCode,
    out: p.stdout.toString() + p.stderr.toString(),
  };
}

async function waitForRunning(): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if (cli("daemon", "status").out.includes("running")) return true;
    await Bun.sleep(100);
  }
  return false;
}

describe("daemon commands", () => {
  test("status reports not running on a fresh data dir", () => {
    expect(cli("daemon", "status").out).toContain("not running");
  });
  test("start launches the daemon, status sees it, stop ends it", async () => {
    expect(cli("daemon", "start").code).toBe(0);
    expect(await waitForRunning()).toBe(true);
    expect(existsSync(join(dataDir, "daemon.pid"))).toBe(true);
    expect(cli("daemon", "stop").out).toContain("stopped");
    expect(cli("daemon", "status").out).toContain("not running");
  });
  test("a second start while running is a no-op", async () => {
    cli("daemon", "start");
    await waitForRunning();
    expect(cli("daemon", "start").out).toContain("already running");
    cli("daemon", "stop");
  });
});

import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { detectEvents } from "@/core/daemon/detect";
import { FiredEvent } from "@/core/daemon/fired-event";
import { Hooks } from "@/core/hooks/hooks";
import { Pid } from "@/core/daemon/pid";
import { Config } from "@/core/config/config";

export interface TickOptions {
  hooksDir: string;
  dataDir: string;
}

/** One daemon cycle: detect time-based events, dedup against `fired_event`,
 *  and dispatch the newly-recorded ones. */
export async function tick(
  db: Db,
  clock: Clock,
  opts: TickOptions,
): Promise<void> {
  for (const d of detectEvents(db, clock)) {
    const isNew = FiredEvent.recordOnce(
      db,
      d.payload.event,
      d.ref_id,
      d.dedup_key,
      clock.now(),
    );
    if (!isNew) continue;
    await Hooks.dispatch(d.payload, {
      hooksDir: opts.hooksDir,
      dataDir: opts.dataDir,
      timeoutMs: 10000,
      log: "daemon",
    });
  }
}

export interface RunOptions {
  dataDir: string;
  hooksDir: string;
}

/** The argv needed to re-launch this program as `daemon run`, correct for both
 *  `bun run bin/session.ts` (dev) and the compiled standalone binary. */
export function spawnArgv(): string[] {
  const execPath = process.execPath;
  const isCompiled = !/[\\/]bun(\.exe)?$/.test(execPath);
  return isCompiled
    ? [execPath, "daemon", "run"]
    : [execPath, Bun.main, "daemon", "run"];
}

/** Spawn a detached daemon process. Returns its OS pid. */
export function spawn(dataDir: string): number {
  const proc = Bun.spawn(spawnArgv(), {
    env: { ...process.env, SESSION_DATA_DIR: dataDir },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  proc.unref();
  return proc.pid;
}

/** Spawn a daemon only if none is already live for this data dir. */
export function ensureRunning(dataDir: string): void {
  if (Pid.liveDaemon(dataDir)) return;
  Pid.clear(dataDir);
  spawn(dataDir);
}

/** The foreground watch loop. Writes the PID file, then ticks until killed. */
export async function run(
  db: Db,
  clock: Clock,
  opts: RunOptions,
): Promise<void> {
  Pid.write(opts.dataDir, {
    pid: process.pid,
    started_at: clock.now(),
    data_dir: opts.dataDir,
    argv: process.argv,
  });
  const cleanup = (): void => {
    Pid.clear(opts.dataDir);
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  const pollMs = Config.daemonPollSeconds(db) * 1000;
  for (;;) {
    await tick(db, clock, { hooksDir: opts.hooksDir, dataDir: opts.dataDir });
    await Bun.sleep(pollMs);
  }
}

export * as Daemon from "./daemon";

// src/core/hooks/hooks.ts
import { existsSync, accessSync, constants, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { EventPayload } from "@/core/event/event";

export interface DispatchOptions {
  hooksDir: string;
  dataDir: string;
  timeoutMs: number;
  log: "daemon" | "stderr";
}

/** In-flight fire-and-forget dispatches, awaited by `drain()`. */
const pending = new Set<Promise<void>>();

function isExecutable(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function runHook(
  event: EventPayload,
  options: DispatchOptions,
): Promise<void> {
  const hookPath = join(options.hooksDir, event.event);
  if (!isExecutable(hookPath)) return;

  const logLine = (s: string): void => {
    if (options.log === "daemon") {
      appendFileSync(join(options.dataDir, "daemon.log"), s + "\n");
    } else {
      process.stderr.write(s + "\n");
    }
  };

  try {
    const proc = Bun.spawn([hookPath], {
      stdin: new Blob([JSON.stringify(event)]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        SESSION_EVENT: event.event,
        SESSION_DATA_DIR: options.dataDir,
      },
    });
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), options.timeoutMs),
    );
    const result = await Promise.race([
      proc.exited.then((code) => ({ kind: "exited" as const, code })),
      timeoutPromise,
    ]);
    if (result === "timeout") {
      proc.kill();
      // The hook was abandoned: reap its exit and drain its pipes in the
      // background so neither leaves a dangling promise or a full pipe buffer
      // that could keep the killed process from exiting.
      void proc.exited.catch(() => {});
      void new Response(proc.stderr).text().catch(() => {});
      void new Response(proc.stdout).text().catch(() => {});
      logLine(`[hook ${event.event}] killed after ${options.timeoutMs}ms`);
      return;
    }
    const exitCode = result.code;
    const stderr = (await new Response(proc.stderr).text()).trim();
    if (options.log === "daemon" || exitCode !== 0 || stderr) {
      logLine(
        `[hook ${event.event}] exit=${exitCode}${stderr ? " " + stderr : ""}`,
      );
    }
  } catch (e) {
    logLine(`[hook ${event.event}] error: ${(e as Error).message}`);
  }
}

/** Run the hook for an event, if one exists. Never throws. The returned promise
 *  is also registered so `drain()` can await fire-and-forget callers. */
export function dispatch(
  event: EventPayload,
  options: DispatchOptions,
): Promise<void> {
  const p = runHook(event, options);
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

/** Await every in-flight dispatch. Called by the CLI entry point before exit. */
export async function drain(): Promise<void> {
  await Promise.allSettled([...pending]);
}

export * as Hooks from "./hooks";

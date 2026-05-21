// src/cli/commands/daemon.ts
import { dirname } from "node:path";
import { Pid } from "@/core/daemon/pid";
import { Daemon } from "@/core/daemon/daemon";
import type { Command } from "@/cli/registry";
import type { CommandDeps } from "@/cli/commands/session";

export function daemonCommands(deps: CommandDeps): Command[] {
  // notesDir is always <dataDir>/notes, so its parent is the data dir.
  const dataDir = dirname(deps.notesDir);
  return [
    {
      name: "daemon start",
      summary: "start the background daemon",
      run: (ctx) => {
        const live = Pid.liveDaemon(dataDir);
        if (live) {
          ctx.print(`daemon already running (pid ${live.pid})\n`);
          return 0;
        }
        Pid.clear(dataDir);
        const pid = Daemon.spawn(dataDir);
        ctx.print(`daemon started (pid ${pid})\n`);
        return 0;
      },
    },
    {
      name: "daemon stop",
      summary: "stop the background daemon",
      run: (ctx) => {
        const live = Pid.liveDaemon(dataDir);
        if (!live) {
          Pid.clear(dataDir);
          ctx.print("daemon not running\n");
          return 0;
        }
        try {
          process.kill(live.pid, "SIGTERM");
        } catch {
          // already gone
        }
        Pid.clear(dataDir);
        ctx.print(`daemon stopped (pid ${live.pid})\n`);
        return 0;
      },
    },
    {
      name: "daemon status",
      summary: "show whether the daemon is running",
      run: (ctx) => {
        const live = Pid.liveDaemon(dataDir);
        if (live) {
          ctx.print(`running (pid ${live.pid})\n`);
        } else {
          ctx.print("not running\n");
        }
        return 0;
      },
    },
  ];
}

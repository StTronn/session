// src/cli/commands/hooks.ts
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  accessSync,
  constants,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "@/cli/registry";
import type { CommandDeps } from "@/cli/commands/session";

const EVENTS = [
  "session.started",
  "session.completed",
  "session.abandoned",
  "session.timesup",
  "session.long-pause",
];

/** Example hook installed by `hooks init` as session.timesup.sample. */
const TIMESUP_SAMPLE = `#!/bin/sh
# Example "session.timesup" hook.
#
# The daemon runs this when a focus session reaches its planned duration.
# The full event is JSON on stdin; $SESSION_EVENT holds the event name.
# Rename this file to "session.timesup" (drop ".sample") to activate it.

cat >/dev/null   # consume the JSON payload
osascript -e 'display notification "Your focus session has reached its planned time." with title "Session"'
`;

function isExecutable(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function hookCommands(deps: CommandDeps): Command[] {
  const hooksDir = join(dirname(deps.notesDir), "hooks");
  return [
    {
      name: "hooks init",
      summary: "install example hook scripts into the hooks directory",
      run: (ctx) => {
        mkdirSync(hooksDir, { recursive: true });
        const sample = join(hooksDir, "session.timesup.sample");
        writeFileSync(sample, TIMESUP_SAMPLE);
        chmodSync(sample, 0o755);
        ctx.print(`installed ${sample}\n`);
        ctx.print(
          'rename it to "session.timesup" (drop ".sample") to activate it\n',
        );
        return 0;
      },
    },
    {
      name: "hooks list",
      summary: "list hook events and whether each has an active hook",
      run: (ctx) => {
        ctx.print(`hooks directory: ${hooksDir}\n`);
        for (const event of EVENTS) {
          const active = isExecutable(join(hooksDir, event));
          ctx.print(`  ${event.padEnd(22)} ${active ? "active" : "—"}\n`);
        }
        return 0;
      },
    },
  ];
}

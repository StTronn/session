#!/usr/bin/env bun
import { open } from "@/core/db/db";
import { systemClock } from "@/core/clock/clock";
import { dbPath, notesDir, dataDir, hooksDir } from "@/cli/paths";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { VERSION } from "@/version";
import { Daemon } from "@/core/daemon/daemon";
import { Hooks } from "@/core/hooks/hooks";

const argv = process.argv.slice(2);

if (argv[0] === "--version" || argv[0] === "-v") {
  process.stdout.write(VERSION + "\n");
  process.exit(0);
}

// Internal: the foreground daemon watch loop. Never returns under normal use.
if (argv[0] === "daemon" && argv[1] === "run") {
  const ddb = open(dbPath());
  await Daemon.run(ddb, systemClock(), {
    dataDir: dataDir(),
    hooksDir: hooksDir(),
  });
  process.exit(0);
}

const db = open(dbPath());
const code = dispatch(
  commands({ db, clock: systemClock(), notesDir: notesDir() }),
  argv,
  (s) => process.stdout.write(s),
);
await Hooks.drain();
// `session start` makes the daemon available without an explicit `daemon start`.
if (argv[0] === "start" && code === 0) {
  Daemon.ensureRunning(dataDir());
}
db.close();
process.exit(code);

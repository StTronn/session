#!/usr/bin/env bun
import { open } from "@/core/db/db";
import { systemClock } from "@/core/clock/clock";
import { dbPath, notesDir } from "@/cli/paths";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { VERSION } from "@/version";

const argv = process.argv.slice(2);
if (argv[0] === "--version" || argv[0] === "-v") {
  process.stdout.write(VERSION + "\n");
  process.exit(0);
}

const db = open(dbPath());
const code = dispatch(
  commands({ db, clock: systemClock(), notesDir: notesDir() }),
  argv,
  (s) => process.stdout.write(s),
);
db.close();
process.exit(code);

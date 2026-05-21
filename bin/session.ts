#!/usr/bin/env bun
import { open } from "@/core/db/db";
import { systemClock } from "@/core/clock/clock";
import { dbPath, notesDir } from "@/cli/paths";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";

const db = open(dbPath());
const code = dispatch(
  commands({ db, clock: systemClock(), notesDir: notesDir() }),
  process.argv.slice(2),
  (s) => process.stdout.write(s),
);
db.close();
process.exit(code);

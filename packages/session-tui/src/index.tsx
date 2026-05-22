#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { open } from "@/core/db/db";
import { systemClock } from "@/core/clock/clock";
import { dbPath, notesDir } from "@/cli/paths";
import { App } from "./App";

const compact = process.argv.includes("--compact");
const db = open(dbPath());

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
  targetFPS: 30,
  onDestroy: () => {
    db.close();
  },
});

createRoot(renderer).render(
  <App
    db={db}
    clock={systemClock()}
    compact={compact}
    notesDir={notesDir()}
  />,
);

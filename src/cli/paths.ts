// src/cli/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Root data directory: $SESSION_DATA_DIR or ~/.local/share/session. */
export function dataDir(): string {
  return (
    process.env.SESSION_DATA_DIR ??
    join(homedir(), ".local", "share", "session")
  );
}

export function dbPath(): string {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, "session.db");
}

export function notesDir(): string {
  const dir = join(dataDir(), "notes");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function hooksDir(): string {
  const dir = join(dataDir(), "hooks");
  mkdirSync(dir, { recursive: true });
  return dir;
}

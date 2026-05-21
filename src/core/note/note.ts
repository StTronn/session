// src/core/note/note.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export type NoteKind = "session" | "block";

const DEFAULT_TEMPLATE = "# Todo\n\n- [ ] \n";

/** Create a todo markdown file under `notesDir` for the given owner.
 *  Returns the path relative to `notesDir`. If the file already exists it is
 *  left untouched (so re-attaching a note never destroys content). */
export function create(
  notesDir: string,
  kind: NoteKind,
  ownerId: number,
  contents?: string,
): string {
  const rel = `${kind}/${ownerId}.md`;
  const abs = join(notesDir, rel);
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents ?? DEFAULT_TEMPLATE, "utf8");
  }
  return rel;
}

export function absPath(notesDir: string, relPath: string): string {
  return join(notesDir, relPath);
}

export function read(notesDir: string, relPath: string): string | null {
  const abs = join(notesDir, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

export * as Note from "./note";

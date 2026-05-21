import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Note } from "@/core/note/note";

const dir = join(tmpdir(), "session-note-test");
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("note", () => {
  test("create writes a markdown file and returns a relative path", () => {
    const rel = Note.create(dir, "session", 12, "# Todo\n- [ ] ship it\n");
    expect(rel).toBe("session/12.md");
    expect(existsSync(join(dir, rel))).toBe(true);
  });
  test("read returns file contents", () => {
    const rel = Note.create(dir, "block", 3, "plan");
    expect(Note.read(dir, rel)).toBe("plan");
  });
  test("read returns null for a missing note", () => {
    expect(Note.read(dir, "session/999.md")).toBeNull();
  });
  test("absPath joins the notes dir", () => {
    expect(Note.absPath(dir, "session/1.md")).toBe(join(dir, "session/1.md"));
  });
  test("create is idempotent — does not clobber an existing note", () => {
    Note.create(dir, "session", 1, "original");
    Note.create(dir, "session", 1, "replacement");
    expect(Note.read(dir, "session/1.md")).toBe("original");
  });
});

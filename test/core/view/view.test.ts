import { test, expect, describe } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Block } from "@/core/block/block";
import { Note } from "@/core/note/note";
import { View } from "@/core/view/view";

const NOW = Math.floor(new Date(2026, 4, 21, 12, 0, 0).getTime() / 1000);
const notesDir = join(tmpdir(), "session-view-test");

function setup() {
  rmSync(notesDir, { recursive: true, force: true });
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const cat = Category.create(db, clock, "work");
  const tag = Tag.create(db, clock, cat.id, "api");
  return { db, clock, cat, tag };
}

describe("view", () => {
  test("status is null when nothing runs", () => {
    const { db, clock } = setup();
    expect(View.status(db, clock)).toBeNull();
    db.close();
  });
  test("status reports the running session with derived times", () => {
    const { db, clock, cat, tag } = setup();
    Session.start(db, clock, {
      category_id: cat.id,
      tag_id: tag.id,
      planned_seconds: 1500,
      intent: "ship it",
    });
    clock.advance(300);
    const st = View.status(db, clock)!;
    expect(st.category).toBe("work");
    expect(st.tag).toBe("api");
    expect(st.intent).toBe("ship it");
    expect(st.status).toBe("active");
    expect(st.elapsed_seconds).toBe(300);
    expect(st.remaining_seconds).toBe(1200);
    db.close();
  });
  test("agenda groups blocks into past/current/upcoming", () => {
    const { db, clock, cat } = setup();
    Block.create(db, clock, {
      category_id: cat.id,
      title: "morning",
      scheduled_start: NOW - 7200,
      scheduled_end: NOW - 3600,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "now",
      scheduled_start: NOW - 600,
      scheduled_end: NOW + 600,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "afternoon",
      scheduled_start: NOW + 3600,
      scheduled_end: NOW + 5400,
    });
    const ag = View.agenda(db, clock);
    expect(ag.past.map((b) => b.title)).toEqual(["morning"]);
    expect(ag.current.map((b) => b.title)).toEqual(["now"]);
    expect(ag.upcoming.map((b) => b.title)).toEqual(["afternoon"]);
    db.close();
  });
  test("summary totals focused seconds per category", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 600 });
    clock.advance(600);
    Session.complete(db, clock);
    const sum = View.summary(db, clock, "today");
    expect(sum.total_seconds).toBe(600);
    expect(sum.by_category[0]).toEqual({ category: "work", seconds: 600 });
    db.close();
  });
  test("context inlines todo note contents", () => {
    const { db, clock, cat } = setup();
    const rel = Note.create(notesDir, "block", 1, "- [ ] write tests");
    const b = Block.create(db, clock, {
      category_id: cat.id,
      title: "with note",
      scheduled_start: NOW + 60,
      scheduled_end: NOW + 660,
      note_path: rel,
    });
    const ctx = View.context(db, clock, notesDir);
    const blk = ctx.blocks.find((x) => x.id === b.id)!;
    expect(blk.note).toBe("- [ ] write tests");
    db.close();
  });
});

import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Block } from "@/core/block/block";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("block crud", () => {
  test("create stores a planned block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      title: "design review",
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    expect(b.id).toBeGreaterThan(0);
    expect(b.status).toBe("planned");
    expect(b.scheduled_start).toBe(5000);
    expect(b.title).toBe("design review");
    db.close();
  });
  test("create rejects end before start", () => {
    const { db, clock, cat } = setup();
    expect(() =>
      Block.create(db, clock, {
        category_id: cat.id,
        scheduled_start: 6000,
        scheduled_end: 5000,
      }),
    ).toThrow();
    db.close();
  });
  test("move reschedules the block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.move(db, b.id, 8000, 9500);
    const moved = Block.get(db, b.id)!;
    expect(moved.scheduled_start).toBe(8000);
    expect(moved.scheduled_end).toBe(9500);
    db.close();
  });
  test("setNote attaches a note path", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.setNote(db, b.id, "block/1.md");
    expect(Block.get(db, b.id)!.note_path).toBe("block/1.md");
    db.close();
  });
  test("markDone and markSkipped change status", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.markDone(db, b.id);
    expect(Block.get(db, b.id)!.status).toBe("done");
    Block.markSkipped(db, b.id);
    expect(Block.get(db, b.id)!.status).toBe("skipped");
    db.close();
  });
  test("remove deletes the block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.remove(db, b.id);
    expect(Block.get(db, b.id)).toBeNull();
    db.close();
  });
});

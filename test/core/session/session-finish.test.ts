import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("session complete/abandon/reflect/list", () => {
  test("complete ends the session and stores reflection", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    clock.advance(1500);
    const done = Session.complete(db, clock, "learned the api");
    expect(done.status).toBe("completed");
    expect(done.ended_at).toBe(2500);
    expect(done.reflection).toBe("learned the api");
    expect(Session.active(db)).toBeNull();
    db.close();
  });
  test("completing while paused closes the open pause", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    clock.advance(300);
    Session.pause(db, clock);
    clock.advance(120);
    const done = Session.complete(db, clock);
    expect(Session.elapsed(db, clock, done)).toBe(300);
    db.close();
  });
  test("complete updates a linked block to done", () => {
    const { db, clock, cat } = setup();
    const blk = db.raw
      .query(
        "INSERT INTO block (category_id, scheduled_start, scheduled_end, " +
          "status, created_at) VALUES (?, 0, 100, 'planned', 0)",
      )
      .run(cat.id);
    const blockId = Number(blk.lastInsertRowid);
    Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
      block_id: blockId,
    });
    Session.complete(db, clock);
    const status = (
      db.raw.query("SELECT status FROM block WHERE id = ?").get(blockId) as any
    ).status;
    expect(status).toBe("done");
    db.close();
  });
  test("abandon reverts a linked block to planned", () => {
    const { db, clock, cat } = setup();
    const blk = db.raw
      .query(
        "INSERT INTO block (category_id, scheduled_start, scheduled_end, " +
          "status, created_at) VALUES (?, 0, 100, 'planned', 0)",
      )
      .run(cat.id);
    const blockId = Number(blk.lastInsertRowid);
    Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
      block_id: blockId,
    });
    Session.abandon(db, clock);
    const status = (
      db.raw.query("SELECT status FROM block WHERE id = ?").get(blockId) as any
    ).status;
    expect(status).toBe("planned");
    db.close();
  });
  test("reflect updates a past session", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    Session.complete(db, clock);
    Session.reflect(db, s.id, "added later");
    expect(Session.get(db, s.id)!.reflection).toBe("added later");
    db.close();
  });
  test("list returns completed sessions newest first, with filters", () => {
    const { db, clock, cat } = setup();
    const a = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 60,
    });
    Session.complete(db, clock);
    clock.advance(100);
    const b = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 60,
    });
    Session.complete(db, clock);
    const ids = Session.list(db, {}).map((s) => s.id);
    expect(ids).toEqual([b.id, a.id]);
    expect(Session.list(db, { category_id: cat.id }).length).toBe(2);
    db.close();
  });
});

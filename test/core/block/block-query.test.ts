import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Block } from "@/core/block/block";
import { Session } from "@/core/session/session";

// 2026-05-21 12:00 local time as the reference "now".
const NOW = Math.floor(new Date(2026, 4, 21, 12, 0, 0).getTime() / 1000);

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("block day queries", () => {
  test("today returns only blocks scheduled on the clock's date", () => {
    const { db, clock, cat } = setup();
    Block.create(db, clock, {
      category_id: cat.id,
      title: "today block",
      scheduled_start: NOW + 3600,
      scheduled_end: NOW + 5400,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "tomorrow block",
      scheduled_start: NOW + 86400,
      scheduled_end: NOW + 88200,
    });
    const titles = Block.today(db, clock).map((b) => b.title);
    expect(titles).toEqual(["today block"]);
    db.close();
  });
  test("upcoming returns future blocks ordered by start", () => {
    const { db, clock, cat } = setup();
    Block.create(db, clock, {
      category_id: cat.id,
      title: "later",
      scheduled_start: NOW + 7200,
      scheduled_end: NOW + 9000,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "soon",
      scheduled_start: NOW + 3600,
      scheduled_end: NOW + 5400,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "past",
      scheduled_start: NOW - 7200,
      scheduled_end: NOW - 3600,
    });
    expect(Block.upcoming(db, clock).map((b) => b.title)).toEqual([
      "soon",
      "later",
    ]);
    db.close();
  });
  test("startFromBlock starts a linked session and activates the block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: NOW,
      scheduled_end: NOW + 1500,
    });
    const s = Block.startFromBlock(db, clock, b.id, 1500);
    expect(s.block_id).toBe(b.id);
    expect(s.category_id).toBe(cat.id);
    expect(Block.get(db, b.id)!.status).toBe("active");
    expect(Session.active(db)!.id).toBe(s.id);
    db.close();
  });
});

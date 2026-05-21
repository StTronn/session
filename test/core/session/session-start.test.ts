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

describe("session start & queries", () => {
  test("start creates an active session", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    expect(s.status).toBe("active");
    expect(s.started_at).toBe(1000);
    expect(s.planned_seconds).toBe(1500);
    db.close();
  });
  test("only one session may be active at a time", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    expect(() =>
      Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 }),
    ).toThrow();
    db.close();
  });
  test("active returns the running session, or null", () => {
    const { db, clock, cat } = setup();
    expect(Session.active(db)).toBeNull();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    expect(Session.active(db)?.id).toBe(s.id);
    db.close();
  });
  test("elapsed grows with the clock", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    clock.advance(600);
    expect(Session.elapsed(db, clock, s)).toBe(600);
    expect(Session.remaining(db, clock, s)).toBe(900);
    db.close();
  });
});

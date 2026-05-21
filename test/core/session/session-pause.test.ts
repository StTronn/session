import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  const s = Session.start(db, clock, {
    category_id: cat.id,
    planned_seconds: 1500,
  });
  return { db, clock, s };
}

describe("session pause/resume/addTime", () => {
  test("paused time does not count toward elapsed", () => {
    const { db, clock, s } = setup();
    clock.advance(300); // 5 min of focus
    Session.pause(db, clock);
    clock.advance(600); // 10 min paused
    Session.resume(db, clock);
    clock.advance(120); // 2 more min of focus
    const fresh = Session.get(db, s.id)!;
    expect(Session.elapsed(db, clock, fresh)).toBe(420);
    db.close();
  });
  test("status flips to paused and back to active", () => {
    const { db, clock, s } = setup();
    Session.pause(db, clock);
    expect(Session.get(db, s.id)!.status).toBe("paused");
    Session.resume(db, clock);
    expect(Session.get(db, s.id)!.status).toBe("active");
    db.close();
  });
  test("pausing twice throws", () => {
    const { db, clock } = setup();
    Session.pause(db, clock);
    expect(() => Session.pause(db, clock)).toThrow();
    db.close();
  });
  test("resuming a non-paused session throws", () => {
    const { db, clock } = setup();
    expect(() => Session.resume(db, clock)).toThrow();
    db.close();
  });
  test("addTime extends planned_seconds", () => {
    const { db, clock, s } = setup();
    Session.addTime(db, 600);
    expect(Session.get(db, s.id)!.planned_seconds).toBe(2100);
    db.close();
  });
  test("addTime with no running session throws", () => {
    const db = open(":memory:");
    expect(() => Session.addTime(db, 600)).toThrow();
    db.close();
  });
});

import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";
import { Config } from "@/core/config/config";
import { Detect } from "@/core/daemon/detect";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("Detect.detectEvents", () => {
  test("no events when nothing is running", () => {
    const { db, clock } = setup();
    expect(Detect.detectEvents(db, clock)).toEqual([]);
    db.close();
  });
  test("no events while an active session is under its planned time", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(600);
    expect(Detect.detectEvents(db, clock)).toEqual([]);
    db.close();
  });
  test("session.timesup fires once the planned time is reached", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(1500);
    const events = Detect.detectEvents(db, clock);
    expect(events.length).toBe(1);
    expect(events[0]!.payload.event).toBe("session.timesup");
    expect(events[0]!.payload.elapsed_seconds).toBe(1500);
    expect(events[0]!.dedup_key).toBe("planned_seconds:1500");
    db.close();
  });
  test("session.long-pause fires after the pause threshold", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    Session.pause(db, clock);
    clock.advance(Config.longPauseSeconds(db) + 10);
    const events = Detect.detectEvents(db, clock);
    expect(events.length).toBe(1);
    expect(events[0]!.payload.event).toBe("session.long-pause");
    db.close();
  });
  test("a short pause produces no event", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    Session.pause(db, clock);
    clock.advance(60);
    expect(Detect.detectEvents(db, clock)).toEqual([]);
    db.close();
  });
});

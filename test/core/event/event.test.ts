import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Event } from "@/core/event/event";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  const tag = Tag.create(db, clock, cat.id, "api");
  const s = Session.start(db, clock, {
    category_id: cat.id,
    tag_id: tag.id,
    intent: "ship it",
    planned_seconds: 1500,
  });
  return { db, clock, s };
}

describe("Event.fromSession", () => {
  test("builds a payload with resolved category and tag names", () => {
    const { db, s } = setup();
    const p = Event.fromSession(db, "session.started", 2000, s);
    expect(p.event).toBe("session.started");
    expect(p.at).toBe(2000);
    expect(p.session_id).toBe(s.id);
    expect(p.category).toBe("work");
    expect(p.tag).toBe("api");
    expect(p.intent).toBe("ship it");
    expect(p.planned_seconds).toBe(1500);
    db.close();
  });
  test("tag is null when the session has none", () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    const cat = Category.create(db, clock, "study");
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 600,
    });
    const p = Event.fromSession(db, "session.started", 2000, s);
    expect(p.tag).toBeNull();
    db.close();
  });
  test("extra fields are merged into the payload", () => {
    const { db, s } = setup();
    const p = Event.fromSession(db, "session.timesup", 2500, s, {
      elapsed_seconds: 1500,
    });
    expect(p.elapsed_seconds).toBe(1500);
    expect(p.event).toBe("session.timesup");
    db.close();
  });
});

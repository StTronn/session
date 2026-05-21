import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { FiredEvent } from "@/core/daemon/fired-event";

describe("FiredEvent.recordOnce", () => {
  test("returns true the first time, false thereafter", () => {
    const db = open(":memory:");
    expect(FiredEvent.recordOnce(db, "session.timesup", 1, "k", 1000)).toBe(
      true,
    );
    expect(FiredEvent.recordOnce(db, "session.timesup", 1, "k", 1001)).toBe(
      false,
    );
    db.close();
  });
  test("a different key for the same event+ref fires again", () => {
    const db = open(":memory:");
    expect(
      FiredEvent.recordOnce(db, "session.timesup", 1, "planned:1500", 1000),
    ).toBe(true);
    expect(
      FiredEvent.recordOnce(db, "session.timesup", 1, "planned:1800", 1000),
    ).toBe(true);
    db.close();
  });
  test("a different ref_id fires independently", () => {
    const db = open(":memory:");
    expect(FiredEvent.recordOnce(db, "session.long-pause", 1, "", 1000)).toBe(
      true,
    );
    expect(FiredEvent.recordOnce(db, "session.long-pause", 2, "", 1000)).toBe(
      true,
    );
    db.close();
  });
});

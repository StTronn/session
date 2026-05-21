import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";

describe("db", () => {
  test("opens an in-memory database and applies the schema", () => {
    const db = open(":memory:");
    const tables = db.raw
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("category");
    expect(tables).toContain("tag");
    expect(tables).toContain("block");
    expect(tables).toContain("session");
    expect(tables).toContain("session_pause");
    expect(tables).toContain("config");
    db.close();
  });

  test("migrations are idempotent across re-opens", () => {
    const db1 = open(":memory:");
    const v1 = (db1.raw.query("PRAGMA user_version").get() as any).user_version;
    db1.close();
    const db2 = open(":memory:");
    const v2 = (db2.raw.query("PRAGMA user_version").get() as any).user_version;
    expect(v2).toBe(v1);
    expect(v2).toBeGreaterThan(0);
    db2.close();
  });

  test("foreign keys are enforced", () => {
    const db = open(":memory:");
    expect(() =>
      db.raw
        .query("INSERT INTO tag (category_id, name, created_at) VALUES (999, 'x', 0)")
        .run(),
    ).toThrow();
    db.close();
  });

  test("migration 2 creates the fired_event table", () => {
    const db = open(":memory:");
    const tables = db.raw
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("fired_event");
    const version = (db.raw.query("PRAGMA user_version").get() as any)
      .user_version;
    expect(version).toBe(2);
    db.close();
  });
});

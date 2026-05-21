import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";

describe("tag", () => {
  test("create attaches a tag to a category", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    const t = Tag.create(db, fixedClock(1000), c.id, "api");
    expect(t.id).toBeGreaterThan(0);
    expect(t.category_id).toBe(c.id);
    expect(t.name).toBe("api");
    db.close();
  });
  test("same tag name allowed in different categories", () => {
    const db = open(":memory:");
    const work = Category.create(db, fixedClock(1000), "work");
    const study = Category.create(db, fixedClock(1000), "study");
    Tag.create(db, fixedClock(1000), work.id, "reading");
    expect(() =>
      Tag.create(db, fixedClock(1000), study.id, "reading"),
    ).not.toThrow();
    db.close();
  });
  test("duplicate tag in same category throws", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Tag.create(db, fixedClock(1000), c.id, "api");
    expect(() => Tag.create(db, fixedClock(1000), c.id, "api")).toThrow();
    db.close();
  });
  test("getByName scopes to a category", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Tag.create(db, fixedClock(1000), c.id, "api");
    expect(Tag.getByName(db, c.id, "api")?.name).toBe("api");
    expect(Tag.getByName(db, c.id, "missing")).toBeNull();
    db.close();
  });
  test("list returns tags for a category", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Tag.create(db, fixedClock(1000), c.id, "api");
    Tag.create(db, fixedClock(1000), c.id, "docs");
    expect(Tag.list(db, c.id).map((t) => t.name)).toEqual(["api", "docs"]);
    db.close();
  });
});

import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";

describe("category", () => {
  test("create returns a row with an id", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    expect(c.id).toBeGreaterThan(0);
    expect(c.name).toBe("work");
    expect(c.archived).toBe(false);
    expect(c.created_at).toBe(1000);
    db.close();
  });
  test("getByName finds a category", () => {
    const db = open(":memory:");
    Category.create(db, fixedClock(1000), "study");
    expect(Category.getByName(db, "study")?.name).toBe("study");
    expect(Category.getByName(db, "nope")).toBeNull();
    db.close();
  });
  test("duplicate name throws", () => {
    const db = open(":memory:");
    Category.create(db, fixedClock(1000), "work");
    expect(() => Category.create(db, fixedClock(1000), "work")).toThrow();
    db.close();
  });
  test("list excludes archived unless asked", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Category.create(db, fixedClock(1000), "study");
    Category.archive(db, c.id);
    expect(Category.list(db).map((x) => x.name)).toEqual(["study"]);
    expect(Category.list(db, { includeArchived: true }).length).toBe(2);
    db.close();
  });
  test("rename changes the name", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "wrk");
    Category.rename(db, c.id, "work");
    expect(Category.get(db, c.id)?.name).toBe("work");
    db.close();
  });
});

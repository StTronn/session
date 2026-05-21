import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { Config } from "@/core/config/config";

describe("config", () => {
  test("returns built-in default when unset", () => {
    const db = open(":memory:");
    expect(Config.get(db, "default_duration")).toBe("1500");
    expect(Config.defaultDuration(db)).toBe(1500);
    db.close();
  });
  test("set overrides default", () => {
    const db = open(":memory:");
    Config.set(db, "default_duration", "3000");
    expect(Config.defaultDuration(db)).toBe(3000);
    db.close();
  });
  test("set is upsert", () => {
    const db = open(":memory:");
    Config.set(db, "k", "a");
    Config.set(db, "k", "b");
    expect(Config.get(db, "k")).toBe("b");
    db.close();
  });
  test("unknown key with no default is null", () => {
    const db = open(":memory:");
    expect(Config.get(db, "missing")).toBeNull();
    db.close();
  });
});

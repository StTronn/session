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

  test("daemon config getters return defaults and honour overrides", () => {
    const db = open(":memory:");
    expect(Config.longPauseSeconds(db)).toBe(1200);
    expect(Config.daemonPollSeconds(db)).toBe(15);
    Config.set(db, "long_pause_seconds", "600");
    Config.set(db, "daemon_poll_seconds", "5");
    expect(Config.longPauseSeconds(db)).toBe(600);
    expect(Config.daemonPollSeconds(db)).toBe(5);
    db.close();
  });
});

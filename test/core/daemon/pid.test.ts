import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Pid } from "@/core/daemon/pid";

const dataDir = join(tmpdir(), "session-pid-test");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function freshDir() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

describe("Pid", () => {
  test("write then read round-trips the metadata", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: 4242,
      started_at: 1000,
      data_dir: dir,
      argv: ["bun", "daemon", "run"],
    });
    const info = Pid.read(dir);
    expect(info?.pid).toBe(4242);
    expect(info?.data_dir).toBe(dir);
  });
  test("read returns null when there is no pid file", () => {
    const dir = freshDir();
    expect(Pid.read(dir)).toBeNull();
  });
  test("liveDaemon returns info for a live process in the same data dir", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: process.pid,
      started_at: 1000,
      data_dir: dir,
      argv: process.argv,
    });
    expect(Pid.liveDaemon(dir)?.pid).toBe(process.pid);
  });
  test("liveDaemon returns null for a dead pid", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: 999999,
      started_at: 1000,
      data_dir: dir,
      argv: [],
    });
    expect(Pid.liveDaemon(dir)).toBeNull();
  });
  test("liveDaemon returns null when the recorded data dir does not match", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: process.pid,
      started_at: 1000,
      data_dir: "/some/other/dir",
      argv: [],
    });
    expect(Pid.liveDaemon(dir)).toBeNull();
  });
  test("clear removes the pid file", () => {
    const dir = freshDir();
    Pid.write(dir, { pid: 1, started_at: 0, data_dir: dir, argv: [] });
    Pid.clear(dir);
    expect(existsSync(Pid.pidFilePath(dir))).toBe(false);
  });
});

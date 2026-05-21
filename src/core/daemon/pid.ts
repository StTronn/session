// src/core/daemon/pid.ts
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface PidInfo {
  pid: number;
  started_at: number;
  data_dir: string;
  argv: string[];
}

export function pidFilePath(dataDir: string): string {
  return join(dataDir, "daemon.pid");
}

export function read(dataDir: string): PidInfo | null {
  const p = pidFilePath(dataDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PidInfo;
  } catch {
    return null;
  }
}

export function write(dataDir: string, info: PidInfo): void {
  writeFileSync(pidFilePath(dataDir), JSON.stringify(info, null, 2));
}

export function clear(dataDir: string): void {
  const p = pidFilePath(dataDir);
  if (existsSync(p)) rmSync(p);
}

/** Is `pid` a live process? Uses signal 0, which checks existence only. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The PID file is a hint, not authority. A daemon counts as live for this data
 *  dir only when the file exists, records this same data dir, and its process
 *  is alive. A non-matching or dead entry is treated as stale (returns null). */
export function liveDaemon(dataDir: string): PidInfo | null {
  const info = read(dataDir);
  if (!info) return null;
  if (info.data_dir !== dataDir) return null;
  if (!processAlive(info.pid)) return null;
  return info;
}

export * as Pid from "./pid";

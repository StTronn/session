// src/core/config/config.ts
import type { Db } from "@/core/db/db";

const DEFAULTS: Record<string, string> = {
  default_duration: "1500", // 25 minutes, in seconds
};

export function get(db: Db, key: string): string | null {
  const row = db.raw
    .query("SELECT value FROM config WHERE key = ?")
    .get(key) as { value: string } | null;
  if (row) return row.value;
  return DEFAULTS[key] ?? null;
}

export function set(db: Db, key: string, value: string): void {
  db.raw
    .query(
      "INSERT INTO config (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function all(db: Db): Record<string, string> {
  const rows = db.raw.query("SELECT key, value FROM config").all() as {
    key: string;
    value: string;
  }[];
  const out: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function defaultDuration(db: Db): number {
  return parseInt(get(db, "default_duration") ?? "1500", 10);
}

export * as Config from "./config";

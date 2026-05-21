// src/core/db/db.ts
import { Database } from "bun:sqlite";
import { MIGRATIONS } from "@/core/db/migrations";

export interface Db {
  raw: Database;
  close(): void;
}

/** Open a SQLite database at `path` (":memory:" for tests), apply pending
 *  migrations, and enable foreign-key enforcement. */
export function open(path: string): Db {
  const raw = new Database(path, { create: true });
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA foreign_keys = ON");
  migrate(raw);
  return { raw, close: () => raw.close() };
}

function migrate(raw: Database): void {
  const current = (raw.query("PRAGMA user_version").get() as any)
    .user_version as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    const apply = raw.transaction(() => {
      raw.exec(MIGRATIONS[i]!);
      raw.exec(`PRAGMA user_version = ${i + 1}`);
    });
    apply();
  }
}

export * as Db from "./db";

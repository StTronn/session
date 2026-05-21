// src/core/category/category.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";

export interface Category {
  id: number;
  name: string;
  color: string | null;
  archived: boolean;
  created_at: number;
}

function rowToCategory(r: any): Category {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    archived: !!r.archived,
    created_at: r.created_at,
  };
}

export function create(
  db: Db,
  clock: Clock,
  name: string,
  color?: string,
): Category {
  const info = db.raw
    .query(
      "INSERT INTO category (name, color, created_at) VALUES (?, ?, ?)",
    )
    .run(name, color ?? null, clock.now());
  return get(db, Number(info.lastInsertRowid))!;
}

export function get(db: Db, id: number): Category | null {
  const r = db.raw.query("SELECT * FROM category WHERE id = ?").get(id);
  return r ? rowToCategory(r) : null;
}

export function getByName(db: Db, name: string): Category | null {
  const r = db.raw.query("SELECT * FROM category WHERE name = ?").get(name);
  return r ? rowToCategory(r) : null;
}

export function list(
  db: Db,
  opts: { includeArchived?: boolean } = {},
): Category[] {
  const sql = opts.includeArchived
    ? "SELECT * FROM category ORDER BY name"
    : "SELECT * FROM category WHERE archived = 0 ORDER BY name";
  return (db.raw.query(sql).all() as any[]).map(rowToCategory);
}

export function rename(db: Db, id: number, name: string): void {
  db.raw.query("UPDATE category SET name = ? WHERE id = ?").run(name, id);
}

export function archive(db: Db, id: number): void {
  db.raw.query("UPDATE category SET archived = 1 WHERE id = ?").run(id);
}

/** Resolve an existing category by name, or create it if missing. */
export function ensure(db: Db, clock: Clock, name: string): Category {
  return getByName(db, name) ?? create(db, clock, name);
}

export * as Category from "./category";

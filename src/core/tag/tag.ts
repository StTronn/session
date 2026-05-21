// src/core/tag/tag.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";

export interface Tag {
  id: number;
  category_id: number;
  name: string;
  archived: boolean;
  created_at: number;
}

function rowToTag(r: any): Tag {
  return {
    id: r.id,
    category_id: r.category_id,
    name: r.name,
    archived: !!r.archived,
    created_at: r.created_at,
  };
}

export function create(
  db: Db,
  clock: Clock,
  categoryId: number,
  name: string,
): Tag {
  const info = db.raw
    .query(
      "INSERT INTO tag (category_id, name, created_at) VALUES (?, ?, ?)",
    )
    .run(categoryId, name, clock.now());
  return get(db, Number(info.lastInsertRowid))!;
}

export function get(db: Db, id: number): Tag | null {
  const r = db.raw.query("SELECT * FROM tag WHERE id = ?").get(id);
  return r ? rowToTag(r) : null;
}

export function getByName(
  db: Db,
  categoryId: number,
  name: string,
): Tag | null {
  const r = db.raw
    .query("SELECT * FROM tag WHERE category_id = ? AND name = ?")
    .get(categoryId, name);
  return r ? rowToTag(r) : null;
}

export function list(
  db: Db,
  categoryId: number,
  opts: { includeArchived?: boolean } = {},
): Tag[] {
  const sql = opts.includeArchived
    ? "SELECT * FROM tag WHERE category_id = ? ORDER BY name"
    : "SELECT * FROM tag WHERE category_id = ? AND archived = 0 ORDER BY name";
  return (db.raw.query(sql).all(categoryId) as any[]).map(rowToTag);
}

export function rename(db: Db, id: number, name: string): void {
  db.raw.query("UPDATE tag SET name = ? WHERE id = ?").run(name, id);
}

export function archive(db: Db, id: number): void {
  db.raw.query("UPDATE tag SET archived = 1 WHERE id = ?").run(id);
}

/** Resolve an existing tag by name within a category, or create it. */
export function ensure(
  db: Db,
  clock: Clock,
  categoryId: number,
  name: string,
): Tag {
  return getByName(db, categoryId, name) ?? create(db, clock, categoryId, name);
}

export * as Tag from "./tag";

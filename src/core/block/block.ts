// src/core/block/block.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";

export type BlockStatus = "planned" | "active" | "done" | "skipped";

export interface Block {
  id: number;
  category_id: number;
  tag_id: number | null;
  title: string | null;
  scheduled_start: number;
  scheduled_end: number;
  note_path: string | null;
  status: BlockStatus;
  created_at: number;
}

export interface CreateOptions {
  category_id: number;
  tag_id?: number | null;
  title?: string | null;
  scheduled_start: number;
  scheduled_end: number;
  note_path?: string | null;
}

function rowToBlock(r: any): Block {
  return r as Block;
}

export function create(db: Db, clock: Clock, opts: CreateOptions): Block {
  if (opts.scheduled_end <= opts.scheduled_start) {
    throw new Error("block end must be after its start");
  }
  const info = db.raw
    .query(
      `INSERT INTO block
         (category_id, tag_id, title, scheduled_start, scheduled_end,
          note_path, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`,
    )
    .run(
      opts.category_id,
      opts.tag_id ?? null,
      opts.title ?? null,
      opts.scheduled_start,
      opts.scheduled_end,
      opts.note_path ?? null,
      clock.now(),
    );
  return get(db, Number(info.lastInsertRowid))!;
}

export function get(db: Db, id: number): Block | null {
  const r = db.raw.query("SELECT * FROM block WHERE id = ?").get(id);
  return r ? rowToBlock(r) : null;
}

export function move(db: Db, id: number, start: number, end: number): Block {
  if (end <= start) throw new Error("block end must be after its start");
  if (!get(db, id)) throw new Error(`block ${id} not found`);
  db.raw
    .query(
      "UPDATE block SET scheduled_start = ?, scheduled_end = ? WHERE id = ?",
    )
    .run(start, end, id);
  return get(db, id)!;
}

export function setNote(db: Db, id: number, notePath: string): Block {
  if (!get(db, id)) throw new Error(`block ${id} not found`);
  db.raw.query("UPDATE block SET note_path = ? WHERE id = ?").run(notePath, id);
  return get(db, id)!;
}

function setStatus(db: Db, id: number, status: BlockStatus): void {
  if (!get(db, id)) throw new Error(`block ${id} not found`);
  db.raw.query("UPDATE block SET status = ? WHERE id = ?").run(status, id);
}

export function markDone(db: Db, id: number): void {
  setStatus(db, id, "done");
}
export function markSkipped(db: Db, id: number): void {
  setStatus(db, id, "skipped");
}

export function remove(db: Db, id: number): void {
  db.raw.query("DELETE FROM block WHERE id = ?").run(id);
}

export * as Block from "./block";

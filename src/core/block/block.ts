// src/core/block/block.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { Session } from "@/core/session/session";

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

/** Start and end of the local calendar day containing `unixSeconds`. */
function dayBounds(unixSeconds: number): { start: number; end: number } {
  const d = new Date(unixSeconds * 1000);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

/** Blocks that start within the clock's current local day, ordered by start. */
export function today(db: Db, clock: Clock): Block[] {
  const { start, end } = dayBounds(clock.now());
  return (
    db.raw
      .query(
        "SELECT * FROM block WHERE scheduled_start >= ? AND scheduled_start < ? " +
          "ORDER BY scheduled_start",
      )
      .all(start, end) as any[]
  ).map(rowToBlock);
}

/** Future blocks (start strictly after now), ordered by start. */
export function upcoming(db: Db, clock: Clock): Block[] {
  return (
    db.raw
      .query(
        "SELECT * FROM block WHERE scheduled_start > ? ORDER BY scheduled_start",
      )
      .all(clock.now()) as any[]
  ).map(rowToBlock);
}

/** The block currently in progress (status 'active'), if any. */
export function activeBlock(db: Db): Block | null {
  const r = db.raw
    .query("SELECT * FROM block WHERE status = 'active' LIMIT 1")
    .get();
  return r ? rowToBlock(r) : null;
}

/** Start a focus session from a block. The session inherits the block's
 *  category and tag; the block is set to 'active' by Session.start. */
export function startFromBlock(
  db: Db,
  clock: Clock,
  blockId: number,
  plannedSeconds: number,
): Session.Session {
  const b = get(db, blockId);
  if (!b) throw new Error(`block ${blockId} not found`);
  return Session.start(db, clock, {
    category_id: b.category_id,
    tag_id: b.tag_id,
    block_id: b.id,
    planned_seconds: plannedSeconds,
    note_path: b.note_path,
  });
}

export * as Block from "./block";

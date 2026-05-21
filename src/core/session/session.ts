// src/core/session/session.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";

export type SessionStatus = "active" | "paused" | "completed" | "abandoned";

export interface Session {
  id: number;
  category_id: number;
  tag_id: number | null;
  block_id: number | null;
  intent: string | null;
  planned_seconds: number;
  started_at: number;
  ended_at: number | null;
  status: SessionStatus;
  note_path: string | null;
  reflection: string | null;
  created_at: number;
}

export interface StartOptions {
  category_id: number;
  tag_id?: number | null;
  block_id?: number | null;
  intent?: string | null;
  planned_seconds: number;
  note_path?: string | null;
}

function rowToSession(r: any): Session {
  return r as Session;
}

export function get(db: Db, id: number): Session | null {
  const r = db.raw.query("SELECT * FROM session WHERE id = ?").get(id);
  return r ? rowToSession(r) : null;
}

/** The currently running (active or paused) session, if any. */
export function active(db: Db): Session | null {
  const r = db.raw
    .query(
      "SELECT * FROM session WHERE status IN ('active','paused') " +
        "ORDER BY id DESC LIMIT 1",
    )
    .get();
  return r ? rowToSession(r) : null;
}

export function start(db: Db, clock: Clock, opts: StartOptions): Session {
  if (active(db)) throw new Error("a session is already running");
  const now = clock.now();
  const info = db.raw
    .query(
      `INSERT INTO session
         (category_id, tag_id, block_id, intent, planned_seconds,
          started_at, status, note_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      opts.category_id,
      opts.tag_id ?? null,
      opts.block_id ?? null,
      opts.intent ?? null,
      opts.planned_seconds,
      now,
      opts.note_path ?? null,
      now,
    );
  if (opts.block_id != null) {
    db.raw
      .query("UPDATE block SET status = 'active' WHERE id = ?")
      .run(opts.block_id);
  }
  return get(db, Number(info.lastInsertRowid))!;
}

/** Total paused seconds for a session, counting an open pause up to `now`. */
function pausedSeconds(db: Db, clock: Clock, s: Session): number {
  const rows = db.raw
    .query(
      "SELECT paused_at, resumed_at FROM session_pause WHERE session_id = ?",
    )
    .all(s.id) as { paused_at: number; resumed_at: number | null }[];
  const cap = s.ended_at ?? clock.now();
  let total = 0;
  for (const p of rows) total += (p.resumed_at ?? cap) - p.paused_at;
  return total;
}

/** Seconds of actual focus: wall time since start minus paused time. */
export function elapsed(db: Db, clock: Clock, s: Session): number {
  const end = s.ended_at ?? clock.now();
  return end - s.started_at - pausedSeconds(db, clock, s);
}

export function remaining(db: Db, clock: Clock, s: Session): number {
  return s.planned_seconds - elapsed(db, clock, s);
}

export * as Session from "./session";

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

/** Total paused seconds for a session, counting an open pause up to `cap`.
 *  `cap` must be the same end anchor the caller uses, so the open-pause cap
 *  and the elapsed end anchor never drift apart. */
function pausedSeconds(db: Db, cap: number, s: Session): number {
  const rows = db.raw
    .query(
      "SELECT paused_at, resumed_at FROM session_pause WHERE session_id = ?",
    )
    .all(s.id) as { paused_at: number; resumed_at: number | null }[];
  let total = 0;
  for (const p of rows) total += (p.resumed_at ?? cap) - p.paused_at;
  return total;
}

/** Seconds of actual focus: wall time since start minus paused time. */
export function elapsed(db: Db, clock: Clock, s: Session): number {
  const end = s.ended_at ?? clock.now();
  return end - s.started_at - pausedSeconds(db, end, s);
}

export function remaining(db: Db, clock: Clock, s: Session): number {
  return s.planned_seconds - elapsed(db, clock, s);
}

export function pause(db: Db, clock: Clock): Session {
  const s = active(db);
  if (!s) throw new Error("no running session");
  if (s.status === "paused") throw new Error("session is already paused");
  const now = clock.now();
  db.raw
    .query("INSERT INTO session_pause (session_id, paused_at) VALUES (?, ?)")
    .run(s.id, now);
  db.raw.query("UPDATE session SET status = 'paused' WHERE id = ?").run(s.id);
  return get(db, s.id)!;
}

export function resume(db: Db, clock: Clock): Session {
  const s = active(db);
  if (!s) throw new Error("no running session");
  if (s.status !== "paused") throw new Error("session is not paused");
  const now = clock.now();
  db.raw
    .query(
      "UPDATE session_pause SET resumed_at = ? " +
        "WHERE session_id = ? AND resumed_at IS NULL",
    )
    .run(now, s.id);
  db.raw.query("UPDATE session SET status = 'active' WHERE id = ?").run(s.id);
  return get(db, s.id)!;
}

export function addTime(db: Db, seconds: number): Session {
  const s = active(db);
  if (!s) throw new Error("no running session");
  db.raw
    .query("UPDATE session SET planned_seconds = planned_seconds + ? WHERE id = ?")
    .run(seconds, s.id);
  return get(db, s.id)!;
}

/** Close any open pause row for a session at time `now`. */
function closeOpenPause(db: Db, sessionId: number, now: number): void {
  db.raw
    .query(
      "UPDATE session_pause SET resumed_at = ? " +
        "WHERE session_id = ? AND resumed_at IS NULL",
    )
    .run(now, sessionId);
}

export function complete(
  db: Db,
  clock: Clock,
  reflection?: string | null,
): Session {
  const s = active(db);
  if (!s) throw new Error("no running session");
  const now = clock.now();
  if (s.status === "paused") closeOpenPause(db, s.id, now);
  db.raw
    .query(
      "UPDATE session SET status = 'completed', ended_at = ?, " +
        "reflection = ? WHERE id = ?",
    )
    .run(now, reflection ?? null, s.id);
  if (s.block_id != null) {
    db.raw
      .query("UPDATE block SET status = 'done' WHERE id = ?")
      .run(s.block_id);
  }
  return get(db, s.id)!;
}

export function abandon(db: Db, clock: Clock): Session {
  const s = active(db);
  if (!s) throw new Error("no running session");
  const now = clock.now();
  if (s.status === "paused") closeOpenPause(db, s.id, now);
  db.raw
    .query("UPDATE session SET status = 'abandoned', ended_at = ? WHERE id = ?")
    .run(now, s.id);
  if (s.block_id != null) {
    db.raw
      .query("UPDATE block SET status = 'planned' WHERE id = ?")
      .run(s.block_id);
  }
  return get(db, s.id)!;
}

export function reflect(db: Db, id: number, text: string): Session {
  const s = get(db, id);
  if (!s) throw new Error(`session ${id} not found`);
  db.raw.query("UPDATE session SET reflection = ? WHERE id = ?").run(text, id);
  return get(db, id)!;
}

export interface ListOptions {
  since?: number;
  category_id?: number;
  tag_id?: number;
  limit?: number;
}

/** Past sessions (completed or abandoned), newest first. */
export function list(db: Db, opts: ListOptions = {}): Session[] {
  const where: string[] = ["status IN ('completed','abandoned')"];
  const params: unknown[] = [];
  if (opts.since != null) {
    where.push("started_at >= ?");
    params.push(opts.since);
  }
  if (opts.category_id != null) {
    where.push("category_id = ?");
    params.push(opts.category_id);
  }
  if (opts.tag_id != null) {
    where.push("tag_id = ?");
    params.push(opts.tag_id);
  }
  let sql =
    "SELECT * FROM session WHERE " +
    where.join(" AND ") +
    " ORDER BY started_at DESC, id DESC";
  if (opts.limit != null) {
    sql += " LIMIT ?";
    params.push(opts.limit);
  }
  return (db.raw.query(sql).all(...params) as any[]).map(rowToSession);
}

export * as Session from "./session";

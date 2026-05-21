// src/core/daemon/detect.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { Session } from "@/core/session/session";
import { Config } from "@/core/config/config";
import { Event, type EventPayload } from "@/core/event/event";

/** A time-based event plus the keys used to dedup it in `fired_event`. */
export interface DetectedEvent {
  payload: EventPayload;
  ref_id: number;
  dedup_key: string;
}

/** Time-based events that are currently true. Pure: reads state only, never
 *  writes, so it is exhaustively testable with a fixed clock. */
export function detectEvents(db: Db, clock: Clock): DetectedEvent[] {
  const out: DetectedEvent[] = [];
  const s = Session.active(db);
  if (!s) return out;
  const now = clock.now();

  if (s.status === "active") {
    const elapsed = Session.elapsed(db, clock, s);
    if (elapsed >= s.planned_seconds) {
      out.push({
        payload: Event.fromSession(db, "session.timesup", now, s, {
          elapsed_seconds: elapsed,
        }),
        ref_id: s.id,
        dedup_key: `planned_seconds:${s.planned_seconds}`,
      });
    }
  }

  if (s.status === "paused") {
    const pause = db.raw
      .query(
        "SELECT id, paused_at FROM session_pause " +
          "WHERE session_id = ? AND resumed_at IS NULL " +
          "ORDER BY id DESC LIMIT 1",
      )
      .get(s.id) as { id: number; paused_at: number } | null;
    if (pause) {
      const pausedSeconds = now - pause.paused_at;
      if (pausedSeconds >= Config.longPauseSeconds(db)) {
        out.push({
          payload: Event.fromSession(db, "session.long-pause", now, s, {
            paused_seconds: pausedSeconds,
          }),
          ref_id: pause.id,
          dedup_key: "",
        });
      }
    }
  }

  return out;
}

export * as Detect from "./detect";

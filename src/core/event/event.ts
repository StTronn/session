// src/core/event/event.ts
import type { Db } from "@/core/db/db";
import type { Session } from "@/core/session/session";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";

export type EventName =
  | "session.started"
  | "session.completed"
  | "session.abandoned"
  | "session.timesup"
  | "session.long-pause";

/** The JSON payload delivered to a hook script on stdin. */
export interface EventPayload {
  event: EventName;
  at: number; // unix seconds
  session_id: number;
  category: string;
  tag: string | null;
  intent: string | null;
  planned_seconds: number;
  reflection?: string | null; // session.completed
  elapsed_seconds?: number; // session.timesup
  paused_seconds?: number; // session.long-pause
}

/** Build an event payload from a session row, resolving category/tag names. */
export function fromSession(
  db: Db,
  name: EventName,
  at: number,
  session: Session,
  extra: Partial<EventPayload> = {},
): EventPayload {
  const category = Category.get(db, session.category_id)?.name ?? "(unknown)";
  const tag =
    session.tag_id != null ? (Tag.get(db, session.tag_id)?.name ?? null) : null;
  return {
    event: name,
    at,
    session_id: session.id,
    category,
    tag,
    intent: session.intent,
    planned_seconds: session.planned_seconds,
    ...extra,
  };
}

export * as Event from "./event";

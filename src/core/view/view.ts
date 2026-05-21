// src/core/view/view.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Block } from "@/core/block/block";
import { Note } from "@/core/note/note";

export interface SessionStatusView {
  id: number;
  category: string;
  tag: string | null;
  intent: string | null;
  status: "active" | "paused";
  started_at: number;
  planned_seconds: number;
  elapsed_seconds: number;
  remaining_seconds: number;
}

export interface BlockView {
  id: number;
  category: string;
  tag: string | null;
  title: string | null;
  scheduled_start: number;
  scheduled_end: number;
  status: string;
  note_path: string | null;
}

export interface AgendaView {
  now: number;
  ongoing: SessionStatusView | null;
  past: BlockView[];
  current: BlockView[];
  upcoming: BlockView[];
}

export interface SummaryView {
  range: "today" | "week";
  total_seconds: number;
  session_count: number;
  by_category: { category: string; seconds: number }[];
  by_tag: { category: string; tag: string; seconds: number }[];
}

export interface ContextView {
  now: number;
  ongoing: SessionStatusView | null;
  categories: { id: number; name: string }[];
  blocks: (BlockView & { note: string | null })[];
  summary: SummaryView;
}

function catName(db: Db, id: number): string {
  return Category.get(db, id)?.name ?? "(unknown)";
}

function tagName(db: Db, id: number | null): string | null {
  return id == null ? null : (Tag.get(db, id)?.name ?? null);
}

function toBlockView(db: Db, b: Block.Block): BlockView {
  return {
    id: b.id,
    category: catName(db, b.category_id),
    tag: tagName(db, b.tag_id),
    title: b.title,
    scheduled_start: b.scheduled_start,
    scheduled_end: b.scheduled_end,
    status: b.status,
    note_path: b.note_path,
  };
}

export function status(db: Db, clock: Clock): SessionStatusView | null {
  const s = Session.active(db);
  if (!s) return null;
  return {
    id: s.id,
    category: catName(db, s.category_id),
    tag: tagName(db, s.tag_id),
    intent: s.intent,
    status: s.status as "active" | "paused",
    started_at: s.started_at,
    planned_seconds: s.planned_seconds,
    elapsed_seconds: Session.elapsed(db, clock, s),
    remaining_seconds: Session.remaining(db, clock, s),
  };
}

export function agenda(db: Db, clock: Clock): AgendaView {
  const now = clock.now();
  const blocks = Block.today(db, clock).map((b) => toBlockView(db, b));
  return {
    now,
    ongoing: status(db, clock),
    past: blocks.filter((b) => b.scheduled_end <= now),
    current: blocks.filter(
      (b) => b.scheduled_start <= now && b.scheduled_end > now,
    ),
    upcoming: blocks.filter((b) => b.scheduled_start > now),
  };
}

/** Start of the local day, or start of the 7-day window ending today. */
function rangeStart(now: number, range: "today" | "week"): number {
  const d = new Date(now * 1000);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startMs =
    range === "today"
      ? midnight.getTime()
      : midnight.getTime() - 6 * 86400 * 1000;
  return Math.floor(startMs / 1000);
}

export function summary(
  db: Db,
  clock: Clock,
  range: "today" | "week",
): SummaryView {
  const since = rangeStart(clock.now(), range);
  const sessions = Session.list(db, { since }).filter(
    (s) => s.status === "completed",
  );
  const byCat = new Map<string, number>();
  const byTag = new Map<string, { category: string; tag: string; seconds: number }>();
  let total = 0;
  for (const s of sessions) {
    const secs = Session.elapsed(db, clock, s);
    total += secs;
    const cat = catName(db, s.category_id);
    byCat.set(cat, (byCat.get(cat) ?? 0) + secs);
    const tag = tagName(db, s.tag_id);
    if (tag) {
      const key = `${cat}/${tag}`;
      const cur = byTag.get(key) ?? { category: cat, tag, seconds: 0 };
      cur.seconds += secs;
      byTag.set(key, cur);
    }
  }
  return {
    range,
    total_seconds: total,
    session_count: sessions.length,
    by_category: [...byCat.entries()]
      .map(([category, seconds]) => ({ category, seconds }))
      .sort((a, b) => b.seconds - a.seconds),
    by_tag: [...byTag.values()].sort((a, b) => b.seconds - a.seconds),
  };
}

/** The full agent-facing aggregate. Inlines todo note contents. */
export function context(db: Db, clock: Clock, notesDir: string): ContextView {
  const blocks = Block.today(db, clock).map((b) => {
    const view = toBlockView(db, b);
    return {
      ...view,
      note: b.note_path ? Note.read(notesDir, b.note_path) : null,
    };
  });
  return {
    now: clock.now(),
    ongoing: status(db, clock),
    categories: Category.list(db).map((c) => ({ id: c.id, name: c.name })),
    blocks,
    summary: summary(db, clock, "today"),
  };
}

export * as View from "./view";

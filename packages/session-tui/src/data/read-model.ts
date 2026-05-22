import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { View } from "@/core/view/view";
import { Block } from "@/core/block/block";
import { Session } from "@/core/session/session";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { categoryColors } from "../theme/theme";

export type PeriodMode = "day" | "week" | "month";

export interface DayBucket {
  date: number;
  label: string;
  shortLabel: string;
  focusSeconds: number;
  blocks: CalendarBlock[];
}

export interface CalendarBlock {
  id: number;
  title: string;
  category: string;
  tag: string | null;
  start: number;
  end: number;
  status: string;
  color: string;
  notePath: string | null;
}

export interface CategoryTotal {
  category: string;
  seconds: number;
  color: string;
}

export interface TuiReadModel {
  now: number;
  mode: PeriodMode;
  periodStart: number;
  periodEnd: number;
  title: string;
  days: DayBucket[];
  categories: CategoryTotal[];
  totalFocusSeconds: number;
  averageFocusSeconds: number;
  active: ReturnType<typeof View.status>;
}

const dayMs = 86400 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
}

function addDays(ts: number, days: number): number {
  return Math.floor((ts * 1000 + days * dayMs) / 1000);
}

function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts) * 1000);
  const mondayOffset = (d.getDay() + 6) % 7;
  return addDays(Math.floor(d.getTime() / 1000), -mondayOffset);
}

function startOfMonth(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
}

function endOfMonth(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000);
}

function periodBounds(now: number, mode: PeriodMode, offset: number): { start: number; end: number } {
  if (mode === "day") {
    const start = addDays(startOfDay(now), offset);
    return { start, end: addDays(start, 1) };
  }
  if (mode === "week") {
    const start = addDays(startOfWeek(now), offset * 7);
    return { start, end: addDays(start, 7) };
  }
  const base = new Date(startOfMonth(now) * 1000);
  const start = Math.floor(new Date(base.getFullYear(), base.getMonth() + offset, 1).getTime() / 1000);
  return { start, end: endOfMonth(start) };
}

function labelForDay(ts: number): { label: string; shortLabel: string } {
  const d = new Date(ts * 1000);
  const day = d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  return {
    label: `${day} ${d.getDate()}`,
    shortLabel: `${d.getDate()}\n${day}`,
  };
}

function titleFor(mode: PeriodMode, start: number, end: number): string {
  if (mode === "day") {
    return new Date(start * 1000).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }
  if (mode === "week") {
    const a = new Date(start * 1000);
    const b = new Date(addDays(end, -1) * 1000);
    return `${a.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} - ${b.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}`;
  }
  return new Date(start * 1000).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function categoryName(db: Db, id: number): string {
  return Category.get(db, id)?.name ?? "(unknown)";
}

function tagName(db: Db, id: number | null): string | null {
  return id == null ? null : (Tag.get(db, id)?.name ?? null);
}

function colorFor(category: string): string {
  let hash = 0;
  for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return categoryColors[hash % categoryColors.length] ?? categoryColors[0]!;
}

export function readTuiModel(
  db: Db,
  clock: Clock,
  mode: PeriodMode,
  offset = 0,
): TuiReadModel {
  const now = clock.now();
  const { start, end } = periodBounds(now, mode, offset);
  const dayCount = Math.max(1, Math.ceil((end - start) / 86400));
  const buckets = new Map<number, DayBucket>();
  for (let i = 0; i < dayCount; i++) {
    const date = addDays(start, i);
    buckets.set(date, {
      date,
      ...labelForDay(date),
      focusSeconds: 0,
      blocks: [],
    });
  }

  const blocks = (
    db.raw
      .query(
        "SELECT * FROM block WHERE scheduled_start < ? AND scheduled_end > ? ORDER BY scheduled_start",
      )
      .all(end, start) as Block.Block[]
  );
  for (const b of blocks) {
    const day = buckets.get(startOfDay(b.scheduled_start));
    if (!day) continue;
    const category = categoryName(db, b.category_id);
    day.blocks.push({
      id: b.id,
      title: b.title ?? category,
      category,
      tag: tagName(db, b.tag_id),
      start: b.scheduled_start,
      end: b.scheduled_end,
      status: b.status,
      color: colorFor(category),
      notePath: b.note_path,
    });
  }

  const sessions = Session.list(db, { since: start }).filter(
    (s) => s.status === "completed" && (s.ended_at ?? s.started_at) < end,
  );
  const categoryTotals = new Map<string, number>();
  let totalFocusSeconds = 0;
  for (const s of sessions) {
    const seconds = Session.elapsed(db, clock, s);
    const day = buckets.get(startOfDay(s.started_at));
    if (day) day.focusSeconds += seconds;
    const category = categoryName(db, s.category_id);
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + seconds);
    totalFocusSeconds += seconds;
  }

  const categories = [...categoryTotals.entries()]
    .map(([category, seconds]) => ({
      category,
      seconds,
      color: colorFor(category),
    }))
    .sort((a, b) => b.seconds - a.seconds);

  return {
    now,
    mode,
    periodStart: start,
    periodEnd: end,
    title: titleFor(mode, start, end),
    days: [...buckets.values()],
    categories,
    totalFocusSeconds,
    averageFocusSeconds: Math.floor(totalFocusSeconds / dayCount),
    active: View.status(db, clock),
  };
}

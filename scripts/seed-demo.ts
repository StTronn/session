// scripts/seed-demo.ts — populate a demo data directory so the TUI has
// something to show. Wipes and recreates the target dir.
//
//   bun run scripts/seed-demo.ts                       # ~/.local/share/session-demo
//   SESSION_DATA_DIR=/tmp/foo bun run scripts/seed-demo.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { open } from "../src/core/db/db";

const dataDir =
  process.env.SESSION_DATA_DIR ?? join(homedir(), ".local/share/session-demo");

if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
mkdirSync(join(dataDir, "notes", "block"), { recursive: true });

const db = open(join(dataDir, "session.db"));
const now = Math.floor(Date.now() / 1000);
const d = new Date();
const today = Math.floor(
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000,
);
const hm = (h: number, m = 0) => today + h * 3600 + m * 60;

// --- categories ---
const catId: Record<string, number> = {};
for (const name of ["work", "deep", "learning", "admin"]) {
  const info = db.raw
    .query("INSERT INTO category (name, created_at) VALUES (?, ?)")
    .run(name, now);
  catId[name] = Number(info.lastInsertRowid);
}

// --- completed sessions across the last week ---
const sessions = [
  { day: -6, cat: "deep", hour: 10, mins: 90, intent: "auth refactor" },
  { day: -6, cat: "admin", hour: 15, mins: 25, intent: "inbox" },
  { day: -5, cat: "work", hour: 9, mins: 50, intent: "PR review" },
  { day: -5, cat: "learning", hour: 14, mins: 45, intent: "raft paper" },
  { day: -4, cat: "deep", hour: 11, mins: 75, intent: "query planner" },
  { day: -3, cat: "work", hour: 10, mins: 50, intent: "standup + tickets" },
  { day: -3, cat: "deep", hour: 13, mins: 90, intent: "TUI layout" },
  { day: -2, cat: "learning", hour: 16, mins: 60, intent: "opentui docs" },
  { day: -1, cat: "deep", hour: 9, mins: 110, intent: "note panel" },
  { day: -1, cat: "admin", hour: 17, mins: 20, intent: "expenses" },
  { day: 0, cat: "work", hour: 8, mins: 40, intent: "morning triage" },
  { day: 0, cat: "deep", hour: 11, mins: 65, intent: "seed script" },
];
for (const s of sessions) {
  const start = today + s.day * 86400 + s.hour * 3600;
  const dur = s.mins * 60;
  db.raw
    .query(
      `INSERT INTO session
         (category_id, planned_seconds, started_at, ended_at, status, intent, created_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
    )
    .run(catId[s.cat]!, dur, start, start + dur, s.intent, start);
}

// --- an active session, so "Current" is not empty ---
db.raw
  .query(
    `INSERT INTO session
       (category_id, planned_seconds, started_at, status, intent, created_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  )
  .run(catId.work!, 50 * 60, now - 22 * 60, "polishing the note panel", now - 22 * 60);

// --- time blocks today, some with todo notes ---
const blocks: {
  cat: string;
  from: [number, number];
  to: [number, number];
  title: string;
  note?: string;
}[] = [
  {
    cat: "work",
    from: [9, 0],
    to: [10, 30],
    title: "review",
    note: "# Todo\n\n- [x] read the rfc\n- [x] skim the diff\n- [ ] leave review comments\n- [ ] follow up on the migration question\n",
  },
  {
    cat: "deep",
    from: [11, 0],
    to: [12, 30],
    title: "note panel",
    note: "# Build the note panel\n\n- [x] parse markdown lines\n- [x] render in NotePanel\n- [ ] handle long notes\n\n## Notes\n\nkeep the panel height fixed at 10 rows\n",
  },
  { cat: "admin", from: [14, 0], to: [15, 0], title: "emails" },
  {
    cat: "learning",
    from: [16, 0],
    to: [17, 30],
    title: "read paper",
    note: "# Raft paper\n\n- [ ] section 5: leader election\n- [ ] section 6: membership changes\n\njot down questions for the reading group\n",
  },
];
for (const b of blocks) {
  const info = db.raw
    .query(
      `INSERT INTO block
         (category_id, title, scheduled_start, scheduled_end, status, created_at)
       VALUES (?, ?, ?, ?, 'planned', ?)`,
    )
    .run(catId[b.cat]!, b.title, hm(...b.from), hm(...b.to), now);
  if (b.note) {
    const rel = `block/${Number(info.lastInsertRowid)}.md`;
    writeFileSync(join(dataDir, "notes", rel), b.note, "utf8");
    db.raw
      .query("UPDATE block SET note_path = ? WHERE id = ?")
      .run(rel, Number(info.lastInsertRowid));
  }
}

db.close();
console.log(`Seeded demo data -> ${dataDir}`);
console.log(`Launch:  SESSION_DATA_DIR=${dataDir} bun run tui`);

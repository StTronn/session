# Session CLI Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core engine and CLI for a tmux-integratable focus-session tracker with day-level time blocking, plus a JSON/TOON read surface for AI agents.

**Architecture:** A pure `core/` library of flat namespace-projection modules (opencode-style: `export * as Foo from "./foo"`, no barrel files) over a local SQLite DB, with a thin `cli/` command layer on top. `Db` and `Clock` are injected into core functions so everything is deterministic and unit-testable. A single `View` read-model feeds both the CLI's text output and the agent JSON/TOON serializers.

**Tech Stack:** TypeScript on Bun, `bun:sqlite` for storage, `bun:test` for tests, `util.parseArgs` for CLI parsing, `@toon-format/toon` for TOON output.

**Reference spec:** `docs/superpowers/specs/2026-05-21-session-cli-core-design.md`

---

## File Structure

```
package.json                       project manifest, `session` bin entry
tsconfig.json                      TS config with @/* path alias to src/
bin/session.ts                     #!/usr/bin/env bun entry point
src/
  core/
    time/duration.ts               parseDuration: "25m"/"1h30m"/"90" -> seconds
    time/datetime.ts               parseTime: "14:00"/"2pm"/"+30m" -> unix seconds
    clock/clock.ts                 Clock interface; systemClock, fixedClock
    db/db.ts                       Db: open SQLite, run migrations, close
    db/migrations.ts               ordered list of migration SQL strings
    config/config.ts               Config: key/value store with defaults
    category/category.ts           Category: create/list/get/rename/archive
    tag/tag.ts                     Tag: create/list/get/rename/archive (per category)
    note/note.ts                   Note: create/read/path for todo .md files
    session/session.ts             Session: start/pause/resume/addTime/complete/
                                   abandon/reflect/list; elapsed/remaining
    block/block.ts                 Block: create/move/setNote/status/queries/
                                   startFromBlock
    view/view.ts                   View: status/agenda/summary/context read-model
  cli/
    format/format.ts               render(value, format): text|json|toon
    args.ts                        arg-parsing helpers over util.parseArgs
    registry.ts                    Command type + command table + dispatch
    paths.ts                       resolve data dir / db path / notes dir from env
    commands/session.ts            start/status/pause/resume/add/done/cancel/
                                   reflect/note/list
    commands/block.ts              block add/move/start/done/skip/rm/note
    commands/views.ts              agenda/summary/context
    commands/setup.ts              category/tag/config subcommands
test/
  core/...                         mirrors src/core layout
  cli/...                          CLI integration tests
```

**Dependency direction (no cycles):** `cli/` imports `core/`. Within core, `block` imports `session` (for `startFromBlock`); `session` never imports `block` — it flips block status with direct SQL. `view` imports the domain modules. Everything imports `db`/`clock`/`time` leaf modules.

---

## Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `bin/session.ts`, `test/smoke.test.ts`

- [ ] **Step 1: Initialise the repo and Bun project**

Run:
```bash
cd /Users/rishav/projects/session
git init
git checkout -b feat/session-cli-core
bun init -y
bun add @toon-format/toon
```

- [ ] **Step 2: Write `package.json`**

Replace the generated `package.json` with:
```json
{
  "name": "session-cli",
  "version": "0.1.0",
  "module": "bin/session.ts",
  "type": "module",
  "bin": { "session": "./bin/session.ts" },
  "scripts": {
    "test": "bun test",
    "start": "bun run bin/session.ts"
  },
  "dependencies": {
    "@toon-format/toon": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
*.db
*.db-*
dist/
```

- [ ] **Step 5: Write `bin/session.ts` placeholder**

```ts
#!/usr/bin/env bun
console.log("session cli");
```

- [ ] **Step 6: Write `test/smoke.test.ts`**

```ts
import { test, expect } from "bun:test";

test("test runner works", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run the test suite**

Run: `bun test`
Expected: PASS — 1 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold Bun + TypeScript project

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Duration parser

**Files:**
- Create: `src/core/time/duration.ts`
- Test: `test/core/time/duration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { parseDuration } from "@/core/time/duration";

describe("parseDuration", () => {
  test("bare number is minutes", () => {
    expect(parseDuration("90")).toBe(5400);
  });
  test("minutes suffix", () => {
    expect(parseDuration("25m")).toBe(1500);
  });
  test("hours suffix", () => {
    expect(parseDuration("2h")).toBe(7200);
  });
  test("combined units", () => {
    expect(parseDuration("1h30m")).toBe(5400);
  });
  test("seconds suffix", () => {
    expect(parseDuration("45s")).toBe(45);
  });
  test("rejects empty input", () => {
    expect(() => parseDuration("  ")).toThrow();
  });
  test("rejects garbage", () => {
    expect(() => parseDuration("abc")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/time/duration.test.ts`
Expected: FAIL — cannot resolve `@/core/time/duration`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/time/duration.ts

/** Parse a human duration ("25m", "1h30m", "45s", "90") into whole seconds.
 *  A bare number is interpreted as minutes. Throws on invalid input. */
export function parseDuration(input: string): number {
  const s = input.trim().toLowerCase();
  if (s === "") throw new Error("duration is empty");
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 60;

  const re = /(\d+)\s*(h|m|s)/g;
  let total = 0;
  let matched = false;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    consumed += m[0].length;
    const n = parseInt(m[1]!, 10);
    total += m[2] === "h" ? n * 3600 : m[2] === "m" ? n * 60 : n;
  }
  if (!matched || consumed !== s.replace(/\s/g, "").length) {
    throw new Error(`invalid duration: "${input}"`);
  }
  return total;
}

export * as Duration from "./duration";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/time/duration.test.ts`
Expected: PASS — 7 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add duration parser

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Block-time parser

**Files:**
- Create: `src/core/time/datetime.ts`
- Test: `test/core/time/datetime.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { parseTime } from "@/core/time/datetime";

// Reference "now": 2026-05-21 09:00 local time.
const now = Math.floor(new Date(2026, 4, 21, 9, 0, 0).getTime() / 1000);

function hourOf(unix: number): number {
  return new Date(unix * 1000).getHours();
}

describe("parseTime", () => {
  test("24-hour clock time", () => {
    expect(hourOf(parseTime("14:00", now))).toBe(14);
  });
  test("12-hour pm", () => {
    expect(hourOf(parseTime("2pm", now))).toBe(14);
  });
  test("12-hour am with minutes", () => {
    const t = parseTime("9:30am", now);
    const d = new Date(t * 1000);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });
  test("12am is midnight", () => {
    expect(hourOf(parseTime("12am", now))).toBe(0);
  });
  test("relative offset", () => {
    expect(parseTime("+30m", now)).toBe(now + 1800);
  });
  test("rejects invalid time", () => {
    expect(() => parseTime("25:00", now)).toThrow();
    expect(() => parseTime("nonsense", now)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/time/datetime.test.ts`
Expected: FAIL — cannot resolve `@/core/time/datetime`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/time/datetime.ts
import { parseDuration } from "@/core/time/duration";

/** Parse a block time into a unix-seconds timestamp, relative to `nowSec`.
 *  Supports "+<duration>" (relative), "HH:MM" (24h), and "H[:MM](am|pm)".
 *  Absolute times resolve against the local calendar date of `nowSec`. */
export function parseTime(input: string, nowSec: number): number {
  const s = input.trim().toLowerCase();
  if (s === "") throw new Error("time is empty");
  if (s.startsWith("+")) return nowSec + parseDuration(s.slice(1));

  let hh: number | null = null;
  let mm = 0;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) {
    hh = parseInt(m[1]!, 10);
    mm = parseInt(m[2]!, 10);
  } else if ((m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/))) {
    hh = parseInt(m[1]!, 10);
    mm = m[2] ? parseInt(m[2], 10) : 0;
    if (hh < 1 || hh > 12) throw new Error(`invalid time: "${input}"`);
    if (m[3] === "pm" && hh !== 12) hh += 12;
    if (m[3] === "am" && hh === 12) hh = 0;
  }
  if (hh === null || hh > 23 || mm > 59) {
    throw new Error(`invalid time: "${input}"`);
  }
  const d = new Date(nowSec * 1000);
  d.setHours(hh, mm, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export * as DateTime from "./datetime";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/time/datetime.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add block-time parser

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Clock module

**Files:**
- Create: `src/core/clock/clock.ts`
- Test: `test/core/clock/clock.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { systemClock, fixedClock } from "@/core/clock/clock";

describe("clock", () => {
  test("systemClock returns current unix seconds", () => {
    const t = systemClock().now();
    expect(Math.abs(t - Date.now() / 1000)).toBeLessThan(2);
  });
  test("fixedClock starts at the given time", () => {
    expect(fixedClock(1000).now()).toBe(1000);
  });
  test("fixedClock advances", () => {
    const c = fixedClock(1000);
    c.advance(60);
    expect(c.now()).toBe(1060);
  });
  test("fixedClock can be set", () => {
    const c = fixedClock(1000);
    c.set(5000);
    expect(c.now()).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/clock/clock.test.ts`
Expected: FAIL — cannot resolve `@/core/clock/clock`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/clock/clock.ts

/** A source of "now" in unix seconds. Injected so logic is deterministic. */
export interface Clock {
  now(): number;
}

export interface FixedClock extends Clock {
  set(unixSeconds: number): void;
  advance(seconds: number): void;
}

export function systemClock(): Clock {
  return { now: () => Math.floor(Date.now() / 1000) };
}

/** A controllable clock for tests. */
export function fixedClock(startUnixSeconds: number): FixedClock {
  let t = startUnixSeconds;
  return {
    now: () => t,
    set: (v) => { t = v; },
    advance: (s) => { t += s; },
  };
}

export * as Clock from "./clock";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/clock/clock.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add injectable clock

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Database & migrations

**Files:**
- Create: `src/core/db/migrations.ts`, `src/core/db/db.ts`
- Test: `test/core/db/db.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";

describe("db", () => {
  test("opens an in-memory database and applies the schema", () => {
    const db = open(":memory:");
    const tables = db.raw
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("category");
    expect(tables).toContain("tag");
    expect(tables).toContain("block");
    expect(tables).toContain("session");
    expect(tables).toContain("session_pause");
    expect(tables).toContain("config");
    db.close();
  });

  test("migrations are idempotent across re-opens", () => {
    const db1 = open(":memory:");
    const v1 = (db1.raw.query("PRAGMA user_version").get() as any).user_version;
    db1.close();
    const db2 = open(":memory:");
    const v2 = (db2.raw.query("PRAGMA user_version").get() as any).user_version;
    expect(v2).toBe(v1);
    expect(v2).toBeGreaterThan(0);
    db2.close();
  });

  test("foreign keys are enforced", () => {
    const db = open(":memory:");
    expect(() =>
      db.raw
        .query("INSERT INTO tag (category_id, name, created_at) VALUES (999, 'x', 0)")
        .run(),
    ).toThrow();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/db/db.test.ts`
Expected: FAIL — cannot resolve `@/core/db/db`.

- [ ] **Step 3: Write the migrations**

```ts
// src/core/db/migrations.ts

/** Ordered migration SQL. Index N is applied to move user_version N -> N+1.
 *  Never edit an existing entry once shipped — only append. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE category (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT,
    archived   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE tag (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES category(id),
    name        TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    UNIQUE (category_id, name)
  );

  CREATE TABLE block (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES category(id),
    tag_id          INTEGER REFERENCES tag(id),
    title           TEXT,
    scheduled_start INTEGER NOT NULL,
    scheduled_end   INTEGER NOT NULL,
    note_path       TEXT,
    status          TEXT NOT NULL DEFAULT 'planned',
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE session (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES category(id),
    tag_id          INTEGER REFERENCES tag(id),
    block_id        INTEGER REFERENCES block(id),
    intent          TEXT,
    planned_seconds INTEGER NOT NULL,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    status          TEXT NOT NULL,
    note_path       TEXT,
    reflection      TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE session_pause (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES session(id),
    paused_at  INTEGER NOT NULL,
    resumed_at INTEGER
  );

  CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX idx_session_status ON session(status);
  CREATE INDEX idx_block_start ON block(scheduled_start);
  CREATE INDEX idx_pause_session ON session_pause(session_id);
  `,
];
```

- [ ] **Step 4: Write the db module**

```ts
// src/core/db/db.ts
import { Database } from "bun:sqlite";
import { MIGRATIONS } from "@/core/db/migrations";

export interface Db {
  raw: Database;
  close(): void;
}

/** Open a SQLite database at `path` (":memory:" for tests), apply pending
 *  migrations, and enable foreign-key enforcement. */
export function open(path: string): Db {
  const raw = new Database(path, { create: true });
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA foreign_keys = ON");
  migrate(raw);
  return { raw, close: () => raw.close() };
}

function migrate(raw: Database): void {
  const current = (raw.query("PRAGMA user_version").get() as any)
    .user_version as number;
  for (let i = current; i < MIGRATIONS.length; i++) {
    const apply = raw.transaction(() => {
      raw.exec(MIGRATIONS[i]!);
      raw.exec(`PRAGMA user_version = ${i + 1}`);
    });
    apply();
  }
}

export * as Db from "./db";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test test/core/db/db.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add SQLite database with migrations

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Config module

**Files:**
- Create: `src/core/config/config.ts`
- Test: `test/core/config/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { Config } from "@/core/config/config";

describe("config", () => {
  test("returns built-in default when unset", () => {
    const db = open(":memory:");
    expect(Config.get(db, "default_duration")).toBe("1500");
    expect(Config.defaultDuration(db)).toBe(1500);
    db.close();
  });
  test("set overrides default", () => {
    const db = open(":memory:");
    Config.set(db, "default_duration", "3000");
    expect(Config.defaultDuration(db)).toBe(3000);
    db.close();
  });
  test("set is upsert", () => {
    const db = open(":memory:");
    Config.set(db, "k", "a");
    Config.set(db, "k", "b");
    expect(Config.get(db, "k")).toBe("b");
    db.close();
  });
  test("unknown key with no default is null", () => {
    const db = open(":memory:");
    expect(Config.get(db, "missing")).toBeNull();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/config/config.test.ts`
Expected: FAIL — cannot resolve `@/core/config/config`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/config/config.ts
import type { Db } from "@/core/db/db";

const DEFAULTS: Record<string, string> = {
  default_duration: "1500", // 25 minutes, in seconds
};

export function get(db: Db, key: string): string | null {
  const row = db.raw
    .query("SELECT value FROM config WHERE key = ?")
    .get(key) as { value: string } | null;
  if (row) return row.value;
  return DEFAULTS[key] ?? null;
}

export function set(db: Db, key: string, value: string): void {
  db.raw
    .query(
      "INSERT INTO config (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function all(db: Db): Record<string, string> {
  const rows = db.raw.query("SELECT key, value FROM config").all() as {
    key: string;
    value: string;
  }[];
  const out: Record<string, string> = { ...DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function defaultDuration(db: Db): number {
  return parseInt(get(db, "default_duration") ?? "1500", 10);
}

export * as Config from "./config";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/config/config.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add config key/value store

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Category module

**Files:**
- Create: `src/core/category/category.ts`
- Test: `test/core/category/category.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";

describe("category", () => {
  test("create returns a row with an id", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    expect(c.id).toBeGreaterThan(0);
    expect(c.name).toBe("work");
    expect(c.archived).toBe(false);
    expect(c.created_at).toBe(1000);
    db.close();
  });
  test("getByName finds a category", () => {
    const db = open(":memory:");
    Category.create(db, fixedClock(1000), "study");
    expect(Category.getByName(db, "study")?.name).toBe("study");
    expect(Category.getByName(db, "nope")).toBeNull();
    db.close();
  });
  test("duplicate name throws", () => {
    const db = open(":memory:");
    Category.create(db, fixedClock(1000), "work");
    expect(() => Category.create(db, fixedClock(1000), "work")).toThrow();
    db.close();
  });
  test("list excludes archived unless asked", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Category.create(db, fixedClock(1000), "study");
    Category.archive(db, c.id);
    expect(Category.list(db).map((x) => x.name)).toEqual(["study"]);
    expect(Category.list(db, { includeArchived: true }).length).toBe(2);
    db.close();
  });
  test("rename changes the name", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "wrk");
    Category.rename(db, c.id, "work");
    expect(Category.get(db, c.id)?.name).toBe("work");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/category/category.test.ts`
Expected: FAIL — cannot resolve `@/core/category/category`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/category/category.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";

export interface Category {
  id: number;
  name: string;
  color: string | null;
  archived: boolean;
  created_at: number;
}

function rowToCategory(r: any): Category {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    archived: !!r.archived,
    created_at: r.created_at,
  };
}

export function create(
  db: Db,
  clock: Clock,
  name: string,
  color?: string,
): Category {
  const info = db.raw
    .query(
      "INSERT INTO category (name, color, created_at) VALUES (?, ?, ?)",
    )
    .run(name, color ?? null, clock.now());
  return get(db, Number(info.lastInsertRowid))!;
}

export function get(db: Db, id: number): Category | null {
  const r = db.raw.query("SELECT * FROM category WHERE id = ?").get(id);
  return r ? rowToCategory(r) : null;
}

export function getByName(db: Db, name: string): Category | null {
  const r = db.raw.query("SELECT * FROM category WHERE name = ?").get(name);
  return r ? rowToCategory(r) : null;
}

export function list(
  db: Db,
  opts: { includeArchived?: boolean } = {},
): Category[] {
  const sql = opts.includeArchived
    ? "SELECT * FROM category ORDER BY name"
    : "SELECT * FROM category WHERE archived = 0 ORDER BY name";
  return (db.raw.query(sql).all() as any[]).map(rowToCategory);
}

export function rename(db: Db, id: number, name: string): void {
  db.raw.query("UPDATE category SET name = ? WHERE id = ?").run(name, id);
}

export function archive(db: Db, id: number): void {
  db.raw.query("UPDATE category SET archived = 1 WHERE id = ?").run(id);
}

/** Resolve an existing category by name, or create it if missing. */
export function ensure(db: Db, clock: Clock, name: string): Category {
  return getByName(db, name) ?? create(db, clock, name);
}

export * as Category from "./category";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/category/category.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add category module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Tag module

**Files:**
- Create: `src/core/tag/tag.ts`
- Test: `test/core/tag/tag.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";

describe("tag", () => {
  test("create attaches a tag to a category", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    const t = Tag.create(db, fixedClock(1000), c.id, "api");
    expect(t.id).toBeGreaterThan(0);
    expect(t.category_id).toBe(c.id);
    expect(t.name).toBe("api");
    db.close();
  });
  test("same tag name allowed in different categories", () => {
    const db = open(":memory:");
    const work = Category.create(db, fixedClock(1000), "work");
    const study = Category.create(db, fixedClock(1000), "study");
    Tag.create(db, fixedClock(1000), work.id, "reading");
    expect(() =>
      Tag.create(db, fixedClock(1000), study.id, "reading"),
    ).not.toThrow();
    db.close();
  });
  test("duplicate tag in same category throws", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Tag.create(db, fixedClock(1000), c.id, "api");
    expect(() => Tag.create(db, fixedClock(1000), c.id, "api")).toThrow();
    db.close();
  });
  test("getByName scopes to a category", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Tag.create(db, fixedClock(1000), c.id, "api");
    expect(Tag.getByName(db, c.id, "api")?.name).toBe("api");
    expect(Tag.getByName(db, c.id, "missing")).toBeNull();
    db.close();
  });
  test("list returns tags for a category", () => {
    const db = open(":memory:");
    const c = Category.create(db, fixedClock(1000), "work");
    Tag.create(db, fixedClock(1000), c.id, "api");
    Tag.create(db, fixedClock(1000), c.id, "docs");
    expect(Tag.list(db, c.id).map((t) => t.name)).toEqual(["api", "docs"]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/tag/tag.test.ts`
Expected: FAIL — cannot resolve `@/core/tag/tag`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/tag/tag.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add tag module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Note module

**Files:**
- Create: `src/core/note/note.ts`
- Test: `test/core/note/note.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Note } from "@/core/note/note";

const dir = join(tmpdir(), "session-note-test");
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("note", () => {
  test("create writes a markdown file and returns a relative path", () => {
    const rel = Note.create(dir, "session", 12, "# Todo\n- [ ] ship it\n");
    expect(rel).toBe("session/12.md");
    expect(existsSync(join(dir, rel))).toBe(true);
  });
  test("read returns file contents", () => {
    const rel = Note.create(dir, "block", 3, "plan");
    expect(Note.read(dir, rel)).toBe("plan");
  });
  test("read returns null for a missing note", () => {
    expect(Note.read(dir, "session/999.md")).toBeNull();
  });
  test("absPath joins the notes dir", () => {
    expect(Note.absPath(dir, "session/1.md")).toBe(join(dir, "session/1.md"));
  });
  test("create is idempotent — does not clobber an existing note", () => {
    Note.create(dir, "session", 1, "original");
    Note.create(dir, "session", 1, "replacement");
    expect(Note.read(dir, "session/1.md")).toBe("original");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/note/note.test.ts`
Expected: FAIL — cannot resolve `@/core/note/note`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/note/note.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export type NoteKind = "session" | "block";

const DEFAULT_TEMPLATE = "# Todo\n\n- [ ] \n";

/** Create a todo markdown file under `notesDir` for the given owner.
 *  Returns the path relative to `notesDir`. If the file already exists it is
 *  left untouched (so re-attaching a note never destroys content). */
export function create(
  notesDir: string,
  kind: NoteKind,
  ownerId: number,
  contents?: string,
): string {
  const rel = `${kind}/${ownerId}.md`;
  const abs = join(notesDir, rel);
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents ?? DEFAULT_TEMPLATE, "utf8");
  }
  return rel;
}

export function absPath(notesDir: string, relPath: string): string {
  return join(notesDir, relPath);
}

export function read(notesDir: string, relPath: string): string | null {
  const abs = join(notesDir, relPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

export * as Note from "./note";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/note/note.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add note module for todo markdown files

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Session — start, queries, elapsed/remaining

**Files:**
- Create: `src/core/session/session.ts`
- Test: `test/core/session/session-start.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("session start & queries", () => {
  test("start creates an active session", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    expect(s.status).toBe("active");
    expect(s.started_at).toBe(1000);
    expect(s.planned_seconds).toBe(1500);
    db.close();
  });
  test("only one session may be active at a time", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    expect(() =>
      Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 }),
    ).toThrow();
    db.close();
  });
  test("active returns the running session, or null", () => {
    const { db, clock, cat } = setup();
    expect(Session.active(db)).toBeNull();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    expect(Session.active(db)?.id).toBe(s.id);
    db.close();
  });
  test("elapsed grows with the clock", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    clock.advance(600);
    expect(Session.elapsed(db, clock, s)).toBe(600);
    expect(Session.remaining(db, clock, s)).toBe(900);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/session/session-start.test.ts`
Expected: FAIL — cannot resolve `@/core/session/session`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/session/session-start.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add session start, queries, and elapsed time

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Session — pause, resume, addTime

**Files:**
- Modify: `src/core/session/session.ts` (append functions before the `export * as` line)
- Test: `test/core/session/session-pause.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  const s = Session.start(db, clock, {
    category_id: cat.id,
    planned_seconds: 1500,
  });
  return { db, clock, s };
}

describe("session pause/resume/addTime", () => {
  test("paused time does not count toward elapsed", () => {
    const { db, clock, s } = setup();
    clock.advance(300); // 5 min of focus
    Session.pause(db, clock);
    clock.advance(600); // 10 min paused
    Session.resume(db, clock);
    clock.advance(120); // 2 more min of focus
    const fresh = Session.get(db, s.id)!;
    expect(Session.elapsed(db, clock, fresh)).toBe(420);
    db.close();
  });
  test("status flips to paused and back to active", () => {
    const { db, clock, s } = setup();
    Session.pause(db, clock);
    expect(Session.get(db, s.id)!.status).toBe("paused");
    Session.resume(db, clock);
    expect(Session.get(db, s.id)!.status).toBe("active");
    db.close();
  });
  test("pausing twice throws", () => {
    const { db, clock } = setup();
    Session.pause(db, clock);
    expect(() => Session.pause(db, clock)).toThrow();
    db.close();
  });
  test("resuming a non-paused session throws", () => {
    const { db, clock } = setup();
    expect(() => Session.resume(db, clock)).toThrow();
    db.close();
  });
  test("addTime extends planned_seconds", () => {
    const { db, clock, s } = setup();
    Session.addTime(db, 600);
    expect(Session.get(db, s.id)!.planned_seconds).toBe(2100);
    db.close();
  });
  test("addTime with no running session throws", () => {
    const db = open(":memory:");
    expect(() => Session.addTime(db, 600)).toThrow();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/session/session-pause.test.ts`
Expected: FAIL — `Session.pause is not a function`.

- [ ] **Step 3: Add the implementation**

Insert these functions into `src/core/session/session.ts`, immediately before the final `export * as Session from "./session";` line:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/session/session-pause.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add session pause, resume, and add-time

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Session — complete, abandon, reflect, list

**Files:**
- Modify: `src/core/session/session.ts` (append functions before the `export * as` line)
- Test: `test/core/session/session-finish.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("session complete/abandon/reflect/list", () => {
  test("complete ends the session and stores reflection", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    clock.advance(1500);
    const done = Session.complete(db, clock, "learned the api");
    expect(done.status).toBe("completed");
    expect(done.ended_at).toBe(2500);
    expect(done.reflection).toBe("learned the api");
    expect(Session.active(db)).toBeNull();
    db.close();
  });
  test("completing while paused closes the open pause", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    clock.advance(300);
    Session.pause(db, clock);
    clock.advance(120);
    const done = Session.complete(db, clock);
    expect(Session.elapsed(db, clock, done)).toBe(300);
    db.close();
  });
  test("complete updates a linked block to done", () => {
    const { db, clock, cat } = setup();
    const blk = db.raw
      .query(
        "INSERT INTO block (category_id, scheduled_start, scheduled_end, " +
          "status, created_at) VALUES (?, 0, 100, 'planned', 0)",
      )
      .run(cat.id);
    const blockId = Number(blk.lastInsertRowid);
    Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
      block_id: blockId,
    });
    Session.complete(db, clock);
    const status = (
      db.raw.query("SELECT status FROM block WHERE id = ?").get(blockId) as any
    ).status;
    expect(status).toBe("done");
    db.close();
  });
  test("abandon reverts a linked block to planned", () => {
    const { db, clock, cat } = setup();
    const blk = db.raw
      .query(
        "INSERT INTO block (category_id, scheduled_start, scheduled_end, " +
          "status, created_at) VALUES (?, 0, 100, 'planned', 0)",
      )
      .run(cat.id);
    const blockId = Number(blk.lastInsertRowid);
    Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
      block_id: blockId,
    });
    Session.abandon(db, clock);
    const status = (
      db.raw.query("SELECT status FROM block WHERE id = ?").get(blockId) as any
    ).status;
    expect(status).toBe("planned");
    db.close();
  });
  test("reflect updates a past session", () => {
    const { db, clock, cat } = setup();
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 1500,
    });
    Session.complete(db, clock);
    Session.reflect(db, s.id, "added later");
    expect(Session.get(db, s.id)!.reflection).toBe("added later");
    db.close();
  });
  test("list returns completed sessions newest first, with filters", () => {
    const { db, clock, cat } = setup();
    const a = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 60,
    });
    Session.complete(db, clock);
    clock.advance(100);
    const b = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 60,
    });
    Session.complete(db, clock);
    const ids = Session.list(db, {}).map((s) => s.id);
    expect(ids).toEqual([b.id, a.id]);
    expect(Session.list(db, { category_id: cat.id }).length).toBe(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/session/session-finish.test.ts`
Expected: FAIL — `Session.complete is not a function`.

- [ ] **Step 3: Add the implementation**

Insert these functions into `src/core/session/session.ts`, immediately before the final `export * as Session from "./session";` line:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/session/session-finish.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add session complete, abandon, reflect, and list

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Block — create, move, setNote, status transitions

**Files:**
- Create: `src/core/block/block.ts`
- Test: `test/core/block/block-crud.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Block } from "@/core/block/block";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("block crud", () => {
  test("create stores a planned block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      title: "design review",
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    expect(b.id).toBeGreaterThan(0);
    expect(b.status).toBe("planned");
    expect(b.scheduled_start).toBe(5000);
    expect(b.title).toBe("design review");
    db.close();
  });
  test("create rejects end before start", () => {
    const { db, clock, cat } = setup();
    expect(() =>
      Block.create(db, clock, {
        category_id: cat.id,
        scheduled_start: 6000,
        scheduled_end: 5000,
      }),
    ).toThrow();
    db.close();
  });
  test("move reschedules the block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.move(db, b.id, 8000, 9500);
    const moved = Block.get(db, b.id)!;
    expect(moved.scheduled_start).toBe(8000);
    expect(moved.scheduled_end).toBe(9500);
    db.close();
  });
  test("setNote attaches a note path", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.setNote(db, b.id, "block/1.md");
    expect(Block.get(db, b.id)!.note_path).toBe("block/1.md");
    db.close();
  });
  test("markDone and markSkipped change status", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.markDone(db, b.id);
    expect(Block.get(db, b.id)!.status).toBe("done");
    Block.markSkipped(db, b.id);
    expect(Block.get(db, b.id)!.status).toBe("skipped");
    db.close();
  });
  test("remove deletes the block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: 5000,
      scheduled_end: 6500,
    });
    Block.remove(db, b.id);
    expect(Block.get(db, b.id)).toBeNull();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/block/block-crud.test.ts`
Expected: FAIL — cannot resolve `@/core/block/block`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/block/block-crud.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add block create, move, note, and status

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Block — day queries & start-from-block

**Files:**
- Modify: `src/core/block/block.ts` (append functions before the `export * as` line)
- Test: `test/core/block/block-query.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Block } from "@/core/block/block";
import { Session } from "@/core/session/session";

// 2026-05-21 12:00 local time as the reference "now".
const NOW = Math.floor(new Date(2026, 4, 21, 12, 0, 0).getTime() / 1000);

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("block day queries", () => {
  test("today returns only blocks scheduled on the clock's date", () => {
    const { db, clock, cat } = setup();
    Block.create(db, clock, {
      category_id: cat.id,
      title: "today block",
      scheduled_start: NOW + 3600,
      scheduled_end: NOW + 5400,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "tomorrow block",
      scheduled_start: NOW + 86400,
      scheduled_end: NOW + 88200,
    });
    const titles = Block.today(db, clock).map((b) => b.title);
    expect(titles).toEqual(["today block"]);
    db.close();
  });
  test("upcoming returns future blocks ordered by start", () => {
    const { db, clock, cat } = setup();
    Block.create(db, clock, {
      category_id: cat.id,
      title: "later",
      scheduled_start: NOW + 7200,
      scheduled_end: NOW + 9000,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "soon",
      scheduled_start: NOW + 3600,
      scheduled_end: NOW + 5400,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "past",
      scheduled_start: NOW - 7200,
      scheduled_end: NOW - 3600,
    });
    expect(Block.upcoming(db, clock).map((b) => b.title)).toEqual([
      "soon",
      "later",
    ]);
    db.close();
  });
  test("startFromBlock starts a linked session and activates the block", () => {
    const { db, clock, cat } = setup();
    const b = Block.create(db, clock, {
      category_id: cat.id,
      scheduled_start: NOW,
      scheduled_end: NOW + 1500,
    });
    const s = Block.startFromBlock(db, clock, b.id, 1500);
    expect(s.block_id).toBe(b.id);
    expect(s.category_id).toBe(cat.id);
    expect(Block.get(db, b.id)!.status).toBe("active");
    expect(Session.active(db)!.id).toBe(s.id);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/block/block-query.test.ts`
Expected: FAIL — `Block.today is not a function`.

- [ ] **Step 3: Add the implementation**

Insert these functions into `src/core/block/block.ts`, immediately before the final `export * as Block from "./block";` line. Add the import for `Session` at the **top** of the file, below the existing imports:

```ts
import { Session } from "@/core/session/session";
```

Functions to append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/block/block-query.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add block day queries and start-from-block

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: View — read-model (status, agenda, summary, context)

**Files:**
- Create: `src/core/view/view.ts`
- Test: `test/core/view/view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Block } from "@/core/block/block";
import { Note } from "@/core/note/note";
import { View } from "@/core/view/view";

const NOW = Math.floor(new Date(2026, 4, 21, 12, 0, 0).getTime() / 1000);
const notesDir = join(tmpdir(), "session-view-test");

function setup() {
  rmSync(notesDir, { recursive: true, force: true });
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const cat = Category.create(db, clock, "work");
  const tag = Tag.create(db, clock, cat.id, "api");
  return { db, clock, cat, tag };
}

describe("view", () => {
  test("status is null when nothing runs", () => {
    const { db, clock } = setup();
    expect(View.status(db, clock)).toBeNull();
    db.close();
  });
  test("status reports the running session with derived times", () => {
    const { db, clock, cat, tag } = setup();
    Session.start(db, clock, {
      category_id: cat.id,
      tag_id: tag.id,
      planned_seconds: 1500,
      intent: "ship it",
    });
    clock.advance(300);
    const st = View.status(db, clock)!;
    expect(st.category).toBe("work");
    expect(st.tag).toBe("api");
    expect(st.intent).toBe("ship it");
    expect(st.status).toBe("active");
    expect(st.elapsed_seconds).toBe(300);
    expect(st.remaining_seconds).toBe(1200);
    db.close();
  });
  test("agenda groups blocks into past/current/upcoming", () => {
    const { db, clock, cat } = setup();
    Block.create(db, clock, {
      category_id: cat.id,
      title: "morning",
      scheduled_start: NOW - 7200,
      scheduled_end: NOW - 3600,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "now",
      scheduled_start: NOW - 600,
      scheduled_end: NOW + 600,
    });
    Block.create(db, clock, {
      category_id: cat.id,
      title: "afternoon",
      scheduled_start: NOW + 3600,
      scheduled_end: NOW + 5400,
    });
    const ag = View.agenda(db, clock);
    expect(ag.past.map((b) => b.title)).toEqual(["morning"]);
    expect(ag.current.map((b) => b.title)).toEqual(["now"]);
    expect(ag.upcoming.map((b) => b.title)).toEqual(["afternoon"]);
    db.close();
  });
  test("summary totals focused seconds per category", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 600 });
    clock.advance(600);
    Session.complete(db, clock);
    const sum = View.summary(db, clock, "today");
    expect(sum.total_seconds).toBe(600);
    expect(sum.by_category[0]).toEqual({ category: "work", seconds: 600 });
    db.close();
  });
  test("context inlines todo note contents", () => {
    const { db, clock, cat } = setup();
    const rel = Note.create(notesDir, "block", 1, "- [ ] write tests");
    const b = Block.create(db, clock, {
      category_id: cat.id,
      title: "with note",
      scheduled_start: NOW + 60,
      scheduled_end: NOW + 660,
      note_path: rel,
    });
    const ctx = View.context(db, clock, notesDir);
    const blk = ctx.blocks.find((x) => x.id === b.id)!;
    expect(blk.note).toBe("- [ ] write tests");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/view/view.test.ts`
Expected: FAIL — cannot resolve `@/core/view/view`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/view/view.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 5: Run the whole core suite**

Run: `bun test test/core`
Expected: PASS — all core tests green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add view read-model for status, agenda, summary, context

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Output formatters (text / json / toon)

**Files:**
- Create: `src/cli/format/format.ts`
- Test: `test/cli/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { render, formatDuration, type OutputFormat } from "@/cli/format/format";

describe("format", () => {
  test("json output is pretty-printed JSON", () => {
    const out = render({ a: 1 }, "json");
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });
  test("toon output is a non-empty string distinct from json", () => {
    const value = { items: [{ id: 1 }, { id: 2 }] };
    const toon = render(value, "toon");
    expect(toon.length).toBeGreaterThan(0);
    expect(toon).not.toBe(render(value, "json"));
  });
  test("text output uses the provided text renderer", () => {
    const out = render({ n: 5 }, "text", (v) => `n is ${v.n}`);
    expect(out).toBe("n is 5");
  });
  test("text output falls back to JSON when no renderer is given", () => {
    const out = render({ n: 5 }, "text");
    expect(JSON.parse(out)).toEqual({ n: 5 });
  });
  test("formatDuration renders h/m/s compactly", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/format.test.ts`
Expected: FAIL — cannot resolve `@/cli/format/format`.

- [ ] **Step 3: Write the implementation**

```ts
// src/cli/format/format.ts
import { encode as toonEncode } from "@toon-format/toon";

export type OutputFormat = "text" | "json" | "toon";

/** Render a value for output. `text` uses `textRenderer` if supplied,
 *  otherwise falls back to JSON. `json` and `toon` ignore the renderer. */
export function render<T>(
  value: T,
  format: OutputFormat,
  textRenderer?: (v: T) => string,
): string {
  if (format === "json") return JSON.stringify(value, null, 2);
  if (format === "toon") return toonEncode(value as unknown);
  return textRenderer ? textRenderer(value) : JSON.stringify(value, null, 2);
}

/** Format a whole-second duration as "M:SS" or "H:MM:SS". Negatives clamp to 0. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli/format.test.ts`
Expected: PASS — 5 pass.

Note: if `@toon-format/toon` exports `encode` under a different name, check
`node_modules/@toon-format/toon/package.json` `exports` and adjust the import;
the function takes a value and returns a string.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add output formatters for text, json, and toon

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: CLI infrastructure — paths, args, registry, entry point

**Files:**
- Create: `src/cli/paths.ts`, `src/cli/args.ts`, `src/cli/registry.ts`
- Modify: `bin/session.ts`
- Test: `test/cli/args.test.ts`, `test/cli/registry.test.ts`

- [ ] **Step 1: Write the failing test for args**

```ts
// test/cli/args.test.ts
import { test, expect, describe } from "bun:test";
import { parseFormat, flag, requirePositional } from "@/cli/args";

describe("args", () => {
  test("parseFormat reads --format", () => {
    expect(parseFormat({ format: "json" })).toBe("json");
    expect(parseFormat({ format: "toon" })).toBe("toon");
  });
  test("parseFormat treats --json as a shorthand", () => {
    expect(parseFormat({ json: true })).toBe("json");
  });
  test("parseFormat defaults to text", () => {
    expect(parseFormat({})).toBe("text");
  });
  test("parseFormat rejects an unknown format", () => {
    expect(() => parseFormat({ format: "xml" })).toThrow();
  });
  test("requirePositional throws when missing", () => {
    expect(() => requirePositional([], 0, "category")).toThrow();
    expect(requirePositional(["work"], 0, "category")).toBe("work");
  });
  test("flag reads a boolean", () => {
    expect(flag({ note: true }, "note")).toBe(true);
    expect(flag({}, "note")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/args.test.ts`
Expected: FAIL — cannot resolve `@/cli/args`.

- [ ] **Step 3: Write `src/cli/paths.ts`**

```ts
// src/cli/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Root data directory: $SESSION_DATA_DIR or ~/.local/share/session. */
export function dataDir(): string {
  return (
    process.env.SESSION_DATA_DIR ??
    join(homedir(), ".local", "share", "session")
  );
}

export function dbPath(): string {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  return join(dir, "session.db");
}

export function notesDir(): string {
  const dir = join(dataDir(), "notes");
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

- [ ] **Step 4: Write `src/cli/args.ts`**

```ts
// src/cli/args.ts
import type { OutputFormat } from "@/cli/format/format";

export type Flags = Record<string, string | boolean | undefined>;

/** Resolve the output format from parsed flags. `--json` is a shorthand. */
export function parseFormat(flags: Flags): OutputFormat {
  if (flags.json === true) return "json";
  const f = flags.format;
  if (f === undefined) return "text";
  if (f === "text" || f === "json" || f === "toon") return f;
  throw new Error(`unknown format: "${String(f)}" (use text|json|toon)`);
}

export function flag(flags: Flags, name: string): boolean {
  return flags[name] === true;
}

export function str(flags: Flags, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

export function requirePositional(
  positionals: string[],
  index: number,
  name: string,
): string {
  const v = positionals[index];
  if (v === undefined || v === "") {
    throw new Error(`missing required argument: <${name}>`);
  }
  return v;
}
```

- [ ] **Step 5: Run the args test to verify it passes**

Run: `bun test test/cli/args.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 6: Write the failing test for the registry**

```ts
// test/cli/registry.test.ts
import { test, expect, describe } from "bun:test";
import { dispatch, type Command } from "@/cli/registry";

const commands: Command[] = [
  {
    name: "greet",
    summary: "print a greeting",
    run: (ctx) => {
      ctx.print(`hello ${ctx.positionals[0] ?? "world"}`);
      return 0;
    },
  },
];

describe("registry", () => {
  test("dispatch runs a matching command", () => {
    let out = "";
    const code = dispatch(commands, ["greet", "sam"], (s) => (out += s));
    expect(code).toBe(0);
    expect(out).toContain("hello sam");
  });
  test("dispatch supports a noun subcommand path", () => {
    let out = "";
    const nested: Command[] = [
      {
        name: "block add",
        summary: "add a block",
        run: (ctx) => {
          ctx.print("added");
          return 0;
        },
      },
    ];
    const code = dispatch(nested, ["block", "add"], (s) => (out += s));
    expect(code).toBe(0);
    expect(out).toContain("added");
  });
  test("unknown command returns a non-zero code", () => {
    let out = "";
    const code = dispatch(commands, ["nope"], (s) => (out += s));
    expect(code).not.toBe(0);
    expect(out.toLowerCase()).toContain("unknown");
  });
  test("no args prints help and returns 0", () => {
    let out = "";
    const code = dispatch(commands, [], (s) => (out += s));
    expect(code).toBe(0);
    expect(out).toContain("greet");
  });
});
```

- [ ] **Step 7: Run the registry test to verify it fails**

Run: `bun test test/cli/registry.test.ts`
Expected: FAIL — cannot resolve `@/cli/registry`.

- [ ] **Step 8: Write `src/cli/registry.ts`**

```ts
// src/cli/registry.ts
import { parseArgs } from "node:util";
import type { Flags } from "@/cli/args";

export interface CommandContext {
  positionals: string[];
  flags: Flags;
  print: (s: string) => void;
}

export interface Command {
  /** Space-separated command path, e.g. "start" or "block add". */
  name: string;
  summary: string;
  run: (ctx: CommandContext) => number;
}

const PARSE_OPTIONS = {
  format: { type: "string" },
  json: { type: "boolean" },
  note: { type: "boolean" },
  tmux: { type: "boolean" },
  today: { type: "boolean" },
  week: { type: "boolean" },
  intent: { type: "string" },
  for: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  title: { type: "string" },
  reflect: { type: "string" },
  block: { type: "string" },
  category: { type: "string" },
  tag: { type: "string" },
  since: { type: "string" },
} as const;

/** Find the command whose name matches the longest leading run of argv
 *  tokens, so "block add" wins over a bare "block". */
function match(commands: Command[], argv: string[]): { cmd: Command; rest: string[] } | null {
  let best: { cmd: Command; rest: string[] } | null = null;
  for (const cmd of commands) {
    const parts = cmd.name.split(" ");
    if (parts.length > argv.length) continue;
    if (parts.every((p, i) => p === argv[i])) {
      if (!best || parts.length > best.cmd.name.split(" ").length) {
        best = { cmd, rest: argv.slice(parts.length) };
      }
    }
  }
  return best;
}

function printHelp(commands: Command[], print: (s: string) => void): void {
  print("session — focus tracker & time blocking\n\n");
  print("Commands:\n");
  for (const c of [...commands].sort((a, b) => a.name.localeCompare(b.name))) {
    print(`  ${c.name.padEnd(22)} ${c.summary}\n`);
  }
}

export function dispatch(
  commands: Command[],
  argv: string[],
  print: (s: string) => void,
): number {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
    printHelp(commands, print);
    return 0;
  }
  const found = match(commands, argv);
  if (!found) {
    print(`unknown command: ${argv.join(" ")}\n`);
    printHelp(commands, print);
    return 1;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: found.rest,
      options: PARSE_OPTIONS,
      allowPositionals: true,
      strict: false,
    });
  } catch (e) {
    print(`error: ${(e as Error).message}\n`);
    return 1;
  }
  try {
    return found.cmd.run({
      positionals: parsed.positionals,
      flags: parsed.values as Flags,
      print,
    });
  } catch (e) {
    print(`error: ${(e as Error).message}\n`);
    return 1;
  }
}
```

- [ ] **Step 9: Run the registry test to verify it passes**

Run: `bun test test/cli/registry.test.ts`
Expected: PASS — 4 pass.

- [ ] **Step 10: Wire `bin/session.ts`**

```ts
#!/usr/bin/env bun
import { open } from "@/core/db/db";
import { systemClock } from "@/core/clock/clock";
import { dbPath, notesDir } from "@/cli/paths";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";

const db = open(dbPath());
const code = dispatch(
  commands({ db, clock: systemClock(), notesDir: notesDir() }),
  process.argv.slice(2),
  (s) => process.stdout.write(s),
);
db.close();
process.exit(code);
```

Note: `bin/session.ts` will not run until Task 18 creates `commands/session.ts`.
That is expected — the next task makes it runnable.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add CLI paths, arg helpers, and command registry

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: CLI session commands

**Files:**
- Create: `src/cli/commands/session.ts`
- Test: `test/cli/session-commands.test.ts`

This task introduces the shared `CommandDeps` type and a `commands(deps)`
factory that returns every command. Block, view, and setup commands (Tasks 19–20)
are appended to the same returned array.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { notesDir as resolveNotesDir } from "@/cli/paths";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { rmSync } from "node:fs";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const notesDir = "/tmp/session-cli-cmd-test";
  rmSync(notesDir, { recursive: true, force: true });
  const cmds = commands({ db, clock, notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { db, clock, run };
}

describe("session commands", () => {
  test("start then status reports the running session as JSON", () => {
    const { clock, run } = setup();
    expect(run(["start", "work", "--for", "25m"]).code).toBe(0);
    clock.advance(300);
    const { code, out } = run(["status", "--json"]);
    expect(code).toBe(0);
    const st = JSON.parse(out);
    expect(st.category).toBe("work");
    expect(st.elapsed_seconds).toBe(300);
  });
  test("start auto-creates the category and tag", () => {
    const { run } = setup();
    expect(run(["start", "study", "calculus", "--for", "10m"]).code).toBe(0);
    const st = JSON.parse(run(["status", "--json"]).out);
    expect(st.category).toBe("study");
    expect(st.tag).toBe("calculus");
  });
  test("starting a second session fails", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    const { code, out } = run(["start", "work", "--for", "25m"]);
    expect(code).toBe(1);
    expect(out).toContain("already running");
  });
  test("add extends the running session", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    expect(run(["add", "10m"]).code).toBe(0);
    const st = JSON.parse(run(["status", "--json"]).out);
    expect(st.planned_seconds).toBe(2100);
  });
  test("pause and resume change status", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    run(["pause"]);
    expect(JSON.parse(run(["status", "--json"]).out).status).toBe("paused");
    run(["resume"]);
    expect(JSON.parse(run(["status", "--json"]).out).status).toBe("active");
  });
  test("done completes with a reflection and clears status", () => {
    const { run } = setup();
    run(["start", "work", "--for", "25m"]);
    expect(run(["done", "--reflect", "shipped"]).code).toBe(0);
    const { out } = run(["status", "--json"]);
    expect(out.trim()).toBe("null");
  });
  test("status --tmux prints a compact line, empty when idle", () => {
    const { clock, run } = setup();
    expect(run(["status", "--tmux"]).out.trim()).toBe("");
    run(["start", "work", "--for", "25m"]);
    clock.advance(65);
    expect(run(["status", "--tmux"]).out).toContain("work");
  });
  test("list shows completed sessions as JSON", () => {
    const { run } = setup();
    run(["start", "work", "--for", "1m"]);
    run(["done", "--reflect", "x"]);
    const arr = JSON.parse(run(["list", "--json"]).out);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/session-commands.test.ts`
Expected: FAIL — cannot resolve `@/cli/commands/session`.

- [ ] **Step 3: Write the implementation**

```ts
// src/cli/commands/session.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Note } from "@/core/note/note";
import { Config } from "@/core/config/config";
import { View } from "@/core/view/view";
import { parseDuration } from "@/core/time/duration";
import type { Command } from "@/cli/registry";
import { render, formatDuration } from "@/cli/format/format";
import { parseFormat, flag, str, requirePositional } from "@/cli/args";

export interface CommandDeps {
  db: Db;
  clock: Clock;
  notesDir: string;
}

/** Resolve category (required) and tag (optional) by name, creating them. */
function resolveCategoryTag(
  deps: CommandDeps,
  categoryName: string,
  tagName?: string,
): { categoryId: number; tagId: number | null } {
  const cat = Category.ensure(deps.db, deps.clock, categoryName);
  const tag = tagName
    ? Tag.ensure(deps.db, deps.clock, cat.id, tagName)
    : null;
  return { categoryId: cat.id, tagId: tag ? tag.id : null };
}

export function sessionCommands(deps: CommandDeps): Command[] {
  const { db, clock, notesDir } = deps;
  return [
    {
      name: "start",
      summary: "start a focus session: start <category> [tag] [--for 25m]",
      run: (ctx) => {
        const categoryName = requirePositional(ctx.positionals, 0, "category");
        const tagName = ctx.positionals[1];
        const { categoryId, tagId } = resolveCategoryTag(
          deps,
          categoryName,
          tagName,
        );
        const forStr = str(ctx.flags, "for");
        const planned = forStr
          ? parseDuration(forStr)
          : Config.defaultDuration(db);
        const s = Session.start(db, clock, {
          category_id: categoryId,
          tag_id: tagId,
          intent: str(ctx.flags, "intent") ?? null,
          planned_seconds: planned,
        });
        if (flag(ctx.flags, "note")) {
          const rel = Note.create(notesDir, "session", s.id);
          db.raw
            .query("UPDATE session SET note_path = ? WHERE id = ?")
            .run(rel, s.id);
        }
        ctx.print(`started ${categoryName}${tagName ? "/" + tagName : ""} ` +
          `for ${formatDuration(planned)}\n`);
        return 0;
      },
    },
    {
      name: "status",
      summary: "show the running session [--json|--toon|--tmux]",
      run: (ctx) => {
        const st = View.status(db, clock);
        if (flag(ctx.flags, "tmux")) {
          if (!st) {
            ctx.print("");
          } else {
            const label = st.tag ? `${st.category}/${st.tag}` : st.category;
            const dot = st.status === "paused" ? "‖" : "●";
            ctx.print(`${dot} ${label} ${formatDuration(st.elapsed_seconds)}`);
          }
          return 0;
        }
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(st, format, (v) =>
            v
              ? `${v.status === "paused" ? "paused" : "focusing"}: ` +
                `${v.category}${v.tag ? "/" + v.tag : ""} — ` +
                `${formatDuration(v.elapsed_seconds)} / ` +
                `${formatDuration(v.planned_seconds)}\n`
              : "no session running\n",
          ),
        );
        return 0;
      },
    },
    {
      name: "pause",
      summary: "pause the running session",
      run: (ctx) => {
        Session.pause(db, clock);
        ctx.print("paused\n");
        return 0;
      },
    },
    {
      name: "resume",
      summary: "resume the paused session",
      run: (ctx) => {
        Session.resume(db, clock);
        ctx.print("resumed\n");
        return 0;
      },
    },
    {
      name: "add",
      summary: "add time to the running session: add <duration>",
      run: (ctx) => {
        const dur = parseDuration(
          requirePositional(ctx.positionals, 0, "duration"),
        );
        const s = Session.addTime(db, dur);
        ctx.print(`added ${formatDuration(dur)}; planned now ` +
          `${formatDuration(s.planned_seconds)}\n`);
        return 0;
      },
    },
    {
      name: "done",
      summary: "complete the running session [--reflect \"…\"]",
      run: (ctx) => {
        const reflection = str(ctx.flags, "reflect") ?? null;
        Session.complete(db, clock, reflection);
        ctx.print("session completed\n");
        return 0;
      },
    },
    {
      name: "cancel",
      summary: "abandon the running session",
      run: (ctx) => {
        Session.abandon(db, clock);
        ctx.print("session abandoned\n");
        return 0;
      },
    },
    {
      name: "reflect",
      summary: "set the reflection on the last session: reflect <text>",
      run: (ctx) => {
        const text = requirePositional(ctx.positionals, 0, "text");
        const last = Session.list(db, { limit: 1 })[0];
        if (!last) throw new Error("no past session to reflect on");
        Session.reflect(db, last.id, text);
        ctx.print("reflection saved\n");
        return 0;
      },
    },
    {
      name: "note",
      summary: "print the path of the running session's todo note",
      run: (ctx) => {
        const s = Session.active(db);
        if (!s) throw new Error("no running session");
        const rel = s.note_path ?? Note.create(notesDir, "session", s.id);
        if (!s.note_path) {
          db.raw
            .query("UPDATE session SET note_path = ? WHERE id = ?")
            .run(rel, s.id);
        }
        ctx.print(Note.absPath(notesDir, rel) + "\n");
        return 0;
      },
    },
    {
      name: "list",
      summary: "list past sessions [--today|--since d|--category|--tag]",
      run: (ctx) => {
        let since: number | undefined;
        if (flag(ctx.flags, "today")) {
          const d = new Date(clock.now() * 1000);
          since = Math.floor(
            new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() /
              1000,
          );
        }
        const catName = str(ctx.flags, "category");
        const cat = catName ? Category.getByName(db, catName) : null;
        const rows = Session.list(db, {
          since,
          category_id: cat?.id,
        });
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(rows, format, (list) =>
            list.length === 0
              ? "no sessions\n"
              : list
                  .map(
                    (s) =>
                      `#${s.id} ${s.status} ` +
                      `${formatDuration(
                        (s.ended_at ?? s.started_at) - s.started_at,
                      )}`,
                  )
                  .join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
  ];
}

/** All commands. Block/view/setup groups are merged in Tasks 19–20. */
export function commands(deps: CommandDeps): Command[] {
  return [...sessionCommands(deps)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli/session-commands.test.ts`
Expected: PASS — 8 pass.

- [ ] **Step 5: Smoke-test the real binary**

Run:
```bash
SESSION_DATA_DIR=/tmp/session-smoke bun run bin/session.ts start work --for 25m
SESSION_DATA_DIR=/tmp/session-smoke bun run bin/session.ts status
rm -rf /tmp/session-smoke
```
Expected: first prints `started work for 25:00`, second prints a `focusing: work …` line.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add CLI session commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: CLI block commands

**Files:**
- Create: `src/cli/commands/block.ts`
- Modify: `src/cli/commands/session.ts` (extend the `commands` factory)
- Test: `test/cli/block-commands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { rmSync } from "node:fs";

const NOW = Math.floor(new Date(2026, 4, 21, 9, 0, 0).getTime() / 1000);

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const notesDir = "/tmp/session-cli-block-test";
  rmSync(notesDir, { recursive: true, force: true });
  const cmds = commands({ db, clock, notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { db, clock, run };
}

describe("block commands", () => {
  test("block add creates a planned block", () => {
    const { run } = setup();
    const { code } = run([
      "block", "add", "work", "--from", "10:00", "--to", "11:00",
      "--title", "design",
    ]);
    expect(code).toBe(0);
    const list = JSON.parse(run(["block", "list", "--json"]).out);
    expect(list.length).toBe(1);
    expect(list[0].title).toBe("design");
  });
  test("block move reschedules a block", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "11:00"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    expect(run(["block", "move", String(id), "--to", "14:00"]).code).toBe(0);
    const moved = JSON.parse(run(["block", "list", "--json"]).out)[0];
    expect(new Date(moved.scheduled_start * 1000).getHours()).toBe(14);
  });
  test("block start launches a session from the block", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "10:30"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    expect(run(["block", "start", String(id)]).code).toBe(0);
    expect(JSON.parse(run(["status", "--json"]).out).category).toBe("work");
  });
  test("block done and skip set status", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "11:00"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    run(["block", "done", String(id)]);
    expect(JSON.parse(run(["block", "list", "--json"]).out)[0].status).toBe(
      "done",
    );
  });
  test("block rm deletes a block", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "10:00", "--to", "11:00"]);
    const id = JSON.parse(run(["block", "list", "--json"]).out)[0].id;
    run(["block", "rm", String(id)]);
    expect(JSON.parse(run(["block", "list", "--json"]).out).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/block-commands.test.ts`
Expected: FAIL — cannot resolve `@/cli/commands/block`.

- [ ] **Step 3: Write `src/cli/commands/block.ts`**

```ts
// src/cli/commands/block.ts
import { Block } from "@/core/block/block";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Note } from "@/core/note/note";
import { parseTime } from "@/core/time/datetime";
import { parseDuration } from "@/core/time/duration";
import type { Command } from "@/cli/registry";
import { render, formatDuration } from "@/cli/format/format";
import { parseFormat, flag, str, requirePositional } from "@/cli/args";
import type { CommandDeps } from "@/cli/commands/session";

function resolveCategoryTagForBlock(
  deps: CommandDeps,
  categoryName: string,
  tagName?: string,
): { categoryId: number; tagId: number | null } {
  const cat = Category.ensure(deps.db, deps.clock, categoryName);
  const tag = tagName ? Tag.ensure(deps.db, deps.clock, cat.id, tagName) : null;
  return { categoryId: cat.id, tagId: tag ? tag.id : null };
}

export function blockCommands(deps: CommandDeps): Command[] {
  const { db, clock, notesDir } = deps;
  return [
    {
      name: "block add",
      summary:
        "add a time block: block add <category> [tag] --from <t> --to <t>",
      run: (ctx) => {
        const categoryName = requirePositional(ctx.positionals, 0, "category");
        const tagName = ctx.positionals[1];
        const fromStr = str(ctx.flags, "from");
        const toStr = str(ctx.flags, "to");
        if (!fromStr || !toStr) {
          throw new Error("block add requires --from and --to");
        }
        const { categoryId, tagId } = resolveCategoryTagForBlock(
          deps,
          categoryName,
          tagName,
        );
        const now = clock.now();
        const b = Block.create(db, clock, {
          category_id: categoryId,
          tag_id: tagId,
          title: str(ctx.flags, "title") ?? null,
          scheduled_start: parseTime(fromStr, now),
          scheduled_end: parseTime(toStr, now),
        });
        if (flag(ctx.flags, "note")) {
          const rel = Note.create(notesDir, "block", b.id);
          Block.setNote(db, b.id, rel);
        }
        ctx.print(`block #${b.id} created\n`);
        return 0;
      },
    },
    {
      name: "block move",
      summary: "reschedule a block: block move <id> --to <t> [--for <dur>]",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const existing = Block.get(db, id);
        if (!existing) throw new Error(`block ${id} not found`);
        const toStr = str(ctx.flags, "to");
        if (!toStr) throw new Error("block move requires --to");
        const newStart = parseTime(toStr, clock.now());
        const forStr = str(ctx.flags, "for");
        const span = forStr
          ? parseDuration(forStr)
          : existing.scheduled_end - existing.scheduled_start;
        Block.move(db, id, newStart, newStart + span);
        ctx.print(`block #${id} moved\n`);
        return 0;
      },
    },
    {
      name: "block start",
      summary: "start a focus session from a block: block start <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const b = Block.get(db, id);
        if (!b) throw new Error(`block ${id} not found`);
        const forStr = str(ctx.flags, "for");
        // Default the session length to the block's own scheduled span.
        const planned = forStr
          ? parseDuration(forStr)
          : b.scheduled_end - b.scheduled_start;
        Block.startFromBlock(db, clock, id, planned);
        ctx.print(`started session from block #${id} ` +
          `(${formatDuration(planned)})\n`);
        return 0;
      },
    },
    {
      name: "block done",
      summary: "mark a block done: block done <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Block.markDone(db, id);
        ctx.print(`block #${id} done\n`);
        return 0;
      },
    },
    {
      name: "block skip",
      summary: "mark a block skipped: block skip <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Block.markSkipped(db, id);
        ctx.print(`block #${id} skipped\n`);
        return 0;
      },
    },
    {
      name: "block rm",
      summary: "delete a block: block rm <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Block.remove(db, id);
        ctx.print(`block #${id} removed\n`);
        return 0;
      },
    },
    {
      name: "block note",
      summary: "print the path of a block's todo note: block note <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const b = Block.get(db, id);
        if (!b) throw new Error(`block ${id} not found`);
        const rel = b.note_path ?? Note.create(notesDir, "block", b.id);
        if (!b.note_path) Block.setNote(db, b.id, rel);
        ctx.print(Note.absPath(notesDir, rel) + "\n");
        return 0;
      },
    },
    {
      name: "block list",
      summary: "list today's blocks [--json|--toon]",
      run: (ctx) => {
        const rows = Block.today(db, clock);
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(rows, format, (list) =>
            list.length === 0
              ? "no blocks today\n"
              : list
                  .map((b) => {
                    const t = new Date(b.scheduled_start * 1000);
                    const hh = String(t.getHours()).padStart(2, "0");
                    const mm = String(t.getMinutes()).padStart(2, "0");
                    return `#${b.id} ${hh}:${mm} ${b.status} ` +
                      `${b.title ?? "(untitled)"}`;
                  })
                  .join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
  ];
}
```

- [ ] **Step 4: Merge block commands into the factory**

In `src/cli/commands/session.ts`, replace the `commands` function at the bottom of the file with:

```ts
import { blockCommands } from "@/cli/commands/block";

/** All commands. View/setup groups are merged in Task 20. */
export function commands(deps: CommandDeps): Command[] {
  return [...sessionCommands(deps), ...blockCommands(deps)];
}
```

(Place the `import` with the other imports at the top of the file, and keep only
one `commands` definition.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test test/cli/block-commands.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add CLI block commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: CLI view & setup commands

**Files:**
- Create: `src/cli/commands/views.ts`, `src/cli/commands/setup.ts`
- Modify: `src/cli/commands/session.ts` (extend the `commands` factory)
- Test: `test/cli/view-commands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { rmSync } from "node:fs";

const NOW = Math.floor(new Date(2026, 4, 21, 9, 0, 0).getTime() / 1000);

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(NOW);
  const notesDir = "/tmp/session-cli-view-test";
  rmSync(notesDir, { recursive: true, force: true });
  const cmds = commands({ db, clock, notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { run };
}

describe("view & setup commands", () => {
  test("agenda returns blocks grouped by time as JSON", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "14:00", "--to", "15:00"]);
    const ag = JSON.parse(run(["agenda", "--json"]).out);
    expect(ag.upcoming.length).toBe(1);
  });
  test("summary reports totals as JSON", () => {
    const { run } = setup();
    run(["start", "work", "--for", "1m"]);
    run(["done", "--reflect", "x"]);
    const sum = JSON.parse(run(["summary", "--today", "--json"]).out);
    expect(sum.session_count).toBe(1);
  });
  test("context returns the agent aggregate as JSON", () => {
    const { run } = setup();
    run(["block", "add", "work", "--from", "14:00", "--to", "15:00"]);
    const ctx = JSON.parse(run(["context", "--json"]).out);
    expect(Array.isArray(ctx.categories)).toBe(true);
    expect(Array.isArray(ctx.blocks)).toBe(true);
  });
  test("context --toon returns a non-empty string", () => {
    const { run } = setup();
    const { code, out } = run(["context", "--toon"]);
    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
  });
  test("category list shows created categories", () => {
    const { run } = setup();
    run(["category", "add", "research"]);
    const list = JSON.parse(run(["category", "list", "--json"]).out);
    expect(list.some((c: any) => c.name === "research")).toBe(true);
  });
  test("config set and get round-trip", () => {
    const { run } = setup();
    run(["config", "set", "default_duration", "3000"]);
    expect(run(["config", "get", "default_duration"]).out.trim()).toBe("3000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/view-commands.test.ts`
Expected: FAIL — cannot resolve `@/cli/commands/views`.

- [ ] **Step 3: Write `src/cli/commands/views.ts`**

```ts
// src/cli/commands/views.ts
import { View } from "@/core/view/view";
import type { Command } from "@/cli/registry";
import { render, formatDuration } from "@/cli/format/format";
import { parseFormat, flag } from "@/cli/args";
import type { CommandDeps } from "@/cli/commands/session";

export function viewCommands(deps: CommandDeps): Command[] {
  const { db, clock, notesDir } = deps;
  return [
    {
      name: "agenda",
      summary: "show today's plan: blocks + ongoing session [--json|--toon]",
      run: (ctx) => {
        const ag = View.agenda(db, clock);
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(ag, format, (v) => {
            const lines: string[] = [];
            if (v.ongoing) {
              lines.push(
                `▶ focusing: ${v.ongoing.category} ` +
                  `(${formatDuration(v.ongoing.elapsed_seconds)})`,
              );
            }
            for (const [label, list] of [
              ["past", v.past],
              ["now", v.current],
              ["next", v.upcoming],
            ] as const) {
              for (const b of list) {
                lines.push(`  [${label}] #${b.id} ${b.title ?? "(untitled)"}`);
              }
            }
            return (lines.length ? lines.join("\n") : "nothing planned today") +
              "\n";
          }),
        );
        return 0;
      },
    },
    {
      name: "summary",
      summary: "time-spent breakdown [--today|--week] [--json|--toon]",
      run: (ctx) => {
        const range = flag(ctx.flags, "week") ? "week" : "today";
        const sum = View.summary(db, clock, range);
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(sum, format, (v) => {
            const head = `${v.range}: ${formatDuration(v.total_seconds)} ` +
              `across ${v.session_count} session(s)`;
            const rows = v.by_category.map(
              (c) => `  ${c.category}: ${formatDuration(c.seconds)}`,
            );
            return [head, ...rows].join("\n") + "\n";
          }),
        );
        return 0;
      },
    },
    {
      name: "context",
      summary: "full agent-facing dump [--json|--toon]",
      run: (ctx) => {
        const data = View.context(db, clock, notesDir);
        // context is an agent surface: default to JSON, not text.
        const format = parseFormat(ctx.flags);
        ctx.print(render(data, format === "text" ? "json" : format));
        ctx.print("\n");
        return 0;
      },
    },
  ];
}
```

- [ ] **Step 4: Write `src/cli/commands/setup.ts`**

```ts
// src/cli/commands/setup.ts
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Config } from "@/core/config/config";
import type { Command } from "@/cli/registry";
import { render } from "@/cli/format/format";
import { parseFormat, requirePositional } from "@/cli/args";
import type { CommandDeps } from "@/cli/commands/session";

export function setupCommands(deps: CommandDeps): Command[] {
  const { db, clock } = deps;
  return [
    {
      name: "category add",
      summary: "create a category: category add <name>",
      run: (ctx) => {
        const name = requirePositional(ctx.positionals, 0, "name");
        const c = Category.create(db, clock, name);
        ctx.print(`category #${c.id} ${c.name} created\n`);
        return 0;
      },
    },
    {
      name: "category list",
      summary: "list categories [--json|--toon]",
      run: (ctx) => {
        const rows = Category.list(db);
        ctx.print(
          render(rows, parseFormat(ctx.flags), (list) =>
            list.map((c) => `#${c.id} ${c.name}`).join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
    {
      name: "category rename",
      summary: "rename a category: category rename <id> <name>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const name = requirePositional(ctx.positionals, 1, "name");
        Category.rename(db, id, name);
        ctx.print("renamed\n");
        return 0;
      },
    },
    {
      name: "category archive",
      summary: "archive a category: category archive <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Category.archive(db, id);
        ctx.print("archived\n");
        return 0;
      },
    },
    {
      name: "tag add",
      summary: "create a tag: tag add <category> <name>",
      run: (ctx) => {
        const catName = requirePositional(ctx.positionals, 0, "category");
        const name = requirePositional(ctx.positionals, 1, "name");
        const cat = Category.getByName(db, catName);
        if (!cat) throw new Error(`category "${catName}" not found`);
        const t = Tag.create(db, clock, cat.id, name);
        ctx.print(`tag #${t.id} ${catName}/${t.name} created\n`);
        return 0;
      },
    },
    {
      name: "tag list",
      summary: "list tags in a category: tag list <category> [--json|--toon]",
      run: (ctx) => {
        const catName = requirePositional(ctx.positionals, 0, "category");
        const cat = Category.getByName(db, catName);
        if (!cat) throw new Error(`category "${catName}" not found`);
        const rows = Tag.list(db, cat.id);
        ctx.print(
          render(rows, parseFormat(ctx.flags), (list) =>
            list.map((t) => `#${t.id} ${t.name}`).join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
    {
      name: "config get",
      summary: "read a config value: config get <key>",
      run: (ctx) => {
        const key = requirePositional(ctx.positionals, 0, "key");
        ctx.print((Config.get(db, key) ?? "") + "\n");
        return 0;
      },
    },
    {
      name: "config set",
      summary: "write a config value: config set <key> <value>",
      run: (ctx) => {
        const key = requirePositional(ctx.positionals, 0, "key");
        const value = requirePositional(ctx.positionals, 1, "value");
        Config.set(db, key, value);
        ctx.print(`${key} = ${value}\n`);
        return 0;
      },
    },
  ];
}
```

- [ ] **Step 5: Merge all command groups into the factory**

In `src/cli/commands/session.ts`, replace the `commands` function with the final version (keep a single definition, imports at the top):

```ts
import { blockCommands } from "@/cli/commands/block";
import { viewCommands } from "@/cli/commands/views";
import { setupCommands } from "@/cli/commands/setup";

/** Every command in the CLI. */
export function commands(deps: CommandDeps): Command[] {
  return [
    ...sessionCommands(deps),
    ...blockCommands(deps),
    ...viewCommands(deps),
    ...setupCommands(deps),
  ];
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test test/cli/view-commands.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 7: Run the entire suite**

Run: `bun test`
Expected: PASS — every test green across core and cli.

- [ ] **Step 8: Full manual smoke test**

Run:
```bash
export SESSION_DATA_DIR=/tmp/session-full
rm -rf $SESSION_DATA_DIR
bun run bin/session.ts category add work
bun run bin/session.ts block add work api --from +1h --to +2h --title "ship"
bun run bin/session.ts start work api --for 25m
bun run bin/session.ts status --tmux
bun run bin/session.ts add 5m
bun run bin/session.ts done --reflect "done for today"
bun run bin/session.ts agenda
bun run bin/session.ts summary --today
bun run bin/session.ts context --toon
rm -rf $SESSION_DATA_DIR
```
Expected: each command succeeds; `status --tmux` shows `● work/api 0:00`,
`context --toon` prints TOON-formatted text.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add CLI view and setup commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: README & tmux integration docs

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# session

A tmux-integratable CLI focus tracker with day-level time blocking and a
JSON/TOON read surface for AI agents.

## Install

```bash
bun install
bun link        # exposes the `session` command
```

## Quick start

```bash
session start work api --for 25m      # start a focus session
session status                        # see the running session
session add 10m                       # extend it
session done --reflect "what I did"   # finish + record a reflection

session block add work --from 14:00 --to 15:00 --title "review"
session agenda                        # today's plan
session summary --week                # time spent
```

## tmux status line

`session status --tmux` prints a compact line (empty when idle). Add to
`~/.tmux.conf`:

```tmux
set -g status-right '#(session status --tmux)'
set -g status-interval 5
```

## Agent surface

Every read command accepts `--format text|json|toon` (`--json` is shorthand).
`session context --json` (or `--toon`) returns the full day — categories,
blocks, todo-note contents, ongoing session, and a summary — for an agent to
consume.

## Data

Stored under `~/.local/share/session/` (override with `SESSION_DATA_DIR`):
a SQLite database plus todo notes as markdown files.
```

- [ ] **Step 2: Verify the build and tests once more**

Run: `bun test`
Expected: PASS — all tests green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: add README with tmux and agent usage

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Done

The CLI now supports the full v1 surface: focus sessions (start/pause/resume/
add/done/cancel/reflect/note/list), time blocking (add/move/start/done/skip/rm/
note/list), unified views (agenda/summary/context), setup (category/tag/config),
tmux status output, and JSON/TOON agent output — all over an injected,
deterministic core.

**Deferred to later specs (see the design doc §7):** the hook/notification
system and daemon, app/website blocking, calendar sync (`block_sync` table),
and the opentui UI.

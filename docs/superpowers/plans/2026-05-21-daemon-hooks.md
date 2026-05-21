# Session Daemon & Hook System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a background daemon and a generic hook system so the CLI becomes active — firing events (and user hook scripts) when a session reaches its planned time, is paused too long, or changes lifecycle state.

**Architecture:** Two event emitters, one dispatcher. The CLI emits lifecycle events in-process (`session.started/completed/abandoned`); a polling daemon emits time-based events (`session.timesup`, `session.long-pause`). Both call `Hooks.dispatch`, which runs an executable in the hooks directory with the event JSON on stdin. A `fired_event` table dedups daemon events. Notifications are proven by one example hook, not a subsystem.

**Tech Stack:** TypeScript on Bun, `bun:sqlite`, `bun test`, `Bun.spawn`. Flat namespace-projection modules (`export * as Foo from "./foo"`), `core/` separate from `cli/`.

**Reference spec:** `docs/superpowers/specs/2026-05-21-daemon-hooks-design.md`

---

## File Structure

```
src/core/event/event.ts          Event      — EventName, EventPayload, fromSession builder
src/core/daemon/fired-event.ts   FiredEvent — recordOnce dedup over the fired_event table
src/core/hooks/hooks.ts          Hooks      — dispatch(event, options), drain()
src/core/daemon/detect.ts        Detect     — detectEvents(db, clock): pure, time-based events
src/core/daemon/daemon.ts        Daemon     — tick, run, spawn, spawnArgv, ensureRunning
src/core/daemon/pid.ts           Pid        — daemon.pid read/write/liveness
src/cli/commands/daemon.ts       daemonCommands — daemon start | stop | status
src/cli/commands/hooks.ts        hookCommands   — hooks list | init
```

Modified: `src/core/db/migrations.ts` (migration #2), `src/core/config/config.ts`
(getters), `src/cli/paths.ts` (`hooksDir()`), `src/cli/commands/session.ts`
(emit lifecycle events, merge command groups), `bin/session.ts` (`daemon run`
branch, hook drain, auto-spawn).

**Dependency direction:** `event` depends on `category`/`tag`/`session` types.
`hooks` depends on `event`. `daemon/detect` depends on `event`/`session`/`config`.
`daemon/daemon` depends on `detect`/`fired-event`/`hooks`/`pid`/`config`. `cli`
depends on `core`. No cycles.

---

## Task 1: Event module

**Files:**
- Create: `src/core/event/event.ts`
- Test: `test/core/event/event.test.ts`

- [ ] **Step 1: Write the failing test** — `test/core/event/event.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Event } from "@/core/event/event";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  const tag = Tag.create(db, clock, cat.id, "api");
  const s = Session.start(db, clock, {
    category_id: cat.id,
    tag_id: tag.id,
    intent: "ship it",
    planned_seconds: 1500,
  });
  return { db, clock, s };
}

describe("Event.fromSession", () => {
  test("builds a payload with resolved category and tag names", () => {
    const { db, s } = setup();
    const p = Event.fromSession(db, "session.started", 2000, s);
    expect(p.event).toBe("session.started");
    expect(p.at).toBe(2000);
    expect(p.session_id).toBe(s.id);
    expect(p.category).toBe("work");
    expect(p.tag).toBe("api");
    expect(p.intent).toBe("ship it");
    expect(p.planned_seconds).toBe(1500);
    db.close();
  });
  test("tag is null when the session has none", () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    const cat = Category.create(db, clock, "study");
    const s = Session.start(db, clock, {
      category_id: cat.id,
      planned_seconds: 600,
    });
    const p = Event.fromSession(db, "session.started", 2000, s);
    expect(p.tag).toBeNull();
    db.close();
  });
  test("extra fields are merged into the payload", () => {
    const { db, s } = setup();
    const p = Event.fromSession(db, "session.timesup", 2500, s, {
      elapsed_seconds: 1500,
    });
    expect(p.elapsed_seconds).toBe(1500);
    expect(p.event).toBe("session.timesup");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/event/event.test.ts`
Expected: FAIL — cannot resolve `@/core/event/event`.

- [ ] **Step 3: Write the implementation** — `src/core/event/event.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/event/event.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add event payload types and builder

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration #2 (fired_event) & Config getters

**Files:**
- Modify: `src/core/db/migrations.ts` (append a migration), `src/core/config/config.ts` (DEFAULTS + getters)
- Test: `test/core/db/db.test.ts` (append), `test/core/config/config.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append this test inside the `describe("db", ...)` block in `test/core/db/db.test.ts` (before its closing `});`):

```ts
  test("migration 2 creates the fired_event table", () => {
    const db = open(":memory:");
    const tables = db.raw
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain("fired_event");
    const version = (db.raw.query("PRAGMA user_version").get() as any)
      .user_version;
    expect(version).toBe(2);
    db.close();
  });
```

Append this test inside the `describe("config", ...)` block in `test/core/config/config.test.ts` (before its closing `});`):

```ts
  test("daemon config getters return defaults and honour overrides", () => {
    const db = open(":memory:");
    expect(Config.longPauseSeconds(db)).toBe(1200);
    expect(Config.daemonPollSeconds(db)).toBe(15);
    Config.set(db, "long_pause_seconds", "600");
    Config.set(db, "daemon_poll_seconds", "5");
    expect(Config.longPauseSeconds(db)).toBe(600);
    expect(Config.daemonPollSeconds(db)).toBe(5);
    db.close();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/core/db/db.test.ts test/core/config/config.test.ts`
Expected: FAIL — `user_version` is 1 (not 2); `Config.longPauseSeconds is not a function`.

- [ ] **Step 3: Append migration #2** — in `src/core/db/migrations.ts`, add a second entry to the `MIGRATIONS` array (after the existing first entry, inside the array):

```ts
  `
  CREATE TABLE fired_event (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    event    TEXT NOT NULL,
    ref_id   INTEGER NOT NULL,
    key      TEXT NOT NULL DEFAULT '',
    fired_at INTEGER NOT NULL,
    UNIQUE (event, ref_id, key)
  );
  `,
```

The `MIGRATIONS` array now has two entries; the existing migration runner applies
the new one and bumps `user_version` to 2 automatically.

- [ ] **Step 4: Add Config getters** — in `src/core/config/config.ts`:

Replace the `DEFAULTS` constant with:

```ts
const DEFAULTS: Record<string, string> = {
  default_duration: "1500", // 25 minutes, in seconds
  long_pause_seconds: "1200", // 20 minutes
  daemon_poll_seconds: "15",
};
```

And add these two functions immediately before the final
`export * as Config from "./config";` line:

```ts
export function longPauseSeconds(db: Db): number {
  return parseInt(get(db, "long_pause_seconds") ?? "1200", 10);
}

export function daemonPollSeconds(db: Db): number {
  return parseInt(get(db, "daemon_poll_seconds") ?? "15", 10);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test test/core/db/db.test.ts test/core/config/config.test.ts`
Expected: PASS — all db and config tests green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add fired_event migration and daemon config getters

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: FiredEvent module (dedup)

**Files:**
- Create: `src/core/daemon/fired-event.ts`
- Test: `test/core/daemon/fired-event.test.ts`

- [ ] **Step 1: Write the failing test** — `test/core/daemon/fired-event.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { FiredEvent } from "@/core/daemon/fired-event";

describe("FiredEvent.recordOnce", () => {
  test("returns true the first time, false thereafter", () => {
    const db = open(":memory:");
    expect(FiredEvent.recordOnce(db, "session.timesup", 1, "k", 1000)).toBe(
      true,
    );
    expect(FiredEvent.recordOnce(db, "session.timesup", 1, "k", 1001)).toBe(
      false,
    );
    db.close();
  });
  test("a different key for the same event+ref fires again", () => {
    const db = open(":memory:");
    expect(
      FiredEvent.recordOnce(db, "session.timesup", 1, "planned:1500", 1000),
    ).toBe(true);
    expect(
      FiredEvent.recordOnce(db, "session.timesup", 1, "planned:1800", 1000),
    ).toBe(true);
    db.close();
  });
  test("a different ref_id fires independently", () => {
    const db = open(":memory:");
    expect(FiredEvent.recordOnce(db, "session.long-pause", 1, "", 1000)).toBe(
      true,
    );
    expect(FiredEvent.recordOnce(db, "session.long-pause", 2, "", 1000)).toBe(
      true,
    );
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/daemon/fired-event.test.ts`
Expected: FAIL — cannot resolve `@/core/daemon/fired-event`.

- [ ] **Step 3: Write the implementation** — `src/core/daemon/fired-event.ts`:

```ts
// src/core/daemon/fired-event.ts
import type { Db } from "@/core/db/db";

/** Record that an event occurrence fired. Returns true if it was newly
 *  recorded (the caller should dispatch), false if it had already fired. */
export function recordOnce(
  db: Db,
  event: string,
  refId: number,
  key: string,
  at: number,
): boolean {
  const info = db.raw
    .query(
      "INSERT OR IGNORE INTO fired_event (event, ref_id, key, fired_at) " +
        "VALUES (?, ?, ?, ?)",
    )
    .run(event, refId, key, at);
  return info.changes > 0;
}

export * as FiredEvent from "./fired-event";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/daemon/fired-event.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add fired_event dedup module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Hooks module (dispatch & drain)

**Files:**
- Create: `src/core/hooks/hooks.ts`
- Test: `test/core/hooks/hooks.test.ts`

- [ ] **Step 1: Write the failing test** — `test/core/hooks/hooks.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hooks } from "@/core/hooks/hooks";
import type { EventPayload } from "@/core/event/event";

const dataDir = join(tmpdir(), "session-hooks-test");
const hooksDir = join(dataDir, "hooks");

afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function writeHook(name: string, body: string) {
  mkdirSync(hooksDir, { recursive: true });
  const p = join(hooksDir, name);
  writeFileSync(p, body);
  chmodSync(p, 0o755);
}

const payload: EventPayload = {
  event: "session.timesup",
  at: 1000,
  session_id: 1,
  category: "work",
  tag: "api",
  intent: null,
  planned_seconds: 1500,
};

describe("Hooks.dispatch", () => {
  test("runs the matching hook with the payload as JSON on stdin", async () => {
    const out = join(dataDir, "captured.json");
    writeHook("session.timesup", `#!/bin/sh\ncat > "${out}"\n`);
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    expect(existsSync(out)).toBe(true);
    expect(JSON.parse(readFileSync(out, "utf8")).category).toBe("work");
  });
  test("no hook file is a silent no-op", async () => {
    mkdirSync(hooksDir, { recursive: true });
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    expect(true).toBe(true); // did not throw
  });
  test("a non-executable file is ignored", async () => {
    mkdirSync(hooksDir, { recursive: true });
    const out = join(dataDir, "should-not-exist");
    writeFileSync(
      join(hooksDir, "session.timesup"),
      `#!/bin/sh\ntouch "${out}"\n`,
    ); // not chmod +x
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    expect(existsSync(out)).toBe(false);
  });
  test("a hook exceeding the timeout is killed and dispatch still resolves", async () => {
    const out = join(dataDir, "late.txt");
    writeHook(
      "session.timesup",
      `#!/bin/sh\nsleep 5\ntouch "${out}"\n`,
    );
    const start = Date.now();
    await Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 300,
      log: "stderr",
    });
    expect(Date.now() - start).toBeLessThan(3000);
  });
  test("drain awaits in-flight fire-and-forget dispatches", async () => {
    const out = join(dataDir, "drained.txt");
    writeHook("session.timesup", `#!/bin/sh\ncat > "${out}"\n`);
    void Hooks.dispatch(payload, {
      hooksDir,
      dataDir,
      timeoutMs: 5000,
      log: "stderr",
    });
    await Hooks.drain();
    expect(existsSync(out)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/hooks/hooks.test.ts`
Expected: FAIL — cannot resolve `@/core/hooks/hooks`.

- [ ] **Step 3: Write the implementation** — `src/core/hooks/hooks.ts`:

```ts
// src/core/hooks/hooks.ts
import { existsSync, accessSync, constants, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { EventPayload } from "@/core/event/event";

export interface DispatchOptions {
  hooksDir: string;
  dataDir: string;
  timeoutMs: number;
  log: "daemon" | "stderr";
}

/** In-flight fire-and-forget dispatches, awaited by `drain()`. */
const pending = new Set<Promise<void>>();

function isExecutable(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function runHook(
  event: EventPayload,
  options: DispatchOptions,
): Promise<void> {
  const hookPath = join(options.hooksDir, event.event);
  if (!isExecutable(hookPath)) return;

  const logLine = (s: string): void => {
    if (options.log === "daemon") {
      appendFileSync(join(options.dataDir, "daemon.log"), s + "\n");
    } else {
      process.stderr.write(s + "\n");
    }
  };

  try {
    const proc = Bun.spawn([hookPath], {
      stdin: new Blob([JSON.stringify(event)]),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        SESSION_EVENT: event.event,
        SESSION_DATA_DIR: options.dataDir,
      },
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, options.timeoutMs);
    const exitCode = await proc.exited;
    clearTimeout(timer);
    const stderr = (await new Response(proc.stderr).text()).trim();
    if (timedOut) {
      logLine(`[hook ${event.event}] killed after ${options.timeoutMs}ms`);
    } else if (options.log === "daemon" || exitCode !== 0 || stderr) {
      logLine(`[hook ${event.event}] exit=${exitCode}${stderr ? " " + stderr : ""}`);
    }
  } catch (e) {
    logLine(`[hook ${event.event}] error: ${(e as Error).message}`);
  }
}

/** Run the hook for an event, if one exists. Never throws. The returned promise
 *  is also registered so `drain()` can await fire-and-forget callers. */
export function dispatch(
  event: EventPayload,
  options: DispatchOptions,
): Promise<void> {
  const p = runHook(event, options);
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

/** Await every in-flight dispatch. Called by the CLI entry point before exit. */
export async function drain(): Promise<void> {
  await Promise.allSettled([...pending]);
}

export * as Hooks from "./hooks";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/hooks/hooks.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add hook dispatcher

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Detect module (pure event detection)

**Files:**
- Create: `src/core/daemon/detect.ts`
- Test: `test/core/daemon/detect.test.ts`

- [ ] **Step 1: Write the failing test** — `test/core/daemon/detect.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";
import { Config } from "@/core/config/config";
import { Detect } from "@/core/daemon/detect";

function setup() {
  const db = open(":memory:");
  const clock = fixedClock(1000);
  const cat = Category.create(db, clock, "work");
  return { db, clock, cat };
}

describe("Detect.detectEvents", () => {
  test("no events when nothing is running", () => {
    const { db, clock } = setup();
    expect(Detect.detectEvents(db, clock)).toEqual([]);
    db.close();
  });
  test("no events while an active session is under its planned time", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(600);
    expect(Detect.detectEvents(db, clock)).toEqual([]);
    db.close();
  });
  test("session.timesup fires once the planned time is reached", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(1500);
    const events = Detect.detectEvents(db, clock);
    expect(events.length).toBe(1);
    expect(events[0]!.payload.event).toBe("session.timesup");
    expect(events[0]!.payload.elapsed_seconds).toBe(1500);
    expect(events[0]!.dedup_key).toBe("planned_seconds:1500");
    db.close();
  });
  test("session.long-pause fires after the pause threshold", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    Session.pause(db, clock);
    clock.advance(Config.longPauseSeconds(db) + 10);
    const events = Detect.detectEvents(db, clock);
    expect(events.length).toBe(1);
    expect(events[0]!.payload.event).toBe("session.long-pause");
    db.close();
  });
  test("a short pause produces no event", () => {
    const { db, clock, cat } = setup();
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    Session.pause(db, clock);
    clock.advance(60);
    expect(Detect.detectEvents(db, clock)).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/daemon/detect.test.ts`
Expected: FAIL — cannot resolve `@/core/daemon/detect`.

- [ ] **Step 3: Write the implementation** — `src/core/daemon/detect.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/daemon/detect.test.ts`
Expected: PASS — 5 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add pure time-based event detection

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Daemon tick

**Files:**
- Create: `src/core/daemon/daemon.ts`
- Test: `test/core/daemon/daemon-tick.test.ts`

This task creates `daemon.ts` with `tick`. Task 8 appends `run`/`spawn`/etc.
before the final `export * as Daemon from "./daemon";` line, so that line must
be last.

- [ ] **Step 1: Write the failing test** — `test/core/daemon/daemon-tick.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { Category } from "@/core/category/category";
import { Session } from "@/core/session/session";
import { Daemon } from "@/core/daemon/daemon";

const dataDir = join(tmpdir(), "session-tick-test");
const hooksDir = join(dataDir, "hooks");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function recordingHook(name: string, outFile: string) {
  mkdirSync(hooksDir, { recursive: true });
  const p = join(hooksDir, name);
  writeFileSync(p, `#!/bin/sh\ncat >> "${outFile}"\necho >> "${outFile}"\n`);
  chmodSync(p, 0o755);
}

describe("Daemon.tick", () => {
  test("dispatches a detected event once, then dedups it", async () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    const cat = Category.create(db, clock, "work");
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(1500);
    const out = join(dataDir, "fires.log");
    recordingHook("session.timesup", out);

    await Daemon.tick(db, clock, { hooksDir, dataDir });
    await Daemon.tick(db, clock, { hooksDir, dataDir });

    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines.length).toBe(1); // fired exactly once across two ticks
    db.close();
  });
  test("extending a timed-up session lets timesup fire again", async () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    const cat = Category.create(db, clock, "work");
    Session.start(db, clock, { category_id: cat.id, planned_seconds: 1500 });
    clock.advance(1500);
    const out = join(dataDir, "fires.log");
    recordingHook("session.timesup", out);

    await Daemon.tick(db, clock, { hooksDir, dataDir }); // fires (1500)
    Session.addTime(db, 300); // planned now 1800
    await Daemon.tick(db, clock, { hooksDir, dataDir }); // elapsed 1500 < 1800
    clock.advance(300);
    await Daemon.tick(db, clock, { hooksDir, dataDir }); // fires (1800)

    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    db.close();
  });
  test("a tick with no events does nothing", async () => {
    const db = open(":memory:");
    const clock = fixedClock(1000);
    await Daemon.tick(db, clock, { hooksDir, dataDir });
    expect(existsSync(join(dataDir, "fires.log"))).toBe(false);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/daemon/daemon-tick.test.ts`
Expected: FAIL — cannot resolve `@/core/daemon/daemon`.

- [ ] **Step 3: Write the implementation** — `src/core/daemon/daemon.ts`:

```ts
// src/core/daemon/daemon.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { detectEvents } from "@/core/daemon/detect";
import { FiredEvent } from "@/core/daemon/fired-event";
import { Hooks } from "@/core/hooks/hooks";

export interface TickOptions {
  hooksDir: string;
  dataDir: string;
}

/** One daemon cycle: detect time-based events, dedup against `fired_event`,
 *  and dispatch the newly-recorded ones. */
export async function tick(
  db: Db,
  clock: Clock,
  opts: TickOptions,
): Promise<void> {
  for (const d of detectEvents(db, clock)) {
    const isNew = FiredEvent.recordOnce(
      db,
      d.payload.event,
      d.ref_id,
      d.dedup_key,
      clock.now(),
    );
    if (!isNew) continue;
    await Hooks.dispatch(d.payload, {
      hooksDir: opts.hooksDir,
      dataDir: opts.dataDir,
      timeoutMs: 10000,
      log: "daemon",
    });
  }
}

export * as Daemon from "./daemon";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/daemon/daemon-tick.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add daemon tick

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Pid module

**Files:**
- Create: `src/core/daemon/pid.ts`
- Test: `test/core/daemon/pid.test.ts`

- [ ] **Step 1: Write the failing test** — `test/core/daemon/pid.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Pid } from "@/core/daemon/pid";

const dataDir = join(tmpdir(), "session-pid-test");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

import { mkdirSync } from "node:fs";
function freshDir() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

describe("Pid", () => {
  test("write then read round-trips the metadata", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: 4242,
      started_at: 1000,
      data_dir: dir,
      argv: ["bun", "daemon", "run"],
    });
    const info = Pid.read(dir);
    expect(info?.pid).toBe(4242);
    expect(info?.data_dir).toBe(dir);
  });
  test("read returns null when there is no pid file", () => {
    const dir = freshDir();
    expect(Pid.read(dir)).toBeNull();
  });
  test("liveDaemon returns info for a live process in the same data dir", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: process.pid, // this test process is definitely alive
      started_at: 1000,
      data_dir: dir,
      argv: process.argv,
    });
    expect(Pid.liveDaemon(dir)?.pid).toBe(process.pid);
  });
  test("liveDaemon returns null for a dead pid", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: 999999, // not a live process
      started_at: 1000,
      data_dir: dir,
      argv: [],
    });
    expect(Pid.liveDaemon(dir)).toBeNull();
  });
  test("liveDaemon returns null when the recorded data dir does not match", () => {
    const dir = freshDir();
    Pid.write(dir, {
      pid: process.pid,
      started_at: 1000,
      data_dir: "/some/other/dir",
      argv: [],
    });
    expect(Pid.liveDaemon(dir)).toBeNull();
  });
  test("clear removes the pid file", () => {
    const dir = freshDir();
    Pid.write(dir, { pid: 1, started_at: 0, data_dir: dir, argv: [] });
    Pid.clear(dir);
    expect(existsSync(Pid.pidFilePath(dir))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/core/daemon/pid.test.ts`
Expected: FAIL — cannot resolve `@/core/daemon/pid`.

- [ ] **Step 3: Write the implementation** — `src/core/daemon/pid.ts`:

```ts
// src/core/daemon/pid.ts
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface PidInfo {
  pid: number;
  started_at: number;
  data_dir: string;
  argv: string[];
}

export function pidFilePath(dataDir: string): string {
  return join(dataDir, "daemon.pid");
}

export function read(dataDir: string): PidInfo | null {
  const p = pidFilePath(dataDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PidInfo;
  } catch {
    return null;
  }
}

export function write(dataDir: string, info: PidInfo): void {
  writeFileSync(pidFilePath(dataDir), JSON.stringify(info, null, 2));
}

export function clear(dataDir: string): void {
  const p = pidFilePath(dataDir);
  if (existsSync(p)) rmSync(p);
}

/** Is `pid` a live process? Uses signal 0, which checks existence only. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The PID file is a hint, not authority. A daemon counts as live for this data
 *  dir only when the file exists, records this same data dir, and its process
 *  is alive. A non-matching or dead entry is treated as stale (returns null). */
export function liveDaemon(dataDir: string): PidInfo | null {
  const info = read(dataDir);
  if (!info) return null;
  if (info.data_dir !== dataDir) return null;
  if (!processAlive(info.pid)) return null;
  return info;
}

export * as Pid from "./pid";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/core/daemon/pid.test.ts`
Expected: PASS — 6 pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add daemon pid-file management

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Daemon run loop & CLI daemon commands

**Files:**
- Modify: `src/core/daemon/daemon.ts` (append run/spawn helpers before the namespace line)
- Modify: `src/cli/paths.ts` (add `hooksDir()`)
- Modify: `bin/session.ts` (handle the `daemon run` branch + hook drain)
- Create: `src/cli/commands/daemon.ts`
- Test: `test/cli/daemon-commands.test.ts`

- [ ] **Step 1: Write the failing test** — `test/cli/daemon-commands.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dataDir = join(tmpdir(), "session-daemon-cmd-test");
const env = { ...process.env, SESSION_DATA_DIR: dataDir };
afterEach(() => {
  // best-effort: stop any daemon this test left running
  Bun.spawnSync(["bun", "run", "bin/session.ts", "daemon", "stop"], { env });
  rmSync(dataDir, { recursive: true, force: true });
});

function cli(...args: string[]) {
  const p = Bun.spawnSync(["bun", "run", "bin/session.ts", ...args], { env });
  return {
    code: p.exitCode,
    out: p.stdout.toString() + p.stderr.toString(),
  };
}

async function waitForRunning(): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if (cli("daemon", "status").out.includes("running")) return true;
    await Bun.sleep(100);
  }
  return false;
}

describe("daemon commands", () => {
  test("status reports not running on a fresh data dir", () => {
    expect(cli("daemon", "status").out).toContain("not running");
  });
  test("start launches the daemon, status sees it, stop ends it", async () => {
    expect(cli("daemon", "start").code).toBe(0);
    expect(await waitForRunning()).toBe(true);
    expect(existsSync(join(dataDir, "daemon.pid"))).toBe(true);
    expect(cli("daemon", "stop").out).toContain("stopped");
    expect(cli("daemon", "status").out).toContain("not running");
  });
  test("a second start while running is a no-op", async () => {
    cli("daemon", "start");
    await waitForRunning();
    expect(cli("daemon", "start").out).toContain("already running");
    cli("daemon", "stop");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/daemon-commands.test.ts`
Expected: FAIL — `unknown command: daemon status`.

- [ ] **Step 3: Append run/spawn helpers to `src/core/daemon/daemon.ts`**

Add this import at the top of `src/core/daemon/daemon.ts`, with the others:

```ts
import { Pid } from "@/core/daemon/pid";
import { Config } from "@/core/config/config";
```

Insert these functions immediately before the final
`export * as Daemon from "./daemon";` line:

```ts
export interface RunOptions {
  dataDir: string;
  hooksDir: string;
}

/** The argv needed to re-launch this program as `daemon run`, correct for both
 *  `bun run bin/session.ts` (dev) and the compiled standalone binary. */
export function spawnArgv(): string[] {
  const execPath = process.execPath;
  const isCompiled = !/[\\/]bun(\.exe)?$/.test(execPath);
  return isCompiled
    ? [execPath, "daemon", "run"]
    : [execPath, Bun.main, "daemon", "run"];
}

/** Spawn a detached daemon process. Returns its OS pid. */
export function spawn(dataDir: string): number {
  const proc = Bun.spawn(spawnArgv(), {
    env: { ...process.env, SESSION_DATA_DIR: dataDir },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  proc.unref();
  return proc.pid;
}

/** Spawn a daemon only if none is already live for this data dir. */
export function ensureRunning(dataDir: string): void {
  if (Pid.liveDaemon(dataDir)) return;
  Pid.clear(dataDir); // drop any stale file
  spawn(dataDir);
}

/** The foreground watch loop. Writes the PID file, then ticks until killed. */
export async function run(
  db: Db,
  clock: Clock,
  opts: RunOptions,
): Promise<void> {
  Pid.write(opts.dataDir, {
    pid: process.pid,
    started_at: clock.now(),
    data_dir: opts.dataDir,
    argv: process.argv,
  });
  const cleanup = (): void => {
    Pid.clear(opts.dataDir);
    process.exit(0);
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  const pollMs = Config.daemonPollSeconds(db) * 1000;
  for (;;) {
    await tick(db, clock, { hooksDir: opts.hooksDir, dataDir: opts.dataDir });
    await Bun.sleep(pollMs);
  }
}
```

- [ ] **Step 4: Add `hooksDir()` to `src/cli/paths.ts`**

Add this function to `src/cli/paths.ts` (after `notesDir`):

```ts
export function hooksDir(): string {
  const dir = join(dataDir(), "hooks");
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

- [ ] **Step 5: Write `src/cli/commands/daemon.ts`**

```ts
// src/cli/commands/daemon.ts
import { dirname } from "node:path";
import { Pid } from "@/core/daemon/pid";
import { Daemon } from "@/core/daemon/daemon";
import type { Command } from "@/cli/registry";
import type { CommandDeps } from "@/cli/commands/session";

export function daemonCommands(deps: CommandDeps): Command[] {
  // notesDir is always <dataDir>/notes, so its parent is the data dir.
  const dataDir = dirname(deps.notesDir);
  return [
    {
      name: "daemon start",
      summary: "start the background daemon",
      run: (ctx) => {
        const live = Pid.liveDaemon(dataDir);
        if (live) {
          ctx.print(`daemon already running (pid ${live.pid})\n`);
          return 0;
        }
        Pid.clear(dataDir);
        const pid = Daemon.spawn(dataDir);
        ctx.print(`daemon started (pid ${pid})\n`);
        return 0;
      },
    },
    {
      name: "daemon stop",
      summary: "stop the background daemon",
      run: (ctx) => {
        const live = Pid.liveDaemon(dataDir);
        if (!live) {
          Pid.clear(dataDir);
          ctx.print("daemon not running\n");
          return 0;
        }
        try {
          process.kill(live.pid, "SIGTERM");
        } catch {
          // already gone
        }
        Pid.clear(dataDir);
        ctx.print(`daemon stopped (pid ${live.pid})\n`);
        return 0;
      },
    },
    {
      name: "daemon status",
      summary: "show whether the daemon is running",
      run: (ctx) => {
        const live = Pid.liveDaemon(dataDir);
        if (live) {
          ctx.print(`running (pid ${live.pid})\n`);
        } else {
          ctx.print("not running\n");
        }
        return 0;
      },
    },
  ];
}
```

- [ ] **Step 6: Wire `bin/session.ts`** — overwrite `bin/session.ts` with:

```ts
#!/usr/bin/env bun
import { open } from "@/core/db/db";
import { systemClock } from "@/core/clock/clock";
import { dbPath, notesDir, dataDir, hooksDir } from "@/cli/paths";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { VERSION } from "@/version";
import { Daemon } from "@/core/daemon/daemon";
import { Hooks } from "@/core/hooks/hooks";

const argv = process.argv.slice(2);

if (argv[0] === "--version" || argv[0] === "-v") {
  process.stdout.write(VERSION + "\n");
  process.exit(0);
}

// Internal: the foreground daemon watch loop. Never returns under normal use.
if (argv[0] === "daemon" && argv[1] === "run") {
  const ddb = open(dbPath());
  await Daemon.run(ddb, systemClock(), {
    dataDir: dataDir(),
    hooksDir: hooksDir(),
  });
  process.exit(0);
}

const db = open(dbPath());
const code = dispatch(
  commands({ db, clock: systemClock(), notesDir: notesDir() }),
  argv,
  (s) => process.stdout.write(s),
);
await Hooks.drain();
// `session start` makes the daemon available without an explicit `daemon start`.
if (argv[0] === "start" && code === 0) {
  Daemon.ensureRunning(dataDir());
}
db.close();
process.exit(code);
```

- [ ] **Step 7: Register the daemon commands** — in `src/cli/commands/session.ts`,
add this import with the other command-group imports at the top:

```ts
import { daemonCommands } from "@/cli/commands/daemon";
```

and add `...daemonCommands(deps)` to the array returned by the `commands`
factory (alongside the existing `...sessionCommands(deps)`,
`...blockCommands(deps)`, `...viewCommands(deps)`, `...setupCommands(deps)`).

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test test/cli/daemon-commands.test.ts`
Expected: PASS — 3 pass. Then run `bun test` and confirm the whole suite is
green (no regressions).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add daemon run loop and daemon CLI commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CLI hooks commands & example hook

**Files:**
- Create: `src/cli/commands/hooks.ts`
- Modify: `src/cli/commands/session.ts` (register the hooks commands)
- Test: `test/cli/hooks-commands.test.ts`

- [ ] **Step 1: Write the failing test** — `test/cli/hooks-commands.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import { rmSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";

const dataDir = join(tmpdir(), "session-hooks-cmd-test");
const notesDir = join(dataDir, "notes");
const hooksDir = join(dataDir, "hooks");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function setup() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(notesDir, { recursive: true });
  const db = open(":memory:");
  const cmds = commands({ db, clock: fixedClock(1000), notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { run };
}

describe("hooks commands", () => {
  test("hooks init installs an executable example hook", () => {
    const { run } = setup();
    expect(run(["hooks", "init"]).code).toBe(0);
    const sample = join(hooksDir, "session.timesup.sample");
    expect(existsSync(sample)).toBe(true);
    // executable bit set so renaming it activates it directly
    expect(statSync(sample).mode & 0o111).not.toBe(0);
  });
  test("hooks list shows every event and whether a hook is active", () => {
    const { run } = setup();
    run(["hooks", "init"]);
    const out = run(["hooks", "list"]).out;
    expect(out).toContain("session.timesup");
    expect(out).toContain("session.started");
    // the .sample is not active (only the exact event name counts)
    expect(out).toContain("session.timesup");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/hooks-commands.test.ts`
Expected: FAIL — `unknown command: hooks init`.

- [ ] **Step 3: Write `src/cli/commands/hooks.ts`**

```ts
// src/cli/commands/hooks.ts
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  accessSync,
  constants,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Command } from "@/cli/registry";
import type { CommandDeps } from "@/cli/commands/session";

const EVENTS = [
  "session.started",
  "session.completed",
  "session.abandoned",
  "session.timesup",
  "session.long-pause",
];

/** Example hook installed by `hooks init` as session.timesup.sample. */
const TIMESUP_SAMPLE = `#!/bin/sh
# Example "session.timesup" hook.
#
# The daemon runs this when a focus session reaches its planned duration.
# The full event is JSON on stdin; $SESSION_EVENT holds the event name.
# Rename this file to "session.timesup" (drop ".sample") to activate it.

cat >/dev/null   # consume the JSON payload
osascript -e 'display notification "Your focus session has reached its planned time." with title "Session"'
`;

function isExecutable(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function hookCommands(deps: CommandDeps): Command[] {
  const hooksDir = join(dirname(deps.notesDir), "hooks");
  return [
    {
      name: "hooks init",
      summary: "install example hook scripts into the hooks directory",
      run: (ctx) => {
        mkdirSync(hooksDir, { recursive: true });
        const sample = join(hooksDir, "session.timesup.sample");
        writeFileSync(sample, TIMESUP_SAMPLE);
        chmodSync(sample, 0o755);
        ctx.print(`installed ${sample}\n`);
        ctx.print(
          'rename it to "session.timesup" (drop ".sample") to activate it\n',
        );
        return 0;
      },
    },
    {
      name: "hooks list",
      summary: "list hook events and whether each has an active hook",
      run: (ctx) => {
        ctx.print(`hooks directory: ${hooksDir}\n`);
        for (const event of EVENTS) {
          const active = isExecutable(join(hooksDir, event));
          ctx.print(`  ${event.padEnd(22)} ${active ? "active" : "—"}\n`);
        }
        return 0;
      },
    },
  ];
}
```

- [ ] **Step 4: Register the hooks commands** — in `src/cli/commands/session.ts`,
add this import with the other command-group imports:

```ts
import { hookCommands } from "@/cli/commands/hooks";
```

and add `...hookCommands(deps)` to the array returned by the `commands` factory.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test test/cli/hooks-commands.test.ts`
Expected: PASS — 2 pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: add hooks list/init commands and example hook

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: CLI lifecycle event emission

**Files:**
- Modify: `src/cli/commands/session.ts` (emit events from start/done/cancel)
- Test: `test/cli/lifecycle-hooks.test.ts`

The `start`, `done`, and `cancel` commands dispatch lifecycle events through the
same hook system. `Hooks.dispatch` is called fire-and-forget (the command `run`
stays synchronous); `bin/session.ts` already calls `Hooks.drain()` before exit,
and tests call `Hooks.drain()` themselves.

- [ ] **Step 1: Write the failing test** — `test/cli/lifecycle-hooks.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test";
import {
  rmSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { open } from "@/core/db/db";
import { fixedClock } from "@/core/clock/clock";
import { dispatch } from "@/cli/registry";
import { commands } from "@/cli/commands/session";
import { Hooks } from "@/core/hooks/hooks";

const dataDir = join(tmpdir(), "session-lifecycle-test");
const notesDir = join(dataDir, "notes");
const hooksDir = join(dataDir, "hooks");
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function setup() {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(notesDir, { recursive: true });
  const db = open(":memory:");
  const cmds = commands({ db, clock: fixedClock(1000), notesDir });
  const run = (argv: string[]) => {
    let out = "";
    const code = dispatch(cmds, argv, (s) => (out += s));
    return { code, out };
  };
  return { run };
}

function recordingHook(event: string, outFile: string) {
  const p = join(hooksDir, event);
  writeFileSync(p, `#!/bin/sh\ncat > "${outFile}"\n`);
  chmodSync(p, 0o755);
}

describe("CLI lifecycle hook emission", () => {
  test("session start fires session.started", async () => {
    const { run } = setup();
    const out = join(dataDir, "started.json");
    recordingHook("session.started", out);
    run(["start", "work", "api", "--for", "25m"]);
    await Hooks.drain();
    expect(existsSync(out)).toBe(true);
    const p = JSON.parse(readFileSync(out, "utf8"));
    expect(p.event).toBe("session.started");
    expect(p.category).toBe("work");
    expect(p.tag).toBe("api");
  });
  test("session done fires session.completed with the reflection", async () => {
    const { run } = setup();
    const out = join(dataDir, "completed.json");
    recordingHook("session.completed", out);
    run(["start", "work", "--for", "25m"]);
    run(["done", "--reflect", "shipped"]);
    await Hooks.drain();
    const p = JSON.parse(readFileSync(out, "utf8"));
    expect(p.event).toBe("session.completed");
    expect(p.reflection).toBe("shipped");
  });
  test("session cancel fires session.abandoned", async () => {
    const { run } = setup();
    const out = join(dataDir, "abandoned.json");
    recordingHook("session.abandoned", out);
    run(["start", "work", "--for", "25m"]);
    run(["cancel"]);
    await Hooks.drain();
    const p = JSON.parse(readFileSync(out, "utf8"));
    expect(p.event).toBe("session.abandoned");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli/lifecycle-hooks.test.ts`
Expected: FAIL — no hook fires; the recording files do not exist.

- [ ] **Step 3: Emit events from the session commands** — in
`src/cli/commands/session.ts`:

Add these imports with the other imports at the top of the file (note: `Session`
is already imported in this file as a namespace, so `Session.Session` is the
session row type):

```ts
import { dirname, join } from "node:path";
import { Event } from "@/core/event/event";
import { Hooks } from "@/core/hooks/hooks";
```

Add this helper immediately after the `resolveCategoryTag` function:

```ts
/** Fire a lifecycle hook for a session, derived from the deps. Fire-and-forget;
 *  bin/session.ts (and tests) await Hooks.drain() to let it finish. */
function emit(
  deps: CommandDeps,
  name: "session.started" | "session.completed" | "session.abandoned",
  session: Session.Session,
  extra: Record<string, unknown> = {},
): void {
  const dataDir = dirname(deps.notesDir);
  const payload = Event.fromSession(
    deps.db,
    name,
    deps.clock.now(),
    session,
    extra,
  );
  void Hooks.dispatch(payload, {
    hooksDir: join(dataDir, "hooks"),
    dataDir,
    timeoutMs: 2000,
    log: "stderr",
  });
}
```

In the `start` command's `run`, immediately after the session is created
(`const s = Session.start(...)`) and before the `if (flag(ctx.flags, "note"))`
block, add:

```ts
        emit(deps, "session.started", s);
```

In the `done` command's `run`, replace:

```ts
        const reflection = str(ctx.flags, "reflect") ?? null;
        Session.complete(db, clock, reflection);
        ctx.print("session completed\n");
        return 0;
```

with:

```ts
        const reflection = str(ctx.flags, "reflect") ?? null;
        const done = Session.complete(db, clock, reflection);
        emit(deps, "session.completed", done, { reflection });
        ctx.print("session completed\n");
        return 0;
```

In the `cancel` command's `run`, replace:

```ts
        Session.abandon(db, clock);
        ctx.print("session abandoned\n");
        return 0;
```

with:

```ts
        const abandoned = Session.abandon(db, clock);
        emit(deps, "session.abandoned", abandoned);
        ctx.print("session abandoned\n");
        return 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/cli/lifecycle-hooks.test.ts`
Expected: PASS — 3 pass.

- [ ] **Step 5: Run the whole suite**

Run: `bun test`
Expected: PASS — every test green across core and cli.

- [ ] **Step 6: Full manual smoke test**

```bash
export SESSION_DATA_DIR=/tmp/session-daemon-smoke
rm -rf $SESSION_DATA_DIR
bun run bin/session.ts hooks init
bun run bin/session.ts hooks list
bun run bin/session.ts daemon start
bun run bin/session.ts daemon status
bun run bin/session.ts start work api --for 25m
bun run bin/session.ts daemon status        # auto-spawn already ran during start
bun run bin/session.ts done --reflect "daemon spec done"
bun run bin/session.ts daemon stop
rm -rf $SESSION_DATA_DIR
```
Expected: `hooks list` shows the five events; `daemon start`/`status`/`stop`
behave; the daemon stays running after `start`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: emit session lifecycle events through the hook system

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Done

The daemon and hook system are complete: a polling daemon (`daemon start|stop|
status`, auto-spawned by `session start`) detects `session.timesup` and
`session.long-pause`; the CLI emits `session.started|completed|abandoned`; all
six paths converge on `Hooks.dispatch`, which runs an executable in the hooks
directory with the event JSON on stdin. `fired_event` guarantees each
time-based event fires once. `hooks init` installs an example `osascript`
notification hook — renaming it to `session.timesup` proves a notification can
be built entirely on the hook system.

**Deferred (see `src/todo.md`):** a configurable notification subsystem,
app/website blocking, launchd integration, daemon self-exit when idle, a status
socket, and multiple scripts per event.

# Session CLI — Core Design (v1)

**Date:** 2026-05-21
**Status:** Approved design — ready for implementation planning
**Scope:** First spec of a multi-spec project. Covers the **session tracker** and
**time blocking** core, plus an agent-facing read surface. Explicitly deferred:
hook/notification system, daemon, app/website blocking, calendar sync, and the
opentui UI layer.

## 1. Overview

A tmux-integratable CLI for focused work, modelled on the "Session" macOS/iOS app.
Two core capabilities:

1. **Session tracker** — start timed focus sessions (Pomodoro-style, 25 min
   default), categorise them, attach optional project tags and todo notes, pause/
   resume, extend mid-session, and record a post-session reflection.
2. **Time blocking** — plan a day as a set of time blocks, each with a category,
   optional tag, and optional todo note; reschedule blocks; start sessions from
   them.

A read surface (structured output everywhere — JSON or TOON — plus a `context`
aggregate) exposes all of this to AI agents.

### Non-goals (deferred to later specs)

- Hook / notification system and the background daemon.
- App / website blocking (depends on the daemon).
- Calendar sync (Google Calendar / CalDAV).
- The opentui terminal UI.

The architecture keeps these cheap to add later (see §7).

## 2. Tech Stack & Conventions

- **Language/runtime:** TypeScript on **Bun**. Matches opencode's patterns (the
  reference codebase) and the future opentui UI.
- **Storage:** local **SQLite** via `bun:sqlite` for structured data; todo notes
  as real markdown files on disk.
- **Output formats:** human text (default), plus **JSON** and **TOON**
  (Token-Oriented Object Notation) for the agent surface. TOON via a small
  encoder dependency; JSON is built in.
- **No server, no daemon.** The CLI is stateless: timer state lives entirely in
  SQLite and elapsed time is computed on read.
- **Module convention (from opencode):** flat top-level exports, no
  `export namespace`. Each module file ends with a self-reexport,
  e.g. `export * as Session from "./session"`. No barrel `index.ts` files.
- **Data locations (XDG, opencode-style):**
  - DB: `~/.local/share/session/session.db`
  - Notes: `~/.local/share/session/notes/<id>.md`
  - Overridable via `SESSION_DATA_DIR` (used by tests).

## 3. Data Model

SQLite. Timestamps are UTC unix-epoch **seconds** (integers); durations are
integer **seconds**.

```
category
  id, name, color, archived, created_at
  — required on every session and block

tag                          (optional; a "project" within a category)
  id, category_id → category, name, archived, created_at

session
  id, category_id → category
  tag_id      → tag           (nullable)
  block_id    → block         (nullable — set if started from a block)
  intent          TEXT        ("state your focus")
  planned_seconds INT         (mutable — this is how "add time" works)
  started_at      INT
  ended_at        INT         (nullable)
  status          TEXT        (active | paused | completed | abandoned)
  note_path       TEXT        (nullable — relative path to a todo.md)
  reflection      TEXT        (nullable — "what did you learn", post-session)
  created_at      INT

session_pause                 (one row per pause; drives accurate elapsed time)
  id, session_id → session, paused_at, resumed_at (nullable)

block                         (a planned time block)
  id, category_id → category
  tag_id      → tag           (nullable)
  title           TEXT
  scheduled_start INT
  scheduled_end   INT
  note_path       TEXT        (nullable)
  status          TEXT        (planned | active | done | skipped)
  created_at      INT

config                        (key/value — e.g. default_duration=1500)
```

### Derived values (never stored)

- `elapsed  = (ended_at ?? now) − started_at − Σ pause durations`
- `remaining = planned_seconds − elapsed`

Computing on read keeps the CLI stateless and daemon-ready.

### Relationship rules

- **Category is required** on every session and block.
- **Tag is optional** (a category may have no tags at all).
- **Todo note is optional** on both sessions and blocks (max one each).
- A session may link to a block (`session.block_id`). The link is
  **one-directional**: a block's worked sessions are found by querying
  `session.block_id`, and a block can have several (start/cancel/restart, or two
  sessions inside one long block).

### Block vs. session: plan vs. actual

A block is the **plan**; a session is the **reality**. They are allowed to
diverge, and that divergence is kept on purpose:

- Starting a session from a block late or early does **not** rewrite the block's
  `scheduled_start` / `scheduled_end`. The session records actual
  `started_at` / `ended_at`; the block keeps its planned times.
- A session may end before or run past the block's scheduled end — the block end
  is only a plan marker.
- The gap between planned and actual times is the raw material for later
  "planned vs. focused" analytics. Blocks are rescheduled only by an explicit
  `block move`.

Block status transitions when worked from a linked session:

- session starts from a block → block `active`
- linked session `completed` → block `done`
- linked session `cancelled` → block reverts to `planned` (slot freed; can retry)

### Calendar-sync forward-compatibility

Calendar sync is deferred. No fields are reserved for it now: adding it later is a
clean, additive migration — a new 1:1 `block_sync` table
(`block_id, provider, calendar_id, external_id, etag, synced_at`) plus, if needed,
an `ALTER TABLE ADD COLUMN updated_at`. Reserving columns today buys nothing, so
the v1 schema stays lean.

## 4. Architecture — Core Modules

Approach: a pure **`core/`** library with a **thin `cli/`** layer on top. The
future opentui UI and the agent surface are additional consumers of the same
`core/`. Every read command can emit structured output (`--format json|toon`)
from day one (the agent surface).

```
core/
  db/        Db        — opens SQLite, runs migrations, query helpers
  clock/     Clock     — single source of "now"; injectable for deterministic tests
  config/    Config    — reads/writes the config table (default_duration, etc.)
  category/  Category  — create, rename, archive, list
  tag/       Tag       — create, rename, archive, list (scoped to a category)
  session/   Session   — start, pause, resume, addTime, complete, abandon, reflect;
                         computes elapsed/remaining from pause rows
  block/     Block     — create, move (reschedule), attach note, link session,
                         mark done/skipped; queries for today / upcoming / active
  note/      Note      — create / open / read the .md files; owns the notes/ dir
  view/      View      — read-only composed queries: status, agenda, summary,
                         context — the shape both the CLI and agent --json consume
```

- Each module is a file (e.g. `core/session/session.ts`) exporting its
  `Interface`, functions, and a self-reexport `export * as Session from "./session"`.
- `Db` and `Clock` are **injected** (passed as parameters), so every module is
  unit-testable with an in-memory DB and a fake clock.
- **`View` is the single read-model.** The `status`, `agenda`, `summary`, and
  `context` commands all render `View` output, and the agent JSON/TOON serializers
  encode the *same* structure. `View` is format-agnostic — it returns plain data;
  serialization (text / JSON / TOON) is purely a CLI-layer concern. One definition
  of "what the world looks like" — CLI and agents never drift.

## 5. CLI Surface

Binary: `session`. Focus-session verbs are top-level; blocks, categories, tags are
grouped subcommands. Commands are table-registered (opencode-style).

```
# ── Focus sessions ───────────────────────────────
session start <category> [tag]   [--for 25m] [--intent "…"] [--note] [--block <id>]
session status                   [--format json|toon] [--tmux]
session pause | resume
session add <duration>           # extend the running session, e.g. `session add 10m`
session done                     [--reflect "…"]   # complete → reflection prompt
session cancel                                     # abandon, no reflection
session reflect [text]                             # set/edit reflection after the fact
session note                                       # open running session's todo.md
session list   [--today|--since <d>|--category <c>|--tag <t>] [--format json|toon]

# ── Time blocking ────────────────────────────────
session block add <category> [tag] --from <time> --to <time> [--title "…"] [--note]
session block move <id> --to <time> [--for <duration>]
session block start <id>                           # start a focus session from a block
session block done <id> | skip <id> | rm <id>
session block note <id>                            # open the block's todo.md

# ── Views ────────────────────────────────────────
session agenda  [--format json|toon]         # unified day: blocks + ongoing + upcoming
session summary [--today|--week] [--format json|toon]          # time-spent breakdown
session context [--format json|toon]         # full agent-facing dump

# ── Setup ────────────────────────────────────────
session category add|list|rename|archive
session tag      add|list|rename|archive <category>
session config   get|set <key> [value]
```

### Parsing

- **Durations:** `25m`, `1h`, `1h30m`, `90` (bare number = minutes).
- **Block times:** absolute `14:00` / `2pm`, or relative `+30m`.

### Agent surface

- Every read command takes `--format <text|json|toon>` (default `text`). `--json`
  is kept as a shorthand for `--format json`.
- **TOON** (Token-Oriented Object Notation) is offered alongside JSON because it
  is markedly more token-efficient for the uniform arrays these commands return
  (`list`, `agenda`, `context`) — the data an agent reads most often.
- `session context` is the one-shot aggregate an agent reads to understand the
  whole day: categories, tags, today's blocks, ongoing/upcoming sessions, recent
  summary — and it inlines todo.md **contents**, not just paths.

### tmux integration

`session status --tmux` prints a compact line (`● work/api 12:34`), or an empty
string when idle. Wired in with `set -g status-right '#(session status --tmux)'`
and a short `status-interval`. tmux's own polling is the refresh loop — no daemon
needed.

### Interactivity

The reflection prompt on `session done` runs only when stdout is a TTY. In a
non-TTY context it requires `--reflect` or is skipped — keeps everything
scriptable.

## 6. Testing Strategy

- **Runner:** `bun test`.
- **Core modules — deterministic unit tests.** `Db` and `Clock` are injected, so
  tests run against in-memory SQLite (`:memory:`) and a **fake clock** advanced by
  hand. Pause/resume/`addTime` math, `elapsed`/`remaining`, and duration-crossing
  are tested with no real waiting and no flakiness.
- **Parsers — table-driven tests.** Duration and block-time parsers are pure
  functions; tested with input→expected tables including malformed-input errors.
- **Migrations.** A test applies all migrations to a fresh DB and asserts the
  resulting schema.
- **CLI layer — integration tests.** Invoke the command table with a temp
  `SESSION_DATA_DIR` against a real on-disk DB; **assert on `--format json`
  output**, not formatted strings. Terminal text formatting is intentionally
  untested (low value, high churn).
- **Serializers.** The JSON and TOON encoders get focused unit tests against
  representative `View` structures (uniform arrays and the nested `context`
  aggregate), confirming both encode the same data faithfully.
- **Process:** TDD — tests written before implementation. No network in v1, so no
  mocking layer.

## 7. How Deferred Features Slot In Later

- **Hooks / notifications / daemon:** session lifecycle already produces clean
  `started`/`ended` state in the DB. A future daemon is a pure addition — a
  watcher loop reading the DB, emitting events, optionally serving instant status
  over a socket. No CLI command changes, because timer state lives in the DB, not
  in daemon memory.
- **App / website blocking:** built on the daemon + hook layer above.
- **Calendar sync:** additive `block_sync` table (see §3); no v1 schema cost.
- **opentui UI:** another consumer of `core/` and the `View` read-model.

## 8. Open Questions

None blocking. Time-spent analytics (`session summary`) ships minimal in v1
(per-category / per-tag totals for today and the week); richer reporting is a
later refinement.

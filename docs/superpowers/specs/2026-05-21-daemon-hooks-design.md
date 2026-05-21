# Session Daemon & Hook System — Design (Spec 2)

**Date:** 2026-05-21
**Status:** Approved design — ready for implementation planning
**Scope:** Second spec of the project. Adds a background **daemon**, a generic
**hook system**, and event detection. Proven with one example notification hook.
Builds on Spec 1 (`2026-05-21-session-cli-core-design.md`).

## 1. Overview

Today the CLI is passive: timer state lives in SQLite and is computed on read,
so nothing happens when a session crosses its planned duration. This spec makes
the tool **active** by adding:

1. A **daemon** — a lightweight background process that polls the database and
   detects time-based events.
2. A **hook system** — a generic mechanism that runs user-provided executable
   scripts when events fire.
3. **Event emission** from both the daemon (time-based events) and the CLI
   (lifecycle events).

Desktop notifications are **not** built as a subsystem here. They are proven by
shipping a single example hook (`osascript`-based) that demonstrates a
notification can be built on top of the hook system. The polished notification
UX is a later pass.

### Non-goals (deferred — see `src/todo.md`)

- A configurable notification subsystem (per-event toggles, sound, richer
  notifications).
- App/website blocking (its own later spec; it builds on this daemon).
- launchd OS-service integration; daemon self-exit when idle; a status socket;
  multiple scripts per event.

## 2. Tech Stack & Conventions

Unchanged from Spec 1: TypeScript on Bun, `bun:sqlite`, `bun test`, flat
namespace-projection modules (`export * as Foo from "./foo"`), the `View`-style
separation of `core/` from `cli/`. The daemon and hook logic live in `core/`;
the CLI commands stay thin.

Paths (under the data dir, `~/.local/share/session/` or `$SESSION_DATA_DIR`):

- `daemon.pid` — the running daemon's PID.
- `daemon.log` — daemon output and hook stdout/stderr.
- `hooks/` — the hook scripts directory.

## 3. Events

Six event types. Each carries a JSON payload: a common `{ event, at }` (event
name, unix-seconds timestamp) plus event-specific fields.

| Event | Emitted by | Payload adds | Fires when |
|---|---|---|---|
| `session.started` | CLI | session fields* | `session start` succeeds |
| `session.completed` | CLI | session fields*, `reflection` | `session done` succeeds |
| `session.abandoned` | CLI | session fields* | `session cancel` succeeds |
| `session.timesup` | daemon | session fields*, `elapsed_seconds` | active session, `elapsed ≥ planned_seconds` |
| `session.long-pause` | daemon | session fields*, `paused_seconds` | paused session, open pause ≥ `long_pause_seconds` |
| `block.starting` | daemon | block fields** | `planned` block, `scheduled_start` within `block_lead_seconds` |

\* session fields: `session_id`, `category`, `tag`, `intent`, `planned_seconds`.
\*\* block fields: `block_id`, `title`, `category`, `tag`, `scheduled_start`,
`scheduled_end`.

### Configuration (in the existing `config` table)

- `long_pause_seconds` — default `1200` (20 min).
- `block_lead_seconds` — default `300` (5 min).
- `daemon_poll_seconds` — default `15`.

## 4. Architecture & Components

```
core/
  event/   Event   — event-name constants and payload type definitions;
                     builders that assemble a payload from a session/block row
  hooks/   Hooks   — dispatch(event, hooksDir): find hooks/<event>, run it with
                     the payload as JSON on stdin; non-blocking, timed out
  daemon/  Daemon  — detectEvents(db, clock): pure function returning the
                     time-based events to fire now; run(): the watch loop
cli/
  commands/daemon.ts — daemon start | stop | status | run
  commands/hooks.ts  — hooks list | init
```

**Two emitters, one dispatcher.**

- The **CLI** emits lifecycle events in-process. After `Session.start` /
  `complete` / `abandon` succeeds, the command calls `Hooks.dispatch`. These
  occur exactly once per action — no dedup needed.
- The **daemon** emits time-based events. Each tick calls `detectEvents`, records
  each event in `fired_event`, and dispatches the ones newly recorded.

Both paths converge on `Hooks.dispatch` — one definition of "run the hook".

### The daemon process

- `session daemon start` spawns the binary itself, detached, running the
  internal `daemon run` loop. It writes `daemon.pid`; it is a no-op if a live
  daemon already exists. The entry point computes the correct self-respawn argv
  for both `bun run` (dev) and the compiled binary.
- `session daemon stop` reads `daemon.pid` and terminates the process.
- `session daemon status` reports whether the daemon is alive (and its PID).
- `session daemon run` is the foreground watch loop: every `daemon_poll_seconds`
  it runs one tick. The tick is `detectEvents` + dispatch; the loop wrapper is a
  thin `setInterval`-style shell.
- The daemon runs until explicitly stopped (no self-exit in v1).

### Auto-spawn

`session start` and `session block add` check `daemon.pid`; if no live daemon is
found, they spawn one. Normal use therefore never requires starting the daemon
by hand, while `daemon start/stop/status` remain available for explicit control.

## 5. Dedup — the `fired_event` table

Migration #2 (appended to `MIGRATIONS`):

```sql
CREATE TABLE fired_event (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event    TEXT NOT NULL,
  ref_id   INTEGER NOT NULL,
  fired_at INTEGER NOT NULL,
  UNIQUE (event, ref_id)
);
```

Before dispatching a daemon-detected event, the daemon does
`INSERT OR IGNORE INTO fired_event ...`. It dispatches only if a row was actually
inserted. This makes each time-based event fire **exactly once**, even if the
daemon restarts.

`ref_id` choice:

- `session.timesup` → the session id.
- `block.starting` → the block id.
- `session.long-pause` → the `session_pause` row id, so resuming and pausing
  again (a new pause row) can legitimately fire a fresh nudge.

CLI lifecycle events are not recorded in `fired_event` — they fire once by
construction.

## 6. The Hook System

- Hooks directory: `<dataDir>/hooks/`.
- One executable file per event, named exactly the event:
  `hooks/session.timesup`, `hooks/block.starting`, etc.
- `Hooks.dispatch(event, hooksDir)`:
  1. Resolve `hooksDir/<event.event>`. If it does not exist or is not
     executable, do nothing.
  2. Run it with the event payload serialized as JSON on **stdin**, the event
     name in the `SESSION_EVENT` environment variable, and `SESSION_DATA_DIR`
     set.
  3. Run it **non-blocking** with a ~10s timeout — a slow or hung hook must not
     stall the daemon tick or a CLI command.
  4. Capture stdout/stderr/exit code to `daemon.log` (daemon path) or stderr
     (CLI path).

### Commands

- `session hooks list` — list the hooks directory: each event, and whether an
  active (executable) hook exists for it.
- `session hooks init` — install example hooks as `hooks/<event>.sample`
  (git-style — inert until renamed to drop `.sample`). The key example,
  `hooks/session.timesup.sample`, reads the event JSON and calls
  `osascript -e 'display notification …'`.

### Proof

Renaming `hooks/session.timesup.sample` → `hooks/session.timesup` makes a real
macOS notification fire when a running session crosses its planned duration.
That is the concrete demonstration that notifications — and anything else — can
be built on the hook system.

## 7. CLI Surface

```
session daemon start            # spawn the daemon (no-op if already running)
session daemon stop             # stop the daemon
session daemon status           # is it running? pid
session daemon run              # internal — the foreground watch loop
session hooks list              # show the hooks directory
session hooks init              # install example .sample hooks
```

`session start` and `session block add` gain auto-spawn behaviour (no new
flags). No other existing command changes.

## 8. Testing

- **`detectEvents`** — pure function; unit-tested with an in-memory DB and a
  fixed clock. Assert exactly which events fire for a given state, and that the
  `fired_event` dedup suppresses re-fires on a second tick.
- **`Hooks.dispatch`** — unit-tested against a temp hooks directory: drop a hook
  script that writes its stdin to a file, dispatch an event, assert the file
  contains the right JSON payload. Also test the no-hook and non-executable
  cases (silent no-op) and the timeout path.
- **CLI emission** — integration test: run `start` / `done` / `cancel` with a
  temp hooks dir and a recording hook; assert the lifecycle events fired with
  correct payloads.
- **`daemon start/stop/status`** — integration test that spawns the real
  process (via `bun run`), asserts the PID lifecycle and that a second `start`
  is a no-op.
- The watch loop wrapper is thin (`detectEvents` + dispatch on an interval);
  coverage focuses on the tick, not the timer.

## 9. Open Questions

None blocking. The example hook targets macOS (`osascript`); Linux/Windows
example hooks are a trivial later addition and do not affect the architecture.

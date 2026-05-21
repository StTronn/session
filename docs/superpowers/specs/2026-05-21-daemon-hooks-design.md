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

- `daemon.pid` — JSON metadata for the running daemon:
  `{ pid, started_at, data_dir, argv }`.
- `daemon.log` — daemon output and hook stdout/stderr.
- `hooks/` — the hook scripts directory.

## 3. Events

Five event types. Each carries a JSON payload: a common `{ event, at }` (event
name, unix-seconds timestamp) plus event-specific fields.

| Event | Emitted by | Payload adds | Fires when |
|---|---|---|---|
| `session.started` | CLI | session fields* | `session start` succeeds |
| `session.completed` | CLI | session fields*, `reflection` | `session done` succeeds |
| `session.abandoned` | CLI | session fields* | `session cancel` succeeds |
| `session.timesup` | daemon | session fields*, `elapsed_seconds` | active session, `elapsed ≥ planned_seconds` |
| `session.long-pause` | daemon | session fields*, `paused_seconds` | paused session, open pause ≥ `long_pause_seconds` |

\* session fields: `session_id`, `category`, `tag`, `intent`, `planned_seconds`.

### Configuration

`long_pause_seconds` (default `1200`, 20 min) and `daemon_poll_seconds`
(default `15`) are **not** seeded into the `config` table by a migration. They
follow the existing Config pattern: entries in the in-code `DEFAULTS` map with
typed getters — `Config.longPauseSeconds(db)`, `Config.daemonPollSeconds(db)` —
that return the stored value if set and the hardcoded default otherwise, exactly
like the existing `Config.defaultDuration`.

## 4. Architecture & Components

```
core/
  event/   Event   — event-name constants and payload type definitions;
                     builders that assemble a payload from a session row
  hooks/   Hooks   — dispatch(event, options): find hooks/<event>, run it with
                     the payload as JSON on stdin; bounded by timeoutMs
  daemon/  Daemon  — detectEvents (pure: state → events); tick (dedup +
                     dispatch + logging); run (the watch loop)
cli/
  commands/daemon.ts — daemon start | stop | status | run
  commands/hooks.ts  — hooks list | init
```

### Daemon function boundary

- **`detectEvents(db, clock): EventPayload[]`** — pure. Reads only the current
  session/pause state and returns the time-based events that are *currently*
  true. It does not touch `fired_event` and has no side effects, so it is
  exhaustively unit-testable with a fixed clock.
- **`tick(db, clock, opts): Promise<void>`** — the side-effecting step: calls
  `detectEvents`, applies `fired_event` dedup (`INSERT OR IGNORE`), dispatches
  the newly-recorded events via `Hooks.dispatch`, and writes to `daemon.log`.
- **`run()`** — the watch loop: invokes `tick` every `daemon_poll_seconds`.

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
- `session daemon stop` reads `daemon.pid`, verifies that the PID still appears
  to be this session daemon for the same data dir, and only then terminates the
  process.
- `session daemon status` reports whether the daemon is alive (and its PID).
- `session daemon run` is the foreground watch loop: every `daemon_poll_seconds`
  it runs one tick. The tick is `detectEvents` + dispatch; the loop wrapper is a
  thin `setInterval`-style shell.
- The daemon runs until explicitly stopped (no self-exit in v1).

### PID-file safety

The PID file is treated as a hint, not authority. PID reuse is possible, so
`daemon start`, `daemon stop`, and `daemon status` must validate liveness by
checking both that the process exists and that its command line looks like this
daemon running against the same `SESSION_DATA_DIR`.

If `daemon.pid` points at no live process, or at a live process that does not
match this daemon, the file is stale. `daemon start` may replace a stale file;
`daemon status` should report it as stale/not running; `daemon stop` must not
kill an unrelated process.

To avoid double-spawn races from two foreground commands starting at the same
time, daemon startup should claim the PID file atomically where practical
(create-or-replace only after stale validation). If two starts race, at most one
daemon should remain authoritative for a data dir.

### Auto-spawn

`session start` checks `daemon.pid`; if no live daemon is found, it spawns one.
Normal use therefore never requires starting the daemon by hand, while
`daemon start/stop/status` remain available for explicit control. Block-based
daemon events are deferred to a later spec, so `session block add` does not
auto-spawn the daemon in this version.

## 5. Dedup — the `fired_event` table

Migration #2 (appended to `MIGRATIONS`):

```sql
CREATE TABLE fired_event (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  event    TEXT NOT NULL,
  ref_id   INTEGER NOT NULL,
  key      TEXT NOT NULL DEFAULT '',
  fired_at INTEGER NOT NULL,
  UNIQUE (event, ref_id, key)
);
```

Before dispatching a daemon-detected event, the daemon does
`INSERT OR IGNORE INTO fired_event ...`. It dispatches only if a row was actually
inserted. This makes each time-based event occurrence fire **exactly once**,
even if the daemon restarts.

`ref_id` and `key` choice:

- `session.timesup` → `ref_id` is the session id; `key` is
  `planned_seconds:<value>`. This means the first time-up event for a planned
  duration fires once, but if the user extends the session (`session add 5m`) and
  later crosses the new planned duration, a fresh `session.timesup` can fire.
- `session.long-pause` → `ref_id` is the `session_pause` row id and `key` is
  empty, so resuming and pausing again (a new pause row) can legitimately fire a
  fresh nudge.

CLI lifecycle events are not recorded in `fired_event` — they fire once by
construction.

## 6. The Hook System

- Hooks directory: `<dataDir>/hooks/`.
- One executable file per event, named exactly the event:
  `hooks/session.timesup`, `hooks/session.long-pause`, etc.
- `Hooks.dispatch(event, options)` where
  `options = { hooksDir, dataDir, timeoutMs, log: "daemon" | "stderr" }`:
  1. Resolve `hooksDir/<event.event>`. If it does not exist or is not
     executable, do nothing.
  2. Run it with the event payload serialized as JSON on **stdin**, the event
     name in the `SESSION_EVENT` environment variable, and `SESSION_DATA_DIR`
     set to `dataDir`.
  3. Bound the run by `timeoutMs`. On timeout, kill the hook and continue.
  4. Route the hook's stdout/stderr/exit code by `log`:
     - `"daemon"` — append stdout/stderr/exit code to `daemon.log`.
     - `"stderr"` — write failures (non-zero exit, timeout, hook stderr) to the
       process's stderr; ignore hook stdout.

The single `options` object removes any ambiguity between the daemon and CLI
paths. The daemon dispatches with `{ log: "daemon", timeoutMs: 10000 }`; the CLI
dispatches lifecycle hooks with `{ log: "stderr", timeoutMs: 2000 }`.

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

`session start` gains auto-spawn behaviour (no new flags). No other existing
command changes.

## 8. Testing

- **`detectEvents`** — pure function; unit-tested with an in-memory DB and a
  fixed clock. Assert exactly which events fire for a given state. It does not
  read or write `fired_event`.
- **daemon tick** — integration-ish core test around `detectEvents` + dedup +
  dispatch. Assert `fired_event` suppresses re-fires on a second tick, and that
  extending a timed-up session creates a new `session.timesup` occurrence keyed
  by the new planned duration.
- **daemon PID lifecycle** — unit/integration tests for stale PID files, PID
  metadata parsing, same-data-dir process validation, and the no-op behavior of
  a second `daemon start` when a valid daemon is already running.
- **`Hooks.dispatch`** — unit-tested against a temp hooks directory: drop a hook
  script that writes its stdin to a file, dispatch an event, assert the file
  contains the right JSON payload. Also test the no-hook and non-executable
  cases (silent no-op) and the timeout path.
- **CLI emission** — integration test: run `start` / `done` / `cancel` with a
  temp hooks dir and a recording hook; assert the lifecycle events fired with
  correct payloads.
- **`daemon start/stop/status`** — end-to-end integration test that spawns the
  real process (via `bun run`) and verifies the command surface around the PID
  lifecycle covered above.
- The watch loop wrapper is thin (`detectEvents` + dispatch on an interval);
  coverage focuses on the tick, not the timer.

## 9. Open Questions

None blocking. The example hook targets macOS (`osascript`); Linux/Windows
example hooks are a trivial later addition and do not affect the architecture.

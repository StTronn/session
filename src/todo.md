# Session — TODO & Roadmap

## Agent skill
Create a skill for the productivity-manager agent to drive Session (read
`context`, start/stop sessions, manage blocks).

## TUI (opentui)
A terminal UI over the existing core: a calendar view for time blocks, a view of
when work happened, weekly/daily graphs colour-coded by category.

## Roadmap — larger features (each its own spec → plan → build)

- **App / website blocking** — the signature feature of the original Session
  app: block distracting apps and websites during a focus session, restore them
  when it ends. Builds directly on the daemon being designed now (needs a
  running process to enforce). Natural next spec after daemon/hooks.
- **Calendar sync** — two-way sync of time blocks with Google Calendar / CalDAV.
  The 1:1 `block_sync` table is already planned in the v1 design doc (§3).
- **Richer analytics** — `summary` is minimal today (per-category/tag totals for
  today/week). Expand into real reporting: streaks, trends, per-day breakdowns,
  category graphs.
- **v0.1.x polish** — dogfooding papercuts, e.g. `session list`'s "no sessions"
  message when an active (un-finished) session exists.

## Deferred design options (daemon / hooks / notifications spec)

Alternatives surfaced while designing the daemon spec — chosen against for now.

### Daemon lifecycle
- **launchd OS service** — `session daemon install` writes a macOS LaunchAgent
  so the OS keeps the daemon always running and restarts it on crash/login.
  Deferred: macOS-specific, more install machinery. The chosen approach
  (explicit `daemon` commands + auto-spawn) upgrades to this later cleanly.
- **Daemon self-exit when idle** — shut down when there's no active session and
  no upcoming blocks, re-spawn on next use. Deferred: idle cost is near-zero.

### Hooks
- **Multiple scripts per event** — a `hooks/<event>.d/` directory whose
  executables all run. v1 ships one executable file per event.

### Notifications
- **Full notification subsystem** — per-event enable/disable config, sound,
  click actions, `terminal-notifier` for richer notifications. v1 only ships a
  single example notification hook (osascript) to prove the hook system works.

### Daemon extras
- **Status socket** — daemon serves instant `status` reads over a unix socket
  (design doc §7). Deferred: direct DB reads are already fast enough.

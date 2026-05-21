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

Every read command accepts `--format text|json|toon` (`--json` and `--toon`
are shorthands). `session context --json` (or `--toon`) returns the full day —
categories, blocks, todo-note contents, ongoing session, and a summary — for an
agent to consume.

## Data

Stored under `~/.local/share/session/` (override with `SESSION_DATA_DIR`):
a SQLite database plus todo notes as markdown files.

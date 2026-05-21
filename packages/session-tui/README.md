# Session TUI

OpenTUI package for terminal dashboards over the Session core.

Run directly:

```bash
bun run --cwd packages/session-tui start
```

Run in a tmux popup:

```bash
tmux display-popup -E -w 90% -h 85% 'bun run --cwd packages/session-tui start'
```

Suggested tmux binding:

```tmux
bind-key S display-popup -E -w 90% -h 85% 'bun run --cwd /Users/rishav/projects/session/packages/session-tui start'
```

This package should stay as a consumer of `src/core/*` read models and commands.
Do not put business logic or ad hoc SQL in TUI components.

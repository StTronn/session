# session

A tmux-integratable CLI focus tracker with day-level time blocking and a
JSON/TOON read surface for AI agents.

## Install

Download the prebuilt binary for your platform — no Bun or Node required:

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | sh
```

This fetches the right binary from the latest GitHub Release and installs it to
`~/.local/bin/session`. You can also download a binary manually from the
[Releases page](https://github.com/OWNER/REPO/releases) — `session-macos-arm64`,
`session-macos-x64`, `session-linux-x64`, or `session-windows-x64.exe` — then
`chmod +x` it and move it onto your `PATH`.

## Quick start

```bash
session start work api --for 25m      # start a focus session
session status                        # see the running session
session add 10m                       # extend it
session done --reflect "what I did"   # finish + record a reflection

session block add work --from 14:00 --to 15:00 --title "review"
session agenda                        # today's plan
session summary --week                # time spent
session --version                     # print the version
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

## Build from source

Requires [Bun](https://bun.sh).

```bash
bun install
bun test                       # run the test suite
bun run bin/session.ts help    # run without installing
bun link                       # expose `session` globally for development
```

## Building & releasing

```bash
bun run build       # compile a standalone binary for this platform → dist/session
bun run build:all   # cross-compile macOS/Linux/Windows binaries → dist/
```

The compiled binary bundles the Bun runtime, so end users need nothing installed.

To cut a release: bump `version` in `package.json`, update `CHANGELOG.md`,
commit, then push a tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

The `release` GitHub Actions workflow runs the tests, cross-compiles every
platform binary, and publishes a GitHub Release with the binaries attached.

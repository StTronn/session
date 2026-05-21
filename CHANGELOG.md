# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-05-21

### Added
- Focus session tracking: `start`, `status`, `pause`, `resume`, `add`, `done`,
  `cancel`, `reflect`, `note`, `list`.
- Day-level time blocking: `block add`, `move`, `start`, `done`, `skip`, `rm`,
  `note`, `list`.
- Unified views: `agenda`, `summary`, `context`.
- Setup commands: `category`, `tag`, `config`, `version`.
- `--format text|json|toon` on every read command — the agent-facing surface.
- tmux status line via `session status --tmux`.
- Local SQLite storage with todo notes kept as markdown files.

# Design: session-tui terminal-native restyle

**Date:** 2026-05-21
**Topic:** Restyle `packages/session-tui` to a flat, terminal-theme-adaptive UI

## Problem

The current TUI looks unlike a native terminal app. It uses box/border-heavy
"cards" (bordered `StatsCard`, `BarGraph`, `CategoryTable`), a vertical icon
sidebar rail, and bordered period-switcher buttons. Colors are fixed hex codes
that ignore the user's terminal colorscheme.

The goal is the look of the reference "Analysis" dashboard: flat sections with
cyan headers, hairline rule separators, plain `key: value` rows, emphasized
values, and colors that adapt to whatever terminal theme the user runs.

## Key decisions

- **Colors — hybrid.** ANSI palette colors for all structural UI so it tracks
  the terminal theme; a small fixed-hex set kept only for category hues that
  must stay visually distinct.
- **Navigation — top nav row.** Drop the icon sidebar; a flat top row shows
  Day / Week / Month with the active period highlighted.
- **Daily graph — tall column chart.** Multi-row vertical columns with
  fractional block characters.

## Color system

opentui (`@opentui/core` 0.2.15) supports indexed/default color intents:

- `RGBA.fromIndex(n)` — an ANSI palette color; the terminal renders it as a
  palette code, so it remaps to the user's colorscheme.
- `RGBA.defaultForeground()` — the terminal's own default text color.
- React color props (`fg`, `borderColor`, `backgroundColor`) accept `RGBA`
  objects as well as strings.

`theme/theme.ts` is rewritten. `TuiTheme` field type changes from `string` to
`ColorInput` (`string | RGBA`).

| Token     | Source                       | Role                          |
|-----------|------------------------------|-------------------------------|
| `bg`      | `"transparent"`              | terminal background shows through |
| `text`    | `RGBA.defaultForeground()`   | body text                     |
| `value`   | `fromIndex(15)` bright white | emphasized numbers            |
| `muted`   | `fromIndex(7)` white         | labels                        |
| `dim`     | `fromIndex(8)` bright black  | faint text, hairline rules    |
| `border`  | `fromIndex(8)` bright black  | hairline rules                |
| `accent`  | `fromIndex(6)` cyan          | section headers, highlights, bars |
| `warning` | `fromIndex(11)` bright yellow| streak / special values       |
| `danger`  | `fromIndex(9)` bright red    | current-hour marker           |

Notes:
- The `mode: "dark" | "light"` parameter of `terminalTheme()` is removed —
  indexed colors adapt automatically, so no light/dark hex branching is needed.
- `SESSION_TUI_ACCENT` env override is still honored: if set, `parseColor` it;
  otherwise use ANSI cyan.
- `categoryColors` stays a fixed-hex array of 6 distinct hues.
- `TuiTheme` drops the unused `panel` / `panelAlt` fields and adds `value`.

## Layout

```
 Day   [ Week ]   Month                          Mon, May 21
────────────────────────────────────────────────────────────
 Summary                          Time Blocks · Mon 21
 Total Focus    4h 30m            09:00  █ 09:00-10:30 api
 Avg / day      1h 12m            10:00
 Current        api · 18m         11:00  █ 11:00-12:00 review
                                  12:00
 Daily Distribution    max 3h     ...
         █
      ▅  █     ▇
   ▃  █  █  ▂  █  ▁
   █  █  █  █  █  █  ▄
   M  T  W  T  F  S  S
   1h 2h 2h 30m 3h 10m 1h

 Categories
 ● work       ▇▇▇▇▇▇▇▇░░  2h 10m
 ● reading    ▇▇▇░░░░░░░    50m

 1 day · 2 week · 3 month · ←/→ · q quit
```

- No card borders anywhere. Sections are separated by hairline rules and blank
  rows. A hairline is a `<box borderBottom borderColor={theme.border} />`,
  which auto-spans its container width.
- Two columns separated by whitespace gap (no `borderLeft`).
- Emphasized values use opentui's React bold tag `<strong>`.

## Components

### New: `components/primitives.tsx`

Small reusable building blocks (matches the todo.md goal of reusable TUI
primitives):

- `SectionHeader({ label, theme, right? })` — cyan label, optional dim
  right-aligned text on the same row (e.g. `max 3h`).
- `Rule({ theme })` — full-width hairline (`<box borderBottom>`).
- `Row({ label, value, theme, valueColor? })` — a `key: value` line with the
  label in `muted` and the value bold in `value` (or `valueColor`).

### `theme/theme.ts`

Rewrite per the color table above.

### `components/AppShell.tsx`

Remove the icon sidebar rail. Becomes a full-width, transparent, padded
container that renders its children.

### `components/PeriodSwitcher.tsx`

Flat top nav row: `Day  Week  Month` — active period in `accent` + bold,
inactive in `dim` — with the period `title` right-aligned. A `Rule` underneath.

### `components/StatsCard.tsx`

Flat `Summary` section: `SectionHeader` + three `Row`s (Total Focus, Avg / day,
Current). No border. Active session value uses `accent`; "No active session"
uses `dim`.

### `components/BarGraph.tsx`

Flat `Daily Distribution` section. Tall vertical column chart:

- Fixed render height of `COLUMN_ROWS` rows (5).
- Per day, `eighths = round(value / max * COLUMN_ROWS * 8)`. Each cell is a
  space (empty), a fractional block (`▁▂▃▄▅▆▇█`, the partial top cell), or a
  full `█`.
- Columns rendered top-to-bottom so heights read upward.
- All columns use `accent`; the current day's column is bold (`<strong>`).
- Below each column: weekday initial (`dim`) and the duration (`muted`).
- `SectionHeader` right slot shows `max <duration>`.
- Empty period (max ≤ 0 / no data) renders an unobtrusive `dim` empty state.

### `components/CategoryTable.tsx`

Flat `Categories` section. Each category is one row: colored `●` + name,
a thin horizontal bar, and the bold duration.

- Bar width `BAR_WIDTH` (10). Filled length = `round(seconds / maxSeconds *
  BAR_WIDTH)`, drawn with `▇` in the category color, remainder `░` in `dim`.
- Existing empty state ("No completed focus sessions in this period") kept,
  styled `dim`.

### `components/CalendarTimeline.tsx`

Flat `Time Blocks · <day>` section. Drop `borderLeft`. Drop the heavy
per-hour `borderBottom` rules — hour rows are plain, indented; the hour label
is `dim`, the current hour `danger`. Blocks keep their category color.

### `App.tsx`

- Call `terminalTheme()` (no `themeMode` argument).
- Replace the bordered period switcher area; place `PeriodSwitcher` as the top
  nav. Two columns with a whitespace gap, each a stack of flat sections
  separated by `Rule`s and blank rows.
- Compact mode keeps `StatsCard` + `BarGraph`; both restyle automatically.

## Out of scope

- No new data/metrics, no read-model changes.
- No new period modes or keybindings.
- Category colors remain fixed hex (not converted to ANSI).

## Testing / verification

- `bun test` must stay green (TUI restyle should not touch tested core code).
- Manual: `bun run tui` and `bun run tui --compact`, eyeballed against the
  reference, in both a dark and a light terminal theme to confirm the indexed
  colors adapt.

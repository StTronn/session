# session-tui Terminal-Native Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `packages/session-tui` into a flat, terminal-theme-adaptive UI matching the reference "Analysis" dashboard.

**Architecture:** Replace fixed-hex colors with opentui ANSI indexed colors (`RGBA.fromIndex`) so the UI tracks the user's terminal colorscheme. Drop all card borders and the icon sidebar in favor of flat sections built from three shared primitives (`SectionHeader`, `Rule`, `Row`). Daily activity becomes a tall fractional-block column chart; categories get thin horizontal accent bars. Pure chart math is extracted into a tested `chart.ts` module.

**Tech Stack:** Bun, React 19, `@opentui/react` / `@opentui/core` 0.2.15, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-21-tui-terminal-restyle-design.md`

**Branch:** work on the current branch `feat/daemon-hooks`. Commit with plain `git`.

**Environment note:** `bun` is not on `PATH` in non-interactive shells. Use the absolute path `~/.bun/bin/bun` in every command below.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/session-tui/src/theme/theme.ts` | ANSI-indexed color tokens (modify) |
| `packages/session-tui/src/components/chart.ts` | Pure chart math: column cells, bar fill (create) |
| `packages/session-tui/src/components/chart.test.ts` | Tests for chart math (create) |
| `packages/session-tui/src/components/primitives.tsx` | `SectionHeader`, `Rule`, `Row` (create) |
| `packages/session-tui/src/components/AppShell.tsx` | Flat full-width container, no sidebar (modify) |
| `packages/session-tui/src/components/PeriodSwitcher.tsx` | Flat top nav row (modify) |
| `packages/session-tui/src/components/StatsCard.tsx` | Flat "Summary" section (modify) |
| `packages/session-tui/src/components/BarGraph.tsx` | Tall column chart (modify) |
| `packages/session-tui/src/components/CategoryTable.tsx` | Flat section + horizontal bars (modify) |
| `packages/session-tui/src/components/CalendarTimeline.tsx` | Flat timeline, no left border (modify) |
| `packages/session-tui/src/App.tsx` | Layout wiring (modify) |

**Per-task verification command** (the "build smoke check") — confirms the bundle still compiles:

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: ends with a bundle summary (`[N] bundled ...`) and no `error:` lines.

---

## Task 1: ANSI-indexed color theme

**Files:**
- Modify: `packages/session-tui/src/theme/theme.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/theme/theme.ts` with:

```ts
import { RGBA, parseColor } from "@opentui/core";

/** A color accepted by opentui props: a CSS/hex string or an RGBA object. */
export type ColorValue = string | RGBA;

export interface TuiTheme {
  bg: ColorValue;
  text: ColorValue;
  value: ColorValue;
  muted: ColorValue;
  dim: ColorValue;
  border: ColorValue;
  accent: ColorValue;
  warning: ColorValue;
  danger: ColorValue;
}

// ANSI 16-color palette indices. The terminal remaps these to the active
// colorscheme, so the UI adapts to whatever theme the user runs.
const ANSI = {
  white: 7,
  brightBlack: 8,
  brightRed: 9,
  cyan: 6,
  brightYellow: 11,
  brightWhite: 15,
} as const;

export function terminalTheme(): TuiTheme {
  return {
    // Transparent lets the terminal background show through.
    bg: "transparent",
    text: RGBA.defaultForeground(),
    value: RGBA.fromIndex(ANSI.brightWhite),
    muted: RGBA.fromIndex(ANSI.white),
    dim: RGBA.fromIndex(ANSI.brightBlack),
    border: RGBA.fromIndex(ANSI.brightBlack),
    accent: process.env.SESSION_TUI_ACCENT
      ? parseColor(process.env.SESSION_TUI_ACCENT)
      : RGBA.fromIndex(ANSI.cyan),
    warning: RGBA.fromIndex(ANSI.brightYellow),
    danger: RGBA.fromIndex(ANSI.brightRed),
  };
}

// Categories keep fixed hues so they stay visually distinct from each other.
export const categoryColors = [
  "#2fb9c3",
  "#7bd88f",
  "#f5b74d",
  "#d678dd",
  "#70a5ff",
  "#ff7979",
];
```

Notes: `terminalTheme()` no longer takes a `mode` argument — indexed colors adapt automatically. The `panel` / `panelAlt` fields are removed (no component uses them); `value` is added.

- [ ] **Step 2: Build smoke check**

This task alone leaves `App.tsx` calling `terminalTheme(renderer.themeMode)`, which still type-checks (extra arg is ignored at runtime by bun's stripped build). Run:

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/theme/theme.ts
git commit -m "$(printf 'feat(tui): use ANSI indexed colors for terminal-adaptive theme\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 2: Pure chart math module

**Files:**
- Create: `packages/session-tui/src/components/chart.ts`
- Test: `packages/session-tui/src/components/chart.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/session-tui/src/components/chart.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { columnCells, barFill } from "./chart";

describe("columnCells", () => {
  test("returns one entry per row", () => {
    expect(columnCells(50, 100, 5)).toHaveLength(5);
  });
  test("zero value is all spaces", () => {
    expect(columnCells(0, 100, 4)).toEqual([" ", " ", " ", " "]);
  });
  test("zero max is all spaces", () => {
    expect(columnCells(50, 0, 4)).toEqual([" ", " ", " ", " "]);
  });
  test("full value fills every row with a full block", () => {
    expect(columnCells(100, 100, 3)).toEqual(["█", "█", "█"]);
  });
  test("bar grows from the bottom row upward", () => {
    // half of 4 rows -> bottom two rows full, top two empty
    expect(columnCells(50, 100, 4)).toEqual([" ", " ", "█", "█"]);
  });
  test("tiny non-zero value still shows at least one eighth", () => {
    const cells = columnCells(1, 100000, 5);
    expect(cells[4]).toBe("▁");
  });
});

describe("barFill", () => {
  test("zero value is fully empty", () => {
    expect(barFill(0, 100, 10)).toEqual({ filled: 0, empty: 10 });
  });
  test("full value is fully filled", () => {
    expect(barFill(100, 100, 10)).toEqual({ filled: 10, empty: 0 });
  });
  test("filled and empty always sum to width", () => {
    const { filled, empty } = barFill(37, 100, 10);
    expect(filled + empty).toBe(10);
  });
  test("tiny non-zero value shows at least one filled cell", () => {
    expect(barFill(1, 100000, 10).filled).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
~/.bun/bin/bun test packages/session-tui/src/components/chart.test.ts
```

Expected: FAIL — module `./chart` cannot be resolved.

- [ ] **Step 3: Write the implementation**

Create `packages/session-tui/src/components/chart.ts`:

```ts
// Fractional vertical block characters, index 0 (empty) .. 8 (full).
const EIGHTHS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * Render one vertical bar as `rows` single-character strings, ordered
 * top-to-bottom. The bar grows upward from the bottom row.
 */
export function columnCells(value: number, max: number, rows: number): string[] {
  if (max <= 0 || value <= 0) return Array<string>(rows).fill(" ");
  const eighths = Math.min(
    rows * 8,
    Math.max(1, Math.round((value / max) * rows * 8)),
  );
  const fullRows = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - 1 - r; // 0 = bottom row
    if (fromBottom < fullRows) cells.push("█");
    else if (fromBottom === fullRows && remainder > 0) cells.push(EIGHTHS[remainder]!);
    else cells.push(" ");
  }
  return cells;
}

/** Split a horizontal bar of `width` cells into filled and empty counts. */
export function barFill(
  value: number,
  max: number,
  width: number,
): { filled: number; empty: number } {
  if (max <= 0 || value <= 0) return { filled: 0, empty: width };
  const filled = Math.min(width, Math.max(1, Math.round((value / max) * width)));
  return { filled, empty: width - filled };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
~/.bun/bin/bun test packages/session-tui/src/components/chart.test.ts
```

Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/session-tui/src/components/chart.ts packages/session-tui/src/components/chart.test.ts
git commit -m "$(printf 'feat(tui): add pure chart math helpers with tests\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 3: Shared layout primitives

**Files:**
- Create: `packages/session-tui/src/components/primitives.tsx`

- [ ] **Step 1: Write the file**

Create `packages/session-tui/src/components/primitives.tsx`:

```tsx
import type { ColorValue, TuiTheme } from "../theme/theme";

/** A full-width hairline rule (a box with only a bottom border). */
export function Rule({ theme }: { theme: TuiTheme }) {
  return <box borderBottom borderColor={theme.border} />;
}

/** A cyan section heading, with an optional dim right-aligned label. */
export function SectionHeader({
  label,
  theme,
  right,
}: {
  label: string;
  theme: TuiTheme;
  right?: string;
}) {
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.accent}>{label}</text>
      {right ? <text fg={theme.dim}>{right}</text> : null}
    </box>
  );
}

/** A `label ............ value` line; the value is bold. */
export function Row({
  label,
  value,
  theme,
  valueColor,
}: {
  label: string;
  value: string;
  theme: TuiTheme;
  valueColor?: ColorValue;
}) {
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.muted}>{label}</text>
      <text fg={valueColor ?? theme.value}>
        <strong>{value}</strong>
      </text>
    </box>
  );
}
```

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines. (`primitives.tsx` is not imported yet; this confirms it has no syntax errors once imported in later tasks — it will be exercised then. The build still succeeds.)

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/primitives.tsx
git commit -m "$(printf 'feat(tui): add SectionHeader, Rule, Row primitives\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 4: Flat AppShell (drop the icon sidebar)

**Files:**
- Modify: `packages/session-tui/src/components/AppShell.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/components/AppShell.tsx` with:

```tsx
import type { ReactNode } from "react";
import type { TuiTheme } from "../theme/theme";

/** Full-width, transparent, padded container — no chrome of its own. */
export function AppShell({ children, theme }: { children: ReactNode; theme: TuiTheme }) {
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={theme.bg}
      flexDirection="column"
      padding={1}
    >
      {children}
    </box>
  );
}
```

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/AppShell.tsx
git commit -m "$(printf 'feat(tui): flatten AppShell and remove icon sidebar\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 5: Top nav PeriodSwitcher

**Files:**
- Modify: `packages/session-tui/src/components/PeriodSwitcher.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/components/PeriodSwitcher.tsx` with:

```tsx
import type { PeriodMode } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";

const MODES: PeriodMode[] = ["day", "week", "month"];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PeriodSwitcher({
  mode,
  title,
  theme,
}: {
  mode: PeriodMode;
  title: string;
  theme: TuiTheme;
}) {
  return (
    <box flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row">
          {MODES.map((m) => (
            <text key={m} fg={m === mode ? theme.accent : theme.dim}>
              {m === mode ? <strong>{cap(m)}</strong> : cap(m)}
              {"   "}
            </text>
          ))}
        </box>
        <text fg={theme.muted}>{title}</text>
      </box>
      <box borderBottom borderColor={theme.border} />
    </box>
  );
}
```

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/PeriodSwitcher.tsx
git commit -m "$(printf 'feat(tui): convert PeriodSwitcher to a flat top nav row\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 6: Flat StatsCard ("Summary" section)

**Files:**
- Modify: `packages/session-tui/src/components/StatsCard.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/components/StatsCard.tsx` with:

```tsx
import type { TuiReadModel } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";
import { formatDuration } from "./format";
import { SectionHeader, Row } from "./primitives";

export function StatsCard({ model, theme }: { model: TuiReadModel; theme: TuiTheme }) {
  const active = model.active;
  const currentValue = active
    ? `${active.category}${active.tag ? "/" + active.tag : ""} · ${formatDuration(active.remaining_seconds)}`
    : "No active session";
  return (
    <box flexDirection="column">
      <SectionHeader label="Summary" theme={theme} />
      <Row label="Total Focus" value={formatDuration(model.totalFocusSeconds)} theme={theme} />
      <Row label="Avg / day" value={formatDuration(model.averageFocusSeconds)} theme={theme} />
      <Row
        label="Current"
        value={currentValue}
        valueColor={active ? theme.accent : theme.dim}
        theme={theme}
      />
    </box>
  );
}
```

Note: `model.active` is `ReturnType<typeof View.status>`; the original `StatsCard` already read `.category`, `.tag`, and `.remaining_seconds` from it, so these fields are valid.

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/StatsCard.tsx
git commit -m "$(printf 'feat(tui): flatten StatsCard into a Summary section\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 7: Tall column-chart BarGraph

**Files:**
- Modify: `packages/session-tui/src/components/BarGraph.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/components/BarGraph.tsx` with:

```tsx
import type { DayBucket } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";
import { formatDuration } from "./format";
import { SectionHeader } from "./primitives";
import { columnCells } from "./chart";

const COLUMN_ROWS = 5;
const COLUMN_WIDTH = 5;

/** Compact duration for a tight column footer: "2h" or "30m" or "·". */
function shortDuration(seconds: number): string {
  if (seconds <= 0) return "·";
  const minutes = Math.round(seconds / 60);
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${minutes}m`;
}

export function BarGraph({ days, theme }: { days: DayBucket[]; theme: TuiTheme }) {
  const shown = days.slice(0, 7);
  const max = Math.max(...shown.map((d) => d.focusSeconds), 3600);
  const now = Date.now() / 1000;
  return (
    <box flexDirection="column">
      <SectionHeader
        label="Daily Distribution"
        theme={theme}
        right={`max ${formatDuration(max)}`}
      />
      <box height={1} />
      <box flexDirection="row">
        {shown.map((d) => {
          const cells = columnCells(d.focusSeconds, max, COLUMN_ROWS);
          const isToday = now >= d.date && now < d.date + 86400;
          return (
            <box
              key={d.date}
              width={COLUMN_WIDTH}
              flexDirection="column"
              alignItems="center"
            >
              {cells.map((c, i) => (
                <text key={i} fg={theme.accent}>
                  {isToday ? <strong>{c}</strong> : c}
                </text>
              ))}
              <text fg={theme.dim}>{d.label.slice(0, 1)}</text>
              <text fg={theme.muted}>{shortDuration(d.focusSeconds)}</text>
            </box>
          );
        })}
      </box>
    </box>
  );
}
```

Note: `d.label` is formatted as `"<WEEKDAY> <date>"` (e.g. `"MON 21"`), so `d.label.slice(0, 1)` is the weekday initial. `d.date` is a start-of-day epoch in seconds.

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/BarGraph.tsx
git commit -m "$(printf 'feat(tui): render Daily Distribution as a tall column chart\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 8: Flat CategoryTable with horizontal bars

**Files:**
- Modify: `packages/session-tui/src/components/CategoryTable.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/components/CategoryTable.tsx` with:

```tsx
import type { CategoryTotal } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";
import { formatDuration } from "./format";
import { SectionHeader } from "./primitives";
import { barFill } from "./chart";

const BAR_WIDTH = 10;

export function CategoryTable({
  categories,
  theme,
}: {
  categories: CategoryTotal[];
  theme: TuiTheme;
}) {
  const max = Math.max(...categories.map((c) => c.seconds), 1);
  return (
    <box flexDirection="column">
      <SectionHeader label="Categories" theme={theme} />
      {categories.length === 0 ? (
        <text fg={theme.dim}>No completed focus sessions in this period</text>
      ) : (
        categories.map((c) => {
          const { filled, empty } = barFill(c.seconds, max, BAR_WIDTH);
          return (
            <box key={c.category} flexDirection="row">
              <box width={14}>
                <text fg={c.color}>● {c.category}</text>
              </box>
              <text>
                <span fg={c.color}>{"▇".repeat(filled)}</span>
                <span fg={theme.dim}>{"░".repeat(empty)}</span>
              </text>
              <box width={2} />
              <text fg={theme.value}>
                <strong>{formatDuration(c.seconds)}</strong>
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}
```

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/CategoryTable.tsx
git commit -m "$(printf 'feat(tui): flatten CategoryTable with horizontal accent bars\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 9: Flat CalendarTimeline

**Files:**
- Modify: `packages/session-tui/src/components/CalendarTimeline.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/components/CalendarTimeline.tsx` with:

```tsx
import type { CalendarBlock, DayBucket } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";
import { formatClock } from "./format";
import { SectionHeader } from "./primitives";

function rowFor(block: CalendarBlock): number {
  const d = new Date(block.start * 1000);
  return Math.max(0, d.getHours() - 6);
}

export function CalendarTimeline({
  day,
  now,
  theme,
}: {
  day: DayBucket;
  now: number;
  theme: TuiTheme;
}) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  const currentHour = new Date(now * 1000).getHours();
  return (
    <box flexGrow={1} flexDirection="column">
      <SectionHeader label={`Time Blocks · ${day.label}`} theme={theme} />
      <box height={1} />
      <box flexDirection="column">
        {hours.map((h) => {
          const blocks = day.blocks.filter((b) => rowFor(b) === h - 6);
          const isCurrent = currentHour === h;
          return (
            <box key={h} flexDirection="row">
              <box width={7}>
                <text fg={isCurrent ? theme.danger : theme.dim}>
                  {`${h.toString().padStart(2, "0")}:00`}
                </text>
              </box>
              <box flexGrow={1} flexDirection="column">
                {blocks.length === 0 ? (
                  <text fg={theme.dim}> </text>
                ) : (
                  blocks.map((b) => (
                    <text key={b.id} fg={b.color}>
                      █ {formatClock(b.start)}-{formatClock(b.end)} {b.title}
                    </text>
                  ))
                )}
              </box>
            </box>
          );
        })}
      </box>
    </box>
  );
}
```

Changes from the original: `borderLeft` and the per-hour `borderBottom` rules are removed; each hour is a single plain row; the hour label is `dim` (or `danger` for the current hour).

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/components/CalendarTimeline.tsx
git commit -m "$(printf 'feat(tui): flatten CalendarTimeline and drop dividing borders\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 10: Wire the new layout in App.tsx

**Files:**
- Modify: `packages/session-tui/src/App.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `packages/session-tui/src/App.tsx` with:

```tsx
import { useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { readTuiModel, type PeriodMode } from "./data/read-model";
import { AppShell } from "./components/AppShell";
import { PeriodSwitcher } from "./components/PeriodSwitcher";
import { StatsCard } from "./components/StatsCard";
import { BarGraph } from "./components/BarGraph";
import { CategoryTable } from "./components/CategoryTable";
import { CalendarTimeline } from "./components/CalendarTimeline";
import { Rule } from "./components/primitives";
import { terminalTheme } from "./theme/theme";

export function App({ db, clock, compact }: { db: Db; clock: Clock; compact: boolean }) {
  const renderer = useRenderer();
  const [mode, setMode] = useState<PeriodMode>(compact ? "week" : "day");
  const [offset, setOffset] = useState(0);
  const theme = terminalTheme();
  const model = readTuiModel(db, clock, mode, offset);
  const selectedDay =
    model.days.find((d) => d.date <= model.now && model.now < d.date + 86400) ??
    model.days[0]!;

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") renderer.destroy();
    if (key.name === "left") setOffset((v) => v - 1);
    if (key.name === "right") setOffset((v) => v + 1);
    if (key.name === "1") setMode("day");
    if (key.name === "2") setMode("week");
    if (key.name === "3") setMode("month");
  });

  if (compact) {
    return (
      <box
        width="100%"
        height="100%"
        backgroundColor={theme.bg}
        padding={1}
        flexDirection="row"
      >
        <box width={28}>
          <StatsCard model={model} theme={theme} />
        </box>
        <box width={2} />
        <box flexGrow={1}>
          <BarGraph days={model.days} theme={theme} />
        </box>
      </box>
    );
  }

  return (
    <AppShell theme={theme}>
      <PeriodSwitcher mode={mode} title={model.title} theme={theme} />
      <box height={1} />
      <box flexGrow={1} flexDirection="row">
        <box width="48%" flexDirection="column">
          <StatsCard model={model} theme={theme} />
          <box height={1} />
          <Rule theme={theme} />
          <box height={1} />
          <BarGraph days={model.days} theme={theme} />
          <box height={1} />
          <Rule theme={theme} />
          <box height={1} />
          <CategoryTable categories={model.categories} theme={theme} />
          <box flexGrow={1} />
          <text fg={theme.dim}>1 day · 2 week · 3 month · ←/→ period · q quit</text>
        </box>
        <box width={3} />
        <CalendarTimeline day={selectedDay} now={model.now} theme={theme} />
      </box>
    </AppShell>
  );
}
```

Changes from the original: `terminalTheme()` is called with no argument; the bordered period-switcher block is gone; `PeriodSwitcher` sits at the top; the two columns are separated by a whitespace spacer instead of a border; sections are separated by `Rule`s and blank rows.

- [ ] **Step 2: Build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Commit**

```bash
git add packages/session-tui/src/App.tsx
git commit -m "$(printf 'feat(tui): wire flat top-nav layout in App\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>')"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
~/.bun/bin/bun test
```

Expected: all tests pass, including the 10 new `chart.test.ts` tests. No failures.

- [ ] **Step 2: Final build smoke check**

```bash
~/.bun/bin/bun build packages/session-tui/src/index.tsx --target bun --outdir /tmp/stui-check
```

Expected: bundle summary, no `error:` lines.

- [ ] **Step 3: Manual visual check**

Run the full TUI and the compact variant in a real terminal:

```bash
~/.bun/bin/bun run --cwd packages/session-tui start
~/.bun/bin/bun run --cwd packages/session-tui start -- --compact
```

Confirm by eye:
- Top nav shows `Day Week Month` with the active period in cyan-bold; period title on the right; a hairline rule under it.
- No card borders anywhere; no left icon sidebar.
- Summary, Daily Distribution, and Categories are flat sections separated by hairline rules.
- The column chart shows tall bars with weekday initials and durations; today's column is bold.
- Category rows show a colored dot, a horizontal bar, and a bold duration.
- The timeline is borderless; the current hour label is red.
- Press `1`/`2`/`3` to switch periods, `←`/`→` to change offset, `q` to quit.
- If feasible, switch the terminal between a dark and a light theme and confirm text/accents stay readable (indexed colors should remap automatically).

- [ ] **Step 4: Clean up the scratch build directory**

```bash
rm -rf /tmp/stui-check
```

- [ ] **Step 5: Final confirmation**

Report the test count and that the manual checks passed. No commit needed (this task changes no files).

---

## Self-Review

**Spec coverage:**
- Color system (ANSI indexed, `RGBA.fromIndex`/`defaultForeground`, transparent bg, `SESSION_TUI_ACCENT`, dropped `panel`/`panelAlt`, added `value`, `categoryColors` kept) → Task 1. ✓
- Top nav row → Task 5. ✓
- Flat borderless sections + hairline rules → Tasks 3 (`Rule`), 6, 7, 8, 9, 10. ✓
- New `primitives.tsx` (`SectionHeader`, `Rule`, `Row`) → Task 3. ✓
- Drop icon sidebar → Task 4. ✓
- Tall fractional-block column chart → Tasks 2 (`columnCells`), 7. ✓
- Horizontal category bars → Tasks 2 (`barFill`), 8. ✓
- Drop `borderLeft` on timeline → Task 9. ✓
- `App.tsx` layout + `terminalTheme()` call + compact mode → Task 10. ✓
- Testing: `bun test` green, manual `bun run tui` → Task 11. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** `TuiTheme` / `ColorValue` defined in Task 1 are used identically in Tasks 3, 6–10. `columnCells(value, max, rows)` and `barFill(value, max, width)` defined in Task 2 are called with matching signatures in Tasks 7 and 8. `terminalTheme()` (zero args) defined in Task 1 and called in Task 10. ✓

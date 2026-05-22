import { useMemo, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { Note } from "@/core/note/note";
import { readTuiModel, type PeriodMode } from "./data/read-model";
import { AppShell } from "./components/AppShell";
import { PeriodSwitcher } from "./components/PeriodSwitcher";
import { StatsCard } from "./components/StatsCard";
import { BarGraph } from "./components/BarGraph";
import { CategoryTable } from "./components/CategoryTable";
import { CalendarTimeline } from "./components/CalendarTimeline";
import { NotePanel } from "./components/NotePanel";
import { terminalTheme } from "./theme/theme";

export function App({
  db,
  clock,
  compact,
  notesDir,
}: {
  db: Db;
  clock: Clock;
  compact: boolean;
  notesDir: string;
}) {
  const renderer = useRenderer();
  const [mode, setMode] = useState<PeriodMode>(compact ? "week" : "day");
  const [offset, setOffset] = useState(0);
  const [blockIdx, setBlockIdx] = useState(0);
  const theme = terminalTheme();
  const model = readTuiModel(db, clock, mode, offset);
  const selectedDay =
    model.days.find((d) => d.date <= model.now && model.now < d.date + 86400) ??
    model.days[0]!;

  // Clamp at render: the keyboard closure can hold a stale block list, and
  // switching day/period can land on a shorter day.
  const blocks = selectedDay.blocks;
  const selIdx = blocks.length ? Math.min(blockIdx, blocks.length - 1) : -1;
  const selectedBlock = selIdx >= 0 ? blocks[selIdx]! : null;
  const noteContent = useMemo(
    () =>
      selectedBlock?.notePath
        ? Note.read(notesDir, selectedBlock.notePath)
        : null,
    [selectedBlock?.notePath, notesDir],
  );

  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") renderer.destroy();
    if (key.name === "left") setOffset((v) => v - 1);
    if (key.name === "right") setOffset((v) => v + 1);
    if (key.name === "up") setBlockIdx((v) => Math.max(0, v - 1));
    if (key.name === "down") setBlockIdx((v) => v + 1);
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
      <box height={1} flexShrink={0} />
      <box flexShrink={0} flexDirection="row">
        <box width="48%" flexDirection="column" flexShrink={0}>
          <StatsCard model={model} theme={theme} />
          <box height={1} flexShrink={0} />
          <BarGraph days={model.days} theme={theme} />
          <box height={1} flexShrink={0} />
          <CategoryTable categories={model.categories} theme={theme} />
        </box>
        <box width={3} />
        <CalendarTimeline
          day={selectedDay}
          now={model.now}
          theme={theme}
          selectedBlockId={selectedBlock?.id ?? null}
        />
      </box>
      <box height={1} flexShrink={0} />
      <NotePanel block={selectedBlock} noteContent={noteContent} theme={theme} />
      <text fg={theme.dim}>
        1 day · 2 week · 3 month · ←/→ period · ↑/↓ block · q quit
      </text>
    </AppShell>
  );
}

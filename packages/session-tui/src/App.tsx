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
import { theme } from "./theme/theme";

export function App({ db, clock, compact }: { db: Db; clock: Clock; compact: boolean }) {
  const renderer = useRenderer();
  const [mode, setMode] = useState<PeriodMode>(compact ? "week" : "day");
  const [offset, setOffset] = useState(0);
  const model = readTuiModel(db, clock, mode, offset);
  const selectedDay = model.days.find((d) => d.date <= model.now && model.now < d.date + 86400) ?? model.days[0]!;

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
      <box width="100%" height="100%" backgroundColor={theme.bg} padding={1} flexDirection="row">
        <box width={28}>
          <StatsCard model={model} />
        </box>
        <box flexGrow={1}>
          <BarGraph days={model.days} />
        </box>
      </box>
    );
  }

  return (
    <AppShell>
      <box flexGrow={1} flexDirection="row">
        <box width="48%" flexDirection="column">
          <PeriodSwitcher mode={mode} title={model.title} />
          <box padding={1} flexDirection="column">
            <StatsCard model={model} />
            <box height={1} />
            <BarGraph days={model.days} />
            <box height={1} />
            <CategoryTable categories={model.categories} />
            <box height={1} />
            <text fg={theme.muted}>Keys: 1 day · 2 week · 3 month · ←/→ period · q quit</text>
          </box>
        </box>
        <CalendarTimeline day={selectedDay} now={model.now} />
      </box>
    </AppShell>
  );
}

import type { DayBucket } from "../data/read-model";
import { theme } from "../theme/theme";
import { formatDuration } from "./format";

function bar(value: number, max: number): string {
  const height = max <= 0 ? 0 : Math.max(1, Math.round((value / max) * 8));
  return "█".repeat(height).padStart(8, "░");
}

export function BarGraph({ days }: { days: DayBucket[] }) {
  const max = Math.max(...days.map((d) => d.focusSeconds), 3600);
  return (
    <box border borderColor={theme.border} padding={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>Daily Distribution</text>
        <text fg={theme.muted}>max {formatDuration(max)}</text>
      </box>
      <box height={1} />
      <box flexDirection="row">
        {days.slice(0, 7).map((d) => (
          <box key={d.date} width={10} alignItems="center">
            <text fg={d.focusSeconds > 0 ? theme.accent : theme.dim}>{bar(d.focusSeconds, max)}</text>
            <text fg={theme.text}>{d.label}</text>
          </box>
        ))}
      </box>
    </box>
  );
}

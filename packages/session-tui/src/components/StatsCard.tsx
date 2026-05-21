import type { TuiReadModel } from "../data/read-model";
import { theme } from "../theme/theme";
import { formatDuration } from "./format";

export function StatsCard({ model }: { model: TuiReadModel }) {
  return (
    <box border borderColor={theme.border} padding={1} flexDirection="column">
      <text fg={theme.muted}>TOTAL FOCUS</text>
      <text fg={theme.text}>{formatDuration(model.totalFocusSeconds)}</text>
      <box height={1} />
      <text fg={theme.muted}>AVG FOCUS/DAY</text>
      <text fg={theme.text}>{formatDuration(model.averageFocusSeconds)}</text>
      <box height={1} />
      <text fg={theme.muted}>CURRENT</text>
      <text fg={model.active ? theme.accent : theme.dim}>
        {model.active
          ? `${model.active.category}${model.active.tag ? "/" + model.active.tag : ""} · ${formatDuration(model.active.remaining_seconds)}`
          : "No active session"}
      </text>
    </box>
  );
}

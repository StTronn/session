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

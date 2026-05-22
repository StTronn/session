import type { DayBucket } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";
import { formatDuration } from "./format";
import { SectionHeader } from "./primitives";
import { columnCells, columnGradient } from "./chart";

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
  const rowColors = columnGradient(COLUMN_ROWS);
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
                <text key={i} fg={rowColors[i]}>
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

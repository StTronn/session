import type { CalendarBlock, DayBucket } from "../data/read-model";
import { theme } from "../theme/theme";
import { formatClock } from "./format";

function rowFor(block: CalendarBlock): number {
  const d = new Date(block.start * 1000);
  return Math.max(0, d.getHours() - 6);
}

export function CalendarTimeline({ day, now }: { day: DayBucket; now: number }) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  return (
    <box borderLeft borderColor={theme.border} flexGrow={1} flexDirection="column">
      <box height={4} alignItems="center" justifyContent="center" borderBottom borderColor={theme.border}>
        <text fg={theme.text}>Time Blocks · {day.label}</text>
      </box>
      <box flexGrow={1} flexDirection="column" paddingLeft={1}>
        {hours.map((h) => {
          const blocks = day.blocks.filter((b) => rowFor(b) === h - 6);
          const isCurrentHour = new Date(now * 1000).getHours() === h;
          return (
            <box key={h} height={3} borderBottom borderColor={theme.border} flexDirection="row">
              <box width={10}>
                <text fg={isCurrentHour ? theme.danger : theme.muted}>
                  {`${h.toString().padStart(2, "0")}:00`}
                </text>
              </box>
              <box flexGrow={1} flexDirection="column">
                {blocks.map((b) => (
                  <text key={b.id} fg={b.color}>
                    █ {formatClock(b.start)}-{formatClock(b.end)} {b.title}
                  </text>
                ))}
              </box>
            </box>
          );
        })}
      </box>
    </box>
  );
}

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
  selectedBlockId,
}: {
  day: DayBucket;
  now: number;
  theme: TuiTheme;
  selectedBlockId: number | null;
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
                      {b.id === selectedBlockId ? "▸" : " "}█{" "}
                      {formatClock(b.start)}-{formatClock(b.end)} {b.title}
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

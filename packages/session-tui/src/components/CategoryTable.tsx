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

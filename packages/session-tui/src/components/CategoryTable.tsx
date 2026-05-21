import type { CategoryTotal } from "../data/read-model";
import { theme } from "../theme/theme";
import { formatDuration } from "./format";

export function CategoryTable({ categories }: { categories: CategoryTotal[] }) {
  return (
    <box border borderColor={theme.border} padding={1} flexDirection="column">
      <text fg={theme.text}>Category Distribution</text>
      <box height={1} />
      {categories.length === 0 ? (
        <text fg={theme.dim}>No completed focus sessions in this period</text>
      ) : (
        categories.map((c) => (
          <box key={c.category} flexDirection="row" justifyContent="space-between">
            <text fg={c.color}>● {c.category}</text>
            <text fg={theme.text}>{formatDuration(c.seconds)}</text>
          </box>
        ))
      )}
    </box>
  );
}

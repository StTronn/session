import type { PeriodMode } from "../data/read-model";
import { theme } from "../theme/theme";

export function PeriodSwitcher({
  mode,
  title,
}: {
  mode: PeriodMode;
  title: string;
}) {
  return (
    <box height={5} alignItems="center" justifyContent="center" borderBottom borderColor={theme.border}>
      <box flexDirection="row" alignItems="center">
        <box width={5} height={3} border borderColor={theme.border} alignItems="center" justifyContent="center">
          <text fg={theme.text}>‹</text>
        </box>
        <box width={32} height={3} border borderColor={theme.border} alignItems="center" justifyContent="center">
          <text fg={theme.text}>{mode.toUpperCase()} · {title}</text>
        </box>
        <box width={5} height={3} border borderColor={theme.border} alignItems="center" justifyContent="center">
          <text fg={theme.text}>›</text>
        </box>
      </box>
    </box>
  );
}

import type { PeriodMode } from "../data/read-model";
import type { TuiTheme } from "../theme/theme";

const MODES: PeriodMode[] = ["day", "week", "month"];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PeriodSwitcher({
  mode,
  title,
  theme,
}: {
  mode: PeriodMode;
  title: string;
  theme: TuiTheme;
}) {
  return (
    <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
      <box flexDirection="row">
        {MODES.map((m) => (
          <text key={m} fg={m === mode ? theme.accent : theme.dim}>
            {m === mode ? <strong>{cap(m)}</strong> : cap(m)}
            {"   "}
          </text>
        ))}
      </box>
      <text fg={theme.muted}>{title}</text>
    </box>
  );
}

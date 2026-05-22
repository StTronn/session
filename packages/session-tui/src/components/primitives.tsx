import type { ColorValue, TuiTheme } from "../theme/theme";

/** A cyan section heading, with an optional dim right-aligned label. */
export function SectionHeader({
  label,
  theme,
  right,
}: {
  label: string;
  theme: TuiTheme;
  right?: string;
}) {
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.accent}>{label}</text>
      {right ? <text fg={theme.dim}>{right}</text> : null}
    </box>
  );
}

/** A `label ............ value` line; the value is bold. */
export function Row({
  label,
  value,
  theme,
  valueColor,
}: {
  label: string;
  value: string;
  theme: TuiTheme;
  valueColor?: ColorValue;
}) {
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.muted}>{label}</text>
      <text fg={valueColor ?? theme.value}>
        <strong>{value}</strong>
      </text>
    </box>
  );
}

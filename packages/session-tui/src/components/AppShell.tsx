import type { ReactNode } from "react";
import { theme } from "../theme/theme";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <box width="100%" height="100%" backgroundColor={theme.bg} flexDirection="row">
      <box width={7} borderRight borderColor={theme.border} alignItems="center" paddingTop={2}>
        <text fg={theme.muted}>◷</text>
        <box height={2} />
        <text fg={theme.accent}>▮</text>
        <box height={2} />
        <text fg={theme.muted}>▤</text>
        <box flexGrow={1} />
        <text fg={theme.muted}>⚙</text>
      </box>
      <box flexGrow={1}>{children}</box>
    </box>
  );
}

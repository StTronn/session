import type { ReactNode } from "react";
import type { TuiTheme } from "../theme/theme";

/** Full-width, transparent, padded container — no chrome of its own. */
export function AppShell({ children, theme }: { children: ReactNode; theme: TuiTheme }) {
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={theme.bg}
      flexDirection="column"
      padding={1}
    >
      {children}
    </box>
  );
}

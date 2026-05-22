import type { CalendarBlock } from "../data/read-model";
import type { ColorValue, TuiTheme } from "../theme/theme";
import { SectionHeader } from "./primitives";
import { parseNoteLines, type StyledLine } from "./note-format";

/** Total panel height (header + blank + body). Longer notes are clipped. */
const PANEL_HEIGHT = 10;
const BODY_LINES = PANEL_HEIGHT - 3;

function lineText(line: StyledLine): string {
  switch (line.kind) {
    case "heading":
      return line.text;
    case "todo":
      return `  [${line.done ? "x" : " "}] ${line.text}`;
    case "text":
      return line.text;
    case "blank":
      return " ";
  }
}

function lineColor(line: StyledLine, theme: TuiTheme): ColorValue {
  switch (line.kind) {
    case "heading":
      return theme.accent;
    case "todo":
      return line.done ? theme.dim : theme.value;
    default:
      return theme.muted;
  }
}

/** Full-width panel rendering the selected calendar block's todo note. */
export function NotePanel({
  block,
  noteContent,
  theme,
}: {
  block: CalendarBlock | null;
  noteContent: string | null;
  theme: TuiTheme;
}) {
  if (!block) return <box height={PANEL_HEIGHT} flexShrink={0} />;

  const lines = noteContent ? parseNoteLines(noteContent) : null;
  return (
    <box height={PANEL_HEIGHT} flexShrink={0} flexDirection="column">
      <SectionHeader
        label={`Note · ${block.title}`}
        theme={theme}
        right={block.notePath ?? undefined}
      />
      <box height={1} />
      {lines === null ? (
        <text fg={theme.dim}>No note attached</text>
      ) : (
        lines.slice(0, BODY_LINES).map((line, i) => (
          <text key={i} fg={lineColor(line, theme)}>
            {lineText(line)}
          </text>
        ))
      )}
    </box>
  );
}

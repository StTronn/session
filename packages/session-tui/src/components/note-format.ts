/** A single note line, classified for styled rendering in the NotePanel. */
export type StyledLine =
  | { kind: "heading"; text: string }
  | { kind: "todo"; text: string; done: boolean }
  | { kind: "text"; text: string }
  | { kind: "blank" };

const HEADING = /^\s*#+\s*(.*)$/;
const TODO = /^\s*-\s*\[( |x|X)\]\s*(.*)$/;

/** Parse todo-note markdown into styled lines. Recognises `#` headings and
 *  `- [ ]` / `- [x]` checkboxes; everything else is plain text or blank. */
export function parseNoteLines(md: string): StyledLine[] {
  return md.replace(/\n$/, "").split("\n").map((line): StyledLine => {
    const todo = TODO.exec(line);
    if (todo) {
      return { kind: "todo", text: todo[2]!, done: todo[1] !== " " };
    }
    const heading = HEADING.exec(line);
    if (heading) return { kind: "heading", text: heading[1]! };
    if (line.trim() === "") return { kind: "blank" };
    return { kind: "text", text: line };
  });
}

import { test, expect, describe } from "bun:test";
import { parseNoteLines } from "./note-format";

describe("parseNoteLines", () => {
  test("strips hashes from a heading", () => {
    expect(parseNoteLines("# Todo")).toEqual([{ kind: "heading", text: "Todo" }]);
  });
  test("supports deeper headings", () => {
    expect(parseNoteLines("### Later")).toEqual([
      { kind: "heading", text: "Later" },
    ]);
  });
  test("reads an open checkbox", () => {
    expect(parseNoteLines("- [ ] draft the api")).toEqual([
      { kind: "todo", text: "draft the api", done: false },
    ]);
  });
  test("reads a done checkbox, lower or upper case x", () => {
    expect(parseNoteLines("- [x] read the rfc")).toEqual([
      { kind: "todo", text: "read the rfc", done: true },
    ]);
    expect(parseNoteLines("- [X] read the rfc")).toEqual([
      { kind: "todo", text: "read the rfc", done: true },
    ]);
  });
  test("treats an empty line as blank", () => {
    expect(parseNoteLines("   ")).toEqual([{ kind: "blank" }]);
  });
  test("keeps any other line as plain text", () => {
    expect(parseNoteLines("just a note")).toEqual([
      { kind: "text", text: "just a note" },
    ]);
  });
  test("parses a multi-line note in order", () => {
    expect(parseNoteLines("# Todo\n\n- [ ] a\n- [x] b")).toEqual([
      { kind: "heading", text: "Todo" },
      { kind: "blank" },
      { kind: "todo", text: "a", done: false },
      { kind: "todo", text: "b", done: true },
    ]);
  });
  test("ignores a trailing newline", () => {
    expect(parseNoteLines("a\n")).toEqual([{ kind: "text", text: "a" }]);
  });
});

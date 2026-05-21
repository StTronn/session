// test/cli/registry.test.ts
import { test, expect, describe } from "bun:test";
import { dispatch, type Command } from "@/cli/registry";

const commands: Command[] = [
  {
    name: "greet",
    summary: "print a greeting",
    run: (ctx) => {
      ctx.print(`hello ${ctx.positionals[0] ?? "world"}`);
      return 0;
    },
  },
];

describe("registry", () => {
  test("dispatch runs a matching command", () => {
    let out = "";
    const code = dispatch(commands, ["greet", "sam"], (s) => (out += s));
    expect(code).toBe(0);
    expect(out).toContain("hello sam");
  });
  test("dispatch supports a noun subcommand path", () => {
    let out = "";
    const nested: Command[] = [
      {
        name: "block add",
        summary: "add a block",
        run: (ctx) => {
          ctx.print("added");
          return 0;
        },
      },
    ];
    const code = dispatch(nested, ["block", "add"], (s) => (out += s));
    expect(code).toBe(0);
    expect(out).toContain("added");
  });
  test("unknown command returns a non-zero code", () => {
    let out = "";
    const code = dispatch(commands, ["nope"], (s) => (out += s));
    expect(code).not.toBe(0);
    expect(out.toLowerCase()).toContain("unknown");
  });
  test("no args prints help and returns 0", () => {
    let out = "";
    const code = dispatch(commands, [], (s) => (out += s));
    expect(code).toBe(0);
    expect(out).toContain("greet");
  });
});

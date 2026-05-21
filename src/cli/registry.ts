// src/cli/registry.ts
import { parseArgs } from "node:util";
import type { Flags } from "@/cli/args";

export interface CommandContext {
  positionals: string[];
  flags: Flags;
  print: (s: string) => void;
}

export interface Command {
  /** Space-separated command path, e.g. "start" or "block add". */
  name: string;
  summary: string;
  run: (ctx: CommandContext) => number;
}

const PARSE_OPTIONS = {
  format: { type: "string" },
  json: { type: "boolean" },
  toon: { type: "boolean" },
  note: { type: "boolean" },
  tmux: { type: "boolean" },
  today: { type: "boolean" },
  week: { type: "boolean" },
  intent: { type: "string" },
  for: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  title: { type: "string" },
  reflect: { type: "string" },
  block: { type: "string" },
  category: { type: "string" },
  tag: { type: "string" },
  since: { type: "string" },
} as const;

/** Find the command whose name matches the longest leading run of argv
 *  tokens, so "block add" wins over a bare "block". */
function match(commands: Command[], argv: string[]): { cmd: Command; rest: string[] } | null {
  let best: { cmd: Command; rest: string[] } | null = null;
  for (const cmd of commands) {
    const parts = cmd.name.split(" ");
    if (parts.length > argv.length) continue;
    if (parts.every((p, i) => p === argv[i])) {
      if (!best || parts.length > best.cmd.name.split(" ").length) {
        best = { cmd, rest: argv.slice(parts.length) };
      }
    }
  }
  return best;
}

function printHelp(commands: Command[], print: (s: string) => void): void {
  print("session — focus tracker & time blocking\n\n");
  print("Commands:\n");
  for (const c of [...commands].sort((a, b) => a.name.localeCompare(b.name))) {
    print(`  ${c.name.padEnd(22)} ${c.summary}\n`);
  }
}

export function dispatch(
  commands: Command[],
  argv: string[],
  print: (s: string) => void,
): number {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
    printHelp(commands, print);
    return 0;
  }
  const found = match(commands, argv);
  if (!found) {
    print(`unknown command: ${argv.join(" ")}\n`);
    printHelp(commands, print);
    return 1;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: found.rest,
      options: PARSE_OPTIONS,
      allowPositionals: true,
      strict: false,
    });
  } catch (e) {
    print(`error: ${(e as Error).message}\n`);
    return 1;
  }
  try {
    return found.cmd.run({
      positionals: parsed.positionals,
      flags: parsed.values as Flags,
      print,
    });
  } catch (e) {
    print(`error: ${(e as Error).message}\n`);
    return 1;
  }
}

// src/cli/args.ts
import type { OutputFormat } from "@/cli/format/format";

export type Flags = Record<string, string | boolean | undefined>;

/** Resolve the output format from parsed flags. `--json` is a shorthand. */
export function parseFormat(flags: Flags): OutputFormat {
  if (flags.json === true) return "json";
  if (flags.toon === true) return "toon";
  const f = flags.format;
  if (f === undefined) return "text";
  if (f === "text" || f === "json" || f === "toon") return f;
  throw new Error(`unknown format: "${String(f)}" (use text|json|toon)`);
}

export function flag(flags: Flags, name: string): boolean {
  return flags[name] === true;
}

export function str(flags: Flags, name: string): string | undefined {
  const v = flags[name];
  return typeof v === "string" ? v : undefined;
}

export function requirePositional(
  positionals: string[],
  index: number,
  name: string,
): string {
  const v = positionals[index];
  if (v === undefined || v === "") {
    throw new Error(`missing required argument: <${name}>`);
  }
  return v;
}

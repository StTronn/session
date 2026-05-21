// src/cli/commands/views.ts
import { View } from "@/core/view/view";
import type { Command } from "@/cli/registry";
import { render, formatDuration } from "@/cli/format/format";
import { parseFormat, flag } from "@/cli/args";
import type { CommandDeps } from "@/cli/commands/session";

export function viewCommands(deps: CommandDeps): Command[] {
  const { db, clock, notesDir } = deps;
  return [
    {
      name: "agenda",
      summary: "show today's plan: blocks + ongoing session [--json|--toon]",
      run: (ctx) => {
        const ag = View.agenda(db, clock);
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(ag, format, (v) => {
            const lines: string[] = [];
            if (v.ongoing) {
              lines.push(
                `▶ focusing: ${v.ongoing.category} ` +
                  `(${formatDuration(v.ongoing.elapsed_seconds)})`,
              );
            }
            for (const [label, list] of [
              ["past", v.past],
              ["now", v.current],
              ["next", v.upcoming],
            ] as const) {
              for (const b of list) {
                lines.push(`  [${label}] #${b.id} ${b.title ?? "(untitled)"}`);
              }
            }
            return (lines.length ? lines.join("\n") : "nothing planned today") +
              "\n";
          }),
        );
        return 0;
      },
    },
    {
      name: "summary",
      summary: "time-spent breakdown [--today|--week] [--json|--toon]",
      run: (ctx) => {
        const range = flag(ctx.flags, "week") ? "week" : "today";
        const sum = View.summary(db, clock, range);
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(sum, format, (v) => {
            const head = `${v.range}: ${formatDuration(v.total_seconds)} ` +
              `across ${v.session_count} session(s)`;
            const rows = v.by_category.map(
              (c) => `  ${c.category}: ${formatDuration(c.seconds)}`,
            );
            return [head, ...rows].join("\n") + "\n";
          }),
        );
        return 0;
      },
    },
    {
      name: "context",
      summary: "full agent-facing dump [--json|--toon]",
      run: (ctx) => {
        const data = View.context(db, clock, notesDir);
        // context is an agent surface: default to JSON, not text.
        const format = parseFormat(ctx.flags);
        ctx.print(render(data, format === "text" ? "json" : format));
        ctx.print("\n");
        return 0;
      },
    },
  ];
}

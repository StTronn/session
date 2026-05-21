// src/cli/commands/block.ts
import { Block } from "@/core/block/block";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Note } from "@/core/note/note";
import { parseTime } from "@/core/time/datetime";
import { parseDuration } from "@/core/time/duration";
import type { Command } from "@/cli/registry";
import { render, formatDuration } from "@/cli/format/format";
import { parseFormat, flag, str, requirePositional } from "@/cli/args";
import type { CommandDeps } from "@/cli/commands/session";

function resolveCategoryTagForBlock(
  deps: CommandDeps,
  categoryName: string,
  tagName?: string,
): { categoryId: number; tagId: number | null } {
  const cat = Category.ensure(deps.db, deps.clock, categoryName);
  const tag = tagName ? Tag.ensure(deps.db, deps.clock, cat.id, tagName) : null;
  return { categoryId: cat.id, tagId: tag ? tag.id : null };
}

export function blockCommands(deps: CommandDeps): Command[] {
  const { db, clock, notesDir } = deps;
  return [
    {
      name: "block add",
      summary:
        "add a time block: block add <category> [tag] --from <t> --to <t> " +
        "[--title <s>] [--note]",
      run: (ctx) => {
        const categoryName = requirePositional(ctx.positionals, 0, "category");
        const tagName = ctx.positionals[1];
        const fromStr = str(ctx.flags, "from");
        const toStr = str(ctx.flags, "to");
        if (!fromStr || !toStr) {
          throw new Error("block add requires --from and --to");
        }
        const { categoryId, tagId } = resolveCategoryTagForBlock(
          deps,
          categoryName,
          tagName,
        );
        const now = clock.now();
        const b = Block.create(db, clock, {
          category_id: categoryId,
          tag_id: tagId,
          title: str(ctx.flags, "title") ?? null,
          scheduled_start: parseTime(fromStr, now),
          scheduled_end: parseTime(toStr, now),
        });
        if (flag(ctx.flags, "note")) {
          const rel = Note.create(notesDir, "block", b.id);
          Block.setNote(db, b.id, rel);
        }
        ctx.print(`block #${b.id} created\n`);
        return 0;
      },
    },
    {
      name: "block move",
      summary: "reschedule a block: block move <id> --to <t> [--for <duration>]",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const existing = Block.get(db, id);
        if (!existing) throw new Error(`block ${id} not found`);
        const toStr = str(ctx.flags, "to");
        if (!toStr) throw new Error("block move requires --to");
        const newStart = parseTime(toStr, clock.now());
        const forStr = str(ctx.flags, "for");
        const span = forStr
          ? parseDuration(forStr)
          : existing.scheduled_end - existing.scheduled_start;
        Block.move(db, id, newStart, newStart + span);
        ctx.print(`block #${id} moved\n`);
        return 0;
      },
    },
    {
      name: "block start",
      summary: "start a focus session from a block: block start <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const b = Block.get(db, id);
        if (!b) throw new Error(`block ${id} not found`);
        const forStr = str(ctx.flags, "for");
        // Default the session length to the block's own scheduled span.
        const planned = forStr
          ? parseDuration(forStr)
          : b.scheduled_end - b.scheduled_start;
        Block.startFromBlock(db, clock, id, planned);
        ctx.print(`started session from block #${id} ` +
          `(${formatDuration(planned)})\n`);
        return 0;
      },
    },
    {
      name: "block done",
      summary: "mark a block done: block done <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Block.markDone(db, id);
        ctx.print(`block #${id} done\n`);
        return 0;
      },
    },
    {
      name: "block skip",
      summary: "mark a block skipped: block skip <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Block.markSkipped(db, id);
        ctx.print(`block #${id} skipped\n`);
        return 0;
      },
    },
    {
      name: "block rm",
      summary: "delete a block: block rm <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Block.remove(db, id);
        ctx.print(`block #${id} removed\n`);
        return 0;
      },
    },
    {
      name: "block note",
      summary: "print the path of a block's todo note: block note <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const b = Block.get(db, id);
        if (!b) throw new Error(`block ${id} not found`);
        const rel = b.note_path ?? Note.create(notesDir, "block", b.id);
        if (!b.note_path) Block.setNote(db, b.id, rel);
        ctx.print(Note.absPath(notesDir, rel) + "\n");
        return 0;
      },
    },
    {
      name: "block list",
      summary: "list today's blocks [--json|--toon]",
      run: (ctx) => {
        const rows = Block.today(db, clock);
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(rows, format, (list) =>
            list.length === 0
              ? "no blocks today\n"
              : list
                  .map((b) => {
                    const t = new Date(b.scheduled_start * 1000);
                    const hh = String(t.getHours()).padStart(2, "0");
                    const mm = String(t.getMinutes()).padStart(2, "0");
                    return `#${b.id} ${hh}:${mm} ${b.status} ` +
                      `${b.title ?? "(untitled)"}`;
                  })
                  .join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
  ];
}

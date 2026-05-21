// src/cli/commands/session.ts
import type { Db } from "@/core/db/db";
import type { Clock } from "@/core/clock/clock";
import { dirname, join } from "node:path";
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Session } from "@/core/session/session";
import { Block } from "@/core/block/block";
import { Note } from "@/core/note/note";
import { Config } from "@/core/config/config";
import { View } from "@/core/view/view";
import { parseDuration } from "@/core/time/duration";
import { Event } from "@/core/event/event";
import { Hooks } from "@/core/hooks/hooks";
import type { Command } from "@/cli/registry";
import { render, formatDuration } from "@/cli/format/format";
import { parseFormat, flag, str, requirePositional } from "@/cli/args";
import { blockCommands } from "@/cli/commands/block";
import { viewCommands } from "@/cli/commands/views";
import { setupCommands } from "@/cli/commands/setup";
import { daemonCommands } from "@/cli/commands/daemon";
import { hookCommands } from "@/cli/commands/hooks";

export interface CommandDeps {
  db: Db;
  clock: Clock;
  notesDir: string;
}

/** Resolve category (required) and tag (optional) by name, creating them. */
function resolveCategoryTag(
  deps: CommandDeps,
  categoryName: string,
  tagName?: string,
): { categoryId: number; tagId: number | null } {
  const cat = Category.ensure(deps.db, deps.clock, categoryName);
  const tag = tagName
    ? Tag.ensure(deps.db, deps.clock, cat.id, tagName)
    : null;
  return { categoryId: cat.id, tagId: tag ? tag.id : null };
}

/** Fire a lifecycle hook for a session, derived from the deps. Fire-and-forget;
 *  bin/session.ts (and tests) await Hooks.drain() to let it finish. */
function emit(
  deps: CommandDeps,
  name: "session.started" | "session.completed" | "session.abandoned",
  session: Session.Session,
  extra: Partial<Event.EventPayload> = {},
): void {
  const dataDir = dirname(deps.notesDir);
  const payload = Event.fromSession(
    deps.db,
    name,
    deps.clock.now(),
    session,
    extra,
  );
  void Hooks.dispatch(payload, {
    hooksDir: join(dataDir, "hooks"),
    dataDir,
    timeoutMs: 2000,
    log: "stderr",
  });
}

export function sessionCommands(deps: CommandDeps): Command[] {
  const { db, clock, notesDir } = deps;
  return [
    {
      name: "start",
      summary: "start a focus session: start <category> [tag] [--for 25m] [--block <id>]",
      run: (ctx) => {
        const categoryName = requirePositional(ctx.positionals, 0, "category");
        const tagName = ctx.positionals[1];
        const { categoryId, tagId } = resolveCategoryTag(
          deps,
          categoryName,
          tagName,
        );
        const forStr = str(ctx.flags, "for");
        const planned = forStr
          ? parseDuration(forStr)
          : Config.defaultDuration(db);
        const blockStr = str(ctx.flags, "block");
        let blockId: number | null = null;
        if (blockStr !== undefined) {
          const n = Number(blockStr);
          if (!Number.isInteger(n) || n <= 0 || !Block.get(db, n)) {
            throw new Error(`block ${blockStr} not found`);
          }
          blockId = n;
        }
        const s = Session.start(db, clock, {
          category_id: categoryId,
          tag_id: tagId,
          intent: str(ctx.flags, "intent") ?? null,
          planned_seconds: planned,
          block_id: blockId,
        });
        emit(deps, "session.started", s);
        if (flag(ctx.flags, "note")) {
          const rel = Note.create(notesDir, "session", s.id);
          db.raw
            .query("UPDATE session SET note_path = ? WHERE id = ?")
            .run(rel, s.id);
        }
        ctx.print(`started ${categoryName}${tagName ? "/" + tagName : ""} ` +
          `for ${formatDuration(planned)}\n`);
        return 0;
      },
    },
    {
      name: "status",
      summary: "show the running session [--json|--toon|--tmux]",
      run: (ctx) => {
        const st = View.status(db, clock);
        if (flag(ctx.flags, "tmux")) {
          if (!st) {
            ctx.print("");
          } else {
            const label = st.tag ? `${st.category}/${st.tag}` : st.category;
            const dot = st.status === "paused" ? "‖" : "●";
            ctx.print(`${dot} ${label} ${formatDuration(st.elapsed_seconds)}`);
          }
          return 0;
        }
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(st, format, (v) =>
            v
              ? `${v.status === "paused" ? "paused" : "focusing"}: ` +
                `${v.category}${v.tag ? "/" + v.tag : ""} — ` +
                `${formatDuration(v.elapsed_seconds)} / ` +
                `${formatDuration(v.planned_seconds)}\n`
              : "no session running\n",
          ),
        );
        return 0;
      },
    },
    {
      name: "pause",
      summary: "pause the running session",
      run: (ctx) => {
        Session.pause(db, clock);
        ctx.print("paused\n");
        return 0;
      },
    },
    {
      name: "resume",
      summary: "resume the paused session",
      run: (ctx) => {
        Session.resume(db, clock);
        ctx.print("resumed\n");
        return 0;
      },
    },
    {
      name: "add",
      summary: "add time to the running session: add <duration>",
      run: (ctx) => {
        const dur = parseDuration(
          requirePositional(ctx.positionals, 0, "duration"),
        );
        const s = Session.addTime(db, dur);
        ctx.print(`added ${formatDuration(dur)}; planned now ` +
          `${formatDuration(s.planned_seconds)}\n`);
        return 0;
      },
    },
    {
      name: "done",
      summary: "complete the running session [--reflect \"…\"]",
      run: (ctx) => {
        const reflection = str(ctx.flags, "reflect") ?? null;
        const done = Session.complete(db, clock, reflection);
        emit(deps, "session.completed", done, { reflection });
        ctx.print("session completed\n");
        return 0;
      },
    },
    {
      name: "cancel",
      summary: "abandon the running session",
      run: (ctx) => {
        const abandoned = Session.abandon(db, clock);
        emit(deps, "session.abandoned", abandoned);
        ctx.print("session abandoned\n");
        return 0;
      },
    },
    {
      name: "reflect",
      summary: "set the reflection on the last session: reflect <text>",
      run: (ctx) => {
        const text = requirePositional(ctx.positionals, 0, "text");
        const last = Session.list(db, { limit: 1 })[0];
        if (!last) throw new Error("no past session to reflect on");
        Session.reflect(db, last.id, text);
        ctx.print("reflection saved\n");
        return 0;
      },
    },
    {
      name: "note",
      summary: "print the path of the running session's todo note",
      run: (ctx) => {
        const s = Session.active(db);
        if (!s) throw new Error("no running session");
        const rel = s.note_path ?? Note.create(notesDir, "session", s.id);
        if (!s.note_path) {
          db.raw
            .query("UPDATE session SET note_path = ? WHERE id = ?")
            .run(rel, s.id);
        }
        ctx.print(Note.absPath(notesDir, rel) + "\n");
        return 0;
      },
    },
    {
      name: "list",
      summary:
        "list past sessions [--today|--since <days>|--category <c>|--tag <t>]",
      run: (ctx) => {
        let since: number | undefined;
        if (flag(ctx.flags, "today")) {
          const d = new Date(clock.now() * 1000);
          since = Math.floor(
            new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() /
              1000,
          );
        }
        const sinceStr = str(ctx.flags, "since");
        if (sinceStr !== undefined) {
          const days = Number(sinceStr);
          if (!Number.isFinite(days) || days <= 0) {
            throw new Error("--since expects a positive number of days");
          }
          since = clock.now() - days * 86400;
        }
        const catName = str(ctx.flags, "category");
        const cat = catName ? Category.getByName(db, catName) : null;
        if (catName && !cat) throw new Error(`category "${catName}" not found`);
        const tagName = str(ctx.flags, "tag");
        let tagId: number | undefined;
        if (tagName !== undefined) {
          if (!cat) throw new Error("--tag requires --category");
          const tag = Tag.getByName(db, cat.id, tagName);
          if (!tag) {
            throw new Error(`tag "${tagName}" not found in "${catName}"`);
          }
          tagId = tag.id;
        }
        const rows = Session.list(db, {
          since,
          category_id: cat?.id,
          tag_id: tagId,
        });
        const format = parseFormat(ctx.flags);
        ctx.print(
          render(rows, format, (list) =>
            list.length === 0
              ? "no sessions\n"
              : list
                  .map(
                    (s) =>
                      `#${s.id} ${s.status} ` +
                      `${formatDuration(
                        (s.ended_at ?? s.started_at) - s.started_at,
                      )}`,
                  )
                  .join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
  ];
}

/** Every command in the CLI. */
export function commands(deps: CommandDeps): Command[] {
  return [
    ...sessionCommands(deps),
    ...blockCommands(deps),
    ...viewCommands(deps),
    ...setupCommands(deps),
    ...daemonCommands(deps),
    ...hookCommands(deps),
  ];
}

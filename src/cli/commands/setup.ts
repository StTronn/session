// src/cli/commands/setup.ts
import { Category } from "@/core/category/category";
import { Tag } from "@/core/tag/tag";
import { Config } from "@/core/config/config";
import type { Command } from "@/cli/registry";
import { render } from "@/cli/format/format";
import { parseFormat, requirePositional } from "@/cli/args";
import type { CommandDeps } from "@/cli/commands/session";

export function setupCommands(deps: CommandDeps): Command[] {
  const { db, clock } = deps;
  return [
    {
      name: "category add",
      summary: "create a category: category add <name>",
      run: (ctx) => {
        const name = requirePositional(ctx.positionals, 0, "name");
        const c = Category.create(db, clock, name);
        ctx.print(`category #${c.id} ${c.name} created\n`);
        return 0;
      },
    },
    {
      name: "category list",
      summary: "list categories [--json|--toon]",
      run: (ctx) => {
        const rows = Category.list(db);
        ctx.print(
          render(rows, parseFormat(ctx.flags), (list) =>
            list.map((c) => `#${c.id} ${c.name}`).join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
    {
      name: "category rename",
      summary: "rename a category: category rename <id> <name>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        const name = requirePositional(ctx.positionals, 1, "name");
        Category.rename(db, id, name);
        ctx.print("renamed\n");
        return 0;
      },
    },
    {
      name: "category archive",
      summary: "archive a category: category archive <id>",
      run: (ctx) => {
        const id = Number(requirePositional(ctx.positionals, 0, "id"));
        Category.archive(db, id);
        ctx.print("archived\n");
        return 0;
      },
    },
    {
      name: "tag add",
      summary: "create a tag: tag add <category> <name>",
      run: (ctx) => {
        const catName = requirePositional(ctx.positionals, 0, "category");
        const name = requirePositional(ctx.positionals, 1, "name");
        const cat = Category.getByName(db, catName);
        if (!cat) throw new Error(`category "${catName}" not found`);
        const t = Tag.create(db, clock, cat.id, name);
        ctx.print(`tag #${t.id} ${catName}/${t.name} created\n`);
        return 0;
      },
    },
    {
      name: "tag list",
      summary: "list tags in a category: tag list <category> [--json|--toon]",
      run: (ctx) => {
        const catName = requirePositional(ctx.positionals, 0, "category");
        const cat = Category.getByName(db, catName);
        if (!cat) throw new Error(`category "${catName}" not found`);
        const rows = Tag.list(db, cat.id);
        ctx.print(
          render(rows, parseFormat(ctx.flags), (list) =>
            list.map((t) => `#${t.id} ${t.name}`).join("\n") + "\n",
          ),
        );
        return 0;
      },
    },
    {
      name: "config get",
      summary: "read a config value: config get <key>",
      run: (ctx) => {
        const key = requirePositional(ctx.positionals, 0, "key");
        ctx.print((Config.get(db, key) ?? "") + "\n");
        return 0;
      },
    },
    {
      name: "config set",
      summary: "write a config value: config set <key> <value>",
      run: (ctx) => {
        const key = requirePositional(ctx.positionals, 0, "key");
        const value = requirePositional(ctx.positionals, 1, "value");
        Config.set(db, key, value);
        ctx.print(`${key} = ${value}\n`);
        return 0;
      },
    },
  ];
}

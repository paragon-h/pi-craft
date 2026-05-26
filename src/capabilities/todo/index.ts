/**
 * Pi Craft — Todo Capability
 *
 * Persistent task list with TUI widget and session survival.
 * Survives /reload and compaction via session entry persistence.
 * Also syncs to .pi/craft/plans/{slug}/todos.md for human readability.
 *
 * Configuration:
 *   craft.enableTodo: boolean (default true)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCraftConfig, isOn } from "../../core/config";
import { getState } from "../../core/registry";
import type { WorkflowEngine } from "../../core/workflow-engine";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TodoTask {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "done";
  files?: string[];
}

interface TodoState {
  tasks: TodoTask[];
  updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// Persistence
// ═══════════════════════════════════════════════════════════════

const CUSTOM_TYPE = "craft-todo-state";

/** Resolve the todos.md path from the active workflow engine */
function getTodoPath(): string | null {
  const state = getState();
  const engine = state?.engine;
  if (!engine || !engine.isActive()) return null;
  const ctx = engine.getContext();
  return path.join(ctx.plansDir, "todos.md");
}

/** Write current state to todos.md (human readable) */
function syncToFile(tasks: TodoTask[]): void {
  const filePath = getTodoPath();
  if (!filePath) return;

  const done = tasks.filter(t => t.status === "done").length;
  const lines: string[] = [
    "# Todo List",
    "",
    `> Progress: ${done}/${tasks.length} done`,
    "",
  ];

  for (const t of tasks) {
    const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "⚡" : "⏳";
    const files = t.files?.length ? ` \`${t.files.join("`, `")}\`` : "";
    lines.push(`${icon} **${t.id}.** ${t.title}${files}`);
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  } catch { /* best effort */ }
}

/** Load state from session entry, return null if none */
function loadFromSession(ctx: ExtensionContext): TodoState | null {
  try {
    const entries = ctx.sessionManager.getBranch();
    for (const entry of entries) {
      if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
        return entry.data as TodoState;
      }
    }
  } catch { /* no session manager available */ }
  return null;
}

/** Save state to session entry */
function saveToSession(tasks: TodoTask[], pi: { appendEntry: (type: string, data: unknown) => void }): void {
  const state: TodoState = { tasks, updatedAt: Date.now() };
  pi.appendEntry(CUSTOM_TYPE, state);
}

// ═══════════════════════════════════════════════════════════════
// Widget Rendering
// ═══════════════════════════════════════════════════════════════

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  in_progress: "⚡",
  done: "✅",
};

const MAX_VISIBLE = 8;

function renderWidget(
  tasks: TodoTask[],
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string },
  _width: number,
): string[] {
  const fg = theme.fg.bind(theme);
  const bold = theme.bold.bind(theme);
  const lines: string[] = [];

  if (tasks.length === 0) {
    return [fg("dim", "  No tasks yet. Use the todo tool to add tasks.")];
  }

  const done = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const barWidth = Math.min(total > 0 ? Math.round((done / total) * 20) : 0, 20);
  const bar = "█".repeat(barWidth) + "░".repeat(20 - barWidth);

  lines.push(fg("toolTitle", bold(`  Tasks — ${done}/${total} done`)));
  lines.push(fg("muted", `  [${bar}]`));

  const visible = tasks.slice(0, MAX_VISIBLE);
  for (const t of visible) {
    const icon = STATUS_ICONS[t.status] ?? "●";
    const color = t.status === "done" ? "dim" : t.status === "in_progress" ? "warning" : "muted";
    const files = t.files?.length ? fg("dim", `  [${t.files.slice(0, 2).join(", ")}]`) : "";
    lines.push(`${fg(color, `  ${icon} ${t.id}.`)} ${fg("accent", t.title)}${files}`);
  }

  if (tasks.length > MAX_VISIBLE) {
    lines.push(fg("dim", `  ... and ${tasks.length - MAX_VISIBLE} more`));
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// Todo Manager
// ═══════════════════════════════════════════════════════════════

class TodoManager {
  private tasks: TodoTask[] = [];
  private nextId = 1;
  private pi: ExtensionAPI | null = null;

  constructor(pi?: ExtensionAPI) {
    this.pi = pi ?? null;
  }

  load(tasks: TodoTask[]): void {
    this.tasks = tasks;
    this.nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
  }

  getAll(): TodoTask[] {
    return [...this.tasks];
  }

  add(title: string, files?: string[]): TodoTask {
    const task: TodoTask = {
      id: this.nextId++,
      title,
      status: "pending",
      files,
    };
    this.tasks.push(task);
    this.persist();
    return task;
  }

  update(id: number, update: { status?: string; title?: string }): TodoTask | null {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return null;
    if (update.status && ["pending", "in_progress", "done"].includes(update.status)) {
      task.status = update.status as TodoTask["status"];
    }
    if (update.title !== undefined) {
      task.title = update.title;
    }
    this.persist();
    return task;
  }

  complete(id: number): TodoTask | null {
    return this.update(id, { status: "done" });
  }

  private persist(): void {
    syncToFile(this.tasks);
    if (this.pi) saveToSession(this.tasks, this.pi);
  }
}

// ═══════════════════════════════════════════════════════════════
// Extension Entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableTodo")) return;

  const manager = new TodoManager(pi);
  let widgetCtx: ExtensionContext | null = null;

  function updateTui(): void {
    if (!widgetCtx?.hasUI) return;
    const tasks = manager.getAll();
    if (tasks.length === 0) {
      widgetCtx.ui.setWidget("craft-todo", undefined);
    } else {
      const lines = renderWidget(tasks, widgetCtx.ui.theme, 80);
      widgetCtx.ui.setWidget("craft-todo", lines);
    }
  }

  // ── session_start: restore from session ──────────────
  pi.on("session_start", async (_event, ctx) => {
    widgetCtx = ctx;
    const saved = loadFromSession(ctx);
    if (saved && saved.tasks.length > 0) {
      manager.load(saved.tasks);
      updateTui();
    }
  });

  // ── Register todo tool ───────────────────────────────
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: [
      "Manage a persistent task list. Survives /reload and conversation compaction.",
      "Actions:",
      "  list — Show all tasks with status",
      "  add — Add a new task (title required)",
      "  update — Update task status or title (id + status/title required)",
      "  complete — Mark a task as done (id required)",
    ].join("\n"),
    parameters: Type.Object({
      action: Type.String({ description: "list | add | update | complete" }),
      id: Type.Optional(Type.Number({ description: "Task ID (for update/complete)" })),
      title: Type.Optional(Type.String({ description: "Task title (for add/update)" })),
      status: Type.Optional(Type.String({ description: "pending | in_progress | done (for update)" })),
      files: Type.Optional(Type.Array(Type.String(), { description: "Files involved (for add)" })),
    }),

    async execute(_toolCallId, params) {
      const action = (params as any).action as string;
      const id = (params as any).id as number | undefined;
      const title = (params as any).title as string | undefined;
      const status = (params as any).status as string | undefined;
      const files = (params as any).files as string[] | undefined;

      switch (action) {
        case "list": {
          const tasks = manager.getAll();
          if (tasks.length === 0) {
            return {
              content: [{ type: "text", text: "No tasks. Use todo({ action: \"add\", title: \"...\" }) to add." }],
              details: {},
            };
          }
          const lines = tasks.map(t => {
            const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "⚡" : "⏳";
            const files = t.files?.length ? ` [${t.files.join(", ")}]` : "";
            return `${icon} ${t.id}. ${t.title}${files}`;
          });
          const done = tasks.filter(t => t.status === "done").length;
          return {
            content: [{ type: "text", text: `Tasks (${done}/${tasks.length} done):\n${lines.join("\n")}` }],
            details: {},
          };
        }

        case "add": {
          if (!title) {
            return { content: [{ type: "text", text: "title is required for add." }], details: {} };
          }
          const task = manager.add(title, files);
          updateTui();
          return {
            content: [{ type: "text", text: `✅ Added task #${task.id}: ${task.title}` }],
            details: {},
          };
        }

        case "update": {
          if (!id) {
            return { content: [{ type: "text", text: "id is required for update." }], details: {} };
          }
          const task = manager.update(id, { status, title });
          if (!task) {
            return { content: [{ type: "text", text: `Task #${id} not found.` }], details: {} };
          }
          updateTui();
          return {
            content: [{ type: "text", text: `Updated task #${task.id}: ${task.title} (${task.status})` }],
            details: {},
          };
        }

        case "complete": {
          if (!id) {
            return { content: [{ type: "text", text: "id is required for complete." }], details: {} };
          }
          const task = manager.complete(id);
          if (!task) {
            return { content: [{ type: "text", text: `Task #${id} not found.` }], details: {} };
          }
          updateTui();
          return {
            content: [{ type: "text", text: `✅ Task #${task.id} completed: ${task.title}` }],
            details: {},
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${action}. Use list, add, update, or complete.` }],
            details: {},
          };
      }
    },
  });

  // ── turn_end: refresh widget ────────────────────────
  pi.on("turn_end", async () => {
    updateTui();
  });
}

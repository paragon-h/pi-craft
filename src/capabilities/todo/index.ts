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
import { getCraftConfig, isOn } from "../../core/config";
import { getState } from "../../core/registry";
import {
  type TodoTask,
  TodoManager,
  renderWidget,
  syncToFile,
} from "./manager.js";

// ═══════════════════════════════════════════════════════════════
// Types (re-exported from manager)
// ═══════════════════════════════════════════════════════════════

export type { TodoTask } from "./manager.js";

interface TodoState {
  tasks: TodoTask[];
  updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// Session Persistence
// ═══════════════════════════════════════════════════════════════

const CUSTOM_TYPE = "craft-todo-state";

/** Load state from session entry, return null if none */
function loadFromSession(ctx: ExtensionContext): TodoState | null {
  try {
    const entries = ctx.sessionManager.getBranch();
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].type === "custom" && entries[i].customType === CUSTOM_TYPE) {
        return entries[i].data as TodoState;
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
// Extension Entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableTodo")) return;

  const manager = new TodoManager((tasks) => {
    syncToFile(tasks);
    saveToSession(tasks, pi);
  });
  let widgetCtx: ExtensionContext | null = null;

  // Register reset callback for workflow completion
  const state = getState();
  if (state) state.resetTodo = () => { manager.clear(); updateTui(); };

  function updateTui(): void {
    if (!widgetCtx?.hasUI) return;
    const tasks = manager.getAll();
    const allDone = tasks.length > 0 && tasks.every(t => t.status === "done");
    if (tasks.length === 0 || allDone) {
      widgetCtx.ui.setWidget("craft-todo", undefined);
      if (allDone) manager.clear();
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
      "  clear — Remove all tasks",
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

        case "clear": {
          manager.clear();
          updateTui();
          return {
            content: [{ type: "text", text: "🧹 All tasks cleared." }],
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

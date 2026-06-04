/**
 * Pi Craft — Tilldone Capability (任务纪律系统)
 *
 * Enforces task discipline: LLM must define tasks before writing code,
 * can only edit files declared in the active task.
 *
 * Configuration:
 *   craft.enableTilldone: boolean (default false — opt-in, strict)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getCraftConfig, isEnabled } from "../../../core/config";
import type { TilldoneTask, TilldoneState } from "./utils.js";
import { isBashWrite, isDeclaredFile, renderTilldoneWidget } from "./utils.js";

export type { TilldoneTask, TilldoneState } from "./utils.js";

const WRITE_TOOLS = new Set(["write", "edit"]);

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isEnabled(config, "enableTilldone")) return;

  const state: TilldoneState = {
    defined: false,
    tasks: [],
    activeIdx: -1,
    statuses: [],
  };

  let widgetCtx: ExtensionContext | null = null;

  function updateWidget(): void {
    if (!widgetCtx?.hasUI || !state.defined) {
      widgetCtx?.ui?.setWidget?.("craft-tilldone", undefined);
      return;
    }
    const lines = renderTilldoneWidget(state, widgetCtx.ui.theme);
    widgetCtx.ui.setWidget("craft-tilldone", lines);
  }

  pi.on("session_start", async (_event, ctx) => {
    widgetCtx = ctx;
  });

  pi.on("tool_call", async (event, ctx) => {
    const tool = event.toolName;
    const input = event.input as Record<string, unknown>;

    const isWrite = WRITE_TOOLS.has(tool);
    const isBashWriteOp = tool === "bash" && isBashWrite((input.command as string) || "");

    if (!isWrite && !isBashWriteOp) return;

    if (!state.defined) {
      return {
        block: true,
        reason: `[Tilldone] 尚未定义任务清单。请先调用 tilldone({ action: "define", tasks: [...] }) 再开始编码。`,
      };
    }

    if (isWrite) {
      const filePath = (input.path || input.file_path || "") as string;
      if (!filePath) return;

      const activeTask = state.activeIdx >= 0 ? state.tasks[state.activeIdx] : null;
      const declaredFiles = activeTask?.files ?? [];
      if (declaredFiles.length === 0) return;

      if (!isDeclaredFile(filePath, declaredFiles)) {
        if (!ctx.hasUI) {
          return {
            block: true,
            reason: `[Tilldone] 文件 "${filePath}" 不在当前任务声明的文件列表中。\n当前任务: ${activeTask!.title}\n声明文件: ${declaredFiles.join(", ")}`,
          };
        }

        const ok = await ctx.ui.confirm(
          "⚠️ Tilldone: 文件范围警告",
          `你正在操作文件 "${filePath}"\n\n当前任务 "${activeTask!.title}" 声明的文件:\n  ${declaredFiles.join("\n  ")}`,
        );
        if (!ok) {
          return {
            block: true,
            reason: `[Tilldone] 用户拒绝了任务范围外的文件操作。\n文件: ${filePath}\n当前任务: ${activeTask!.title}`,
          };
        }
      }
    }
  });

  pi.registerTool({
    name: "tilldone",
    label: "Tilldone",
    description: [
      "Task discipline system — enforce define → execute → verify workflow.",
      "Actions:",
      "  define — Define task list. REQUIRED before any code writing.",
      "  start  — Start working on a specific task (by 1-based index).",
      "  complete — Mark current task as done.",
      "  status — Show current progress.",
    ].join("\n"),
    parameters: Type.Object({
      action: Type.String({ description: "define | start | complete | status" }),
      tasks: Type.Optional(Type.Array(Type.Object({
        title: Type.String({ description: "Task title" }),
        files: Type.Optional(Type.Array(Type.String(), { description: "Files this task will touch" })),
      }), { description: "Task list (required for define action)" })),
      id: Type.Optional(Type.Number({ description: "Task ID (1-based, for start/complete)" })),
    }),

    async execute(_toolCallId, params) {
      const action = (params as any).action as string;
      const tasks = (params as any).tasks as TilldoneTask[] | undefined;
      const id = (params as any).id as number | undefined;

      switch (action) {
        case "define": {
          if (!tasks || tasks.length === 0) {
            return { content: [{ type: "text", text: "tasks array is required for define." }], details: {} };
          }
          state.tasks = tasks;
          state.statuses = tasks.map(() => "pending");
          state.activeIdx = -1;
          state.defined = true;
          updateWidget();

          const taskList = tasks.map((t, i) => {
            const files = t.files?.length ? ` [${t.files.join(", ")}]` : "";
            return `  ${i + 1}. ${t.title}${files}`;
          }).join("\n");

          return {
            content: [{
              type: "text",
              text: `✅ ${tasks.length} tasks defined. Use tilldone({ action: "start", id: 1 }) to begin.\n\n${taskList}`,
            }],
            details: {},
          };
        }

        case "start": {
          if (!state.defined) {
            return { content: [{ type: "text", text: "Call define first." }], details: {} };
          }
          if (!id || id < 1 || id > state.tasks.length) {
            return { content: [{ type: "text", text: `Invalid task ID: ${id}. Range: 1-${state.tasks.length}` }], details: {} };
          }
          if (state.activeIdx === id - 1) {
            return { content: [{ type: "text", text: `Already on task ${id}: ${state.tasks[id - 1].title}` }], details: {} };
          }

          state.activeIdx = id - 1;
          updateWidget();

          const t = state.tasks[state.activeIdx];
          const files = t.files?.length ? `\nFiles: ${t.files.join(", ")}` : "";
          return {
            content: [{ type: "text", text: `⚡ Started task ${id}: ${t.title}${files}\n\nStatus: ${state.statuses.filter(s => s === "done").length}/${state.tasks.length} done` }],
            details: {},
          };
        }

        case "complete": {
          if (!state.defined) {
            return { content: [{ type: "text", text: "No tasks defined yet." }], details: {} };
          }
          const targetIdx = id ? id - 1 : state.activeIdx;
          if (targetIdx < 0 || targetIdx >= state.tasks.length) {
            return { content: [{ type: "text", text: "No active task. Use tilldone({ action: \"start\", id: N }) first." }], details: {} };
          }

          state.statuses[targetIdx] = "done";
          const nextPending = state.statuses.findIndex((s, i) => i > targetIdx && s === "pending");
          state.activeIdx = nextPending >= 0 ? nextPending : -1;

          updateWidget();

          const doneCount = state.statuses.filter(s => s === "done").length;
          const allDone = doneCount === state.tasks.length;
          const nextMsg = allDone ? "\n\n🎉 All tasks completed!" : nextPending >= 0 ? `\n\nAuto-advanced to task ${nextPending + 1}: ${state.tasks[nextPending].title}` : "\n\nNo more pending tasks.";

          return {
            content: [{ type: "text", text: `✅ Task ${targetIdx + 1} completed: ${state.tasks[targetIdx].title} (${doneCount}/${state.tasks.length} done)${nextMsg}` }],
            details: {},
          };
        }

        case "status": {
          if (!state.defined) {
            return { content: [{ type: "text", text: "No tasks defined." }], details: {} };
          }
          const lines = state.tasks.map((t, i) => {
            const isDone = state.statuses[i] === "done";
            const icon = isDone ? "✅" : i === state.activeIdx ? "⚡" : "⏳";
            const files = t.files?.length ? ` [${t.files.join(", ")}]` : "";
            return `${icon} ${i + 1}. ${t.title}${files}`;
          });
          return {
            content: [{ type: "text", text: `Tilldone (${state.statuses.filter(s => s === "done").length}/${state.tasks.length} done):\n${lines.join("\n")}` }],
            details: {},
          };
        }

        default:
          return { content: [{ type: "text", text: `Unknown action: ${action}.` }], details: {} };
      }
    },
  });

  pi.on("turn_end", async () => {
    updateWidget();
  });
}

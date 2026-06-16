/**
 * Progress Widget Extension
 *
 * 常驻一行进度条，显示在输入编辑器上方：
 * - 📋 任务进度（从 todo 工具重建）
 * - 📁 文件变更统计
 * - 💰 累计成本
 *
 * 纯内存操作，零 I/O。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Task } from "../../shared/types";
import { computeSessionCost, reconstructTodoState, scanFileChanges } from "../../shared/session";

interface WidgetState {
  tasks: Task[];
  fileChanges: Map<string, "write" | "read">;
  totalCost: number;
  totalInput: number;
  totalOutput: number;
}

export default function (pi: ExtensionAPI) {
  const state: WidgetState = {
    tasks: [],
    fileChanges: new Map(),
    totalCost: 0,
    totalInput: 0,
    totalOutput: 0,
  };

  function reconstructAll(ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getBranch();
    state.tasks = reconstructTodoState(entries)?.tasks ?? [];
    state.fileChanges = new Map(scanFileChanges(entries).map((f) => [f.path, f.type] as [string, "write" | "read"]));
    const cost = computeSessionCost(entries);
    state.totalCost = cost.totalCost;
    state.totalInput = cost.totalInput;
    state.totalOutput = cost.totalOutput;
  }

  function renderWidget(_tui: unknown, theme: { fg: (color: string, text: string) => string }) {
    const segments: string[] = [];

    // Tasks: only show if there are active (not-done) tasks
    if (state.tasks.length > 0) {
      const active = state.tasks.filter(
        (t) => t.status === "in_progress" || t.status === "queued",
      ).length;
      const total = state.tasks.filter((t) => t.status !== "cancelled").length;
      if (active > 0) {
        segments.push(`📋 任务 ${active}/${total}`);
      }
    }

    // Files
    if (state.fileChanges.size > 0) {
      segments.push(`📁 ${state.fileChanges.size} 个文件`);
    }

    // Cost
    if (state.totalCost > 0) {
      segments.push(`💰 $${state.totalCost.toFixed(2)}`);
    }

    if (segments.length === 0) {
      return { render: () => [], invalidate: () => {} };
    }

    const line = segments.join("  │  ");
    return {
      render: () => [theme.fg("muted", line)],
      invalidate: () => {},
    };
  }

  function refreshWidget(ctx: ExtensionContext) {
    ctx.ui.setWidget("progress-widget", (_tui: unknown, theme: any) =>
      renderWidget(_tui, theme),
    );
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    reconstructAll(ctx);
    refreshWidget(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    reconstructAll(ctx);
    refreshWidget(ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!ctx.hasUI) return;
    const path = event.args?.path ?? event.args?.filePath;
    if (!path) return;
    if (event.toolName === "write" || event.toolName === "edit") {
      state.fileChanges.set(path, "write");
      refreshWidget(ctx);
    } else if (event.toolName === "read" && !state.fileChanges.has(path)) {
      state.fileChanges.set(path, "read");
      refreshWidget(ctx);
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!ctx.hasUI) return;
    const usage = (event.message as any)?.usage;
    if (usage) {
      state.totalInput += usage.input ?? 0;
      state.totalOutput += usage.output ?? 0;
      state.totalCost += usage.cost?.total ?? 0;
      refreshWidget(ctx);
    }
  });
}

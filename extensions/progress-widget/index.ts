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

interface Task {
  id: number;
  title: string;
  status: "queued" | "in_progress" | "done" | "cancelled";
}

interface TodoDetails {
  action: string;
  tasks: Task[];
  nextId: number;
  error?: string;
}

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

  function reconstructTodo(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "todo"
      ) {
        const details = entry.message.details as TodoDetails | undefined;
        if (details && Array.isArray(details.tasks)) {
          state.tasks = details.tasks.map((t: Task) => ({ ...t }));
          return;
        }
      }
    }
  }

  function reconstructFileChanges(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
    state.fileChanges.clear();
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        const content = entry.message.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (block.type !== "toolCall" || !block.name) continue;
          const path = block.args?.path ?? block.args?.filePath;
          if (!path) continue;
          if (block.name === "write" || block.name === "edit") {
            state.fileChanges.set(path, "write");
          } else if (block.name === "read" && !state.fileChanges.has(path)) {
            state.fileChanges.set(path, "read");
          }
        }
      }
    }
  }

  function reconstructCost(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
    state.totalCost = 0;
    state.totalInput = 0;
    state.totalOutput = 0;
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        const usage = entry.message.usage;
        if (usage) {
          state.totalInput += usage.input ?? 0;
          state.totalOutput += usage.output ?? 0;
          state.totalCost += usage.cost?.total ?? 0;
        }
      }
    }
  }

  function reconstructAll(ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getBranch();
    reconstructTodo(entries);
    reconstructFileChanges(entries);
    reconstructCost(entries);
  }

  function renderWidget(_tui: unknown, theme: Record<string, (s: string) => string>) {
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
    const usage = event.message?.usage;
    if (usage) {
      state.totalInput += usage.input ?? 0;
      state.totalOutput += usage.output ?? 0;
      state.totalCost += usage.cost?.total ?? 0;
      refreshWidget(ctx);
    }
  });
}

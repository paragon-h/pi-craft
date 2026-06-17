/**
 * Activity Widget Extension — fixed widget above the editor.
 *
 * Panels:
 * - 📁 文件变更 — files changed in this session (write/edit/read)
 * - 📋 任务 — todo tasks with active/folded summary
 * - 💰 成本 — token usage and cost breakdown
 * - 🌿 Git — branch name + working tree status
 *
 * Extensible: register more SidebarPanel implementations to add sections.
 * This is a read-only display widget (pi's widget API does not support
 * keyboard input). Panel actions are preserved in the interface for
 * future extensibility.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { computeSessionCost, reconstructTodoState, scanFileChanges } from "../../shared/session";
import { SidebarShell } from "./shell";
import { FilesPanel } from "./panels/files";
import { TasksPanel } from "./panels/tasks";
import { CostPanel } from "./panels/cost";
import { GitPanel } from "./panels/git";

export default function (pi: ExtensionAPI) {
  let shell: SidebarShell | null = null;
  const filesPanel = new FilesPanel();
  const tasksPanel = new TasksPanel();
  const costPanel = new CostPanel();
  const gitPanel = new GitPanel();

  function updateAllPanels(ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getBranch();

    // Files
    filesPanel.update(scanFileChanges(entries));

    // Tasks
    const todoState = reconstructTodoState(entries);
    tasksPanel.update(todoState?.tasks ?? []);

    // Cost
    costPanel.update(computeSessionCost(entries));

    // Git (async — fire and forget, will re-render on completion)
    gitPanel.refresh(ctx.cwd).then(() => { if (shell) shell.refresh(); });

    shell?.refresh();
  }

  function createWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (shell) return; // already created

    ctx.ui.setWidget("activity-widget", (tui, theme) => {
      shell = new SidebarShell(tui, theme);
      shell.registerPanel(filesPanel);
      shell.registerPanel(tasksPanel);
      shell.registerPanel(costPanel);
      shell.registerPanel(gitPanel);
      return shell;
    });
  }

  // ── Lifecycle events ───────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateAllPanels(ctx);
    createWidget(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateAllPanels(ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!ctx.hasUI || !shell) return;

    // File-related tools: incrementally track files
    const path = event.args?.path ?? event.args?.filePath;
    if (path && (event.toolName === "write" || event.toolName === "edit" || event.toolName === "read")) {
      const type = event.toolName === "read" ? "read" : "write";
      filesPanel.trackFile(path, type);
      shell.refresh();
    }
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (!ctx.hasUI || !shell) return;

    // Todo tool: update tasks panel
    if (event.toolName === "todo") {
      const todoState = reconstructTodoState(ctx.sessionManager.getBranch());
      tasksPanel.update(todoState?.tasks ?? []);
      shell.refresh();
    }

    // File mutating tools: refresh git panel
    if (event.toolName === "write" || event.toolName === "edit") {
      const s = shell;
      gitPanel.refresh(ctx.cwd).then(() => s.refresh());
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.hasUI || !shell) return;
    costPanel.update(computeSessionCost(ctx.sessionManager.getBranch()));
    shell.refresh();
  });
}

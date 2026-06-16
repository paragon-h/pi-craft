/**
 * Activity Sidebar Extension — fixed sidebar widget above the editor.
 *
 * Shows changed files (Phase 1) in a panel-based layout. Extensible:
 * register more SidebarPanel implementations to add sections.
 *
 * This is a read-only display widget (pi's widget API does not support
 * keyboard input). Panel actions are preserved in the interface for
 * future extensibility.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { scanFileChanges } from "../../shared/session";
import { SidebarShell } from "./shell";
import { FilesPanel } from "./panels/files";

export default function (pi: ExtensionAPI) {
  let shell: SidebarShell | null = null;
  const filesPanel = new FilesPanel();

  function updateFilesPanel(ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getBranch();
    const fileChanges = scanFileChanges(entries);
    filesPanel.update(fileChanges);
    shell?.refresh();
  }

  function createWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (shell) return; // already created

    ctx.ui.setWidget("activity-sidebar", (tui, theme) => {
      shell = new SidebarShell(tui, theme);
      shell.registerPanel(filesPanel);
      return shell;
    });
  }

  // ── Lifecycle events ───────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateFilesPanel(ctx);
    createWidget(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateFilesPanel(ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!ctx.hasUI || !shell) return;
    const path = event.args?.path ?? event.args?.filePath;
    if (!path) return;
    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "read") {
      updateFilesPanel(ctx);
    }
  });
}

/**
 * Activity Sidebar Extension — toggleable right-side sidebar with
 * extensible panels (files, tasks, cost, git — Phase 1: files only).
 *
 * Toggle: Ctrl+Shift+B
 * Navigation: ↑↓ to move, Tab/Shift+Tab to switch panels, Enter for action,
 *             Esc to release focus back to editor, Ctrl+Shift+B again to hide.
 *
 * The sidebar is a persistent overlay that starts hidden. It uses
 * handle.setHidden() for visibility and handle.focus()/unfocus() for
 * input ownership.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, type OverlayHandle } from "@earendil-works/pi-tui";
import { scanFileChanges } from "../../shared/session";
import { SidebarShell } from "./shell";
import { FilesPanel } from "./panels/files";

export default function (pi: ExtensionAPI) {
  let overlayHandle: OverlayHandle | null = null;
  let shell: SidebarShell | null = null;
  const filesPanel = new FilesPanel();

  function updateFilesPanel(ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getBranch();
    const fileChanges = scanFileChanges(entries);
    filesPanel.update(fileChanges);
    shell?.refresh();
  }

  function createOverlay(ctx: ExtensionContext): void {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (shell) return; // already created

    // Create the overlay (not awaited — persists for session lifetime)
    ctx.ui.custom<void>(
      (tui, theme, _kb, _done) => {
        shell = new SidebarShell(tui, theme, () => {
          // onHide: hide sidebar and release focus
          overlayHandle?.setHidden(true);
          overlayHandle?.unfocus();
        });
        shell.registerPanel(filesPanel);
        return shell;
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "right-center",
          width: "35%",
          minWidth: 40,
          maxHeight: "90%",
          margin: { right: 1 },
          visible: (termWidth: number) => termWidth >= 80,
        },
        onHandle: (handle: OverlayHandle) => {
          overlayHandle = handle;
          handle.setHidden(true); // start hidden
          handle.unfocus(); // editor keeps input
        },
      },
    );
  }

  // ── Lifecycle events ───────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateFilesPanel(ctx);
    createOverlay(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateFilesPanel(ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!ctx.hasUI || !shell) return;
    // Only refresh if it's a file-related tool
    const path = event.args?.path ?? event.args?.filePath;
    if (!path) return;
    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "read") {
      updateFilesPanel(ctx);
    }
  });

  // ── Shortcut: Ctrl+G ───────────────────────────────────────────

  pi.registerShortcut(Key.ctrlShift("b"), {
    description: "Toggle activity sidebar",
    handler: async (_ctx) => {
      if (!overlayHandle) return;

      if (overlayHandle.isHidden()) {
        // Hidden → show and focus
        overlayHandle.setHidden(false);
        overlayHandle.focus();
      } else if (overlayHandle.isFocused()) {
        // Visible + focused → hide
        overlayHandle.setHidden(true);
        overlayHandle.unfocus();
      } else {
        // Visible but not focused → focus
        overlayHandle.focus();
      }
    },
  });
}

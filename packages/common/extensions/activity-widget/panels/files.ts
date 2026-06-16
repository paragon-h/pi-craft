/**
 * Files Panel — shows files changed in the current session.
 *
 * Sources data from shared/session.ts's scanFileChanges().
 * Each file becomes a PanelItem with a write/read icon and path.
 */

import type { FileChange } from "../../../shared/types";
import type { PanelItem, SidebarPanel } from "../types";

export class FilesPanel implements SidebarPanel {
  id = "files";
  title = "文件变更";

  private fileChanges: FileChange[] = [];

  /** Update the file list (called by the extension on tool events). */
  update(fileChanges: FileChange[]): void {
    this.fileChanges = fileChanges;
  }

  /** Incrementally add/update a single file (for tool_execution_start). */
  trackFile(path: string, type: "write" | "read"): void {
    const existing = this.fileChanges.find((f) => f.path === path);
    if (existing) {
      // Upgrade read → write, never downgrade
      if (type === "write") existing.type = "write";
    } else {
      this.fileChanges.push({ path, type });
    }
  }

  getItems(): PanelItem[] {
    return this.fileChanges.map((f, i) => ({
      id: `file-${i}`,
      icon: f.type === "write" ? "✏️" : "📖",
      label: f.path,
      action: undefined, // Phase 4: will open diff view
    }));
  }

  getSummary(): string {
    const writes = this.fileChanges.filter((f) => f.type === "write").length;
    const reads = this.fileChanges.filter((f) => f.type === "read").length;
    if (writes === 0 && reads === 0) return "0";
    return reads > 0 ? `${writes}写 ${reads}读` : `${writes}写`;
  }

  onAction?(_item: PanelItem): void {
    // Phase 4: will open diff view for the selected file
  }
}

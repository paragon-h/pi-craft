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

  getItems(): PanelItem[] {
    return this.fileChanges.map((f, i) => ({
      id: `file-${i}`,
      icon: f.type === "write" ? "✏️" : "📖",
      label: f.path,
      action: undefined, // Phase 4: will open diff view
    }));
  }

  onAction?(_item: PanelItem): void {
    // Phase 4: will open diff view for the selected file
  }
}

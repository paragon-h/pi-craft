/**
 * Git Panel — shows git branch and working tree status.
 *
 * Fetches git data asynchronously (node:child_process exec) and caches
 * results for synchronous getItems(). Polls on tool_execution_start
 * (file operations may change git state).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { PanelItem, SidebarPanel } from "../types";

const execAsync = promisify(exec);

interface GitState {
  branch: string | null;
  statusLines: string[];
  error: string | null;
}

export class GitPanel implements SidebarPanel {
  id = "git";
  title = "Git";

  private state: GitState = { branch: null, statusLines: [], error: null };

  /** Trigger async fetch of git status for the given cwd. */
  async refresh(cwd: string): Promise<void> {
    try {
      const { stdout: branch } = await execAsync(
        "git branch --show-current",
        { cwd, encoding: "utf-8", timeout: 3000 },
      );
      const { stdout: status } = await execAsync(
        "git status --porcelain",
        { cwd, encoding: "utf-8", timeout: 3000 },
      );
      this.state = {
        branch: branch.trim() || null,
        statusLines: status.trim().split("\n").filter(Boolean),
        error: null,
      };
    } catch (e: any) {
      this.state = {
        branch: null,
        statusLines: [],
        error: e?.message ?? "git not available",
      };
    }
  }

  getItems(): PanelItem[] {
    const s = this.state;

    if (!s.branch && s.error) {
      return [{ id: "git-error", icon: "🌿", label: `不在 git 仓库中` }];
    }

    if (!s.branch && !s.error) {
      return [{ id: "git-loading", icon: "🌿", label: `加载中...` }];
    }

    const items: PanelItem[] = [];

    // Branch name
    items.push({ id: "git-branch", icon: "🌿", label: s.branch! });

    // Classify status lines
    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];

    for (const line of s.statusLines) {
      // git status --porcelain format: XY path
      const xy = line.slice(0, 2);
      const file = line.slice(3);

      if (xy.includes("?")) {
        untracked.push(file);
      } else if (xy.includes("A")) {
        added.push(file);
      } else if (xy.includes("D")) {
        deleted.push(file);
      } else if (xy.includes("M")) {
        modified.push(file);
      } else {
        // Other changes (renamed, etc.)
        modified.push(file);
      }
    }

    // Grouped, compact file lists (up to 3 per group)
    const compactFiles = (files: string[]): string => {
      return files.length <= 3
        ? files.join(", ")
        : files.slice(0, 3).join(", ") + ` ... +${files.length - 3}`;
    };

    if (modified.length) items.push({ id: "git-modified", icon: "  ", label: `${modified.length} 修改: ${compactFiles(modified)}` });
    if (added.length) items.push({ id: "git-added", icon: "  ", label: `${added.length} 新增: ${compactFiles(added)}` });
    if (deleted.length) items.push({ id: "git-deleted", icon: "  ", label: `${deleted.length} 删除: ${compactFiles(deleted)}` });
    if (untracked.length) items.push({ id: "git-untracked", icon: "  ", label: `${untracked.length} 未跟踪: ${compactFiles(untracked)}` });

    if (s.statusLines.length === 0) {
      items.push({ id: "git-clean", icon: "  ", label: "working tree clean" });
    }

    return items;
  }

  getSummary(): string {
    const s = this.state;
    if (s.error && !s.branch) return "-";
    return s.branch ?? "detached";
  }

  onAction?(_item: PanelItem): void {
    // Informational panel — no actions
  }
}

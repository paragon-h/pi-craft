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

    if (s.error && !s.branch) {
      return [{ id: "git-error", icon: "🌿", label: `不在 git 仓库中` }];
    }

    const items: PanelItem[] = [];

    // Branch name
    items.push({ id: "git-branch", icon: "🌿", label: s.branch ?? "detached" });

    // Status lines
    for (let i = 0; i < s.statusLines.length; i++) {
      items.push({ id: `git-status-${i}`, icon: "  ", label: s.statusLines[i]! });
    }

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

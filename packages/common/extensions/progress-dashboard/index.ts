/**
 * Progress Dashboard Extension — /progress 命令，TUI overlay 完整仪表盘
 *
 * 四个面板：
 * - 📋 任务（从 todo 工具重建）
 * - 📁 文件变更（从 assistant tool_calls 扫描）
 * - 💰 成本统计（从 assistant usage 累加）
 * - 🌿 Git 状态（实时 git status）
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";
import type { FileChange, Task } from "../../shared/types";
import { formatCost, formatTokens } from "../../shared/format";
import { computeSessionCost, reconstructTodoState, scanFileChanges } from "../../shared/session";
import { findProjectSessionDir, scanProjectCost } from "../../shared/project";

interface DashboardData {
  tasks: Task[];
  fileChanges: FileChange[];
  sessionCost: number;
  sessionInput: number;
  sessionOutput: number;
  projectCost: number;
  sessionCount: number;
  gitBranch: string | null;
  gitStatus: string | null;
  gitError: string | null;
}

function scanSession(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
  const tasks = reconstructTodoState(entries)?.tasks ?? [];
  const fileChanges = scanFileChanges(entries);
  const cost = computeSessionCost(entries);
  return {
    tasks,
    fileChanges,
    sessionCost: cost.totalCost,
    sessionInput: cost.totalInput,
    sessionOutput: cost.totalOutput,
  };
}

function scanGit(cwd: string): { gitBranch: string | null; gitStatus: string | null; gitError: string | null } {
  try {
    const branch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    return {
      gitBranch: branch || null,
      gitStatus: status || null,
      gitError: null,
    };
  } catch (e: any) {
    return {
      gitBranch: null,
      gitStatus: null,
      gitError: e?.message ?? "unknown error",
    };
  }
}


class ProgressDashboardComponent {
  private data: DashboardData;
  private theme: any;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(data: DashboardData, theme: any, onClose: () => void) {
    this.data = data;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "enter")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const lines: string[] = [];
    const th = this.theme;
    const d = this.data;

    // ── Header ──
    lines.push("");
    const title = th.fg("accent", th.bold(" 📊 进度仪表盘 "));
    const headerLine =
      th.fg("borderMuted", "─".repeat(2)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 13)));
    lines.push(truncateToWidth(headerLine, width));

    // ── 任务 ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("📋 任务"))}`, width));
    if (d.tasks.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "暂无任务")}`, width));
    } else {
      for (const t of d.tasks) {
        if (t.status === "cancelled") continue;
        let icon: string;
        let style: (s: string) => string;
        switch (t.status) {
          case "in_progress":
            icon = "🔄";
            style = th.fg.bind(th, "accent");
            break;
          case "done":
            icon = "✅";
            style = th.fg.bind(th, "dim");
            break;
          default:
            icon = "⬜";
            style = th.fg.bind(th, "muted");
        }
        lines.push(
          truncateToWidth(`  ${icon} ${th.fg("accent", `#${t.id}`)} ${style(t.title)}`, width),
        );
      }
    }

    // ── 文件变更 ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("📁 文件变更 (本次 session)"))}`, width));
    if (d.fileChanges.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "暂无变更")}`, width));
    } else {
      for (const f of d.fileChanges) {
        const icon = f.type === "write" ? "✏️" : "📖";
        const label = f.type === "read" ? " (只读)" : "";
        lines.push(
          truncateToWidth(`  ${icon} ${th.fg("muted", f.path + label)}`, width),
        );
      }
    }

    // ── 成本 ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("💰 成本统计"))}`, width));
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "本次:")} ${th.fg("text", formatCost(d.sessionCost))} (↑${formatTokens(d.sessionInput)} ↓${formatTokens(d.sessionOutput)} tokens)`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "项目累计:")} ${th.fg("text", formatCost(d.projectCost))} (${d.sessionCount} sessions)`,
        width,
      ),
    );

    // ── Git ──
    lines.push("");
    if (d.gitError) {
      lines.push(truncateToWidth(`  ${th.fg("text", th.bold("🌿 Git"))}`, width));
      lines.push(truncateToWidth(`  ${th.fg("dim", d.gitError)}`, width));
    } else if (d.gitBranch === null) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "🌿 不在 git 仓库中")}`, width));
    } else {
      lines.push(
        truncateToWidth(`  ${th.fg("text", th.bold("🌿 Git:"))} ${th.fg("accent", d.gitBranch)}`, width),
      );
      if (d.gitStatus) {
        for (const line of d.gitStatus.split("\n")) {
          lines.push(truncateToWidth(`  ${th.fg("muted", line)}`, width));
        }
      } else {
        lines.push(truncateToWidth(`  ${th.fg("dim", "working tree clean")}`, width));
      }
    }

    // ── Footer ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "按 Esc 关闭")}`, width));
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("progress", {
    description: "Show progress dashboard: tasks, file changes, cost, git status",
    handler: async (_args, ctx) => {
      // Scan current session
      const entries = ctx.sessionManager.getBranch();
      const session = scanSession(entries);

      // Scan git and cross-session cost
      const git = scanGit(ctx.cwd);
      const sessionDir = ctx.sessionManager.getSessionDir();
      const projectDir = findProjectSessionDir(ctx.cwd, sessionDir);
      const { reports } = projectDir ? scanProjectCost(projectDir) : { reports: [] };
      const projectCost = reports.reduce((sum, r) => sum + r.totalCost, 0);
      const sessionCount = reports.length;

      const data: DashboardData = {
        ...session,
        projectCost,
        sessionCount,
        gitBranch: git.gitBranch,
        gitStatus: git.gitStatus,
        gitError: git.gitError,
      };

      if (ctx.mode !== "tui") {
        // Non-TUI: plain text fallback
        const lines: string[] = [];
        lines.push(`📊 Progress Dashboard`);
        lines.push(`Tasks: ${data.tasks.filter((t) => t.status !== "cancelled").length}`);
        lines.push(`Files changed: ${data.fileChanges.length}`);
        lines.push(`Cost: ${formatCost(data.sessionCost)} (project: ${formatCost(data.projectCost)})`);
        if (data.gitBranch) lines.push(`Git: ${data.gitBranch}`);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // TUI: overlay
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new ProgressDashboardComponent(data, theme, () => done());
      });
    },
  });
}

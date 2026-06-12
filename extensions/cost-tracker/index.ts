/**
 * Cost Tracker Extension — Token usage & cost observability dashboard.
 *
 * Features:
 * - /cost command — per-turn & per-tool breakdown for current session (TUI overlay)
 * - /cost-report command — cross-session aggregate report (TUI overlay)
 * - No budgets, no limits, pure observability
 * - Data sourced on-demand from session entries (no double-write, no state management)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";

// ─── Data Types ────────────────────────────────────────────────────────

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface TurnCost {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  toolNames: string[];
}

interface ToolUsage {
  calls: number;
  cost: number;
}

interface SessionCost {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  turns: TurnCost[];
  toolBreakdown: Record<string, ToolUsage>;
}

interface SessionCostReport {
  sessionPath: string;
  sessionName: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

/** Extract per-turn and per-tool cost from session branch entries (on-demand scan). */
function computeSessionCost(entries: Array<{ type: string; message?: any }>): SessionCost {
  const turns: TurnCost[] = [];
  const toolBreakdown: Record<string, ToolUsage> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;
  let turnIndex = 0;

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;

    const usage: Usage | undefined = msg.usage;
    if (!usage || typeof usage.input !== "number") continue;

    turnIndex++;
    totalInput += usage.input ?? 0;
    totalOutput += usage.output ?? 0;
    totalCacheRead += usage.cacheRead ?? 0;
    totalCacheWrite += usage.cacheWrite ?? 0;
    totalCost += usage.cost?.total ?? 0;

    // Collect tool names from assistant content
    const toolNames: string[] = [];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "toolCall" && block.name) {
          toolNames.push(block.name);
        }
      }
    }

    // Allocate cost among tools proportionally
    const turnCost = usage.cost?.total ?? 0;
    if (toolNames.length > 0) {
      const perToolCost = turnCost / toolNames.length;
      for (const name of toolNames) {
        if (!toolBreakdown[name]) {
          toolBreakdown[name] = { calls: 0, cost: 0 };
        }
        toolBreakdown[name].calls++;
        toolBreakdown[name].cost += perToolCost;
      }
    }

    turns.push({
      turnIndex,
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
      cost: turnCost,
      toolNames,
    });
  }

  return {
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    totalCost,
    turns,
    toolBreakdown,
  };
}

function getSessionName(entries: Array<{ type: string; name?: string }>): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "session_info" && entry.name) {
      return entry.name;
    }
  }
  return "未命名";
}

// ─── TUI Components ─────────────────────────────────────────────────────

class CostPanelComponent {
  private cost: SessionCost;
  private sessionName: string;
  private theme: any;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(cost: SessionCost, sessionName: string, theme: any, onClose: () => void) {
    this.cost = cost;
    this.sessionName = sessionName;
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
    const c = this.cost;

    // Header
    lines.push("");
    const title = th.fg("accent", th.bold(" 📊 当前 Session 成本 "));
    const headerLine =
      th.fg("borderMuted", "─".repeat(2)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 13)));
    lines.push(truncateToWidth(headerLine, width));

    // Summary
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", this.sessionName)}`, width));
    lines.push("");
    lines.push(
      truncateToWidth(
        `  ${th.fg("text", th.bold("总花费:"))}  ${th.fg("accent", formatCost(c.totalCost))}`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "总 input:")}   ${th.fg("text", formatTokens(c.totalInput).padStart(8))} tokens`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "总 output:")}  ${th.fg("text", formatTokens(c.totalOutput).padStart(8))} tokens`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "缓存读取:")}   ${th.fg("text", formatTokens(c.totalCacheRead).padStart(8))} tokens`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "缓存写入:")}   ${th.fg("text", formatTokens(c.totalCacheWrite).padStart(8))} tokens`,
        width,
      ),
    );

    // Turn breakdown
    if (c.turns.length > 0) {
      lines.push("");
      lines.push(truncateToWidth(`  ${th.fg("text", th.bold("Turn 分解:"))}`, width));
      for (const t of c.turns) {
        const up = "↑" + formatTokens(t.inputTokens);
        const down = "↓" + formatTokens(t.outputTokens);
        const cost = formatCost(t.cost);
        const tools = t.toolNames.length > 0 ? `  (${t.toolNames.join(", ")})` : "";

        lines.push(
          truncateToWidth(
            `  ${th.fg("accent", `#${String(t.turnIndex).padStart(2)}`)}  ${th.fg("muted", cost.padStart(7))}  ${th.fg("dim", up.padStart(8))} ${th.fg("dim", down.padStart(8))}${th.fg("dim", tools)}`,
            width,
          ),
        );
      }
    }

    // Tool breakdown
    const toolEntries = Object.entries(c.toolBreakdown).sort(
      (a, b) => b[1].cost - a[1].cost,
    );
    if (toolEntries.length > 0) {
      lines.push("");
      lines.push(truncateToWidth(`  ${th.fg("text", th.bold("工具使用排行:"))}`, width));
      for (const [name, usage] of toolEntries) {
        lines.push(
          truncateToWidth(
            `  ${th.fg("accent", name.padEnd(10))} ${String(usage.calls).padStart(3)} 次  ${th.fg("dim", formatCost(usage.cost))}`,
            width,
          ),
        );
      }
    }

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

class CostReportComponent {
  private reports: SessionCostReport[];
  private grandTotal: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
  private theme: any;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    reports: SessionCostReport[],
    grandTotal: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number },
    theme: any,
    onClose: () => void,
  ) {
    this.reports = reports;
    this.grandTotal = grandTotal;
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
    const gt = this.grandTotal;

    // Header
    lines.push("");
    const title = th.fg("accent", th.bold(" 📊 项目成本报告 "));
    const headerLine =
      th.fg("borderMuted", "─".repeat(2)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 13)));
    lines.push(truncateToWidth(headerLine, width));

    lines.push("");
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "Sessions:")} ${th.fg("text", String(this.reports.length))}`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("text", th.bold("总花费:"))}  ${th.fg("accent", formatCost(gt.cost))}`,
        width,
      ),
    );

    // Per-session breakdown
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("Session 明细:"))}`, width));
    for (const r of this.reports) {
      const displayName = r.sessionName || r.sessionPath.split("/").pop()?.replace(".jsonl", "") || "?";
      const shortName = displayName.length > 25 ? displayName.slice(0, 22) + "..." : displayName;
      lines.push(
        truncateToWidth(
          `  ${th.fg("accent", formatCost(r.totalCost).padStart(8))}  ${th.fg("dim", shortName)}`,
          width,
        ),
      );
    }

    // Grand totals
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("总计:"))}`, width));
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "总 input:")}   ${th.fg("text", formatTokens(gt.input).padStart(10))} tokens`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "总 output:")}  ${th.fg("text", formatTokens(gt.output).padStart(10))} tokens`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "缓存读取:")}   ${th.fg("text", formatTokens(gt.cacheRead).padStart(10))} tokens`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "缓存写入:")}   ${th.fg("text", formatTokens(gt.cacheWrite).padStart(10))} tokens`,
        width,
      ),
    );

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

// ─── Extension Entry ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── /cost command ─────────────────────────────────────────────────

  pi.registerCommand("cost", {
    description: "Show token usage & cost breakdown for current session",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager.getBranch();
      const cost = computeSessionCost(entries);
      const sessionName = getSessionName(entries);

      if (ctx.mode !== "tui") {
        // Non-TUI: print plain text
        const lines: string[] = [];
        lines.push(`📊 Cost: ${sessionName}`);
        lines.push(`Total: ${formatCost(cost.totalCost)} | ↑${formatTokens(cost.totalInput)} ↓${formatTokens(cost.totalOutput)}`);
        for (const t of cost.turns) {
          lines.push(
            `  #${t.turnIndex} ${formatCost(t.cost)} ↑${formatTokens(t.inputTokens)} ↓${formatTokens(t.outputTokens)}${t.toolNames.length ? " (" + t.toolNames.join(", ") + ")" : ""}`,
          );
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // TUI: overlay panel
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new CostPanelComponent(cost, sessionName, theme, () => done());
      });
    },
  });

  // ── /cost-report command ──────────────────────────────────────────

  pi.registerCommand("cost-report", {
    description: "Show cost report across all sessions for current project",
    handler: async (_args, ctx) => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      // Compute the session subdirectory for current cwd
      // cwd /Users/ekko/Workspace/p/code/pi-craft → --Users-ekko-Workspace-p-code-pi-craft--
      const encodedCwd = "--" + ctx.cwd.replace(/\//g, "-") + "--";
      const sessionDir = ctx.sessionManager.getSessionDir();

      // Try candidate paths (getSessionDir may return root or project-specific dir)
      const candidates = [
        sessionDir,                                    // maybe already the project dir
        sessionDir.replace(/\/$/, ""),                // strip trailing slash
        path.default.join(sessionDir, encodedCwd),     // root + encoded cwd
      ];
      let projectDir = "";
      for (const c of candidates) {
        if (fs.default.existsSync(c) && fs.default.statSync(c).isDirectory()) {
          // Verify it contains .jsonl files
          try {
            const hasSessions = fs.default.readdirSync(c).some((f: string) => f.endsWith(".jsonl"));
            if (hasSessions) {
              projectDir = c;
              break;
            }
          } catch { /* keep trying */ }
        }
      }

      if (!projectDir) {
        ctx.ui.notify("未找到当前项目的 session 目录", "error");
        return;
      }

      const reports: SessionCostReport[] = [];
      const grandTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

      const files = fs.default.readdirSync(projectDir).filter((f: string) => f.endsWith(".jsonl"));

      for (const file of files) {
        try {
          const filePath = path.default.join(projectDir, file);
          const raw = fs.default.readFileSync(filePath, "utf8");
          const lines = raw.trim().split("\n");
          const entries: Array<{ type: string; message?: any; name?: string }> = [];
          for (const line of lines) {
            try {
              entries.push(JSON.parse(line));
            } catch {
              // skip malformed lines
            }
          }

          const cost = computeSessionCost(entries);
          const sessionName = getSessionName(entries);

          reports.push({
            sessionPath: filePath,
            sessionName,
            totalInput: cost.totalInput,
            totalOutput: cost.totalOutput,
            totalCacheRead: cost.totalCacheRead,
            totalCacheWrite: cost.totalCacheWrite,
            totalCost: cost.totalCost,
          });

          grandTotal.input += cost.totalInput;
          grandTotal.output += cost.totalOutput;
          grandTotal.cacheRead += cost.totalCacheRead;
          grandTotal.cacheWrite += cost.totalCacheWrite;
          grandTotal.cost += cost.totalCost;
        } catch {
          // Skip sessions that can't be read
        }
      }

      // Sort by cost descending
      reports.sort((a, b) => b.totalCost - a.totalCost);

      if (ctx.mode !== "tui") {
        const lines: string[] = [];
        lines.push(`📊 Cost Report: ${reports.length} sessions`);
        lines.push(`Total: ${formatCost(grandTotal.cost)}`);
        for (const r of reports) {
          const name = r.sessionName || r.sessionPath.split("/").pop()?.replace(".jsonl", "") || "?";
          lines.push(`  ${formatCost(r.totalCost)}  ${name}`);
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new CostReportComponent(reports, grandTotal, theme, () => done());
      });
    },
  });
}

/**
 * Pi Craft — Statusline
 *
 * 增强状态栏，显示：
 * - 工作流阶段 (craft-workflow): 📋 Coding:Design
 * - Token 消耗 (craft-tokens): ↑127k ↓34k $1.24
 * - 活跃 Subagent (craft-subagent): 🏗 architect…
 * - 场景名称 (craft-scenario): [coding]
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatCost, formatTokens, type TokenTracker } from "../core/token-tracker";
import type { WorkflowEngine, WorkflowStage } from "../core/workflow-engine";

// ─── 状态位定义 ────────────────────────────────────────────────

const STATUS_KEYS = {
  workflow: "craft-workflow",
  tokens: "craft-tokens",
  subagent: "craft-subagent",
  scenario: "craft-scenario",
} as const;

// ─── 工作流阶段 → 图标映射 ─────────────────────────────────────

const STAGE_ICONS: Record<WorkflowStage, string> = {
  idle: "⏸",
  code_analysis: "🔍",
  requirement: "📋",
  design: "🎨",
  testing: "🧪",
  implementation: "⚡",
  completed: "✅",
  scope: "🔬",
  analyze: "🔎",
  report: "📊",
};

const STAGE_LABELS: Record<WorkflowStage, string> = {
  idle: "Idle",
  code_analysis: "Analyzing",
  requirement: "Requirement",
  design: "Design",
  testing: "Testing",
  implementation: "Implement",
  completed: "Done",
  scope: "Scope",
  analyze: "Review",
  report: "Report",
};

// ─── StatuslineManager ────────────────────────────────────────

export class StatuslineManager {
  private ctx: ExtensionContext | null = null;

  bind(ctx: ExtensionContext): void {
    this.ctx = ctx;
  }

  private theme() {
    if (!this.ctx?.ui) return { fg: (c: string, t: string) => t };
    return this.ctx.ui.theme;
  }

  // ─── 工作流状态 ──────────────────────────────────────────

  updateWorkflow(scenario: string, stage: WorkflowStage): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();
    const icon = STAGE_ICONS[stage] ?? "●";
    const label = STAGE_LABELS[stage] ?? stage;
    const capScenario = scenario.charAt(0).toUpperCase() + scenario.slice(1);
    const text = `${icon} ${capScenario}:${label}`;
    this.ctx.ui.setStatus(STATUS_KEYS.workflow, t.fg("accent", text));
  }

  // ─── Token 状态 ──────────────────────────────────────────

  updateTokens(tracker: TokenTracker): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();
    const stats = tracker.getStats();

    const parts: string[] = [];
    if (stats.total.input > 0) parts.push(`↑${formatTokens(stats.total.input)}`);
    if (stats.total.output > 0) parts.push(`↓${formatTokens(stats.total.output)}`);
    if (stats.total.cost > 0) parts.push(formatCost(stats.total.cost));

    if (parts.length === 0) {
      this.ctx.ui.setStatus(STATUS_KEYS.tokens, undefined);
      return;
    }

    this.ctx.ui.setStatus(STATUS_KEYS.tokens, t.fg("dim", parts.join(" ")));
  }

  // ─── Subagent 状态 ───────────────────────────────────────

  updateSubagent(name: string | null, status: "running" | "done" | "error" = "running"): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();

    if (!name) {
      this.ctx.ui.setStatus(STATUS_KEYS.subagent, undefined);
      return;
    }

    const icon = status === "running" ? "🏗" : status === "done" ? "✅" : "❌";
    const color: "warning" | "success" | "error" =
      status === "running" ? "warning" : status === "done" ? "success" : "error";

    this.ctx.ui.setStatus(STATUS_KEYS.subagent, t.fg(color, `${icon} ${name}`));
  }

  // ─── 场景标识 ────────────────────────────────────────────

  updateScenario(name: string): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();
    this.ctx.ui.setStatus(STATUS_KEYS.scenario, t.fg("dim", `[${name}]`));
  }

  // ─── 清除所有 ────────────────────────────────────────────

  clear(): void {
    if (!this.ctx?.hasUI) return;
    for (const key of Object.values(STATUS_KEYS)) {
      this.ctx.ui.setStatus(key, undefined);
    }
  }
}

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
  parallel: "craft-parallel",
  guard: "craft-guard",
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
    const all = tracker.getTotalAllIn();
    const cache = tracker.getCacheHitRate();

    const parts: string[] = [];
    if (all.input > 0) parts.push(`↑${formatTokens(all.input)}`);
    if (all.output > 0) parts.push(`↓${formatTokens(all.output)}`);
    // 缓存命中率（如果有缓存数据）
    if (cache.cacheRead > 0 && all.input > 1000) {
      parts.push(t.fg("success", `⊕${Math.round(cache.rate * 100)}%`));
    }
    if (all.cost > 0) parts.push(formatCost(all.cost));

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

  // ─── 并行模式 ──────────────────────────────────────────

  updateParallel(enabled: boolean): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();
    if (enabled) {
      this.ctx.ui.setStatus(STATUS_KEYS.parallel, t.fg("accent", "⚡∥"));
    } else {
      this.ctx.ui.setStatus(STATUS_KEYS.parallel, undefined);
    }
  }

  // ─── 工作目录限制 ──────────────────────────────────────

  updateGuard(enabled: boolean): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();
    if (enabled) {
      this.ctx.ui.setStatus(STATUS_KEYS.guard, t.fg("success", "🛡"));
    } else {
      this.ctx.ui.setStatus(STATUS_KEYS.guard, undefined);
    }
  }

  // ─── 场景标识（每个场景独立的 key，不互相覆盖）──────

  updateScenario(name: string): void {
    if (!this.ctx?.hasUI) return;
    const t = this.theme();
    this.ctx.ui.setStatus(`craft-scenario-${name}`, t.fg("dim", `[${name}]`));
  }

  // ─── 清除所有 ────────────────────────────────────────────

  clear(): void {
    if (!this.ctx?.hasUI) return;
    for (const key of Object.values(STATUS_KEYS)) {
      this.ctx.ui.setStatus(key, undefined);
    }
  }
}

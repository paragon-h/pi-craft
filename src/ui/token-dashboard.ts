/**
 * Pi Craft — Token Dashboard TUI Overlay
 *
 * 全屏 Token 消耗仪表盘，展示：
 * - Session 总览（input/output/cost/turns/throughput）
 * - 按 Model 统计（带进度条）
 * - 按 Provider 统计
 * - 最近 N 个 turn 的趋势
 */

import { Container, type SelectList, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";
import type { TokenTracker, ModelStats, ProviderStats, TokenSnapshot } from "../core/token-tracker";

export interface DashboardTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

function bar(ratio: number, width: number, theme: DashboardTheme): string {
  const filled = "█".repeat(Math.round(ratio * width));
  const empty = "░".repeat(width - filled.length);
  if (ratio > 0.8) return theme.fg("error", filled) + theme.fg("dim", empty);
  if (ratio > 0.5) return theme.fg("warning", filled) + theme.fg("dim", empty);
  return theme.fg("success", filled) + theme.fg("dim", empty);
}

function fmtNum(n: number, pad: number): string {
  if (n < 1000) return String(n).padStart(pad);
  if (n < 10000) return (n / 1000).toFixed(1) + "k".padStart(pad - 1);
  if (n < 1000000) return Math.round(n / 1000) + "k".padStart(pad);
  return (n / 1000000).toFixed(1) + "M".padStart(pad);
}

function fmtCost(c: number): string {
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

export function createTokenDashboard(
  tracker: TokenTracker,
  theme: DashboardTheme,
  width: number,
) {
  const total = tracker.getStats().total;
  const allIn = tracker.getTotalAllIn();
  const modelStats = tracker.getModelStats();
  const providerStats = tracker.getProviderStats();
  const cache = tracker.getCacheHitRate();
  const subTokens = tracker.getSubagentTokens();
  const throughput = tracker.getThroughput();
  const sessionCost = tracker.getSessionCost();
  const history = tracker.getStats().history.slice(-20);

  const maxInput = Math.max(...modelStats.map((m) => m.stats.input), 1);

  const container = new Container();

  // Header
  container.addChild(new Text("", 0, 0));
  container.addChild(
    new Text(
      theme.fg("accent", theme.bold("╔══ Token Dashboard ═══════════════════════════════════════╗")),
      0, 0,
    ),
  );

  // Session Totals (all-in: main + subagent)
  container.addChild(new Text(theme.fg("accent", theme.bold("║ All-In Usage (main + subagents)")), 0, 0));
  container.addChild(
    new Text(
      theme.fg("dim", `║  Input:  ${fmtNum(allIn.input, 10)} tokens  │  Output: ${fmtNum(allIn.output, 10)} tokens`),
      0, 0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg("dim", `║  Turns:  ${String(allIn.turns).padStart(10)}            │  Cost:   ${fmtCost(allIn.cost).padStart(10)}`),
      0, 0,
    ),
  );

  // Cache stats
  if (cache.cacheRead > 0) {
    const hitPct = (cache.rate * 100).toFixed(1);
    const cacheBar = bar(cache.rate, 20, theme);
    container.addChild(
      new Text(
        theme.fg("dim", `║  Cache:  ${fmtNum(cache.cacheRead, 8)} hit  (${hitPct}% ${cacheBar})  saved ~${fmtCost(cache.savings)}`),
        0, 0,
      ),
    );
  }

  // Subagent breakdown
  if (subTokens.turns > 0) {
    container.addChild(
      new Text(
        theme.fg("dim", `║  Sub total: ↑${fmtNum(subTokens.input, 6)} ↓${fmtNum(subTokens.output, 6)}  ${subTokens.turns}t  ${fmtCost(subTokens.cost)}`),
        0, 0,
      ),
    );
  }

  // Main agent only
  const mainInput = allIn.input - subTokens.input;
  const mainOutput = allIn.output - subTokens.output;
  const mainCost = allIn.cost - subTokens.cost;
  const mainTurns = allIn.turns - subTokens.turns;
  container.addChild(
    new Text(
      theme.fg("dim", `║  Main agent: ↑${fmtNum(mainInput, 5)} ↓${fmtNum(mainOutput, 5)}  ${mainTurns}t  ${fmtCost(mainCost)}`),
      0, 0,
    ),
  );

  // Per-subagent detail
  const breakdown = tracker.getSubagentBreakdown();
  if (breakdown.length > 0) {
    container.addChild(new Text(theme.fg("accent", theme.bold("║ Per Subagent")), 0, 0));
    for (const sa of breakdown) {
      const agentName = sa.agent.length > 18 ? sa.agent.slice(0, 17) + "…" : sa.agent.padEnd(18);
      const cacheStr = sa.cacheRead > 0 ? ` ⊕${fmtNum(sa.cacheRead, 4)}` : "";
      const line = theme.fg(
        "dim",
        `║  ${agentName} ↑${fmtNum(sa.input, 5)} ↓${fmtNum(sa.output, 5)}${cacheStr} ${sa.turns}t  ${fmtCost(sa.cost)}`,
      );
      container.addChild(new Text(line, 0, 0));
    }
  }

  container.addChild(
    new Text(
      theme.fg("dim", `║  Session cost: ${fmtCost(sessionCost)}  │  Throughput: ${throughput}`),
      0, 0,
    ),
  );
  container.addChild(new Text(theme.fg("dim", "║"), 0, 0));

  // By Model (with cache columns)
  if (modelStats.length > 0) {
    container.addChild(new Text(theme.fg("accent", theme.bold("║ By Model               ↑Input    ↓Output   ⊕Cache    Cost")), 0, 0));
    for (const { model, stats } of modelStats.slice(0, 6)) {
      const ratio = maxInput > 0 ? stats.input / maxInput : 0;
      const modelName = model.length > 16 ? model.slice(0, 15) + "…" : model.padEnd(16);
      const pb = bar(ratio, 10, theme);
      // 每个 model 的缓存命中率
      const modelTotal = stats.input + stats.cacheRead;
      const modelCacheRate = modelTotal > 0 ? (stats.cacheRead / modelTotal * 100).toFixed(0) : "0";
      const cacheStr = stats.cacheRead > 0 ? `${fmtNum(stats.cacheRead, 4)}(${modelCacheRate}%)` : "    -".padStart(10);
      const line =
        theme.fg("dim", `║  ${modelName}`) +
        theme.fg("dim", `↑${fmtNum(stats.input, 5)} ↓${fmtNum(stats.output, 5)}`) +
        ` ${pb} ` +
        theme.fg("success", cacheStr) +
        theme.fg("dim", `  ${fmtCost(stats.cost)}`);
      container.addChild(new Text(line, 0, 0));
    }
    container.addChild(new Text(theme.fg("dim", "║"), 0, 0));
  }

  // By Provider
  if (providerStats.length > 0) {
    container.addChild(new Text(theme.fg("accent", theme.bold("║ By Provider")), 0, 0));
    for (const { provider, stats } of providerStats.slice(0, 4)) {
      const pv = provider.length > 16 ? provider.slice(0, 15) + "…" : provider.padEnd(16);
      const line = theme.fg(
        "dim",
        `║  ${pv} ${String(stats.requests).padStart(3)} req  ↑${fmtNum(stats.input, 5)} ↓${fmtNum(stats.output, 5)}  ${fmtCost(stats.cost)}`,
      );
      container.addChild(new Text(line, 0, 0));
    }
    container.addChild(new Text(theme.fg("dim", "║"), 0, 0));
  }

  // Deepseek pricing reference
  container.addChild(new Text(theme.fg("accent", theme.bold("║ Deepseek Pricing (per 1M tokens)")), 0, 0));
  container.addChild(new Text(theme.fg("dim", "║  Input (cache miss): $0.27  │  Cache hit: $0.07  │  Output: $1.10"), 0, 0));
  container.addChild(new Text(theme.fg("dim", "║"), 0, 0));

  // History (last 10 turns)
  if (history.length > 0) {
    container.addChild(new Text(theme.fg("accent", theme.bold("║ Recent Turns")), 0, 0));
    for (const snap of history.slice(-10).reverse()) {
      const model = snap.model.length > 14 ? snap.model.slice(0, 13) + "…" : snap.model.padEnd(14);
      const turn = `#${String(snap.turnIndex).padStart(3)}`;
      // 缓存命中
      const hasCache = snap.cacheRead > 0;
      const cacheStr = hasCache ? ` ⊕${fmtNum(snap.cacheRead, 3)}` : "";
      const line = theme.fg(
        "dim",
        `║  ${turn} ${model} ↑${fmtNum(snap.input, 4)} ↓${fmtNum(snap.output, 4)}${cacheStr} ${fmtCost(snap.cost)}`,
      );
      container.addChild(new Text(line, 0, 0));
    }
    container.addChild(new Text(theme.fg("dim", "║"), 0, 0));
  }

  // Footer
  container.addChild(
    new Text(
      theme.fg("dim", "║  esc to close  │  /tokens for dashboard  │  ctrl+shift+t for quick summary"),
      0, 0,
    ),
  );
  container.addChild(
    new Text(theme.fg("accent", theme.bold("╚══════════════════════════════════════════════════════╝")), 0, 0),
  );
  container.addChild(new Text("", 0, 0));

  return {
    render: (w: number) => container.render(w),
    invalidate: () => container.invalidate(),
  };
}

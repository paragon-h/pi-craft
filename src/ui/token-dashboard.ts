/**
 * Pi Craft — Token Dashboard TUI Overlay
 */

import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { TokenTracker } from "../core/token-tracker";

export interface DashboardTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

function barChar(ratio: number): string {
  if (ratio > 0.8) return "█";
  if (ratio > 0.5) return "▓";
  return "▒";
}

function fmtNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + "k";
  if (n < 1000000) return Math.round(n / 1000) + "k";
  return (n / 1000000).toFixed(1) + "M";
}

function fmtCost(c: number): string {
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

function pad(s: string, n: number): string {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "").length;
  return s + " ".repeat(Math.max(0, n - visible));
}

export function createTokenDashboard(
  tracker: TokenTracker,
  theme: DashboardTheme,
  _width: number,
) {
  const allIn = tracker.getTotalAllIn();
  const modelStats = tracker.getModelStats();
  const providerStats = tracker.getProviderStats();
  const cache = tracker.getCacheHitRate();
  const subTokens = tracker.getSubagentTokens();
  const throughput = tracker.getThroughput();
  const sessionCost = tracker.getSessionCost();
  const history = tracker.getStats().history.slice(-20);
  const maxInput = Math.max(...modelStats.map((m) => m.stats.input), 1);
  const c = new Container();

  const dim = (t: string) => theme.fg("dim", t);
  const accent = (t: string) => theme.fg("accent", theme.bold(t));
  const success = (t: string) => theme.fg("success", t);

  c.addChild(new Text("", 0, 0));
  c.addChild(new Text(accent("╔══ Token Dashboard ═══════════════════════════════════════╗"), 0, 0));

  // Session totals
  c.addChild(new Text(accent("║ All-In Usage (main + subagents)"), 0, 0));
  c.addChild(new Text(dim(`║  Input:  ${fmtNum(allIn.input).padStart(10)} tokens  │  Output: ${fmtNum(allIn.output).padStart(10)} tokens`), 0, 0));
  c.addChild(new Text(dim(`║  Turns:  ${String(allIn.turns).padStart(10)}            │  Cost:   ${fmtCost(allIn.cost).padStart(10)}`), 0, 0));

  if (cache.cacheRead > 0) {
    const pct = (cache.rate * 100).toFixed(1);
    const bar = "█".repeat(Math.round(cache.rate * 20)) + "░".repeat(20 - Math.round(cache.rate * 20));
    c.addChild(new Text(dim(`║  Cache:  ${fmtNum(cache.cacheRead).padStart(8)} hit  (${pct}% ${bar})  saved ~${fmtCost(cache.savings)}`), 0, 0));
  }

  if (subTokens.turns > 0) {
    c.addChild(new Text(dim(`║  Sub total: ↑${fmtNum(subTokens.input).padStart(6)} ↓${fmtNum(subTokens.output).padStart(6)}  ${subTokens.turns}t  ${fmtCost(subTokens.cost)}`), 0, 0));
  }

  const mainInput = allIn.input - subTokens.input;
  const mainOutput = allIn.output - subTokens.output;
  const mainCost = allIn.cost - subTokens.cost;
  const mainTurns = allIn.turns - subTokens.turns;
  c.addChild(new Text(dim(`║  Main agent: ↑${fmtNum(mainInput).padStart(5)} ↓${fmtNum(mainOutput).padStart(5)}  ${mainTurns}t  ${fmtCost(mainCost)}`), 0, 0));

  const breakdown = tracker.getSubagentBreakdown();
  if (breakdown.length > 0) {
    c.addChild(new Text(accent("║ Per Subagent"), 0, 0));
    for (const sa of breakdown) {
      const name = sa.agent.length > 22 ? sa.agent.slice(0, 21) + "…" : sa.agent.padEnd(22);
      const cacheStr = sa.cacheRead > 0 ? ` ⊕${fmtNum(sa.cacheRead).padStart(4)}` : "";
      c.addChild(new Text(dim(`║  ${name} ↑${fmtNum(sa.input).padStart(5)} ↓${fmtNum(sa.output).padStart(5)}${cacheStr} ${sa.turns}t  ${fmtCost(sa.cost)}`), 0, 0));
    }
  }

  c.addChild(new Text(dim(`║  Session cost: ${fmtCost(sessionCost)}  │  Throughput: ${throughput}`), 0, 0));
  c.addChild(new Text(dim("║"), 0, 0));

  // ── By Model ──
  if (modelStats.length > 0) {
    c.addChild(new Text(accent(pad("║ Model", 32) + pad("↑In", 6) + pad("↓Out", 6) + pad("", 12) + pad("⊕Cache", 11) + "Cost"), 0, 0));
    for (const { model, stats } of modelStats.slice(0, 6)) {
      const ratio = maxInput > 0 ? stats.input / maxInput : 0;
      const name = model.length > 29 ? "…" + model.slice(-28) : model;
      const bar = "█".repeat(Math.round(ratio * 10)) + "░".repeat(10 - Math.round(ratio * 10));
      const total = stats.input + stats.cacheRead;
      const rate = total > 0 ? `(${Math.round(stats.cacheRead / total * 100)}%)` : "";
      const cacheCol = stats.cacheRead > 0 ? `${fmtNum(stats.cacheRead).padStart(5)}${rate}` : "-".padStart(11);
      c.addChild(new Text(dim(
        pad(`║  ${name}`, 32) +
        pad(`↑${fmtNum(stats.input)}`, 6) +
        pad(`↓${fmtNum(stats.output)}`, 6) +
        pad(bar, 12) +
        pad(cacheCol, 11) +
        fmtCost(stats.cost)
      ), 0, 0));
    }
    c.addChild(new Text(dim("║"), 0, 0));
  }

  // ── By Provider ──
  if (providerStats.length > 0) {
    c.addChild(new Text(accent(pad("║ Provider", 22) + pad("Req", 5) + pad("↑In", 6) + pad("↓Out", 6) + pad("", 8) + "Cost"), 0, 0));
    for (const { provider, stats } of providerStats.slice(0, 4)) {
      const name = provider.length > 19 ? provider.slice(0, 18) + "…" : provider;
      c.addChild(new Text(dim(
        pad(`║  ${name}`, 22) +
        pad(String(stats.requests), 5) +
        pad(`↑${fmtNum(stats.input)}`, 6) +
        pad(`↓${fmtNum(stats.output)}`, 6) +
        "".padEnd(8) +
        fmtCost(stats.cost)
      ), 0, 0));
    }
    c.addChild(new Text(dim("║"), 0, 0));
  }

  // ── Recent Turns ──
  if (history.length > 0) {
    c.addChild(new Text(accent(pad("║ Turn  Model", 32) + pad("↑In", 6) + pad("↓Out", 6) + pad("⊕Ch", 6) + "Cost"), 0, 0));
    for (const snap of history.slice(-10).reverse()) {
      const turn = `#${String(snap.turnIndex).padStart(3)}`;
      const name = snap.model.length > 22 ? "…" + snap.model.slice(-21) : snap.model;
      const cacheStr = snap.cacheRead > 0 ? `⊕${fmtNum(snap.cacheRead)}` : "-";
      c.addChild(new Text(dim(
        pad(`║ ${turn} ${name}`, 32) +
        pad(`↑${fmtNum(snap.input)}`, 6) +
        pad(`↓${fmtNum(snap.output)}`, 6) +
        pad(cacheStr, 6) +
        fmtCost(snap.cost)
      ), 0, 0));
    }
    c.addChild(new Text(dim("║"), 0, 0));
  }

  c.addChild(new Text(dim("║  esc to close  │  /tokens for dashboard  │  ctrl+shift+t for quick summary"), 0, 0));
  c.addChild(new Text(accent("╚══════════════════════════════════════════════════════╝"), 0, 0));
  c.addChild(new Text("", 0, 0));

  return {
    render: (w: number) => c.render(w),
    invalidate: () => c.invalidate(),
  };
}

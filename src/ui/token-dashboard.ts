/**
 * Pi Craft — Token Dashboard TUI Overlay
 */

import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { TokenTracker, DailyStats } from "../core/token-tracker";

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

function makeTopBorder(title: string, w: number): string {
  const inner = ` ${title} `;
  const padLen = w - 2 - inner.length;
  if (padLen <= 0) return `╔${inner}╗`;
  const left = "═".repeat(Math.floor(padLen / 2));
  const right = "═".repeat(Math.ceil(padLen / 2));
  return `╔${left}${inner}${right}╗`;
}

function makeBottomBorder(w: number): string {
  return `╚${"═".repeat(Math.max(0, w - 2))}╝`;
}

// ── Heatmap ─────────────────────────────────────────

const HEAT_CHARS = ["·", "░", "▒", "▓", "█"];

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function renderHeatmap(dailyList: DailyStats[]): string[] {
  // Build a map of date → token count
  const tokenMap = new Map<string, number>();
  let maxTokens = 0;
  for (const ds of dailyList) {
    const tokens = ds.input + ds.output;
    tokenMap.set(ds.date, tokens);
    if (tokens > maxTokens) maxTokens = tokens;
  }

  // Determine range: 26 weeks (~6 months) ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  const startDate = new Date(today);
  // Align to Sunday of the week 26 weeks ago
  startDate.setDate(startDate.getDate() - startDate.getDay() - 26 * 7);

  // Generate week columns
  const weeks: string[][] = Array.from({ length: 7 }, () => []);
  const monthLabels: { week: number; label: string }[] = [];
  let lastMonth = -1;
  let weekIdx = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
    const tokens = tokenMap.get(dateStr) ?? 0;

    // Intensity level 0-4
    let level = 0;
    if (maxTokens > 0 && tokens > 0) {
      level = Math.min(4, Math.max(1, Math.ceil(tokens / maxTokens * 4)));
    }
    weeks[dayOfWeek].push(HEAT_CHARS[level]);

    // Track month boundaries
    if (dayOfWeek === 6) {
      const month = d.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({
          week: weekIdx,
          label: d.toLocaleDateString("en", { month: "short" }),
        });
        lastMonth = month;
      }
      weekIdx++;
    }
  }

  const numWeeks = weeks[0].length;

  // Build month header row
  let monthRow = "    "; // 4-char left margin (for "Mon ")
  let pos = 0;
  for (let w = 0; w < numWeeks; w++) {
    const ml = monthLabels.find((m) => m.week === w);
    if (ml) {
      // Pad to position, then write label
      const padNeeded = w * 2 - pos;
      if (padNeeded > 0) monthRow += " ".repeat(padNeeded);
      monthRow += ml.label;
      pos = w * 2 + ml.label.length;
    }
  }

  // Day rows
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows: string[] = [monthRow];
  for (let day = 0; day < 7; day++) {
    const label = dayNames[day].padEnd(3) + " ";
    const cells = weeks[day].map((c, i) => (i > 0 ? " " + c : c)).join("");
    rows.push(label + cells);
  }

  return rows;
}

export function createOverviewDashboard(
  tracker: TokenTracker,
  theme: DashboardTheme,
  _width: number,
) {
  const w = Math.max(80, _width);
  const allIn = tracker.getTotalAllIn();
  const cache = tracker.getCacheHitRate();
  const subTokens = tracker.getSubagentTokens();
  const throughput = tracker.getThroughput();
  const sessionCost = tracker.getSessionCost();
  const c = new Container();

  const dim = (t: string) => theme.fg("dim", t);
  const accent = (t: string) => theme.fg("accent", theme.bold(t));

  c.addChild(new Text("", 0, 0));
  c.addChild(new Text(accent(makeTopBorder("Token Dashboard", w)), 0, 0));

  // Session totals
  c.addChild(new Text(accent("║ All-In Usage (main + subagents)"), 0, 0));
  c.addChild(new Text(dim(`║  Input:  ${fmtNum(allIn.input).padStart(10)} tokens  │  Output: ${fmtNum(allIn.output).padStart(10)} tokens`), 0, 0));
  c.addChild(new Text(dim(`║  Turns:  ${String(allIn.turns).padStart(10)}            │  Cost:   ${fmtCost(allIn.cost).padStart(10)}`), 0, 0));

  if (cache.cacheRead > 0) {
    const pct = `${Math.round(cache.rate * 100)}`;
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

  // ── Contribution Heatmap ──────────────────────────
  const dailyList = tracker.getDailyStatsList();
  if (dailyList.length >= 2) {
    const heatmapRows = renderHeatmap(dailyList);
    c.addChild(new Text(accent("║ Activity"), 0, 0));
    for (const row of heatmapRows) {
      c.addChild(new Text(dim(row), 0, 0));
    }
    c.addChild(new Text(dim("║  Less " + "░ ▒ ▓ █" + " More"), 0, 0));
    c.addChild(new Text(dim("║"), 0, 0));
  }

  // ── Usage Insights ────────────────────────────────
  const favModel = tracker.getFavoriteModel();
  const allTokens = allIn.input + allIn.output;
  const sessions = tracker.getSessionCount();
  const activeDays = tracker.getActiveDayCount();
  const mostActive = tracker.getMostActiveDay();
  const streaks = tracker.getStreaks();
  const sessionDur = tracker.getCurrentSessionDuration();
  const favName = favModel.length > 24 ? favModel.slice(0, 22) + "…" : favModel;
  const mostDate = mostActive ? formatDate(mostActive.date) : "--";

  c.addChild(new Text(accent("║ ✨ Usage Insights"), 0, 0));
  c.addChild(new Text(dim(
    `║  Favorite model: ${favName.padEnd(24)} All-time tokens: ${fmtNum(allTokens)}`
  ), 0, 0));
  c.addChild(new Text(dim(
    `║  Sessions: ${String(sessions).padEnd(22)} Longest streak: ${streaks.longest}d`
  ), 0, 0));
  c.addChild(new Text(dim(
    `║  Active days: ${`${activeDays.active}/${activeDays.total}`.padEnd(15)} Current streak: ${streaks.current}d`
  ), 0, 0));
  c.addChild(new Text(dim(
    `║  Most active: ${mostDate.padEnd(22)} Session: ${sessionDur}`
  ), 0, 0));
  c.addChild(new Text(dim("║"), 0, 0));

  c.addChild(new Text(dim("║  Tab: detail view  │  /tokens for dashboard  │  esc to close"), 0, 0));
  c.addChild(new Text(accent(makeBottomBorder(w)), 0, 0));
  c.addChild(new Text("", 0, 0));

  return {
    render: (w: number) => c.render(w),
    invalidate: () => c.invalidate(),
  };
}

export function createDetailDashboard(
  tracker: TokenTracker,
  theme: DashboardTheme,
  _width: number,
) {
  const w = Math.max(80, _width);
  const modelStats = tracker.getModelStats();
  const providerStats = tracker.getProviderStats();
  const history = tracker.getStats().history.slice(-20);
  const maxInput = Math.max(...modelStats.map((m) => m.stats.input), 1);
  const c = new Container();

  const dim = (t: string) => theme.fg("dim", t);
  const accent = (t: string) => theme.fg("accent", theme.bold(t));

  // Dynamic column widths
  const colModel = Math.max(22, Math.min(40, w - 56));
  const colNum = 7;
  const colBar = 12;
  const colCache = 11;
  const colCost = 8;

  c.addChild(new Text("", 0, 0));
  c.addChild(new Text(accent(makeTopBorder("Usage Detail", w)), 0, 0));

  // ── By Model ──
  if (modelStats.length > 0) {
    c.addChild(new Text(accent(
      pad("║ Model", colModel + 2) + pad("↑In", colNum) + pad("↓Out", colNum) + pad("", colBar) + pad("⊕Cache", colCache) + pad("Cost", colCost)
    ), 0, 0));
    for (const { model, stats } of modelStats.slice(0, 6)) {
      const ratio = maxInput > 0 ? stats.input / maxInput : 0;
      const name = model.length > colModel - 1 ? "…" + model.slice(-(colModel - 2)) : model;
      const bar = "█".repeat(Math.round(ratio * 10)) + "░".repeat(10 - Math.round(ratio * 10));
      const total = stats.input + stats.cacheRead;
      const rate = total > 0 ? `(${Math.round(stats.cacheRead / total * 100)}%)` : "";
      const cacheCol = stats.cacheRead > 0 ? `${fmtNum(stats.cacheRead)}${rate}` : "-";
      c.addChild(new Text(dim(
        pad(`║  ${name}`, colModel + 2) +
        pad(`↑${fmtNum(stats.input)}`, colNum) +
        pad(`↓${fmtNum(stats.output)}`, colNum) +
        pad(bar, colBar) +
        pad(cacheCol, colCache) +
        pad(fmtCost(stats.cost), colCost)
      ), 0, 0));
    }
    c.addChild(new Text(dim("║"), 0, 0));
  }

  // ── By Provider ──
  if (providerStats.length > 0) {
    c.addChild(new Text(accent(pad("║ Provider", colModel + 2) + pad("Req", colNum) + pad("↑In", colNum) + pad("↓Out", colNum) + pad("", colBar + colCache) + pad("Cost", colCost)), 0, 0));
    for (const { provider, stats } of providerStats.slice(0, 4)) {
      const name = provider.length > colModel - 1 ? provider.slice(0, colModel - 2) + "…" : provider;
      c.addChild(new Text(dim(
        pad(`║  ${name}`, colModel + 2) +
        pad(String(stats.requests), colNum) +
        pad(`↑${fmtNum(stats.input)}`, colNum) +
        pad(`↓${fmtNum(stats.output)}`, colNum) +
        "".padEnd(colBar + colCache) +
        pad(fmtCost(stats.cost), colCost)
      ), 0, 0));
    }
    c.addChild(new Text(dim("║"), 0, 0));
  }

  // ── Recent Turns ──
  if (history.length > 0) {
    c.addChild(new Text(accent(pad("║ Turn  Model", colModel + 2) + pad("↑In", colNum) + pad("↓Out", colNum) + pad("⊕Ch", colNum) + pad("Cost", colCost)), 0, 0));
    for (const snap of history.slice(-10).reverse()) {
      const turn = `#${String(snap.turnIndex).padStart(3)}`;
      const name = snap.model.length > colModel - 1 ? "…" + snap.model.slice(-(colModel - 2)) : snap.model;
      const cacheStr = snap.cacheRead > 0 ? `⊕${fmtNum(snap.cacheRead)}` : "-";
      c.addChild(new Text(dim(
        pad(`║ ${turn} ${name}`, colModel + 2) +
        pad(`↑${fmtNum(snap.input)}`, colNum) +
        pad(`↓${fmtNum(snap.output)}`, colNum) +
        pad(cacheStr, colNum) +
        pad(fmtCost(snap.cost), colCost)
      ), 0, 0));
    }
    c.addChild(new Text(dim("║"), 0, 0));
  }

  c.addChild(new Text(dim("║  Tab: overview  │  /tokens for dashboard  │  esc to close"), 0, 0));
  c.addChild(new Text(accent(makeBottomBorder(w)), 0, 0));
  c.addChild(new Text("", 0, 0));

  return {
    render: (w: number) => c.render(w),
    invalidate: () => c.invalidate(),
  };
}

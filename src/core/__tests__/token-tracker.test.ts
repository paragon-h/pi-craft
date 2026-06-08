/**
 * Tests for TokenTracker — usage aggregation, persistence, export, formatting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TokenTracker,
  formatTokens,
  formatCost,
  formatThroughput,
} from "../token-tracker.js";

// ─── Formatters ───────────────────────────────────────────────

describe("formatTokens", () => {
  it("formats < 1000 as-is", () => {
    assert.equal(formatTokens(500), "500");
    assert.equal(formatTokens(0), "0");
  });

  it("formats 1000-9999 with 1 decimal", () => {
    assert.equal(formatTokens(1500), "1.5k");
    assert.equal(formatTokens(9999), "10.0k");
  });

  it("formats 10000-999999 as integer k", () => {
    assert.equal(formatTokens(12500), "13k");
    assert.equal(formatTokens(999999), "1000k");
  });

  it("formats >= 1000000 with 1 decimal M", () => {
    assert.equal(formatTokens(1500000), "1.5M");
  });
});

describe("formatCost", () => {
  it("formats < 1 cent with 4 decimals", () => {
    assert.equal(formatCost(0.0005), "$0.0005");
  });

  it("formats >= 1 cent with 2 decimals", () => {
    assert.equal(formatCost(0.15), "$0.15");
    assert.equal(formatCost(5), "$5.00");
  });
});

describe("formatThroughput", () => {
  it("returns N/A for 0 elapsed", () => {
    assert.equal(formatThroughput(100, 0), "N/A");
  });

  it("calculates tokens per second", () => {
    assert.equal(formatThroughput(500, 5000), "100 tok/s");
  });

  it("shows decimal for < 1 tok/s", () => {
    const result = formatThroughput(5, 10000);
    assert.ok(result.includes("0.5 tok/s"));
  });
});

// ─── recordUsage — basic aggregation ──────────────────────────

describe("TokenTracker — recordUsage", () => {
  it("aggregates model stats", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("claude-opus", "anthropic", { input: 1000, output: 200, cost: 0.01 });
    tracker.recordUsage("claude-opus", "anthropic", { input: 500, output: 100, cost: 0.005 });

    const models = tracker.getModelStats();
    const opus = models.find(m => m.model === "claude-opus")!;
    assert.equal(opus.stats.input, 1500);
    assert.equal(opus.stats.output, 300);
    assert.equal(opus.stats.cost, 0.015);
    assert.equal(opus.stats.turns, 2);
  });

  it("separates models correctly", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("claude-opus", "anthropic", { input: 100, output: 50, cost: 0.001 });
    tracker.recordUsage("gpt-4o", "openai", { input: 200, output: 100, cost: 0.002 });

    const models = tracker.getModelStats();
    assert.equal(models.length, 2);

    const sorted = models.sort((a, b) => a.model.localeCompare(b.model));
    assert.equal(sorted[0].model, "claude-opus");
    assert.equal(sorted[0].stats.turns, 1);
    assert.equal(sorted[1].model, "gpt-4o");
    assert.equal(sorted[1].stats.turns, 1);
  });

  it("aggregates provider stats", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("claude-opus", "anthropic", { input: 100, output: 50, cost: 0.001 });
    tracker.recordUsage("claude-haiku", "anthropic", { input: 50, output: 25, cost: 0.0005 });

    const providers = tracker.getProviderStats();
    assert.equal(providers.length, 1);
    assert.equal(providers[0].provider, "anthropic");
    assert.equal(providers[0].stats.input, 150);
    assert.equal(providers[0].stats.requests, 2);
  });

  it("accumulates total stats", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 100, output: 10, cost: 1 });
    tracker.recordUsage("m2", "p2", { input: 200, output: 20, cost: 2 });

    const stats = tracker.getStats();
    assert.equal(stats.total.input, 300);
    assert.equal(stats.total.output, 30);
    assert.equal(stats.total.cost, 3);
    assert.equal(stats.total.turns, 2);
  });

  it("handles zero values", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage(undefined, undefined, {});

    const stats = tracker.getStats();
    assert.equal(stats.total.turns, 1);
    assert.equal(stats.total.input, 0);
  });

  it("uses 'unknown' for undefined model/provider", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage(undefined, undefined, { input: 10, output: 5 });

    const models = tracker.getModelStats();
    assert.equal(models[0].model, "unknown");
    const providers = tracker.getProviderStats();
    assert.equal(providers[0].provider, "unknown");
  });

  it("records cache metrics", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", {
      input: 1000,
      output: 200,
      cacheRead: 500,
      cacheWrite: 100,
      cost: 0.01,
    });

    const stats = tracker.getStats();
    assert.equal(stats.total.cacheRead, 500);
    assert.equal(stats.total.cacheWrite, 100);
  });
});

// ─── History ──────────────────────────────────────────────────

describe("TokenTracker — history", () => {
  it("records snapshots in order", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 10 });
    tracker.recordUsage("m2", "p2", { input: 20 });

    const history = tracker.getStats().history;
    assert.equal(history.length, 2);
    assert.equal(history[0].input, 10);
    assert.equal(history[1].input, 20);
    assert.equal(history[0].turnIndex, 1);
    assert.equal(history[1].turnIndex, 2);
  });

  it("caps history at 100 entries", () => {
    const tracker = new TokenTracker();
    for (let i = 0; i < 150; i++) {
      tracker.recordUsage("m1", "p1", { input: 1 });
    }

    const history = tracker.getStats().history;
    assert.equal(history.length, 100);
    // Should keep last 100
    assert.equal(history[0].turnIndex, 51);
    assert.equal(history[99].turnIndex, 150);
  });
});

// ─── Subagent tracking ────────────────────────────────────────

describe("TokenTracker — subagent tracking", () => {
  it("tracks subagent usage separately", () => {
    const tracker = new TokenTracker();
    tracker.recordSubagentUsage("architect", { input: 500, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.005 });

    const sa = tracker.getSubagentTokens();
    assert.equal(sa.input, 500);
    assert.equal(sa.output, 100);
    assert.equal(sa.turns, 1);
  });

  it("breaks down by agent name", () => {
    const tracker = new TokenTracker();
    tracker.recordSubagentUsage("architect", { input: 500, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.005 });
    tracker.recordSubagentUsage("implementer", { input: 300, output: 80, cacheRead: 0, cacheWrite: 0, cost: 0.003 });
    tracker.recordSubagentUsage("architect", { input: 200, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.002 });

    const breakdown = tracker.getSubagentBreakdown();
    assert.equal(breakdown.length, 2);

    const arch = breakdown.find(b => b.agent === "architect")!;
    assert.equal(arch.input, 700);
    assert.equal(arch.turns, 2);
    assert.ok(Math.abs(arch.cost - 0.007) < 0.0001);

    const impl = breakdown.find(b => b.agent === "implementer")!;
    assert.equal(impl.input, 300);
    assert.equal(impl.turns, 1);
  });

  it("getTotalAllIn combines main + subagent tokens", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("claude", "anthropic", { input: 1000, output: 200, cost: 0.01 });
    tracker.recordSubagentUsage("architect", { input: 500, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.005 });

    const total = tracker.getTotalAllIn();
    assert.equal(total.input, 1500);
    assert.equal(total.output, 300);
    assert.ok(Math.abs(total.cost - 0.015) < 0.0001);
    assert.equal(total.turns, 2);
  });
});

// ─── Cache hit rate ───────────────────────────────────────────

describe("TokenTracker — cache hit rate", () => {
  it("returns 0 when no cache reads", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 1000 });

    const hr = tracker.getCacheHitRate();
    assert.equal(hr.rate, 0);
    assert.equal(hr.cacheRead, 0);
    assert.equal(hr.input, 1000);
  });

  it("calculates hit rate from cacheRead / total", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 500, cacheRead: 500, cost: 0.01 });

    const hr = tracker.getCacheHitRate();
    assert.ok(Math.abs(hr.rate - 0.5) < 0.001);
    assert.equal(hr.cacheRead, 500);
    assert.equal(hr.input, 500);
  });

  it("includes subagent cache reads in calculation", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 200, cacheRead: 100, cost: 0.002 });
    tracker.recordSubagentUsage("architect", { input: 300, output: 0, cacheRead: 200, cacheWrite: 0, cost: 0.003 });

    const hr = tracker.getCacheHitRate();
    // total cacheRead = 300, total input = 500, rate = 300/(300+500) = 0.375
    assert.ok(Math.abs(hr.rate - 0.375) < 0.01);
  });

  it("estimates savings > 0 when cache reads present", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 100, cacheRead: 900, cost: 0.01 });

    const hr = tracker.getCacheHitRate();
    assert.ok(hr.savings > 0);
  });

  it("savings is 0 when no cache reads", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 100, cost: 0.01 });

    const hr = tracker.getCacheHitRate();
    assert.equal(hr.savings, 0);
  });
});

// ─── Session tracking ─────────────────────────────────────────

describe("TokenTracker — session tracking", () => {
  it("records session start", () => {
    const tracker = new TokenTracker();
    assert.equal(tracker.getSessionCount(), 0);

    tracker.recordSessionStart();
    assert.equal(tracker.getSessionCount(), 1);
  });

  it("returns N/A for duration when no session started", () => {
    const tracker = new TokenTracker();
    assert.equal(tracker.getCurrentSessionDuration(), "N/A");
  });

  it("returns duration after session start", () => {
    const tracker = new TokenTracker();
    tracker.recordSessionStart();

    const duration = tracker.getCurrentSessionDuration();
    assert.ok(duration !== "N/A");
    // Should be very short (0m or 1m)
    assert.ok(duration.match(/^\d+m$/));
  });
});

// ─── Daily stats ──────────────────────────────────────────────

describe("TokenTracker — daily stats", () => {
  it("aggregates by date", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 100, output: 10, cost: 1 });
    tracker.recordUsage("m1", "p1", { input: 200, output: 20, cost: 2 });

    const daily = tracker.getDailyStatsList();
    assert.equal(daily.length, 1);

    const today = new Date().toISOString().slice(0, 10);
    assert.equal(daily[0].date, today);
    assert.equal(daily[0].input, 300);
    assert.equal(daily[0].turns, 2);
  });

  it("returns empty list when no usage", () => {
    const tracker = new TokenTracker();
    assert.equal(tracker.getDailyStatsList().length, 0);
  });

  it("most active day", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 100, output: 0, cost: 0 });

    const most = tracker.getMostActiveDay();
    assert.ok(most !== null);
    assert.ok(most!.tokens, "100");
  });

  it("favorite model by token volume", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("small", "p1", { input: 50, output: 10 });
    tracker.recordUsage("big", "p1", { input: 500, output: 100 });

    assert.equal(tracker.getFavoriteModel(), "big");
  });

  it("active day count", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 1 });

    const days = tracker.getActiveDayCount();
    assert.equal(days.active, 1);
  });

  it("streaks with single day", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { input: 1 });

    const streaks = tracker.getStreaks();
    assert.equal(streaks.longest, 1);
  });
});

// ─── Throughput ───────────────────────────────────────────────

describe("TokenTracker — throughput", () => {
  it("returns formatted throughput string", () => {
    const tracker = new TokenTracker();
    const tp = tracker.getThroughput();
    assert.ok(typeof tp === "string");
  });
});

// ─── Model provider mapping ───────────────────────────────────

describe("TokenTracker — model provider mapping", () => {
  it("stores model to provider mapping", () => {
    const tracker = new TokenTracker();
    tracker.setModelProvider("claude-opus-4-5", "anthropic");

    assert.equal(tracker.getProvider("claude-opus-4-5"), "anthropic");
  });

  it("matches by sub-string as fallback", () => {
    const tracker = new TokenTracker();
    tracker.setModelProvider("claude-opus-4-5", "anthropic");

    // Matches by sub-string
    assert.equal(tracker.getProvider("some-prefix/claude-opus-4-5"), "anthropic");
  });

  it("returns undefined for unknown model", () => {
    const tracker = new TokenTracker();
    assert.equal(tracker.getProvider("nonexistent"), undefined);
    assert.equal(tracker.getProvider(undefined), undefined);
  });
});

// ─── Export JSON ──────────────────────────────────────────────

describe("TokenTracker — export", () => {
  it("toExportJSON returns serializable object", () => {
    const tracker = new TokenTracker();
    tracker.setModelProvider("claude", "anthropic");
    tracker.recordUsage("claude", "anthropic", {
      input: 1000,
      output: 200,
      cacheRead: 100,
      cacheWrite: 50,
      cost: 0.015,
    });
    tracker.recordSubagentUsage("architect", {
      input: 500,
      output: 100,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.005,
    });

    const exported = tracker.toExportJSON() as Record<string, unknown>;

    assert.ok(typeof exported.exportedAt === "string");
    assert.equal(exported.model, "claude");
    assert.equal(exported.provider, "anthropic");

    const total = exported.total as Record<string, unknown>;
    assert.equal(total.input, 1000);
    assert.equal(total.turns, 1);

    const models = exported.byModel as Record<string, Record<string, unknown>>;
    assert.ok(models.claude);
    assert.equal(models.claude.input, 1000);
    assert.equal(models.claude.cost, 0.015);

    const subagents = exported.subagents as Record<string, unknown>;
    const saTotal = subagents.total as Record<string, unknown>;
    assert.equal(saTotal.input, 500);
  });
});

// ─── Persistence round-trip ───────────────────────────────────

describe("TokenTracker — persistence", () => {
  it("round-trips through toPersistenceData and fromPersistenceData", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("claude", "anthropic", {
      input: 1000,
      output: 200,
      cacheRead: 100,
      cacheWrite: 50,
      cost: 0.015,
    });
    tracker.recordSubagentUsage("architect", {
      input: 500,
      output: 100,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.005,
    });
    tracker.recordSessionStart();
    tracker.recordSessionStart();

    const data = tracker.toPersistenceData();
    const restored = TokenTracker.fromPersistenceData(data);

    const restoredStats = restored.getStats();
    assert.equal(restoredStats.total.input, 1000);
    assert.equal(restoredStats.total.turns, 1);
    assert.equal(restored.getSessionCount(), 2);

    const models = restored.getModelStats();
    assert.equal(models.length, 1);
    assert.equal(models[0].model, "claude");

    const daily = restored.getDailyStatsList();
    assert.equal(daily.length, 1);
  });

  it("restoreFrom copies all aggregated stats (byModel, byProvider, total, dailyStats, sessionCount)", () => {
    const original = new TokenTracker();
    original.recordUsage("claude", "anthropic", { input: 1000, output: 200, cost: 0.015 });
    original.recordUsage("gpt-4o", "openai", { input: 500, output: 100, cost: 0.01 });
    original.recordSessionStart();
    original.recordSessionStart();

    // Persist and restore as fromPersistenceData would
    const data = original.toPersistenceData();
    const restored = TokenTracker.fromPersistenceData(data);

    // Apply restoreFrom to a fresh tracker (simulating session_start)
    const fresh = new TokenTracker();
    fresh.restoreFrom(restored);

    // Aggregated stats should be fully restored
    assert.equal(fresh.getStats().total.input, 1500);
    assert.equal(fresh.getStats().total.turns, 2);
    assert.equal(fresh.getSessionCount(), 2);

    const models = fresh.getModelStats();
    assert.equal(models.length, 2);
    const claude = models.find(m => m.model === "claude")!;
    assert.equal(claude.stats.input, 1000);
    assert.equal(claude.stats.cost, 0.015);

    assert.equal(fresh.getDailyStatsList().length, 1);
  });

  it("restoreFrom does not restore subagent tokens", () => {
    const original = new TokenTracker();
    original.recordUsage("m1", "p1", { input: 100 });
    original.recordSubagentUsage("scout", { input: 50, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0.001 });

    const data = original.toPersistenceData();
    const restored = TokenTracker.fromPersistenceData(data);
    const fresh = new TokenTracker();
    fresh.restoreFrom(restored);

    // Main agent data restored
    assert.equal(fresh.getStats().total.input, 100);
    // Subagent data NOT restored
    assert.equal(fresh.getSubagentTokens().turns, 0);
  });

  it("handles empty/undefined persistence data", () => {
    const tracker = TokenTracker.fromPersistenceData(null);
    assert.equal(tracker.getStats().total.turns, 0);

    const tracker2 = TokenTracker.fromPersistenceData({});
    assert.equal(tracker2.getStats().total.turns, 0);

    const tracker3 = TokenTracker.fromPersistenceData("invalid");
    assert.equal(tracker3.getStats().total.turns, 0);
  });

  it("restores subagent details from daily stats only (subagent not persisted separately)", () => {
    // Subagent data is NOT persisted in toPersistenceData — that's by design
    // (subagent tokens are volatile per-session)
    const tracker = new TokenTracker();
    tracker.recordSubagentUsage("architect", { input: 500, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.005 });

    const data = tracker.toPersistenceData();
    const restored = TokenTracker.fromPersistenceData(data);

    // Subagent tokens reset after persistence restore
    const sa = restored.getSubagentTokens();
    assert.equal(sa.turns, 0);
  });
});

// ─── getModelStats / getProviderStats sorting ─────────────────

describe("TokenTracker — sorting", () => {
  it("getModelStats sorts by cost descending", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("cheap", "p", { input: 1000, cost: 0.001 });
    tracker.recordUsage("expensive", "p", { input: 100, cost: 5 });
    tracker.recordUsage("medium", "p", { input: 500, cost: 0.5 });

    const models = tracker.getModelStats();
    assert.equal(models[0].model, "expensive");
    assert.equal(models[1].model, "medium");
    assert.equal(models[2].model, "cheap");
  });

  it("getProviderStats sorts by cost descending", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "cheap-provider", { cost: 0.01 });
    tracker.recordUsage("m2", "expensive-provider", { cost: 10 });

    const providers = tracker.getProviderStats();
    assert.equal(providers[0].provider, "expensive-provider");
    assert.equal(providers[1].provider, "cheap-provider");
  });
});

// ─── getSessionCost ───────────────────────────────────────────

describe("TokenTracker — session cost", () => {
  it("tracks cost since session start", () => {
    const tracker = new TokenTracker();
    tracker.recordUsage("m1", "p1", { cost: 5 });

    const cost = tracker.getSessionCost();
    // Session started at 0, total cost is 5
    assert.equal(cost, 5);
  });
});

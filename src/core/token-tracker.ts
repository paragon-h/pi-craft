/**
 * Pi Craft — Token Tracker
 *
 * 全局 Token 消耗追踪器，按 Model / Provider / Session 三维度统计。
 * 数据来源：message_end 事件 → AssistantMessage.usage
 * 持久化：pi.appendEntry("craft-token-stats", ...)
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ─── 类型 ────────────────────────────────────────────────────

export interface TokenSnapshot {
  timestamp: number;
  model: string;
  provider: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turnIndex: number;
}

export interface ModelStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
}

export interface ProviderStats {
  input: number;
  output: number;
  cost: number;
  requests: number;
}

export interface TokenStats {
  byModel: Map<string, ModelStats>;
  byProvider: Map<string, ProviderStats>;
  total: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  session: {
    startTime: number;
    inputAtStart: number;
    outputAtStart: number;
    costAtStart: number;
  };
  history: TokenSnapshot[];
}

export interface DailyStats {
  date: string;      // "YYYY-MM-DD"
  input: number;
  output: number;
  cost: number;
  turns: number;
}

// ─── 格式化 ──────────────────────────────────────────────────

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatThroughput(tokens: number, elapsedMs: number): string {
  if (elapsedMs <= 0) return "N/A";
  const perSecond = tokens / (elapsedMs / 1000);
  if (perSecond < 1) return `${perSecond.toFixed(1)} tok/s`;
  return `${Math.round(perSecond)} tok/s`;
}

// ─── TokenTracker ────────────────────────────────────────────

export class TokenTracker {
  private stats: TokenStats;
  private turnIndex = 0;
  private subagentTokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
  private subagentDetails: Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number }> = new Map();
  /** model ID → actual provider name (from model_select event) */
  private modelProviders = new Map<string, string>();
  private static CUSTOM_TYPE = "craft-token-stats";

  // ── Session & daily tracking ─────────
  private sessionCount = 0;
  private currentSessionStart = 0;
  private dailyStats = new Map<string, DailyStats>();

  constructor() {
    this.stats = {
      byModel: new Map(),
      byProvider: new Map(),
      total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      session: {
        startTime: Date.now(),
        inputAtStart: 0,
        outputAtStart: 0,
        costAtStart: 0,
      },
      history: [],
    };
  }

  // ─── 数据采集 ──────────────────────────────────────────

  recordUsage(
    model: string | undefined,
    provider: string | undefined,
    usage: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      cost?: number;
      totalTokens?: number;
    },
  ): void {
    const input = usage.input ?? 0;
    const output = usage.output ?? 0;
    const cacheRead = usage.cacheRead ?? 0;
    const cacheWrite = usage.cacheWrite ?? 0;
    const cost = usage.cost ?? 0;

    this.turnIndex++;

    const providerName = provider ?? "unknown";

    // Model stats
    const modelKey = model ?? "unknown";
    const modelStats = this.stats.byModel.get(modelKey) ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      turns: 0,
    };
    modelStats.input += input;
    modelStats.output += output;
    modelStats.cacheRead += cacheRead;
    modelStats.cacheWrite += cacheWrite;
    modelStats.cost += cost;
    modelStats.turns++;
    this.stats.byModel.set(modelKey, modelStats);

    // Provider stats
    const providerKey = providerName;
    const providerStats = this.stats.byProvider.get(providerKey) ?? {
      input: 0,
      output: 0,
      cost: 0,
      requests: 0,
    };
    providerStats.input += input;
    providerStats.output += output;
    providerStats.cost += cost;
    providerStats.requests++;
    this.stats.byProvider.set(providerKey, providerStats);

    // Total
    this.stats.total.input += input;
    this.stats.total.output += output;
    this.stats.total.cacheRead += cacheRead;
    this.stats.total.cacheWrite += cacheWrite;
    this.stats.total.cost += cost;
    this.stats.total.turns++;

    // History
    this.stats.history.push({
      timestamp: Date.now(),
      model: modelKey,
      provider: providerKey,
      input,
      output,
      cacheRead,
      cacheWrite,
      cost,
      turnIndex: this.turnIndex,
    });

    // Keep last 100 snapshots
    if (this.stats.history.length > 100) {
      this.stats.history = this.stats.history.slice(-100);
    }

    // Daily aggregation
    const date = new Date(this.stats.history[this.stats.history.length - 1].timestamp)
      .toISOString().slice(0, 10);
    const existing = this.dailyStats.get(date) ?? { date, input: 0, output: 0, cost: 0, turns: 0 };
    existing.input += input;
    existing.output += output;
    existing.cost += cost;
    existing.turns++;
    this.dailyStats.set(date, existing);
  }

  // ─── 查询 ────────────────────────────────────────────

  getStats(): TokenStats {
    return this.stats;
  }

  /** 记录 subagent（独立进程）的 token 消耗，按 agent 名分组 */
  recordSubagentUsage(agentName: string, usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }): void {
    this.subagentTokens.input += usage.input;
    this.subagentTokens.output += usage.output;
    this.subagentTokens.cacheRead += usage.cacheRead;
    this.subagentTokens.cacheWrite += usage.cacheWrite;
    this.subagentTokens.cost += usage.cost;
    this.subagentTokens.turns++;

    const existing = this.subagentDetails.get(agentName) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
    existing.input += usage.input;
    existing.output += usage.output;
    existing.cacheRead += usage.cacheRead;
    existing.cacheWrite += usage.cacheWrite;
    existing.cost += usage.cost;
    existing.turns++;
    this.subagentDetails.set(agentName, existing);
  }

  getSubagentTokens() {
    return { ...this.subagentTokens };
  }

  /** 每个 subagent 的明细 */
  getSubagentBreakdown(): Array<{ agent: string; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number }> {
    return Array.from(this.subagentDetails.entries())
      .map(([agent, s]) => ({ agent, ...s }))
      .sort((a, b) => b.cost - a.cost);
  }

  /** 总消耗 = 主 agent + subagent */
  getTotalAllIn(): { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number } {
    return {
      input: this.stats.total.input + this.subagentTokens.input,
      output: this.stats.total.output + this.subagentTokens.output,
      cacheRead: this.stats.total.cacheRead + this.subagentTokens.cacheRead,
      cacheWrite: this.stats.total.cacheWrite + this.subagentTokens.cacheWrite,
      cost: this.stats.total.cost + this.subagentTokens.cost,
      turns: this.stats.total.turns + this.subagentTokens.turns,
    };
  }

  /** 缓存命中率 = cacheRead / (cacheRead + input) */
  getCacheHitRate(): { rate: number; cacheRead: number; input: number; savings: number } {
    const totalCacheRead = this.stats.total.cacheRead + this.subagentTokens.cacheRead;
    const totalInput = this.stats.total.input + this.subagentTokens.input;

    const total = totalCacheRead + totalInput;
    const rate = total > 0 ? totalCacheRead / total : 0;

    // Estimate savings from actual cost data (cache reads ~75% cheaper on average)
    let savings = 0;
    if (totalCacheRead > 0 && totalInput > 0) {
      const totalCost = this.stats.total.cost + this.subagentTokens.cost;
      if (totalCost > 0) {
        // totalCost = regularInput * price + cacheRead * price * 0.25
        // → price = totalCost / (regularInput + cacheRead * 0.25)
        const fullInputPrice = totalCost / (totalInput + totalCacheRead * 0.25);
        savings = totalCacheRead * fullInputPrice * 0.75;
      }
    }
    return { rate, cacheRead: totalCacheRead, input: totalInput, savings };
  }

  getModelStats(): Array<{ model: string; stats: ModelStats }> {
    return Array.from(this.stats.byModel.entries())
      .map(([model, stats]) => ({ model, stats }))
      .sort((a, b) => b.stats.cost - a.stats.cost);
  }

  getProviderStats(): Array<{ provider: string; stats: ProviderStats }> {
    return Array.from(this.stats.byProvider.entries())
      .map(([provider, stats]) => ({ provider, stats }))
      .sort((a, b) => b.stats.cost - a.stats.cost);
  }

  getSessionCost(): number {
    return this.stats.total.cost - this.stats.session.costAtStart;
  }

  // ── Session & daily tracking ───────

  /** Call on session_start to track session count and duration */
  recordSessionStart(): void {
    this.sessionCount++;
    this.currentSessionStart = Date.now();
  }

  getSessionCount(): number {
    return this.sessionCount;
  }

  getCurrentSessionDuration(): string {
    if (!this.currentSessionStart) return "N/A";
    const ms = Date.now() - this.currentSessionStart;
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h ${mins % 60}m`;
  }

  /** Sorted daily stats (newest first) */
  getDailyStatsList(): DailyStats[] {
    return Array.from(this.dailyStats.values()).sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Favorite model by total token volume */
  getFavoriteModel(): string {
    let best = "N/A";
    let max = 0;
    for (const [model, stats] of this.stats.byModel) {
      const tokens = stats.input + stats.output;
      if (tokens > max) { max = tokens; best = model; }
    }
    return best;
  }

  /** Active days (days with any usage) */
  getActiveDayCount(): { active: number; total: number } {
    const days = Array.from(this.dailyStats.keys()).sort();
    if (days.length === 0) return { active: 0, total: 0 };
    const first = new Date(days[0]);
    const last = new Date(days[days.length - 1]);
    const total = Math.ceil((last.getTime() - first.getTime()) / 86400000) + 1;
    return { active: days.length, total };
  }

  /** Most active day */
  getMostActiveDay(): { date: string; tokens: number } | null {
    let best: DailyStats | null = null;
    for (const ds of this.dailyStats.values()) {
      if (!best || (ds.input + ds.output) > (best.input + best.output)) best = ds;
    }
    if (!best) return null;
    return { date: best.date, tokens: best.input + best.output };
  }

  /** Calculate streaks from daily data */
  getStreaks(): { longest: number; current: number } {
    const dates = new Set(this.dailyStats.keys());
    if (dates.size === 0) return { longest: 0, current: 0 };

    const sorted = Array.from(dates).sort();
    let longest = 0;
    let current = 1;
    let streak = 1;

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = (curr.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) {
        streak++;
      } else {
        longest = Math.max(longest, streak);
        streak = 1;
      }
    }
    longest = Math.max(longest, streak);

    const today = new Date().toISOString().slice(0, 10);
    const lastDate = sorted[sorted.length - 1];
    const lastDiff = (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000;
    if (lastDiff <= 1) {
      current = streak;
    } else {
      current = 0;
    }

    return { longest, current };
  }

  getThroughput(): string {
    const elapsed = Date.now() - this.stats.session.startTime;
    return formatThroughput(this.stats.total.output, elapsed);
  }

  // ─── 持久化 ──────────────────────────────────────────

  /** Record model → provider mapping from model_select event */
  setModelProvider(modelId: string, provider: string): void {
    this.modelProviders.set(modelId, provider);
  }

  /** Get provider for a model, using stored mapping */
  getProvider(modelId: string | undefined): string | undefined {
    if (!modelId) return undefined;
    if (this.modelProviders.has(modelId)) return this.modelProviders.get(modelId);
    const lastSegment = modelId.split("/").pop();
    if (lastSegment && this.modelProviders.has(lastSegment)) return this.modelProviders.get(lastSegment);
    for (const [key, provider] of this.modelProviders) {
      if (modelId.includes(key)) return provider;
    }
    return undefined;
  }

  toPersistenceData(): {
    byModel: Array<[string, ModelStats]>;
    byProvider: Array<[string, ProviderStats]>;
    total: TokenStats["total"];
    session: TokenStats["session"];
    history: TokenSnapshot[];
    dailyStats: Array<[string, DailyStats]>;
    sessionCount: number;
  } {
    return {
      byModel: Array.from(this.stats.byModel.entries()),
      byProvider: Array.from(this.stats.byProvider.entries()),
      total: { ...this.stats.total },
      session: { ...this.stats.session },
      history: [...this.stats.history.slice(-20)],
      dailyStats: Array.from(this.dailyStats.entries()).slice(-400),
      sessionCount: this.sessionCount,
    };
  }

  static fromPersistenceData(data: unknown): TokenTracker {
    const tracker = new TokenTracker();
    if (!data || typeof data !== "object") return tracker;

    const d = data as Record<string, unknown>;
    if (Array.isArray(d.byModel)) {
      tracker.stats.byModel = new Map(d.byModel as Array<[string, ModelStats]>);
    }
    if (Array.isArray(d.byProvider)) {
      tracker.stats.byProvider = new Map(d.byProvider as Array<[string, ProviderStats]>);
    }
    if (d.total && typeof d.total === "object") {
      tracker.stats.total = { ...tracker.stats.total, ...(d.total as TokenStats["total"]) };
    }
    if (d.session && typeof d.session === "object") {
      tracker.stats.session = {
        ...(d.session as TokenStats["session"]),
        startTime: Date.now(), // 使用当前时间，而非恢复时间
      };
    }
    if (Array.isArray(d.history)) {
      tracker.stats.history = d.history as TokenSnapshot[];
    }
    if (Array.isArray(d.dailyStats)) {
      tracker.dailyStats = new Map(d.dailyStats as Array<[string, DailyStats]>);
    }
    if (typeof d.sessionCount === "number") {
      tracker.sessionCount = d.sessionCount;
    }

    return tracker;
  }

  static getCustomType(): string {
    return TokenTracker.CUSTOM_TYPE;
  }
}

// ─── 扩展注册辅助 ────────────────────────────────────────────

/**
 * 在 message_end 事件中提取并记录 token 使用量
 */
export function setupTokenTracking(pi: ExtensionAPI, tracker: TokenTracker): void {
  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    const msg = event.message as AssistantMessage;
    const usage = msg.usage;
    if (!usage) return;

    tracker.recordUsage(
      msg.model,
      tracker.getProvider(msg.model), // real provider from model_select, fallback to string parse
      {
        input: usage.input,
        output: usage.output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
        cost: usage.cost?.total,
        totalTokens: usage.totalTokens,
      },
    );
  });

  // 持久化：每个 turn 结束时
  pi.on("turn_end", async () => {
    pi.appendEntry(TokenTracker.getCustomType(), tracker.toPersistenceData());
  });
}

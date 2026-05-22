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

  constructor() {
    this.stats = {
      byModel: new Map(),
      byProvider: new Map(),
      total: { input: 0, output: 0, cost: 0, turns: 0 },
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
    // 聚合所有 model 的 cache 数据
    let cacheRead = 0;
    let cacheWrite = 0;
    for (const [, stats] of this.stats.byModel) {
      cacheRead += stats.cacheRead;
      cacheWrite += stats.cacheWrite;
    }
    return {
      input: this.stats.total.input + this.subagentTokens.input,
      output: this.stats.total.output + this.subagentTokens.output,
      cacheRead: cacheRead + this.subagentTokens.cacheRead,
      cacheWrite: cacheWrite + this.subagentTokens.cacheWrite,
      cost: this.stats.total.cost + this.subagentTokens.cost,
      turns: this.stats.total.turns + this.subagentTokens.turns,
    };
  }

  /** 缓存命中率 = cacheRead / (cacheRead + input)，按 model 分别计算 */
  getCacheHitRate(): { rate: number; cacheRead: number; input: number; savings: number } {
    let totalCacheRead = 0;
    let totalInput = 0;
    for (const [, stats] of this.stats.byModel) {
      totalCacheRead += stats.cacheRead;
      totalInput += stats.input;
    }
    // 加上 subagent 的
    totalCacheRead += this.subagentTokens.cacheRead;
    totalInput += this.subagentTokens.input;

    const total = totalCacheRead + totalInput;
    const rate = total > 0 ? totalCacheRead / total : 0;
    // Deepseek: cache hit ~$0.07/M vs miss ~$0.27/M, 节省约 74%
    const savings = totalCacheRead > 0 ? totalCacheRead * 0.00000027 * 0.74 : 0;
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
  } {
    return {
      byModel: Array.from(this.stats.byModel.entries()),
      byProvider: Array.from(this.stats.byProvider.entries()),
      total: { ...this.stats.total },
      session: { ...this.stats.session },
      history: [...this.stats.history.slice(-20)], // 仅保留最近 20 条
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
      tracker.stats.total = { ...(d.total as TokenStats["total"]) };
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

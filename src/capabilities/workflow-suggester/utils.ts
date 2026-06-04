/**
 * Pi Craft — Workflow Suggester Utilities
 *
 * Pure functions for development intent detection and suggestion cooldown.
 * Extracted from the Workflow Suggester capability for testability.
 */

// ═══════════════════════════════════════════════════════════════
// Intent Detection
// ═══════════════════════════════════════════════════════════════

export const INTENT_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\b(implement|code|write|program)\s+(a|the|this|some)\s/i, weight: 4, label: "explicit coding request" },
  { pattern: /\b(build|create|make|develop)\s+(a|the|this|some|an)\s/i, weight: 3, label: "creation request" },
  { pattern: /\badd\s+(a|the|this|some)\s+(feature|function|endpoint|route|api|page|component|module|middleware|handler|service|controller)\b/i, weight: 4, label: "feature request" },
  { pattern: /(帮我|给我|请)\s*(实现|写|开发|编写|做一个|搞一个|加一个)/, weight: 4, label: "explicit coding request (zh)" },
  { pattern: /(实现|编写|开发|写).{0,12}(功能|项目|模块|接口|API|系统|应用|登录|认证|注册|页面)/, weight: 4, label: "implement + target (zh)" },
  { pattern: /(创建|新建|建一个|做一个|生成).{0,15}(功能|项目|模块|接口|服务|API|系统|应用)/, weight: 4, label: "creation request (zh)" },
  { pattern: /(添加|加上|加一个|增加).{0,15}(功能|接口|API|页面|组件|模块|中间件|路由|端点|服务|控制器)/, weight: 4, label: "feature addition (zh)" },
  { pattern: /\b(refactor|rewrite|restructure|reorganize)\s/i, weight: 2, label: "refactor request" },
  { pattern: /\b(fix|patch|resolve)\s+(the|this|a)\s+(bug|issue|problem)\b/i, weight: 2, label: "bug fix" },
  { pattern: /\b(change|modify|update|upgrade)\s+(the|this|all|our)\s/i, weight: 2, label: "modification request" },
  { pattern: /(重构|重写)/, weight: 3, label: "refactor request (zh)" },
  { pattern: /(修复|修一下|解决).{0,15}(bug|问题|错误|报错|异常)/i, weight: 3, label: "bug fix (zh)" },
  { pattern: /(优化|改一下|改改|改造|调整)/, weight: 2, label: "improvement request (zh)" },
  { pattern: /(修改|改|更新|升级)(一下|这个|那个)/, weight: 2, label: "modification request (zh)" },
  { pattern: /\b(implement|build)\b/i, weight: 1, label: "dev keyword" },
  { pattern: /\bcan\s+you\s+(help\s+me\s+)?(write|code|build|implement)\b/i, weight: 3, label: "dev help request" },
  { pattern: /\bi\s+(want|need|have\s+to)\s+(to\s+)?(build|create|implement|add|make|write|develop)\b/i, weight: 3, label: "personal dev intent" },
  { pattern: /我(想|需要|要|准备|打算|计划)\s*(实现|做|开发|写|创建|添加|加一个)/, weight: 3, label: "personal dev intent (zh)" },
];

export const NEGATIVE_PATTERNS: RegExp[] = [
  /\b(explain|what\s+is|how\s+does|tell\s+me\s+about|describe|summarize)\b/i,
  /\b(commit|push|pull\s+request|merge)\b/i,
  /\b(review|check|look\s+at|examine|inspect)\b/i,
  /\b(deploy|release|publish|ship)\b/i,
  /\b(document|readme|comment|docs?)\s/i,
  /(什么|怎么|为什么|如何|解释|说明|告诉我|讲一下|介绍一下)/,
  /(提交|commit|推送|push|合并|merge|PR)/,
  /(审查|检查|看一下|看看|review|审阅)/,
  /(部署|上线|发布|deploy|release|发版)/,
  /(文档|readme|README|注释|写注释|写文档)/,
];

export const MINIMUM_SCORE = 3;

export interface AnalysisResult {
  intent: boolean;
  score: number;
  reasons: string[];
}

export function detectDevelopmentIntent(messages: string[]): AnalysisResult {
  let score = 0;
  const reasons: string[] = [];
  let negativeScore = 0;

  if (messages.length === 0) return { intent: false, score: 0, reasons: [] };

  for (const msg of messages) {
    for (const pattern of NEGATIVE_PATTERNS) {
      if (pattern.test(msg)) {
        negativeScore += 1;
      }
    }

    for (const { pattern, weight, label } of INTENT_PATTERNS) {
      if (pattern.test(msg)) {
        score += weight;
        reasons.push(label);
      }
    }
  }

  score = Math.max(0, score - negativeScore * 2);

  return {
    intent: score >= MINIMUM_SCORE,
    score,
    reasons: [...new Set(reasons)],
  };
}

// ═══════════════════════════════════════════════════════════════
// Cooldown Tracker
// ═══════════════════════════════════════════════════════════════

export class CooldownTracker {
  private lastSuggestedAt = 0;
  private consecutiveNoCount = 0;
  private disableUntil = 0;

  /** Time between suggestions after user says no (ms) */
  private readonly DECLINE_COOLDOWN = 10 * 60 * 1000;  // 10 min
  /** How much cooldown increases per consecutive "no" */
  private readonly BACKOFF_MULTIPLIER = 2;

  canSuggest(now?: number): boolean {
    return (now ?? Date.now()) > this.disableUntil;
  }

  recordSuggestion(): void {
    this.lastSuggestedAt = Date.now();
  }

  recordAccept(): void {
    this.consecutiveNoCount = 0;
    this.lastSuggestedAt = 0;
  }

  recordDecline(now?: number): void {
    this.consecutiveNoCount++;
    const backoff = this.DECLINE_COOLDOWN * Math.pow(this.BACKOFF_MULTIPLIER, this.consecutiveNoCount - 1);
    this.disableUntil = (now ?? Date.now()) + backoff;
  }
}

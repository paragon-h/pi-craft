/**
 * Pi Craft — Workflow Suggester Capability
 *
 * Monitors conversations and proactively suggests entering the coding
 * develop workflow when it detects development intent in user messages.
 *
 * Configuration:
 *   craft.enableWorkflowSuggester: boolean (default true)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCraftConfig, isOn } from "../../core/config";
import { getState } from "../../core/registry";

// ═══════════════════════════════════════════════════════════════
// Intent Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Patterns that strongly indicate the user wants to build/create something.
 * Scored by weight — higher = stronger intent signal.
 */
const INTENT_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Strong signals — explicit build/create/implement requests
  { pattern: /\b(implement|code|write|program)\s+(a|the|this|some)\s/i, weight: 4, label: "explicit coding request" },
  { pattern: /\b(build|create|make|develop)\s+(a|the|this|some|an)\s/i, weight: 3, label: "creation request" },
  { pattern: /\badd\s+(a|the|this|some)\s+(feature|function|endpoint|route|api|page|component|module|middleware|handler|service|controller)\b/i, weight: 4, label: "feature request" },

  // Medium signals — refactor/change/modify
  { pattern: /\b(refactor|rewrite|restructure|reorganize)\s/i, weight: 2, label: "refactor request" },
  { pattern: /\b(fix|patch|resolve)\s+(the|this|a)\s+(bug|issue|problem)\b/i, weight: 2, label: "bug fix" },
  { pattern: /\b(change|modify|update|upgrade)\s+(the|this|all|our)\s/i, weight: 2, label: "modification request" },

  // Weaker signals — intent keywords without object context
  { pattern: /\b(implement|build)\b/i, weight: 1, label: "dev keyword" },
  { pattern: /\bcan\s+you\s+(help\s+me\s+)?(write|code|build|implement)\b/i, weight: 3, label: "dev help request" },
  { pattern: /\bi\s+(want|need|have\s+to)\s+(to\s+)?(build|create|implement|add|make|write|develop)\b/i, weight: 3, label: "personal dev intent" },
];

/** Negative patterns — strong indicators this is NOT a dev task */
const NEGATIVE_PATTERNS: RegExp[] = [
  /\b(explain|what\s+is|how\s+does|tell\s+me\s+about|describe|summarize)\b/i,  // questions
  /\b(commit|push|pull\s+request|merge)\b/i,                                     // git operations
  /\b(review|check|look\s+at|examine|inspect)\b/i,                               // review/check
  /\b(deploy|release|publish|ship)\b/i,                                          // deployment
  /\b(document|readme|comment|docs?)\s/i,                                        // documentation
];

/** Minimum cumulative weight to trigger suggestion */
const MINIMUM_SCORE = 3;

/** Maximum number of recent user messages to analyze */
const MAX_MESSAGE_COUNT = 3;

// ═══════════════════════════════════════════════════════════════
// Analysis
// ═══════════════════════════════════════════════════════════════

interface AnalysisResult {
  intent: boolean;
  score: number;
  reasons: string[];
}

/**
 * Analyze recent user messages for development intent.
 */
function detectDevelopmentIntent(messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>): AnalysisResult {
  let score = 0;
  const reasons: string[] = [];
  let negativeScore = 0;

  // Collect recent user messages (most recent first, limit to MAX)
  const userMessages: string[] = [];
  for (const msg of [...messages].reverse()) {
    if (userMessages.length >= MAX_MESSAGE_COUNT) break;
    if (msg.role === "user") {
      let text = "";
      for (const part of msg.content) {
        if (part.type === "text" && part.text) text += part.text;
      }
      if (text.trim()) userMessages.push(text.trim());
    }
  }

  if (userMessages.length === 0) return { intent: false, score: 0, reasons: [] };

  // Check the most recent user message first (strongest signal)
  for (const msg of userMessages) {
    // Check negative patterns first
    for (const pattern of NEGATIVE_PATTERNS) {
      if (pattern.test(msg)) {
        negativeScore += 1;
      }
    }

    // Check intent patterns
    for (const { pattern, weight, label } of INTENT_PATTERNS) {
      if (pattern.test(msg)) {
        score += weight;
        reasons.push(label);
      }
    }
  }

  // Negative signals reduce confidence
  score = Math.max(0, score - negativeScore * 2);

  return {
    intent: score >= MINIMUM_SCORE,
    score,
    reasons: [...new Set(reasons)], // deduplicate
  };
}

// ═══════════════════════════════════════════════════════════════
// Suggestion Cooldown
// ═══════════════════════════════════════════════════════════════

/**
 * Prevent spamming suggestions. Different cooldowns for different outcomes.
 */
class CooldownTracker {
  private lastSuggestedAt = 0;
  private consecutiveNoCount = 0;
  private disableUntil = 0;

  /** Time between suggestions after user says no (ms) */
  private readonly DECLINE_COOLDOWN = 10 * 60 * 1000;  // 10 min

  /** Base time between successful suggestions (ms) */
  private readonly BASE_COOLDOWN = 2 * 60 * 1000;      // 2 min

  /** How much cooldown increases per consecutive "no" */
  private readonly BACKOFF_MULTIPLIER = 2;

  canSuggest(): boolean {
    return Date.now() > this.disableUntil;
  }

  recordSuggestion(): void {
    this.lastSuggestedAt = Date.now();
  }

  recordAccept(): void {
    this.consecutiveNoCount = 0;
    this.lastSuggestedAt = 0;
  }

  recordDecline(): void {
    this.consecutiveNoCount++;
    const backoff = this.DECLINE_COOLDOWN * Math.pow(this.BACKOFF_MULTIPLIER, this.consecutiveNoCount - 1);
    this.disableUntil = Date.now() + backoff;
  }
}

// ═══════════════════════════════════════════════════════════════
// Extension Entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableWorkflowSuggester")) return;

  const cooldown = new CooldownTracker();

  // ── turn_end: analyze conversation, suggest workflow ──
  pi.on("turn_end", async (_event, ctx) => {
    if (!cooldown.canSuggest()) return;

    const state = getState();
    if (!state) return;

    // Don't suggest if there's already an active coding workflow
    const engine = state.engine;
    if (engine && engine.isActive() && engine.getType() === "coding") return;

    // Get recent messages from the conversation
    const messages = ctx.conversation?.getMessages?.() ?? [];
    if (messages.length === 0) return;

    // Analyze for development intent
    const result = detectDevelopmentIntent(messages);

    if (!result.intent) return;

    cooldown.recordSuggestion();

    if (!ctx.hasUI) return;

    const score = result.score >= 5 ? "strong" : "moderate";
    const ok = await ctx.ui.confirm(
      "🔧 Start Coding Workflow?",
      `Detected ${score} development intent (${result.reasons.join(", ")}).\n\nStart the structured coding workflow?\n(code analysis → requirement → design → testing → implementation)`,
    );

    if (ok) {
      cooldown.recordAccept();
      ctx.ui.notify("Starting coding workflow... Describe your requirement.", "info");
      // Trigger the coding:develop command programmatically
      pi.sendUserMessage("/coding:develop\n\nProceed with the coding workflow for the task at hand.", { deliverAs: "steer" });
    } else {
      cooldown.recordDecline();
    }
  });
}

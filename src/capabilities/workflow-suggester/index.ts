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
import { CRAFT_WORKFLOW_TYPE } from "../../core/workflow-types";
import { INTENT_PATTERNS, NEGATIVE_PATTERNS, MINIMUM_SCORE, detectDevelopmentIntent, CooldownTracker } from "./utils.js";

// ═══════════════════════════════════════════════════════════════
// Extension Entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableWorkflowSuggester")) return;

  const cooldown = new CooldownTracker();
  const recentMessages: string[] = [];
  const MAX_RECENT = 5;

  // ── input: capture user messages ────────────────────
  pi.on("input", async (event) => {
    const text = event.text.trim();
    if (!text || text.startsWith("/")) return; // skip commands and empty
    recentMessages.push(text);
    if (recentMessages.length > MAX_RECENT) {
      recentMessages.shift();
    }
  });

  // ── before_agent_start: intercept BEFORE AI responds ──
  // Inject a prompt hint so the AI suggests the workflow proactively,
  // rather than waiting for a popup after the AI has already started working.
  pi.on("before_agent_start", async (event, ctx) => {
    if (!cooldown.canSuggest()) return;

    // Check if a workflow is already active
    let workflowActive = false;
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === CRAFT_WORKFLOW_TYPE) {
        const meta = e.data as any;
        if (meta?.stage && meta.stage !== "done") workflowActive = true;
        break;
      }
    }
    if (workflowActive) return;

    const state = getState();
    if (!state) return;

    if (recentMessages.length === 0) return;

    const messages = [...recentMessages].reverse();
    const result = detectDevelopmentIntent(messages);

    if (!result.intent) return;

    cooldown.recordSuggestion();

    // Inject a prompt hint for the AI — don't use system prompt to avoid
    // interfering with existing stage prompts from coding workflow.
    const hint = `\n\n[WORKFLOW SUGGESTION]\nThe user's message shows strong development intent (${result.reasons.join(", ")}).\nBefore diving into implementation, BRIEFLY ask: "Start the coding workflow for this?" and use the start_coding_workflow tool if they confirm. Do NOT just start coding — give them the option.`;

    return { systemPrompt: (event.systemPrompt ?? "") + hint };
  });

  // ── after_workflow_start: clear recent messages ─────
  // When the coding workflow starts, reset the buffer so we don't
  // keep suggesting during an active workflow.
  pi.on("tool_call", async (event) => {
    if (event.toolName === "start_coding_workflow") {
      cooldown.recordAccept();
      recentMessages.length = 0;
    }
  });

  // ── turn_end: popup fallback for non-UI sessions ────
  pi.on("turn_end", async (_event, ctx) => {
    if (!cooldown.canSuggest()) return;

    // Check if workflow already active
    let wfActive = false;
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "custom" && e.customType === CRAFT_WORKFLOW_TYPE) {
        const meta = e.data as any;
        if (meta?.stage && meta.stage !== "done") wfActive = true;
        break;
      }
    }
    if (wfActive) return;

    const state = getState();
    if (!state) return;

    if (recentMessages.length === 0) return;

    const messages = [...recentMessages].reverse();
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
      recentMessages.length = 0;
      ctx.ui.notify("Starting coding workflow... Describe your requirement.", "info");
      pi.sendUserMessage("/coding:develop\n\nProceed with the coding workflow for the task at hand.", { deliverAs: "steer" });
    } else {
      cooldown.recordDecline();
    }
  });
}

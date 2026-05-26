/**
 * Coding Develop — Thin Orchestration Layer
 *
 * Registers all 5 stage modules and provides shared start + widget logic.
 * Each stage owns its own event handlers (prompt injection, completion detection).
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine } from "../../../../core/workflow-engine";
import type { SubagentManager } from "../../../../core/subagent-manager";
import type { TokenTracker } from "../../../../core/token-tracker";
import type { StatuslineManager } from "../../../../ui/statusline";

import { updateWidget, getNextStage, AUTO_TRIGGER, buildStagePrompt } from "./flow";
import { register as registerCodeAnalysis, prompt as codeAnalysisPrompt } from "./stages/code-analysis";
import { register as registerRequirement, prompt as requirementPrompt } from "./stages/requirement";
import { register as registerDesign, prompt as designPrompt } from "./stages/design";
import { register as registerTesting, prompt as testingPrompt } from "./stages/testing";
import { register as registerImplementation, prompt as implementationPrompt } from "./stages/implementation";

const STAGE_PROMPTS: Record<string, string> = {
  code_analysis: codeAnalysisPrompt,
  requirement: requirementPrompt,
  design: designPrompt,
  testing: testingPrompt,
  implementation: implementationPrompt,
};

export interface DevelopContext {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  engine: WorkflowEngine;
  subagent: SubagentManager;
  tracker: TokenTracker;
  statusline: StatuslineManager;
  parallelEnabled: boolean;
}

export function register(dc: DevelopContext): void {
  const { pi, engine, ctx, statusline } = dc;

  // Register per-stage prompt injection only
  registerCodeAnalysis(dc);
  registerRequirement(dc);
  registerDesign(dc);
  registerTesting(dc);
  registerImplementation(dc);

  // Centralized [STAGE_COMPLETE] detection — runs ONCE per agent_end
  pi.on("agent_end", async (event, _ctx) => {
    if (!engine.isActive() || engine.getType() !== "coding") return;
    const currentStage = engine.getStage();

    // Skip idle/completed
    if (currentStage === "idle" || currentStage === "completed") return;

    // Implementation stage has its own logic (auto-continue + approval)
    if (currentStage === "implementation") return;

    // Check for stage complete marker
    let lastText = "";
    for (const msg of [...event.messages].reverse()) {
      if (msg.role === "assistant") {
        for (const part of msg.content) {
          if (part.type === "text" && part.text) lastText += part.text;
        }
        break;
      }
    }

    if (!lastText.includes("[STAGE_COMPLETE]")) return;

    const next = getNextStage(currentStage);
    if (!next) {
      // No next stage → workflow complete
      engine.transition("completed");
      statusline.updateWorkflow("coding", "completed");
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
      ctx.ui.setWidget("craft-progress", undefined);
      ctx.ui.notify("🎉 Development workflow completed!", "success");
      return;
    }

    // Testing → Implementation needs user confirmation
    if (currentStage === "testing" && next === "implementation" && ctx.hasUI) {
      const ok = await ctx.ui.confirm(
        "Enter Implementation Phase?",
        "The design and testing plan are ready.\n\nOnce you enter implementation, the AI will freely execute code changes without per-step approval.\n\nReady to proceed?",
      );
      if (!ok) {
        ctx.ui.notify("Implementation deferred. You can continue when ready.", "info");
        return;
      }
    }

    // Transition
    engine.transition(next);
    statusline.updateWorkflow("coding", next);
    pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
    updateWidget(ctx, engine);
    ctx.ui.notify(`→ ${next}`, "info");

    // Auto-trigger next stage — include stage prompt so LLM has full context
    const trigger = AUTO_TRIGGER[next];
    if (trigger) {
      const stagePrompt = STAGE_PROMPTS[next];
      const resolved = stagePrompt
        ? buildStagePrompt(dc, stagePrompt)
        : "";
      const fullMessage = trigger + (resolved ? "\n\n" + resolved : "");
      setTimeout(() => pi.sendUserMessage(fullMessage, { deliverAs: "steer" }), 0);
    }
  });

  // Shared widget update
  pi.on("turn_end", async () => updateWidget(dc.ctx, dc.engine));
}

export function start(dc: DevelopContext, requirement: string): void {
  const { pi, engine } = dc;

  if (engine.getStage() === "code_analysis") {
    pi.sendUserMessage(
      `Analyze the project codebase for this requirement:\n\n"${requirement}"\n\nWrite the report using write tool (parameter: "path"). Add [STAGE_COMPLETE] when done.`,
      { deliverAs: "steer" },
    );
  }

  updateWidget(dc.ctx, dc.engine);
}

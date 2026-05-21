/**
 * Coding Review — 审查分析阶段
 */

import type { ReviewContext } from "../index";
import { getNextStage, extractLastAssistantText, buildStagePrompt } from "../flow";

export const stage = "analyze";
export const label = "Analyze";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "review-analyze";
export const subagentNames = ["reviewer"];

export const prompt = `[REVIEW ANALYSIS PHASE — READ-ONLY · PARALLEL REVIEWERS]

★ Write analysis to: DOCUMENT_PATH
★ Scope and context under: PLANS_DIR

1. Read the scope document from PLANS_DIR.
2. Call reviewer subagents to analyze the code identified in scope.
3. Compile findings into the analysis document.
4. Add [STAGE_COMPLETE] when done.`;

export function register(rc: ReviewContext): void {
  const { pi, engine, ctx } = rc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(rc, prompt) };
  });

  pi.on("agent_end", async (event, _ctx) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    const lastText = extractLastAssistantText(event.messages);
    if (!lastText.includes("[STAGE_COMPLETE]")) return;

    const next = getNextStage(stage);
    if (next) {
      engine.transition(next);
      rc.statusline.updateWorkflow("coding", next);
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
      ctx.ui.notify(`✅ Review → ${next}. Continue to proceed.`, "info");
    } else {
      engine.transition("completed");
      rc.statusline.updateWorkflow("coding", "completed");
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
      ctx.ui.setWidget("craft-progress", undefined);
      ctx.ui.notify("✅ Code review completed!", "success");
    }
  });
}

/**
 * Coding Review — 审查范围阶段
 */

import type { ReviewContext } from "../index";
import { getNextStage, extractLastAssistantText, buildStagePrompt } from "../flow";

export const stage = "scope";
export const label = "Scope";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls", "bash"];
export const documentSuffix = "review-scope";

export const prompt = `[REVIEW SCOPE PHASE — READ-ONLY]

You are determining the code review scope. You CANNOT modify any code.

★ Write scope document to: DOCUMENT_PATH
★ All documents under: PLANS_DIR

1. Identify which files need review based on the review target.
2. Determine review criteria (code quality, security, performance, etc.).
3. Write the scope document with file list and criteria.
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

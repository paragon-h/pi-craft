/**
 * Coding Review — 审查报告阶段
 */

import type { ReviewContext } from "../index";
import { getNextStage, extractLastAssistantText, buildStagePrompt } from "../flow";

export const stage = "report";
export const label = "Report";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls", "bash"];
export const documentSuffix = "review-report";
export const subagentNames = ["implementer"];

export const prompt = `[REVIEW REPORT PHASE — READ-ONLY]

★ Write report to: DOCUMENT_PATH
★ Analysis and context under: PLANS_DIR

1. Read the analysis from PLANS_DIR.
2. Summarize findings, prioritize issues by severity.
3. For critical issues, ask user if they want auto-fix (use [APPROVAL_NEEDED]).
4. Write the final review report to DOCUMENT_PATH.
5. Add [STAGE_COMPLETE] when done.`;

export function register(rc: ReviewContext): void {
  const { pi, engine, ctx } = rc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(rc, prompt) };
  });

  pi.on("agent_end", async (event, _ctx) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    const lastText = extractLastAssistantText(event.messages);

    if (lastText.includes("[STAGE_COMPLETE]")) {
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
    }

    if (lastText.includes("[APPROVAL_NEEDED]") && ctx.hasUI) {
      const ok = await ctx.ui.confirm("Approve Fix?", "Apply this suggested fix?");
      if (ok) {
        pi.sendUserMessage("APPROVED. Apply the fix.", { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage("SKIP. Move to the next issue.", { deliverAs: "followUp" });
      }
    }
  });
}

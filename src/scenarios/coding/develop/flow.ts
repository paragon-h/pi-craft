/**
 * Coding Develop — Shared Flow Helpers
 *
 * Constants and utilities shared across all develop stages.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine, WorkflowStage } from "../../../../core/workflow-engine";
import { renderProgressBar } from "../../../../ui/components/workflow-progress";
import type { DevelopContext } from "./index";

export const STAGE_ORDER: WorkflowStage[] = [
  "code_analysis",
  "requirement",
  "design",
  "testing",
  "implementation",
];

export const AUTO_TRIGGER: Record<string, string> = {
  requirement: "Begin the requirement clarification phase. Ask me ONE question at a time.",
  design: "Begin the design phase. Read the documents and call the architect subagent.",
  testing: "Begin the testing strategy phase. Ask me to choose a testing approach.",
  implementation:
    "Begin the implementation phase. Read all documents from PLANS_DIR, generate the task breakdown, and start coding.",
};

export function getNextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] as WorkflowStage;
}

export function extractLastAssistantText(messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>): string {
  for (const msg of [...messages].reverse()) {
    if (msg.role === "assistant") {
      let text = "";
      for (const part of msg.content) {
        if (part.type === "text" && part.text) text += part.text;
      }
      return text;
    }
  }
  return "";
}

export function subagentHint(parallelEnabled: boolean): string {
  return parallelEnabled
    ? "\n\n## SUBAGENT MODE: PARALLEL ENABLED\nYou CAN use parallel subagents. Group independent tasks with subagent({ tasks: [...] }). Dependent tasks with subagent({ chain: [...] })."
    : "\n\n## SUBAGENT MODE: DIRECT EXECUTION\nParallel subagents are DISABLED. Execute all work yourself directly. Do NOT call the subagent tool — it will not help.";
}

/** Build full stage prompt with placeholder replacement */
export function buildStagePrompt(
  dc: DevelopContext,
  stagePrompt: string,
): string {
  const { engine } = dc;
  const docPath = engine.getDocumentPathForStage(engine.getStage()) ?? "";
  const plansDir = engine.getContext().plansDir;
  return stagePrompt
    .replace(/DOCUMENT_PATH/g, docPath)
    .replace(/PLANS_DIR/g, plansDir)
    + subagentHint(dc.parallelEnabled);
}

/** Persist engine state and update UI after stage transition */
export function onTransition(
  dc: DevelopContext,
  next: WorkflowStage,
  pi: { appendEntry: (type: string, data: unknown) => void; sendUserMessage: (msg: string) => void },
): void {
  dc.engine.transition(next);
  dc.statusline.updateWorkflow("coding", next);
  pi.appendEntry("craft-workflow-state", dc.engine.toPersistenceEntry().data);
  updateWidget(dc.ctx, dc.engine);

  const trigger = AUTO_TRIGGER[next];
  if (trigger) {
    setTimeout(() => pi.sendUserMessage(trigger, { deliverAs: "steer" }), 0);
  }
}

export function updateWidget(ctx: ExtensionContext, engine: WorkflowEngine): void {
  if (!ctx.hasUI || !engine.isActive()) return;
  const stage = engine.getStage();
  if (stage === "idle" || stage === "completed") {
    ctx.ui.setWidget("craft-progress", undefined);
    return;
  }
  const lines = renderProgressBar("develop", stage, ctx.ui.theme, 80);
  ctx.ui.setWidget("craft-progress", lines);
}

/**
 * Coding Review — Shared Flow Helpers
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine, WorkflowStage } from "../../../../core/workflow-engine";
import { renderProgressBar } from "../../../../ui/components/workflow-progress";
import type { ReviewContext } from "./index";

export const STAGE_ORDER: WorkflowStage[] = ["scope", "analyze", "report"];

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

export function buildStagePrompt(rc: ReviewContext, stagePrompt: string): string {
  const { engine } = rc;
  const docPath = engine.getDocumentPathForStage(engine.getStage()) ?? "";
  const plansDir = engine.getContext().plansDir;
  return stagePrompt
    .replace(/DOCUMENT_PATH/g, docPath)
    .replace(/PLANS_DIR/g, plansDir);
}

export function updateWidget(ctx: ExtensionContext, engine: WorkflowEngine): void {
  if (!ctx.hasUI || !engine.isActive()) return;
  const stage = engine.getStage();
  if (stage === "idle" || stage === "completed") {
    ctx.ui.setWidget("craft-progress", undefined);
    return;
  }
  const lines = renderProgressBar("review", stage, ctx.ui.theme, 80);
  ctx.ui.setWidget("craft-progress", lines);
}

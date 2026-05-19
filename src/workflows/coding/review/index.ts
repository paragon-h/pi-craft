/**
 * Coding Review — 代码审查子场景
 *
 * 状态机：scope → analyze → report → completed
 *
 * 不自动触发下一轮，由用户自然交互驱动。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine, WorkflowStage } from "../../../../core/workflow-engine";
import type { SubagentManager } from "../../../../core/subagent-manager";
import type { TokenTracker } from "../../../../core/token-tracker";
import type { StatuslineManager } from "../../../../ui/statusline";
import { renderProgressBar } from "../../../../ui/components/workflow-progress";

import * as scopeStage from "./stages/scope";
import * as analyzeStage from "./stages/analyze";
import * as reportStage from "./stages/report";

const STAGES = [scopeStage, analyzeStage, reportStage] as const;

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.stage, s])) as Record<string, (typeof STAGES)[number]>;

const STAGE_ORDER = STAGES.map((s) => s.stage);

function getNextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] as WorkflowStage;
}

export interface ReviewContext {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  engine: WorkflowEngine;
  subagent: SubagentManager;
  tracker: TokenTracker;
  statusline: StatuslineManager;
}

export function register(rc: ReviewContext): void {
  const { pi, ctx, engine } = rc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive()) return;
    if (engine.getType() !== "coding") return;

    const currentStage = engine.getStage();
    const stageDef = STAGE_MAP[currentStage];
    if (!stageDef) return;

    const docPath = engine.getDocumentPathForStage(currentStage) ?? "";
    const plansDir = engine.getContext().plansDir;
    const fullPrompt = stageDef.prompt
      .replace(/DOCUMENT_PATH/g, docPath)
      .replace(/PLANS_DIR/g, plansDir);

    return {
      systemPrompt: (event.systemPrompt ?? "") + "\n\n" + fullPrompt,
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!engine.isActive()) return;
    if (engine.getType() !== "coding") return;

    const currentStage = engine.getStage();

    const lastMessages = [...event.messages].reverse();
    let lastText = "";
    for (const msg of lastMessages) {
      if (msg.role === "assistant") {
        for (const part of msg.content) {
          if (part.type === "text") lastText += part.text;
        }
        break;
      }
    }

    if (lastText.includes("[STAGE_COMPLETE]")) {
      const next = getNextStage(currentStage);
      if (next) {
        engine.transition(next);
        rc.statusline.updateWorkflow("coding", next);
        pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
        updateWidget(ctx, engine);
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

  pi.on("turn_end", async (_event, ctx) => {
    updateWidget(ctx, engine);
  });
}

export function start(rc: ReviewContext, target: string): void {
  const { pi, engine } = rc;

  if (engine.getStage() === "scope") {
    const scopeTarget = target || "current git diff (uncommitted changes)";
    pi.sendUserMessage(
      `Review scope: ${scopeTarget}\n\nDetermine what to review and write the scope document. Add [STAGE_COMPLETE] when done.`,
    );
  }

  updateWidget(rc.ctx, rc.engine);
}

function updateWidget(ctx: ExtensionContext, engine: WorkflowEngine): void {
  if (!ctx.hasUI || !engine.isActive()) return;
  const stage = engine.getStage();
  if (stage === "idle" || stage === "completed") {
    ctx.ui.setWidget("craft-progress", undefined);
    return;
  }
  const lines = renderProgressBar("review", stage, ctx.ui.theme, 80);
  ctx.ui.setWidget("craft-progress", lines);
}

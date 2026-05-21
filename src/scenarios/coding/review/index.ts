/**
 * Coding Review — Thin Orchestration Layer
 *
 * Registers all 3 review stage modules. Each stage owns its own event handlers.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine } from "../../../../core/workflow-engine";
import type { SubagentManager } from "../../../../core/subagent-manager";
import type { TokenTracker } from "../../../../core/token-tracker";
import type { StatuslineManager } from "../../../../ui/statusline";

import { updateWidget } from "./flow";
import { register as registerScope } from "./stages/scope";
import { register as registerAnalyze } from "./stages/analyze";
import { register as registerReport } from "./stages/report";

export interface ReviewContext {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  engine: WorkflowEngine;
  subagent: SubagentManager;
  tracker: TokenTracker;
  statusline: StatuslineManager;
}

export function register(rc: ReviewContext): void {
  registerScope(rc);
  registerAnalyze(rc);
  registerReport(rc);

  // 共享 widget 更新
  rc.pi.on("turn_end", async () => updateWidget(rc.ctx, rc.engine));
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

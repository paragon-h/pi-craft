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

import { updateWidget } from "./flow";
import { register as registerCodeAnalysis } from "./stages/code-analysis";
import { register as registerRequirement } from "./stages/requirement";
import { register as registerDesign } from "./stages/design";
import { register as registerTesting } from "./stages/testing";
import { register as registerImplementation } from "./stages/implementation";

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
  registerCodeAnalysis(dc);
  registerRequirement(dc);
  registerDesign(dc);
  registerTesting(dc);
  registerImplementation(dc);

  // 共享 widget 更新（所有阶段共用）
  dc.pi.on("turn_end", async () => updateWidget(dc.ctx, dc.engine));
}

export function start(dc: DevelopContext, requirement: string): void {
  const { pi, engine } = dc;

  if (engine.getStage() === "code_analysis") {
    pi.sendUserMessage(
      `Analyze the project codebase for this requirement:\n\n"${requirement}"\n\nWrite the report using write tool (parameter: "path"). Add [STAGE_COMPLETE] when done.`,
    );
  }

  updateWidget(dc.ctx, dc.engine);
}

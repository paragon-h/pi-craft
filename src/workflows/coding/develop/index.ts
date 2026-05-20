/**
 * Coding Develop — 全流程开发子场景
 *
 * 状态机：code_analysis → requirement → design → testing → implementation → completed
 *
 * 交互策略：
 * - code_analysis：自动完成
 * - requirement：一问一答，自动推进
 * - design：交互展示设计，等用户确认
 * - testing：交互选策略，等用户确认
 * - implementation：**进入前需确认**，进入后自由执行
 * - 阶段转换后自动触发下一轮对话（仅 implementation 入口需要用户手动确认）
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine, WorkflowStage } from "../../../../core/workflow-engine";
import type { SubagentManager } from "../../../../core/subagent-manager";
import type { TokenTracker } from "../../../../core/token-tracker";
import type { StatuslineManager } from "../../../../ui/statusline";
import { renderProgressBar } from "../../../../ui/components/workflow-progress";

import * as codeAnalysisStage from "./stages/code-analysis";
import * as requirementStage from "./stages/requirement";
import * as designStage from "./stages/design";
import * as testingStage from "./stages/testing";
import * as implementationStage from "./stages/implementation";

const STAGES = [codeAnalysisStage, requirementStage, designStage, testingStage, implementationStage] as const;

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.stage, s])) as Record<string, (typeof STAGES)[number]>;

const STAGE_ORDER = STAGES.map((s) => s.stage);

// 阶段转换后的触发消息（简短，因为 system prompt 已注入完整指令）
const AUTO_TRIGGER: Record<string, string> = {
  requirement: "Begin the requirement clarification phase. Ask me ONE question at a time.",
  design: "Begin the design phase. Read the documents and call the architect subagent.",
  testing: "Begin the testing strategy phase. Ask me to choose a testing approach.",
  // implementation 不自动触发，需要用户确认
};

function getNextStage(current: WorkflowStage): WorkflowStage | null {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] as WorkflowStage;
}

export interface DevelopContext {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  engine: WorkflowEngine;
  subagent: SubagentManager;
  tracker: TokenTracker;
  statusline: StatuslineManager;
}

export function register(dc: DevelopContext): void {
  const { pi, ctx, engine } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive()) return;
    if (engine.getType() !== "coding") return;

    ctx.ui.setWidget("craft-stage-hint", undefined);

    const currentStage = engine.getStage();
    const stageDef = STAGE_MAP[currentStage];
    if (!stageDef || stageDef.stage === "completed") return;

    const docPath = engine.getDocumentPathForStage(currentStage) ?? "";
    const plansDir = engine.getContext().plansDir;

    // 替换路径占位符（精确匹配，不含尖括号）
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

    // 阶段完成 → 推进
    if (lastText.includes("[STAGE_COMPLETE]")) {
      const next = getNextStage(currentStage);
      if (next) {
        // 进入 implementation 前需要用户确认
        if (next === "implementation" && ctx.hasUI) {
          const ok = await ctx.ui.confirm(
            "Enter Implementation Phase?",
            "The design and testing plan are ready.\n\nOnce you enter implementation, the AI will freely execute code changes without per-step approval.\n\nReady to proceed?",
          );
          if (!ok) {
            ctx.ui.notify("Implementation deferred. You can continue when ready.", "info");
            return;
          }
        }

        engine.transition(next);
        dc.statusline.updateWorkflow("coding", next);
        pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
        updateWidget(ctx, engine);
        ctx.ui.notify(
          `${STAGE_MAP[next]?.icon ?? ""} Entering: ${STAGE_MAP[next]?.label ?? next}`,
          "info",
        );

        // 自动触发下一轮
        // 延迟到 agent_end handler 返回后、agent 完全 idle 再发送，
        // 避免 "Agent is already processing" 错误和与用户手动输入的竞争
        const trigger = AUTO_TRIGGER[next];
        if (trigger) {
          setTimeout(() => pi.sendUserMessage(trigger), 0);
        }
      } else {
        engine.transition("completed");
        dc.statusline.updateWorkflow("coding", "completed");
        pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
        ctx.ui.setWidget("craft-progress", undefined);
        ctx.ui.notify("🎉 Development workflow completed!", "success");
      }
    }

    // 审批门（仅用于 review 场景的修复确认，develop 场景在 implementation 入口已完成确认）
    if (lastText.includes("[APPROVAL_NEEDED]") && ctx.hasUI) {
      const ok = await ctx.ui.confirm(
        "Approve?",
        "Apply this change?",
      );
      if (ok) {
        pi.sendUserMessage("APPROVED. Proceed.", { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage("REJECTED. Revise.", { deliverAs: "followUp" });
      }
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    updateWidget(ctx, engine);
  });
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

function updateWidget(ctx: ExtensionContext, engine: WorkflowEngine): void {
  if (!ctx.hasUI || !engine.isActive()) return;
  const stage = engine.getStage();
  if (stage === "idle" || stage === "completed") {
    ctx.ui.setWidget("craft-progress", undefined);
    return;
  }
  const lines = renderProgressBar("develop", stage, ctx.ui.theme, 80);
  ctx.ui.setWidget("craft-progress", lines);
}

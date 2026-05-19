/**
 * Pi Craft — Coding Scenario
 *
 * 场景入口。根据子场景路由到 develop 或 review 模块。
 * 两个子场景共享 agents/ 目录和基础设施。
 *
 * 目录结构：
 *   coding/
 *   ├── index.ts          ← 你在这里
 *   ├── develop/index.ts  ← 全流程开发状态机
 *   ├── review/index.ts   ← 代码审查状态机
 *   ├── agents/           ← 共享 Subagent 定义
 *   └── prompts/          ← 提示词模板
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SubagentManager } from "../../core/subagent-manager";
import { TokenTracker } from "../../core/token-tracker";
import { WorkflowEngine } from "../../core/workflow-engine";
import { StatuslineManager } from "../../ui/statusline";
import { register as registerDevelop, start as startDevelop } from "./develop/index";
import { register as registerReview, start as startReview } from "./review/index";

interface Managers {
  engine: WorkflowEngine | null;
  tracker: TokenTracker;
  subagent: SubagentManager;
  statusline: StatuslineManager;
}

const codingScenario = {
  name: "coding",
  description: "Full development workflow + Code review",

  register(pi: ExtensionAPI, ctx: ExtensionContext, managers: Managers): void {
    // 两个子场景共享 handlers，通过 engine.getStage() 区分当前在哪个子场景
    const engine = managers.engine;
    if (!engine) return;

    const dc = {
      pi,
      ctx,
      engine,
      subagent: managers.subagent,
      tracker: managers.tracker,
      statusline: managers.statusline,
    };

    // 根据当前工作流阶段判断属于哪个子场景
    const stage = engine.getStage();
    if (["code_analysis", "requirement", "design", "testing", "implementation"].includes(stage)) {
      registerDevelop(dc);
    }
    if (["scope", "analyze", "report"].includes(stage)) {
      registerReview(dc);
    }
  },

  async startWorkflow(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    managers: Managers,
    args: string,
  ): Promise<void> {
    const engine = managers.engine;
    if (!engine) return;

    const dc = {
      pi,
      ctx,
      engine,
      subagent: managers.subagent,
      tracker: managers.tracker,
      statusline: managers.statusline,
    };

    const stage = engine.getStage();

    // 注意：register 已经在上面调用过，这里只做 start，不再重复注册 handler
    if (["code_analysis", "requirement", "design", "testing", "implementation"].includes(stage)) {
      startDevelop(dc, args);
    }

    if (["scope", "analyze", "report"].includes(stage)) {
      startReview(dc, args);
    }
  },
};

export default codingScenario;

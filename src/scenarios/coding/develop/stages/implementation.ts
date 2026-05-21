/**
 * Coding Develop — 代码实现阶段
 *
 * 可写阶段。进入前需用户确认（testing stage 处理），进入后自由执行。
 * 特殊行为：turn 未完成时自动推进，[STAGE_COMPLETE] → completed。
 */

import type { DevelopContext } from "../index";
import { extractLastAssistantText, buildStagePrompt, updateWidget } from "../flow";

export const stage = "implementation";
export const label = "Implementation";
export const readOnly = false;
export const tools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
export const documentSuffix = "tasks";
export const subagentNames = ["implementer", "reviewer"];

export const prompt = `[IMPLEMENTATION PHASE — FULL ACCESS · AUTO-CONTINUE]

★ Task breakdown: PLANS_DIR/tasks.md
★ Todo list: PLANS_DIR/todos.md
★ Design: PLANS_DIR/design.md
★ Testing plan: PLANS_DIR/testing-plan.md

RULES:
1. Read design and testing plan from PLANS_DIR FIRST.
2. Break work into small tasks, write tasks.md and todos.md.
3. Execute tasks one by one, updating todos.md as you go.
4. When all tasks are done, add [STAGE_COMPLETE].
5. Write tests alongside implementation — no separate "add tests" task.
6. If you need user decision mid-task, use [APPROVAL_NEEDED].`;

export function register(dc: DevelopContext): void {
  const { pi, engine, ctx } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });

  pi.on("agent_end", async (event, _ctx) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;

    const lastText = extractLastAssistantText(event.messages);

    // 完成 → 结束工作流
    if (lastText.includes("[STAGE_COMPLETE]")) {
      engine.transition("completed");
      dc.statusline.updateWorkflow("coding", "completed");
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
      ctx.ui.setWidget("craft-progress", undefined);
      ctx.ui.notify("🎉 Development workflow completed!", "success");
      return;
    }

    // 审批门
    if (lastText.includes("[APPROVAL_NEEDED]") && ctx.hasUI) {
      const ok = await ctx.ui.confirm("Approve?", "Apply this change?");
      if (ok) {
        pi.sendUserMessage("APPROVED. Proceed.", { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage("REJECTED. Revise.", { deliverAs: "followUp" });
      }
      return;
    }

    // 未完成 → 自动推进下一轮
    setTimeout(() => {
      pi.sendUserMessage(
        "Update tasks.md and todos.md to mark the completed task, then continue to the next task. Do not stop until all tasks are complete.",
      );
    }, 0);
  });

  pi.on("turn_end", async () => updateWidget(ctx, engine));
}

/**
 * Coding Develop — 代码实现阶段
 *
 * 可写阶段。进入前需用户确认（testing stage 处理），进入后自由执行。
 * 特殊行为：turn 未完成时自动推进，[STAGE_COMPLETE] → completed。
 *
 * Safety: max 5 consecutive auto-continues. After that, pauses and asks user.
 * Detects stuck patterns (errors, questions, confusion) and stops early.
 */

import type { DevelopContext } from "../index";
import { extractLastAssistantText, buildStagePrompt, updateWidget } from "../flow";

export const stage = "implementation";
export const label = "Implementation";
export const readOnly = false;
export const tools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
export const documentSuffix = "tasks";
export const subagentNames = ["implementer", "reviewer"];

const MAX_AUTO_CONTINUE = 5;

/** Track consecutive auto-continues per workflow instance */
const autoContinueCounts = new Map<string, number>();

/** LLM response patterns that suggest it's stuck / needs user help */
const STUCK_PATTERNS: RegExp[] = [
  /i('m|\s+am)\s+(stuck|unsure|confused|not\s+sure|unable)/i,
  /i\s+(need|require)\s+(more\s+(info|context|details|clarification)|help|guidance)/i,
  /(cannot|can't|unable\s+to)\s+(find|locate|determine|identify|resolve|fix)/i,
  /please\s+(provide|tell\s+me|clarify|specify|confirm)/i,
  /(error|failed|failure|exception)\s+(occurred|detected|found)/i,
];

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

  // Reset counter when entering implementation stage
  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;

    // Check if this is the first turn in implementation (reset counter)
    const state = engine.getState();
    const history = state.stageHistory;
    const implEntries = history.filter(h => h.stage === "implementation");
    if (implEntries.length === 1 && !implEntries[0].exitedAt) {
      autoContinueCounts.set(state.id, 0);
    }

    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });

  pi.on("agent_end", async (event, _ctx) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;

    const lastText = extractLastAssistantText(event.messages);

    // 完成 → 结束工作流
    if (lastText.includes("[STAGE_COMPLETE]")) {
      autoContinueCounts.delete(engine.getState().id);
      engine.transition("completed");
      dc.statusline.updateWorkflow("coding", "completed");
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
      ctx.ui.setWidget("craft-progress", undefined);
      ctx.ui.notify("🎉 Development workflow completed!", "success");
      return;
    }

    // 审批门
    if (lastText.includes("[APPROVAL_NEEDED]") && ctx.hasUI) {
      autoContinueCounts.set(engine.getState().id, 0); // reset on user interaction
      const ok = await ctx.ui.confirm("Approve?", "Apply this change?");
      if (ok) {
        pi.sendUserMessage("APPROVED. Proceed.", { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage("REJECTED. Revise.", { deliverAs: "followUp" });
      }
      return;
    }

    // ── Stuck detection ────────────────────────────────
    const isStuck = STUCK_PATTERNS.some(p => p.test(lastText));
    if (isStuck && ctx.hasUI) {
      autoContinueCounts.delete(engine.getState().id);
      ctx.ui.notify("⚠️ Implementation paused — LLM may be stuck. Review the output and continue manually if needed.", "warning");
      return;
    }

    // ── Per-task approval mode ────────────────────────
    const approvalMode = engine.getContext().implementation?.approvalMode ?? "on_demand";
    if (approvalMode === "per_task" && ctx.hasUI) {
      autoContinueCounts.set(engine.getState().id, 0);
      const ok = await ctx.ui.confirm(
        "Continue to Next Task?",
        "Review the output above. Proceed to the next task?",
      );
      if (!ok) {
        ctx.ui.notify("Implementation paused. Use /coding:resume to continue.", "info");
        return;
      }
    }

    // ── Auto-continue with limit ───────────────────────
    const stateId = engine.getState().id;
    const count = (autoContinueCounts.get(stateId) ?? 0) + 1;
    autoContinueCounts.set(stateId, count);

    if (count > MAX_AUTO_CONTINUE && ctx.hasUI) {
      autoContinueCounts.delete(stateId);
      const ok = await ctx.ui.confirm(
        "Continue Implementation?",
        `Auto-continue limit reached (${MAX_AUTO_CONTINUE} turns).\n\nKeep going or pause to review?`,
      );
      if (!ok) {
        ctx.ui.notify("Implementation paused. Use /coding:resume to continue.", "info");
        return;
      }
      autoContinueCounts.set(stateId, 0);
    }

    // 未完成 → 自动推进下一轮
    setTimeout(() => {
      pi.sendUserMessage(
        "Update tasks.md and todos.md to mark the completed task, then continue to the next task. Do not stop until all tasks are complete.",
        { deliverAs: "steer" },
      );
    }, 0);
  });

  pi.on("turn_end", async () => updateWidget(ctx, engine));
}

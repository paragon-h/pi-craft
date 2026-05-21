/**
 * Coding Develop — 测试策略阶段
 */

import type { DevelopContext } from "../index";
import { getNextStage, extractLastAssistantText, buildStagePrompt, onTransition } from "../flow";

export const stage = "testing";
export const label = "Testing";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "testing-plan";

export const prompt = `[TESTING STRATEGY PHASE — READ-ONLY · FORCE INTERACTION]

★ Write testing plan to: DOCUMENT_PATH

1. Read the design document from PLANS_DIR.
2. Ask the user to choose a testing approach (unit / e2e / both / skip).
3. Write the testing strategy to DOCUMENT_PATH based on choice.
4. Add [STAGE_COMPLETE] when complete.`;

export function register(dc: DevelopContext): void {
  const { pi, engine, ctx } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });

  pi.on("agent_end", async (event, _ctx) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    const lastText = extractLastAssistantText(event.messages);
    if (!lastText.includes("[STAGE_COMPLETE]")) return;

    // 进入 implementation 前需用户确认
    const next = getNextStage(stage);
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

    if (next) {
      onTransition(dc, next, pi);
      ctx.ui.notify(`${label} → ${next}`, "info");
    }
  });
}

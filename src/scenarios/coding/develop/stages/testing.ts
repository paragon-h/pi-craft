/**
 * Coding Develop — 测试策略阶段
 */

import type { DevelopContext } from "../index";
import { buildStagePrompt } from "../flow";

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
  const { pi, engine } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });
}

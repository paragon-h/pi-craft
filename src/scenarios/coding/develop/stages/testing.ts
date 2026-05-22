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

export const prompt = `[TESTING STRATEGY PHASE — READ-ONLY · DO NOT WRITE CODE]

★ Write testing plan to: DOCUMENT_PATH

1. Read the design document from PLANS_DIR.
2. Ask the user to choose a testing approach (unit / e2e / both / skip).
3. Write the testing strategy to DOCUMENT_PATH based on choice.
4. Output [STAGE_COMPLETE] and STOP — the workflow engine will advance to implementation.

CRITICAL: Do NOT start implementing ANY code. Even if the user says "proceed" or "执行", you MUST NOT write/edit any source files. Only output [STAGE_COMPLETE]. The implementation stage will handle code writing.`;

export function register(dc: DevelopContext): void {
  const { pi, engine } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });
}

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
2. Ask the user to choose a testing approach:
   - unit — unit tests only
   - e2e — end-to-end tests only
   - both — unit + e2e
   - skip — no tests
3. Ask the user to choose an implementation approval mode:
   - auto — AI executes all tasks without stopping (fastest)
   - per_task — confirm before each task (safest)
   - on_demand — AI only stops when [APPROVAL_NEEDED] is used
4. Write the testing strategy AND approval mode to DOCUMENT_PATH.
5. Output [STAGE_COMPLETE] and STOP — the workflow engine will advance to implementation.

CRITICAL: Do NOT start implementing ANY code. Even if the user says "proceed" or "执行", you MUST NOT write/edit any source files. Only output [STAGE_COMPLETE]. The implementation stage will handle code writing.`;

export function register(dc: DevelopContext): void {
  const { pi, engine } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });
}

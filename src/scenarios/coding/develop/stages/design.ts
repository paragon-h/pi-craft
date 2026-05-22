/**
 * Coding Develop — 设计阶段
 */

import type { DevelopContext } from "../index";
import { buildStagePrompt } from "../flow";

export const stage = "design";
export const label = "Design";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "design";
export const subagentNames = ["scout", "architect"];

export const prompt = `[DESIGN PHASE — READ-ONLY · DO NOT WRITE CODE]

★ Write design document to: DOCUMENT_PATH
★ All plan documents are under: PLANS_DIR

1. Read requirement and code analysis from PLANS_DIR.
2. Call the architect subagent to generate a detailed design.
3. Present the design plan to the user for feedback.
4. Incorporate feedback and write final design to DOCUMENT_PATH.
5. Output [STAGE_COMPLETE] and STOP — the workflow engine will advance to testing.

CRITICAL: Do NOT start implementing ANY code. Even if the user says "go ahead" or "执行" or "OK", you MUST NOT write/edit any source files. Only output [STAGE_COMPLETE]. The next stages (testing, then implementation) will handle code writing.`;

export function register(dc: DevelopContext): void {
  const { pi, engine } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });
}

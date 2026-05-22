/**
 * Coding Develop — 需求澄清阶段
 */

import type { DevelopContext } from "../index";
import { buildStagePrompt } from "../flow";

export const stage = "requirement";
export const label = "Requirement";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "requirement";

export const prompt = `[REQUIREMENT CLARIFICATION PHASE — READ-ONLY]

★ Final document path: DOCUMENT_PATH

CRITICAL RULES:
1. Ask ONE question at a time. Wait for user answer before next question.
2. Read the code analysis from PLANS_DIR first.
3. Write clarified requirement to DOCUMENT_PATH after all Q&A done.
4. Add [STAGE_COMPLETE] when the requirement document is written.`;

export function register(dc: DevelopContext): void {
  const { pi, engine } = dc;

  pi.on("before_agent_start", async (event) => {
    if (!engine.isActive() || engine.getType() !== "coding" || engine.getStage() !== stage) return;
    return { systemPrompt: (event.systemPrompt ?? "") + "\n\n" + buildStagePrompt(dc, prompt) };
  });
}

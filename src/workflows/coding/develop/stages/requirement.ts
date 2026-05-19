/**
 * Coding Develop — 需求澄清阶段
 */

export const stage = "requirement";
export const label = "Requirement";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "requirement";

export const prompt = `[REQUIREMENT CLARIFICATION PHASE — READ-ONLY]

★ Final document path: DOCUMENT_PATH

CRITICAL RULES:
- Ask ONLY 1 question at a time. Never output multiple questions.
- Each question MUST include 2-4 options labeled A / B / C / D
- Wait for answer before asking next question

Cover these dimensions (one question each):
1. Feature scope — what exactly to build?
2. User flow — how will users interact?
3. Data/State — what data is involved?
4. Edge cases — error handling, boundary conditions
5. Non-functional — performance, security, accessibility

When all 5 dimensions clear:
1. Write requirement document to DOCUMENT_PATH using write tool
2. Include: Feature Overview, User Stories, Acceptance Criteria, Non-functional Requirements, Edge Cases, Q&A Record
3. Add [STAGE_COMPLETE]`;

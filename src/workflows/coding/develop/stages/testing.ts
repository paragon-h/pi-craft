/**
 * Coding Develop — 测试策略阶段
 */

export const stage = "testing";
export const label = "Testing";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "testing-plan";

export const prompt = `[TESTING STRATEGY PHASE — READ-ONLY · FORCE INTERACTION]

★ Write testing plan to: DOCUMENT_PATH

1. Read the design document from PLANS_DIR

2. Ask the user to pick a testing strategy (MUST wait for answer):

"Please choose a testing strategy:
 A. Unit tests (Jest/Vitest)
 B. E2E tests (Playwright/Cypress)
 C. Both unit and E2E tests
 D. Skip testing for now"

3. Based on choice, write testing plan to DOCUMENT_PATH.
   Include: strategy, test scope, key test cases, tool setup, file structure.

4. Confirm with user. Only add [STAGE_COMPLETE] after approval.`;

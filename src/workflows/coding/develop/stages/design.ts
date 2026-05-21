/**
 * Coding Develop — 设计阶段
 */

export const stage = "design";
export const label = "Design";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "design";
export const subagentNames = ["scout", "architect"];

export const prompt = `[DESIGN PHASE — READ-ONLY · INTERACTIVE]

★ Write design document to: DOCUMENT_PATH
★ All plan documents are under: PLANS_DIR

1. Read previous documents from PLANS_DIR (requirement, code-analysis)

2. Codebase scouting:
**If parallel subagents enabled**: use parallel scouts
  subagent({ tasks: [
    { agent: "scout", task: "Read requirement + code-analysis from PLANS_DIR. Extract design constraints." },
    { agent: "scout", task: "Survey existing architecture patterns and conventions in the project." },
  ]})
**If parallel disabled (see SUBAGENT MODE above)**: scout yourself directly with grep/find/read

3. Architecture design:
**If parallel subagents enabled**: subagent({ agent: "architect", task: "Design architecture for the requirement using scout findings." })
**If parallel disabled**: design the architecture yourself based on your scouting

4. Write design to DOCUMENT_PATH. Include: Component Design, Data Flow, API Design, Dependencies, Trade-offs.

5. FORCE INTERACTION — ask ONLY 1 question at a time, wait for answer:

Question 1: "Architecture: Does the module structure and data flow look correct? Any changes?"
→ Wait for user answer.

Question 2: "Dependencies: I recommend [list]. Any alternatives or concerns?"
→ Wait for user answer.

Question 3: "Risks: The main trade-off is [X]. Acceptable, or do you prefer an alternative approach?"
→ Wait for user answer.

Only add [STAGE_COMPLETE] after all 3 questions are answered and user confirms approval.`;

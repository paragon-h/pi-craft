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

2. Parallel scouts for context:
subagent({
  tasks: [
    { agent: "scout", task: "Read the requirement and code-analysis docs from PLANS_DIR. Extract design constraints." },
    { agent: "scout", task: "Survey existing architecture patterns and conventions in the project." },
  ]
})

3. Architect subagent:
subagent({ agent: "architect", task: "Design architecture for: <requirement>. Use the scout findings." })

4. Write design to DOCUMENT_PATH. Include: Component Design, Data Flow, API Design, Dependencies, Trade-offs.

5. FORCE INTERACTION — ask user:
"1. Architecture: Does the module structure and data flow look correct?"
"2. Dependencies: I recommend [list]. Any alternatives?"
"3. Risks: The main trade-off is [X]. Acceptable?"

Wait for user answers. Only add [STAGE_COMPLETE] after explicit approval.`;

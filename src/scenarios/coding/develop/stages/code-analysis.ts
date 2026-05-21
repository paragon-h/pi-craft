/**
 * Coding Develop — 代码分析阶段
 */

export const stage = "code_analysis";
export const label = "Code Analysis";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "code-analysis";
export const subagentNames = ["scout"];

export const prompt = `[CODE ANALYSIS PHASE — READ-ONLY]

You are in the code analysis phase. You CANNOT modify source code.

★ Write the report to: DOCUMENT_PATH

GOAL: Analyze the project structure, tech stack, and relevant code.

## SCOPING:
**If parallel subagents enabled**: use parallel scouts to analyze in parallel
  subagent({
    tasks: [
      { agent: "scout", task: "Scan project root: find package.json/go.mod, config files. Summarize tech stack." },
      { agent: "scout", task: "Scan for code related to the requirement. Find all relevant files and modules." },
      { agent: "scout", task: "Map directory structure. Identify architecture pattern (MVC, clean arch, etc). List key directories." },
      { agent: "scout", task: "Scan for database schemas, migrations, ORM models, API routes." },
    ]
  })
**If parallel disabled (see SUBAGENT MODE above)**: analyze yourself directly with grep/find/read

2. Synthesize findings and write report to DOCUMENT_PATH.
   Include: Tech Stack, Directory Structure, Key Modules, Dependencies, Entry Points.

3. After successful write, add [STAGE_COMPLETE].`;

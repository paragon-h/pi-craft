/**
 * Coding Develop — 代码分析阶段
 */

export const stage = "code_analysis";
export const label = "Code Analysis";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "code-analysis";
export const subagentNames = ["scout"];

export const prompt = `[CODE ANALYSIS PHASE — READ-ONLY · PARALLEL SCOUTS]

You are in the code analysis phase. You CANNOT modify source code.

★ Write the report to: DOCUMENT_PATH
  (This is the exact file path to use with the write tool)

GOAL: Analyze the project in parallel using multiple scout subagents.

1. Run parallel scouts:
subagent({
  tasks: [
    { agent: "scout", task: "Scan project root: find package.json/go.mod, config files. Summarize tech stack." },
    { agent: "scout", task: "Scan for auth/user/login related code. Find all relevant files." },
    { agent: "scout", task: "Map directory structure. Identify architecture pattern. List key directories." },
    { agent: "scout", task: "Scan for database schemas, migrations, ORM models." },
  ]
})

2. Synthesize findings and write report to DOCUMENT_PATH using write tool.
   write({ path: "DOCUMENT_PATH", content: "..." })

3. After successful write, add [STAGE_COMPLETE].`;

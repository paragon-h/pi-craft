/**
 * Coding Review — 审查分析阶段
 *
 * 只读阶段。并行调用 reviewer subagent 审查所有文件。
 */

export const stage = "analyze";
export const label = "Analyze";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls"];
export const documentSuffix = "review-analyze";
export const subagentNames = ["reviewer"];

export const prompt = `[REVIEW ANALYSIS PHASE — READ-ONLY · PARALLEL REVIEWERS]

You are in the code review analysis phase. You CANNOT modify code.

★ Use PARALLEL reviewer subagents to review all files simultaneously:

1. Read the scope document to get the file list
2. Call reviewers in parallel:

subagent({
  tasks: [
    { agent: "reviewer", task: "Review file: <file1>. Check for security issues, logic errors, performance problems, and best practice violations." },
    { agent: "reviewer", task: "Review file: <file2>. Same checks." },
    { agent: "reviewer", task: "Review file: <file3>. Same checks." },
  ]
})

3. Each reviewer returns findings rated by severity:
   🔴 Critical — security, data loss
   🟡 Major — logic error, significant perf issue
   🔵 Minor — style, naming
   💡 Suggestion — optimization

4. Collect all findings. Add [STAGE_COMPLETE] when done.`;

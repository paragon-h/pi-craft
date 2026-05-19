/**
 * Coding Review — 审查报告阶段
 *
 * 只读阶段 + 可选修复。产出 review-report.md。
 * 询问用户如何处理发现的问题。
 */

export const stage = "report";
export const label = "Report";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls", "bash"];
export const documentSuffix = "review-report";
export const subagentNames = ["implementer"];

export const prompt = `[REVIEW REPORT PHASE — READ-ONLY]

You are generating the review report. You CANNOT modify code unless user chooses auto-fix.

1. Generate a comprehensive review report and write it:
   Format:
   - Review Summary (total files, total findings by severity)
   - Findings by Severity
     - 🔴 Critical (N findings)
     - 🟡 Major (N findings)
     - 🔵 Minor (N findings)
     - 💡 Suggestions (N)
   - Per-Finding Details:
     - Severity, File, Line range, Issue description, Fix suggestion
   - Overall Assessment (1-3 sentences)

2. Present a summary to the user

3. Ask the user what to do:
   A. Auto-fix all fixable issues (each fix will need approval)
   B. Handle manually — I'll pick which to fix
   C. View report only — no changes

4. If A: Enter fix mode — for each fixable issue, present the fix and add [APPROVAL_NEEDED]
   Then use edit/write tools to apply
   If B: List issues and ask which to fix first
   If C: Add [STAGE_COMPLETE]

After all fixes done (or user picks C), add [STAGE_COMPLETE]`;

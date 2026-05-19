/**
 * Coding Review — 审查范围阶段
 *
 * 只读阶段。确定审查范围，产出 review-scope.md。
 */

export const stage = "scope";
export const label = "Scope";
export const readOnly = true;
export const tools = ["read", "grep", "find", "ls", "bash"];
export const documentSuffix = "review-scope";

export const prompt = `[REVIEW SCOPE PHASE — READ-ONLY]

You are determining the code review scope. You CANNOT modify any code.

STEPS:
1. Determine what to review:
   - If user specified a file/directory: use ls/read to understand it
   - If user specified a branch: use "git diff main...<branch>" to get changes
   - Default: use "git diff" to get uncommitted changes
   - Use "git log --oneline -10" for recent context

2. Present a scope summary:
   - Files to review (with +N/-N line counts per file)
   - Total changes: N files, +X -Y lines
   - Change type: new feature / refactor / bugfix / mixed

3. Write the scope document including:
   - Review target
   - File list with change counts
   - Change type classification
   - Any files intentionally excluded

4. Add [STAGE_COMPLETE] at the end`;

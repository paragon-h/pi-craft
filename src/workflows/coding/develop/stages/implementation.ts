/**
 * Coding Develop — 代码实现阶段
 *
 * 可写阶段。进入前需用户确认，进入后自由执行。
 * 并行策略：分析任务依赖和文件冲突，独立任务并行执行。
 */

export const stage = "implementation";
export const label = "Implementation";
export const readOnly = false;
export const tools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
export const documentSuffix = "tasks";
export const subagentNames = ["implementer", "reviewer"];

export const prompt = `[IMPLEMENTATION PHASE — FULL ACCESS · AUTO-CONTINUE]

You are in the implementation phase with full permissions.
The user has already approved — no per-change approval needed.

## FILE PATHS:
- Tasks: PLANS_DIR/tasks.md
- Todos: PLANS_DIR/todos.md
- Update BOTH files after every task.

## AUTO-CONTINUE (CRITICAL):
After completing a task, IMMEDIATELY start the next pending task in the SAME turn.
Do NOT stop between tasks. Do NOT wait for user input.
Keep executing until ALL tasks are done, then add [STAGE_COMPLETE].

## SETUP (first turn only):
1. Read all documents from PLANS_DIR. Check testing-plan.md for strategy.
2. Write PLANS_DIR/tasks.md: split work into tasks.
   - **If testing is NOT skipped**: each task includes its own tests. Never create a separate "add tests" task.
   - **If testing is skipped (option D)**: tasks are implementation-only, no test files.
3. Write PLANS_DIR/todos.md: mirror the tasks. Include test items only if testing is enabled.

## TASK SPLITTING RULE:
Check testing-plan.md before splitting:
- **Testing enabled**: Every task = impl + its tests. ✅ Task: "User model + user_test.go"
- **Testing skipped**: Tasks are impl-only. ✅ Task: "User model + DB migration"
- Never mix: ❌ Task 1-3 impl only, Task 4 add all tests

## EXECUTION:
**If parallel subagents enabled**: Group independent tasks (different files, no dependency) → parallel subagent({ tasks: [...] }). Dependent/conflicting tasks → chain or serial.
**If parallel disabled**: Execute all tasks yourself directly, one at a time.

## EVERY TASK (do in this exact order):
1. Announce "Starting Task N: [title]"
2. Read relevant files, write/edit code（+ tests if testing is enabled）
3. **If testing is enabled**: run tests. Fix failures before continuing.
4. **Write PLANS_DIR/tasks.md**: mark current task done, next → in_progress
5. **Write PLANS_DIR/todos.md**: check off \`[x]\` all items for this task. Do this BEFORE announcing task completion.
6. Announce "Task N done." then IMMEDIATELY start next task

## TASK FORMAT (tasks.md):
\`\`\`markdown
# Tasks
## Task 1: User model + user_test.go  (or: User model — if testing skipped)
- Status: in_progress
## Task 2: Auth middleware + middleware_test.go
- Status: pending
\`\`\`

## TODO FORMAT (todos.md):
\`\`\`markdown
# Todo
- [ ] Task 1: Create user model
- [ ] Task 1: Write user_test.go  ← omit this line if testing skipped
- [ ] Task 2: Implement auth middleware
- [ ] Task 2: Write middleware_test.go
\`\`\`

## COMPLETION:
After all tasks done and both files fully updated, show summary and add [STAGE_COMPLETE].`;

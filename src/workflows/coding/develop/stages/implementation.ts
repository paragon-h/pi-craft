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

export const prompt = `[IMPLEMENTATION PHASE — FULL ACCESS · PARALLEL WITH CONFLICT DETECTION]

You are in the implementation phase with full permissions.
The user has already approved — no per-change approval needed.

## SETUP:
1. Read all documents from PLANS_DIR
2. Generate Task breakdown → write tasks.md
3. Generate Todo list → write todos.md

## PARALLEL EXECUTION RULES (CRITICAL):
Before running tasks in parallel, you MUST analyze:
1. **File conflicts**: Do any tasks modify the SAME file? If yes → serial only
2. **Dependencies**: Does Task B import/use code created by Task A? If yes → serial only
3. **Independent**: No shared files AND no dependency → CAN run parallel

### Safe parallel example:
Task 1: Create src/models/user.go (new file)
Task 2: Create src/models/session.go (new file)
→ Different files, no dependency → PARALLEL ✓

### Must be serial example:
Task 1: Create src/middleware/auth.go
Task 2: Modify src/main.go to use auth middleware
→ Task 2 depends on Task 1 → SERIAL only ✗

### Conflict example:
Task 1: Modify src/handlers/auth.go (add login)
Task 2: Modify src/handlers/auth.go (add refresh)
→ Same file → SERIAL only ✗

## EXECUTION:
1. Group independent tasks → run with parallel subagents:
   subagent({
     tasks: [
       { agent: "implementer", task: "Implement Task 1: ..." },
       { agent: "implementer", task: "Implement Task 3: ..." },
     ]
   })

2. Dependent/conflicting tasks → run in chain or one at a time:
   subagent({
     chain: [
       { agent: "implementer", task: "Implement Task 2: ..." },
       { agent: "implementer", task: "Implement Task 4 (uses Task 2 output): ..." },
     ]
   })

3. After each batch, run parallel reviewers:
   subagent({
     tasks: [
       { agent: "reviewer", task: "Review changes for Task 1 & 3" },
     ]
   })

4. Apply suggestions, update tasks.md + todos.md

## TASK FORMAT:
\`\`\`markdown
# Tasks
## Task 1: [Title]
- Status: pending | in_progress | done
- Files: path/to/file.go
- Conflicts: none | Task N
- Depends: none | Task N
- Parallel: yes | no
\`\`\`

## COMPLETION:
After all tasks done, show summary and add [STAGE_COMPLETE].`;

# Pi-Native 改造方案 — 具体实施指南

## 总览

| 指标 | 当前 | 改造后 | 变化 |
|------|------|--------|------|
| TypeScript 源文件数 | 44 | 38 | -13.6% |
| 代码行数（粗略） | ~4500 | ~3700 | -800 行 |
| Workflow engine | 280 行类 | **删除** | -280 |
| 阶段模块 | 8 个 .ts 文件 | 6 个 .md skill | **声明式替换** |
| develop/review flow | 两个重复实现 | **删除** | -220 |
| coding/index.ts | ~450 行 | ~150 行 | -300 |
| `/coding:*` 命令 | 6 个 | 0 个 | pi 原生替代 |

---

## 文件变更清单

### 🔴 删除（13 个文件，~1000 行）

```
src/core/workflow-engine.ts                         # 状态机引擎 — 被 thin metadata 替代
src/scenarios/coding/develop/index.ts               # develop 编排器
src/scenarios/coding/develop/flow.ts                # develop 共享 helper
src/scenarios/coding/develop/stages/code-analysis.ts # 阶段 prompt
src/scenarios/coding/develop/stages/requirement.ts   # 阶段 prompt
src/scenarios/coding/develop/stages/design.ts        # 阶段 prompt
src/scenarios/coding/develop/stages/testing.ts       # 阶段 prompt
src/scenarios/coding/develop/stages/implementation.ts # 阶段 prompt + 实现逻辑
src/scenarios/coding/review/index.ts                 # review 编排器
src/scenarios/coding/review/flow.ts                  # review 共享 helper
src/scenarios/coding/review/stages/scope.ts          # 阶段 prompt
src/scenarios/coding/review/stages/analyze.ts        # 阶段 prompt
src/scenarios/coding/review/stages/report.ts         # 阶段 prompt
```

### 🟢 新建（6 个文件）

```
skills/coding-workflow/SKILL.md                      # 元 skill：流程总览
skills/coding-workflow/stage-code-analysis.md         # 阶段 1：代码分析
skills/coding-workflow/stage-requirement.md           # 阶段 2：需求澄清
skills/coding-workflow/stage-design.md                # 阶段 3：架构设计
skills/coding-workflow/stage-testing.md               # 阶段 4：测试策略
skills/coding-workflow/stage-implementation.md         # 阶段 5：代码实现
```

### 🟡 修改（3 个文件）

```
src/scenarios/coding/index.ts     # 重写：450 行 → 150 行
src/core/registry.ts              # 删除 engine 字段
src/index.ts                      # 删除 engine restore 逻辑
```

---

## 详细改造内容

### 改造 1：`src/scenarios/coding/index.ts` — 完全重写

**之前**：450 行，包含 6 个命令、输入模式、agent_end 检测、[STAGE_COMPLETE] 解析、tool_call 阶段限制、buildResumeContext、session_start 恢复。

**之后**：~150 行，仅包含 2 个 tool + compaction hook + session resume。

```typescript
/**
 * Pi Craft — Coding Workflow Scenario (Pi-Native)
 *
 * 提供 2 个 tool: init_workflow + complete_stage。
 * 阶段指令是 skills (.md 文件)，LLM 按需自主加载。
 * 流程控制权在 LLM — extension 只做 gating、labeling、persistence。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────

interface WorkflowMeta {
  type: "coding" | "review";
  topic: string;
  requirement: string;
  plansDir: string;
  stage: string;
  startedAt: number;
  stages: { stage: string; completedAt: number; outputFile: string }[];
}

const CUSTOM_TYPE = "craft-workflow";

// ─── Helpers ──────────────────────────────────────────────

function getMeta(ctx: ExtensionContext): WorkflowMeta | null {
  for (const e of ctx.sessionManager.getBranch()) {
    if (e.type === "custom" && e.customType === CUSTOM_TYPE) return e.data as WorkflowMeta;
  }
  return null;
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // ═══════════════════════════════════════════════════════════
  // Tool: init_workflow
  // ═══════════════════════════════════════════════════════════
  pi.registerTool({
    name: "init_workflow",
    label: "Init Workflow",
    description:
      "Initialize a coding workflow: create plans directory, set session name, record requirement. Call BEFORE loading any stage skills.",
    parameters: Type.Object({
      topic: Type.String({ description: "Short kebab-case topic slug, e.g. 'user-auth'" }),
      requirement: Type.String({ description: "One-line description of what to build" }),
      type: Type.Optional(Type.String({ description: "'coding' (default) or 'review'" })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const { topic, requirement, type = "coding" } = params as {
        topic: string; requirement: string; type?: string;
      };
      const date = formatDate();
      const plansDir = path.join(ctx.cwd, ".pi", "craft", "plans", `${date}-${topic}`);
      fs.mkdirSync(plansDir, { recursive: true });

      const meta: WorkflowMeta = {
        type: type as WorkflowMeta["type"],
        topic,
        requirement,
        plansDir,
        stage: type === "review" ? "scope" : "code-analysis",
        startedAt: Date.now(),
        stages: [],
      };

      pi.setSessionName(`craft: ${topic}`);
      pi.appendEntry(CUSTOM_TYPE, meta);
      ctx.ui.notify(`📁 ${plansDir}`, "info");

      const firstSkill = type === "review" ? "stage-scope" : "stage-code-analysis";
      return {
        content: [{
          type: "text",
          text: [
            `✅ Workflow initialized.`,
            `**Topic:** ${topic}`,
            `**Requirement:** ${requirement}`,
            `**Plans:** ${plansDir}/`,
            ``,
            `Load \`/skill:${firstSkill}\` to begin.`,
          ].join("\n"),
        }],
        details: { plansDir, topic },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════
  // Tool: complete_stage
  // ═══════════════════════════════════════════════════════════
  pi.registerTool({
    name: "complete_stage",
    label: "Complete Stage",
    description: [
      "Mark current workflow stage complete. Verifies output file, labels session tree,",
      "persists metadata, and auto-loads the next stage skill.",
    ].join(" "),
    parameters: Type.Object({
      next_stage: Type.String({
        description: "Next stage: requirement, design, testing, implementation, review, done (or scope, analyze, report, done for reviews)",
      }),
      output_file: Type.String({ description: "Relative path to the document produced this stage" }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const { next_stage, output_file } = params as {
        next_stage: string; output_file: string;
      };

      // ── Gate: verify output file ──────────────────────
      const fullPath = path.resolve(ctx.cwd, output_file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size < 80) {
          return {
            content: [{ type: "text", text: `⚠️ Gate failed — ${output_file} is only ${stat.size} bytes. Write meaningful content first.` }],
            details: { blocked: true, reason: "file_too_small" },
          };
        }
        const head = fs.readFileSync(fullPath, "utf-8").slice(0, 200);
        if (head.split("\n").filter(l => l.trim().length > 20).length < 2) {
          return {
            content: [{ type: "text", text: `⚠️ Gate failed — ${output_file} appears to be a stub. Write the full document.` }],
            details: { blocked: true, reason: "insufficient_content" },
          };
        }
      } catch (err: any) {
        if (err.code === "ENOENT") {
          return {
            content: [{ type: "text", text: `⚠️ Gate failed — ${output_file} not found. Use write tool first.` }],
            details: { blocked: true, reason: "file_not_found" },
          };
        }
        throw err;
      }

      // ── Update metadata ───────────────────────────────
      const currentMeta = getMeta(ctx);
      const currentStage = currentMeta?.stage ?? "code-analysis";
      const updatedMeta: WorkflowMeta = currentMeta
        ? {
            ...currentMeta,
            stage: next_stage,
            stages: [
              ...currentMeta.stages,
              { stage: currentStage, completedAt: Date.now(), outputFile: output_file },
            ],
          }
        : {
            type: "coding",
            topic: "unknown",
            requirement: "",
            plansDir: path.dirname(fullPath),
            stage: next_stage,
            startedAt: Date.now(),
            stages: [{ stage: "code-analysis", completedAt: Date.now(), outputFile: output_file }],
          };

      pi.appendEntry(CUSTOM_TYPE, updatedMeta);

      // ── Label session tree ────────────────────────────
      try {
        const leafId = ctx.sessionManager.getLeafId();
        if (leafId) {
          const label = next_stage === "done"
            ? "✅ workflow:done"
            : `📌 stage:${next_stage}`;
          pi.setLabel(leafId, label);
        }
      } catch { /* label may not be supported in all modes */ }

      // ── Notify ────────────────────────────────────────
      const notifyText = next_stage === "done"
        ? "🎉 Workflow complete!"
        : next_stage === "implementation"
          ? "⚠️ Entering implementation — full write access enabled."
          : `✅ Stage complete → ${next_stage}`;
      ctx.ui.notify(notifyText, next_stage === "done" ? "success" : "info");

      // ── Done ──────────────────────────────────────────
      if (next_stage === "done") {
        return {
          content: [{
            type: "text",
            text: [
              `🎉 **Workflow complete!**`,
              ``,
              `All stages finished. Produced:`,
              ...updatedMeta.stages.map(s => `- 📄 ${s.outputFile}`),
              ``,
              `Use \`/tree\` to review session history with stage labels.`,
            ].join("\n"),
          }],
          details: { next_stage: "done", stages: updatedMeta.stages },
        };
      }

      // ── Auto-load next skill ──────────────────────────
      // Steering message injected between tool turns — no user input needed
      setTimeout(() => {
        pi.sendUserMessage(
          [
            `Load \`/skill:stage-${next_stage}\` and continue the workflow.`,
            ``,
            `**Plans directory:** ${updatedMeta.plansDir}`,
            `**Requirement:** ${updatedMeta.requirement}`,
          ].join("\n"),
          { deliverAs: "steer" },
        );
      }, 0);

      return {
        content: [{
          type: "text",
          text: `✅ Stage complete. Loading **${next_stage}** phase...`,
        }],
        details: { next_stage, output_file },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════
  // Compaction Hook — preserve workflow context across compacts
  // ═══════════════════════════════════════════════════════════
  pi.on("session_before_compact", async (event, ctx) => {
    const meta = getMeta(ctx);
    if (!meta) return;

    const stageSummary = meta.stages.length > 0
      ? `Completed: ${meta.stages.map(s => s.stage).join(" → ")}`
      : "No stages completed yet";

    return {
      compaction: {
        summary: [
          `[Coding Workflow — ${meta.topic}]`,
          `Requirement: ${meta.requirement}`,
          `Current stage: ${meta.stage}`,
          `Plans: ${meta.plansDir}`,
          stageSummary,
          ``,
          `To continue: load /skill:stage-${meta.stage}`,
        ].join("\n"),
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });

  // ═══════════════════════════════════════════════════════════
  // Session Resume — auto-restore interrupted workflows
  // ═══════════════════════════════════════════════════════════
  pi.on("session_start", async (_event, ctx) => {
    const meta = getMeta(ctx);
    if (!meta?.stage || meta.stage === "done") return;

    setTimeout(() => {
      const completed = meta.stages.length > 0
        ? `\n**Completed:** ${meta.stages.map(s => s.stage).join(" → ")}`
        : "";

      pi.sendUserMessage(
        [
          `🔄 **Workflow restored**`,
          `**Topic:** ${meta.topic}  |  **Stage:** ${meta.stage}  |  **Type:** ${meta.type}`,
          `**Plans:** ${meta.plansDir}`,
          completed,
          ``,
          `Load \`/skill:stage-${meta.stage}\` to continue.`,
        ].filter(Boolean).join("\n"),
        { deliverAs: "steer" },
      );
    }, 50);
  });
}
```

---

### 改造 2：`src/core/registry.ts` — 删除 engine 字段

```diff
  export interface CraftState {
    tracker: TokenTracker;
    subagent: SubagentManager;
    statusline: StatuslineManager;
-   engine: WorkflowEngine | null;
    parallelEnabled: boolean;
    cwdGuardEnabled: boolean;
    subagentEnabled: boolean;
  }
```

同时删除 `import type { WorkflowEngine } from "./workflow-engine";`

---

### 改造 3：`src/index.ts` — 删除 engine restore

Session_start handler 中这段代码：

```diff
-    // Restore workflow engine from persistence (statusline only — scenarios
-    // handle their own event re-registration in their own session_start).
-    const { WorkflowEngine } = await import("./core/workflow-engine");
-    const engine = WorkflowEngine.restore(ctx);
-    const state = getState();
-    if (state) state.engine = engine;

     // Delayed statusline update for TUI readiness
     setTimeout(() => {
       try {
         _statusline.updateTokens(_tracker);
         _statusline.updateParallel(_parallel);
         _statusline.updateGuard(_guard);
-        if (_engine && _engine.isActive()) {
-          _statusline.updateWorkflow(_engine.getType(), _engine.getStage());
-        }
+        // Workflow status is managed by the coding scenario extension
       } catch { /* ctx may be stale after session replacement */ }
     }, 50);
```

以及 `initState` 调用中：

```diff
  initState({
    tracker,
    subagent,
    statusline,
-   engine: null,
    parallelEnabled,
    cwdGuardEnabled,
    subagentEnabled,
  });
```

---

### 新建 4：Skills 文件

#### `skills/coding-workflow/SKILL.md`

```markdown
# Coding Workflow

Structured multi-phase development using pi's native skills system.

## When to Use

Load this skill when the user asks to build a feature, implement a change,
or develop new functionality that requires planning.

## How It Works

Work through phases in order. Each phase has its own skill:

| # | Skill | What Happens | Output File |
|---|-------|-------------|-------------|
| 1 | `stage-code-analysis` | Scan codebase, map architecture | `code-analysis.md` |
| 2 | `stage-requirement` | Clarify requirements with user | `requirement.md` |
| 3 | `stage-design` | Design architecture and components | `design.md` |
| 4 | `stage-testing` | Choose testing approach and approval mode | `testing-plan.md` |
| 5 | `stage-implementation` | Write code with task tracking | `tasks.md` + `todos.md` |
| 6 | `stage-review` | Review implementation (optional) | `review.md` |

## Getting Started

Call `init_workflow` with a topic slug and requirement, then
load the first skill: `/skill:stage-code-analysis`

## After Each Stage

Call `complete_stage` — it verifies the output file and loads the next skill.

## Navigation

- `/tree` — see workflow stages as labeled entries (📌 markers)
- `/tree` + navigate to any label — rollback to that stage
- `/fork` at any label — create alternative implementation branch
```

#### `skills/coding-workflow/stage-code-analysis.md`

```markdown
# Stage: Code Analysis

**Phase 1/6** — Analyze codebase and architecture relevant to the requirement.
Read-only phase. No code modifications.

## Prerequisites

- The plans directory path from `init_workflow` output (e.g. `.pi/craft/plans/2026-06-01-user-auth/`)
- The requirement description

## Output

Write to `code-analysis.md` in the plans directory using the `write` tool.
Use the exact path shown in `init_workflow` output.

## Process

1. Scan project root: `package.json` (or `go.mod`, `Cargo.toml`), config files, build setup
2. Map directory structure. Identify architecture pattern (MVC, clean arch, monorepo, etc.)
3. Find all code relevant to the requirement — use `grep` and `read` extensively
4. Identify: entry points, database schemas, ORM models, API routes, shared utilities
5. Write comprehensive analysis with these sections:
   - **Tech Stack**: languages, frameworks, databases, key dependencies
   - **Directory Structure**: key directories and their purpose
   - **Relevant Modules**: files/modules most affected by this requirement
   - **Dependencies**: how these modules depend on each other
   - **Entry Points**: where changes would need to be made
   - **Constraints**: limitations, conventions, patterns to respect

## Parallel Scouts

If `enableParallelSubagent` is enabled, use parallel subagents:
- Scout 1: Root scan — package.json, build config, tech stack summary
- Scout 2: Architecture mapping — directory structure, pattern identification
- Scout 3: Code search — grep for requirement-related keywords, find relevant files
- Scout 4: Data layer — database schemas, ORM models, API routes

If parallel is disabled, execute all analysis yourself directly.

## Completion

Use the plans path from `init_workflow` output (always includes date + topic):
```
complete_stage({ next_stage: "requirement", output_file: ".pi/craft/plans/2026-06-01-user-auth/code-analysis.md" })
```
```

#### `skills/coding-workflow/stage-requirement.md`

```markdown
# Stage: Requirement Clarification

**Phase 2/6** — Clarify requirements through structured Q&A with the user.
Read-only phase. No code modifications.

## Prerequisites

Read `code-analysis.md` from the plans directory (path from `init_workflow`).

## Output

Write to `requirement.md` in the plans directory using the `write` tool.

## Process

1. Read the code analysis document to ground yourself in the project
2. Ask the user ONE question at a time. Wait for their answer before the next
   Focus on: scope boundaries, edge cases, error handling, integration points,
   performance requirements, backward compatibility
3. After Q&A ends (user signals with "done", "that's all", "proceed"):
   Write the clarified requirement document with:
   - **Original Requirement**: the user's initial description
   - **Clarified Requirement**: refined and expanded
   - **Q&A History**: all questions and answers
   - **Scope**: what's included and excluded
   - **Success Criteria**: how to know when it's done
4. Ask the user to confirm before completing

## Completion

Use the plans path from `init_workflow` output:
```
complete_stage({ next_stage: "design", output_file: ".pi/craft/plans/2026-06-01-user-auth/requirement.md" })
```
```

#### `skills/coding-workflow/stage-design.md`

```markdown
# Stage: Architecture Design

**Phase 3/6** — Create detailed architecture and component design.
Read-only phase. **Do NOT write any implementation code.**

## Prerequisites

Read the code analysis and requirement documents from the plans directory.

## Output

Write to `design.md` in the plans directory using the `write` tool.

## Process

1. Read all prerequisite documents
2. Call the `architect` subagent to generate a detailed design
3. Present the design to the user for feedback:
   - Architecture overview (use Mermaid diagrams in markdown)
   - Component/module breakdown with responsibilities
   - Data flow between components
   - API contracts, type signatures, interfaces
   - File change list (new files, modified files)
   - Migration strategy if applicable
4. Incorporate user feedback iteratively
5. Write final design document

## Anti-Pattern

Do NOT start implementing after the user says "ok" or "looks good".
You MUST call `complete_stage` to advance. Implementation is a separate phase.

## Completion

Use the plans path from `init_workflow` output:
```
complete_stage({ next_stage: "testing", output_file: ".pi/craft/plans/2026-06-01-user-auth/design.md" })
```
```

#### `skills/coding-workflow/stage-testing.md`

```markdown
# Stage: Testing Strategy

**Phase 4/6** — Define testing approach and implementation approval mode.
Read-only phase. No code modifications.

## Prerequisites

Read the design document from the plans directory.

## Output

Write to `testing-plan.md` in the plans directory using the `write` tool.

## Process

1. Read the design document
2. Ask the user to choose a testing approach:
   - `unit` — unit tests only
   - `e2e` — end-to-end tests only
   - `both` — unit + e2e
   - `skip` — no tests
3. Ask the user to choose an implementation approval mode:
   - `auto` — AI executes all tasks without stopping (fastest)
   - `per_task` — confirm before each task (safest)
   - `on_demand` — AI pauses when `[APPROVAL_NEEDED]` is used (balanced)
4. Write the testing plan with:
   - **Testing Approach**: chosen strategy
   - **Approval Mode**: chosen mode
   - **Test Scope**: which components/modules get tested
   - **Test Framework**: framework and setup instructions
   - **Key Test Scenarios**: critical paths to cover

## Completion

Use the plans path from `init_workflow` output:
```
complete_stage({ next_stage: "implementation", output_file: ".pi/craft/plans/2026-06-01-user-auth/testing-plan.md" })
```

> ⚠️ The workflow will ask for confirmation before entering implementation —
> this is the last checkpoint before code is written.
```

#### `skills/coding-workflow/stage-implementation.md`

```markdown
# Stage: Implementation

**Phase 5/6** — Write code, run tests, track progress.
This is the only phase with full write access to source files.

## Prerequisites

Read the design and testing plan documents from the plans directory.

## Output

Write to `tasks.md` and `todos.md` in the plans directory.
Update these files as tasks are completed.

## Process

1. Read all prerequisite documents
2. Generate task breakdown:
   - `[PLANS_DIR]/tasks.md` — numbered tasks with dependencies (`dependsOn`)
   - `[PLANS_DIR]/todos.md` — granular checkbox items
3. Execute tasks one at a time, marking them done as you go
4. Write tests alongside implementation — never defer testing
5. Use `subagent({ agent: "implementer", task: "..." })` for complex tasks
6. Use `subagent({ agent: "reviewer", task: "..." })` to self-review

## Approval Mode (from testing plan)

**`auto`** — Execute continuously. Only pause if stuck.
**`per_task`** — Pause after each task for user confirmation via `ctx.ui.confirm`.
**`on_demand`** — Continue freely. Output `[APPROVAL_NEEDED]` to pause for user input.

## Safety Rules

- Max 5 consecutive auto-continues before pausing to ask user
- If you detect you're stuck (errors, confusion, need more info), STOP and ask
- Update `tasks.md` and `todos.md` in real-time — don't batch updates

## Completion

When ALL tasks are done and ALL tests pass, use the plans path from `init_workflow`:
```
complete_stage({ next_stage: "done", output_file: ".pi/craft/plans/2026-06-01-user-auth/tasks.md" })
```

Optionally pass `next_stage: "review"` to add a review phase before completing.
```

---

### 改造 5：`package.json`

在 `pi` 字段中添加 skills 声明：

```diff
  "pi": {
    "extensions": [
      "./src/index.ts",
      "./src/capabilities/lsp/index.ts",
      "./src/capabilities/damage-control/index.ts",
      "./src/capabilities/workflow-suggester/index.ts",
      "./src/capabilities/subagent-widget/index.ts",
      "./src/capabilities/todo/index.ts",
      "./src/capabilities/tilldone/index.ts",
      "./src/scenarios/coding/index.ts"
    ],
+   "skills": [
+     "./skills/coding-workflow"
+   ],
    "video": "",
    "image": "",
    "config": { ... }
  }
```

---

## 改造后的项目结构

```
pi-craft/
├── package.json
├── skills/                                    # NEW: 声明式阶段指令
│   └── coding-workflow/
│       ├── SKILL.md
│       ├── stage-code-analysis.md
│       ├── stage-requirement.md
│       ├── stage-design.md
│       ├── stage-testing.md
│       └── stage-implementation.md
└── src/
    ├── index.ts                               # MODIFIED: 删除 engine restore
    ├── core/
    │   ├── config.ts                          # UNCHANGED
    │   ├── cwd-guard.ts                       # UNCHANGED
    │   ├── registry.ts                        # MODIFIED: 删除 engine 字段
    │   ├── subagent-manager.ts                # UNCHANGED
    │   ├── subagent-tool.ts                   # UNCHANGED
    │   └── token-tracker.ts                   # UNCHANGED
    ├── ui/
    │   ├── statusline.ts                      # UNCHANGED
    │   ├── token-dashboard.ts                 # UNCHANGED
    │   └── components/
    │       └── workflow-progress.ts           # UNCHANGED (optionally update)
    ├── capabilities/                          # ALL UNCHANGED
    │   ├── damage-control/
    │   ├── lsp/
    │   ├── subagent-widget/
    │   ├── tilldone/
    │   ├── todo/
    │   └── workflow-suggester/
    └── scenarios/
        └── coding/
            ├── index.ts                       # REWRITTEN: 450→150 lines
            ├── agents/                        # UNCHANGED (.md files)
            │   ├── architect.md
            │   ├── implementer.md
            │   ├── reviewer.md
            │   └── scout.md
            └── prompts/                       # UNCHANGED
                ├── full-workflow.md
                └── review.md
```

**不再存在的目录**：
```
src/core/workflow-engine.ts                   ❌ DELETED
src/scenarios/coding/develop/                 ❌ DELETED (index.ts, flow.ts, stages/*)
src/scenarios/coding/review/                  ❌ DELETED (index.ts, flow.ts, stages/*)
```

---

## 交互流程对比

### 之前（Engine 驱动）

```
用户输入 → codingInputMode 捕获 → LLM 生成 slug → engine.create() →
engine.transition("code_analysis") → registerScenarioHandlers() →
before_agent_start 注入 prompt → ... → agent_end 检测 [STAGE_COMPLETE] →
engine.transition(next) → AUTO_TRIGGER → 循环...
```

### 之后（Skills + Tools）

```
用户说"我要做 JWT 认证" → LLM 看到 SKILL.md → 调用 init_workflow() →
LLM 加载 /skill:stage-code-analysis → 执行分析 → 调用 complete_stage() →
gate 通过 → label 打上 → persist → steering 注入下阶段 skill → 循环...
```

---

## 执行步骤

```bash
# Step 1: 创建 skills 目录
mkdir -p skills/coding-workflow

# Step 2: 创建 6 个 skill 文件（见上文详细内容）

# Step 3: 删除不再需要的文件
rm src/core/workflow-engine.ts
rm -rf src/scenarios/coding/develop
rm -rf src/scenarios/coding/review

# Step 4: 重写 coding/index.ts（见上文完整代码）

# Step 5: 修改 registry.ts（删除 engine 字段和 import）

# Step 6: 修改 src/index.ts（删除 engine restore 逻辑）

# Step 7: 更新 package.json（添加 skills 字段）

# Step 8: 类型检查
npx tsc --noEmit

# Step 9: 测试
pi -e .
```

---

## 常见问题

**Q: `/coding:develop` 和 `/coding:review` 命令去哪了？**

不再需要。用户说自然语言，LLM 看到 `SKILL.md` 后自动调用 `init_workflow`。

**Q: 怎么 rollback？**

`Escape` 两次 → `/tree` → 看到 `📌 stage:design` 标签 → 选中 → 继续。Pi 的 tree navigation 原生支持，不需要自定义命令。

**Q: 怎么尝试多个实现方案？**

`/tree` → 导航到 `📌 stage:implementation` 标签 → `/fork` → 新 session 尝试方案 B。两个 session 对比。

**Q: 旧的 `[STAGE_COMPLETE]` 文本标记还能用吗？**

不能。被 `complete_stage` tool 替代。Tool call 是结构化的 — 有程序化 gate 验证，不会出现"LLM 说完成但文件是空的"的情况。

**Q: 要是 LLM 忘记调用 `complete_stage` 怎么办？**

Skill 文件中明确写着"你必须调用 complete_stage"。如果 LLM 还是忘了，用户说"用 complete_stage 推进"即可。这个比解析 `[STAGE_COMPLETE]` 文本标记可靠得多 — tool call 是 API，不是字符串匹配。

**Q: 已有的 workflow session 能继续用吗？**

不能。`WorkflowEngine` 类被删除后，旧的 session 数据格式无法恢复。建议：用旧 workflow 完成当前任务再进行改造，或者在新 session 中重新开始。`complete_stage` tool 写入的 `craft-workflow` custom entry 格式不同。

# Pi-Native Coding Workflow — 设计文档

## 1. 设计原则

### 来自 Pi 哲学

> *"Pi is aggressively extensible so it doesn't have to dictate your workflow. Adapt pi to your workflows, not the other way around."*

| 原则 | 含义 |
|------|------|
| **声明式 > 程序化** | 能用 skills (.md) 描述的，不写代码 |
| **LLM 有自主权** | 扩展提供能力，LLM 决定何时使用，不接管流程控制 |
| **树形会话是唯一真相源** | session tree 就是状态机，不另建线性引擎 |
| **最小扩展代码** | extension 只做 skills 做不到的事：持久化元数据、文件 gating、compaction hook |
| **透明可见** | 用户能通过 `/skill:` 预览任何阶段的指令，通过 `/tree` 看到工作流标记点 |

### 核心转变

```
当前:  Extension 驱动 → Engine 接管流程 → LLM 被动执行
改为:  Skill 引导 LLM → Extension 轻量支撑 → Pi 原生交互兜底
```

---

## 2. 架构概览

```
┌──────────────────────────────────────────────────────────┐
│                      Pi Session                          │
│                                                          │
│  ┌─────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ Skills  │──▶│  LLM 自主    │──▶│  Tool: complete  │  │
│  │ (.md)   │   │  加载 + 执行  │   │  _stage          │  │
│  └─────────┘   └──────┬───────┘   └────────┬─────────┘  │
│                       │                     │            │
│  ┌────────────┐       │  steering/inject    │ label      │
│  │ AGENTS.md  │──┐    ▼                     ▼            │
│  └────────────┘  │ ┌──────────────────────────────────┐  │
│                  ├─│  Session Tree (labeled entries)   │  │
│  ┌────────────┐  │ │  📌 stage:code-analysis           │  │
│  │ /tree      │──┘ │  📌 stage:requirement             │  │
│  └────────────┘     │  📌 stage:design                 │  │
│                     │  📌 stage:implementation          │  │
│  ┌────────────┐     └──────────────────────────────────┘  │
│  │ /fork      │──▶ 从任意 label 点分叉新 session         │
│  └────────────┘                                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Extension (~150 lines)                         │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────┐ │   │
│  │  │ stage_gate   │ │ compaction │ │ resume    │ │   │
│  │  │ (file check) │ │ hook       │ │ restore   │ │   │
│  │  └──────────────┘ └────────────┘ └───────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**数据流**：Skill 提供指令 → LLM 执行并调用 tool → Extension 做文件验证 + label + 持久化 → Session tree 记录阶段位置

**控制流**：不再存在。LLM 读取 skill 后自主推进。唯一的"控制"是 `workflow_stage_complete` tool 里的文件存在性验证。

---

## 3. 组件清单

| 组件 | 类型 | 职责 |
|------|------|------|
| `SKILL.md` | Skill | 工作流总览，描述各阶段及其 skill |
| `stage-code-analysis.md` | Skill | 代码分析阶段指令 |
| `stage-requirement.md` | Skill | 需求澄清阶段指令 |
| `stage-design.md` | Skill | 设计阶段指令 |
| `stage-testing.md` | Skill | 测试策略阶段指令 |
| `stage-implementation.md` | Skill | 实现阶段指令 |
| `craft-workflow.ts` | Extension | `workflow_stage_complete` tool、compaction hook、resume |
| `craft-io-guard.ts` | Extension | 只读阶段 tool 拦截（可选，独立扩展） |
| `craft-progress.ts` | Extension | Progress widget（可选，独立扩展） |

Extension 拆成三个独立可选的模块，用户按需启用。

---

## 4. 目录结构

```
.pi/
├── settings.json                          # 配置
├── skills/
│   └── coding-workflow/
│       ├── SKILL.md                       # 元 skill：流程总览
│       ├── stage-code-analysis.md         # 阶段 1/6：代码分析
│       ├── stage-requirement.md           # 阶段 2/6：需求澄清
│       ├── stage-design.md                # 阶段 3/6：架构设计
│       ├── stage-testing.md               # 阶段 4/6：测试策略
│       ├── stage-implementation.md        # 阶段 5/6：代码实现
│       └── stage-review.md                # 阶段 6/6：代码审查（可选轮次）
├── extensions/
│   ├── craft-workflow.ts                  # 核心扩展
│   ├── craft-io-guard.ts                  # 只读阶段工具拦截（可选）
│   └── craft-progress.ts                  # 进度 widget（可选）
└── craft/
    └── plans/
        └── 2026-06-01-user-auth/          # 自动创建
            ├── code-analysis.md
            ├── requirement.md
            ├── design.md
            ├── testing-plan.md
            ├── tasks.md
            └── todos.md
```

---

## 5. Skill 文件设计

### 5.1 元 Skill：`SKILL.md`

```markdown
# Coding Workflow

Structured multi-phase development workflow using pi's native skills system.

## When to Use

Load this skill when the user asks to build a feature, implement a change,
or develop new functionality that requires planning.

## How It Works

Each phase has a dedicated skill. Work through them in order:

| # | Skill | What Happens | Output File |
|---|-------|-------------|-------------|
| 1 | `stage-code-analysis` | Scan codebase, map architecture | `code-analysis.md` |
| 2 | `stage-requirement` | Clarify requirements with user | `requirement.md` |
| 3 | `stage-design` | Design architecture and components | `design.md` |
| 4 | `stage-testing` | Choose testing strategy | `testing-plan.md` |
| 5 | `stage-implementation` | Write code with task tracking | `tasks.md` + `todos.md` |
| 6 | `stage-review` | Review implementation (optional) | `review.md` |

## Getting Started

1. Call `init_workflow` tool with a short topic slug and requirement description
2. It creates the plans directory and records workflow metadata
3. Then load `/skill:stage-code-analysis` to begin

## After Each Stage

Call `complete_stage` tool — it verifies the output file exists
and auto-loads the next stage skill.

## Navigation

- Use `/tree` to see workflow stage labels (📌 markers)
- Use `/fork` at any stage to create alternative implementation branches
- Use `/tree` + navigate to any stage label to rollback and continue from there
```

---

### 5.2 阶段 Skill 模板

每个阶段 skill 遵循统一结构：

```markdown
# Stage: [NAME]

**Phase [N]/6** — [ONE_LINE_DESCRIPTION]

## Mode

Read-only — No code file modifications allowed.
Write only to the output document.

## Prerequisites

Read from the plans directory:
- [list prerequisite documents]

## Output

Write to `[PLANS_DIR]/[output-file].md`

## Process

[numbered steps]

## Subagents (if enabled)

[parallel subagent instructions, fallback for single mode]

## Completion

When done writing the output file:
- Call `complete_stage` tool with `next_stage: "[next]"` and the output file path
- The tool verifies the file exists before advancing

## Anti-Patterns

- Do NOT start writing code in code-analysis/requirement/design/testing stages
- Do NOT skip asking the user for feedback where specified
- Do NOT proceed to next stage without calling `complete_stage`
```

---

### 5.3 具体 Skill 内容

#### `stage-code-analysis.md`

```markdown
# Stage: Code Analysis

**Phase 1/6** — Analyze the project structure and codebase relevant to the requirement

## Mode
Read-only. No file modifications. Output: `[PLANS_DIR]/code-analysis.md`

## Prerequisites
- The user's requirement (from `init_workflow` or conversation context)

## Process
1. Scan project root: `package.json`, config files, build setup. Summarize the tech stack.
2. Map directory structure. Identify the architecture pattern (MVC, clean arch, monorepo, etc.).
3. Find all code relevant to the requirement — use `grep` and `read` extensively.
4. Identify: entry points, database schemas, ORM models, API routes, shared utilities.
5. Write a comprehensive analysis to `[PLANS_DIR]/code-analysis.md`:
   - **Tech Stack**: languages, frameworks, databases, key dependencies
   - **Directory Structure**: key directories and their purpose
   - **Relevant Modules**: files/modules most affected by this requirement
   - **Dependencies**: how these modules depend on each other
   - **Entry Points**: where the user's requirement would need changes
   - **Constraints**: any limitations, conventions, or patterns to respect

## Parallel Scouts
If `enableParallelSubagent` is enabled, use parallel subagents:
- Scout 1: Root scan — package.json, build config, tech stack summary
- Scout 2: Architecture mapping — directory structure, pattern identification
- Scout 3: Code search — grep for requirement-related keywords, find relevant files
- Scout 4: Data layer — database schemas, ORM models, API routes

If parallel is disabled, execute all analysis yourself directly with `grep`, `find`, `read`.

## Completion
Call `complete_stage`:
```
next_stage: "requirement"
output_file: "[PLANS_DIR]/code-analysis.md"
```
```

#### `stage-requirement.md`

```markdown
# Stage: Requirement Clarification

**Phase 2/6** — Clarify requirements with the user through structured Q&A

## Mode
Read-only. No file modifications. Output: `[PLANS_DIR]/requirement.md`

## Prerequisites
Read `[PLANS_DIR]/code-analysis.md` to understand the project context.

## Process
1. Read the code analysis document to ground yourself in the project.
2. Ask the user ONE question at a time. Wait for their answer before asking the next.
   Focus on:
   - Scope boundaries (what's in, what's out)
   - Edge cases and error handling expectations
   - Integration points with existing systems
   - Performance requirements
   - Backward compatibility constraints
3. After Q&A ends (user signals with "done", "that's all", "let's proceed"):
   - Write the clarified requirement to `[PLANS_DIR]/requirement.md`:
     - **Original Requirement**: the user's initial description
     - **Clarified Requirement**: refined and expanded
     - **Q&A History**: all questions and answers
     - **Scope**: what's included and excluded
     - **Success Criteria**: how to know when it's done
4. Ask user to confirm the requirement document is accurate before completing.

## Completion
Call `complete_stage`:
```
next_stage: "design"
output_file: "[PLANS_DIR]/requirement.md"
```
```

#### `stage-design.md`

```markdown
# Stage: Architecture Design

**Phase 3/6** — Create detailed architecture and component design

## Mode
Read-only. Do NOT write any implementation code.
Output: `[PLANS_DIR]/design.md`

## Prerequisites
Read `[PLANS_DIR]/code-analysis.md` and `[PLANS_DIR]/requirement.md`.

## Process
1. Read prerequisite documents.
2. Use the `architect` subagent (via `subagent` tool) to generate the design.
3. Present the design to the user for feedback:
   - Architecture overview (diagrams in text/Mermaid)
   - Component/module breakdown with responsibilities
   - Data flow between components
   - API contracts, type signatures, interfaces
   - File change list (new files, modified files)
   - Migration strategy if applicable
4. Incorporate user feedback iteratively.
5. Write the final design to `[PLANS_DIR]/design.md`.

## Completion
When the user approves the design:
Call `complete_stage`:
```
next_stage: "testing"
output_file: "[PLANS_DIR]/design.md"
```

## Anti-Pattern
Do NOT start implementing after user says "ok" or "looks good".
You MUST call `complete_stage` to advance. Implementation is a separate phase.
```

#### `stage-testing.md`

```markdown
# Stage: Testing Strategy

**Phase 4/6** — Define testing approach before implementation

## Mode
Read-only. No file modifications. Output: `[PLANS_DIR]/testing-plan.md`

## Prerequisites
Read `[PLANS_DIR]/design.md`.

## Process
1. Read the design document.
2. Ask the user to choose a testing approach:
   - `unit` — unit tests only
   - `e2e` — end-to-end tests only
   - `both` — unit + e2e
   - `skip` — no tests
3. Ask the user to choose an approval mode for implementation:
   - `auto` — AI executes all tasks without stopping (fastest, least oversight)
   - `per_task` — confirm before each task (safest, most oversight)
   - `on_demand` — AI pauses when `[APPROVAL_NEEDED]` is used (balanced)
4. Write the plan to `[PLANS_DIR]/testing-plan.md`:
   - **Testing Approach**: chosen strategy
   - **Approval Mode**: chosen mode
   - **Test Scope**: which components/modules get tested
   - **Test Framework**: framework and setup instructions
   - **Key Test Scenarios**: critical paths to cover

## Completion
Call `complete_stage`:
```
next_stage: "implementation"
output_file: "[PLANS_DIR]/testing-plan.md"
```

After completion, the workflow engine will ask for confirmation before entering
implementation phase (this is the last checkpoint before code is written).
```

#### `stage-implementation.md`

```markdown
# Stage: Implementation

**Phase 5/6** — Write code, run tests, track progress

## Mode
Full write access. This is the only phase where you write/edit source code.

## Prerequisites
Read `[PLANS_DIR]/design.md` and `[PLANS_DIR]/testing-plan.md`.

## Process
1. Read all prerequisite documents.
2. Generate a task breakdown and write to:
   - `[PLANS_DIR]/tasks.md` — numbered tasks with dependencies
   - `[PLANS_DIR]/todos.md` — granular checklist items
3. Execute tasks one at a time, marking them done as you go.
4. Write tests alongside implementation — never defer testing to a separate step.
5. Use `complete_stage` only when ALL tasks are done.

## Approval Mode (from testing plan)

**`auto`** — Execute continuously. Only stop if you're stuck.
**`per_task`** — Pause after each task for user confirmation.
**`on_demand`** — Continue freely. Use `[APPROVAL_NEEDED]` in your output to pause for user input mid-task.

## Subagents
Use the `implementer` subagent for complex tasks. Use `reviewer` to self-review before completing.

## Anti-Patterns
- Do NOT skip task tracking — update `tasks.md` and `todos.md` as you work
- Do NOT write tests after all implementation — test as you go
- Do NOT call `complete_stage` if tasks remain

## Completion
When ALL tasks are done and ALL tests pass:
Call `complete_stage`:
```
next_stage: "review"
output_file: "[PLANS_DIR]/tasks.md"
```
```

#### `stage-review.md`

```markdown
# Stage: Review

**Phase 6/6** — Review the implementation (optional)

## Mode
Read-only analysis. Output: `[PLANS_DIR]/review.md`

## Prerequisites
Read `[PLANS_DIR]/design.md` and `[PLANS_DIR]/tasks.md`.

## Process
1. Review all changed files against the design document.
2. Check for:
   - Design compliance — does the implementation match the design?
   - Code quality — clean, readable, well-structured?
   - Error handling — edge cases covered?
   - Test coverage — tests actually test the right things?
   - Security — any obvious vulnerabilities?
3. Write review to `[PLANS_DIR]/review.md`.
4. For critical issues, offer to fix them (user can choose to loop back to implementation).

## Completion
Call `complete_stage`:
```
next_stage: "done"
output_file: "[PLANS_DIR]/review.md"
```

After this, the workflow is complete.
```

---

## 6. Extension 设计

### 6.1 核心扩展：`craft-workflow.ts`

这是唯一必需的扩展，~150 行：

```typescript
/**
 * craft-workflow — Pi-Native Coding Workflow Extension
 *
 * 提供 2 个 tool + compaction hook + session resume。
 * 不接管流程控制。LLM 通过 skills 自主推进。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────
interface WorkflowMeta {
  type: "coding" | "review";
  topic: string;
  requirement: string;
  plansDir: string;
  stage?: string;
  startedAt: number;
  stages: { stage: string; completedAt: number; outputFile: string }[];
}

// ─── Helpers ──────────────────────────────────────────────

function getWorkflowMeta(ctx: any): WorkflowMeta | null {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === "craft-workflow") {
      return entry.data as WorkflowMeta;
    }
  }
  return null;
}

const STAGE_PROGRESSION: Record<string, string> = {
  "code-analysis": "requirement",
  "requirement": "design",
  "design": "testing",
  "testing": "implementation",
  "implementation": "review",
  "review": "done",
};

export default function (pi: ExtensionAPI) {

  // ── Tool: init_workflow ──────────────────────────────
  pi.registerTool({
    name: "init_workflow",
    label: "Init Workflow",
    description: [
      "Initialize a coding workflow: create plans directory, set session name,",
      "record requirement. Call this BEFORE loading any stage skills.",
    ].join(" "),
    parameters: Type.Object({
      topic: Type.String({ description: "Short kebab-case topic slug, e.g. 'user-auth'" }),
      requirement: Type.String({ description: "One-line description of what to build" }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const { topic, requirement } = params as { topic: string; requirement: string };
      const date = new Date().toISOString().slice(0, 10);
      const plansDir = path.join(ctx.cwd, ".pi", "craft", "plans", `${date}-${topic}`);

      fs.mkdirSync(plansDir, { recursive: true });

      const meta: WorkflowMeta = {
        type: "coding",
        topic,
        requirement,
        plansDir,
        startedAt: Date.now(),
        stages: [],
      };

      pi.setSessionName(`craft: ${topic}`);
      pi.appendEntry("craft-workflow", meta);

      ctx.ui.notify(`📁 ${plansDir}`, "info");

      return {
        content: [{
          type: "text",
          text: [
            `✅ Workflow initialized.`,
            ``,
            `**Topic:** ${topic}`,
            `**Requirement:** ${requirement}`,
            `**Plans:** ${plansDir}/`,
            ``,
            `Load \`/skill:stage-code-analysis\` to begin, or I'll load it automatically.`,
          ].join("\n"),
        }],
        details: { plansDir, topic },
      };
    },
  });

  // ── Tool: complete_stage ─────────────────────────────
  pi.registerTool({
    name: "complete_stage",
    label: "Complete Stage",
    description: [
      "Mark current workflow stage as complete. Verifies the output file exists",
      "and has sufficient content before advancing. Labels the session tree position.",
      "Automatically loads the next stage skill.",
    ].join(" "),
    parameters: Type.Object({
      next_stage: Type.String({
        description: "Next stage key: requirement, design, testing, implementation, review, done",
      }),
      output_file: Type.String({
        description: "Relative path to the document produced in this stage",
      }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const { next_stage, output_file } = params as { next_stage: string; output_file: string };

      // ── Gate: verify output file exists and has content ──
      const fullPath = path.resolve(ctx.cwd, output_file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size < 50) {
          return {
            content: [{
              type: "text",
              text: `⚠️ **Gate failed** — \`${output_file}\` is only ${stat.size} bytes. Write meaningful content before completing this stage.`,
            }],
            details: { blocked: true, reason: "file_too_small" },
          };
        }
        const preview = fs.readFileSync(fullPath, "utf-8").slice(0, 100);
        // Check the file actually has substantive content (not just header)
        if (preview.split("\n").filter(l => l.trim().length > 20).length < 2) {
          return {
            content: [{
              type: "text",
              text: `⚠️ **Gate failed** — \`${output_file}\` appears to be a stub. Write the full document before completing.`,
            }],
            details: { blocked: true, reason: "insufficient_content" },
          };
        }
      } catch (err: any) {
        if (err.code === "ENOENT") {
          return {
            content: [{
              type: "text",
              text: `⚠️ **Gate failed** — \`${output_file}\` does not exist. Write the document using the \`write\` tool first.`,
            }],
            details: { blocked: true, reason: "file_not_found" },
          };
        }
        throw err;
      }

      // ── Update metadata ──
      const meta = getWorkflowMeta(ctx);
      const currentStage = meta?.stages[meta.stages.length - 1]?.stage ?? "code-analysis";
      const updatedMeta: WorkflowMeta = meta
        ? {
            ...meta,
            stage: next_stage,
            stages: [...meta.stages, { stage: currentStage, completedAt: Date.now(), outputFile: output_file }],
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

      pi.appendEntry("craft-workflow", updatedMeta);

      // ── Label session tree ──
      const leafId = ctx.sessionManager.getLeafId();
      if (leafId) {
        const transitionLabel = next_stage === "done"
          ? `✅ workflow:done`
          : `📌 stage:${next_stage}`;
        try { pi.setLabel(leafId, transitionLabel); } catch { /* label may not be supported in all modes */ }
      }

      // ── Notification ──
      let notifyText = "";
      if (next_stage === "done") {
        notifyText = "🎉 Workflow complete!";
      } else if (next_stage === "implementation") {
        notifyText = `⚠️ Entering implementation — full write access enabled.\n📌 stage:${next_stage} labeled in /tree`;
      } else {
        notifyText = `✅ Stage complete → ${next_stage}\n📌 stage:${next_stage} labeled in /tree`;
      }
      ctx.ui.notify(notifyText, next_stage === "done" ? "success" : "info");

      // ── Auto-load next stage skill ──
      if (next_stage === "done") {
        return {
          content: [{
            type: "text",
            text: [
              `🎉 **Workflow complete!**`,
              ``,
              `All stages finished. Here's a summary of what was produced:`,
              ...updatedMeta.stages.map(s => `- 📄 ${s.outputFile}`),
              ``,
              `Use \`/tree\` to review the session history with labeled stage markers.`,
            ].join("\n"),
          }],
          details: { next_stage: "done", stages: updatedMeta.stages },
        };
      }

      // Send steering message to load next skill
      setTimeout(() => {
        pi.sendUserMessage(
          [
            `Load \`/skill:stage-${next_stage}\` and continue the workflow.`,
            ``,
            `**Current plans directory:** ${updatedMeta.plansDir}`,
            `**Requirement:** ${updatedMeta.requirement}`,
          ].join("\n"),
          { deliverAs: "steer" },
        );
      }, 0);

      return {
        content: [{
          type: "text",
          text: [
            `✅ Stage complete.`,
            `→ Loading **${next_stage}** phase...`,
          ].join("\n"),
        }],
        details: { next_stage, output_file },
      };
    },
  });

  // ── Compaction Hook ──────────────────────────────────
  pi.on("session_before_compact", async (event, ctx) => {
    const meta = getWorkflowMeta(ctx);
    if (!meta) return;

    const stageSummary = meta.stages
      .map(s => `- ✅ ${s.stage}: ${s.outputFile} (${new Date(s.completedAt).toISOString()})`)
      .join("\n");

    return {
      compaction: {
        summary: [
          `[Coding Workflow — ${meta.topic}]`,
          `Requirement: ${meta.requirement}`,
          `Plans directory: ${meta.plansDir}`,
          `Current stage: ${meta.stage ?? "not started"}`,
          ``,
          `Completed stages:`,
          stageSummary || "(none yet)",
          ``,
          `To continue: load /skill:stage-${meta.stage ?? "code-analysis"}`,
        ].join("\n"),
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });

  // ── Session Resume ───────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const meta = getWorkflowMeta(ctx);
    if (!meta?.stage || meta.stage === "done") return;

    const stageCount = meta.stages.length;
    const lastStage = meta.stages[meta.stages.length - 1];

    setTimeout(() => {
      pi.sendUserMessage(
        [
          `🔄 **Workflow restored**`,
          ``,
          `**Topic:** ${meta.topic}`,
          `**Requirement:** ${meta.requirement}`,
          `**Current stage:** ${meta.stage} (phase ${stageCount + 1}/6)`,
          `**Plans directory:** ${meta.plansDir}`,
          ``,
          meta.stages.length > 0
            ? `**Completed stages:**\n${meta.stages.map(s => `- ${s.stage}: ${s.outputFile}`).join("\n")}`
            : `No stages completed yet.`,
          ``,
          `Load \`/skill:stage-${meta.stage}\` to continue, or I'll load it automatically.`,
        ].join("\n"),
        { deliverAs: "steer" },
      );
    }, 50);
  });
}
```

### 6.2 可选扩展：`craft-io-guard.ts`

只读阶段工具拦截，独立加载：

```typescript
/**
 * craft-io-guard — Read-Only Stage Guard
 *
 * Intercepts write/edit/bash in analysis/requirement/design/testing/review stages.
 * Allows writes only to .pi/craft/plans/ directory.
 * Optional extension — only load if you want this enforcement.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Stages where code modification is prohibited
const READ_ONLY_STAGES = [
  "code-analysis", "requirement", "design", "testing", "review", "scope", "analyze", "report",
];

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!READ_ONLY_STAGES.some(s => ctx.sessionManager.getSessionFile()?.includes(s))) {
      // Read stage from session metadata instead of filename
    }

    // Check write operations
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = ((event.input as any).path || (event.input as any).file_path || "") as string;
      if (!filePath.includes(".pi/craft/plans/")) {
        return {
          block: true,
          reason: "当前为只读阶段。仅允许写入 .pi/craft/plans/ 目录下的计划文档。请先完成当前阶段并调用 complete_stage。",
        };
      }
    }

    // Check bash write redirections
    if (event.toolName === "bash") {
      const command = (event.input as any).command as string || "";
      const writeOps = [">", " >>", "tee ", "dd "];
      const writesToPlans = command.includes(".pi/craft/plans/");
      const hasWriteOp = writeOps.some(op => command.includes(op));
      if (hasWriteOp && !writesToPlans) {
        return {
          block: true,
          reason: "当前只读阶段不允许写入代码文件。仅允许写入 .pi/craft/plans/ 目录。",
        };
      }
    }
  });
}
```

### 6.3 可选扩展：`craft-progress.ts`

进度条 widget：

```typescript
/**
 * craft-progress — Workflow Progress Widget
 *
 * Shows a progress bar in the terminal UI for the current coding workflow.
 * Optional — only load if you want the visual indicator.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STAGES = [
  { key: "code-analysis", icon: "🔍", label: "Analyze" },
  { key: "requirement", icon: "📋", label: "Req" },
  { key: "design", icon: "🎨", label: "Design" },
  { key: "testing", icon: "🧪", label: "Test" },
  { key: "implementation", icon: "⚡", label: "Code" },
  { key: "review", icon: "🔎", label: "Review" },
  { key: "done", icon: "✅", label: "Done" },
];

export default function (pi: ExtensionAPI) {
  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Read current stage from metadata
    let currentStage = "";
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === "craft-workflow") {
        currentStage = (entry.data as any)?.stage ?? "";
      }
    }
    if (!currentStage) {
      ctx.ui.setWidget("craft-progress", undefined);
      return;
    }

    const currentIdx = STAGES.findIndex(s => s.key === currentStage);
    if (currentIdx < 0) return;

    const segments: string[] = [];
    for (let i = 0; i < STAGES.length; i++) {
      const s = STAGES[i];
      const segment = ` ${s.icon}${s.label} `;
      if (i < currentIdx) {
        segments.push(segment);
      } else if (i === currentIdx) {
        segments.push(`[${segment.trim()}]`);
      } else {
        segments.push(segment);
      }
      if (i < STAGES.length - 1) {
        segments.push("──");
      }
    }

    ctx.ui.setWidget("craft-progress", [segments.join("")]);
  });
}
```

---

## 7. 交互流程

### 7.1 新工作流启动

```
用户: Implement JWT-based user authentication with refresh tokens

LLM: [看到 SKILL.md 在 context 中]
     I'll use the coding workflow for this. Let me initialize it.
     
     [调用 init_workflow({ topic: "user-auth", requirement: "JWT authentication with refresh tokens" })]

     结果: ✅ Workflow initialized. Plans: .pi/craft/plans/2026-06-01-user-auth/
     
     Loading /skill:stage-code-analysis...
     
     [开始扫描项目，调用 grep/read/find]
     [写 code-analysis.md]
     
     [调用 complete_stage({ 
       next_stage: "requirement", 
       output_file: ".pi/craft/plans/2026-06-01-user-auth/code-analysis.md" 
     })]

     结果: ✅ Stage complete. → Loading requirement phase...
     通知: 📌 stage:requirement labeled in /tree

LLM: [自动收到 steering message，加载 /skill:stage-requirement]
     Now let me clarify the requirements. First question:
     
     Q: Should JWT tokens be stored in httpOnly cookies or localStorage?

用户: cookies

LLM: Q: Do you need role-based access control or just authentication?

用户: Just auth for now, RBAC later

LLM: Q: What should the access token lifetime be?

用户: 15 minutes

LLM: [写 requirement.md]
     Does this requirement document look correct?
     
     用户: yes
     
     [调用 complete_stage({ next_stage: "design", output_file: "..." })]

...continue through all stages...
```

### 7.2 Rollback 流程（使用 /tree）

```
用户: [在 implementation 阶段发现问题]
     The design approach isn't working. I need to go back to design.

步骤:
1. 用户按 Escape 两次 → 打开 /tree
2. 在 tree 中看到:
     ├── ...earlier messages
     ├── 📌 stage:code-analysis  ← pi.setLabel 标记
     ├── ...analysis messages
     ├── 📌 stage:requirement
     ├── ...requirement messages
     ├── 📌 stage:design         ← 用户选中这个
     ├── ...design messages
     └── 📌 stage:implementation
         └── ...implementation messages (current)
3. 选中 📌 stage:design → 导航回去
4. LLM 从 design 阶段末尾继续
5. 系统自动加载 /skill:stage-design（从 workflow meta 得知当前阶段）

[Pi 的 tree navigation 自动创建了新分支，旧 implementation 路径保留为另一分支]
```

### 7.3 分支对比

```
用户: Let me try two different implementation approaches for the auth module.

步骤:
1. /tree → 导航到 📌 stage:implementation 标签点
2. /fork → 创建新 session
3. 新 session: 尝试方案 A（Redis sessions）
4. 原 session: 尝试方案 B（stateless JWT）
5. 对比两个 session，选择更好的方案
```

### 7.4 Resume 中断的工作流

```
用户: [第二天打开 pi]
      pi -c  # continue last session

LLM: [session_start 事件触发，扩展检测到 craft-workflow metadata]
     
     🔄 Workflow restored
     Topic: user-auth
     Current stage: implementation
     Completed: code-analysis, requirement, design, testing
     Plans: .pi/craft/plans/2026-06-01-user-auth/
     
     Loading /skill:stage-implementation...
     
     [读取 tasks.md 和 todos.md，继续未完成的任务]
```

---

## 8. 配置

### `settings.json`

```json
{
  "craft": {
    "extensions": [
      "./.pi/extensions/craft-workflow.ts"
    ],
    "optionalExtensions": [
      "./.pi/extensions/craft-io-guard.ts",
      "./.pi/extensions/craft-progress.ts"
    ],
    "enableParallelSubagent": false
  }
}
```

三个扩展独立可选：
- `craft-workflow.ts` — 必需，提供 tool + persistence + resume
- `craft-io-guard.ts` — 可选，只读阶段强制拦截
- `craft-progress.ts` — 可选，UI 进度条

用户可以根据需要选择性加载。例如，如果信任 LLM 在只读阶段不会写代码，可以不加载 `craft-io-guard`。

---

## 9. 与当前设计的对比

| 维度 | 当前 (~2000行) | Pi-Native (~250行 + 7个.md) |
|------|----------------|----------------------------|
| **状态管理** | `WorkflowEngine` 类 (250行) | `appendEntry` + session tree labels |
| **类型定义** | `WorkflowState`, `WorkflowContext`, `StageRecord` 等 (80行) | `WorkflowMeta` 接口 (15行) |
| **阶段指令** | 5 个 `.ts` 文件，export `prompt` 字符串 | 6 个 `.md` 文件，`/skill:` 可预览 |
| **流程控制** | `before_agent_start` 程序化注入 + `agent_end` `[STAGE_COMPLETE]` 检测 | LLM 自主决定何时 `complete_stage` |
| **推进方式** | `AUTO_TRIGGER` 硬编码 steering 消息 | `complete_stage` tool 发送 steering |
| **Rollback** | `WorkflowEngine.rollback()` 操作 `stageHistory` 数组 | `/tree` 导航到 labeled entry |
| **分支** | ❌ 不支持 | `/fork` 从任意阶段分叉 |
| **Resume** | `buildResumeContext` 手动构建 + `registerScenarioHandlers` | `session_start` 发送 steering + LLM 读 skills |
| **Compaction** | 无集成 | `session_before_compact` hook |
| **命令** | 6 个 `/coding:*` 命令 | 0 个（`/tree` `/fork` 是 pi 内置） |
| **可见性** | 阶段 prompt 对用户不可见 | `/skill:stage-design` 完全透明 |
| **扩展性** | 加阶段要改 10+ 个文件 | 加一个 `.md` skill 文件 |
| **测试** | TypeScript 代码需要测试 | Skill 是 markdown，只需人工 review |

---

## 10. 迁移路径

从当前设计迁移到 Pi-Native 设计，可渐进进行：

### Phase 1：保留引擎，增加 Skills（非破坏性）

在现有代码基础上，把每个 stage 的 `prompt` 字符串同时注册为 skill 文件。LLM 可以通过 `/skill:` 看到阶段指令，但引擎的注入机制依然工作。这一步不破坏任何现有功能。

### Phase 2：实现 `complete_stage` tool

新增 `complete_stage` tool，但先不替换 `[STAGE_COMPLETE]` 检测。两个机制并行运行一段时间，观察 LLM 更倾向于使用哪种方式。

### Phase 3：添加 session labels

在 `complete_stage` tool 中调用 `pi.setLabel()`，让阶段标记在 `/tree` 中可见。同时添加 compaction hook。

### Phase 4：移除引擎

逐步将 `WorkflowEngine.transition()`、`buildResumeContext`、`registerScenarioHandlers()` 的功能迁移到 extension 中，最后移除 `WorkflowEngine` 类。

### Phase 5：移除命令

`/coding:develop`, `/coding:status`, `/coding:rollback`, `/coding:abort` 不再需要 — 用户通过自然语言 + `/tree` + `/fork` 完成同样的操作。

---

## 11. 总结

这个设计将 coding workflow 从 **2000 行 TypeScript 的状态机引擎** 变为 **7 个 markdown skill + 150 行轻量 extension**。核心思路：

1. **Skill 是 prompt 的自然载体** — 声明式、可见、LLM 自主加载
2. **Session tree 就是状态机** — labels 标记阶段，`/tree` 是 rollback，`/fork` 是分支
3. **Extension 只做 skills 做不到的事** — 文件验证 gating、session labeling、compaction hook、resume
4. **LLM 有流程自主权** — 读取 skill → 执行 → 调用 `complete_stage` → 自动推进
5. **Pi 原生交互兜底** — 不发明新命令，用 `/tree` `/fork` 和自然语言

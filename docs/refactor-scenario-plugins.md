# Refactoring Plan: Scenario Plugin Architecture

> Branch: `refactor/scenario-plugins` | Date: 2026-05-21

## 1. Motivation

Currently `pi-craft` is a single monolithic extension entry point (`src/index.ts`). All scenarios (coding, travel, stock, knowledge) are statically loaded from one file. Users cannot selectively enable/disable scenarios per machine.

**Goal:** Allow users to independently install and activate different workflow scenarios. For example:

- **Work computer**: Common components (statusline, tokens, cwd guard) + Coding scenario
- **Life computer**: Common components + Travel scenario + Stock scenario

## 2. Approach: Multi-Extension + Package Filtering

pi supports declaring **multiple extension entry points** in one package via `pi.extensions` array. Each entry is loaded as an independent extension. Users filter which extensions to load via `settings.json` package filtering.

```
One pi-craft package → Multiple extension entry points → User selects via settings
```

### Advantages

| Aspect | Benefit |
|--------|---------|
| **Zero overhead** | Unloaded scenario code is never compiled/executed by jiti |
| **Hot-swappable** | Edit settings.json, `/reload` — no reinstall needed |
| **Backward compatible** | Without filtering, all scenarios load (same as today) |
| **Extensible** | New scenario = one new `index.ts` + `package.json` entry |
| **Single codebase** | Core and scenarios share the same module root, imports just work |

## 3. Target Architecture

```
pi-craft/
├── src/
│   ├── index.ts                        # 🔧 Core Extension（永远加载）
│   │
│   ├── core/                           # 纯逻辑（无 UI 依赖）
│   │   ├── registry.ts                 # 🆕 跨 extension 共享状态单例
│   │   ├── workflow-engine.ts          # 通用状态机
│   │   ├── token-tracker.ts           # Token 统计
│   │   ├── subagent-manager.ts        # 子代理管理
│   │   ├── subagent-tool.ts           # 子代理工具注册 + TUI
│   │   └── cwd-guard.ts              # 写操作边界管控
│   │
│   ├── ui/                            # TUI 渲染
│   │   ├── statusline.ts             # 状态栏
│   │   ├── token-dashboard.ts        # /tokens 全屏仪表盘
│   │   └── components/
│   │       └── workflow-progress.ts   # 工作流进度条 widget
│   │
│   └── scenarios/                     # 场景插件（每个可独立加载）
│       ├── coding/
│       │   ├── index.ts              # 🔌 Coding 场景扩展入口
│       │   ├── develop/
│       │   │   ├── index.ts          # 开发子场景状态机
│       │   │   └── stages/           # 每阶段配置
│       │   │       ├── code-analysis.ts
│       │   │       ├── requirement.ts
│       │   │       ├── design.ts
│       │   │       ├── testing.ts
│       │   │       └── implementation.ts
│       │   ├── review/
│       │   │   ├── index.ts          # 审查子场景状态机
│       │   │   └── stages/
│       │   │       ├── scope.ts
│       │   │       ├── analyze.ts
│       │   │       └── report.ts
│       │   ├── agents/               # 内置 Subagent 定义 (.md)
│       │   │   ├── scout.md
│       │   │   ├── architect.md
│       │   │   ├── implementer.md
│       │   │   └── reviewer.md
│       │   └── prompts/              # 提示词模板
│       │       ├── full-workflow.md
│       │       └── review.md
│       │
│       ├── travel/
│       │   └── index.ts              # 🔌 Travel 场景（占位）
│       ├── stock/
│       │   └── index.ts              # 🔌 Stock 场景（占位）
│       └── knowledge/
│           └── index.ts              # 🔌 Knowledge 场景（占位）
│
├── docs/
│   └── refactor-scenario-plugins.md  # 本文档
│
├── package.json                       # ✏️ 声明多个 extension 入口
├── AGENTS.md                          # ✏️ 更新架构说明
└── tsconfig.json
```

### Extension Loading Declaration

```jsonc
// package.json
{
  "name": "pi-craft",
  "version": "1.0.0",
  "type": "module",
  "pi": {
    "extensions": [
      "./src/index.ts",                        // Core（基础设施）
      "./src/scenarios/coding/index.ts",       // Coding 场景
      "./src/scenarios/travel/index.ts",       // Travel 场景
      "./src/scenarios/stock/index.ts",        // Stock 场景
      "./src/scenarios/knowledge/index.ts"     // Knowledge 场景
    ],
    "config": {
      "enableSubagent": { "type": "boolean", "default": true, "description": "Enable subagent delegation" },
      "enableParallelSubagent": { "type": "boolean", "default": false, "description": "Enable parallel subagent execution" },
      "enableCwdGuard": { "type": "boolean", "default": true, "description": "Restrict writes to project working directory" }
    }
  }
}
```

## 4. User Configuration

### Work Computer

```jsonc
// ~/.pi/agent/settings.json
{
  "packages": [
    {
      "source": "pi-craft",
      "extensions": [
        "./src/index.ts",
        "./src/scenarios/coding/index.ts"
      ]
    }
  ]
}
```

### Life Computer

```jsonc
// ~/.pi/agent/settings.json
{
  "packages": [
    {
      "source": "pi-craft",
      "extensions": [
        "./src/index.ts",
        "./src/scenarios/travel/index.ts",
        "./src/scenarios/stock/index.ts"
      ]
    }
  ]
}
```

### All Scenarios (Default — Same as Today)

```jsonc
// ~/.pi/agent/settings.json
{
  "packages": ["pi-craft"]
}
```

Omit the object form entirely, and all extensions declared in the package manifest load. This is also the fallback for existing installations.

## 5. Cross-Extension Shared State

Since pi loads multiple extensions within the same package under the **same module root**, all extensions share the same Node.js module singleton instances.

### `src/core/registry.ts` (NEW)

```typescript
import type { TokenTracker } from "./token-tracker";
import type { SubagentManager } from "./subagent-manager";
import type { StatuslineManager } from "../ui/statusline";
import type { WorkflowEngine } from "./workflow-engine";

export interface CraftState {
  tracker: TokenTracker;
  subagent: SubagentManager;
  statusline: StatuslineManager;
  engine: WorkflowEngine | null;
  parallelEnabled: boolean;
  cwdGuardEnabled: boolean;
  subagentEnabled: boolean;
}

const _state: Partial<CraftState> = {};

/** Called once by Core extension during session_start */
export function initState(state: CraftState): void {
  Object.assign(_state, state);
}

/** Get current shared state. Scenarios read from this. */
export function getState(): CraftState {
  return _state as CraftState;
}
```

Both Core and all Scenarios import from `../core/registry`. The Core initializes the state; Scenarios read it.

## 6. Responsibility Split

### 6.1 Core Extension (`src/index.ts`) — Always Loaded

| Responsibility | Details |
|---------------|---------|
| Token tracking | `setupTokenTracking(pi, tracker)` — 监听 `message_end`, 持久化到 `craft-token-stats` |
| Token display | `/tokens` 命令 + `ctrl+shift+t` 快捷键 |
| Subagent tool | `registerSubagentTool(pi, ...)` — 注册 `subagent` 工具（含 TUI 渲染） |
| CWD guard | `tool_call` → `checkCwdGuard()` — 限制写操作在工作目录内 |
| Safety interlocks | 危险命令 (sudo/kill/docker)、敏感文件 (.env/key/credential) 写入确认 |
| Statusline base | 初始化 StatuslineManager, 绑定 ctx, 显示 tokens/guard/parallel |
| Session restore | 从 persistence 恢复 `WorkflowEngine` 状态（仅 statusline 显示） |

### 6.2 Coding Scenario Extension (`src/scenarios/coding/index.ts`)

| Responsibility | Details |
|---------------|---------|
| Workflow commands | `/craft:coding`, `/craft coding ...`, `/craft review` |
| Workflow management | `/craft status`, `resume`, `rollback`, `abort`, `scenarios` |
| `input` event | Coding 输入模式拦截 + LLM slug 生成 |
| `agent_end` event | `[STAGE_COMPLETE]` 检测 + `engine.transition()` |
| `before_agent_start` | 按阶段注入 system prompt（含 `PLANS_DIR`/`DOCUMENT_PATH` 替换） |
| Stage tool control | 只读阶段拦截 write/edit/bash 写操作 |
| Built-in agents | 加载 `scenarios/coding/agents/*.md` |
| Progress widget | `ctx.ui.setWidget("craft-progress", ...)` |
| Implementation gate | 进入 implementation 前 confirm |
| Auto-trigger | 阶段完成后 `sendUserMessage` 自动推进 |

### 6.3 Placeholder Scenarios (travel / stock / knowledge)

Minimal stubs that register a notification command only:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("travel", {
    description: "Travel planning scenario",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "🚧 Travel scenario is under development.\n\n" +
        "This scenario will provide travel planning and booking assistance.",
        "info"
      );
    },
  });
}
```

## 7. Detailed File Changes

### 7.1 New Files

| File | Description |
|------|-------------|
| `src/core/registry.ts` | Shared state singleton (see §5) |
| `src/scenarios/coding/index.ts` | Coding scenario extension entry (see §6.2) |
| `src/scenarios/travel/index.ts` | Travel placeholder |
| `src/scenarios/stock/index.ts` | Stock placeholder |
| `src/scenarios/knowledge/index.ts` | Knowledge placeholder |

### 7.2 Modified Files

| File | Changes |
|------|---------|
| `src/index.ts` | **Rewrite** — Remove all scenario logic. Keep only Core responsibilities (§6.1). Reduce from ~600 lines to ~250 lines. |
| `package.json` | Update `pi.extensions` array to include scenario entries |
| `AGENTS.md` | Update project structure diagram and architecture docs |
| `src/core/workflow-engine.ts` | Make `WorkflowType` generic (`string` instead of union) to support future scenarios without core changes |
| `src/ui/statusline.ts` | No logic change. Import paths stay same since statusline stays in `src/ui/` |
| `src/core/subagent-tool.ts` | Import paths — `subagent-manager.js` stays in `src/core/`, no path change needed |

### 7.3 Moved Files

| From | To |
|------|----|
| `src/workflows/coding/` | `src/scenarios/coding/` |
| _All internal imports updated accordingly_ |

### 7.4 Deleted Files

None. All functionality is preserved, just reorganized.

## 8. Import Path Updates

After moving `workflows/` → `scenarios/`, all internal imports need updating:

### `src/scenarios/coding/index.ts`
```typescript
// Old: import ... from "../../core/..."
// New: import ... from "../../core/..." (unchanged, same relative depth)
import { getState } from "../../core/registry";
import { WorkflowEngine } from "../../core/workflow-engine";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
```

### `src/scenarios/coding/develop/index.ts`
```typescript
// Old: import ... from "../../../core/..."
// New: import ... from "../../../core/..." (unchanged)
import type { WorkflowEngine } from "../../../core/workflow-engine";
import type { SubagentManager } from "../../../core/subagent-manager";
import type { TokenTracker } from "../../../core/token-tracker";
import type { StatuslineManager } from "../../../ui/statusline";
import { renderProgressBar } from "../../../ui/components/workflow-progress";
```

### `src/scenarios/coding/review/index.ts`
```typescript
// Same pattern — relative depth is unchanged
```

✅ Since the directory depth `src/{workflows → scenarios}/coding/` is the same (2 levels from `src/`), **no relative import paths change** within coding scenario files. Only `src/index.ts` and the coding entry point itself are materially rewritten.

## 9. `src/index.ts` Rewrite — Core Only

### What gets REMOVED

```
✂️ ALL_SCENARIOS constant
✂️ getEnabledScenarios()
✂️ ScenarioModule interface
✂️ loadScenario()
✂️ Managers interface (moved to registry)
✂️ codingInputMode / pendingRequirement variables
✂️ /craft:coding command
✂️ /craft command (entire handler ~200 lines)
✂️ input event handler (coding mode)
✂️ agent_end handler (slug capture + workflow start)
✂️ before_agent_start handler (stage prompts)
✂️ formatTotal() helper (if only used by tokens — keep if shared)
```

### What stays (and is cleaned up)

```typescript
// ─── Imports ──────────────────────────────────
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Core modules
import { SubagentManager } from "./core/subagent-manager";
import { registerSubagentTool } from "./core/subagent-tool";
import { TokenTracker, setupTokenTracking } from "./core/token-tracker";
import { WorkflowEngine } from "./core/workflow-engine";
import { checkCwdGuard } from "./core/cwd-guard";
import { StatuslineManager } from "./ui/statusline";
import { initState, type CraftState } from "./core/registry";

// ─── Main Entry ───────────────────────────────

export default function (pi: ExtensionAPI) {
  // 1. Init managers
  const tracker = new TokenTracker();
  const subagent = new SubagentManager();
  const statusline = new StatuslineManager();

  // 2. Read config
  let craftConfig = (pi as Record<string, unknown>).craftConfig as Record<string, unknown> | undefined;
  if (!craftConfig) {
    // fallback: read from settings.json
    /* ... same logic as today ... */
  }

  const subagentEnabled = craftConfig?.enableSubagent !== false;
  const parallelEnabled = craftConfig?.enableParallelSubagent === true;
  const cwdGuardEnabled = craftConfig?.enableCwdGuard !== false;

  // 3. Share state with scenarios
  initState({
    tracker,
    subagent,
    statusline,
    engine: null,
    parallelEnabled,
    cwdGuardEnabled,
    subagentEnabled,
  });

  // 4. Load user-level agents (builtin agents loaded by coding scenario)
  if (subagentEnabled) {
    const homeAgentDir = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
      ".pi", "agent", "agents",
    );
    subagent.loadPiAgents(homeAgentDir);
  }

  // 5. Register subagent tool
  registerSubagentTool(pi, subagent, statusline, tracker, subagentEnabled, parallelEnabled);

  // 6. Token tracking
  setupTokenTracking(pi, tracker);

  // 7. Session start — restore state
  pi.on("session_start", async (_event, ctx) => {
    statusline.bind(ctx);
    if (ctx.model) subagent.setParentModel(ctx.model.id, ctx.model.provider);

    // Restore token data
    const branchEntries = ctx.sessionManager.getBranch();
    for (const entry of branchEntries) {
      if (entry.type === "custom" && entry.customType === TokenTracker.getCustomType()) {
        const restored = TokenTracker.fromPersistenceData(entry.data);
        for (const snap of restored.getStats().history) {
          tracker.recordUsage(snap.model, snap.provider, {
            input: snap.input, output: snap.output,
            cacheRead: snap.cacheRead, cacheWrite: snap.cacheWrite, cost: snap.cost,
          });
        }
        break;
      }
    }

    // Restore workflow engine (statusline only — scenarios handle their own handlers)
    // Delay statusline updates for TUI readiness
    setTimeout(() => {
      statusline.updateTokens(tracker);
      statusline.updateParallel(parallelEnabled);
      statusline.updateGuard(cwdGuardEnabled);
    }, 50);
  });

  // 8. Turn end — update token display
  pi.on("turn_end", async (_event, ctx) => {
    if (ctx.hasUI) statusline.updateTokens(tracker);
  });

  // 9. Model change sync
  pi.on("model_select", async (event) => {
    subagent.setParentModel(event.model.id, event.model.provider);
  });

  // 10. CWD Guard + Safety Interlocks
  pi.on("tool_call", async (event, ctx) => {
    // Fix write file_path → path parameter
    if (event.toolName === "write" && (event.input as Record<string, unknown>).file_path && !(event.input as Record<string, unknown>).path) {
      (event.input as Record<string, unknown>).path = (event.input as Record<string, unknown>).file_path;
      delete (event.input as Record<string, unknown>).file_path;
    }

    // CWD guard
    if (cwdGuardEnabled) {
      const reason = checkCwdGuard(event.toolName, event.input as Record<string, unknown>, ctx.cwd);
      if (reason) {
        const ok = await ctx.ui.confirm("⚠️ 外部写操作", `${reason}\n\n是否允许此操作？`);
        if (!ok) return { block: true, reason: `用户拒绝了工作目录外的写操作。\n${reason}` };
      }
    }

    // Dangerous system commands
    if (event.toolName === "bash") {
      const command = (event.input.command as string) || "";
      const systemDangerPatterns = [
        { pattern: /sudo/, label: "提权操作 (sudo)" },
        { pattern: /(?:^|\s)kill/, label: "终止进程 (kill)" },
        { pattern: /(?:^|\s)docker\s/, label: "Docker 操作" },
      ];
      for (const { pattern, label } of systemDangerPatterns) {
        if (pattern.test(command)) {
          const preview = command.length > 120 ? command.slice(0, 120) + "..." : command;
          const ok = await ctx.ui.confirm(`⚠️ 系统级命令: ${label}`, `命令: ${preview}\n\n此命令影响范围超出工作目录。是否允许执行？`);
          if (!ok) return { block: true, reason: `用户拒绝了系统级命令: ${label}\n命令: ${preview}` };
          break;
        }
      }
    }

    // Sensitive file edits
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = ((event.input.path || event.input.file_path || "") as string).toLowerCase();
      const sensitiveFiles = [
        { pattern: /\.env$/, label: "环境变量文件 (.env)" },
        { pattern: /package\.json$/, label: "package.json" },
        { pattern: /package-lock|yarn\.lock|pnpm-lock/, label: "依赖锁文件" },
        // ... (all existing patterns)
      ];
      for (const { pattern, label } of sensitiveFiles) {
        if (pattern.test(filePath)) {
          const ok = await ctx.ui.confirm(`⚠️ 修改敏感文件: ${label}`, `文件: ${filePath}\n\n修改此文件可能影响项目配置或安全性。是否允许？`);
          if (!ok) return { block: true, reason: `用户拒绝了敏感文件修改: ${label}` };
          break;
        }
      }
    }

    // NOTE: Stage-specific tool restrictions (read-only stages) are handled by
    // the coding scenario extension — not here.
  });

  // 11. /tokens command
  pi.registerCommand("tokens", {
    description: "Show token usage dashboard",
    handler: async (args, ctx) => {
      statusline.bind(ctx);
      if (!ctx.hasUI) {
        const total = tracker.getStats().total;
        ctx.ui.notify(`Tokens: In ${formatTotal(total.input, 0)} Out ${formatTotal(total.output, 0)} Cost $${total.cost.toFixed(3)} Turns ${total.turns}`, "info");
        return;
      }
      const { createTokenDashboard } = await import("./ui/token-dashboard");
      const { matchesKey, Key } = await import("@earendil-works/pi-tui");
      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const dashboard = createTokenDashboard(tracker, theme, 80);
        return {
          render: (w: number) => dashboard.render(w),
          invalidate: () => dashboard.invalidate(),
          handleInput: (data: string) => {
            if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) done(undefined);
          },
        };
      });
    },
  });

  // 12. ctrl+shift+t shortcut
  pi.registerShortcut("ctrl+shift+t", {
    description: "Show token summary",
    handler: async (ctx) => {
      statusline.bind(ctx);
      const total = tracker.getStats().total;
      const throughput = tracker.getThroughput();
      ctx.ui.notify(`Tokens: ↑${formatTotal(total.input, 0)} ↓${formatTotal(total.output, 0)} $${total.cost.toFixed(3)} | ${throughput}`, "info");
    },
  });
}

// ─── Helpers ───────────────────────────────────
function formatTotal(n: number, pad: number, prefix = ""): string {
  if (n < 1000) return (prefix + n).padStart(pad);
  if (n < 10000) return (prefix + (n / 1000).toFixed(1) + "k").padStart(pad);
  if (n < 1000000) return (prefix + Math.round(n / 1000) + "k").padStart(pad);
  return (prefix + (n / 1000000).toFixed(1) + "M").padStart(pad);
}
```

## 10. `src/scenarios/coding/index.ts` — Scenario Extension

This is the coding scenario's own pi extension entry point. It:

1. Gets shared state from `registry`
2. Registers all coding-specific commands
3. Handles workflow lifecycle events
4. Loads built-in agents

Key design decisions:
- Uses `pi.on()` independently — pi merges event handlers from multiple extensions
- Gets `engine` from shared state — reads/writes via `getState()`
- Persists workflow state to session via `pi.appendEntry()`
- Does NOT create its own TokenTracker/SubagentManager — reuses core's

## 11. WorkflowEngine Type Change

Current:
```typescript
export type WorkflowType = "coding" | "stock" | "travel" | "knowledge";
```

New:
```typescript
export type WorkflowType = string;  // Open-ended — scenarios define their own types
```

This allows future scenarios (music, fitness, etc.) without modifying core.

## 12. Implementation Phases

### Phase 1: Create Registry + Placeholders [est. 15 min]

- [ ] Create `src/core/registry.ts`
- [ ] Create `src/scenarios/travel/index.ts`
- [ ] Create `src/scenarios/stock/index.ts`
- [ ] Create `src/scenarios/knowledge/index.ts`
- [ ] Update `package.json` with new `pi.extensions` array

### Phase 2: Move Coding Scenario [est. 10 min]

- [ ] `git mv src/workflows/coding src/scenarios/coding`
- [ ] Verify no import path breakage (relative depth unchanged)

### Phase 3: Rewrite Core Extension [est. 30 min]

- [ ] Strip `src/index.ts` down to Core responsibilities (see §9)
- [ ] Add `initState()` call to share managers
- [ ] Remove all scenario logic (ALL_SCENARIOS, /craft, coding mode, etc.)
- [ ] Keep formatTotal helper (used by /tokens)

### Phase 4: Create Coding Entry Point [est. 30 min]

- [ ] Create `src/scenarios/coding/index.ts` with scenario-specific logic
- [ ] Import shared state from `registry`
- [ ] Register commands, events, stage handlers

### Phase 5: Test & Document [est. 20 min]

- [ ] Test: `pi -e .` — all scenarios load (default behavior)
- [ ] Test: filter to core + coding only
- [ ] Test: filter to core + travel + stock
- [ ] Update `AGENTS.md`
- [ ] Update README if exists

## 13. Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Event handler ordering | pi merges handlers from all extensions. Since core registers `tool_call` for guard, and coding registers `tool_call` for stage restrictions, both run. Order: extension load order (core first in `pi.extensions` array). |
| Shared state initialization timing | Core extension loads first (first in `pi.extensions`). It initializes registry before any scenario `session_start` runs. |
| Workflow restore across reloads | Core restores engine state from persistence; coding scenario re-registers event handlers on each load. `session_start` fires per extension. |
| Multiple scenarios writing to same session | Each scenario uses its own `customType` for persistence entries. No collision. Workflow engine uses `craft-workflow-state`. |
| Backward compat | Without package filtering, all extensions load. Existing users see no change. |

## 14. Rollout

1. Merge to `main`
2. Existing users get all scenarios by default (no config change needed)
3. Document the filtering feature in README/AGENTS.md
4. Users who want per-machine config add package filtering to their settings.json

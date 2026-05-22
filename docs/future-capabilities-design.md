# Pi Craft — Future Capabilities Design

> 设计文档 · 2026-05-21 · 基于当前插件架构（Core + Capabilities + Scenarios）

## 目录

1. [总体设计原则](#1-总体设计原则)
2. [配置体系](#2-配置体系)
3. [LSP — 语言服务器诊断](#3-lsp--语言服务器诊断)
4. [Agent Team — 多 Agent 分发编排](#4-agent-team--多-agent-分发编排)
5. [Subagent Widget — 子代理流式进度](#5-subagent-widget--子代理流式进度)
6. [Todo — 持久化任务清单](#6-todo--持久化任务清单)
7. [Tilldone — 任务纪律系统](#7-tilldone--任务纪律系统)
8. [MCP — Model Context Protocol 集成](#8-mcp--model-context-protocol-集成)
9. [Damage Control — 安全规则引擎](#9-damage-control--安全规则引擎)
10. [实施优先级与依赖](#10-实施优先级与依赖)

---

## 1. 总体设计原则

### 架构约束

```
Core (registry + config + managers)
  │
  ├── Capability A ──┐
  ├── Capability B ──┤  互不依赖，各自独立
  ├── Capability C ──┘  都读 Core 的 globalThis registry
  │
  └── Scenarios ─────  不直接依赖任何 Capability
       LLM 看到 tool 注册了就自己调用
```

### 每个 Capability 的模板

```typescript
// src/capabilities/<name>/index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCraftConfig, isOn } from "../../core/config";

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "<enableKey>")) return;  // 总开关

  // 1. 注册工具
  // 2. 注册 TUI widget
  // 3. 注册事件 handler
}
```

### 对现有代码的影响

| 现有模块 | 改动 |
|---------|------|
| `src/core/config.ts` | 加类型字段 |
| `src/core/registry.ts` | 不动 |
| `src/core/workflow-engine.ts` | 不动 |
| `src/index.ts` (Core) | 不动 |
| `src/scenarios/coding/` | 不动（LLM 自己感知可用工具） |
| `package.json` | 加一行扩展声明 |

---

## 2. 配置体系

### CraftConfig 完整类型

```typescript
// src/core/config.ts

export interface CraftConfig {
  // ── Core ─────────────────────────────────
  enableSubagent?: boolean;           // default-on
  enableParallelSubagent?: boolean;   // default-off
  enableCwdGuard?: boolean;           // default-on

  // ── Capabilities ──────────────────────────
  enableLsp?: boolean;                // default-on
  enableTodo?: boolean;               // default-on
  enableWebFetch?: boolean;           // default-on
  enableMcp?: boolean;                // default-off (需用户配置 server)
  enableDamageControl?: boolean;      // default-on
  enableAgentTeam?: boolean;          // default-off (token 消耗大)
  enableSubagentWidget?: boolean;     // default-on

  // ── Capability-Specific ───────────────────
  lsp?: LspConfig;
  mcp?: McpConfig;
  damageControl?: DamageControlConfig;
  agentTeam?: AgentTeamConfig;
}

export interface LspConfig {
  /** File extension → "command --args" */
  servers?: Record<string, string>;
  /** File patterns to exclude */
  exclude?: string[];
  /** Max diagnostics to return per file */
  maxDiagnostics?: number;
}

export interface McpConfig {
  servers?: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

export interface DamageControlConfig {
  /** Path to YAML rules file, relative to project root */
  rules?: string;
}

export interface AgentTeamConfig {
  /** Max concurrent agent processes */
  maxConcurrency?: number;
  /** Default agent for ad-hoc tasks */
  defaultAgent?: string;
}
```

### 用户配置示例

```jsonc
// .pi/settings.json（项目级）或 ~/.pi/agent/settings.json（全局）
{
  "craft": {
    // Core
    "enableSubagent": true,
    "enableParallelSubagent": false,
    "enableCwdGuard": true,

    // Capabilities
    "enableLsp": true,
    "enableTodo": true,
    "enableWebFetch": true,
    "enableMcp": false,
    "enableDamageControl": true,
    "enableAgentTeam": false,

    // LSP 配置
    "lsp": {
      "servers": {
        "typescript": "typescript-language-server --stdio",
        "go": "gopls",
        "python": "pyright-langserver --stdio",
        "rust": "rust-analyzer"
      },
      "exclude": ["node_modules/**", "dist/**", ".git/**"],
      "maxDiagnostics": 100
    },

    // MCP 配置
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
        }
      ]
    },

    // Damage Control 配置
    "damageControl": {
      "rules": ".pi/damage-control-rules.yaml"
    },

    // Agent Team 配置
    "agentTeam": {
      "maxConcurrency": 3,
      "defaultAgent": "implementer"
    }
  }
}
```

---

## 3. LSP — 语言服务器诊断

### 目标

LLM 改完代码后自动调用 `lsp` 工具检查诊断结果，减少 `tsc --noEmit` / `cargo check` 的回合数。

### 核心流程

```
LLM 调用 lsp({ action: "diagnostics", path: "src/auth.ts" })
  │
  ▼
LSP Capability
  │ 1. 根据文件扩展名查找 language server 命令
  │ 2. 检查 server 进程是否已在缓存中，没有则 spawn
  │ 3. 发送 textDocument/didOpen 或 didChange（如果文件变更过）
  │ 4. 等待 textDocument/publishDiagnostics 通知
  │ 5. 格式化返回给 LLM
  ▼
返回:
  src/auth.ts
  🔴 Error  Line 42: Type 'string' is not assignable to 'number'
  🔴 Error  Line 58: Cannot find name 'validateToken'  
  🟡 Warning Line 15: 'unused' is declared but never used
  🔵 Hint   Line 3:  'fs' is deprecated, use 'node:fs/promises'
```

### 工具 Schema

```typescript
// 注册一个 lsp 工具，支持多种 action
pi.registerTool({
  name: "lsp",
  parameters: Type.Object({
    action: StringEnum(["diagnostics", "hover", "definition", "references"] as const),
    path: Type.String({ description: "File path to query" }),
    line: Type.Optional(Type.Number()),
    column: Type.Optional(Type.Number()),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const server = getOrSpawnServer(resolveExt(path.basename(params.path)));
    // ... JSON-RPC 通信 ...
  },
});
```

### 子 Action

| Action | LSP 方法 | 返回 |
|--------|---------|------|
| `diagnostics` | `textDocument/diagnostic` | 错误/警告/提示列表，按行列排序 |
| `hover` | `textDocument/hover` | 类型信息、文档注释 |
| `definition` | `textDocument/definition` | 定义位置（文件:行:列） |
| `references` | `textDocument/references` | 所有引用位置列表 |

### Server 生命周期

```
第一次请求 .ts 文件
  → spawn("typescript-language-server", ["--stdio"])
  → 发送 initialize (capabilities, workspace root)
  → 发送 initialized
  → 进程常驻，后续 .ts 文件复用

进程崩溃时
  → 自动重启一次
  → 仍然失败则返回错误，不阻塞 LLM
```

### 文件同步策略

LSP server 需要知道文件内容才能做诊断。有三种方案：

| 方案 | 描述 | 适用 |
|------|------|------|
| **didOpen on demand** | 每次 lsp 调用时发 `didOpen` + 文件内容 | 文件少、调用频次低 |
| **didChange 增量同步** | 监听 write 工具，只发变更 | 需要追踪所有 write 调用 |
| **didOpen + didClose** | 调用时 open，返回后 close | 简单可靠 |

推荐方案 1（didOpen on demand）：最简单，适合当前使用场景（LLM 改完文件后检查）。每个文件最多 open 一次（缓存后续复用）。

### Server 缓存

```typescript
class LspServerPool {
  private servers = new Map<string, {
    process: ChildProcess;
    extensions: Set<string>;
    capabilities: ServerCapabilities;
  }>();

  getOrCreate(extension: string): LspServer { ... }
}
```

按文件扩展名→language server 映射。`.ts` 和 `.tsx` 共享同一个 tsserver 实例。

### 错误处理

- Server 命令找不到 → 返回 `⚠️ typescript-language-server not installed. Run: npm i -g typescript-language-server`
- Server 启动超时 → 5 秒超时，返回错误
- Server 崩溃 → 重启一次，仍失败则返回错误
- 文件不存在 → 返回 `File not found: {path}`
- 不支持的扩展名 → 返回 `No language server configured for .{ext}`

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| Server spawn + JSON-RPC | 中 | 4h |
| 多 server 缓存池 | 中 | 2h |
| diag 结果格式化 | 低 | 1h |
| hover/def/ref 扩展 | 低 | 2h |
| 配置 + 错误处理 | 低 | 2h |
| 测试 | 中 | 3h |
| **合计** | | **~14h** |

---

## 4. Agent Team — 多 Agent 分发编排

### 目标

借鉴 pi-vs-claude-code 的 `agent-team` 模式：主 Agent 不做具体工作，只负责分解任务并分发给 specialist 子代理池。

### 与现有 subagent 的区别

| | 现有 subagent (Parallel) | Agent Team |
|------|------|------|
| LLM 调用 | 一次性声明所有任务 | 动态 dispatch，随时发新任务 |
| 结果处理 | 全部完成后拼接返回 | 逐个返回，主 Agent 实时决策 |
| 主 Agent 角色 | 等待结果 → 汇总 | 持续活跃：分解、分派、审查、决策 |
| 文件冲突处理 | 无 | 主 Agent 负责任务拆分时避免文件冲突 |
| TUI | Collapsed/Expanded 列表 | Grid 仪表盘 + 实时进度 |

### 核心工具

```typescript
// 注册 dispatch_agent 工具
pi.registerTool({
  name: "dispatch_agent",
  parameters: Type.Object({
    agent: Type.String({ description: "Agent name: implementer, reviewer, scout" }),
    task: Type.String({ description: "Task description" }),
    files: Type.Optional(Type.Array(Type.String())), // 预分配的文件列表
    dependsOn: Type.Optional(Type.Array(Type.Number())), // 依赖的 task ID
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 1. 分配一个空闲 worker slot
    // 2. Spawn 子 pi 进程
    // 3. 流式返回进度
    // 4. 完成后返回结果
  },
});
```

### 执行流程

```
主 Agent（Coding Scenario 的 implementation 阶段）
  │
  │ 先分析 tasks.md 中的所有任务，识别依赖关系
  │
  ├─► dispatch_agent({ agent: "implementer", task: "Create auth middleware", files: ["src/middleware/auth.ts"] })
  ├─► dispatch_agent({ agent: "implementer", task: "Create user model", files: ["src/models/user.ts"] })
  │   （两个无依赖，并行）
  │
  │ 等待全部完成...
  │
  ├─► dispatch_agent({ agent: "reviewer", task: "Review auth middleware and user model" })
  │
  │ 审查通过...
  │
  ├─► dispatch_agent({ agent: "implementer", task: "Create login endpoint", files: ["src/routes/auth.ts"], dependsOn: [1, 2] })
  └─► dispatch_agent({ agent: "implementer", task: "Create JWT utility", files: ["src/utils/jwt.ts"], dependsOn: [1] })
```

### TUI 仪表盘

```
┌── Agent Team ──────────────────────────────────────────┐
│                                                        │
│  implementer-1  ⚡ Running    src/middleware/auth.ts   │
│  implementer-2  ⏳ Queued     src/models/user.ts       │
│  reviewer-1     ⏳ Waiting    (depends on #1, #2)      │
│                                                        │
│  Progress: ████████░░ 2/5 tasks done                  │
└────────────────────────────────────────────────────────┘
```

### 并发控制

```typescript
const MAX_CONCURRENCY = config.agentTeam?.maxConcurrency ?? 3;
// 多出来的 task 进入队列，等 slot 空闲
```

### 文件冲突避免

主 Agent 在 dispatch 时声明 `files` 字段，Agent Team 在分配 slot 前检查文件锁：

```typescript
const fileLocks = new Map<string, number>(); // file → taskId

function acquireFileLocks(files: string[], taskId: number): boolean {
  for (const f of files) {
    if (fileLocks.has(f) && fileLocks.get(f) !== taskId) return false;
  }
  for (const f of files) fileLocks.set(f, taskId);
  return true;
}
```

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| dispatch_agent 工具 | 中 | 3h |
| worker 池 + 并发控制 | 高 | 4h |
| 文件锁 | 中 | 2h |
| TUI 仪表盘 | 中 | 3h |
| 错误恢复 + 超时 | 中 | 2h |
| 测试 | 高 | 4h |
| **合计** | | **~18h** |

---

## 5. Subagent Widget — 子代理流式进度

### 目标

改进现有 subagent 的 TUI 渲染。借鉴 pi-vs-claude-code 的 `subagent-widget`：每个子代理有独立的实时进度 widget，能看到 tool call 执行过程。

### 与现有渲染的对比

| | 现有 (Inline in conversation) | Subagent Widget |
|------|------|------|
| 位置 | 混在对话流里 | 编辑器上方独立区域 |
| 可见性 | 需要翻对话历史 | 始终可见 |
| 多子代理 | 顺序显示 | 网格平铺，各自独立 |
| 实时性 | `onUpdate` 回调刷新 | 独立更新每个 widget |
| 交互 | Ctrl+O 展开 | 始终展开或折叠 |

### 实现

```typescript
// src/capabilities/subagent-widget/index.ts

export default function (pi: ExtensionAPI) {
  if (!isOn(getCraftConfig(), "enableSubagentWidget")) return;

  // 监听 subagent tool 的生命周期
  pi.on("tool_execution_start", (event) => {
    if (event.toolName !== "subagent") return;
    // 分配一个 widget slot
  });

  pi.on("tool_execution_update", (event) => {
    if (event.toolName !== "subagent") return;
    // 更新对应 widget 的进度
  });

  pi.on("tool_execution_end", (event) => {
    if (event.toolName !== "subagent") return;
    // 标记完成，释放 slot
  });
}
```

### Widget 布局

```
┌── subagent: scout ────────────────────────────────────┐
│ → grep /auth/ in src/                                 │
│ → read src/middleware/auth.ts (lines 1-50)            │ ← 实时更新
│ → find src/models/*.ts                                │
│ ✓ Done · ↑2.1k ↓0.8k · 3 turns                       │
└───────────────────────────────────────────────────────┘

┌── subagent: scout ────────────────────────────────────┐
│ → read package.json                                   │
│ → grep /import/ in src/                               │
│ ⏳ Running...                                         │
└───────────────────────────────────────────────────────┘
```

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| 事件监听 + slot 管理 | 低 | 2h |
| Widget 渲染 | 中 | 2h |
| 状态同步 | 低 | 1h |
| **合计** | | **~5h** |

---

## 6. Todo — 持久化任务清单

### 目标

借鉴 rpiv-mono 的 `rpiv-todo`：一个 `/reload` 和 compaction 后仍然存活的任务清单 widget。与 WorkflowEngine 的 `implementation.todos` 字段集成。

### 与现有 todos 的对比

| | 现有 (tasks.md + todos.md) | Todo Capability |
|------|------|------|
| 持久化 | ✅ 文件 | ✅ 文件 + session entry |
| compaction 后 | ❌ 丢失（在对话里） | ✅ 存活 |
| TUI | 无 | 编辑器上方常驻 widget |
| LLM 交互 | 手动 write/edit | 专用 `todo` 工具 |

### Widget

```
┌── Tasks ──────────────────────────────────────────────┐
│                                                        │
│  ✅ 1. Create auth middleware     src/middleware/auth  │
│  ⚡ 2. Create user model           src/models/user     │
│  ⏳ 3. Create login endpoint       src/routes/auth     │
│  ⏳ 4. Add JWT utility             src/utils/jwt       │
│  ⏳ 5. Write tests                                     │
│                                                        │
│  Progress: 1/5 done                                   │
└──────────────────────────────────────────────────────┘
```

### 工具

```typescript
pi.registerTool({
  name: "todo",
  parameters: Type.Object({
    action: StringEnum(["list", "add", "update", "complete"] as const),
    id: Type.Optional(Type.Number()),
    title: Type.Optional(Type.String()),
    status: Type.Optional(StringEnum(["pending", "in_progress", "done"] as const)),
  }),
});
```

### 持久化

同时写入 `.pi/craft/plans/{slug}/todos.md`（人类可读）和 session entry `craft-todo-state`（支持 compaction 后恢复）。

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| 工具注册 | 低 | 1h |
| Widget 渲染 | 中 | 2h |
| 持久化（文件 + session） | 低 | 1h |
| 测试 | 低 | 1h |
| **合计** | | **~5h** |

---

## 7. Tilldone — 任务纪律系统

### 目标

借鉴 pi-vs-claude-code 的 `tilldone`：强制 LLM 在开始工作前定义任务清单，完成后逐个勾选。防止 LLM 跳到与当前任务不相关的区域。

### 与 Todo 的关系

| | Todo | Tilldone |
|------|------|------|
| 谁定义 | LLM 自行管理 | **必须在开始前定义** |
| 约束力 | 无 | 阻止未声明的工作 |
| 检查 | 无 | 每次 turn 结束时检查是否偏离 |
| 适用阶段 | 通用 | 主要在 implementation |

### 流程

```
1. Purpose Gate（可选）→ LLM 声明 session 意图
2. Define Tasks → LLM 调用 tilldone({ action: "define", tasks: [...] })
3. Execute → LLM 逐个执行，tilldone({ action: "start", id: 1 })
4. Verify → 每个 task 完成后 LLM 确认
5. Complete → tilldone({ action: "complete", id: 1 })
```

### 规则

```
Rule 1: 必须先 define 才能开始任何 write/edit/bash 写操作
Rule 2: 只能编辑当前 active task 声明的文件
Rule 3: Turn 结束时检查是否偏离了 active task
```

### 工具

```typescript
pi.registerTool({
  name: "tilldone",
  parameters: Type.Object({
    action: StringEnum(["define", "start", "complete", "status"] as const),
    tasks: Type.Optional(Type.Array(Type.Object({
      title: Type.String(),
      files: Type.Optional(Type.Array(Type.String())),
    }))),
    id: Type.Optional(Type.Number()),
  }),
});
```

### 与 Todo 的区别总结

- **Todo** = 可视化清单，LLM 自己管理，松散约束
- **Tilldone** = 纪律系统，强制定义 → 执行 → 验证，严格约束

两者可以共存：Todo 做展示，Tilldone 做约束。

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| 工具注册 | 低 | 1h |
| 规则拦截（tool_call 事件） | 中 | 2h |
| Widget 渲染 | 低 | 1h |
| 测试 | 中 | 2h |
| **合计** | | **~6h** |

---

## 8. MCP — Model Context Protocol 集成

### 目标

借鉴 my-pi 的 MCP 集成：从 `mcp.json` 或 `craft.mcp.servers` 配置中自动发现并注册 MCP server 提供的工具。

### 工作流

```
1. 用户配置 MCP servers
2. 启动时 LSP Capability spawn 每个 server
3. 发送 initialize (JSON-RPC)
4. 发送 tools/list → 获取可用工具列表
5. 逐一调用 pi.registerTool() 注册为 Pi 工具
6. LLM 调用这些工具时，转发到 MCP server
```

### 配置

```jsonc
{
  "craft": {
    "enableMcp": true,
    "mcp": {
      "servers": [
        {
          "name": "filesystem",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
        },
        {
          "name": "github",
          "command": "npx", 
          "args": ["-y", "@modelcontextprotocol/server-github"],
          "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
        },
        {
          "name": "postgres",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
        }
      ]
    }
  }
}
```

### MCP Server 通信

MCP 支持两种 transport：
- **stdio**：spawn 进程，通过 stdin/stdout 通信
- **HTTP/SSE**：连接远程 server

先实现 stdio（最常用），后期加 HTTP。

### Server 生命周期

```
启动 → initialize → tools/list → 注册 Pi tools
运行时 → LLM 调用 tool → pi 转发 → MCP server 响应 → pi 返回
关闭 → 发送 shutdown → 进程终止
```

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| JSON-RPC 客户端 | 中 | 3h |
| MCP server spawn + 管理 | 中 | 2h |
| 动态工具注册 | 中 | 2h |
| 配置解析 | 低 | 1h |
| 测试 | 中 | 3h |
| **合计** | | **~11h** |

---

## 9. Damage Control — 安全规则引擎

### 目标

借鉴 pi-vs-claude-code 的 `damage-control`：用 YAML 规则文件替代当前硬编码的安全检查，让用户可自定义规则。

### 规则文件

```yaml
# .pi/damage-control-rules.yaml

rules:
  # 路径保护
  - name: protect-env-files
    description: Block writes to .env files
    tool: [write, edit, bash]
    pattern:
      path: '**/.env'
    action: block
    message: "Environment files are protected. Use .env.example instead."

  - name: protect-git-config
    description: Block changes to git config
    tool: [write, edit, bash]
    pattern:
      path: '.git/**'
    action: block

  # 命令保护
  - name: block-sudo
    description: Require confirmation for sudo
    tool: bash
    pattern:
      command: '/sudo\b/'
    action: confirm
    message: "This command requires elevated privileges."

  - name: block-force-push
    description: Block force push to main/master
    tool: bash
    pattern:
      command: '/git\s+push\s+.*(--force|-f).*(main|master)/'
    action: block
    message: "Force push to main/master is blocked. Use a feature branch."

  - name: block-rm-rf-root
    description: Block recursive delete from root
    tool: bash
    pattern:
      command: '/rm\s+-rf\s+\//'
    action: block

  # 内容保护
  - name: no-console-log
    description: Warn when committing console.log
    tool: [write, edit]
    pattern:
      content: 'console\.log\('
    action: confirm
    message: "Found console.log(). Remove before committing?"

  # 框架特定规则
  - name: react-no-dangerously-set
    description: Block dangerouslySetInnerHTML
    tool: [write, edit]
    pattern:
      content: 'dangerouslySetInnerHTML'
    action: block
    message: "dangerouslySetInnerHTML is blocked. Use a safer alternative."

  - name: no-any-type
    description: Warn on TypeScript any type
    tool: [write, edit]
    pattern:
      content: ':\s*any\b'
    action: confirm
    message: "Found ': any' type annotation. Consider using a specific type."
```

### 三种 Action

| Action | 行为 |
|--------|------|
| `block` | 直接拒绝，返回 message |
| `confirm` | 弹出确认框，用户可以 override |
| `warn` | 仅通知，不阻止 |

### 与现有 Guard 的整合

```
tool_call 事件
  │
  ├─► CWD Guard (硬编码，Core 提供)
  │
  ├─► Stage Restriction (硬编码，Coding Scenario 提供)
  │
  └─► Damage Control (YAML 规则，Capability 提供)
       ├─► 检查 path 匹配
       ├─► 检查 command 匹配
       ├─► 检查 content 匹配
       └─► 执行 action: block / confirm / warn
```

### 实施复杂度

| 组件 | 复杂度 | 估计工时 |
|------|--------|---------|
| YAML 解析 + 规则引擎 | 中 | 2h |
| tool_call 事件拦截 | 低 | 1h |
| 三种 action 实现 | 低 | 1h |
| 默认规则集 | 低 | 1h |
| 测试 | 中 | 2h |
| **合计** | | **~7h** |

---

## 10. 实施优先级与依赖

### 依赖图

```
                    Core (已完成)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     LSP         Todo      Damage Control
        │           │           │
        │           ▼           │
        │      Tilldone         │
        │           │           │
        ▼           ▼           ▼
  Subagent Widget  MCP    Agent Team
```

### 建议实施顺序

| 优先级 | Capability | 理由 |
|--------|-----------|------|
| **P0** | **Damage Control** | 安全基础，投入低（~7h），立即可用 |
| **P0** | **Subagent Widget** | 用户体验提升，投入低（~5h），复用现有 subagent 数据 |
| **P1** | **LSP** | 提高编码质量，投入中（~14h），但需要用户装 language server |
| **P1** | **Todo** | 可视化任务管理，投入低（~5h），与现有 tasks.md 互补 |
| **P2** | **Tilldone** | 强约束，适合需要严格纪律的场景 |
| **P2** | **MCP** | 投入中（~11h），需用户配置 server |
| **P3** | **Agent Team** | 投入高（~18h），复杂度高，先等其他稳定再上 |

### 渐进路线

```
Week 1: Damage Control + Subagent Widget   （~12h，安全 + 体验）
Week 2: LSP                                 （~14h，提效）
Week 3: Todo + Tilldone                     （~11h，任务管理）
Week 4: MCP                                 （~11h，集成外部）
Week 5+: Agent Team                         （~18h，并行编码）
```

# Task Tracking — Pi TODO Extension & Skill Design

> **Goal:** Give coding agent a lightweight external working memory: a current task + an ordered queue, with minimal operations (add/start/done/cancel), persisted across turns via session entries.

**Deliverables:**
1. `todo` extension — registers the `todo` tool for LLM and `/todos` command for users
2. `task-tracking` skill — instructs agent when and how to use the todo system

---

## Architecture

```
task-tracking skill (规则层)
  │  指导 agent 何时/如何使用 todo 工具
  │  定义工作纪律和最佳实践
  ▼
todo extension (机制层)
  │  注册 "todo" 工具（LLM 可调用）
  │  注册 "/todos" 命令（用户可调用）
  │  状态持久化到 session entries
  │  支持分支模型（fork 后状态独立）
```

| | Skill（指令层） | Extension（机制层） |
|---|---|---|
| 是什么 | 静态 Markdown，告诉 agent 怎么思考 | TypeScript 代码，给 agent 工具和能力 |
| 有状态吗 | ❌ 无状态 | ✅ 持久化到 session entries |
| 能注册工具吗 | ❌ 不能 | ✅ `pi.registerTool()` |
| 能跨 turn 追踪吗 | ❌ 不能 | ✅ 通过 session entries 重建状态 |

**Extension 位置：** `~/.pi/agent/extensions/todo/index.ts`（全局，所有项目可用）

**Skill 位置：** `skills/task-tracking/SKILL.md`（放在 pi-craft 仓库中）

---

## Data Model

```typescript
interface Task {
  id: number;        // 自增 ID，唯一标识
  title: string;     // 任务标题
  status: "queued" | "in_progress" | "done" | "cancelled";
}
```

**约束：**
- 同一时间只有一个 task 处于 `in_progress`
- `start` 一个 task 时，之前的 `in_progress` 自动回到 `queued`
- 队列顺序 = 创建顺序
- 状态完整存入 tool result details，确保分支安全

---

## Todo Tool API

一个工具 `todo`，通过 `action` 参数区分操作。

### Actions

| action | 参数 | 行为 | 示例输出 |
|--------|------|------|----------|
| `list` | 无 | 返回所有任务，按状态分组 | `📋 Tasks: 1 doing, 3 queued, 2 done` |
| `add` | `title: string` | 新任务加入队列尾部 | `➕ #5 added: 写单元测试` |
| `start` | `id: number` | 标记为 `in_progress`（旧 doing 自动回 queue） | `🔄 Now: #3 重构 auth 模块` |
| `done` | `id: number` | 标记完成 | `✅ #3 done: 重构 auth 模块` |
| `cancel` | `id: number` | 取消任务 | `❌ #4 cancelled: 更新文档` |

### TypeBox Schema

```typescript
const TodoParams = Type.Object({
  action: StringEnum(["list", "add", "start", "done", "cancel"] as const),
  title: Type.Optional(Type.String({ description: "Task title (required for add)" })),
  id: Type.Optional(Type.Number({ description: "Task ID (required for start, done, cancel)" })),
});
```

### list 输出格式（紧凑，省 token）

```
📋 Tasks: 1 doing, 3 queued, 2 done

  Doing —
  🔄 #3 重构 auth 模块

  Queued —
  ⬜ #4 写单元测试
  ⬜ #5 更新 README
  ⬜ #6 修复 login bug

  Done —
  ✅ #1 初始化项目
  ✅ #2 配置 CI/CD
```

### 边界情况

| 场景 | 行为 |
|------|------|
| `start` 不存在的 id | 返回错误 |
| `done`/`cancel` 一个 `queued` 的任务 | 允许，直接从 queued 变 done/cancel |
| `start` 时已有 `in_progress` | 旧 task 回 `queued`，新 task 变 `in_progress` |
| `add` 无 title | 返回错误 |

### Tool Details 格式

每次 tool call 返回完整快照，确保从任一条 entry 都能完整还原状态：

```typescript
interface TodoDetails {
  action: string;
  tasks: Task[];   // 完整任务列表快照
  nextId: number;  // 下一个分配的 ID
  error?: string;
}
```

---

## State Management

### 持久化策略

每次 `todo` tool call 的结果 `details` 中存储完整的 `{ tasks, nextId }` 快照。不做增量 patch，保证任意一条 entry 都能独立还原。

### 状态重建

`session_start` 和 `session_tree` 事件触发时，从最后一个 entry 向前扫描，找到第一个 `todo` tool result 即停止（因为每条都是完整快照）。

```typescript
const reconstructState = (ctx: ExtensionContext) => {
  const entries = ctx.sessionManager.getBranch();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "todo") {
      const details = entry.message.details as TodoDetails;
      tasks = details.tasks;
      nextId = details.nextId;
      return;
    }
  }
  // 没有历史记录 → 初始空状态
  tasks = [];
  nextId = 1;
};
```

### 分支安全性

因为状态存在 tool result details 中（沿 session entry 链路），fork 后每个分支自动拥有独立的任务状态。回溯到历史 entry 时，当时的 tasks 状态自动恢复。

---

## `/todos` 命令

用户命令，展示当前分支的任务列表。

- **TUI 模式：** 打开 overlay 面板，格式与 `list` 输出一致，按 Escape/Enter 关闭
- **非 TUI 模式（print/json/rpc）：** 直接打印文本

---

## Extension Registration

```typescript
export default function (pi: ExtensionAPI) {
  let tasks: Task[] = [];
  let nextId = 1;

  // 状态重建
  pi.on("session_start", async (_e, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_e, ctx) => reconstructState(ctx));

  // LLM 工具
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Manage a task list. Actions: list, add (title), start (id), done (id), cancel (id)",
    parameters: TodoParams,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // ... CRUD logic
    },
    renderCall(args, theme, _context) { /* ... */ },
    renderResult(result, { expanded }, theme, _context) { /* ... */ },
  });

  // 用户命令
  pi.registerCommand("todos", {
    description: "Show all tasks on the current branch",
    handler: async (_args, ctx) => { /* ... */ },
  });
}
```

---

## Task-Tracking Skill

`skills/task-tracking/SKILL.md`

### 触发条件

- 用户给出多步骤需求
- 用户说"帮我做 X, Y, Z"
- 用户说"先做 A 再做 B"
- Agent 在执行过程中发现新任务
- 用户中断当前工作

### 核心规则

```
规则1: 开始工作前，调用 todo list 看当前状态，用 todo add 加入新任务，用 todo start 开始第一个
规则2: 完成一个任务后，立即 todo done，然后 todo list + todo start 取下一个。不要等用户催
规则3: 被用户中断时，当前任务自动回到队列。用 todo add 加入新请求，todo start 开始它
规则4: 执行中发现新任务，用 todo add 加入队列尾部，不打断当前工作
规则5: 用户说"好了/完成了"但队列还有 queued 任务时，主动提醒
规则6: 不要同时做两件事。当前总有且只有一个 in_progress 任务
```

### 场景覆盖

| 场景 | Agent 行为 |
|------|-----------|
| 开始工作 | todo list → todo add → todo start |
| 中途发现新任务 | todo add "新任务" → 继续当前 |
| 任务完成 | todo done → todo list → todo start 下一个 |
| 被用户中断 | todo add "用户的新需求" → todo start 新任务 |
| 任务不再需要 | todo cancel |
| 用户说完成 | 检查队列，主动提醒未完成任务 |

---

## File List

| 文件 | 类型 | 说明 |
|------|------|------|
| `~/.pi/agent/extensions/todo/index.ts` | 新建 | Extension 入口 |
| `skills/task-tracking/SKILL.md` | 新建 | Skill 规则文件 |

---

## Acceptance Criteria

1. LLM 可以调用 `todo` 工具的 5 个 action（list/add/start/done/cancel）
2. `start` 互斥：同时只有一个 `in_progress` 任务
3. 用户可以用 `/todos` 命令查看当前任务列表
4. 状态在 session 重启后正确恢复
5. Fork 分支后，两个分支的任务状态独立
6. 任务状态随 session entry 链路，回溯到历史 entry 时状态自动恢复
7. `list` 输出紧凑：1 doing / N queued / M done

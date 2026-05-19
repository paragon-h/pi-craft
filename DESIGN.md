# Pi Craft — 设计文档

## 1. 项目概述

### 1.1 定位
Pi Craft 是一个基于 Pi Coding Agent 的 **Mono-Repo 扩展包**，提供自动化的开发工作流引擎，首发 Coding 场景，后续可扩展至股票分析、旅游规划、知识库管理等多个领域。

### 1.3 关键约束

| 约束 | 说明 |
|------|------|
| **文档落盘** | 所有设计产物（需求文档、设计文档、Task 列表、Todo 列表）存储在项目 `.pi/craft/plans/` 目录下，格式为 Markdown |
| **一问一答** | 需求澄清阶段采用一问一答模式，每次只提一个问题，提供 2-4 个推荐选项，用户选择或自定义回答后继续下一问 |
| **代码预分析** | 进入需求澄清前，先自动分析项目代码结构（目录树、依赖关系、技术栈），产出代码分析报告 |
| **读-only 阶段** | 代码分析、需求澄清、设计文档、测试策略四个阶段只开放只读工具（read/grep/find/ls），禁止 edit/write |
| **实现审批** | 代码实现阶段每项变更需用户明确确认（Approval Gate），不可跳过 |

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| **工作流引擎** | 状态机驱动的多阶段工作流，支持回退、重试、中断恢复 |
| **Subagent 编排** | 基于 Pi 进程隔离的子代理系统，支持 Single / Parallel / Chain 模式，可观察详细执行内容 |
| **Token 追踪** | 全局 Token 消耗仪表盘，按 Model / Provider / Session 维度统计 |
| **Provider 优化** | 请求拦截与缓存层，针对不同 Provider 做请求优化 |
| **Statusline 扩展** | 美化的状态栏，显示当前工作流阶段、Token 消耗、活跃 Subagent |
| **用户交互闭环** | 代码分析→一问一答需求澄清→设计文档→测试策略协商→代码实现（需用户确认）|
| **Code Review 子场景** | Coding 场景内的独立 Code Review 工作流，支持 diff/文件/PR 审查 |
| **文档产物管理** | 所有产出物持久化到 `.pi/craft/plans/`，统一命名管理 |
| **读写分离** | 分析/需求/设计/测试/审查阶段只能用只读工具，仅实现阶段可写代码 |
| **按场景安装** | 支持选择性启用场景（如工作电脑只装 coding） |

---

## 2. 仓库结构

```
pi-craft/
├── package.json                      # NPM 包配置 + pi manifest
├── README.md
├── DESIGN.md                         # 本设计文档
│
├── src/                              # 源码
│   ├── index.ts                      # ★ 主入口：注册扩展、初始化所有子系统
│   │
│   ├── core/                         # 核心引擎
│   │   ├── workflow-engine.ts        # 工作流状态机
│   │   ├── subagent-manager.ts       # Subagent 编排管理
│   │   ├── token-tracker.ts          # Token 消耗追踪器
│   │   └── provider-optimizer.ts     # Provider 请求/缓存优化
│   │
│   ├── workflows/                    # 工作流场景
│   │   ├── coding/                   # ★ Coding 场景（含多个子场景）
│   │   │   ├── index.ts              # Coding 场景注册
│   │   │   ├── develop/              # 子场景：全流程开发
│   │   │   │   ├── index.ts          # develop 状态机定义
│   │   │   │   └── stages/           # develop 各阶段处理器
│   │   │   │       ├── code-analysis.ts
│   │   │   │       ├── requirement.ts
│   │   │   │       ├── design.ts
│   │   │   │       ├── testing.ts
│   │   │   │       └── implementation.ts
│   │   │   ├── review/               # 子场景：Code Review
│   │   │   │   ├── index.ts          # review 状态机定义
│   │   │   │   └── stages/           # review 各阶段处理器
│   │   │   │       ├── scope.ts      # 阶段1：审查范围确认
│   │   │   │       ├── analyze.ts    # 阶段2：代码审查分析
│   │   │   │       └── report.ts     # 阶段3：审查报告+建议修复
│   │   │   ├── agents/               # Coding 专用 Subagent
│   │   │   │   ├── architect.md      # 架构分析代理（develop）
│   │   │   │   ├── reviewer.md       # 代码审查代理（develop/review 共用）
│   │   │   │   └── implementer.md    # 代码实现代理（develop）
│   │   │   └── prompts/              # Coding 工作流提示词模板
│   │   │       ├── full-workflow.md
│   │   │       └── review.md
│   │   │
│   │   ├── stock/                    # 未来：股票分析工作流
│   │   ├── travel/                   # 未来：旅游规划工作流
│   │   └── knowledge/                # 未来：知识库管理
│   │
│   ├── ui/                           # UI 组件
│   │   ├── statusline.ts             # 增强状态栏
│   │   ├── token-dashboard.ts        # Token 消耗仪表盘
│   │   └── components/               # 可复用 TUI 组件
│   │       ├── workflow-progress.ts  # 工作流进度条
│   │       ├── subagent-viewer.ts    # Subagent 执行详情查看器
│   │       └── confirm-dialog.ts     # 确认对话框
│   │
│   └── prompts/                      # 通用提示词模板
│       ├── start-coding.md           # /craft coding 入口
│       └── show-tokens.md            # /tokens 入口
│
├── prompts/                          # Pi 兼容：提示词模板
│   ├── craft-coding.md
│   └── craft-tokens.md
│
├── themes/                           # Pi 兼容：主题
│   └── pi-craft.json
│
└── skills/                           # Pi 兼容：技能
    └── craft-coding.md
```

---

## 3. 核心模块设计

### 3.1 工作流引擎 (`workflow-engine.ts`)

#### 状态机模型

```
                         ┌─────────┐
                         │  IDLE   │
                         └────┬────┘
                              │ /craft coding <requirement>
                              ▼
                      ┌──────────────┐
               ┌──────│ CODE_ANALYSIS│ (只读工具)
               │      └──────┬───────┘
               │             │ 产出: .pi/craft/plans/{date}-{topic}/code-analysis.md
               │             ▼
               │      ┌──────────────┐
               │      │ REQUIREMENT  │ (只读工具·一问一答)
               │      └──────┬───────┘
               │             │ 产出: .pi/craft/plans/{date}-{topic}/requirement.md
               │             ▼
               │      ┌──────────────┐
               │      │   DESIGN     │ (只读工具)
               │      └──────┬───────┘
               │             │ 产出: .pi/craft/plans/{date}-{topic}/design.md
               │             ▼
               │      ┌──────────────┐
               │      │   TESTING    │ (只读工具)
               │      └──────┬───────┘
               │             │ 产出: .pi/craft/plans/{date}-{topic}/testing-plan.md
               │             ▼
               │      ┌──────────────┐
               │      │IMPLEMENTATION│ (可写工具·Approval Gate)
               │      └──────┬───────┘
               │             │ 产出: .pi/craft/plans/{date}-{topic}/tasks.md + todos.md
               │             ▼
               │      ┌──────────────┐
               │      │  COMPLETED   │
               │      └──────────────┘
               │
               └──── 任意非写阶段均可 /craft rollback 回退
```

#### 数据结构

```typescript
interface WorkflowState {
  id: string;                    // 工作流实例 ID
  type: "coding" | "stock" | "travel" | "knowledge";
  stage: WorkflowStage;
  stageHistory: StageRecord[];   // 阶段历史（支持回退）
  context: WorkflowContext;      // 工作流上下文
  createdAt: number;
  updatedAt: number;
}

// develop 子场景阶段 + review 子场景阶段
type DevelopStage = "idle" | "code_analysis" | "requirement" | "design" | "testing" | "implementation" | "completed";
type ReviewStage = "idle" | "scope" | "analyze" | "report" | "completed";
type WorkflowStage = DevelopStage | ReviewStage;

interface WorkflowContext {
  // 文档输出目录（自动创建）
  plansDir: string;               // .pi/craft/plans/

  codeAnalysis?: {
    completed: boolean;
    documentPath: string;         // .pi/craft/plans/code-analysis.md
  };
  requirement?: {
    raw: string;                  // 原始需求
    clarified: string;            // 澄清后的需求
    qaHistory: QAPair[];          // Q&A 历史（一问一答）
    documentPath: string;         // .pi/craft/plans/requirement.md
  };
  design?: {
    document: string;
    documentPath: string;         // .pi/craft/plans/design.md
    approved: boolean;
    feedback: string[];
  };
  testing?: {
    strategy: "unit" | "e2e" | "both" | "skip";
    testPlan: string;
    documentPath: string;         // .pi/craft/plans/testing-plan.md
    approved: boolean;
  };
  implementation?: {
    tasks: Task[];                // Task 列表
    todos: TodoItem[];            // Todo 列表（关联 Task）
    tasksPath: string;            // .pi/craft/plans/tasks.md
    todosPath: string;            // .pi/craft/plans/todos.md
    currentTask: number;
    approvalHistory: ApprovalRecord[];
  };
}

interface QAPair {
  question: string;              // 提出的问题
  options?: string[];             // 推荐选项（2-4个）
  answer: string;                // 用户回答
  timestamp: number;
}
```

#### 核心 API

```typescript
class WorkflowEngine {
  // 创建/加载工作流
  static create(type: string, ctx: ExtensionContext): WorkflowEngine;
  static restore(ctx: ExtensionContext): WorkflowEngine | null;

  // 状态查询
  getStage(): WorkflowStage;
  getContext(): WorkflowContext;

  // 状态转换
  transition(next: WorkflowStage): void;
  rollback(): WorkflowStage;          // 回退到上一阶段

  // 持久化
  persist(): void;                     // → pi.appendEntry

  // 事件
  onStageChange(handler: (from: WorkflowStage, to: WorkflowStage) => void): void;
}
```

---

### 3.2 Subagent 管理器 (`subagent-manager.ts`)

#### 设计思路

复用 Pi 官方 subagent 示例的核心逻辑（spawn 独立 `pi` 进程），在此基础上增强：

1. **详细执行可见性**：通过 `onUpdate` 回调实时展示 subagent 的每个 tool call 和思考过程
2. **结构化输出**：JSON mode 捕获完整执行日志
3. **执行回放**：支持 collapsed/expanded 两种视图，expanded 模式下展示所有细节
4. **审批机制**：特定 subagent（如 implementer）可在执行前要求主 agent 确认

#### Subagent 配置

```typescript
interface SubagentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: "user" | "project";
  requireApproval?: boolean;       // ★ 新增：是否需要用户审批
  approvalGate?: (task: string) => boolean; // ★ 审批逻辑
}
```

#### 执行模式

| 模式 | 说明 | 可见性 |
|------|------|--------|
| `single` | 单个代理执行任务 | 实时流式展示 tool call |
| `parallel` | 多个代理并发执行 | 并行流式展示，状态图标 |
| `chain` | 链式执行，`{previous}` 传递上下文 | 逐步展示每步结果 |

#### 增强渲染

```
┌─ subagent architect ─────────────────────────────────┐
│ ✓ architect (project)                                 │
│ ─── Task ─────────────────────────────────────────── │
│ 分析当前项目架构，生成组件依赖图                           │
│ ─── Output ────────────────────────────────────────── │
│ → read src/app.ts (lines 1-50)                       │
│ → grep /import.*from/ in src/                        │
│ → read src/components/Header.tsx (lines 10-80)       │
│ ... (collapsed: 5 items, Ctrl+O 展开)                 │
│ # Architecture Analysis                               │
│                                                        │
│ ## Component Tree                                     │
│ - App → Header, Sidebar, Content                      │
│ - Content → Dashboard, Settings                       │
│                                                        │
│ ↑1.2k ↓3.4k R512 W0 $0.042 ctx:8.5k haiku            │
└───────────────────────────────────────────────────────┘
```

---

### 3.3 Token 追踪器 (`token-tracker.ts`)

#### 追踪维度

```typescript
interface TokenStats {
  // 按 Model 统计
  byModel: Map<string, {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  }>;

  // 按 Provider 统计
  byProvider: Map<string, {
    input: number;
    output: number;
    cost: number;
    requests: number;
  }>;

  // 全局聚合
  total: {
    input: number;
    output: number;
    cost: number;
    turns: number;
    tokensPerSecond: number;
  };

  // 会话统计
  session: {
    startTime: number;
    tokensAtStart: number;
    costAtStart: number;
  };

  // 历史趋势（保留最近 N 个 turn）
  history: TokenSnapshot[];
}
```

#### 数据来源

通过监听以下 Pi 事件采集数据：

- `message_end`：从 `AssistantMessage.usage` 提取 input/output/cacheRead/cacheWrite/cost
- `turn_end`：记录 turn 级别的统计
- `after_provider_response`：获取 Provider 级别的请求/响应信息
- `session_start`：初始化或恢复历史数据
- `session_shutdown`：持久化到 session

#### 持久化

```typescript
// 每个 turn 结束时写入一条 custom entry
pi.appendEntry("token-stats", {
  timestamp: Date.now(),
  model: ctx.model?.id,
  provider: ctx.model?.provider,
  usage: { input, output, cacheRead, cacheWrite, cost },
  turnIndex,
  stage: workflowStage,  // 关联当前工作流阶段
});
```

#### UI 展示：/tokens 命令

```
╔══ Token Dashboard ═══════════════════════════════════╗
║                                                       ║
║  Session Totals                                       ║
║  ├─ Input:  127.5k tokens                            ║
║  ├─ Output:  34.2k tokens                            ║
║  ├─ Cache Read:  45.1k  │  Cache Write: 12.3k        ║
║  ├─ Turns:  23                    │  $1.247           ║
║  └─ Throughput: 342 tokens/s                         ║
║                                                       ║
║  By Model                                             ║
║  ├─ claude-opus-4-5    ↑85k ↓22k  $0.92   [████████]║
║  ├─ claude-haiku-4-5   ↑42k ↓12k  $0.32   [████░░░░]║
║  └─ gpt-4o             ↑0.5k ↓0.2k $0.01   [█░░░░░░░]║
║                                                       ║
║  By Provider                                          ║
║  ├─ anthropic    16 req  ↑127k ↓34k  $1.24            ║
║  └─ openai        1 req  ↑0.5k ↓0.2k $0.01           ║
║                                                       ║
║  esc to close                                         ║
╚═══════════════════════════════════════════════════════╝
```

---

### 3.4 Provider 优化器 (`provider-optimizer.ts`)

#### 功能矩阵

| 优化项 | 说明 | 实现方式 |
|--------|------|----------|
| **请求缓存** | 缓存相同 system prompt + messages 的响应 | `before_provider_request` 拦截，LRU 内存缓存 |
| **请求去重** | 并发相同请求只发一次 | 基于请求指纹的 inflight map |
| **请求重试** | 429/5xx 自动重试 | Exponential backoff |
| **Provider 路由** | 根据任务复杂度自动路由到不同模型 | 基于关键词/复杂度的路由规则 |
| **Context 窗口优化** | 在 context 事件中压缩/裁剪上下文 | `context` 事件拦截 |
| **Cache 命中追踪** | 追踪 Anthropic prompt caching 效率 | `after_provider_response` headers |

#### 请求指纹

```typescript
function createRequestFingerprint(payload: unknown): string {
  // 基于 system instruction + messages content 生成 SHA256
  // 忽略 temperature 等非确定性参数
}
```

#### 缓存策略

```typescript
interface CacheEntry {
  fingerprint: string;
  response: string;         // 序列化后的响应
  model: string;
  createdAt: number;
  ttl: number;              // 默认 5 分钟
  hitCount: number;
}
```

---

### 3.5 Statusline 扩展 (`ui/statusline.ts`)

#### 设计

```
┌─ Statusline ──────────────────────────────────────────┐
│ 📋 Coding:Design  │ ↑127k ↓34k $1.24 │ 🏗 architect… │
│  工作流:阶段      │   Token 消耗      │  活跃 Subagent  │
└───────────────────────────────────────────────────────┘
```

#### 实现

- 使用 `ctx.ui.setStatus()` 注册多个状态位
- 监听工作流引擎 `stageChange` 事件更新阶段状态
- 监听 `message_end` 更新 Token 统计
- 监听 subagent 生命周期更新活跃代理列表

#### 状态位定义

| Key | 内容 | 颜色 |
|-----|------|------|
| `craft-workflow` | `📋 Coding:Design` | accent |
| `craft-tokens` | `↑127k ↓34k $1.24` | dim |
| `craft-subagent` | `🏗 architect…` | warning |

---

## 4. Coding 场景详解

### 4.0 子场景总览

Coding 场景包含两个子场景，共享 `agents/` 和基础设施：

| 子场景 | 入口命令 | 用途 | 阶段数 | 文档产出 |
|--------|---------|------|--------|---------|
| `develop` | `/craft coding <需求>` | 全流程开发 | 5 | code-analysis → requirement → design → testing-plan → tasks + todos |
| `review` | `/craft review [target]` | 代码审查 | 3 | review-scope → review-report |

```
Coding 场景
├── develop (全流程开发)
│   IDLE → CODE_ANALYSIS → REQUIREMENT → DESIGN → TESTING → IMPLEMENTATION → COMPLETED
│
└── review (代码审查)
    IDLE → SCOPE → ANALYZE → REPORT → COMPLETED
```

共用资源：architect / reviewer / implementer 代理

### 4.1 Develop 子场景：整体流程

```
用户: /craft coding "实现用户登录功能"
  │
  ├─► 阶段0: IDLE → CODE_ANALYSIS  [只读工具]
  │   - 使用 read/ls/find/grep 分析项目结构
  │   - 产出: .pi/craft/plans/{date}-{topic}/code-analysis.md
  │   - 内容: 目录树、技术栈、依赖关系、现有认证模块等
  │   - 完成后自动进入 REQUIREMENT
  │
  ├─► 阶段1: CODE_ANALYSIS → REQUIREMENT  [只读工具]
  │   一问一答式需求澄清:
  │   1. Pi 提出第1个问题 + 2-4个推荐选项
  │   2. 用户选择或自定义回答
  │   3. Pi 提出第2个问题... (循环直到无更多疑问)
  │   4. Pi 汇总生成需求文档
  │   5. 用户确认 → 产出: .pi/craft/plans/{date}-{topic}/requirement.md
  │   [用户回复 /craft rollback 可回退]
  │
  ├─► 阶段2: REQUIREMENT → DESIGN  [只读工具]
  │   - 调用 architect subagent 分析架构
  │   - 生成设计文档 (组件设计、数据流、API)
  │   - 产出: .pi/craft/plans/{date}-{topic}/design.md
  │   - 展示给用户，可要求修改
  │   [用户确认 → 过渡]
  │
  ├─► 阶段3: DESIGN → TESTING  [只读工具]
  │   - 基于设计文档，提出测试策略问题:
  │     "请选择测试策略:
  │      1. 单元测试 (Jest/Vitest)
  │      2. E2E 测试 (Playwright/Cypress)
  │      3. 两者都要
  │      4. 不需要测试"
  │   - 生成测试计划
  │   - 产出: .pi/craft/plans/{date}-{topic}/testing-plan.md
  │   [用户确认 → 过渡]
  │
  ├─► 阶段4: TESTING → IMPLEMENTATION  [可写工具 + Approval Gate]
  │   - 生成 Task 分解列表 → .pi/craft/plans/{date}-{topic}/tasks.md
  │   - 生成 Todo 列表 → .pi/craft/plans/{date}-{topic}/todos.md
  │   - 逐任务执行：
  │     1. 展示 diff 预览 → ctx.ui.confirm
  │     2. 用户 Approve → 执行代码变更
  │     3. 可选：调用 reviewer subagent 审查
  │     4. 更新 tasks.md 和 todos.md
  │
  └─► 阶段5: IMPLEMENTATION → COMPLETED
      - 所有 tasks 完成
      - 生成完成摘要
      - 展示文件变更汇总
```

### 4.2 Review 子场景：代码审查

```
用户: /craft review [--scope=<git-diff|file|branch>] [target] [topic-slug]
  │
  ├─► 阶段0: IDLE → SCOPE  [只读工具]
  │   审查范围确认:
  │   - 默认审查当前 git diff（未提交的变更）
  │   - 可指定目标: file path / directory / branch name
  │   - 使用 git diff / git log 获取变更内容
  │   - 展示审查范围摘要给用户确认
  │   - 产出: .pi/craft/plans/{date}-{topic}/review-scope.md
  │   用户确认 → 进入分析阶段
  │
  ├─► 阶段1: SCOPE → ANALYZE  [只读工具]
  │   代码审查分析:
  │   - 调用 reviewer subagent 逐文件审查
  │   - 审查维度：
  │     ✓ 代码质量与可读性
  │     ✓ 逻辑正确性与边界情况
  │     ✓ 安全漏洞（OWASP Top 10）
  │     ✓ 性能问题
  │     ✓ 最佳实践与设计模式
  │     ✓ 测试覆盖
  │   - 每个发现标注严重级别: 🔴 Critical / 🟡 Major / 🔵 Minor / 💡 Suggestion
  │   分析完成 → 进入报告阶段
  │
  ├─► 阶段2: ANALYZE → REPORT  [只读 + 可选修复]
  │   生成审查报告:
  │   - 产出: .pi/craft/plans/{date}-{topic}/review-report.md
  │   - 包含:
  │     · 审查摘要（总发现数、按严重级别分类）
  │     · 逐条发现详情（文件、行号、问题描述、建议修复）
  │     · 总体评价
  │   - 展示报告给用户
  │   - 询问用户操作:
  │     "发现 N 个问题。如何处理？"
  │     A. 自动修复所有可修复的问题（需逐项确认）
  │     B. 手动逐个处理
  │     C. 仅查看报告，不做修改
  │   - 如选 A → 进入修复流程（类似 implementation 的 Approval Gate）
  │
  └─► 阶段3: REPORT → COMPLETED
      - 生成审查完成摘要
      - 展示统计数据
```

**Review 子场景状态机：**

```
IDLE → SCOPE → ANALYZE → REPORT → COMPLETED
 (只读)  (只读)   (只读)   (只读+可选修复)

产出:
  .pi/craft/plans/{date}-{topic}/review-scope.md
  .pi/craft/plans/{date}-{topic}/review-report.md
```

**Review 命令用法：**

```bash
# 审查当前未提交的变更
/craft review

# 审查指定文件
/craft review src/middleware/auth.ts

# 审查指定目录
/craft review src/middleware/

# 审查某个分支相对于 main 的变更
/craft review --branch=feature/login

# 审查指定 git diff 范围
/craft review --scope=git-diff HEAD~3..HEAD

# 审查并指定 topic（用于文档命名）
/craft review src/auth/ auth-refactor
```

### 4.3 阶段处理器：Code Analysis (develop)

```yaml
阶段: code_analysis
工具: [read, grep, find, ls]  # 只读
文档产出: .pi/craft/plans/code-analysis.md
```

**System Prompt 注入:**
```
[CODE ANALYSIS PHASE — READ-ONLY]

你正处于 Coding 工作流的代码分析阶段。你不能修改任何代码。

请执行以下分析步骤：

1. 使用 ls 了解项目顶层目录结构
2. 使用 find 定位关键配置文件 (package.json, tsconfig.json 等)
3. 使用 read 读取 package.json 了解技术栈和依赖
4. 使用 grep 搜索与需求相关的现有代码
5. 使用 read 阅读关键文件的关键段落

产出分析报告并写入 .pi/craft/plans/{date}-{topic}/code-analysis.md：
- 项目技术栈概述
- 目录结构概要
- 与需求相关的现有模块
- 架构模式识别
- 潜在的影响范围

完成后告知用户并自动进入需求澄清阶段。
```

### 4.4 阶段处理器：Requirement（一问一答）

```yaml
阶段: requirement
工具: [read, grep, find, ls]  # 只读
文档产出: .pi/craft/plans/requirement.md
交互模式: 一问一答
```

**一问一答交互协议：**

每次交互的格式：
1. Pi 提出 **一个问题**，附带 **2-4 个推荐选项**
2. 用户选择一个选项（或输入自定义回答）
3. Pi 记录回答，判断是否还有未澄清点
4. 如有，提出下一个问题；如无，汇总生成需求文档

**System Prompt 注入 (每次 AI 回复前)：**
```
[REQUIREMENT CLARIFICATION PHASE — READ-ONLY]

你正处于需求澄清阶段。你不能修改任何代码。

交互规则（严格遵守）：
- 每次只提出 1 个问题
- 每个问题必须附带 2-4 个推荐选项，以字母编号 (A/B/C/D)
- 等待用户回答后再提下一个问题
- 覆盖以下维度（逐维度提问）：
  1. 功能范围 - 明确功能边界
  2. 用户交互 - 用户如何使用该功能
  3. 数据模型 - 涉及哪些数据结构
  4. 边界条件 - 异常情况、边界值
  5. 非功能需求 - 性能、安全、兼容性
- 当所有维度澄清完毕，汇总生成需求文档

需求文档输出格式：
- 写入 .pi/craft/plans/{date}-{topic}/requirement.md
- 包含：功能概述、用户故事、验收标准、非功能需求、边界条件、Q&A 记录
```

**一问一答示例：**
```
🤖 Q1: 登录方式支持哪些？
    A. 仅邮箱+密码
    B. 仅手机号+验证码
    C. 邮箱+密码 和 手机号+验证码
    D. 以上 + 第三方登录 (Google/GitHub)

👤 C

🤖 Q2: Token 过期策略？
    A. 固定 24 小时过期
    B. 滑动过期（每次请求刷新）
    C. Access Token 30min + Refresh Token 7天
    D. 永不过期

👤 C

🤖 Q3: 是否需要验证邮箱？
    A. 需要（发送验证链接）
    B. 不需要
    C. 注册时不需要，但支持后续绑定

👤 A

🤖 ✅ 需求已澄清，正在生成需求文档...
    [产出 .pi/craft/plans/requirement.md]
```

### 4.5 阶段处理器：Design

```yaml
阶段: design
工具: [read, grep, find, ls]  # 只读
可调用 subagent: [architect]
文档产出: .pi/craft/plans/design.md
```

**System Prompt 注入:**
```
[DESIGN PHASE — READ-ONLY]

你正处于设计阶段。你不能修改任何代码。

1. 调用 architect subagent 分析架构
   - 输入：代码分析报告 + 需求文档
   - 输出：架构评估、模块划分建议

2. 生成设计文档写入 .pi/craft/plans/{date}-{topic}/design.md：
   - 组件/模块设计
   - 数据流图（文字描述）
   - API 设计（如涉及）
   - 数据库变更（如涉及）
   - 技术选型说明
   - 设计权衡与风险

3. 展示摘要给用户
4. 根据用户反馈迭代修改
5. 用户确认后，过渡到测试策略阶段
```

### 4.6 阶段处理器：Testing

```yaml
阶段: testing
工具: [read, grep, find, ls]  # 只读
文档产出: .pi/craft/plans/testing-plan.md
```

**System Prompt 注入:**
```
[TESTING STRATEGY PHASE — READ-ONLY]

你正处于测试策略阶段。你不能修改任何代码。

1. 基于设计文档，分析测试需求
2. 使用 ctx.ui.select 询问用户选择测试策略
3. 根据用户选择，生成测试计划并写入 .pi/craft/plans/{date}-{topic}/testing-plan.md：
   - 测试策略选择
   - 测试范围
   - 测试用例概要
   - 测试工具选型
   - 测试文件规划
4. 用户确认后，过渡到代码实现阶段
```

### 4.7 阶段处理器：Implementation

```yaml
阶段: implementation
工具: [read, bash, edit, write, grep, find, ls]  # 完整工具
可调用 subagent: [implementer, reviewer]
文档产出: .pi/craft/plans/tasks.md + .pi/craft/plans/todos.md
权限: Approval Gate — 每次代码变更需用户确认
```

**System Prompt 注入:**
```
[IMPLEMENTATION PHASE — APPROVAL REQUIRED]

你正处于代码实现阶段。你拥有完整的代码修改权限。

## 开始前：
1. 先读取需求文档、设计文档、测试计划
2. 生成 Task 分解列表 → 写入 .pi/craft/plans/{date}-{topic}/tasks.md
3. 生成 Todo 列表 → 写入 .pi/craft/plans/{date}-{topic}/todos.md

## Task 格式 (tasks.md):
```markdown
# Tasks

## Task 1: [标题]
- 状态: pending | in_progress | done
- 描述: ...
- 涉及文件: ...
- 依赖: Task X

## Task 2: ...
```

## Todo 格式 (todos.md):
```markdown
# Todos

- [ ] Task 1: 实现 JWT 中间件
  - [ ] 创建 src/middleware/auth.ts
  - [ ] 集成到 app.ts
- [ ] Task 2: 实现登录 API
  - [ ] 创建 src/routes/auth.ts
  - [ ] 编写单元测试
```

## 逐任务执行规则：
1. 选择下一个 pending 任务 → 标记为 in_progress
2. 生成变更计划（包含 diff 预览）
3. **[Approval Gate]** 使用 ctx.ui.confirm 请求用户确认:
   - 标题: "Approve Task N/M: [任务标题]"
   - 内容: 展示文件变更列表 + 简要 diff 预览
   - 用户选 Approve → 继续
   - 用户选 Reject → 重新规划
   - 用户选 Edit Plan → 用户编辑计划
4. 执行代码变更
5. 更新 tasks.md 和 todos.md
6. 可选：调用 reviewer subagent 审查变更
7. 标记任务为 done
8. 重复直到所有任务完成
```

#### 任务审批流

```
┌─── Approval Gate ────────────────────────────────────┐
│                                                       │
│  📝 Task 2/5: 实现 JWT token 验证中间件                  │
│                                                       │
│  Files to change:                                     │
│  • src/middleware/auth.ts (new)                       │
│  • src/app.ts (modify)                                │
│                                                       │
│  Preview:                                             │
│  + export function authMiddleware(...) { ... }        │
│  + app.use(authMiddleware);                           │
│                                                       │
│  [✓ Approve]  [✗ Reject]  [📝 Edit Plan]             │
│                                                       │
└───────────────────────────────────────────────────────┘
```

---

## 5. Subagent 可见性设计

### 5.1 实时流式展示

```
┌─ subagent implementer (running…) ────────────────────┐
│ → read src/middleware/auth.ts                         │
│ → read src/types.ts (lines 10-30)                    │
│ → grep /import.*JWT/ in src/                        │
│ → write src/middleware/auth.ts                        │
│ ⏳ Thinking...                                        │
└───────────────────────────────────────────────────────┘
```

每个 tool call 实时通过 `onUpdate` → `ctx.ui.setWidget` 更新。

### 5.2 Expanded 视图

用 Ctrl+O 展开查看完整执行记录：

```
┌─ subagent implementer ✓ ─────────────────────────────┐
│ ─── Task ─────────────────────────────────────────── │
│ 实现 JWT token 验证中间件                               │
│ ─── Tool Calls ───────────────────────────────────── │
│ → read src/middleware/auth.ts                         │
│   [10 lines read - showing content]                   │
│ → read src/types.ts (lines 10-30)                    │
│   [20 lines read - showing content]                   │
│ → grep /import.*JWT/ in src/                        │
│   [3 matches in 2 files]                              │
│ → write src/middleware/auth.ts (85 lines)            │
│   [Content preview…]                                  │
│ ─── Final Output ─────────────────────────────────── │
│ ## Implementation Summary                             │
│ ...                                                   │
│ ─── Stats ────────────────────────────────────────── │
│ ↑12k ↓3k R2k W0 $0.15 ctx:5.2k sonnet                │
└───────────────────────────────────────────────────────┘
```

---

## 6. 文档产物管理

### 6.1 目录结构

```
<project>/.pi/craft/plans/
├── 2026-05-19-user-login/                 # develop 子场景
│   ├── code-analysis.md                   # 代码分析报告
│   ├── requirement.md                     # 需求文档（含 Q&A 记录）
│   ├── design.md                          # 设计文档
│   ├── testing-plan.md                    # 测试计划
│   ├── tasks.md                           # Task 分解列表
│   └── todos.md                           # Todo 列表
│
└── 2026-05-19-auth-refactor/             # review 子场景
    ├── review-scope.md                    # 审查范围
    └── review-report.md                   # 审查报告
```

### 6.2 文档命名规则

```
.pi/craft/plans/{YYYY-MM-DD}-{topic-slug}/{stage}.md
```

| 组成部分 | 说明 | 示例 |
|---------|------|------|
| `YYYY-MM-DD` | 工作流启动日期 | `2026-05-19` |
| `topic-slug` | 需求主题的英文缩略（小写、连字符、≤5词），作为子目录名 | `user-login` |
| `stage` | 阶段文档名（不带日期前缀） | `code-analysis.md` |

**topic-slug 生成规则：**
1. 由用户在 `/craft coding` 时提供简短英文名称，或 AI 根据需求自动生成
2. 取需求核心关键词 ≤5 个
3. 转为小写、空格替换为连字符
4. 示例："实现用户登录功能" → `user-login`

**完整路径示例：**
```
# develop 子场景
.craft/plans/2026-05-19-user-login/code-analysis.md
.craft/plans/2026-05-19-user-login/requirement.md
.craft/plans/2026-05-19-user-login/design.md
.craft/plans/2026-05-19-user-login/testing-plan.md
.craft/plans/2026-05-19-user-login/tasks.md
.craft/plans/2026-05-19-user-login/todos.md

# review 子场景
.craft/plans/2026-05-19-auth-refactor/review-scope.md
.craft/plans/2026-05-19-auth-refactor/review-report.md
```

### 6.3 文档生命周期

| 文档 | 生成时机 | 子场景 | 更新时机 |
|------|---------|--------|---------|
| `{date}-{topic}/code-analysis.md` | CODE_ANALYSIS 阶段 | develop | 不更新 |
| `{date}-{topic}/requirement.md` | REQUIREMENT 确认后 | develop | 用户可回退重新澄清 |
| `{date}-{topic}/design.md` | DESIGN 确认后 | develop | 用户反馈迭代修改 |
| `{date}-{topic}/testing-plan.md` | TESTING 确认后 | develop | 用户反馈修改 |
| `{date}-{topic}/tasks.md` | IMPLEMENTATION 初始 | develop | 每完成一个 Task 更新状态 |
| `{date}-{topic}/todos.md` | IMPLEMENTATION 初始 | develop | 每完成一个子任务勾选 |
| `{date}-{topic}/review-scope.md` | SCOPE 确认后 | review | 不更新 |
| `{date}-{topic}/review-report.md` | REPORT 阶段输出 | review | 修复后可追加修复记录 |

### 6.3 文档读取

在后续阶段，系统会通过 `read` 工具将前置文档作为上下文注入。
每次进入新阶段时，自动读取 `.pi/craft/plans/` 下已有的产物。

---

## 7. 场景安装与模块化管理

### 7.1 按场景安装

用户安装 pi-craft 时，可以选择只启用特定场景，减少无关代码和 Agent 定义的加载：

```bash
# 安装全部场景（默认）
pi install npm:pi-craft

# 仅安装 Coding 场景
pi install npm:pi-craft
# 然后在 .pi/settings.json 中配置：
```

**配置文件 `.pi/settings.json`：**
```json
{
  "packages": [
    {
      "source": "npm:pi-craft",
      "extensions": ["src/index.ts"],
      "skills": [],
      "prompts": []
    }
  ],
  "craft": {
    "enabledScenarios": ["coding"],
    "disabledScenarios": ["stock", "travel", "knowledge"]
  }
}
```

### 7.2 场景注册机制

扩展入口 `src/index.ts` 根据配置动态注册场景：

```typescript
// src/index.ts
import { codingWorkflow } from "./workflows/coding/index.js";
// import { stockWorkflow } from "./workflows/stock/index.js";
// import { travelWorkflow } from "./workflows/travel/index.js";

const ALL_SCENARIOS: Record<string, WorkflowHandler> = {
  coding: codingWorkflow,
  // stock: stockWorkflow,
  // travel: travelWorkflow,
  // knowledge: knowledgeWorkflow,
};

export default function (pi: ExtensionAPI) {
  // 读取配置，决定启用哪些场景
  const settings = pi.getSettings?.() ?? {};
  const enabled = settings.craft?.enabledScenarios ?? Object.keys(ALL_SCENARIOS);
  const disabled = new Set(settings.craft?.disabledScenarios ?? []);

  const scenarios = enabled.filter(s => !disabled.has(s) && ALL_SCENARIOS[s]);

  // 只注册启用的场景
  for (const name of scenarios) {
    ALL_SCENARIOS[name].register(pi, engine);
  }
}
```

### 7.3 运行时场景切换

提供命令查看和切换场景：

```bash
# 查看已启用的场景
/craft scenarios

# 临时启用一个场景（当前 session）
/craft enable stock

# 临时禁用一个场景
/craft disable travel
```

### 7.4 工作电脑推荐配置

```json
{
  "craft": {
    "enabledScenarios": ["coding"],
    "disabledScenarios": ["stock", "travel", "knowledge"]
  }
}
```

---

## 8. 扩展性设计

### 8.1 新工作流接入

每个工作流只需实现 `WorkflowHandler` 接口：

```typescript
interface WorkflowHandler {
  type: string;
  stages: StageHandler[];

  // 生命周期
  onStart(ctx: ExtensionContext, engine: WorkflowEngine): Promise<void>;
  onComplete(ctx: ExtensionContext, engine: WorkflowEngine): Promise<void>;
  onAbort(ctx: ExtensionContext, engine: WorkflowEngine): Promise<void>;
}

interface StageHandler {
  stage: WorkflowStage;
  entryPrompt: string;                    // 进入此阶段时的系统提示
  onEnter(ctx: ExtensionContext): Promise<void>;
  onExit(ctx: ExtensionContext): Promise<boolean>; // false = 阻止转换
  tools?: string[];                       // 此阶段允许的工具
  subagents?: string[];                   // 此阶段可用的 subagent
  readOnly?: boolean;                     // 是否只读阶段
  outputDocument?: string;                // 产出文档路径（相对 plansDir）
}
```

### 8.2 未来工作流示例

```typescript
// stock/index.ts - 股票分析工作流
const stockWorkflow: WorkflowHandler = {
  type: "stock",
  stages: [
    { stage: "data_collection", ... },
    { stage: "technical_analysis", ... },
    { stage: "fundamental_analysis", ... },
    { stage: "report_generation", ... },
  ],
};

// travel/index.ts - 旅游规划工作流
const travelWorkflow: WorkflowHandler = {
  type: "travel",
  stages: [
    { stage: "preference_gathering", ... },
    { stage: "itinerary_planning", ... },
    { stage: "booking_assistance", ... },
  ],
};
```

---

## 9. 命令和快捷键

| 命令/快捷键 | 说明 |
|-------------|------|
| `/craft coding <需求> [topic-slug]` | 启动 Coding 开发全流程（自动执行代码分析→需求澄清） |
| `/craft review [target] [topic-slug]` | 启动 Code Review 审查流程（默认 review 当前 git diff） |
| `/craft resume` | 恢复上次未完成的工作流 |
| `/craft status` | 查看当前工作流状态 + 文档产物列表 |
| `/craft rollback` | 回退到上一阶段（仅非实现阶段可用） |
| `/craft abort` | 中止当前工作流（保留已产出文档） |
| `/craft scenarios` | 查看已启用/禁用的场景列表 |
| `/tokens` | 打开 Token 消耗仪表盘 |
| `/tokens model` | 按模型查看 Token 统计 |
| `/tokens provider` | 按 Provider 查看 Token 统计 |
| `Ctrl+Shift+T` | 快速查看 Token 摘要 |
| `Ctrl+Shift+S` | 切换 Subagent 可见性 (collapsed/expanded) |

---

## 10. 事件流

```
session_start
  ├─► TokenTracker: 恢复历史数据
  ├─► WorkflowEngine: 恢复上次工作流
  ├─► Statusline: 初始化状态位
  └─► ProviderOptimizer: 初始化缓存

before_agent_start
  ├─► WorkflowEngine: 注入当前阶段系统提示
  └─► ProviderOptimizer: 注入缓存指令

message_end
  ├─► TokenTracker: 记录 token 消耗
  └─► Statusline: 更新 token 显示

turn_end
  └─► TokenTracker: 持久化统计

tool_call (subagent)
  ├─► SubagentManager: 实时渲染 tool call
  └─► Statusline: 更新活跃 subagent

tool_result (subagent)
  ├─► SubagentManager: 渲染 tool result
  └─► Statusline: 更新 subagent 完成状态

agent_end
  └─► WorkflowEngine: 检查阶段转换条件

input (/craft coding ...)
  └─► WorkflowEngine: 创建/恢复工作流

input (/tokens ...)
  └─► TokenTracker: 渲染仪表盘
```

---

## 11. 技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Subagent 实现方式 | `spawn("pi", ["--mode", "json", "-p", "--no-session"])` | 复用 Pi 官方 subagent 示例的成熟方案，天然支持工具执行和 JSON 输出 |
| 状态持久化 | `pi.appendEntry("craft-workflow", ...)` | 利用 Pi 原生持久化，支持 session 恢复 |
| UI 渲染 | `ctx.ui.setWidget` + `ctx.ui.custom` | 利用 Pi TUI 组件系统，支持 overlay 和非 overlay 两种模式 |
| Token 数据来源 | `message_end` 事件提取 | 最可靠的数据源，不依赖 Provider 特定实现 |
| 请求缓存 | 内存 LRU + 指纹去重 | 轻量、无外部依赖，适合单会话场景 |

---

## 12. 实施计划

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| **Phase 1** | 基础架构：WorkflowEngine + TokenTracker + Statusline | P0 |
| **Phase 2** | Subagent 管理器 + Coding 场景代理定义（architect/reviewer/implementer） | P0 |
| **Phase 3** | Coding develop 子场景（5 阶段完整工作流） | P0 |
| **Phase 4** | Coding review 子场景（3 阶段审查流程） | P0 |
| **Phase 5** | 文档产物管理（.pi/craft/plans/ + Task/Todo/Report 生成） | P0 |
| **Phase 6** | Approval Gate 审批流程 | P0 |
| **Phase 7** | Provider 优化器 | P1 |
| **Phase 7** | Token Dashboard UI (/tokens 命令) | P1 |
| **Phase 8** | 其他工作流场景（stock/travel/knowledge） | P2 |
| **Phase 9** | UI 主题美化 | P2 |

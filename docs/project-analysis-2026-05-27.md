# Pi Craft — 项目深度分析报告

> 生成日期：2026-05-27 | 版本：1.0.0 | 代码行数：约 4500+ TypeScript

---

## 目录

1. [项目概览](#1-项目概览)
2. [架构分析](#2-架构分析)
3. [功能模块深入剖析](#3-功能模块深入剖析)
4. [技术栈与依赖](#4-技术栈与依赖)
5. [设计文档 vs 实现对比](#5-设计文档-vs-实现对比)
6. [代码质量评估](#6-代码质量评估)
7. [问题与风险](#7-问题与风险)
8. [优化建议](#8-优化建议)
9. [改进方向](#9-改进方向)
10. [总结评分](#10-总结评分)

---

## 1. 项目概览

### 1.1 定位

Pi Craft 是 Pi Coding Agent 的 **Mono-Repo 扩展包**，提供自动化的开发工作流引擎。核心价值是：将 LLM 辅助编程从「对话式编码」升级为「结构化工程流程」，覆盖从需求分析到代码实现的全生命周期。

### 1.2 核心能力矩阵

| 能力 | 成熟度 | 实现状态 | 代码量 |
|------|--------|---------|--------|
| 工作流引擎 (WorkflowEngine) | ⭐⭐⭐⭐⭐ | ✅ 完整实现 | ~250 行 |
| 多阶段开发流程 (Develop) | ⭐⭐⭐⭐ | ✅ 完整实现 | ~800 行 |
| 代码审查流程 (Review) | ⭐⭐⭐⭐ | ✅ 完整实现 | ~350 行 |
| 子代理系统 (Subagent) | ⭐⭐⭐⭐ | ✅ 完整实现 | ~500 行 |
| Token 追踪仪表盘 | ⭐⭐⭐⭐⭐ | ✅ 完整实现 | ~600 行 |
| LSP 语言服务器诊断 | ⭐⭐⭐⭐ | ✅ 完整实现 | ~550 行 |
| CWD 写操作边界守护 | ⭐⭐⭐⭐ | ✅ 完整实现 | ~120 行 |
| 安全规则引擎 (Damage Control) | ⭐⭐⭐⭐ | ✅ 完整实现 | ~400 行 |
| 工作流建议器 (Workflow Suggester) | ⭐⭐⭐ | ✅ 完整实现 | ~250 行 |
| 子代理进度部件 | ⭐⭐⭐ | ✅ 完整实现 | ~180 行 |
| 持久化任务清单 (Todo) | ⭐⭐⭐ | ✅ 完整实现 | ~200 行 |
| 任务纪律系统 (Tilldone) | ⭐⭐⭐ | ✅ 完整实现 | ~230 行 |
| 状态栏扩展 | ⭐⭐⭐⭐ | ✅ 完整实现 | ~150 行 |
| Provider 优化器 | ❌ | 未实现 | DESIGN.md 中有设计 |
| MCP 集成 | ❌ | 未实现 | docs 中有设计 |
| Agent Team 多代理分发 | ❌ | 未实现 | docs 中有设计 |

### 1.3 关键数字

- **扩展入口**：8 个（1 Core + 5 Capabilities + 1 Subagent Widget + 1 Todo + 1 Tilldone + 1 Coding Scenario）
- **命令数量**：11 个（`/coding:develop`、`/coding:review`、`/coding:status`、`/coding:resume`、`/coding:rollback`、`/coding:abort`、`/tokens`、1 shortcut）
- **注册工具**：6 个（`subagent`、`start_coding_workflow`、`lsp`、`todo`、`tilldone`、`damage-control`）
- **子代理定义**：4 个内置（scout、architect、implementer、reviewer）
- **工作流阶段**：Develop 5 阶段 + Review 3 阶段
- **TUI Widgets**：5 个（progress、tokens dashboard、todo、tilldone、subagent）
- **状态行状态位**：7 个

---

## 2. 架构分析

### 2.1 整体架构（⭐⭐⭐⭐☆）

```
┌─────────────────────────────────────────────────────────────────┐
│                         Pi Coding Agent                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Core Extension (src/index.ts)                 │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │   │
│  │  │TokenTracker  │ │SubagentMgr   │ │StatuslineMgr │      │   │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘      │   │
│  │         │                │                │               │   │
│  │  ┌──────┴────────────────┴────────────────┴───────┐      │   │
│  │  │              Registry (globalThis)              │      │   │
│  │  └──────────────────────┬─────────────────────────┘      │   │
│  └─────────────────────────┼────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────┬───────────┼───────────┬─────────────────┐      │
│  │             │           │           │                 │      │
│  ▼             ▼           ▼           ▼                 ▼      │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐   │
│ │  LSP   │ │ Damage │ │  Todo  │ │Tilldone  │ │  Coding   │   │
│ │  Cap.  │ │Control │ │  Cap.  │ │  Cap.    │ │ Scenario  │   │
│ └────────┘ └────────┘ └────────┘ └──────────┘ └───────────┘   │
│                                                                  │
│  ┌─────────────┐ ┌────────────────┐                             │
│ │  Workflow   │ │   Subagent     │                             │
│ │  Suggester  │ │   Widget       │                             │
│ └─────────────┘ └────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

**评价**：扩展式插件架构设计良好，Core + Capabilities + Scenarios 三层分离清晰。通过 `globalThis` 实现跨扩展单例（因为 jiti 为每个扩展入口创建独立模块上下文），这是一个务实且正确的架构决策。

### 2.2 工作流引擎设计（⭐⭐⭐⭐☆）

```
                    IDLE
                      │ /coding:develop
                      ▼
              ┌──────────────┐
              │ CODE_ANALYSIS│ 只读 → code-analysis.md
              └──────┬───────┘
                     │ [STAGE_COMPLETE]
                     ▼
              ┌──────────────┐
              │ REQUIREMENT  │ 只读 · 一问一答 → requirement.md
              └──────┬───────┘
                     │ [STAGE_COMPLETE]
                     ▼
              ┌──────────────┐
              │   DESIGN     │ 只读 · architect 子代理 → design.md
              └──────┬───────┘
                     │ [STAGE_COMPLETE]
                     ▼
              ┌──────────────┐
              │   TESTING    │ 只读 · 策略选择 → testing-plan.md
              └──────┬───────┘
                     │ 用户确认 → [STAGE_COMPLETE]
                     ▼
              ┌──────────────┐
              │IMPLEMENTATION│ 可写 · 5轮自动推进 + 卡住检测
              └──────┬───────┘
                     │ [STAGE_COMPLETE]
                     ▼
              ┌──────────────┐
              │  COMPLETED   │
              └──────────────┘

              ◄── 任意阶段可 /coding:rollback [stage] 回退
```

**评价**：状态机设计简洁清晰，阶段转换通过 `[STAGE_COMPLETE]` 文本标记检测（与 LLM 输出耦合），支持指定阶段回退。`rollback` 支持单步回退和跳转到特定阶段两种模式。

### 2.3 事件流架构（⭐⭐⭐⭐☆）

```
session_start → Core: 初始化 Managers + 恢复 Token 数据
              → Coding Scenario: 恢复 Workflow + 重新注册 handlers

tool_call     → Core: CWD Guard + 系统命令拦截 + 敏感文件保护
              → Coding Scenario: 只读阶段限制
              → Damage Control: YAML 规则引擎
              → Tilldone: 任务纪律检查

before_agent_start → Workflow Suggester: 注入建议提示
                   → Develop Stages: 注入阶段 prompt

message_end   → TokenTracker: 记录用量

agent_end     → Coding Scenario: [STAGE_COMPLETE] 检测 + 阶段转换
              → Implementation Stage: 自动推进/卡住检测/审批门

turn_end      → Core: 更新 statusline tokens
              → Todo: 刷新 widget
              → Tilldone: 刷新 widget
              → Review: 刷新 widget
```

**评价**：事件流设计合理，多个扩展注册同一事件的 handler，pi 框架按扩展加载顺序执行。`tool_call` 事件经过多层安全过滤（Core Guard → Scenario Stage → Damage Control → Tilldone），形成纵深防御。

---

## 3. 功能模块深入剖析

### 3.1 TokenTracker（⭐⭐⭐⭐⭐）— 优秀

**文件**：`src/core/token-tracker.ts`（~300 行）

**亮点**：
- 三维度统计（Model/Provider/Session），查询接口丰富
- 主 agent + subagent 分离统计，`getTotalAllIn()` 合并计算
- 缓存命中率计算（`getCacheHitRate()`）及节省成本估算
- 每日统计聚合 + 历史趋势热力图（`dailyStats`）
- 连续使用天数统计（`getStreaks()`：最长连续/当前连续）
- 最活跃日识别（`getMostActiveDay()`）
- 最爱模型识别（`getFavoriteModel()`）
- 持久化采用 `pi.appendEntry()` → compaction 后仍可恢复
- `fromPersistenceData()` 静态工厂方法实现干净的反序列化

**改进空间**：
- 缓存命中率可以增加预估节省金额（已实现但未在 overview 中展示）
- 可增加「每美元 Token 效率」指标（tokens/$）
- 日统计的 history 数据存在内存，跨天跨 session 依赖持久化恢复

### 3.2 SubagentManager（⭐⭐⭐⭐☆）— 良好

**文件**：`src/core/subagent-manager.ts`（~400 行）

**亮点**：
- 支持用户级（`~/.pi/agent/agents/`）、项目级、内置三级代理发现
- 同名代理优先级：builtin < user < project
- Single 模式创新设计：注入 steering message，不 spawn 独立进程
- Parallel/Chain 模式 spawn 独立 pi 进程，支持并发限制（MAX_CONCURRENCY=4）
- Chain 模式支持 `{previous}` 占位符传递上下文
- YAML frontmatter 解析，代理定义清晰
- 模型继承：子代理使用父 agent 模型（除非显式指定）
- AbortSignal 支持优雅终止（SIGTERM → 5s 后 SIGKILL）

**改进空间**：
- Single 模式使用 `pi.sendMessage()` 注入，依赖框架行为，有脆弱性风险
- Parallel 模式下子代理 crash 后无重试机制
- 无子代理执行超时限制（仅依赖 AbortSignal）
- `runChain` 中某一步失败后直接 break，无部分重试选项
- 代理发现无明显日志，用户可能不知道有哪些代理可用

### 3.3 CWD Guard（⭐⭐⭐⭐☆）— 良好

**文件**：`src/core/cwd-guard.ts`（~120 行）

**亮点**：
- 覆盖 write/edit/bash 三种写操作
- Bash 命令智能解析：区分读写命令，只拦截写入类
- 重定向 `>` `>>` `tee` 写入外部路径检测
- `dd of=` 写入检测
- `~` 展开支持
- 返回明确违规原因，便于用户理解

**改进空间**：
- Bash 写入命令列表不完整，例如 `install`（复制文件到系统目录）未覆盖
- 没有「学习模式」—— 用户不能将特定路径加入白名单
- 没有项目级 CWD 边界策略配置
- 复杂命令（管道、子 shell）的边界检测可能遗漏

### 3.4 LSP Capability（⭐⭐⭐⭐☆）— 良好

**文件**：`src/capabilities/lsp/index.ts` + `json-rpc.ts` + `server-pool.ts`（~550 行）

**亮点**：
- 完整 JSON-RPC 2.0 实现（编解码、请求追踪、通知）
- Content-Length header 协议解析
- 进程池管理：按语言类型缓存 server 进程
- 文件打开/变更增量同步（didOpen/didChange）
- 四种操作：diagnostics、hover、definition、references
- 崩溃自动重启一次
- 项目语言自动检测（walk 目录树，最多 500 文件）
- 状态栏实时显示活跃 LSP server
- 用户可通过配置覆盖默认 server 命令或禁用特定语言

**改进空间**：
- Server 启动无超时控制（initialize 请求有 15s 超时但 spawn 本身无）
- 无 server 健康检查（进程退出 code 检测不够及时）
- 诊断结果格式化较简单，可增加行内代码展示
- 批量诊断未实现（design doc 中提及）
- didChange 同步每次读文件，对大型文件可能耗时
- `ensureFileOpen` 中固定 sleep 300ms 不够优雅，应改用回调/promise

### 3.5 Damage Control（⭐⭐⭐⭐☆）— 良好

**文件**：`src/capabilities/damage-control/index.ts` + `rules-engine.ts`（~400 行）

**亮点**：
- YAML 规则引擎，用户可自定义安全策略
- 三层规则匹配：path（glob）、command（regex）、content（regex）
- 三种动作：block（直接拒绝）、confirm（弹窗确认）、warn（仅通知）
- 全局 + 项目两级规则合并（项目覆盖全局）
- 自动生成 seed 规则文件（首次加载时）
- 三种确认模式：confirm / auto-deny / auto-allow
- 文件内容缓存（跨规则匹配复用，turn 结束时清空）
- 无效 regex 的优雅处理（跳过而非崩溃）

**改进空间**：
- 规则优先级未定义（找到第一个匹配就返回），多规则冲突时行为不确定
- 无规则热重载（`/reload` 不触发规则重新加载）
- Seed 规则数量有限（只有 3 条：block-sudo、block-rm-rf-root、protect-env-files）
- Glob 匹配不支持 `{}` 花括号扩展
- 无规则测试命令（用户无法验证规则是否匹配预期）
- 无规则模板库（常见安全规则预置集）

### 3.6 Workflow Suggester（⭐⭐⭐⭐☆）— 良好

**文件**：`src/capabilities/workflow-suggester/index.ts`（~250 行）

**亮点**：
- 双通道触发：`before_agent_start` prompt 注入 + `turn_end` popup 兜底
- 中英文双语言意图检测（正则模式覆盖中英文开发意图）
- 负向模式排除（问题咨询、git 操作、部署、文档等非开发意图）
- 权重评分系统（4=强信号 / 3=中强 / 2=中 / 1=弱）
- 冷却机制：10 分钟拒绝冷却 + 指数退避（×2 per 连续拒绝）
- 接受后重置计数
- 通过 `start_coding_workflow` tool call 检测工作流启动

**改进空间**：
- 纯正则匹配，容易误判/漏判（如 "帮我解释这段代码" vs "帮我实现登录"）
- 正则规则需要持续维护，新表达方式无法自适应
- 没有用户行为学习（用户的接受/拒绝数据未用于调整策略）
- 高频对话场景下可能触发过频繁
- 与 Coding Scenario 耦合（直接发送 `/coding:develop` 命令）

### 3.7 Coding Scenario — Develop（⭐⭐⭐⭐⭐）— 优秀

**文件**：`src/scenarios/coding/develop/`（~800 行总计）

**亮点**：
- 5 个阶段各有独立的 prompt 模板 + handler
- LLM 自动生成 topic-slug（通过 `sendUserMessage` 先问 LLM 再捕获 `agent_end` 结果）
- `[STAGE_COMPLETE]` 检测 + 自动阶段推进
- Implementation 阶段的安全机制：
  - 最大 5 轮自动推进（防止无限循环）
  - 卡住检测（6 个正则模式检测 LLM 困惑/需要帮助）
  - `[APPROVAL_NEEDED]` 审批门
  - per_task 审批模式支持
- Testing → Implementation 过渡确认（安全闸门）
- 分析阶段指导使用并行 scout 子代理
- Prompt 中的 `DOCUMENT_PATH`/`PLANS_DIR`/`REQUIREMENT` 占位符替换

**改进空间**：
- `[STAGE_COMPLETE]` 依赖 LLM 输出文本匹配，有一定不确定性
- Auto-continue 检测逻辑和 implementation 特有的 agent_end handler 耦合在同一个事件中，阅读负担较高
- Per-task 审批模式下的 continue 提示对 LLM 不友好（只显示在 UI，不是 prompt 注入）
- 没有「当前任务进度百分比」的视觉反馈
- 分析阶段的并行 scout 子代理调用是建议性的（依赖 LLM 判断），可能被忽略

### 3.8 Coding Scenario — Review（⭐⭐⭐☆☆）— 良好

**文件**：`src/scenarios/coding/review/`（~350 行总计）

**亮点**：
- 3 阶段清晰：Scope → Analyze → Report
- Scope 阶段自动使用 git diff 等工具确定审查范围
- Analyze 阶段建议使用 reviewer 子代理
- Report 阶段支持 `[APPROVAL_NEEDED]` 自动修复审批

**改进空间**：
- 3 个阶段文件的 agent_end handler 逻辑大量重复（getNextStage → transition → statusline → appendEntry → notify）
- 未使用 develop 的集中式 agent_end 检测（review 自己实现了 stage transition 逻辑）
- 无「逐文件审查进度」追踪
- Report 阶段的 implementer 子代理调用没有明确指引

### 3.9 Todo & Tilldone（⭐⭐⭐⭐☆）— 良好

**文件**：`src/capabilities/todo/index.ts` + `src/capabilities/tilldone/index.ts`（~430 行）

**亮点**：
- Todo 双持久化：session entry（跨 compaction）+ 文件（人类可读）
- Todo 自动同步到 `.pi/craft/plans/{slug}/todos.md`
- Tilldone 强约束：必须先 define 才能写代码
- Tilldone 文件范围检查（只能编辑当前 task 声明的文件）
- 两个 widget 显示进度条和任务列表

**改进空间**：
- Todo 和 Tilldone 有功能重叠（都管理任务状态），可统一为一个系统
- Tilldone 的 Rule 2（文件范围）和 Rule 3（turn 结束检查偏离）目前未严格实现（Rule 3 只在 turn_end 更新 widget，无实际检查）
- Todo 的 persistence 在 compaction 后可能丢失（依赖 session entry 恢复）
- 两个模块各自管理任务 ID，容易冲突

### 3.10 Subagent Widget（⭐⭐⭐☆☆）— 基本实现

**文件**：`src/capabilities/subagent-widget/index.ts`（~180 行）

**亮点**：
- 实时展示子代理 tool call 执行过程
- 支持运行计时（elapsed seconds）
- 完成后 5 秒自动清除
- 通过 steering message 中的 delegation 标记检测子代理模式

**改进空间**：
- 依赖正则匹配 system prompt 来检测 subagent delegation，不够可靠
- Parallel/Chain 模式的支持较简单（只显示摘要，不显示每个子代理详情）
- 与 SubagentManager 无直接集成（通过文本匹配推断）
- tool_call 列表只记录名称 + preview，不记录结果

### 3.11 StatuslineManager — TUI

**文件**：`src/ui/statusline.ts`（~150 行）

**亮点**：
- 5 个独立状态位，简洁清晰
- 工作流阶段有专用图标映射
- Token 显示包含缓存命中率
- LSP server 状态实时更新

**改进空间**：
- bind(ctx) 需要手动调用，容易遗漏
- 无 fallback 主题检测（当 ctx.ui.theme 不可用时）

---

## 4. 技术栈与依赖

| 依赖 | 用途 | 评价 |
|------|------|------|
| `@earendil-works/pi-coding-agent` | pi 扩展 API | 核心依赖 |
| `@earendil-works/pi-tui` | TUI 渲染组件 | 用于仪表盘/markdown/widget |
| `@earendil-works/pi-ai` | AI 消息类型 | 用于类型定义 |
| `@earendil-works/pi-agent-core` | 代理核心类型 | 用于 AgentToolResult |
| `typebox` | 工具参数 schema | 类型安全 + 运行时验证 |
| `yaml` | YAML 解析（Damage Control） | 轻量级选择 |
| `minimatch` | Glob 匹配（Damage Control） | 标准 glob 实现 |

**评价**：依赖精简且合理。无构建工具，通过 jiti 直接加载 TypeScript，保持开发体验轻量。

---

## 5. 设计文档 vs 实现对比

### 5.1 已实现（超出 DESIGN.md 预期）

| 设计文档项 | 实现状态 | 备注 |
|-----------|---------|------|
| WorkflowEngine | ✅ 完整 | 比设计多了 rollback 跳转、文档路径管理 |
| TokenTracker | ✅ 完整 | 超过预期：每日统计、热力图、streak、缓存命中率 |
| SubagentManager | ✅ 完整 | Single 模式创新地使用 steering message 注入 |
| Develop 5 阶段 | ✅ 完整 | 超过设计：自动 slug 生成、卡住检测、auto-continue 限制 |
| Review 3 阶段 | ✅ 完整 | 符合设计 |
| Token Dashboard | ✅ 完整 | 超过设计：双视图（概览/详情）、heatmap |
| Progress Widget | ✅ 完整 | 符合设计 |
| 文档产物管理 | ✅ 完整 | 符合设计 |
| /tokens 命令 + Ctrl+Shift+T | ✅ 完整 | 符合设计 |

### 5.2 已实现（未在设计文档中）

| 功能 | 文件 | 备注 |
|------|------|------|
| LSP Capability | `capabilities/lsp/` | 额外能力 |
| Damage Control | `capabilities/damage-control/` | 额外能力 |
| Workflow Suggester | `capabilities/workflow-suggester/` | 额外能力 |
| Todo Capability | `capabilities/todo/` | 额外能力 |
| Tilldone Capability | `capabilities/tilldone/` | 额外能力 |
| Subagent Widget | `capabilities/subagent-widget/` | 额外能力 |
| Safety Interlocks (sudo/kill/docker) | `src/index.ts` | 硬编码安全拦截 |
| Sensitive File Protection | `src/index.ts` | 硬编码文件保护 |
| start_coding_workflow Tool | `scenarios/coding/index.ts` | LLM 可自动触发工作流 |

### 5.3 未实现（设计文档中有提及）

| 设计文档项 | 状态 | 说明 |
|-----------|------|------|
| Provider 优化器 | ❌ 未实现 | DESIGN.md §3.4：请求缓存、去重、重试、路由 |
| Agent Team | ❌ 未实现 | docs/future-capabilities-design.md §4：多代理分发编排 |
| MCP 集成 | ❌ 未实现 | docs/future-capabilities-design.md §8：Model Context Protocol |
| Web Fetch Capability | ❌ 未实现 | config 中有 enableWebFetch 字段但无实现 |
| stock/travel/knowledge 场景 | ❌ 未实现 | docs/refactor-scenario-plugins.md 中的占位场景 |

---

## 6. 代码质量评估

### 6.1 优势

| 方面 | 评价 | 例证 |
|------|------|------|
| 模块化设计 | ⭐⭐⭐⭐⭐ | Core/Capability/Scenario 三层分离，每个独立可加载 |
| 类型安全 | ⭐⭐⭐⭐⭐ | 全面使用 TypeScript，接口定义清晰 |
| 错误处理 | ⭐⭐⭐⭐ | fail-open 原则，异常不崩溃（Damage Control、LSP） |
| 可配置性 | ⭐⭐⭐⭐ | config 体系完善，default-on/off 合理 |
| 文档质量 | ⭐⭐⭐⭐ | AGENTS.md + DESIGN.md + README + 多份详细 design doc |
| 持久化设计 | ⭐⭐⭐⭐ | 多入口持久化（token/workflow/todo），跨 compaction 恢复 |
| 安全设计 | ⭐⭐⭐⭐⭐ | 纵深防御（CWD Guard → Safety Interlocks → Damage Control → Tilldone） |
| 事件处理 | ⭐⭐⭐⭐ | 充分利用 pi 事件系统（8+ 种事件类型） |

### 6.2 待改进方面

| 方面 | 问题 | 严重度 |
|------|------|--------|
| 代码重复 | Review 阶段的 agent_end handler 三重重复 | 🟡 中 |
| 代码重复 | Stage 文件中的 prompt 常量定义重复 | 🟡 中 |
| 单一文件过大 | `src/scenarios/coding/index.ts` ~500 行 | 🟡 中 |
| 未完成的重构 | `workflows/` 改名为 `scenarios/` 后的遗留 | 🔵 低 |
| 测试覆盖 | 仅 damage-control 有单元测试 | 🔴 高 |
| 硬编码字符串 | 大量 `[STAGE_COMPLETE]`/`[APPROVAL_NEEDED]` 散布各处 | 🟡 中 |
| SubagentWidget 检测 | 通过正则匹配 system prompt 推断 subagent 模式 | 🟡 中 |

---

## 7. 问题与风险

### 7.1 架构层面

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | `[STAGE_COMPLETE]` 基于 LLM 输出文本匹配，LLM 可能不输出此标记 | 阶段无法自动推进，用户困惑 | 增加备选检测机制（如检测文档是否已写入） |
| 2 | Single subagent 模式通过 `sendMessage` 注入，依赖 pi 框架的 `deliverAs: "steer"` 行为 | 框架行为变更可能导致功能异常 | 与 pi 框架团队确认此 API 的稳定性 |
| 3 | `globalThis` 共享状态在 jiti 模块隔离下的可靠性 | 不同扩展入口可能无法共享 | 已验证可行（registry 注释中说明了原因），但需文档化 |
| 4 | 事件 handler 注册顺序依赖 `pi.extensions` 数组顺序 | 隐式依赖，难以调试 | 添加顺序文档说明 |

### 7.2 功能层面

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 5 | 实现阶段 `autoContinueCounts` 存在内存泄漏风险（Map 按 state.id 存储但仅在 complete 时 delete） | 多次 abort+restart 后 Map 可能积累 | 添加 abort 时清理，或使用 WeakMap |
| 6 | `detectProjectLanguages` 每次 session 都遍历目录树 | 大项目启动延迟 | 缓存检测结果或增量检测 |
| 7 | Token dashboard heatmap 渲染依赖 `dailyStats` 在内存中 | 跨天数据可能不完整 | 从 persistence 恢复时也恢复 dailyStats |
| 8 | CWD Guard 的 bash write 模式 `\b(mkdir|touch|rm\s|...)\b` 匹配不完整 | `install`、`rsync` 等命令可能绕过 | 扩展模式列表 |

### 7.3 UX 层面

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 9 | Coding workflow 启动需要用户先输入需求 → LLM 生成 slug → 再开始 | 3 步交互，而非 1 步 | 合并为一步，slug 在后台生成 |
| 10 | 实现阶段 auto-continue 时 UI 无「当前处于第 N 轮」的明确提示 | 用户不知道系统在自动推进 | 在 statusline 或 widget 中显示进度 |
| 11 | 错误/异常时用户收到的反馈不够友好 | 技术性错误信息直接暴露 | 包装错误信息为面向用户的提示 |

---

## 8. 优化建议

### 8.1 短期优化（1-3 天）

#### 8.1.1 消除代码重复

```typescript
// 🟡 当前：3 个文件几乎相同的代码
// scope.ts, analyze.ts, report.ts 的 agent_end handler 重复

// ✅ 建议：提取公共函数到 flow.ts
export function handleStageComplete(
  rc: ReviewContext,
  stage: WorkflowStage,
  messages: Message[],
): void {
  const lastText = extractLastAssistantText(messages);
  if (!lastText.includes("[STAGE_COMPLETE]")) return;

  const next = getNextStage(stage);
  if (next) {
    rc.engine.transition(next);
    rc.statusline.updateWorkflow("coding", next);
    rc.pi.appendEntry("craft-workflow-state", rc.engine.toPersistenceEntry().data);
    rc.ctx.ui.notify(`✅ Review → ${next}`, "info");
  } else {
    rc.engine.transition("completed");
    rc.statusline.updateWorkflow("coding", "completed");
    rc.pi.appendEntry("craft-workflow-state", rc.engine.toPersistenceEntry().data);
    rc.ctx.ui.setWidget("craft-progress", undefined);
    rc.ctx.ui.notify("✅ Code review completed!", "success");
  }
}
```

#### 8.1.2 提取 Magic String 常量

```typescript
// 🟡 当前："[STAGE_COMPLETE]" 散布在 6+ 个文件中
// ✅ 建议：定义常量
export const MARKERS = {
  STAGE_COMPLETE: "[STAGE_COMPLETE]",
  APPROVAL_NEEDED: "[APPROVAL_NEEDED]",
} as const;
```

#### 8.1.3 添加核心模块单元测试

- TokenTracker: 测试 recordUsage/fromPersistenceData/getCacheHitRate
- WorkflowEngine: 测试 create/transition/rollback/persistence
- CWD Guard: 测试各种路径和命令模式

### 8.2 中期优化（1-2 周）

#### 8.2.1 实现 Provider 优化器

DESIGN.md §3.4 中有完整设计：
- 请求缓存（LRU 内存缓存，基于请求指纹）
- 请求去重（inflight map）
- 请求重试（429/5xx exponential backoff）
- Provider 路由（根据任务复杂度路由到不同模型）

预计工时：~10h

#### 8.2.2 统一 Todo/Tilldone 为 TaskManager

当前 Todo 和 Tilldone 有功能重叠（都管理任务列表），建议合并：

```
TaskManager
├── Todo     （松散模式：LLM 自行管理）
└── Tilldone （严格模式：强制定义 → 执行 → 验证）
```

预计工时：~8h

#### 8.2.3 LSP 批量诊断

实现一次调用诊断多个文件：

```typescript
lsp({ action: "diagnostics", path: ["src/auth.ts", "src/models/user.ts"] })
```

预计工时：~3h

#### 8.2.4 添加阶段完成检测的备选方案

除了文本匹配 `[STAGE_COMPLETE]`，增加：
1. 检测目标文档是否已被写入
2. 检测文档内容的长度和结构完整性
3. 在 prompt 中强化标记输出的指令

预计工时：~4h

### 8.3 长期改进（1 月+）

#### 8.3.1 Agent Team 实现

参见 `docs/future-capabilities-design.md` §4：
- 动态 dispatch 替代一次性声明
- 主 Agent 持续活跃：分解、分派、审查、决策
- TUI Grid 仪表盘 + 实时进度
- 文件锁避免并发冲突

预计工时：~18h

#### 8.3.2 MCP 集成

参见 `docs/future-capabilities-design.md` §8：
- JSON-RPC client for MCP
- 自动发现并注册 MCP server 工具
- Stdio transport 支持

预计工时：~11h

#### 8.3.3 工作流可视化

- 将工作流文档输出为结构化 JSON
- 生成流程图（Mermaid/svg）
- 支持 CI/CD 集成（通过 API 触发工作流）

#### 8.3.4 多场景扩展

实现 DESIGN.md 中规划的 stock/travel/knowledge 场景。每个只需实现 `WorkflowHandler` 接口。

---

## 9. 改进方向

### 9.1 代码组织

| 方向 | 具体建议 |
|------|---------|
| 拆分大文件 | `src/scenarios/coding/index.ts` 拆分为 command-handlers、slug-generator、resume-builder 等子模块 |
| 统一事件处理模式 | Review 的 agent_end 应复用 develop 的集中式检测逻辑 |
| 添加 barrel exports | 每个 capability 目录应有 `index.ts` 统一导出 |

### 9.2 健壮性

| 方向 | 具体建议 |
|------|---------|
| 增加重试机制 | Subagent spawn 失败、LSP server crash、Persist 失败 |
| 添加健康检查 | LSP server 心跳检测、Subagent 进程存活检测 |
| 增加降级策略 | Token 持久化失败 → 内存备份，CWD Guard 解析失败 → fail open |

### 9.3 用户体验

| 方向 | 具体建议 |
|------|---------|
| 减少交互步骤 | Coding workflow 启动 → 一步完成（需求 + slug 生成） |
| 增加进度可视化 | Implementation 阶段显示「Task 3/7 · 第 2/5 轮」 |
| 友好的错误信息 | 将技术错误包装为面向用户的中文提示 |
| 添加 /help 命令 | 列出所有可用命令和快捷键 |

### 9.4 可观测性

| 方向 | 具体建议 |
|------|---------|
| 结构化日志 | Damage Control 匹配日志、Subagent 执行日志 |
| 代理发现报告 | 启动时打印加载了哪些代理（名称 + 来源） |
| 性能指标 | LSP server 响应时间、Subagent 执行时长 |

### 9.5 安全性增强

| 方向 | 具体建议 |
|------|---------|
| 规则模板库 | 提供更多预置安全规则（OWASP Top 10 相关） |
| 规则热重载 | `/reload` 时重新加载 Damage Control 规则 |
| 审计日志 | 记录被拦截的操作（时间、工具、参数、规则） |

---

## 10. 总结评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | ⭐⭐⭐⭐⭐ 9/10 | 扩展式插件架构、三层分离、事件驱动，整体设计优秀 |
| 代码质量 | ⭐⭐⭐⭐ 7.5/10 | TypeScript 全面、类型安全，但存在代码重复和部分文件过大 |
| 功能完整性 | ⭐⭐⭐⭐ 8/10 | 核心工作流 + 安全 + LSP + 任务管理完整；Provider 优化/Agent Team/MCP 未实现 |
| 文档质量 | ⭐⭐⭐⭐⭐ 9/10 | DESIGN.md + 多份详细 sub-doc + 代码注释，文档非常完善 |
| 用户体验 | ⭐⭐⭐⭐ 7.5/10 | TUI 体验好（dashboard/widget/statusline）；但交互步骤偏多，启动流程较长 |
| 安全性 | ⭐⭐⭐⭐⭐ 9/10 | 纵深防御（4 层拦截），fail-open 设计，可扩展规则引擎 |
| 可扩展性 | ⭐⭐⭐⭐ 8/10 | 添加新场景/能力只需实现接口，但新增能力需要改 package.json |
| 测试覆盖 | ⭐⭐ 3/10 | 仅 Damage Control 有测试，核心模块（WorkflowEngine/TokenTracker/Subagent）均无测试 |
| **综合** | **⭐⭐⭐⭐ 7.6/10** | 一个设计良好、功能丰富的 LLM 辅助开发工作流引擎，核心体验优秀 |

### 一句话总结

Pi Craft 是目前 pi 生态中设计最完整、功能最丰富的扩展包。它以工作流引擎为核心，将 LLM 辅助编程从「对话式编码」升级为「结构化工程流程」。三层架构（Core + Capabilities + Scenarios）设计合理，安全纵深防御体系完善，Token 追踪细腻。主要提升空间在于：消除代码重复、增加测试覆盖、完成设计文档中规划但未实现的 Provider 优化器和 Agent Team 等高级功能。

---

*本文档由 pi-craft 项目代码分析生成，涵盖 src/ 下所有 40+ 源文件、4 份设计文档、4 个代理定义文件和 2 个 prompt 模板。*

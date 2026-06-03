# Pi Craft

Pi Coding Agent 扩展 — 技能驱动开发工作流 + 可插拔 Capabilities。

## 架构

```
pi-craft/
├── src/
│   ├── index.ts                      # Core — TokenTracker / Subagent / Statusline / CWD Guard
│   ├── core/                         # 共享基础设施
│   │   ├── config.ts                 # CraftConfig 类型 + getCraftConfig()
│   │   ├── registry.ts               # globalThis 跨扩展单例（含 resetTodo 回调）
│   │   ├── workflow-types.ts         # 工作流元数据类型（轻量，无状态机）
│   │   ├── token-tracker.ts          # Token 用量 + 缓存命中率 + toExportJSON()
│   │   ├── subagent-manager.ts       # 子代理发现 + 生命周期
│   │   ├── subagent-tool.ts          # subagent 工具 + TUI
│   │   └── cwd-guard.ts              # 写操作边界管控
│   ├── ui/                           # TUI 渲染
│   │   ├── statusline.ts             # 增强状态栏
│   │   ├── token-dashboard.ts        # /tokens 全屏仪表盘
│   │   └── components/
│   │       └── workflow-progress.ts  # 阶段进度条 widget
│   ├── capabilities/                 # 可插拔能力模块
│   │   ├── lsp/                      # 语言服务器诊断
│   │   ├── damage-control/           # YAML 安全规则引擎
│   │   ├── workflow-suggester/       # 开发意图检测 + 主动建议
│   │   ├── subagent-widget/          # 子代理进度实时 TUI widget
│   │   ├── todo/                     # 持久化任务列表 + clear action
│   │   └── tilldone/                 # 任务纪律系统（严格模式，默认关闭）
│   └── scenarios/
│       └── coding/                   # Coding 场景（2 个工具 + 会话持久化）
│           ├── agents/               # 内置子代理 (scout/architect/implementer/reviewer)
│           └── prompts/              # Prompt 模板
└── skills/                           # 阶段技能（.md，LLM 按需加载）
    ├── coding-workflow/              # 工作流编排器
    ├── coding-stage-code-analysis/   # 代码分析
    ├── coding-stage-requirement/     # 需求澄清
    ├── coding-stage-design/          # 架构设计
    ├── coding-stage-testing/         # 测试策略
    └── coding-stage-implementation/  # 实现编码
```

## 工作流 — 技能驱动

工作流不再由代码状态机硬推，而是 LLM 自主决策阶段推进：

1. LLM 调用 `init_workflow(topic, requirement)` → 创建 `.pi/craft/plans/{date}-{topic}/`
2. `init_workflow` 自动加载 `/skill:stage-code-analysis`
3. 每个阶段完成后，LLM 调用 `complete_stage(next_stage, output_file)`
4. `complete_stage` 验证产物（gating）→ 持久化元数据 → 标记 session tree → 自动加载下一个阶段技能
5. 工作流 `done` 时自动清空 todo 列表

### 阶段流水线

| # | 技能 | 产物 | 
|---|------|------|
| 1 | `/skill:stage-code-analysis` | `code-analysis.md` |
| 2 | `/skill:stage-requirement` | `requirement.md` |
| 3 | `/skill:stage-design` | `design.md` |
| 4 | `/skill:stage-testing` | `testing-plan.md` |
| 5 | `/skill:stage-implementation` | 代码变更 + 任务跟踪 |

每个阶段技能也可独立使用，无需完整工作流。

### 导航与恢复

| 操作 | 方法 |
|------|------|
| 查看阶段标记 | `/tree` → 每个阶段完成有 `📌 stage:xxx` 标签 |
| 回退到某个阶段 | `/branch <id>` 跳转到该标签的 session 节点 |
| 恢复中断的工作流 | 重开会话自动检测并提示加载当前阶段技能（`done` 阶段不提示） |
| Compaction 保护 | `session_before_compact` 钩子保留工作流上下文 |
| 元数据查询 | `getMeta(ctx)` 倒序取最后一条记录，避免取到过期状态 |

## Capabilities

每个 Capability 独立加载，通过 `settings.json` 控制：

| Capability | 开关 | 说明 |
|-----------|------|------|
| LSP | `enableLsp` | 语言服务器诊断（TypeScript/Go/Rust/Python），自动检测项目语言 |
| Damage Control | `enableDamageControl` | YAML 安全规则引擎，两层规则（全局 + 项目），支持 block/confirm/warn |
| Workflow Suggester | `enableWorkflowSuggester` | 自动检测开发意图（中/英文），主动建议进入 coding workflow |
| Subagent Widget | `enableSubagentWidget` | 子代理执行进度实时 TUI widget（工具调用、状态、完成通知） |
| Todo | `enableTodo` | 持久化任务列表，跨 `/reload` 和 compaction；工作流 done 自动清空；支持 `clear` action |
| Tilldone | `enableTilldone` | 任务纪律系统 — 必须先定义任务才能写代码，仅允许编辑活跃任务声明的文件（默认关闭） |

## 命令与快捷键

| 命令 | 说明 |
|------|------|
| `/tokens` | Token 用量全屏仪表盘（Tab 切换概览/详情） |
| `/tokens --export` | 导出完整 token 统计为 JSON 到 `.pi/craft/tokens-{datetime}.json` |
| `/coding:status` | 查看当前工作流状态 |
| `Ctrl+Shift+T` | Token 快速摘要弹出 |

## 工具

Coding 场景注册的 LLM 可调用工具：

| 工具 | 说明 |
|------|------|
| `init_workflow(topic, requirement)` | 创建 plans 目录、设置 session 名称、记录需求、自动加载第一个阶段技能 |
| `complete_stage(next_stage, output_file)` | 验证产物（gating，拒绝 stub）、持久化元数据、标记 session tree、自动加载下一个技能；done 时自动清 todo |

### 产物 Gating

`complete_stage` 对产物做最小验证：
- 文件大小 < 80 bytes → 拒绝
- 有效行（长度 > 20）< 2 行 → 拒绝（stub）

## 配置

`settings.json` 的 `craft` 字段：

| 配置 | 默认 | 说明 |
|------|------|------|
| `enableSubagent` | `true` | 子代理系统开关 |
| `enableParallelSubagent` | `false` | 并行子代理（独立进程） |
| `enableCwdGuard` | `true` | 限制写/编辑/bash 写操作在项目工作目录内 |
| `enableLsp` | `true` | LSP 语言服务器诊断 |
| `enableDamageControl` | `true` | YAML 安全规则引擎 |
| `enableWorkflowSuggester` | `true` | 自动检测开发意图并建议 workflow |
| `enableSubagentWidget` | `true` | 子代理进度 widget |
| `enableTodo` | `true` | 任务列表持久化 |
| `enableTilldone` | `false` | 严格任务纪律（opt-in） |

### Damage Control 配置

```jsonc
{
  "craft": {
    "damageControl": {
      "rules": ".pi/my-rules.yaml",
      "promptMode": "auto-deny"            // confirm / auto-deny / auto-allow
    }
  }
}
```

## 安装

```bash
# 本地开发（热重载）
cd ~/Workspace/p/code/pi-craft
pi -e .

# 本地安装（全局生效）
pi install /path/to/pi-craft
```

## 开发

```bash
# 本地加载
pi -e .
/reload     # 热重载
```

### 添加新阶段

1. 在 `skills/coding-stage-<name>/SKILL.md` 创建技能文件
2. 在工作流编排器 `skills/coding-workflow/SKILL.md` 中注册 stage
3. 无需修改扩展代码

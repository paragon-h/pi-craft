# Pi Craft

Pi Coding Agent 扩展 — 场景化开发工作流 + 可插拔 Capabilities。

## 架构

```
src/
├── index.ts                      # Core — TokenTracker / Subagent / Statusline / CWD Guard
├── core/                         # 共享基础设施
│   ├── config.ts                 # CraftConfig 类型 + getCraftConfig()
│   ├── registry.ts               # globalThis 跨扩展单例
│   ├── workflow-engine.ts        # 多阶段状态机 + 持久化
│   ├── token-tracker.ts          # Token 用量 + 缓存命中率
│   ├── subagent-manager.ts       # 子代理发现 + 生命周期
│   ├── subagent-tool.ts          # subagent 工具 + TUI
│   └── cwd-guard.ts              # 写操作边界管控
├── ui/                           # TUI 渲染
│   ├── statusline.ts             # 增强状态栏
│   ├── token-dashboard.ts        # /tokens 全屏仪表盘
│   └── components/
│       └── workflow-progress.ts  # 阶段进度条 widget
├── capabilities/                 # 可插拔能力模块
│   ├── lsp/                      # 语言服务器诊断
│   ├── damage-control/           # YAML 安全规则引擎
│   └── workflow-suggester/       # 开发意图检测 + 主动建议
└── scenarios/
    └── coding/                   # Coding 场景
        ├── develop/              # 开发子场景（5 个阶段）
        ├── review/               # 审查子场景（3 个阶段）
        ├── agents/               # 内置子代理 (scout/architect/implementer/reviewer)
        └── prompts/              # Prompt 模板
```

## Capabilities

每个 Capability 独立加载，通过 `settings.json` 控制：

| Capability | 开关 | 说明 |
|-----------|------|------|
| LSP | `enableLsp` | 语言服务器诊断（TypeScript/Go/Rust/Python），自动检测项目语言 |
| Damage Control | `enableDamageControl` | YAML 安全规则引擎，两层规则（全局 + 项目），支持 block/confirm/warn |
| Workflow Suggester | `enableWorkflowSuggester` | 自动检测开发意图，主动建议进入 coding workflow |

## 命令

| 命令 | 说明 |
|------|------|
| `/coding:develop [stage]` | 进入开发模式（可选直达 code_analysis/design/testing/implementation） |
| `/coding:review [target] [stage]` | 启动代码审查（可选直达 analyze/report） |
| `/coding:status` | 查看工作流状态 |
| `/coding:resume` | 恢复中断的工作流（自动注入上下文摘要） |
| `/coding:rollback [stage]` | 回退到指定阶段（`/coding:rollback design`） |
| `/coding:abort` | 终止工作流 |
| `/tokens` | Token 仪表盘 |
| `Ctrl+Shift+T` | Token 快速摘要 |

## Develop 流程

### 🔍 Code Analysis
AI 根据需求分析项目结构 → `code-analysis.md`

### 📋 Requirement
AI 逐个提问澄清需求 → `requirement.md`

### 🎨 Design
调用 architect 子代理设计架构 → `design.md`

### 🧪 Testing
选择测试策略 + 实现审批模式（auto / per_task / on_demand） → `testing-plan.md`

### ⚡ Implementation
生成任务列表，逐项实现。支持三种模式：全自动、逐任务审批、按需审批。
5 轮自动推进上限 + 卡住检测（自动暂停）。

## Review 流程

### 🔬 Scope → 🔎 Analyze → 📊 Report
确定范围 → 审查分析 → 生成报告 + 可选自动修复。

## 配置

`settings.json` 的 `craft` 字段：

| 配置 | 默认 | 说明 |
|------|------|------|
| `enableSubagent` | `true` | 子代理系统开关 |
| `enableParallelSubagent` | `false` | 并行子代理（独立进程） |
| `enableCwdGuard` | `true` | 限制写操作在工作目录内 |
| `enableLsp` | `true` | LSP 语言服务器诊断 |
| `enableDamageControl` | `true` | YAML 安全规则引擎 |
| `enableWorkflowSuggester` | `true` | 自动检测开发意图并建议 workflow |

### Damage Control 配置

```jsonc
{
  "craft": {
    "damageControl": {
      "rules": ".pi/my-rules.yaml",        // 项目级规则文件（默认 .pi/damage-control-rules.yaml）
      "promptMode": "auto-deny"            // confirm 行为: confirm / auto-deny / auto-allow
    }
  }
}
```

## 安装

```bash
# 本地开发
pi -e ~/Workspace/p/code/pi-craft

# 本地安装
pi install /path/to/pi-craft
```

## 开发

```bash
# 本地加载 + 热重载
pi -e .
/reload
```

# Pi Craft

Pi Coding Agent 扩展 — 场景化开发工作流：多阶段 develop + review，子代理系统，Token 追踪，安全管控。

## 架构

```
src/
├── index.ts                # Core — TokenTracker / Subagent / Statusline / CWD Guard
├── core/                   # 纯逻辑
├── ui/                     # TUI 渲染
└── scenarios/
    └── coding/             # Coding 场景
        ├── develop/        # 开发子场景（5 个阶段）
        └── review/         # 审查子场景（3 个阶段）
```

Core 永远加载，Scenarios 按需启用。`package.json` 控制：

```json
{
  "pi": {
    "extensions": [
      "./src/index.ts",
      "./src/scenarios/coding/index.ts"
    ]
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

## 命令

| 命令 | 说明 |
|------|------|
| `/coding:develop [stage]` | 进入开发模式（可选直达 design/testing/implementation） |
| `/coding:review [target] [stage]` | 启动代码审查（可选直达 analyze/report） |
| `/coding:status` | 查看工作流状态 |
| `/coding:resume` | 恢复中断的工作流 |
| `/coding:rollback` | 回退到上一阶段 |
| `/coding:abort` | 终止工作流 |
| `/tokens` | Token 仪表盘 |
| `Ctrl+Shift+T` | Token 快速摘要 |

## 快速开始

```bash
# 进入开发模式
/coding:develop

# 输入需求，AI 自动生成 slug → 进入 🔍 Code Analysis
实现用户登录功能，支持 JWT token 认证

# 或直接跳到设计阶段
/coding:develop design

# 代码审查
/coding:review
```

## Develop 流程

### 🔍 Code Analysis
AI 自动分析项目结构 → `code-analysis.md`

### 📋 Requirement
AI 逐个提问澄清需求 → `requirement.md`

### 🎨 Design
调用 architect 子代理设计架构 → `design.md`

### 🧪 Testing
选择测试策略 → `testing-plan.md`

### ⚡ Implementation
生成任务列表，逐项实现。`[APPROVAL_NEEDED]` 时弹确认框。

阶段间自动推进（`[STAGE_COMPLETE]`），可在状态栏看到进度条 widget。

## Review 流程

### 🔬 Scope → 🔎 Analyze → 📊 Report
确定范围 → 并行 reviewer 审查 → 生成报告 + 可选自动修复。

## 配置

`settings.json` 的 `craft` 字段：

| 配置 | 默认 | 说明 |
|------|------|------|
| `enableSubagent` | `true` | 子代理系统开关 |
| `enableParallelSubagent` | `false` | 并行子代理（独立进程） |
| `enableCwdGuard` | `true` | 限制写操作在工作目录内 |

## 开发

```bash
# 本地加载
pi -e .

# 修改后热重载
/reload
```

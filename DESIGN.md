# Pi Craft — 设计文档

## 1. 概述

Pi Craft 是一个 Pi Coding Agent 扩展包，提供自动化的技能驱动开发工作流和可插拔能力模块。当前首发 Coding 场景，架构预留了多场景扩展能力。

### 核心原则

| 原则 | 说明 |
|------|------|
| **LLM 驱动，非代码驱动** | 工作流推进由 LLM 自主决策，扩展只提供工具和门控，不包含状态机 |
| **产物落盘** | 所有设计文档存储在 `.pi/craft/plans/{date}-{topic}/`，Markdown 格式 |
| **最小门控** | `complete_stage` 仅验证产物合法性（拒绝 stub），不评审内容质量 |
| **模块可插拔** | 每个 Capability 独立加载，通过 `settings.json` 开关控制 |

---

## 2. 架构

```
src/
├── index.ts                         # Core Extension — 始终加载
│                                    #   TokenTracker, SubagentManager, CWD Guard, 安全护栏
├── core/
│   ├── config.ts                    # CraftConfig 类型 + 缓存配置读取
│   ├── registry.ts                  # globalThis 跨扩展单例（含 resetTodo 回调）
│   ├── workflow-types.ts            # 工作流元数据类型（轻量，无状态机）
│   ├── token-tracker.ts             # Token 用量 + 缓存命中率 + toExportJSON()
│   ├── token-dashboard.ts           # /tokens 全屏仪表盘 + --export
│   ├── subagent-manager.ts          # 子代理发现、spawn、执行
│   ├── subagent-tool.ts             # subagent 工具注册 + TUI 渲染
│   ├── cwd-guard.ts                 # 写操作边界管控
│   ├── statusline.ts                # 增强状态栏
│   └── workflow-progress.ts         # 阶段进度条 widget
├── capabilities/                    # 独立可切换模块
│   ├── lsp/                         # 语言服务器诊断（json-rpc + server-pool）
│   ├── damage-control/              # YAML 安全规则引擎（两层规则，block/confirm/warn）
│   ├── workflow-suggester/          # 开发意图检测 + 主动建议（中/英文）
│   ├── subagent-widget/             # 子代理执行实时 TUI widget
│   ├── todo/                        # 持久化任务列表（跨 /reload 和 compaction）
│   └── tilldone/                    # 严格任务纪律（opt-in，默认关闭）
└── scenarios/
    └── coding/
        ├── index.ts                 # Coding Scenario — init_workflow + complete_stage
        ├── agents/                  # 内置子代理 (scout/architect/implementer/reviewer)
        ├── prompts/                 # Prompt 模板
        └── skills/                  # 阶段技能（LLM 按需加载）
            ├── coding-workflow/SKILL.md
            ├── coding-stage-code-analysis/SKILL.md
            ├── coding-stage-requirement/SKILL.md
            ├── coding-stage-design/SKILL.md
            ├── coding-stage-testing/SKILL.md
            └── coding-stage-implementation/SKILL.md
```

### 扩展加载机制

`package.json` 的 `pi.extensions` 声明所有扩展入口。用户可通过 `settings.json` 选择性启用：

```jsonc
// 工作电脑：仅 Core + Coding
{
  "packages": [{
    "source": "pi-craft",
    "extensions": ["./src/index.ts", "./src/scenarios/coding/index.ts"]
  }]
}
```

所有扩展共享同一个 jiti 模块根，通过 `globalThis` 单例（`registry.ts`）实现跨扩展通信。

---

## 3. 工作流设计

### 为什么不用状态机？

| 状态机方案 | 技能驱动方案（当前） |
|-----------|---------------------|
| 代码定义所有状态转换 | LLM 读取 `.md` 技能文件自主决策 |
| 添加阶段需改代码 | 只需新建 SKILL.md 文件 |
| 严格的阶段顺序 | LLM 可灵活跳过或重排阶段 |
| `/craft rollback` 等命令 | 用 Pi 原生的 `/branch` 回退 |

### 两个工具

| 工具 | 职责 |
|------|------|
| `init_workflow(topic, requirement)` | 创建 plans 目录、设 session 名、记录需求、自动加载 stage-1 技能 |
| `complete_stage(next_stage, output_file)` | 验证产物 → 持久化元数据 → 标记 session tree → 自动加载下一技能 |

### 产物 Gating

`complete_stage` 对产物做最小验证：

- **文件大小 < 80 bytes** → 拒绝（几乎为空）
- **有效行 < 2 行**（长度 > 20 字符的行）→ 拒绝（stub，如 `# TODO`）

这两个阈值足够低，只拦截明显异常的输出，不评审内容质量。质量评审交给 reviewer subagent。

### Session 条目排序

工作流状态通过 `pi.appendEntry` 持久化到 session。读取时**倒序遍历** session 分支，取最后一条匹配条目作为最新状态。追加总是在末尾，所以最后匹配项 = 当前状态。

### 会话恢复

- `session_start`：倒序查找最后一条 workflow meta entry，若 stage ≠ `done` 则提示恢复
- `session_before_compact`：保留当前 workfow 上下文摘要到 compaction 后的 session

### 工作流 → Todo 联动

`registry.ts` 暴露 `resetTodo` 回调，由 Todo capability 注册。工作流 `done` 时调用，自动清空所有任务。

---

## 4. Subagent 系统

### 执行模式

| 模式 | 实现 | 启用 |
|------|------|------|
| Single（内联） | 注入 subagent system prompt 到当前 session | 默认 |
| Parallel / Chain | spawn 独立 `pi` 进程 | `enableParallelSubagent: true` |

Single 模式下，主 agent 在下一轮变成 subagent。Parallel 模式下，每个 subagent 是独立的 `pi --mode json -p --no-session` 进程，通过 stdout JSON 行通信。

### Subagent 加载

`subagent-manager.ts` 扫描 `agents/` 目录下的 `.md` 文件（frontmatter 声明 name/description/tools/model），同时支持项目级和用户级覆盖。

---

## 5. Token 追踪

### 数据流

```
message_end event
  → AssistantMessage.usage (input/output/cacheRead/cacheWrite/cost)
  → TokenTracker.update()
  → 累积统计（按 model/provider/session 维度）
  → pi.appendEntry("token-stats", snapshot)
```

### 导出

`/tokens --export` 调用 `TokenTracker.toExportJSON()` 生成完整统计 JSON，写入 `.pi/craft/tokens-{datetime}.json`。

---

## 6. 安全设计

### CWD Guard

拦截 `write`、`edit`、`bash`（写入模式）工具调用。目标路径必须在 `process.cwd()` 下，否则返回错误。只读工具（read/ls/grep）不受影响。

### 安全护栏

Core extension 在工具调用前检查：

| 检查项 | 示例 |
|--------|------|
| 危险命令 | `sudo`, `kill -9`, `rm -rf /` |
| 敏感文件覆盖 | `~/.ssh/`, `/etc/passwd` |
| Docker 危险操作 | `--privileged`, `--cap-add=ALL` |

### Damage Control

YAML 规则引擎，两层规则叠加：

| 层级 | 路径 | 来源 |
|------|------|------|
| 全局规则 | `~/.pi/damage-control-rules.yaml` | 用户级别 |
| 项目规则 | `.pi/damage-control-rules.yaml` | 项目级别 |

规则支持 `block`、`confirm`、`warn` 三种动作，基于 glob 模式匹配文件路径。

---

## 7. 配置设计

所有特性都有独立开关，便于按场景裁剪：

| 配置 | 默认 | 理由 |
|------|------|------|
| `enableSubagent` | `true` | 核心价值，默认开启 |
| `enableParallelSubagent` | `false` | 需要额外进程管理，按需启用 |
| `enableCwdGuard` | `true` | 安全基线 |
| `enableLsp` | `true` | 无副作用，默认开启 |
| `enableDamageControl` | `true` | 安全基线 |
| `enableWorkflowSuggester` | `true` | 引导用户发现功能 |
| `enableSubagentWidget` | `true` | 提升可观测性 |
| `enableTodo` | `true` | 核心价值 |
| `enableTilldone` | `false` | 严格模式，需用户理解后使用 |

---

## 8. 扩展点

### 添加新阶段

1. 在 `src/scenarios/coding/skills/coding-stage-<name>/SKILL.md` 创建技能文件
2. 在工作流编排器 `coding-workflow/SKILL.md` 中注册 stage pipeline
3. 无需修改任何 `.ts` 代码

### 添加新子代理

在 `src/scenarios/coding/agents/` 下新建 `.md` 文件，frontmatter 声明元信息：

```yaml
---
name: my-agent
description: 自定义代理描述
tools: [read, bash, edit, write]
model: claude-haiku-4-5
---
```

### 添加新 Capability

1. 在 `src/capabilities/<name>/index.ts` 创建扩展入口
2. 在 `package.json` 的 `pi.extensions` 和 `pi.config` 注册
3. 如需跨扩展通信，通过 `registry.ts` 的 `getState()` 获取共享实例

### 添加新场景

场景是 capabilitiy 的超集，包含工具注册、会话钩子、技能文件和子代理。参考 `src/scenarios/coding/` 的结构，在 `src/scenarios/<name>/` 下创建并注册。

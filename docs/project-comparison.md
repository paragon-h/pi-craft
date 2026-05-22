# Pi 扩展项目对比

## 概览

| | rpiv-mono | my-pi | pi-vs-claude-code | pi-craft |
|------|------|------|------|------|
| **Star** | 230 | 19 | 1170 | — |
| **维护者** | Sergii Guslystyi | Scott Spence | Robert Disler | ekko |
| **定位** | 企业级 driver-in-the-loop pipeline | 可组合 Agent 框架/CLI | Claude Code 替代品展示 | 场景化开发工作流 |
| **形态** | 12 个 Pi 插件 monorepo | 独立 CLI + 扩展注册表 | 19 个扩展 + 6 harness | 单 package 多扩展 |
| **核心叙事** | "LLM 产出的代码正确但不 align，需要人来驾驶" | "可重复性：同一份配置在交互/print/JSON/RPC 下行为一致" | "看看 Pi 能不能替代 Claude Code" | "自动化多阶段开发：分析→需求→设计→测试→编码" |

---

## rpiv-mono — 企业级 Pipeline

### 架构

```
packages/
├── rpiv-pi/          # Pipeline 编排引擎
├── rpiv-ask-user-question/  # 结构化问卷（多语言）
├── rpiv-todo/        # 实时任务清单 (survives /reload + compaction)
├── rpiv-advisor/     # 动作前调用更强审查模型做检查
├── rpiv-web-tools/   # web search + fetch（可插拔 provider）
├── rpiv-btw/         # 侧边对话（from Claude Code 习惯）
├── rpiv-args/        # shell-style $1 $ARGUMENTS 占位符展开
├── rpiv-warp/        # Warp 终端通知集成
├── rpiv-i18n/        # 国际化 SDK
├── rpiv-voice/       # 语音输入
├── rpiv-config/      # 共享配置
└── rpiv-site/        # 文档站
```

### 核心思想

**"Driver in the loop"** — LLM 产出的代码能编译通过、能跑测试，但不一定符合团队规范、架构约定、隐式惯例。需要一个有经验的工程师在回路里驾驭，问对的问题、做架构决策、纠正方向偏移。rpiv-pi 就是这套"人在回路"的引擎。

### 亮点

- **ask-user-question** — LLM 不确定时不自己猜，而是弹出结构化的多选问卷给用户
- **todo** — `/reload` 和 compaction 后任务清单仍然存活
- **advisor** — 动作执行前让更强模型（Opus）做一次审查
- **多语言支持** — rpiv-i18n 提供国际化 SDK
- **vs pi-craft**：都是 pipeline/workflow 思路，但 rpiv 更偏"人在回路"的交互模式，pi-craft 更偏"自动推进"的无人值守

---

## my-pi — 可组合 Agent 框架

### 架构

```
my-pi CLI
  ├── MCP 集成 (stdio + HTTP) → 注册为 Pi tools
  ├── LSP 工具 (diagnostics/hover/def/ref/symbol)
  ├── 扩展注册表 (builtin-registry)
  │   ├── 管理器 (enable/disable/import/sync)
  │   ├── prompt-presets (base + additive layers)
  │   ├── guardrails (Svelte/coding 规则)
  │   └── secret redaction
  ├── SQLite 遥测 (eval + token + session 统计)
  └── 多种运行模式: interactive / print / JSON / RPC / SDK
```

### 核心思想

**"可重复性"** — 同一个配置在交互、print、JSON、RPC 模式下行为完全一致。面向 eval 运行的 agent harness。

### 亮点

- **MCP 支持** — 从 `mcp.json` 自动发现并注册 MCP server tools
- **LSP 集成** — diagnostics、hover、definitions、references、symbols 全有
- **扩展注册表** — 统一管理所有扩展的启用/禁用/同步
- **Secret redaction** — API key 等敏感信息在传给模型前自动打码
- **SQLite 遥测** — 本地持久化的 token 和 eval 数据
- **vs pi-craft**：my-pi 是"瑞士军刀"式的全能框架（MCP/LSP/遥测/注册表），pi-craft 是"专精"式的场景工作流。my-pi 的功能广度远超 pi-craft，但缺少状态机和持久化的工作流引擎

---

## pi-vs-claude-code — Claude Code 替代品

### 架构

19 个独立的 `.ts` 扩展 + 6 个预制 harness（组合不同扩展）：

```
extensions/
├── pure-focus.ts          # 纯专注模式（去 footer/statusline）
├── minimal.ts             # 极简 footer（模型名 + 上下文用量条）
├── cross-agent.ts         # 跨 Agent 目录扫描（.claude/ .gemini/ .codex/）
├── purpose-gate.ts        # 启动时要求声明 session 意图
├── tool-counter.ts        # 实时工具调用统计 + token/cost
├── subagent-widget.ts     # /sub <task> 后台子代理 + 流式进度 widget
├── tilldone.ts            # 任务管理系统（定义→执行→完成追踪）
├── agent-team.ts          # dispatcher-only 编排器（dispatch_agent 网格面板）
├── agent-chain.ts         # 串行 pipeline（前一步输出 → 下一步 prompt）
├── system-select.ts       # /system 切换 agent persona
├── damage-control.ts      # 安全规则引擎（YAML rules）
├── damage-control-continue.ts # 同上，但 blocked 时返回反馈继续而非中止
├── pi-pi.ts               # Meta-agent（用并行研究员构建 Pi agent）
├── coms.ts                # 同机 Pi 进程间通信（Unix socket）
├── coms-net.ts            # 跨机 Pi 通信（HTTP/SSE hub）
├── session-replay.ts      # 会话历史回放时间线
└── theme-cycler.ts        # 主题切换
```

### 核心思想

**"Pi 能做到 Claude Code 的程度吗？"** — 每个扩展都是 Claude Code 某个特性的对标实现。从 UI 定制到 agent 编排到安全审计到进程间通信，系统性地覆盖。

### 亮点

- **agent-team** — dispatcher 模式：主 agent 完全不干活，只做分发。对 pi-craft 很有参考价值
- **damage-control** — YAML 规则引擎，比 pi-craft 的硬编码模式更灵活
- **tilldone** — 任务系统，pi-craft 的 implementation 阶段可以考虑参考
- **Pi-to-Pi 通信** — coms/coms-net，真正的多 agent 协作
- **subagent-widget** — 每个子代理有独立的流式进度 widget，pi-craft 可以借鉴
- **vs pi-craft**：pi-vs-claude-code 是"展示你能做的事"的扩展合集，pi-craft 是"做好一件事"的工作流引擎。pi-vs-claude-code 的 agent-team/dispatch 模式是 pi-craft 并行子代理的未来方向

---

## 汇总：你应该从每个项目学什么

| 从... | 学... | 用于 pi-craft |
|------|------|------|
| **rpiv-mono** | ask-user-question（问卷式交互） | requirement 阶段改进：多选代替自由回答 |
| | todo（持久化任务清单） | implementation 阶段的 live task widget |
| | advisor（审查模型 gating） | 关键变更前先让 reviewer 看一眼 |
| **my-pi** | LSP tools（diagnostics/hover） | implementation 阶段每完成一个 task 自动检查 |
| | prompt-presets（多层叠加） | stage prompt 的可组合配置 |
| | secret redaction | 安全增强 |
| **pi-vs-claude-code** | agent-team（dispatch 编排） | 并行实现：dispatcher 分发给 implementer 池 |
| | damage-control（YAML rules） | guard 规则可配置化 |
| | tilldone（任务系统） | implementation 阶段的 task 追踪改进 |
| | subagent-widget（流式进度） | TUI 展示增强 |

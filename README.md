# Pi Craft

基于 Pi Coding Agent 的自动化开发工作流扩展。Mono-Repo 架构，首发 Coding 场景（develop + review），后续可扩展至股票分析、旅游规划等场景。

## 安装

### 方式 1：本地安装（开发/测试）

```bash
# 直接加载（无需安装）
pi -e ./src/index.ts

# 或全局安装到 Pi 扩展目录
ln -sf "$(pwd)/src" ~/.pi/agent/extensions/pi-craft

# 项目级安装
ln -sf "$(pwd)/src" .pi/extensions/pi-craft
```

### 方式 2：Git 安装

```bash
# 安装 git 仓库（不带版本固定则自动更新）
pi install git:github.com/user/pi-craft

# 固定版本
pi install git:github.com/user/pi-craft@v1.0.0

# 项目级安装（写入 .pi/settings.json，团队共享）
pi install -l git:github.com/user/pi-craft
```

### 方式 3：本地路径安装

```bash
# 绝对路径
pi install /Users/you/Workspace/pi-craft

# 相对路径（项目级）
pi install -l ./packages/pi-craft
```

### 首次运行

首次加载会自动弹出场景选择器，或手动编辑 `~/.pi/agent/settings.json`：

```json
{
  "craft": {
    "enabledScenarios": ["coding"],
    "disabledScenarios": ["stock", "travel", "knowledge"]
  }
}
```

## 快速开始

```bash
# 启动一个完整开发流程
/craft coding "实现用户登录功能，支持 JWT token 认证" user-login

# 代码审查
/craft review

# 查看 Token 消耗
/tokens
```

## 使用方式

### 命令一览

| 命令 | 说明 |
|------|------|
| `/craft coding <需求> [topic-slug]` | 启动全流程开发 |
| `/craft review [target] [topic-slug]` | 启动代码审查 |
| `/craft status` | 查看当前工作流状态 |
| `/craft resume` | 恢复上次未完成的工作流 |
| `/craft rollback` | 回退到上一阶段 |
| `/craft abort` | 中止工作流（保留文档） |
| `/craft scenarios` | 查看可用场景 |
| `/tokens` | Token 消耗仪表盘 |
| `Ctrl+Shift+T` | 快速 Token 摘要 |

### Develop 流程详解

```
/craft coding "需求描述" [topic-slug]
```

#### 阶段 1：🔍 Code Analysis（自动）

系统自动分析项目结构，产出 `code-analysis.md`。

**你在做什么：** 什么都不用做，AI 自动分析并写入报告。

**验证：**
```bash
cat .pi/craft/plans/2026-05-19-user-login/code-analysis.md
```

**验证内容：**
- 是否包含项目技术栈概述
- 是否包含目录结构概要
- 是否包含与需求相关的现有模块
- 是否标注了影响范围

→ AI 输出 `[STAGE_COMPLETE]` 后自动进入下一阶段

---

#### 阶段 2：📋 Requirement Clarification（一问一答）

AI 逐个提问，每次 1 个问题 + 2-4 个推荐选项。

**你在做什么：** 回答 AI 的问题，每次只回答 1 个。

**示例对话：**
```
🤖 Q1: 登录方式支持哪些？
    A. 邮箱+密码
    B. 手机号+验证码
    C. 邮箱+密码 + 手机号+验证码
    D. 以上 + 第三方登录 (OAuth)

👤 C

🤖 Q2: Token 过期策略？
    A. 固定 24 小时
    B. 滑动过期（每次请求刷新）
    C. Access Token 30min + Refresh Token 7 天
    D. 永不过期

👤 C

... (继续直到所有维度覆盖完毕)

🤖 ✅ 需求已澄清，生成需求文档...
```

**验证：**
```bash
cat .pi/craft/plans/2026-05-19-user-login/requirement.md
```

**验证内容：**
- 功能概述是否准确
- 用户故事是否完整
- 验收标准是否明确
- Q&A 记录是否完整
- 边界条件是否覆盖

---

#### 阶段 3：🎨 Design（调用 architect subagent）

系统调用 architect 子代理分析架构，生成设计文档。

**你在做什么：** 阅读设计文档，可以要求修改。确认后 AI 进入下一阶段。

**验证：**
```bash
cat .pi/craft/plans/2026-05-19-user-login/design.md
```

**验证内容：**
- 组件/模块设计是否合理
- 数据流是否清晰
- API 设计（如有）是否完整
- 是否有设计权衡说明
- architect subagent 的输出是否被纳入

---

#### 阶段 4：🧪 Testing Strategy

AI 询问测试策略选择。

**你在做什么：** 从 4 个选项中选择 1 个。

```
🤖 请选择测试策略：
    A. Unit tests (Jest/Vitest)
    B. E2E tests (Playwright/Cypress)
    C. Both
    D. Skip

👤 A
```

**验证：**
```bash
cat .pi/craft/plans/2026-05-19-user-login/testing-plan.md
```

**验证内容：**
- 策略选择是否正确
- 测试范围是否覆盖关键路径
- 测试工具选型是否合适
- 测试文件规划是否清晰

---

#### 阶段 5：⚡ Implementation（Approval Gate）

AI 首先生成 Task 和 Todo 列表，然后逐任务执行，每次变更需要你确认。

**你在做什么：**

1. 查看 Task 和 Todo 列表
```bash
cat .pi/craft/plans/2026-05-19-user-login/tasks.md
cat .pi/craft/plans/2026-05-19-user-login/todos.md
```

2. AI 提出变更时会标记 `[APPROVAL_NEEDED]`，弹出确认框：
```
┌── Approve Code Changes? ─────────────────────────┐
│                                                    │
│  The AI has proposed code modifications.           │
│  Review the plan shown above.                      │
│                                                    │
│  [Yes]  [No]                                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

3. 选择 Yes → AI 执行代码修改
4. 选择 No → AI 重新规划

**验证：**
- tasks.md 中任务状态是否正确更新（pending → in_progress → done）
- todos.md 中子任务是否正确勾选
- 代码变更是否符合设计文档
- reviewer subagent 审查结果（如有调用）

---

### Review 流程详解

```
/craft review [target] [topic-slug]
```

#### 阶段 1：🔬 Scope

AI 确定审查范围（默认当前 git diff）。

**验证：**
```bash
cat .pi/craft/plans/2026-05-19-auth-refactor/review-scope.md
```

#### 阶段 2：🔎 Analyze

AI 调用 reviewer subagent 审查每个文件，标注严重级别。

**验证：**
- 是否每个文件都有审查
- 发现是否标注了 🔴/🟡/🔵/💡 级别
- 每个发现是否有具体的修复建议

#### 阶段 3：📊 Report

AI 生成审查报告，询问是否自动修复。

**你在做什么：** 选择 A/B/C。

```
🤖 发现 12 个问题（🔴2 🟡5 🔵3 💡2），如何处理？
    A. 自动修复（需逐项确认）
    B. 手动逐个处理
    C. 仅查看报告
```

**验证：**
```bash
cat .pi/craft/plans/2026-05-19-auth-refactor/review-report.md
```

---

## 验证场景

### 场景 1：完整的 Develop 流程

```bash
# 1. 在一个项目中启动 Pi（先确保有可分析的项目）
cd /path/to/your/project
pi

# 2. 启动工作流
/craft coding "添加一个 API 速率限制中间件" rate-limiter

# 3. 观察进度条 widget 出现：🔍Analyze ── 📋Req ── 🎨Design ── 🧪Test ── ⚡Code

# 4. 等待 AI 完成 code_analysis（自动）

# 5. 回答 AI 的逐个问题（requirement 阶段）

# 6. 确认设计文档（design 阶段）

# 7. 选择测试策略（testing 阶段）

# 8. 查看 Task 列表，逐项 Approve（implementation 阶段）

# 9. 验证产物
ls .pi/craft/plans/2026-05-19-rate-limiter/
```

### 场景 2：中断恢复

```bash
# 1. 启动工作流后按 Ctrl+C 退出
# 2. 重新进入项目
cd /path/to/your/project
pi

# 3. 恢复
/craft resume
```

### 场景 3：回退

```bash
# 在设计阶段觉得需求没搞清楚，回退到需求阶段
/craft rollback
```

### 场景 4：Code Review

```bash
# 先做一些代码变更
echo "// TODO: fix later" >> src/some-file.ts

# 审查变更
/craft review

# 审查特定文件
/craft review src/middleware/auth.ts
```

### 场景 5：Token Dashboard

```bash
# 完整仪表盘（overlay，esc 退出）
/tokens

# 快速摘要（快捷键）
Ctrl+Shift+T
```

### 场景 6：只读拦截验证

在 code_analysis / requirement / design / testing 阶段，AI 尝试使用 edit/write 会被拦截：

```
（AI 会收到 blocked 返回，自动使用只读工具替代）
```

### 场景 7：Subagent 执行可见性验证

在 design 或 review 阶段，AI 调用 subagent 后：

```
┌─ subagent architect ✓ ────────────────────────────┐
│ → read package.json                                │
│ → grep /import/ in src/                           │
│ → read src/app.ts (lines 1-50)                    │
│ ↑8.2k ↓1.5k $0.03 sonnet                          │
└────────────────────────────────────────────────────┘
```

## 开发测试

### 本地加载测试

```bash
# 方式 1：-e 参数直接加载，最推荐
pi -e ./src/index.ts

# 方式 2：软链接到全局扩展目录
mkdir -p ~/.pi/agent/extensions
ln -sf "$(pwd)/src" ~/.pi/agent/extensions/pi-craft
pi

# 方式 3：软链接到项目扩展目录
mkdir -p .pi/extensions
ln -sf "$(pwd)/src" .pi/extensions/pi-craft
pi
```

### 热重载

```bash
# 修改代码后，在 pi 中执行
/reload
```

### 查看日志

```bash
# 查看扩展加载错误
pi -e ./src/index.ts 2>&1 | head -50

# 或在 pi 内部查看
/status
```

### 测试文档生成

```bash
# 模拟完整流程后验证产物
ls -la .pi/craft/plans/$(ls -t .pi/craft/plans/ | head -1)/
cat .pi/craft/plans/*/code-analysis.md
cat .pi/craft/plans/*/requirement.md
```

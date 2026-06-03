# Pi-Native Coding Workflow — 安装与使用指南

## 1. 安装

### 作为 Pi Package 安装

```bash
# 从本地路径安装（开发测试）
cd ~/Workspace/p/code/pi-craft
pi install .

# 从 git 安装（发布后）
pi install git:github.com/paragon-h/pi-craft
```

安装后，skills 自动出现在 `~/.pi/agent/` 下（全局）或 `.pi/` 下（项目级），随 `/reload` 热更新。

### 验证安装

```bash
pi -e .
```

启动后应该看到：

```
Loaded:
  Extensions: craft-core, craft-coding-workflow, craft-lsp, ...
  Skills: coding-workflow (6 stages)
```

输入 `/skill:` 然后按 Tab，应该能看到：
```
/skill:stage-code-analysis
/skill:stage-requirement
/skill:stage-design
/skill:stage-testing
/skill:stage-implementation
```

---

## 2. 使用方式

### 核心理念：你不需要记住任何命令

跟 pi 说话就行。工作流会在需要时自动激活。

```
你说什么                →  发生什么
─────────────────────────────────────────────
"我要实现 JWT 认证"      →  LLM 加载 SKILL.md
                         →  LLM 调用 init_workflow("user-auth", "JWT authentication")
                         →  LLM 加载 /skill:stage-code-analysis
                         →  自动开始代码分析

"帮我 review 这次改动"   →  LLM 调用 init_workflow("review-xxx", "review: ...", type="review")
                         →  LLM 加载 stage-scope（review 模式）
                         →  自动开始审查
```

### 完整流程示例

```
┌─ Session Start ─────────────────────────────────────────────┐
│                                                              │
│  You:  我想给项目加 JWT 认证，支持 access token 和 refresh   │
│        token，access token 15 分钟过期                       │
│                                                              │
│  LLM:  I'll use the coding workflow for this.                │
│        [调用 init_workflow(topic="user-auth", ...)]          │
│        ✅ Workflow initialized.                              │
│        Plans: .pi/craft/plans/2026-06-01-user-auth/          │
│                                                              │
│        Loading /skill:stage-code-analysis...                 │
│        [扫描项目结构，grep 相关文件，写 code-analysis.md]     │
│                                                              │
│        [调用 complete_stage("requirement", "code-analysis.md")]│
│        ✅ Stage complete → requirement                       │
│        📌 stage:requirement labeled in /tree                 │
│                                                              │
├─ Phase 2: Requirement ──────────────────────────────────────┤
│                                                              │
│  LLM:  [自动加载 /skill:stage-requirement]                   │
│        Q: Should tokens be stored in cookies or localStorage?│
│  You:  httpOnly cookies                                      │
│  LLM:  Q: Need role-based access control?                    │
│  You:  Just auth for now                                     │
│  ... (更多 Q&A) ...                                          │
│  LLM:  [写 requirement.md]                                   │
│        Does this look correct?                               │
│  You:  yes                                                   │
│                                                              │
│        [调用 complete_stage("design", "requirement.md")]     │
│        ✅ Stage complete → design                            │
│                                                              │
├─ Phase 3: Design ───────────────────────────────────────────┤
│                                                              │
│  LLM:  [加载 /skill:stage-design, 读前面的文档]              │
│        [调用 subagent(architect)]                            │
│        [呈现设计方案]                                        │
│        Here's the architecture...                            │
│  You:  第 3 点改一下，middleware 应该放在 auth 包里          │
│  LLM:  [修改设计]                                            │
│  You:  looks good                                            │
│                                                              │
│        [调用 complete_stage("testing", "design.md")]         │
│                                                              │
├─ Phase 4: Testing ──────────────────────────────────────────┤
│                                                              │
│  LLM:  [加载 /skill:stage-testing]                           │
│        Testing approach? unit / e2e / both / skip            │
│  You:  both                                                  │
│  LLM:  Approval mode? auto / per_task / on_demand            │
│  You:  on_demand                                             │
│  LLM:  [写 testing-plan.md]                                  │
│                                                              │
│        [调用 complete_stage("implementation", "testing-plan.md")]│
│        ⚠️ 确认: Enter Implementation Phase?                  │
│  You:  [确认]                                                │
│                                                              │
├─ Phase 5: Implementation ───────────────────────────────────┤
│                                                              │
│  LLM:  [加载 /skill:stage-implementation]                    │
│        [写 tasks.md + todos.md]                              │
│        [开始写代码，边写边测试，更新进度]                     │
│        ...                                                   │
│        Task 3 done. [APPROVAL_NEEDED] This changes the API.  │
│  You:  approved                                              │
│        ...                                                   │
│        All tasks done. All tests pass.                       │
│                                                              │
│        [调用 complete_stage("done", "tasks.md")]             │
│        🎉 Workflow complete!                                 │
│        ✅ workflow:done labeled in /tree                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 文档目录结构

所有工作流产物保存在项目根目录下：

```
your-project/
├── .pi/
│   ├── settings.json            # pi-craft 配置
│   ├── skills/                  # 自动发现的 skills
│   └── craft/
│       └── plans/
│           ├── 2026-06-01-user-auth/     # ← 一个工作流一个目录
│           │   ├── code-analysis.md       # 阶段 1 产物
│           │   ├── requirement.md         # 阶段 2 产物
│           │   ├── design.md              # 阶段 3 产物
│           │   ├── testing-plan.md        # 阶段 4 产物
│           │   ├── tasks.md               # 阶段 5 产物
│           │   └── todos.md               # 阶段 5 产物
│           │
│           └── 2026-06-03-payment-api/    # 另一个工作流
│               ├── code-analysis.md
│               └── ...
```

格式：`{YYYY-MM-DD}-{topic-slug}/`

这些文档：
- **是普通的 markdown 文件** — 可以用任何编辑器打开、版本控制、分享
- **跨 session 保留** — 即使 pi session 被删除，文档仍在
- **可以被 LLM 重新读取** — resume 时 LLM 读这些文档恢复上下文

---

## 4. 常用操作

### 查看工作流状态

```
/tree
```

Session 树中能看到 labeled entries：

```
root
├── "我想给项目加 JWT 认证..."
├── ... code analysis messages ...
├── 📌 stage:requirement    ← pi.setLabel 标记
├── ... requirement Q&A ...
├── 📌 stage:design
├── ... design discussions ...
├── 📌 stage:implementation
├── ... coding messages ...
└── ✅ workflow:done
```

### 回到之前的阶段（Rollback）

1. `Escape` 两次 → 打开 `/tree`
2. 在树中找到 `📌 stage:design`
3. 选中它，继续
4. LLM 从 design 阶段重新开始，自动加载对应 skill

**和之前 `/coding:rollback design` 的区别**：
- 之前：修改 engine 内部的 stageHistory 数组，旧路径丢失
- 现在：pi 的 tree navigation 创建新分支，旧路径保留，可以随时切回去

### 尝试不同方案（Branching）

```
/tree → 导航到 📌 stage:implementation → /fork
```

创建新 session，从 implementation 阶段分叉：
- Session A：尝试 Redis session 方案
- Session B：尝试 stateless JWT 方案

两个 session 的文档都在同一个 `plans/` 目录下，可以在文件系统里对比。

### 中断后恢复

```bash
# 第二天
pi -c    # continue last session
```

LLM 自动收到：

```
🔄 Workflow restored
Topic: user-auth  |  Stage: implementation  |  Type: coding
Plans: .pi/craft/plans/2026-06-01-user-auth/
Completed: code-analysis → requirement → design → testing

Load /skill:stage-implementation to continue.
```

LLM 自动加载 stage skill，读取之前的文档（`tasks.md`, `design.md` 等），继续未完成的任务。

### 放弃当前工作流

不需要 `/coding:abort` 命令。工作流 metadata 只是 session 中的一个 custom entry — 直接开始新任务即可。旧文档保留在 `plans/` 目录下供参考。

如果想彻底清除：

```bash
rm -rf .pi/craft/plans/2026-06-01-user-auth/
```

---

## 5. 配置

```jsonc
// .pi/settings.json
{
  "craft": {
    // 子 agent 总开关（默认 true）
    "enableSubagent": true,

    // 并行子 agent 执行（默认 false，需显式开启）
    "enableParallelSubagent": false,

    // 工作目录保护（默认 true）
    "enableCwdGuard": true,

    // 只加载部分扩展
    "packages": [{
      "source": "pi-craft",
      "extensions": [
        "./src/index.ts",                    // Core（必需）
        "./src/scenarios/coding/index.ts"    // Coding workflow（必需）
      ]
      // 不加载 LSP、damage control 等（可选能力）
    }]
  }
}
```

---

## 6. 设计师视角：如何自定义工作流

### 调整阶段顺序

修改 `SKILL.md` 中的表格，调整 `complete_stage` 调用中的 `next_stage`：

```markdown
# 原有顺序
1 → 2 → 3 → 4 → 5

# 如果不需要 testing 阶段
1 → 2 → 3 → 5   （跳过 4）

# 对应 skill 中 complete_stage 的 next_stage:
# stage-design 调用 complete_stage("implementation", ...) 而不是 "testing"
```

### 添加新阶段

1. 创建 `skills/coding-workflow/stage-security-review.md`
2. 在 `SKILL.md` 的流程表中加入新行
3. 确保前一个阶段的 `complete_stage` 调用使用正确的 `next_stage`

**不需要改任何 TypeScript 代码。**

### 修改阶段指令

直接编辑对应的 `.md` skill 文件，`/reload` 即生效。比如你想让 implementation 阶段每次最多自动继续 3 轮而不是 5 轮：

```diff
- Max 5 consecutive auto-continues before pausing
+ Max 3 consecutive auto-continues before pausing
```

### 翻译为中文

将所有 skill 文件的内容翻译为中文，`/reload` 即可。

---

## 7. 故障排查

### LLM 忘记了调用 complete_stage

```
You: 用 complete_stage 推进到下一个阶段
```

或者直接说 "proceed to design stage"。

### LLM 忘记读取之前的文档

```
You: 先读一下 .pi/craft/plans/2026-06-01-user-auth/design.md
```

### 工作流没自动初始化

如果你说的需求没有被 LLM 识别为需要 workflow：

```
You: 用 init_workflow 开始一个 coding workflow，topic 是 xxx
```

### Session 树中看不到 stage labels

确认 extension 正常加载了（启动日志中应该有 `craft-coding-workflow`）。
Label 在 `complete_stage` 调用时设置 — 如果还没完成过任何阶段，树中不会有 label。

---

## 8. 与旧版本的迁移

如果你有正在运行的旧 workflow session：

1. **完成当前 workflow**（用旧的 engine 跑完）
2. 更新 pi-craft 到新版本
3. 新 workflow 使用新格式

旧 session 的 engine 持久化数据（`craft-workflow-state` custom entry）不会被新版读取，但文档文件（`.pi/craft/plans/` 下的 markdown）不受影响。

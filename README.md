# Pi Craft

Pi 多场景扩展包 — coding 开发方法论 + 知识库工具 + 通用效率工具集。

## 包结构

```
pi-craft/
├── packages/
│   ├── common/          # 通用 extensions + skills（bootstrap、todo 等）
│   ├── coding/          # coding 场景（开发方法论 skills）
│   └── knowledge-base/  # 知识库场景（待开发）
```

## 场景安装

根据需求选择安装：

```bash
# 仅 coding 场景（开发方法论 skills + 通用 extensions）
pi install ./packages/coding

# 仅知识库场景（通用 extensions，KB skills 待开发）
pi install ./packages/knowledge-base

# 混合使用（coding + 知识库）
pi install ./packages/coding
pi install ./packages/knowledge-base

# 一键全装（根包，等于上面两个一起装）
pi install .
```

### 旧版安装（向后兼容）

`pi install /path/to/pi-craft` 仍然可用，根包聚合了所有内容。

## 包含什么

### 🧠 开发方法论（Skills）

Pi Craft 为你的 coding agent 注入一套严谨的开发流程：

1. **Brainstorm before coding** — Don't jump into implementation. Explore requirements, propose approaches, get design approval first.
2. **Write plans before touching code** — Break work into bite-sized tasks (2-5 min each) with exact file paths, complete code, and verification steps.
3. **Execute with discipline** — Follow plans task by task. TDD (test-first). Commit frequently. Self-review.
4. **Verify before claiming success** — Run verification commands. Evidence before assertions.
5. **Isolate with git worktrees** — Protect your current branch from in-progress changes.

## Skills Included

| Skill | When It Activates |
|-------|-------------------|
| `brainstorming` | Before any creative work — features, components, functionality |
| `writing-plans` | When you have approved design/spec, before touching code |
| `executing-plans` | When you have a written implementation plan to execute |
| `test-driven-development` | When implementing any feature or bugfix |
| `requesting-code-review` | After completing tasks or major features |
| `receiving-code-review` | When receiving code review feedback |
| `systematic-debugging` | When encountering bugs, test failures, unexpected behavior |
| `verification-before-completion` | Before claiming work is complete |
| `using-git-worktrees` | When starting feature work needing isolation |
| `finishing-a-development-branch` | When implementation is complete, tests pass |
| `using-pi-superpowers` | Bootstrap — establishes skill discovery rules |

### 🔧 效率工具（Extensions）

| Extension | 功能 |
|-----------|------|
| `bootstrap` | 自动注入技能发现规则到每次会话 |
| `todo` | 任务追踪工具 + `/todos` 命令 |
| `working-indicator` | 实时显示 Agent 状态（思考/执行工具） |
| `cost-tracker` | Token 用量与成本面板（`/cost` + `/cost-report`） |
| `activity-widget` | 活动面板（文件变更/任务/成本多面板展示） |
| `progress-dashboard` | 完整进度仪表盘（`/progress` 命令） |

## Quickstart

### Install via Pi Package Manager

**From local path:**
```bash
pi install /path/to/pi-craft
```

**From GitHub (after publishing):**
```bash
pi install git:github.com/user/pi-craft
```

**Install to project only (shared with team):**
```bash
pi install -l /path/to/pi-craft
```

### Manual Install

**To a specific project:**

```bash
# Coding 场景
cp -r packages/common/skills/* packages/coding/skills/* /path/to/your-project/.pi/skills/
cp -r packages/common/extensions/* /path/to/your-project/.pi/extensions/

# 知识库场景（开发完成后）
cp -r packages/common/skills/* packages/knowledge-base/skills/* /path/to/your-project/.pi/skills/
cp -r packages/common/extensions/* /path/to/your-project/.pi/extensions/
```

**Globally (all projects):**

```bash
# Coding 场景
cp -r packages/common/skills/* packages/coding/skills/* ~/.pi/agent/skills/
cp -r packages/common/extensions/* ~/.pi/agent/extensions/
```

## The Basic Workflow

1. **Brainstorming** — Activates before writing code. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. Saves design document to `.pi/craft/YYYY-MM-DD-<topic>/`.

2. **Using Git Worktrees** — Activates after design approval. Creates isolated workspace on new branch, runs project setup, verifies clean test baseline.

3. **Writing Plans** — Activates with approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact file paths, complete code, verification steps.

4. **Executing Plans** — Activates with plan. Executes tasks inline with self-review checkpoints. Commits after each task.

5. **Test-Driven Development** — Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit.

6. **Requesting Code Review** — Activates between tasks. Structured self-review against plan, reports issues by severity.

7. **Finishing a Development Branch** — Activates when tasks complete. Verifies tests, presents options (merge/PR/keep/discard), cleans up worktree.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

## Philosophy

- **Test-Driven Development** — Write tests first, always
- **Systematic over ad-hoc** — Process over guessing
- **Complexity reduction** — Simplicity as primary goal (YAGNI)
- **Evidence over claims** — Verify before declaring success

## Differences from Original Superpowers

The original [Superpowers](https://github.com/obra/superpowers) is designed for Claude Code and other agents with subagent support. This Pi adaptation:

- **No subagents** — Pi doesn't support subagent dispatch, so `subagent-driven-development` and `dispatching-parallel-agents` are not included. All execution is inline with self-review.
- **No Skill tool** — Pi uses `read` to load skills instead of a dedicated Skill tool.
- **No TodoWrite** — Task tracking is done in conversation rather than with a structured tool.
- **Pi-adapted paths** — Worktree directory defaults to `~/.pi/worktrees/`, spec/plan docs go to `.pi/craft/YYYY-MM-DD-<topic>/`.

## License

MIT License — see [original Superpowers](https://github.com/obra/superpowers) for details.

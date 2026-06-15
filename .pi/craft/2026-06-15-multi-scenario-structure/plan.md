# Multi-Scenario Structure Implementation Plan

> **For implementation:** Use executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 pi-craft 从单一 coding 包重构为 monorepo 多场景结构（common + coding + knowledge-base）

**Architecture:** 三个子包：`packages/common/`（通用 extensions）、`packages/coding/`（coding skills + 专属 extensions）、`packages/knowledge-base/`（KB 空壳）。根包聚合所有子包保持向后兼容。

**Tech Stack:** 纯文件重组，无代码变更。涉及 `git mv`、新 `package.json`、README 更新。

---

### Task 1: 创建目录结构

**Files:**

- Create: `packages/common/extensions/`
- Create: `packages/coding/extensions/`
- Create: `packages/coding/skills/`
- Create: `packages/knowledge-base/extensions/`
- Create: `packages/knowledge-base/skills/`

- [ ] **Step 1: 创建所有目标目录**

```bash
mkdir -p packages/common/extensions
mkdir -p packages/coding/extensions
mkdir -p packages/coding/skills
mkdir -p packages/knowledge-base/extensions
mkdir -p packages/knowledge-base/skills
```

- [ ] **Step 2: 验证目录结构**

```bash
ls -d packages/*/
```

Expected: 三个子包目录都存在

- [ ] **Step 3: Commit**

```bash
git add packages/
git commit -m "chore: create sub-package directory structure"
```

---

### Task 2: 迁移 extensions 到 packages/common

**Files:**

- Move: `extensions/*` → `packages/common/extensions/`

- [ ] **Step 1: 移动所有 extension 目录**

```bash
for ext in bootstrap cost-tracker progress-dashboard progress-widget todo working-indicator; do
  git mv extensions/$ext packages/common/extensions/$ext
done
```

- [ ] **Step 2: 验证旧目录已空**

```bash
ls extensions/
```

Expected: 空（或仅剩 `.gitkeep`）

- [ ] **Step 3: 验证新目录完整**

```bash
ls packages/common/extensions/
```

Expected: `bootstrap cost-tracker progress-dashboard progress-widget todo working-indicator`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move extensions to packages/common"
```

---

### Task 3: 迁移 skills 到 packages/coding

**Files:**

- Move: `skills/*` → `packages/coding/skills/`

- [ ] **Step 1: 移动所有 skill 目录**

```bash
for skill in brainstorming executing-plans finishing-a-development-branch receiving-code-review requesting-code-review systematic-debugging task-tracking test-driven-development using-git-worktrees using-pi-superpowers verification-before-completion writing-plans; do
  git mv skills/$skill packages/coding/skills/$skill
done
```

- [ ] **Step 2: 验证旧目录已空**

```bash
ls skills/
```

Expected: 空

- [ ] **Step 3: 验证新目录完整**

```bash
ls packages/coding/skills/
```

Expected: 12 个 skill 目录

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move skills to packages/coding"
```

---

### Task 4: 创建 packages/common/package.json

**Files:**

- Create: `packages/common/package.json`

- [ ] **Step 1: 写入 package.json**

```json
{
  "name": "pi-craft-common",
  "version": "2.0.0",
  "description": "通用扩展：todo、cost-tracker、progress 等",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

- [ ] **Step 2: 验证 JSON 格式**

```bash
python3 -m json.tool packages/common/package.json > /dev/null && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/common/package.json
git commit -m "feat: add packages/common package.json"
```

---

### Task 5: 创建 packages/coding/package.json

**Files:**

- Create: `packages/coding/package.json`

- [ ] **Step 1: 写入 package.json**

```json
{
  "name": "pi-craft-coding",
  "version": "2.0.0",
  "description": "Coding 开发方法论技能",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["../common/extensions", "./extensions"],
    "skills": ["./skills"]
  }
}
```

- [ ] **Step 2: 验证 JSON 格式**

```bash
python3 -m json.tool packages/coding/package.json > /dev/null && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/coding/package.json
git commit -m "feat: add packages/coding package.json"
```

---

### Task 6: 创建 packages/knowledge-base/package.json

**Files:**

- Create: `packages/knowledge-base/package.json`

- [ ] **Step 1: 写入 package.json**

```json
{
  "name": "pi-craft-kb",
  "version": "2.0.0",
  "description": "知识库管理技能",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["../common/extensions", "./extensions"],
    "skills": ["./skills"]
  }
}
```

- [ ] **Step 2: 验证 JSON 格式**

```bash
python3 -m json.tool packages/knowledge-base/package.json > /dev/null && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/knowledge-base/package.json
git commit -m "feat: add packages/knowledge-base package.json"
```

---

### Task 7: 更新根 package.json

**Files:**

- Modify: `package.json`

- [ ] **Step 1: 更新根 package.json**

Replace current content:

```json
{
  "name": "pi-craft",
  "version": "2.0.0",
  "description": "Pi 扩展包 — coding + 知识库双场景，含通用工具集：头脑风暴、TDD、进度仪表盘、成本追踪、任务管理等。",
  "keywords": ["pi-package", "pi-craft", "skills", "extensions", "development-workflow", "tdd", "superpowers"],
  "author": "",
  "license": "MIT",
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  },
  "pi": {
    "extensions": [
      "./packages/common/extensions",
      "./packages/coding/extensions",
      "./packages/knowledge-base/extensions"
    ],
    "skills": [
      "./packages/coding/skills",
      "./packages/knowledge-base/skills"
    ]
  }
}
```

- [ ] **Step 2: 验证 JSON 格式**

```bash
python3 -m json.tool package.json > /dev/null && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: update root package.json for multi-scenario structure"
```

---

### Task 8: 更新 README.md

**Files:**

- Modify: `README.md`

- [ ] **Step 1: 更新 Quickstart 安装说明**

在 `## Quickstart` 部分之前插入子包安装方式：

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for multi-scenario install"
```

---

### Task 9: 清理旧目录 + 最终验证

**Files:**

- Remove: `extensions/`（顶级，如果非空则删除空目录）
- Remove: `skills/`（顶级）

- [ ] **Step 1: 删除空的旧目录**

```bash
rmdir extensions 2>/dev/null; rmdir skills 2>/dev/null; echo "done"
```

- [ ] **Step 2: 验证最终目录结构**

```bash
find . -not -path './.git/*' -not -path './.pi/*' -not -path './node_modules/*' -type f -o -type d | sort
```

Expected: 顶级只有 `package.json`、`README.md`，内容全在 `packages/` 下

- [ ] **Step 3: 验证 coding 子包可安装**

```bash
pi install --dry-run ./packages/coding 2>&1 || true
# 或者用 pi list 查看
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old top-level directories"
```

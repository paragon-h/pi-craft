# Design: 多场景包结构重构

## 背景

当前 `pi-craft` 是单一 coding 场景的 pi 包。需要支持：

- **coding 场景**：开发方法论 skills（brainstorming、TDD、debugging 等）
- **知识库场景**：知识管理 skills（搜索、摘要、整理等，具体待后续设计）
- **未来场景**：可随时扩展新场景
- **公共资源**：通用 extensions（todo、cost-tracker 等）在场景间共享
- **独立安装**：用户可只装 coding、只装 KB、或混合安装
- **安装方式**：git/local path（非 npm）

## 架构

采用 **Monorepo 子包** 结构。每个场景是独立的 pi 包，公共部分抽取为 `common` 包。

```
pi-craft/
├── package.json                    # 根元包（一键全装，可选）
├── README.md
│
├── packages/
│   ├── common/                     # pi-craft-common
│   │   ├── package.json
│   │   ├── skills/                 # 所有场景共用
│   │   │   └── using-pi-superpowers/
│   │   └── extensions/             # 所有场景通用
│   │       ├── bootstrap/
│   │       ├── todo/
│   │       ├── working-indicator/
│   │       ├── cost-tracker/
│   │       ├── progress-widget/
│   │       └── progress-dashboard/
│   │
│   ├── coding/                     # pi-craft-coding
│   │   ├── package.json
│   │   ├── extensions/             # coding 专属扩展（初始为空，按需添加）
│   │   └── skills/                 # coding 专属 skills
│   │       ├── brainstorming/
│   │       ├── writing-plans/
│   │       ├── executing-plans/
│   │       ├── test-driven-development/
│   │       ├── systematic-debugging/
│   │       ├── requesting-code-review/
│   │       ├── receiving-code-review/
│   │       ├── verification-before-completion/
│   │       ├── using-git-worktrees/
│   │       ├── finishing-a-development-branch/
│   │       └── task-tracking/
│   │
│   └── knowledge-base/             # pi-craft-kb（初始为空壳）
│       ├── package.json
│       ├── extensions/             # KB 专属扩展（待设计）
│       └── skills/                 # KB 专属技能（待设计）
```

## 各包定义

### 根包 `package.json`

聚合所有子包，方便一键全装。用户也可以只装需要的子包。

```json
{
  "name": "pi-craft",
  "version": "2.0.0",
  "description": "Pi 扩展包 — coding + 知识库双场景，含通用工具集",
  "keywords": ["pi-package", "pi-craft"],
  "pi": {
    "extensions": [
      "./packages/common/extensions",
      "./packages/coding/extensions",
      "./packages/knowledge-base/extensions"
    ],
    "skills": [
      "./packages/common/skills",
      "./packages/coding/skills",
      "./packages/knowledge-base/skills"
    ]
  }
}
```

### `packages/common/package.json`

```json
{
  "name": "pi-craft-common",
  "version": "2.0.0",
  "description": "通用扩展与技能：bootstrap、todo、cost-tracker、progress 等",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  }
}
```

### `packages/coding/package.json`

```json
{
  "name": "pi-craft-coding",
  "version": "2.0.0",
  "description": "Coding 开发方法论技能",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["../common/extensions", "./extensions"],
    "skills": ["../common/skills", "./skills"]
  }
}
```

### `packages/knowledge-base/package.json`

```json
{
  "name": "pi-craft-kb",
  "version": "2.0.0",
  "description": "知识库管理技能",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["../common/extensions", "./extensions"],
    "skills": ["../common/skills", "./skills"]
  }
}
```

## 关键设计决策

### 扩展共享机制

每个子包的 `pi.extensions` 同时引用 `../common/extensions`（共享）和 `./extensions`（专属）。路径相对于 `package.json` 所在目录解析。

**加载行为：**
- `pi install ./packages/coding` → 加载 common extensions + coding extensions + coding skills
- `pi install ./packages/knowledge-base` → 加载 common extensions + KB extensions + KB skills
- 混合安装两个包 → 全部加载，pi 自动去重（同一路径不会重复注册）

### 场景扩展

新增场景只需 3 步：

1. 创建 `packages/<scenario>/` 目录
2. 添加 `package.json`，引用 `../common/extensions` + 自己的 `./extensions` + `./skills`
3. 在根包 `package.json` 的 `pi.extensions` 和 `pi.skills` 中补一行

### 向后兼容

- 现有 skills 全部移动到 `packages/coding/skills/`，内容不变
- 现有 extensions 全部移动到 `packages/common/extensions/`，内容不变
- 用户如果之前装的是根路径 `pi install /path/to/pi-craft`，现在升级后行为一致（根包聚合了所有内容）

## 迁移步骤（实现计划大纲）

1. 创建 `packages/common/extensions/`，移动现有 extensions
2. 创建 `packages/coding/skills/`，移动现有 skills
3. 创建 `packages/coding/extensions/`（空目录，加 .gitkeep）
4. 创建 `packages/knowledge-base/`（空壳，extensions + skills 空目录）
5. 编写各包的 `package.json`
6. 更新根 `package.json`
7. 更新 `README.md`
8. 删除旧的顶级 `extensions/` 和 `skills/` 目录
9. 验证：`pi install ./packages/coding` 加载正确

## 待定（后续设计）

- knowledge-base 场景的具体 skills 和 extensions

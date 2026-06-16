# 进度仪表盘 — 设计文档

## 目标

为 pi-superpowers 扩展包新增进度可视化能力：一行常驻 widget 提供环境感知，`/progress` 命令展开完整仪表盘。解决「进度黑盒」痛点——不知道当前任务完成了多少、改了哪些文件、花了多少钱。

## 架构

### 扩展拆分

两个独立扩展，各自从 session entries 独立重建数据，不共享状态：

| 扩展 | 路径 | 职责 |
|---|---|---|
| progress-widget | `extensions/progress-widget/index.ts` | 常驻一行 widget，纯内存，零 I/O |
| progress-dashboard | `extensions/progress-dashboard/index.ts` | `/progress` 命令，TUI overlay 覆盖层 |

### 数据来源

不重复造轮子，从已有 session 数据中读取：

| 指标 | 数据来源 |
|---|---|
| 任务进度 | 从 session entries 重建 todo 状态（复用 todo 扩展的 `reconstructState` 逻辑） |
| 文件变更 | 监听 `tool_execution_end` 事件，追踪 write/edit 调用过的文件 |
| 成本 | 读取 assistant 消息的 `usage` 字段 |
| Git 状态 | `git status --porcelain` + `git branch --show-current`（仅在 dashboard 打开时执行） |

## UI 设计

### Widget（常驻行）

位于输入编辑器上方，一行显示：

```
📋 任务 2/5  │  📁 3 个文件  │  💰 $0.42  │  🌿 feat-login
```

- 仅在对应数据存在时显示该段
- 通过 `ctx.ui.setWidget` 实现
- 在 `tool_execution_end` 和 `turn_end` 时刷新

### Dashboard（`/progress` 命令）

TUI overlay 覆盖层，四个区块：

```
──────────── 📊 进度仪表盘 ────────────

  📋 任务
  🔄 #3 实现登录接口
  ⬜ #4 写单元测试
  ⬜ #5 更新文档
  ✅ #1 数据库迁移    ✅ #2 用户模型

  📁 文件变更 (本次 session)
  ✏️ src/auth/login.ts
  ✏️ src/models/user.ts
  📖 src/types/index.ts (只读)

  💰 成本统计
  本次: $0.42 (↑12K ↓3K tokens)
  项目累计: $3.18 (5 sessions)

  🌿 Git: feat-login
  M  src/auth/login.ts
  M  src/models/user.ts
  ?? src/auth/login.test.ts

───────── 按 Esc 关闭 ─────────
```

## 边界情况

| 场景 | Widget 行为 | Dashboard 行为 |
|---|---|---|
| 没有 todo 任务 | 隐藏「📋 任务」段 | 「任务」区显示「暂无任务」 |
| 没有文件变更 | 隐藏「📁 文件」段 | 「文件变更」区显示「暂无变更」 |
| 成本为 0 | 隐藏「💰」段 | 显示「$0.00」 |
| 不在 git 仓库 | 隐藏「🌿」段 | 显示「不在 git 仓库中」 |
| `git` 命令失败 | 静默隐藏 | 显示错误提示 |
| session entries 损坏 | 跳过损坏条目，尽可能重建 | 同左 |
| 非 TUI 模式（print/json） | 不注册 widget（`ctx.hasUI` 检查） | 降级为纯文本 notify 输出 |

## 性能

- Widget 不执行任何 bash/git 命令，纯内存操作
- Dashboard 仅在打开时执行一次 `git status`，打开期间不轮询
- 文件变更列表去重（同一文件多次 write 只算一次）

## 实现注意事项

- 遵循项目现有扩展代码风格（TypeScript，jiti 加载，无编译）
- TUI 组件使用 `@earendil-works/pi-tui` 提供的 Text、Container、truncateToWidth 等
- 主题颜色使用回调中的 `theme.fg()` 方法
- 私有实现细节避免与 todo 扩展共享模块（独立读取 session entries）

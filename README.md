# Pi Craft

[Pi](https://github.com/earendil-works/pi-coding-agent) 的基础工具扩展包 — 一组通用效率扩展（extensions），为 Pi 提供任务管理、成本追踪、活动面板、进度仪表盘、状态指示器等开箱即用的能力。

## 包含什么

### 🔧 扩展（Extensions）

| Extension | 功能 |
|-----------|------|
| `todo` | 任务追踪工具 + `/todos` 命令 |
| `working-indicator` | 实时显示 Agent 状态（思考/执行工具） |
| `cost-tracker` | Token 用量与成本面板（`/cost` + `/cost-report`） |
| `activity-widget` | 活动面板（文件变更/任务/成本多面板展示） |
| `progress-dashboard` | 完整进度仪表盘（`/progress` 命令） |

## 结构

```
pi-craft/
├── extensions/
│   ├── todo/
│   ├── working-indicator/
│   ├── cost-tracker/
│   ├── activity-widget/
│   └── progress-dashboard/
├── shared/                 # 扩展间共享的工具函数
├── package.json
├── tsconfig.json
└── README.md
```

## 安装

### 通过 Pi 包管理器

```bash
# 本地路径
pi install /path/to/pi-craft

# GitHub（发布后）
pi install git:github.com/user/pi-craft

# 仅安装到当前项目（与团队共享）
pi install -l /path/to/pi-craft
```

### 手动安装

```bash
# 到指定项目
cp -r extensions/* /path/to/your-project/.pi/extensions/

# 全局（所有项目）
cp -r extensions/* ~/.pi/agent/extensions/
```

## License

MIT License.

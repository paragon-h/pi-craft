# 进度仪表盘 — 实现计划

> **For implementation:** Use executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 progress-widget 和 progress-dashboard 两个扩展，提供常驻一行进度条 + `/progress` 完整仪表盘命令。

**Architecture:** 两个独立扩展，各自从 session entries 重建数据，不共享状态。progress-widget 纯内存零 I/O，通过 `setWidget` 在输入框上方常驻显示；progress-dashboard 注册 `/progress` 命令，打开 TUI overlay 展示完整信息（含 git 状态）。

**Tech Stack:** TypeScript, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`

---

### Task 1: 创建 progress-widget 扩展骨架 + todo 状态重建

**Files:**
- Create: `extensions/progress-widget/index.ts`

- [ ] **Step 1: 创建扩展文件骨架**

```typescript
/**
 * Progress Widget Extension
 *
 * 常驻一行进度条，显示在输入编辑器上方：
 * - 📋 任务进度（从 todo 工具重建）
 * - 📁 文件变更统计
 * - 💰 累计成本
 *
 * 纯内存操作，零 I/O。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

interface Task {
  id: number;
  title: string;
  status: "queued" | "in_progress" | "done" | "cancelled";
}

interface TodoDetails {
  action: string;
  tasks: Task[];
  nextId: number;
  error?: string;
}

interface WidgetState {
  tasks: Task[];
  fileChanges: Map<string, "write" | "read">;
  totalCost: number;
  totalInput: number;
  totalOutput: number;
}

export default function (pi: ExtensionAPI) {
  const state: WidgetState = {
    tasks: [],
    fileChanges: new Map(),
    totalCost: 0,
    totalInput: 0,
    totalOutput: 0,
  };

  function reconstructTodo(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "todo"
      ) {
        const details = entry.message.details as TodoDetails | undefined;
        if (details && Array.isArray(details.tasks)) {
          state.tasks = details.tasks.map((t: Task) => ({ ...t }));
          return;
        }
      }
    }
  }

  function reconstructFileChanges(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
    state.fileChanges.clear();
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        const content = entry.message.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
          if (block.type !== "toolCall" || !block.name) continue;
          const path = block.args?.path ?? block.args?.filePath;
          if (!path) continue;
          if (block.name === "write" || block.name === "edit") {
            state.fileChanges.set(path, "write");
          } else if (block.name === "read" && !state.fileChanges.has(path)) {
            state.fileChanges.set(path, "read");
          }
        }
      }
    }
  }

  function reconstructCost(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
    state.totalCost = 0;
    state.totalInput = 0;
    state.totalOutput = 0;
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        const usage = entry.message.usage;
        if (usage) {
          state.totalInput += usage.input ?? 0;
          state.totalOutput += usage.output ?? 0;
          state.totalCost += usage.cost?.total ?? 0;
        }
      }
    }
  }

  function reconstructAll(ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getBranch();
    reconstructTodo(entries);
    reconstructFileChanges(entries);
    reconstructCost(entries);
  }

  // Widget rendering — filled in Task 4
  // Event hooks — filled in Tasks 2-4
}
```

- [ ] **Step 2: 验证文件可被 pi 解析**

运行: `ls -la extensions/progress-widget/index.ts`
预期: 文件存在，内容与 Step 1 一致

---

### Task 2: progress-widget — 事件监听注册

**Files:**
- Modify: `extensions/progress-widget/index.ts` — 在 export default function 末尾追加事件监听

- [ ] **Step 1: 添加 session_start 和 session_tree 完全重建**

在 `export default function (pi: ExtensionAPI) {` 内部，`reconstructAll` 之后追加：

```typescript
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    reconstructAll(ctx);
    refreshWidget(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    reconstructAll(ctx);
    refreshWidget(ctx);
  });
```

- [ ] **Step 2: 添加 tool_execution_start 增量追踪文件变更**

注意：使用 `tool_execution_start`（而非 `_end`）因为 `_start` 提供 `event.args`。

```typescript
  pi.on("tool_execution_start", async (event, ctx) => {
    if (!ctx.hasUI) return;
    const path = event.args?.path ?? event.args?.filePath;
    if (!path) return;
    if (event.toolName === "write" || event.toolName === "edit") {
      state.fileChanges.set(path, "write");
      refreshWidget(ctx);
    } else if (event.toolName === "read" && !state.fileChanges.has(path)) {
      state.fileChanges.set(path, "read");
      refreshWidget(ctx);
    }
  });
```

- [ ] **Step 3: 添加 turn_end 增量累加成本**

```typescript
  pi.on("turn_end", async (event, ctx) => {
    if (!ctx.hasUI) return;
    const usage = event.message?.usage;
    if (usage) {
      state.totalInput += usage.input ?? 0;
      state.totalOutput += usage.output ?? 0;
      state.totalCost += usage.cost?.total ?? 0;
      refreshWidget(ctx);
    }
  });
```

- [ ] **Step 4: 添加 refreshWidget 占位函数**

在 `reconstructAll` 之后、所有 `pi.on(...)` 之前添加：

```typescript
  function refreshWidget(ctx: ExtensionContext) {
    // 将在 Task 4 中实现渲染逻辑
    ctx.ui.setWidget("progress-widget", undefined);
  }
```

---

### Task 3: progress-widget — Widget 渲染逻辑

**Files:**
- Modify: `extensions/progress-widget/index.ts` — 替换 `refreshWidget` + 添加 `renderWidget`

- [ ] **Step 1: 实现 renderWidget 函数和 refreshWidget**

替换现有的 `refreshWidget` 占位函数为：

```typescript
  function renderWidget(_tui: unknown, theme: Record<string, (s: string) => string>) {
    const segments: string[] = [];

    // Tasks: only show if there are active (not-done) tasks
    if (state.tasks.length > 0) {
      const active = state.tasks.filter(
        (t) => t.status === "in_progress" || t.status === "queued",
      ).length;
      const total = state.tasks.filter((t) => t.status !== "cancelled").length;
      if (active > 0) {
        segments.push(`📋 任务 ${active}/${total}`);
      }
    }

    // Files
    if (state.fileChanges.size > 0) {
      segments.push(`📁 ${state.fileChanges.size} 个文件`);
    }

    // Cost
    if (state.totalCost > 0) {
      segments.push(`💰 $${state.totalCost.toFixed(2)}`);
    }

    if (segments.length === 0) {
      return { render: () => [], invalidate: () => {} };
    }

    const line = segments.join("  │  ");
    return {
      render: () => [theme.fg("muted", line)],
      invalidate: () => {},
    };
  }

  function refreshWidget(ctx: ExtensionContext) {
    ctx.ui.setWidget("progress-widget", (_tui: unknown, theme: any) =>
      renderWidget(_tui, theme),
    );
  }
```

---

### Task 4: 创建 progress-dashboard 扩展 — 数据扫描

**Files:**
- Create: `extensions/progress-dashboard/index.ts`

- [ ] **Step 1: 创建扩展文件，实现数据扫描逻辑**

```typescript
/**
 * Progress Dashboard Extension — /progress 命令，TUI overlay 完整仪表盘
 *
 * 四个面板：
 * - 📋 任务（从 todo 工具重建）
 * - 📁 文件变更（从 assistant tool_calls 扫描）
 * - 💰 成本统计（从 assistant usage 累加）
 * - 🌿 Git 状态（实时 git status）
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface Task {
  id: number;
  title: string;
  status: "queued" | "in_progress" | "done" | "cancelled";
}

interface TodoDetails {
  action: string;
  tasks: Task[];
  nextId: number;
  error?: string;
}

interface FileChange {
  path: string;
  type: "write" | "read";
}

interface DashboardData {
  tasks: Task[];
  fileChanges: FileChange[];
  sessionCost: number;
  sessionInput: number;
  sessionOutput: number;
  projectCost: number;
  sessionCount: number;
  gitBranch: string | null;
  gitStatus: string | null;
  gitError: string | null;
}

function scanSession(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
  // Reconstruct todo
  let tasks: Task[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolName === "todo"
    ) {
      const details = entry.message.details as TodoDetails | undefined;
      if (details && Array.isArray(details.tasks)) {
        tasks = details.tasks.map((t: Task) => ({ ...t }));
        break;
      }
    }
  }

  // Scan file changes
  const fileMap = new Map<string, "write" | "read">();
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const content = entry.message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type !== "toolCall" || !block.name) continue;
        const path = block.args?.path ?? block.args?.filePath;
        if (!path) continue;
        if (block.name === "write" || block.name === "edit") {
          fileMap.set(path, "write");
        } else if (block.name === "read" && !fileMap.has(path)) {
          fileMap.set(path, "read");
        }
      }
    }
  }
  const fileChanges: FileChange[] = [];
  fileMap.forEach((type, path) => fileChanges.push({ path, type }));

  // Session cost
  let sessionCost = 0;
  let sessionInput = 0;
  let sessionOutput = 0;
  for (const entry of entries) {
    if (entry.type === "message" && entry.message.role === "assistant") {
      const usage = entry.message.usage;
      if (usage) {
        sessionInput += usage.input ?? 0;
        sessionOutput += usage.output ?? 0;
        sessionCost += usage.cost?.total ?? 0;
      }
    }
  }

  return { tasks, fileChanges, sessionCost, sessionInput, sessionOutput };
}
```

- [ ] **Step 2: 添加 Git 状态查询和跨 session 成本扫描函数**

在上一步代码之后、`export default` 之前追加：

```typescript
function scanGit(cwd: string): { gitBranch: string | null; gitStatus: string | null; gitError: string | null } {
  try {
    const branch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    return {
      gitBranch: branch || null,
      gitStatus: status || null,
      gitError: null,
    };
  } catch (e: any) {
    return {
      gitBranch: null,
      gitStatus: null,
      gitError: e?.message ?? "unknown error",
    };
  }
}

function scanProjectCost(
  ctx: ExtensionContext,
): { projectCost: number; sessionCount: number } {
  let projectCost = 0;
  let sessionCount = 0;
  try {
    const encodedCwd = "--" + ctx.cwd.replace(/\//g, "-") + "--";
    const sessionDir = ctx.sessionManager.getSessionDir();
    const candidates = [
      sessionDir,
      sessionDir.replace(/\/$/, ""),
      join(sessionDir, encodedCwd),
    ];
    let projectDir = "";
    for (const c of candidates) {
      try {
        if (existsSync(c) && statSync(c).isDirectory()) {
          const has = readdirSync(c).some((f: string) => f.endsWith(".jsonl"));
          if (has) { projectDir = c; break; }
        }
      } catch { /* skip */ }
    }
    if (projectDir) {
      const files = readdirSync(projectDir).filter((f: string) => f.endsWith(".jsonl"));
      for (const file of files) {
        try {
          const raw = readFileSync(join(projectDir, file), "utf8");
          for (const line of raw.trim().split("\n")) {
            try {
              const entry = JSON.parse(line);
              const usage = entry?.message?.usage;
              if (usage?.cost?.total) {
                projectCost += usage.cost.total;
              }
            } catch { /* skip */ }
          }
          sessionCount++;
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return { projectCost, sessionCount };
}
```

---

### Task 5: progress-dashboard — TUI overlay 组件

**Files:**
- Modify: `extensions/progress-dashboard/index.ts` — 在 scanProjectCost 之后、export default 之前添加

- [ ] **Step 1: 添加 ProgressDashboardComponent 类**

```typescript
function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}

class ProgressDashboardComponent {
  private data: DashboardData;
  private theme: any;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(data: DashboardData, theme: any, onClose: () => void) {
    this.data = data;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "enter")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const lines: string[] = [];
    const th = this.theme;
    const d = this.data;

    // ── Header ──
    lines.push("");
    const title = th.fg("accent", th.bold(" 📊 进度仪表盘 "));
    const headerLine =
      th.fg("borderMuted", "─".repeat(2)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 13)));
    lines.push(truncateToWidth(headerLine, width));

    // ── 任务 ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("📋 任务"))}`, width));
    if (d.tasks.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "暂无任务")}`, width));
    } else {
      for (const t of d.tasks) {
        if (t.status === "cancelled") continue;
        let icon: string;
        let style: (s: string) => string;
        switch (t.status) {
          case "in_progress":
            icon = "🔄";
            style = th.fg.bind(th, "accent");
            break;
          case "done":
            icon = "✅";
            style = th.fg.bind(th, "dim");
            break;
          default:
            icon = "⬜";
            style = th.fg.bind(th, "muted");
        }
        lines.push(
          truncateToWidth(`  ${icon} ${th.fg("accent", `#${t.id}`)} ${style(t.title)}`, width),
        );
      }
    }

    // ── 文件变更 ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("📁 文件变更 (本次 session)"))}`, width));
    if (d.fileChanges.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "暂无变更")}`, width));
    } else {
      for (const f of d.fileChanges) {
        const icon = f.type === "write" ? "✏️" : "📖";
        const label = f.type === "read" ? " (只读)" : "";
        lines.push(
          truncateToWidth(`  ${icon} ${th.fg("muted", f.path + label)}`, width),
        );
      }
    }

    // ── 成本 ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("text", th.bold("💰 成本统计"))}`, width));
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "本次:")} ${th.fg("text", formatCost(d.sessionCost))} (↑${formatTokens(d.sessionInput)} ↓${formatTokens(d.sessionOutput)} tokens)`,
        width,
      ),
    );
    lines.push(
      truncateToWidth(
        `  ${th.fg("muted", "项目累计:")} ${th.fg("text", formatCost(d.projectCost))} (${d.sessionCount} sessions)`,
        width,
      ),
    );

    // ── Git ──
    lines.push("");
    if (d.gitError) {
      lines.push(truncateToWidth(`  ${th.fg("text", th.bold("🌿 Git"))}`, width));
      lines.push(truncateToWidth(`  ${th.fg("dim", d.gitError)}`, width));
    } else if (d.gitBranch === null) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "🌿 不在 git 仓库中")}`, width));
    } else {
      lines.push(
        truncateToWidth(`  ${th.fg("text", th.bold("🌿 Git:"))} ${th.fg("accent", d.gitBranch)}`, width),
      );
      if (d.gitStatus) {
        for (const line of d.gitStatus.split("\n")) {
          lines.push(truncateToWidth(`  ${th.fg("muted", line)}`, width));
        }
      } else {
        lines.push(truncateToWidth(`  ${th.fg("dim", "working tree clean")}`, width));
      }
    }

    // ── Footer ──
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "按 Esc 关闭")}`, width));
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

---

### Task 6: progress-dashboard — 注册 /progress 命令 + export default

**Files:**
- Modify: `extensions/progress-dashboard/index.ts` — 追加 export default

- [ ] **Step 1: 添加 export default 函数，注册 /progress 命令**

在文件末尾追加：

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerCommand("progress", {
    description: "Show progress dashboard: tasks, file changes, cost, git status",
    handler: async (_args, ctx) => {
      // Scan current session
      const entries = ctx.sessionManager.getBranch();
      const session = scanSession(entries);

      // Scan git and cross-session cost
      const git = scanGit(ctx.cwd);
      const { projectCost, sessionCount } = scanProjectCost(ctx);

      const data: DashboardData = {
        ...session,
        projectCost,
        sessionCount,
        gitBranch: git.gitBranch,
        gitStatus: git.gitStatus,
        gitError: git.gitError,
      };

      if (ctx.mode !== "tui") {
        // Non-TUI: plain text fallback
        const lines: string[] = [];
        lines.push(`📊 Progress Dashboard`);
        lines.push(`Tasks: ${data.tasks.filter((t) => t.status !== "cancelled").length}`);
        lines.push(`Files changed: ${data.fileChanges.length}`);
        lines.push(`Cost: ${formatCost(data.sessionCost)} (project: ${formatCost(data.projectCost)})`);
        if (data.gitBranch) lines.push(`Git: ${data.gitBranch}`);
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // TUI: overlay
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new ProgressDashboardComponent(data, theme, () => done());
      });
    },
  });
}
```

---

### Task 7: 提交并验证

**Files:**
- 无新建/修改 — 仅验证

- [ ] **Step 1: 确认文件结构**

运行: `ls -la extensions/progress-widget/index.ts extensions/progress-dashboard/index.ts`
预期: 两个文件都存在

- [ ] **Step 2: Git 提交**

```bash
git add extensions/progress-widget/index.ts extensions/progress-dashboard/index.ts
git commit -m "feat: add progress widget and dashboard extensions"
```

- [ ] **Step 3: 验证现有扩展不受影响**

运行: `ls extensions/*/index.ts`
预期: 6 个扩展目录（原有 4 个 + 新增 2 个）

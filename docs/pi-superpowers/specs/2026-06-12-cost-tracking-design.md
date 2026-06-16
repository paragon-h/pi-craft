# Cost Tracking — Token Usage & Cost Dashboard

> **Goal:** Give users visibility into token usage and cost — per-session breakdowns (by turn, by tool) and cross-session aggregate reports. No budgets, no limits, pure observability.

**Deliverable:** `extensions/cost-tracker/index.ts` — a single extension with `/cost` and `/cost-report` commands.

---

## Architecture

```
cost-tracker extension
  │
  ├─ /cost 命令 ──── 扫描当前 branch entries，按 turn/tool 拆分
  └─ /cost-report 命令 ── 扫描所有 session 文件，出汇总报告
```

**数据策略：** 不主动存储、不双写、不引入 SQLite。数据来源就是 Pi 的 session entry 中 assistant 消息自带的 `usage` 字段。每次 `/cost` 调用时从 entries 扫描重建，保证数据始终准确。

---

## Data Model

```typescript
interface SessionCost {
  sessionId: string;
  sessionName?: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  turns: TurnCost[];
  toolBreakdown: Record<string, ToolUsage>;
}

interface TurnCost {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  toolNames: string[];
}

interface ToolUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}
```

### Data Source

Assistant messages in session entries carry:

```typescript
message.usage = {
  input: number,
  output: number,
  cacheRead?: number,
  cacheWrite?: number,
  cost?: {
    total: number,
    input?: number,
    output?: number,
    cacheRead?: number,
    cacheWrite?: number,
  }
}
```

---

## `/cost` Command

### TUI Mode

Opens an overlay panel showing:

```
📊 当前 Session 成本

  总花费:  $12.47
  总 input:   45,230 tokens
  总 output:  18,450 tokens
  缓存读取:    8,200 tokens
  缓存写入:    3,100 tokens

  Turn 分解:
  #1  $0.03  ↑800  ↓200  —
  #2  $0.12  ↑3.2K ↓1.1K  (read ×3, edit ×1)
  #3  $0.22  ↑5.1K ↓2.0K  (bash ×2, write ×1)
  #4  $0.08  ↑2.4K ↓900   (read ×1, grep ×2)
  ...

  工具使用排行:
  read  15 次  $4.18  ↑18K ↓6K
  bash   8 次  $3.50  ↑12K ↓4K
  edit   5 次  $2.09  ↑8K  ↓3K
  write  2 次  $1.05  ↑4K  ↓1K

  Esc 关闭
```

### Non-TUI Mode

Prints plain text or notifies via `ctx.ui.notify`.

---

## `/cost-report` Command

### Algorithm

1. `SessionManager.list(cwd)` — get all session files for current project
2. For each session file, `SessionManager.fromFile(path)` — open & scan entries
3. Extract assistant messages with usage data
4. Aggregate across sessions

### Output (TUI overlay)

```
📊 项目成本报告

  Sessions: 12
  总花费:   $87.32
  日均:     $4.15 (最近 21 天)

  Session 明细:
  session-abc  $12.47  设计成本追踪功能
  session-def  $8.21   修复登录 bug
  session-ghi  $15.03  重构 auth 模块
  ...

  总计:
  总 input:     320,450 tokens
  总 output:    145,200 tokens
  缓存读取:      52,300 tokens
  缓存写入:      18,900 tokens

  Esc 关闭
```

---

## Extension Structure

```
extensions/cost-tracker/index.ts
```

Single file extension. No `package.json` needed (no external dependencies).

### Key APIs Used

- `pi.registerCommand("cost", ...)` — `/cost` command
- `pi.registerCommand("cost-report", ...)` — `/cost-report` command
- `ctx.sessionManager.getBranch()` — get current branch entries
- `ctx.sessionManager.getSessions()` or `SessionManager.list(cwd)` — list session files
- `SessionManager.fromFile(path)` — open a session file for scanning
- `ctx.ui.custom(...)` — TUI overlay for rendering panels
- `ctx.ui.notify(...)` — non-TUI output

### Rendering

Two TUI panel components (similar to `TaskListComponent` in todo extension):
1. `CostPanelComponent` — `/cost` overlay
2. `CostReportComponent` — `/cost-report` overlay

Both follow Pi TUI patterns: `handleInput(data)` for keyboard, `render(width)` for output, `invalidate()` for cache busting.

---

## File List

| File | Type | Description |
|------|------|-------------|
| `extensions/cost-tracker/index.ts` | New | Extension entry point |
| `docs/pi-superpowers/specs/2026-06-12-cost-tracking-design.md` | New | This spec |

---

## Acceptance Criteria

1. `/cost` shows per-turn breakdown with token counts and cost for current session
2. `/cost` shows tool usage ranking
3. `/cost-report` scans all session files in current project directory
4. `/cost-report` shows per-session cost with session names
5. `/cost-report` shows aggregate totals
6. Both commands work in TUI mode (overlay panels, Esc to close)
7. Both commands work in non-TUI mode (text output via notify)
8. No state management needed — all data comes from scanning entries on demand

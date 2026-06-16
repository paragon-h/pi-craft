# Optimization Pass Implementation Plan

> **For implementation:** Use executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate code duplication across extensions, convert blocking I/O to async, add type-checking safety net, and clean up dead code — making the codebase maintainable.

**Architecture:** Extract a `packages/common/shared/` module containing shared types, formatters, session-scanning logic, and project-cost scanning. All extensions import from it. Convert all filesystem/git I/O to async APIs. Add `tsconfig.json` for project-wide type safety.

**Tech Stack:** TypeScript (loaded via jiti, no build step), Node.js built-ins (`node:fs/promises`, `node:child_process`), typebox, pi ExtensionAPI.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/common/shared/types.ts` | Shared interfaces: `Task`, `TodoDetails`, `FileChange`, `TurnCost`, `ToolUsage`, `SessionCost`, `SessionCostReport` |
| `packages/common/shared/format.ts` | `formatTokens()`, `formatCost()` |
| `packages/common/shared/session.ts` | Session-branch scanning: `reconstructTodoState()`, `scanFileChanges()`, `computeSessionCost()`, `getSessionName()` |
| `packages/common/shared/project.ts` | Cross-session disk scanning: `findProjectSessionDir()`, `scanProjectCost()` |
| `tsconfig.json` | TypeScript project config (type-checking only, no emit) |
| `.gitignore` | Ignore node_modules, etc. |

### Modified files

| File | Changes |
|------|---------|
| `packages/common/extensions/todo/index.ts` | Import types from shared; remove local `Task`/`TodoDetails` defs |
| `packages/common/extensions/cost-tracker/index.ts` | Import from shared; remove duplicated types/functions; async I/O; remove unused `Text` import; remove dead `invalidate()` |
| `packages/common/extensions/progress-widget/index.ts` | Import from shared; remove duplicated types/functions |
| `packages/common/extensions/progress-dashboard/index.ts` | Import from shared; remove duplicated types/functions; async git/fs I/O; remove dead `invalidate()` |
| `packages/common/extensions/working-indicator/index.ts` | (no changes expected) |
| `packages/common/extensions/bootstrap/index.ts` | Add error handling for skill file read |
| `package.json` | Add `typescript` devDependency |

---

## Duplication Map (reference)

| Duplicated content | Current locations | Target |
|-------------------|-------------------|--------|
| `interface Task` | todo, progress-widget, progress-dashboard | `shared/types.ts` |
| `interface TodoDetails` | todo, progress-widget, progress-dashboard | `shared/types.ts` |
| `interface FileChange` | progress-dashboard | `shared/types.ts` |
| `formatTokens()` | cost-tracker, progress-dashboard | `shared/format.ts` |
| `formatCost()` | cost-tracker, progress-dashboard | `shared/format.ts` |
| Todo state reconstruction | todo, progress-widget, progress-dashboard | `shared/session.ts` |
| File-change scanning | progress-widget, progress-dashboard | `shared/session.ts` |
| Cost accumulation | cost-tracker, progress-widget, progress-dashboard | `shared/session.ts` |
| Project session-dir discovery | cost-tracker, progress-dashboard | `shared/project.ts` |
| Cross-session cost scan | cost-tracker, progress-dashboard | `shared/project.ts` |

---

## Task 0: Foundation — .gitignore + TypeScript dev tool

**Files:**
- Create: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 2: Install typescript as devDependency**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npm install --save-dev typescript @types/node
```

This provides `tsc` for verification throughout the refactor.

- [ ] **Step 3: Verify tsc is available**

Run: `npx tsc --version`
Expected: prints a version number (e.g. `Version 5.x.x`)

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json package-lock.json
git commit -m "chore: add .gitignore and typescript dev dependency"
```

---

## Task 1 (P0): Extract shared module — types + formatters

**Files:**
- Create: `packages/common/shared/types.ts`
- Create: `packages/common/shared/format.ts`

- [ ] **Step 1: Create `shared/types.ts`**

```typescript
/** Shared type definitions used across multiple extensions. */

export interface Task {
  id: number;
  title: string;
  status: "queued" | "in_progress" | "done" | "cancelled";
}

export interface TodoDetails {
  action: string;
  tasks: Task[];
  nextId: number;
  error?: string;
}

export interface FileChange {
  path: string;
  type: "write" | "read";
}

// ─── Cost tracking types ───────────────────────────────────────────────

export interface TurnCost {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  toolNames: string[];
}

export interface ToolUsage {
  calls: number;
  cost: number;
}

export interface SessionCost {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  turns: TurnCost[];
  toolBreakdown: Record<string, ToolUsage>;
}

export interface SessionCostReport {
  sessionPath: string;
  sessionName: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
}
```

- [ ] **Step 2: Create `shared/format.ts`**

```typescript
/** Shared formatting utilities. */

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function formatCost(n: number): string {
  return "$" + n.toFixed(2);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/common/shared/
git commit -m "refactor: extract shared types and formatters"
```

---

## Task 2 (P0): Extract session-scanning logic

**Files:**
- Create: `packages/common/shared/session.ts`

This consolidates todo reconstruction, file-change scanning, and cost computation from todo/cost-tracker/progress-widget/progress-dashboard.

- [ ] **Step 1: Create `shared/session.ts`**

```typescript
/** Session-branch scanning utilities — reconstruct state from session entries. */

import type { FileChange, SessionCost, Task, TodoDetails, ToolUsage, TurnCost } from "./types";

export type SessionEntries = Array<{ type: string; message?: any; name?: string }>;

/** Reconstruct the latest todo task list from session branch entries. */
export function reconstructTodoState(entries: SessionEntries): Task[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    if (
      entry.type === "message" &&
      entry.message?.role === "toolResult" &&
      entry.message.toolName === "todo"
    ) {
      const details = entry.message.details as TodoDetails | undefined;
      if (details && Array.isArray(details.tasks)) {
        return details.tasks.map((t) => ({ ...t }));
      }
    }
  }
  return [];
}

/** Scan file changes (write/edit/read) from assistant tool calls. */
export function scanFileChanges(entries: SessionEntries): FileChange[] {
  const fileMap = new Map<string, "write" | "read">();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
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
  return Array.from(fileMap, ([path, type]) => ({ path, type }));
}

/** Compute per-turn and per-tool cost breakdown from session entries. */
export function computeSessionCost(entries: SessionEntries): SessionCost {
  const turns: TurnCost[] = [];
  const toolBreakdown: Record<string, ToolUsage> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;
  let turnIndex = 0;

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "assistant") continue;

    const usage = msg.usage;
    if (!usage || typeof usage.input !== "number") continue;

    turnIndex++;
    totalInput += usage.input ?? 0;
    totalOutput += usage.output ?? 0;
    totalCacheRead += usage.cacheRead ?? 0;
    totalCacheWrite += usage.cacheWrite ?? 0;
    totalCost += usage.cost?.total ?? 0;

    const toolNames: string[] = [];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "toolCall" && block.name) {
          toolNames.push(block.name);
        }
      }
    }

    const turnCost = usage.cost?.total ?? 0;
    if (toolNames.length > 0) {
      const perToolCost = turnCost / toolNames.length;
      for (const name of toolNames) {
        if (!toolBreakdown[name]) {
          toolBreakdown[name] = { calls: 0, cost: 0 };
        }
        toolBreakdown[name].calls++;
        toolBreakdown[name].cost += perToolCost;
      }
    }

    turns.push({
      turnIndex,
      inputTokens: usage.input ?? 0,
      outputTokens: usage.output ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
      cost: turnCost,
      toolNames,
    });
  }

  return {
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    totalCost,
    turns,
    toolBreakdown,
  };
}

/** Extract the session name from the latest session_info entry. */
export function getSessionName(entries: SessionEntries): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry && entry.type === "session_info" && entry.name) {
      return entry.name;
    }
  }
  return "未命名";
}
```

- [ ] **Step 2: Verify it type-checks**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext packages/common/shared/types.ts packages/common/shared/format.ts packages/common/shared/session.ts 2>&1 | head -20
```
Expected: no errors (or only errors about missing peer dep type declarations, which are expected without tsconfig paths).

- [ ] **Step 3: Commit**

```bash
git add packages/common/shared/session.ts
git commit -m "refactor: extract session-scanning logic to shared module"
```

---

## Task 3 (P0): Extract project-cost scanning logic

**Files:**
- Create: `packages/common/shared/project.ts`

This consolidates project session-dir discovery and cross-session cost scanning from cost-tracker and progress-dashboard.

- [ ] **Step 1: Create `shared/project.ts`** (sync version — will be made async in Task 6)

```typescript
/** Cross-session project cost scanning — read .jsonl session files from disk. */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeSessionCost, getSessionName, type SessionEntries } from "./session";
import type { SessionCostReport } from "./types";

/**
 * Find the project-specific session directory.
 * cwd /Users/foo/bar → encoded as --Users-foo-bar--
 */
export function findProjectSessionDir(cwd: string, sessionDir: string): string | null {
  const encodedCwd = "--" + cwd.replace(/\//g, "-") + "--";
  const candidates = [
    sessionDir,
    sessionDir.replace(/\/$/, ""),
    join(sessionDir, encodedCwd),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) {
        const hasSessions = readdirSync(c).some((f) => f.endsWith(".jsonl"));
        if (hasSessions) return c;
      }
    } catch {
      // keep trying
    }
  }
  return null;
}

/** Parse a .jsonl session file into entries. */
export function parseSessionFile(filePath: string): SessionEntries {
  const raw = readFileSync(filePath, "utf8");
  const entries: SessionEntries = [];
  for (const line of raw.trim().split("\n")) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/** Scan all sessions in a project directory, return per-session reports + grand total. */
export function scanProjectCost(
  projectDir: string,
): { reports: SessionCostReport[]; grandTotal: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number } } {
  const reports: SessionCostReport[] = [];
  const grandTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

  const files = readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    try {
      const filePath = join(projectDir, file);
      const entries = parseSessionFile(filePath);
      const cost = computeSessionCost(entries);
      const sessionName = getSessionName(entries);

      reports.push({
        sessionPath: filePath,
        sessionName,
        totalInput: cost.totalInput,
        totalOutput: cost.totalOutput,
        totalCacheRead: cost.totalCacheRead,
        totalCacheWrite: cost.totalCacheWrite,
        totalCost: cost.totalCost,
      });

      grandTotal.input += cost.totalInput;
      grandTotal.output += cost.totalOutput;
      grandTotal.cacheRead += cost.totalCacheRead;
      grandTotal.cacheWrite += cost.totalCacheWrite;
      grandTotal.cost += cost.totalCost;
    } catch {
      // skip unreadable sessions
    }
  }

  reports.sort((a, b) => b.totalCost - a.totalCost);
  return { reports, grandTotal };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/common/shared/project.ts
git commit -m "refactor: extract project-cost scanning to shared module"
```

---

## Task 4 (P0): Refactor `todo` extension to use shared module

**Files:**
- Modify: `packages/common/extensions/todo/index.ts`

- [ ] **Step 1: Replace local type definitions with shared imports**

In `todo/index.ts`, remove the local `interface Task` and `interface TodoDetails` definitions (lines ~59-71), and add imports:

```typescript
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { Task, TodoDetails } from "../../shared/types";
```

Remove these lines (the local interfaces):
```typescript
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
```

- [ ] **Step 2: Replace `reconstructState` with shared function**

Replace the local `reconstructState` function body with a call to `reconstructTodoState`:

Add import:
```typescript
import { reconstructTodoState } from "../../shared/session";
```

Replace:
```typescript
  const reconstructState = (ctx: ExtensionContext) => {
    const entries = ctx.sessionManager.getBranch();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "todo"
      ) {
        const details = entry.message.details as TodoDetails | undefined;
        if (details) {
          tasks = details.tasks.map((t) => ({ ...t }));
          nextId = details.nextId;
          return;
        }
      }
    }
    tasks = [];
    nextId = 1;
  };
```

With:
```typescript
  const reconstructState = (ctx: ExtensionContext) => {
    const entries = ctx.sessionManager.getBranch();
    const lastTodoDetails = entries.findLast?.((e: any) =>
      e.type === "message" &&
      e.message?.role === "toolResult" &&
      e.message?.toolName === "todo"
    );
    // reconstructTodoState returns the task array; we also need nextId
    const restored = reconstructTodoState(entries);
    if (restored.length > 0 || lastTodoDetails) {
      tasks = restored;
      const details = lastTodoDetails?.message?.details as TodoDetails | undefined;
      nextId = details?.nextId ?? (restored.length > 0 ? Math.max(...restored.map((t) => t.id)) + 1 : 1);
    } else {
      tasks = [];
      nextId = 1;
    }
  };
```

> Note: `reconstructTodoState` returns just the tasks array. The todo extension also needs `nextId` from the details. We derive it from the latest todo toolResult details, falling back to max-id+1.

- [ ] **Step 3: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext packages/common/extensions/todo/index.ts packages/common/shared/*.ts 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/common/extensions/todo/index.ts
git commit -m "refactor: todo extension uses shared types and session scan"
```

---

## Task 5 (P0): Refactor `cost-tracker`, `progress-widget`, `progress-dashboard` to use shared module

**Files:**
- Modify: `packages/common/extensions/cost-tracker/index.ts`
- Modify: `packages/common/extensions/progress-widget/index.ts`
- Modify: `packages/common/extensions/progress-dashboard/index.ts`

- [ ] **Step 1: Refactor `cost-tracker/index.ts`**

Changes:
1. **Remove unused `Text` import** — change `import { matchesKey, Text, truncateToWidth }` to `import { matchesKey, truncateToWidth }`
2. **Remove local type definitions** — delete `interface Usage`, `interface TurnCost`, `interface ToolUsage`, `interface SessionCost`, `interface SessionCostReport`
3. **Remove local functions** — delete `formatTokens`, `formatCost`, `computeSessionCost`, `getSessionName`
4. **Add shared imports:**
```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { SessionCost, SessionCostReport } from "../../shared/types";
import { formatCost, formatTokens } from "../../shared/format";
import { computeSessionCost, getSessionName } from "../../shared/session";
import { findProjectSessionDir, scanProjectCost } from "../../shared/project";
```
5. **Replace `/cost-report` handler body** — remove the inline `fs`/`path` dynamic import logic (lines ~438-510) and replace with:
```typescript
    handler: async (_args, ctx) => {
      const sessionDir = ctx.sessionManager.getSessionDir();
      const projectDir = findProjectSessionDir(ctx.cwd, sessionDir);

      if (!projectDir) {
        ctx.ui.notify("未找到当前项目的 session 目录", "error");
        return;
      }

      const { reports, grandTotal } = scanProjectCost(projectDir);

      if (ctx.mode !== "tui") {
        const lines: string[] = [];
        lines.push(`📊 Cost Report: ${reports.length} sessions`);
        lines.push(`Total: ${formatCost(grandTotal.cost)}`);
        for (const r of reports) {
          const name = r.sessionName || r.sessionPath.split("/").pop()?.replace(".jsonl", "") || "?";
          lines.push(`  ${formatCost(r.totalCost)}  ${name}`);
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new CostReportComponent(reports, grandTotal, theme, () => done());
      });
    },
```
6. **Remove dead `invalidate()` method** from `CostPanelComponent` and `CostReportComponent`.

- [ ] **Step 2: Refactor `progress-widget/index.ts`**

Changes:
1. **Remove local type definitions** — delete `interface Task`, `interface TodoDetails`, `interface WidgetState`'s duplicated types (keep WidgetState but reference shared types)
2. **Remove local functions** — delete `reconstructTodo`, `reconstructFileChanges`, `reconstructCost`
3. **Add shared imports:**
```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Task } from "../../shared/types";
import { computeSessionCost, reconstructTodoState, scanFileChanges } from "../../shared/session";
```
4. **Replace `reconstructAll`:**
```typescript
  function reconstructAll(ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getBranch();
    state.tasks = reconstructTodoState(entries);
    state.fileChanges = new Map(scanFileChanges(entries).map((f) => [f.path, f.type]));
    const cost = computeSessionCost(entries);
    state.totalCost = cost.totalCost;
    state.totalInput = cost.totalInput;
    state.totalOutput = cost.totalOutput;
  }
```
5. Keep the `tool_execution_start` and `turn_end` incremental update logic as-is (they're already efficient incremental updates, not scans).

- [ ] **Step 3: Refactor `progress-dashboard/index.ts`**

Changes:
1. **Remove local type definitions** — delete `interface Task`, `interface TodoDetails`, `interface FileChange`, `interface DashboardData` references to removed types
2. **Remove local functions** — delete `formatTokens`, `formatCost`
3. **Replace `scanSession` with shared calls:**
```typescript
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";
import type { FileChange, Task } from "../../shared/types";
import { formatCost, formatTokens } from "../../shared/format";
import { computeSessionCost, reconstructTodoState, scanFileChanges } from "../../shared/session";
import { findProjectSessionDir, scanProjectCost } from "../../shared/project";
```

Replace `scanSession`:
```typescript
function scanSession(entries: ReturnType<ExtensionContext["sessionManager"]["getBranch"]>) {
  const tasks = reconstructTodoState(entries);
  const fileChanges = scanFileChanges(entries);
  const cost = computeSessionCost(entries);
  return {
    tasks,
    fileChanges,
    sessionCost: cost.totalCost,
    sessionInput: cost.totalInput,
    sessionOutput: cost.totalOutput,
  };
}
```

Replace `scanProjectCost` call in handler:
```typescript
      const sessionDir = ctx.sessionManager.getSessionDir();
      const projectDir = findProjectSessionDir(ctx.cwd, sessionDir);
      const { grandTotal: projectCostData, reports } = projectDir
        ? scanProjectCost(projectDir)
        : { grandTotal: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }, reports: [] };
      const projectCost = projectCostData.cost;
      const sessionCount = reports.length;
```

Remove the local `scanProjectCost` function entirely.

4. **Remove dead `invalidate()` method** from `ProgressDashboardComponent`.

- [ ] **Step 4: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext packages/common/extensions/cost-tracker/index.ts packages/common/extensions/progress-widget/index.ts packages/common/extensions/progress-dashboard/index.ts packages/common/shared/*.ts 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/common/extensions/
git commit -m "refactor: all extensions use shared module, eliminating duplication"
```

---

## Task 6 (P1): Convert sync I/O to async

**Files:**
- Modify: `packages/common/shared/project.ts`
- Modify: `packages/common/extensions/progress-dashboard/index.ts`

- [ ] **Step 1: Make `shared/project.ts` fully async**

Replace sync `node:fs` imports with `node:fs/promises`:

```typescript
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { computeSessionCost, getSessionName, type SessionEntries } from "./session";
import type { SessionCostReport } from "./types";

export async function findProjectSessionDir(cwd: string, sessionDir: string): Promise<string | null> {
  const encodedCwd = "--" + cwd.replace(/\//g, "-") + "--";
  const candidates = [
    sessionDir,
    sessionDir.replace(/\/$/, ""),
    join(sessionDir, encodedCwd),
  ];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isDirectory()) {
        const files = await readdir(c);
        if (files.some((f) => f.endsWith(".jsonl"))) return c;
      }
    } catch {
      // keep trying
    }
  }
  return null;
}

export async function parseSessionFile(filePath: string): Promise<SessionEntries> {
  const raw = await readFile(filePath, "utf8");
  const entries: SessionEntries = [];
  for (const line of raw.trim().split("\n")) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export async function scanProjectCost(
  projectDir: string,
): Promise<{ reports: SessionCostReport[]; grandTotal: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number } }> {
  const reports: SessionCostReport[] = [];
  const grandTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

  const files = (await readdir(projectDir)).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    try {
      const filePath = join(projectDir, file);
      const entries = await parseSessionFile(filePath);
      const cost = computeSessionCost(entries);
      const sessionName = getSessionName(entries);

      reports.push({
        sessionPath: filePath,
        sessionName,
        totalInput: cost.totalInput,
        totalOutput: cost.totalOutput,
        totalCacheRead: cost.totalCacheRead,
        totalCacheWrite: cost.totalCacheWrite,
        totalCost: cost.totalCost,
      });

      grandTotal.input += cost.totalInput;
      grandTotal.output += cost.totalOutput;
      grandTotal.cacheRead += cost.totalCacheRead;
      grandTotal.cacheWrite += cost.totalCacheWrite;
      grandTotal.cost += cost.totalCost;
    } catch {
      // skip unreadable sessions
    }
  }

  reports.sort((a, b) => b.totalCost - a.totalCost);
  return { reports, grandTotal };
}
```

- [ ] **Step 2: Update `cost-tracker` `/cost-report` handler to await async calls**

In the handler, change:
```typescript
      const projectDir = findProjectSessionDir(ctx.cwd, sessionDir);
```
to:
```typescript
      const projectDir = await findProjectSessionDir(ctx.cwd, sessionDir);
```
and:
```typescript
      const { reports, grandTotal } = scanProjectCost(projectDir);
```
to:
```typescript
      const { reports, grandTotal } = await scanProjectCost(projectDir);
```

- [ ] **Step 3: Update `progress-dashboard` to async git + async project scan**

Replace `scanGit` (sync `execSync`) with async version using `node:child_process` `exec`:

```typescript
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function scanGit(cwd: string): Promise<{ gitBranch: string | null; gitStatus: string | null; gitError: string | null }> {
  try {
    const { stdout: branch } = await execAsync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 });
    const { stdout: status } = await execAsync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 3000 });
    return {
      gitBranch: branch.trim() || null,
      gitStatus: status.trim() || null,
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
```

In the `/progress` handler, update calls to `await`:
```typescript
      const git = await scanGit(ctx.cwd);
      const sessionDir = ctx.sessionManager.getSessionDir();
      const projectDir = await findProjectSessionDir(ctx.cwd, sessionDir);
      const { grandTotal: projectCostData, reports } = projectDir
        ? await scanProjectCost(projectDir)
        : { grandTotal: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }, reports: [] };
```

Remove old sync imports (`execSync`, `existsSync`, `readFileSync`, `readdirSync`, `statSync`).

- [ ] **Step 4: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext packages/common/extensions/cost-tracker/index.ts packages/common/extensions/progress-dashboard/index.ts packages/common/shared/*.ts 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/common/shared/project.ts packages/common/extensions/cost-tracker/index.ts packages/common/extensions/progress-dashboard/index.ts
git commit -m "perf: convert sync filesystem and git I/O to async"
```

---

## Task 7 (P2): Add tsconfig.json for project-wide type checking

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": [
    "packages/common/shared/**/*.ts",
    "packages/common/extensions/**/*.ts",
    "packages/coding/extensions/**/*.ts",
    "packages/knowledge-base/extensions/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Run full project type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit 2>&1
```
Expected: no errors. If errors appear, fix them (they indicate latent type issues the safety net was designed to catch).

- [ ] **Step 3: Add type-check script to root package.json**

In `package.json`, add to scripts:
```json
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json package.json
git commit -m "chore: add tsconfig.json for project-wide type checking"
```

---

## Task 8 (P3): Cleanup — bootstrap error handling + dead code removal

**Files:**
- Modify: `packages/common/extensions/bootstrap/index.ts`

- [ ] **Step 1: Add error handling to bootstrap skill read**

The bootstrap extension reads a file at module load time with no error handling. If the path is wrong (as happened in commit `065f22c`), the entire extension crashes silently.

Replace the module-level `readFileSync` with a safe version:

```typescript
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const skillPath = resolve(__dirname, "../../skills/using-pi-superpowers/SKILL.md");

let skillContent: string;
try {
  skillContent = readFileSync(skillPath, "utf-8");
} catch (e) {
  console.error(`[bootstrap] Failed to read skill file at ${skillPath}:`, e);
  skillContent = "";
}

const bootstrapPrefix = "<EXTREMELY_IMPORTANT>\nYou have pi superpowers.\n\n";
const bootstrapSuffix = "\n</EXTREMELY_IMPORTANT>";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    if (!skillContent) return; // skill file not found, skip injection
    const bootstrapInjection = `${bootstrapPrefix}${skillContent}${bootstrapSuffix}`;
    if (event.systemPrompt.includes(bootstrapInjection)) return;
    return {
      systemPrompt: `${bootstrapInjection}\n\n${event.systemPrompt}`,
    };
  });
}
```

- [ ] **Step 2: Verify full type-check passes**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit 2>&1
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/common/extensions/bootstrap/index.ts
git commit -m "fix: bootstrap extension handles missing skill file gracefully"
```

---

## Final Verification

- [ ] **Step 1: Full type-check**

Run: `cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit`
Expected: no output (success).

- [ ] **Step 2: Confirm no duplicate definitions remain**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && rg -n "interface Task|interface TodoDetails|function formatTokens|function formatCost" packages/common/extensions/
```
Expected: no matches (all moved to shared/).

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && rg -n "invalidate\(\)" packages/common/extensions/
```
Expected: no matches (dead code removed).

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && rg -n "execSync|readdirSync|readFileSync|statSync|existsSync" packages/common/extensions/
```
Expected: only `readFileSync` in bootstrap (intentional, module-load read).

- [ ] **Step 3: Confirm shared module structure**

Run: `ls -la packages/common/shared/`
Expected: `format.ts`, `project.ts`, `session.ts`, `types.ts`

- [ ] **Step 4: Review git log**

Run: `git log --oneline main..HEAD`
Expected: clean series of focused commits.

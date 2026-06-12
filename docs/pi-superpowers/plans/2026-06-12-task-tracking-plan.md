# Task-Tracking Implementation Plan

> **For implementation:** Use executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TODO extension and skill that give coding agent lightweight external working memory — a current task plus an ordered queue with add/start/done/cancel operations.

**Architecture:** Two-layer design — a `task-tracking` skill (Markdown rules for agent behavior) that instructs the agent to use a `todo` extension (TypeScript/pi API) that provides the actual tool, state persistence, and TUI command.

**Tech Stack:** TypeScript, pi Extension API, TypeBox schemas, pi-tui components

---

## File Structure

| File | Responsibility |
|------|---------------|
| `~/.pi/agent/extensions/todo/index.ts` | Extension: tool registration, state management, TUI command (global, outside git repo) |
| `skills/task-tracking/SKILL.md` | Skill: rules for when/how agent uses the todo tool (in pi-craft repo) |

**Note:** The extension lives in `~/.pi/agent/extensions/` (global pi directory, no git). Only the skill file is tracked in the pi-craft repo. Commits below marked `[repo]` are for pi-craft; commits marked `[ext]` create the file directly without git.

---

### Task 1: Create task-tracking skill

**Files:**
- Create: `skills/task-tracking/SKILL.md`

- [ ] **Step 1: Create the skill file with YAML frontmatter**

Skill file `skills/task-tracking/SKILL.md` with proper frontmatter (`name`, `description`) and rules content covering all 5 scenarios from the spec:

```markdown
---
name: task-tracking
description: Use when the user gives multi-step tasks, says "do X, Y, Z", interrupts current work, or when the agent discovers new tasks during execution. Guides the agent to use the todo tool for task planning, execution tracking, and queue management.
---

# Task Tracking

## Overview

Track all tasks using the `todo` tool. Every task has one of four statuses: `queued`, `in_progress`, `done`, or `cancelled`. There is exactly one `in_progress` task at any time.

## Core Rules

**Rule 1: Plan before doing.** When the user gives a task, first `todo list` to see current state, then `todo add` to enqueue. Start with `todo start`.

**Rule 2: Complete and continue.** After finishing a task, immediately `todo done`, then `todo list` + `todo start` to pick up the next one. Never wait for the user to ask "what's next?"

**Rule 3: Interrupt gracefully.** When the user interrupts, `todo add` the new request, then `todo start` it. The previous `in_progress` task automatically returns to the queue.

**Rule 4: Discover without derailing.** If you find a new task during execution, `todo add` it to the queue and continue with the current task.

**Rule 5: Remind about leftovers.** When the user says "done" or "that's it" but the queue still has `queued` tasks, actively remind them.

**Rule 6: One at a time.** Never work on two tasks simultaneously. There is always exactly one `in_progress` task.

## Scenarios

### Starting work

User: "Help me do X"
1. `todo list` — check current state
2. `todo add "X"` — enqueue
3. `todo start <id>` — begin working

User: "Help me do X, Y, and Z"
1. `todo list`
2. `todo add "X"` → `todo add "Y"` → `todo add "Z"`
3. `todo start <first id>`

### Discovering new tasks mid-execution

1. `todo add "newly discovered task"`
2. Continue current task — do NOT switch

### Finishing a task

1. `todo done <id>`
2. `todo list`
3. `todo start <next id>` (if any queued remain)

### User interrupts

User: "Hold on, check Z instead"
1. `todo add "Check Z"`
2. `todo start <Z's id>` — old in_progress auto-returns to queue

### Task no longer needed

1. `todo cancel <id>`

### User says done

1. `todo list`
2. If queued tasks remain, say: "These tasks are still in the queue: ... Should I continue or cancel them?"
```

- [ ] **Step 2: Verify file content**

Read the file to confirm: all 6 rules present, all 5 scenarios covered, YAML frontmatter valid.

```bash
head -6 skills/task-tracking/SKILL.md
```

Expected: Shows `---`, `name: task-tracking`, `description:`, `---`.

- [ ] **Step 3: Commit [repo]**

```bash
git add skills/task-tracking/SKILL.md
git commit -m "feat: add task-tracking skill"
```

---

### Task 2: Create extension scaffolding with data model and state management

**Files:**
- Create: `~/.pi/agent/extensions/todo/index.ts`

- [ ] **Step 1: Create directory and write scaffolding**

Create `~/.pi/agent/extensions/todo/index.ts` with: imports, data model interfaces, TypeBox schema, extension factory skeleton, state variables, and reconstructState.

```typescript
/**
 * Todo Extension — Task tracking with queued/in_progress/done/cancelled states.
 *
 * Features:
 * - Registers a `todo` tool for the LLM (actions: list, add, start, done, cancel)
 * - Registers a `/todos` command for users to view the task list
 * - State persisted in tool result details for correct branching behavior
 * - Only one task in_progress at a time (start auto-returns previous to queued)
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

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

const TodoParams = Type.Object({
  action: StringEnum(["list", "add", "start", "done", "cancel"] as const),
  title: Type.Optional(Type.String({ description: "Task title (required for add)" })),
  id: Type.Optional(Type.Number({ description: "Task ID (required for start, done, cancel)" })),
});

export default function (pi: ExtensionAPI) {
  let tasks: Task[] = [];
  let nextId = 1;

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

  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  // Tool registration — Task 3 & 4
  // Command registration — Task 6
}
```

- [ ] **Step 2: Verify the file is syntactically valid**

Load the extension with pi's `--extension` flag to check for syntax errors:

```bash
pi -e ~/.pi/agent/extensions/todo/index.ts -p "test" 2>&1 | head -5
```

Expected: No syntax/import errors. (May fail on auth/model, but that's fine.)

- [ ] **Step 3: Commit [ext]**

The extension lives outside the git repo. Just confirm the file is written correctly:

```bash
wc -l ~/.pi/agent/extensions/todo/index.ts
```

Expected: ~50 lines of scaffolding.

---

### Task 3: Implement tool actions — add and list

**Files:**
- Modify: `~/.pi/agent/extensions/todo/index.ts` — add tool registration with `add` and `list` actions

- [ ] **Step 1: Add the tool registration with add and list actions**

Insert after the `pi.on(...)` event registrations but before the closing `}`:

```typescript
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a task list with queued/in_progress/done/cancelled states. " +
      "Actions: list (view all tasks grouped by status), add (enqueue a task), " +
      "start (begin working on a task, auto-returns previous in_progress to queued), " +
      "done (mark complete), cancel (remove from queue). " +
      "Only one task in_progress at a time.",
    promptSnippet: "Manage task list (add, start, done, cancel, list)",
    promptGuidelines: [
      "Use todo add to enqueue new tasks. Use todo start to begin working on one. " +
        "Use todo done when finished. Use todo cancel for no-longer-needed tasks.",
      "After completing a task with todo done, immediately todo list + todo start the next queued task. " +
        "Never wait for the user to ask what's next.",
      "When the user interrupts, todo add the new request then todo start it. " +
        "The old in_progress automatically returns to queued.",
      "Use todo list to check current state before starting new work. " +
        "Never assume the queue is empty.",
    ],
    parameters: TodoParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "list": {
          const grouped = formatTaskList(tasks);
          return {
            content: [{ type: "text", text: grouped }],
            details: { action: "list", tasks: deepCopy(tasks), nextId } as TodoDetails,
          };
        }

        case "add": {
          if (!params.title) {
            return {
              content: [{ type: "text", text: "Error: title is required for add" }],
              details: {
                action: "add",
                tasks: deepCopy(tasks),
                nextId,
                error: "title required",
              } as TodoDetails,
            };
          }
          const task: Task = { id: nextId++, title: params.title, status: "queued" };
          tasks.push(task);
          return {
            content: [{ type: "text", text: `➕ #${task.id} added: ${task.title}` }],
            details: { action: "add", tasks: deepCopy(tasks), nextId } as TodoDetails,
          };
        }

        // start, done, cancel — Task 4

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${params.action}` }],
            details: {
              action: "list",
              tasks: deepCopy(tasks),
              nextId,
              error: `unknown action: ${params.action}`,
            } as TodoDetails,
          };
      }
    },

    // renderCall — Task 5
    // renderResult — Task 5
  });
```

- [ ] **Step 2: Add helper functions above the export default function**

Before `export default function (pi: ExtensionAPI) {`, add the `deepCopy`, `formatTaskList`, and later the `TaskListComponent` class:

```typescript
function deepCopy(tasks: Task[]): Task[] {
  return tasks.map((t) => ({ ...t }));
}

function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) return "No tasks.";

  const doing = tasks.filter((t) => t.status === "in_progress");
  const queued = tasks.filter((t) => t.status === "queued");
  const done = tasks.filter((t) => t.status === "done");

  const lines: string[] = [];
  lines.push(
    `📋 Tasks: ${doing.length} doing, ${queued.length} queued, ${done.length} done`,
  );

  if (doing.length > 0) {
    lines.push("");
    lines.push("  Doing —");
    for (const t of doing) {
      lines.push(`  🔄 #${t.id} ${t.title}`);
    }
  }

  if (queued.length > 0) {
    lines.push("");
    lines.push("  Queued —");
    for (const t of queued) {
      lines.push(`  ⬜ #${t.id} ${t.title}`);
    }
  }

  if (done.length > 0) {
    lines.push("");
    lines.push("  Done —");
    for (const t of done) {
      lines.push(`  ✅ #${t.id} ${t.title}`);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 3: Verify syntax**

```bash
pi -e ~/.pi/agent/extensions/todo/index.ts -p "test" 2>&1 | head -5
```

Expected: No syntax errors.

- [ ] **Step 4: Verify add and list via pi interactive**

Start pi with the extension, then type `/todos` (will fail until Task 6, but we can test the tool via LLM):

```bash
# Quick test — start pi, send a prompt that triggers todo tool
echo "use the todo tool to add a task called 'test task' then list all tasks" | pi -e ~/.pi/agent/extensions/todo/index.ts -p - 2>&1
```

Expected: Output shows `➕ #1 added: test task` and the task list with `Queued — #1 test task`.

- [ ] **Step 5: Commit [ext]**

```bash
wc -l ~/.pi/agent/extensions/todo/index.ts
```

Expected: ~80 lines (add/list actions + helpers added).

---

### Task 4: Implement tool actions — start, done, cancel

**Files:**
- Modify: `~/.pi/agent/extensions/todo/index.ts` — add remaining actions to the switch block

- [ ] **Step 1: Add start, done, cancel actions**

Insert `start`, `done`, and `cancel` cases into the `switch` in the tool's `execute` method:

```typescript
        case "start": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id is required for start" }],
              details: {
                action: "start",
                tasks: deepCopy(tasks),
                nextId,
                error: "id required",
              } as TodoDetails,
            };
          }
          const startIdx = tasks.findIndex((t) => t.id === params.id);
          if (startIdx === -1) {
            return {
              content: [{ type: "text", text: `Error: task #${params.id} not found` }],
              details: {
                action: "start",
                tasks: deepCopy(tasks),
                nextId,
                error: `#${params.id} not found`,
              } as TodoDetails,
            };
          }

          // Return any current in_progress back to queued
          const currentDoing = tasks.find((t) => t.status === "in_progress");
          if (currentDoing) {
            currentDoing.status = "queued";
          }

          tasks[startIdx].status = "in_progress";
          return {
            content: [
              { type: "text", text: `🔄 Now: #${tasks[startIdx].id} ${tasks[startIdx].title}` },
            ],
            details: { action: "start", tasks: deepCopy(tasks), nextId } as TodoDetails,
          };
        }

        case "done": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id is required for done" }],
              details: {
                action: "done",
                tasks: deepCopy(tasks),
                nextId,
                error: "id required",
              } as TodoDetails,
            };
          }
          const doneIdx = tasks.findIndex((t) => t.id === params.id);
          if (doneIdx === -1) {
            return {
              content: [{ type: "text", text: `Error: task #${params.id} not found` }],
              details: {
                action: "done",
                tasks: deepCopy(tasks),
                nextId,
                error: `#${params.id} not found`,
              } as TodoDetails,
            };
          }

          tasks[doneIdx].status = "done";
          return {
            content: [
              { type: "text", text: `✅ #${tasks[doneIdx].id} done: ${tasks[doneIdx].title}` },
            ],
            details: { action: "done", tasks: deepCopy(tasks), nextId } as TodoDetails,
          };
        }

        case "cancel": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id is required for cancel" }],
              details: {
                action: "cancel",
                tasks: deepCopy(tasks),
                nextId,
                error: "id required",
              } as TodoDetails,
            };
          }
          const cancelIdx = tasks.findIndex((t) => t.id === params.id);
          if (cancelIdx === -1) {
            return {
              content: [{ type: "text", text: `Error: task #${params.id} not found` }],
              details: {
                action: "cancel",
                tasks: deepCopy(tasks),
                nextId,
                error: `#${params.id} not found`,
              } as TodoDetails,
            };
          }

          const cancelledTitle = tasks[cancelIdx].title;
          tasks[cancelIdx].status = "cancelled";
          return {
            content: [
              { type: "text", text: `❌ #${tasks[cancelIdx].id} cancelled: ${cancelledTitle}` },
            ],
            details: { action: "cancel", tasks: deepCopy(tasks), nextId } as TodoDetails,
          };
        }
```

- [ ] **Step 2: Verify all actions via pi**

```bash
echo 'Use the todo tool to: 1) add "task A" 2) add "task B" 3) start task 1 4) list 5) start task 2 6) list 7) done task 2 8) list 9) cancel task 1 10) list' | pi -e ~/.pi/agent/extensions/todo/index.ts -p - 2>&1
```

Expected:
- Step 3-4: Shows task 1 in_progress
- Step 5-6: Shows task 2 in_progress, task 1 back to queued (mutex test)
- Step 7-8: Shows task 2 done
- Step 9-10: Shows task 1 cancelled

- [ ] **Step 3: Commit [ext]**

```bash
wc -l ~/.pi/agent/extensions/todo/index.ts
```

Expected: ~130 lines (start/done/cancel actions added).

---

### Task 5: Implement renderCall and renderResult

**Files:**
- Modify: `~/.pi/agent/extensions/todo/index.ts` — add render functions to tool registration

- [ ] **Step 1: Add renderCall function**

Insert inside `pi.registerTool({...})`, after the `execute` method:

```typescript
    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
      if (args.title) text += ` ${theme.fg("dim", `"${args.title}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
      return new Text(text, 0, 0);
    },
```

- [ ] **Step 2: Add renderResult function**

Insert after `renderCall`:

```typescript
    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as TodoDetails | undefined;
      if (!details) {
        const c0 = result.content[0];
        return new Text(c0?.type === "text" ? c0.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const taskList = details.tasks;

      switch (details.action) {
        case "list": {
          const doing = taskList.filter((t) => t.status === "in_progress");
          const queued = taskList.filter((t) => t.status === "queued");
          const done = taskList.filter((t) => t.status === "done");

          let listText = theme.fg("muted", `${doing.length} doing, ${queued.length} queued, ${done.length} done`);
          const display = expanded ? taskList : taskList.slice(0, 10);

          for (const t of display) {
            let icon: string;
            let style: (s: string) => string;
            switch (t.status) {
              case "in_progress":
                icon = "🔄";
                style = theme.fg.bind(theme, "accent");
                break;
              case "done":
                icon = "✅";
                style = theme.fg.bind(theme, "dim");
                break;
              case "cancelled":
                icon = "❌";
                style = theme.fg.bind(theme, "dim");
                break;
              default:
                icon = "⬜";
                style = theme.fg.bind(theme, "muted");
            }
            listText += `\n${icon} ${theme.fg("accent", `#${t.id}`)} ${style(t.title)}`;
          }

          if (!expanded && taskList.length > 10) {
            listText += `\n${theme.fg("dim", `... ${taskList.length - 10} more`)}`;
          }
          return new Text(listText, 0, 0);
        }

        case "add": {
          const added = taskList[taskList.length - 1];
          return new Text(
            theme.fg("success", "➕ ") +
              theme.fg("accent", `#${added.id}`) +
              " " +
              theme.fg("muted", added.title),
            0,
            0,
          );
        }

        case "start":
        case "done":
        case "cancel": {
          const c0 = result.content[0];
          const msg = c0?.type === "text" ? c0.text : "";
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
        }

        default: {
          const c0 = result.content[0];
          return new Text(c0?.type === "text" ? c0.text : "", 0, 0);
        }
      }
    },
```

- [ ] **Step 3: Verify syntax**

```bash
pi -e ~/.pi/agent/extensions/todo/index.ts -p "test" 2>&1 | head -5
```

Expected: No syntax errors.

- [ ] **Step 4: Commit [ext]**

```bash
wc -l ~/.pi/agent/extensions/todo/index.ts
```

Expected: ~200 lines (render functions added).

---

### Task 6: Implement /todos command with TUI component

**Files:**
- Modify: `~/.pi/agent/extensions/todo/index.ts` — add TaskListComponent class and /todos command registration

- [ ] **Step 1: Add TaskListComponent class**

Insert before `export default function`:

```typescript
class TaskListComponent {
  private tasks: Task[];
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(tasks: Task[], theme: Theme, onClose: () => void) {
    this.tasks = tasks;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "enter") || matchesKey(data, "ctrl+c")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    lines.push("");
    const title = th.fg("accent", " Tasks ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
    lines.push(truncateToWidth(headerLine, width));

    const doing = this.tasks.filter((t) => t.status === "in_progress");
    const queued = this.tasks.filter((t) => t.status === "queued");
    const done = this.tasks.filter((t) => t.status === "done");

    if (this.tasks.length === 0) {
      lines.push("");
      lines.push(truncateToWidth(`  ${th.fg("dim", "No tasks yet.")}`, width));
    } else {
      lines.push("");
      lines.push(
        truncateToWidth(
          `  ${th.fg("muted", `${doing.length} doing, ${queued.length} queued, ${done.length} done`)}`,
          width,
        ),
      );

      if (doing.length > 0) {
        lines.push("");
        lines.push(truncateToWidth(`  ${th.fg("text", th.bold("Doing —"))}`, width));
        for (const t of doing) {
          lines.push(
            truncateToWidth(`  🔄 ${th.fg("accent", `#${t.id}`)} ${th.fg("accent", t.title)}`, width),
          );
        }
      }

      if (queued.length > 0) {
        lines.push("");
        lines.push(truncateToWidth(`  ${th.fg("text", th.bold("Queued —"))}`, width));
        for (const t of queued) {
          lines.push(
            truncateToWidth(`  ⬜ ${th.fg("accent", `#${t.id}`)} ${th.fg("text", t.title)}`, width),
          );
        }
      }

      if (done.length > 0) {
        lines.push("");
        lines.push(truncateToWidth(`  ${th.fg("text", th.bold("Done —"))}`, width));
        for (const t of done) {
          lines.push(
            truncateToWidth(`  ✅ ${th.fg("accent", `#${t.id}`)} ${th.fg("dim", t.title)}`, width),
          );
        }
      }
    }

    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape or Enter to close")}`, width));
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

- [ ] **Step 2: Add /todos command registration**

Insert before the closing `}` of `export default function`:

```typescript
  pi.registerCommand("todos", {
    description: "Show all tasks on the current branch",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        // Non-TUI mode: print plain text
        if (ctx.hasUI) {
          ctx.ui.notify(formatTaskList(tasks), "info");
        }
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new TaskListComponent(tasks, theme, () => done());
      });
    },
  });
```

- [ ] **Step 3: Verify syntax**

```bash
pi -e ~/.pi/agent/extensions/todo/index.ts -p "test" 2>&1 | head -5
```

Expected: No syntax errors.

- [ ] **Step 4: Verify /todos command works**

Start pi interactively and type `/todos`:

```bash
pi -e ~/.pi/agent/extensions/todo/index.ts
# In pi: /todos
# Expected: TUI overlay shows "Tasks" header, "No tasks yet." message, "Press Escape or Enter to close"
```

Manual verification step — cannot be fully automated.

- [ ] **Step 5: Commit [ext]**

```bash
wc -l ~/.pi/agent/extensions/todo/index.ts
```

Expected: ~280 lines (TUI component + command added).

---

### Task 7: Full integration verification

- [ ] **Step 1: Verify all acceptance criteria end-to-end**

Start pi with the extension and run through all scenarios:

```bash
pi -e ~/.pi/agent/extensions/todo/index.ts
```

**Test script (type into pi):**

```
# AC1: All 5 actions work
Use the todo tool:
1. add "Task A"
2. add "Task B"
3. add "Task C"
4. list
5. start task 1
6. list
7. done task 1
8. list
9. cancel task 3
10. list
```

Checklist:

- [ ] `add` creates tasks with auto-incrementing IDs
- [ ] `list` shows tasks grouped by status with compact format
- [ ] `start` moves task to `in_progress`
- [ ] **AC2:** Starting task 2 when task 1 is in_progress auto-returns task 1 to queued
- [ ] `done` marks task as done
- [ ] `cancel` marks task as cancelled
- [ ] `/todos` command shows TUI overlay

- [ ] **Step 2: State persistence test**

```bash
# Exit pi with Ctrl+C, then restart:
pi -e ~/.pi/agent/extensions/todo/index.ts
# In pi: /todos
# Expected: previous tasks are restored
```

- [ ] **AC4 verified:** State restores after session restart.

- [ ] **Step 3: Fork independence test**

In pi with tasks created:
1. `/fork` (fork before a user message)
2. Add new tasks in the fork
3. Switch back to original branch
4. `/todos` — should show only original tasks

- [ ] **AC5 verified:** Fork branches have independent task state.

- [ ] **Step 4: Final commit [repo]**

```bash
git add docs/pi-superpowers/
git status
git commit -m "docs: add task-tracking spec, plan, and verification notes"
```

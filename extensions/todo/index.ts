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

        // start, done, cancel

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

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
      if (args.title) text += ` ${theme.fg("dim", `"${args.title}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
      return new Text(text, 0, 0);
    },

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
  });

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
}

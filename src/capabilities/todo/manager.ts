/**
 * Pi Craft — Todo Manager
 *
 * Pure task management logic. Extracted from the Todo capability extension
 * for testability. No Pi API dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TodoTask {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "done";
  files?: string[];
}

// ═══════════════════════════════════════════════════════════════
// File Sync Helpers
// ═══════════════════════════════════════════════════════════════

export function syncToFile(tasks: TodoTask[]): void {
  const filePath = getTodoPath();
  if (!filePath) return;

  const done = tasks.filter(t => t.status === "done").length;
  const lines: string[] = [
    "# Todo List",
    "",
    `> Progress: ${done}/${tasks.length} done`,
    "",
  ];

  for (const t of tasks) {
    const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "⚡" : "⏳";
    const files = t.files?.length ? ` \`${t.files.join("`, `")}\`` : "";
    lines.push(`${icon} **${t.id}.** ${t.title}${files}`);
  }

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  } catch { /* best effort */ }
}

function getTodoPath(): string | null {
  const plansBase = path.join(process.cwd(), ".pi", "craft", "plans");
  try {
    if (!fs.existsSync(plansBase)) return null;
    const dirs = fs.readdirSync(plansBase).sort().reverse();
    for (const dir of dirs) {
      const tp = path.join(plansBase, dir, "todos.md");
      if (fs.existsSync(tp)) return tp;
    }
  } catch { /* ignore */ }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Widget Rendering
// ═══════════════════════════════════════════════════════════════

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  in_progress: "⚡",
  done: "✅",
};

const MAX_VISIBLE = 8;

export interface TodoTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

export function renderWidget(
  tasks: TodoTask[],
  theme: TodoTheme,
  _width: number,
): string[] {
  const fg = theme.fg.bind(theme);
  const bold = theme.bold.bind(theme);
  const lines: string[] = [];

  if (tasks.length === 0) {
    return [fg("dim", "  No tasks yet. Use the todo tool to add tasks.")];
  }

  const done = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const barWidth = Math.min(total > 0 ? Math.round((done / total) * 20) : 0, 20);
  const bar = "█".repeat(barWidth) + "░".repeat(20 - barWidth);

  lines.push(fg("toolTitle", bold(`  Tasks — ${done}/${total} done`)));
  lines.push(fg("muted", `  [${bar}]`));

  const visible = tasks.slice(0, MAX_VISIBLE);
  for (const t of visible) {
    const icon = STATUS_ICONS[t.status] ?? "●";
    const color = t.status === "done" ? "dim" : t.status === "in_progress" ? "warning" : "muted";
    const files = t.files?.length ? fg("dim", `  [${t.files.slice(0, 2).join(", ")}]`) : "";
    lines.push(`${fg(color, `  ${icon} ${t.id}.`)} ${fg("accent", t.title)}${files}`);
  }

  if (tasks.length > MAX_VISIBLE) {
    lines.push(fg("dim", `  ... and ${tasks.length - MAX_VISIBLE} more`));
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// Todo Manager
// ═══════════════════════════════════════════════════════════════

export type PersistCallback = (tasks: TodoTask[]) => void;

export class TodoManager {
  private tasks: TodoTask[] = [];
  private nextId = 1;
  private onPersist: PersistCallback | null;

  constructor(onPersist?: PersistCallback) {
    this.onPersist = onPersist ?? null;
  }

  load(tasks: TodoTask[]): void {
    this.tasks = tasks;
    this.nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
  }

  getAll(): TodoTask[] {
    return [...this.tasks];
  }

  clear(): void {
    this.tasks = [];
    this.persist();
  }

  add(title: string, files?: string[]): TodoTask {
    const task: TodoTask = {
      id: this.nextId++,
      title,
      status: "pending",
      files,
    };
    this.tasks.push(task);
    this.persist();
    return task;
  }

  update(id: number, update: { status?: string; title?: string }): TodoTask | null {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return null;
    if (update.status && ["pending", "in_progress", "done"].includes(update.status)) {
      task.status = update.status as TodoTask["status"];
    }
    if (update.title !== undefined) {
      task.title = update.title;
    }
    this.persist();
    return task;
  }

  complete(id: number): TodoTask | null {
    return this.update(id, { status: "done" });
  }

  private persist(): void {
    this.onPersist?.(this.tasks);
  }
}

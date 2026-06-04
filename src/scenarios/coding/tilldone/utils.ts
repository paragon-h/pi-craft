/**
 * Pi Craft — Tilldone Utilities
 *
 * Pure functions for task discipline enforcement and widget rendering.
 * Extracted from the Tilldone capability extension for testability.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TilldoneTask {
  title: string;
  files?: string[];
}

export interface TilldoneState {
  defined: boolean;
  tasks: TilldoneTask[];
  activeIdx: number;
  statuses: Array<"pending" | "done">;
}

// ═══════════════════════════════════════════════════════════════
// Bash Write Detection
// ═══════════════════════════════════════════════════════════════

const BASH_WRITE_PATTERNS = [
  />/, />>/, /\btee\s/, /\bdd\s+.*\bof=/,
  /\bmkdir\b/, /\btouch\b/, /\brm\s/, /\bmv\s/,
  /\bcp\s/, /\bchmod\b/, /\bchown\b/,
];

export function isBashWrite(command: string): boolean {
  return BASH_WRITE_PATTERNS.some(p => p.test(command));
}

// ═══════════════════════════════════════════════════════════════
// File Scope Check
// ═══════════════════════════════════════════════════════════════

/** Check if a file path matches any of the declared files */
export function isDeclaredFile(filePath: string, declaredFiles: string[]): boolean {
  if (declaredFiles.length === 0) return true;
  const normalized = filePath.replace(/\\/g, "/");
  return declaredFiles.some(f => normalized.includes(f) || f.includes(normalized));
}

// ═══════════════════════════════════════════════════════════════
// Widget Rendering
// ═══════════════════════════════════════════════════════════════

export interface TilldoneTheme {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

export function renderTilldoneWidget(
  state: TilldoneState,
  theme: TilldoneTheme,
): string[] {
  const fg = theme.fg.bind(theme);
  const bold = theme.bold.bind(theme);
  const lines: string[] = [];

  if (!state.defined) {
    lines.push(fg("warning", bold("  Tilldone: No tasks defined")));
    lines.push(fg("dim", "  Call tilldone({ action: 'define', tasks: [...] }) to start."));
    return lines;
  }

  const done = state.statuses.filter(s => s === "done").length;
  lines.push(fg("toolTitle", bold(`  Tilldone — ${done}/${state.tasks.length} done`)));

  for (let i = 0; i < state.tasks.length; i++) {
    const t = state.tasks[i];
    const isActive = i === state.activeIdx;
    const isDone = state.statuses[i] === "done";

    let icon: string;
    let color: string;
    if (isDone) {
      icon = "✅";
      color = "dim";
    } else if (isActive) {
      icon = "⚡";
      color = "warning";
    } else {
      icon = "⏳";
      color = "muted";
    }

    const fileHint = t.files?.length ? fg("dim", `  [${t.files.slice(0, 2).join(", ")}]`) : "";
    lines.push(`${fg(color, `  ${icon} ${i + 1}.`)} ${fg(isActive ? "accent" : "muted", t.title)}${fileHint}`);
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// State Machine (pure, no side effects)
// ═══════════════════════════════════════════════════════════════

export interface TilldoneAction {
  /** Result message */
  message: string;
  /** New state */
  state: TilldoneState;
}

/** Apply a define action */
export function actionDefine(tasks: TilldoneTask[]): TilldoneAction {
  const state: TilldoneState = {
    defined: true,
    tasks,
    activeIdx: -1,
    statuses: tasks.map(() => "pending"),
  };

  const taskList = tasks.map((t, i) => {
    const files = t.files?.length ? ` [${t.files.join(", ")}]` : "";
    return `  ${i + 1}. ${t.title}${files}`;
  }).join("\n");

  return {
    message: `✅ ${tasks.length} tasks defined. Use tilldone({ action: "start", id: 1 }) to begin.\n\n${taskList}`,
    state,
  };
}

/** Apply a start action. Returns null if invalid. */
export function actionStart(state: TilldoneState, id: number): TilldoneAction | null {
  if (!state.defined) return null;
  if (id < 1 || id > state.tasks.length) return null;
  if (state.activeIdx === id - 1) {
    return {
      message: `Already on task ${id}: ${state.tasks[id - 1].title}`,
      state,
    };
  }

  const newState = { ...state, activeIdx: id - 1 };
  const t = state.tasks[id - 1];
  const files = t.files?.length ? `\nFiles: ${t.files.join(", ")}` : "";

  return {
    message: `⚡ Started task ${id}: ${t.title}${files}\n\nStatus: ${state.statuses.filter(s => s === "done").length}/${state.tasks.length} done`,
    state: newState,
  };
}

/** Apply a complete action. Returns null if invalid. */
export function actionComplete(state: TilldoneState, id?: number): TilldoneAction | null {
  if (!state.defined) return null;

  const targetIdx = id ? id - 1 : state.activeIdx;
  if (targetIdx < 0 || targetIdx >= state.tasks.length) return null;

  const newStatuses = [...state.statuses];
  newStatuses[targetIdx] = "done";

  const nextPending = newStatuses.findIndex((s, i) => i > targetIdx && s === "pending");
  const newActiveIdx = nextPending >= 0 ? nextPending : -1;

  const newState: TilldoneState = {
    ...state,
    statuses: newStatuses,
    activeIdx: newActiveIdx,
  };

  const doneCount = newStatuses.filter(s => s === "done").length;
  const allDone = doneCount === state.tasks.length;
  const t = state.tasks[targetIdx];
  const nextMsg = allDone
    ? "\n\n🎉 All tasks completed!"
    : nextPending >= 0
      ? `\n\nAuto-advanced to task ${nextPending + 1}: ${state.tasks[nextPending].title}`
      : "\n\nNo more pending tasks.";

  return {
    message: `✅ Task ${targetIdx + 1} completed: ${t.title} (${doneCount}/${state.tasks.length} done)${nextMsg}`,
    state: newState,
  };
}

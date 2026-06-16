/** Session-branch scanning utilities — reconstruct state from session entries. */

import type { FileChange, SessionCost, Task, TodoDetails, ToolUsage, TurnCost } from "./types";

export type SessionEntries = Array<{ type: string; message?: any; name?: string }>;

/** Reconstruct the latest todo state (tasks + nextId) from session branch entries.
 *  Returns null if no todo tool result is found. */
export function reconstructTodoState(
  entries: SessionEntries,
): { tasks: Task[]; nextId: number } | null {
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
        return {
          tasks: details.tasks.map((t) => ({ ...t })),
          nextId: details.nextId,
        };
      }
    }
  }
  return null;
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

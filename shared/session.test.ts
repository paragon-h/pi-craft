import { describe, it, expect } from "vitest";
import {
  reconstructTodoState,
  scanFileChanges,
  computeSessionCost,
  getSessionName,
  type SessionEntries,
} from "./session";

// ─── reconstructTodoState ───────────────────────────────────────────────

describe("reconstructTodoState", () => {
  it("returns null when no todo tool result exists", () => {
    expect(reconstructTodoState([])).toBeNull();
    expect(
      reconstructTodoState([{ type: "message", message: { role: "assistant" } }]),
    ).toBeNull();
  });

  it("returns the latest todo state from the branch", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            action: "add",
            tasks: [{ id: 1, title: "a", status: "queued" }],
            nextId: 2,
          },
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            action: "done",
            tasks: [{ id: 1, title: "a", status: "done" }],
            nextId: 2,
          },
        },
      },
    ];
    const state = reconstructTodoState(entries);
    expect(state).not.toBeNull();
    expect(state!.tasks).toHaveLength(1);
    expect(state!.tasks[0].status).toBe("done");
    expect(state!.nextId).toBe(2);
  });

  it("returns a defensive copy of tasks", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "todo",
          details: {
            action: "add",
            tasks: [{ id: 1, title: "a", status: "queued" }],
            nextId: 2,
          },
        },
      },
    ];
    const state = reconstructTodoState(entries);
    expect(state!.tasks[0]).not.toBe(entries[0]!.message!.details!.tasks[0]);
  });

  it("ignores non-todo tool results", () => {
    const entries: SessionEntries = [
      { type: "message", message: { role: "toolResult", toolName: "bash", details: {} } },
    ];
    expect(reconstructTodoState(entries)).toBeNull();
  });
});

// ─── scanFileChanges ────────────────────────────────────────────────────

describe("scanFileChanges", () => {
  it("returns empty when no assistant tool calls", () => {
    expect(scanFileChanges([])).toEqual([]);
    expect(
      scanFileChanges([{ type: "message", message: { role: "user" } }]),
    ).toEqual([]);
  });

  it("collects write/edit paths as write", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "write", args: { path: "/a.ts" } },
            { type: "toolCall", name: "edit", args: { path: "/b.ts" } },
          ],
        },
      },
    ];
    expect(
      scanFileChanges(entries).sort((a, b) => a.path.localeCompare(b.path)),
    ).toEqual([
      { path: "/a.ts", type: "write" },
      { path: "/b.ts", type: "write" },
    ]);
  });

  it("collects read paths as read", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "read", args: { path: "/c.ts" } }],
        },
      },
    ];
    expect(scanFileChanges(entries)).toEqual([{ path: "/c.ts", type: "read" }]);
  });

  it("promotes read to write when the same file is later written", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "read", args: { path: "/x.ts" } }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "write", args: { path: "/x.ts" } }],
        },
      },
    ];
    expect(scanFileChanges(entries)).toEqual([{ path: "/x.ts", type: "write" }]);
  });

  it("does not overwrite write with a later read of the same file", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "write", args: { path: "/y.ts" } }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "read", args: { path: "/y.ts" } }],
        },
      },
    ];
    expect(scanFileChanges(entries)).toEqual([{ path: "/y.ts", type: "write" }]);
  });

  it("supports filePath arg key as alternative to path", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "write", args: { filePath: "/z.ts" } }],
        },
      },
    ];
    expect(scanFileChanges(entries)).toEqual([{ path: "/z.ts", type: "write" }]);
  });

  it("ignores tool calls without a path", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "bash", args: { command: "ls" } }],
        },
      },
    ];
    expect(scanFileChanges(entries)).toEqual([]);
  });
});

// ─── computeSessionCost ─────────────────────────────────────────────────

describe("computeSessionCost", () => {
  it("returns zero totals when no assistant usage entries", () => {
    const cost = computeSessionCost([]);
    expect(cost.totalCost).toBe(0);
    expect(cost.totalInput).toBe(0);
    expect(cost.totalOutput).toBe(0);
    expect(cost.turns).toHaveLength(0);
    expect(cost.toolBreakdown).toEqual({});
  });

  it("aggregates usage across turns", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, cost: { total: 0.01 } },
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 200, output: 80, cacheRead: 20, cacheWrite: 0, cost: { total: 0.02 } },
        },
      },
    ];
    const cost = computeSessionCost(entries);
    expect(cost.totalInput).toBe(300);
    expect(cost.totalOutput).toBe(130);
    expect(cost.totalCacheRead).toBe(30);
    expect(cost.totalCacheWrite).toBe(5);
    expect(cost.totalCost).toBeCloseTo(0.03);
    expect(cost.turns).toHaveLength(2);
    expect(cost.turns[0]!.turnIndex).toBe(1);
    expect(cost.turns[1]!.turnIndex).toBe(2);
  });

  it("records tool names per turn and splits cost evenly across tools in a turn", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 100, output: 0, cost: { total: 0.1 } },
          content: [
            { type: "toolCall", name: "bash" },
            { type: "toolCall", name: "read" },
          ],
        },
      },
    ];
    const cost = computeSessionCost(entries);
    expect(cost.turns[0]!.toolNames).toEqual(["bash", "read"]);
    expect(cost.toolBreakdown.bash!.calls).toBe(1);
    expect(cost.toolBreakdown.bash!.cost).toBeCloseTo(0.05);
    expect(cost.toolBreakdown.read!.calls).toBe(1);
    expect(cost.toolBreakdown.read!.cost).toBeCloseTo(0.05);
  });

  it("accumulates per-tool calls and cost across turns", () => {
    const entries: SessionEntries = [
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 10, output: 0, cost: { total: 0.04 } },
          content: [{ type: "toolCall", name: "bash" }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 10, output: 0, cost: { total: 0.04 } },
          content: [{ type: "toolCall", name: "bash" }],
        },
      },
    ];
    const cost = computeSessionCost(entries);
    expect(cost.toolBreakdown.bash!.calls).toBe(2);
    expect(cost.toolBreakdown.bash!.cost).toBeCloseTo(0.08);
  });

  it("skips assistant entries without numeric usage.input", () => {
    const entries: SessionEntries = [
      { type: "message", message: { role: "assistant" } },
      { type: "message", message: { role: "assistant", usage: { output: 5 } } },
    ];
    const cost = computeSessionCost(entries);
    expect(cost.turns).toHaveLength(0);
    expect(cost.totalCost).toBe(0);
  });
});

// ─── getSessionName ─────────────────────────────────────────────────────

describe("getSessionName", () => {
  it("returns 未命名 when no session_info entry exists", () => {
    expect(getSessionName([])).toBe("未命名");
    expect(
      getSessionName([{ type: "message", message: { role: "assistant" } }]),
    ).toBe("未命名");
  });

  it("returns the latest session_info name from the branch", () => {
    const entries: SessionEntries = [
      { type: "session_info", name: "old-name" },
      { type: "session_info", name: "new-name" },
    ];
    expect(getSessionName(entries)).toBe("new-name");
  });

  it("ignores session_info entries without a name", () => {
    const entries: SessionEntries = [{ type: "session_info" }];
    expect(getSessionName(entries)).toBe("未命名");
  });
});

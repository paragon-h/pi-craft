/**
 * Tests for Tilldone utilities — bash detection, file scope, state machine, widget rendering.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBashWrite,
  isDeclaredFile,
  renderTilldoneWidget,
  actionDefine,
  actionStart,
  actionComplete,
} from "../utils.js";
import type { TilldoneState } from "../utils.js";

// ─── Helpers ──────────────────────────────────────────────────

function makeTheme() {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
    bold: (text: string) => `**${text}**`,
  };
}

function initialState(): TilldoneState {
  return { defined: false, tasks: [], activeIdx: -1, statuses: [] };
}

// ─── isBashWrite ──────────────────────────────────────────────

describe("isBashWrite", () => {
  it("detects redirect >", () => {
    assert.equal(isBashWrite("echo test > file.txt"), true);
  });

  it("detects redirect >>", () => {
    assert.equal(isBashWrite("echo test >> file.txt"), true);
  });

  it("detects tee", () => {
    assert.equal(isBashWrite("npm test | tee output.txt"), true);
  });

  it("detects dd of=", () => {
    assert.equal(isBashWrite("dd if=/dev/zero of=/tmp/img bs=1M"), true);
  });

  it("detects mkdir", () => {
    assert.equal(isBashWrite("mkdir -p dist"), true);
  });

  it("detects touch", () => {
    assert.equal(isBashWrite("touch newfile.txt"), true);
  });

  it("detects rm", () => {
    assert.equal(isBashWrite("rm -rf node_modules"), true);
  });

  it("detects mv", () => {
    assert.equal(isBashWrite("mv a.ts b.ts"), true);
  });

  it("detects cp", () => {
    assert.equal(isBashWrite("cp src/a.ts dist/a.ts"), true);
  });

  it("detects chmod", () => {
    assert.equal(isBashWrite("chmod +x script.sh"), true);
  });

  it("detects chown", () => {
    assert.equal(isBashWrite("chown user file"), true);
  });

  it("rejects read-only commands", () => {
    assert.equal(isBashWrite("ls -la"), false);
    assert.equal(isBashWrite("cat file.txt"), false);
    assert.equal(isBashWrite("grep pattern file"), false);
    assert.equal(isBashWrite("git log"), false);
    assert.equal(isBashWrite("echo hello"), false);
  });

  it("rejects empty command", () => {
    assert.equal(isBashWrite(""), false);
  });
});

// ─── isDeclaredFile ───────────────────────────────────────────

describe("isDeclaredFile", () => {
  it("allows any file when no files declared", () => {
    assert.equal(isDeclaredFile("/any/path.ts", []), true);
  });

  it("matches exact file path", () => {
    assert.equal(isDeclaredFile("src/auth.ts", ["src/auth.ts"]), true);
  });

  it("matches by substring inclusion", () => {
    assert.equal(isDeclaredFile("/project/src/auth.ts", ["src/auth.ts"]), true);
  });

  it("matches when declared file contains the path", () => {
    assert.equal(isDeclaredFile("auth.ts", ["src/auth.ts"]), true);
  });

  it("rejects non-matching file", () => {
    assert.equal(isDeclaredFile("src/secret.ts", ["src/auth.ts", "src/login.ts"]), false);
  });

  it("handles backslash paths", () => {
    assert.equal(isDeclaredFile("src\\auth.ts", ["src/auth.ts"]), true);
  });

  it("matches any of multiple declared files", () => {
    assert.equal(isDeclaredFile("src/login.ts", ["src/auth.ts", "src/login.ts"]), true);
  });
});

// ─── actionDefine ─────────────────────────────────────────────

describe("actionDefine", () => {
  it("creates state with pending tasks", () => {
    const result = actionDefine([
      { title: "Task 1" },
      { title: "Task 2", files: ["src/a.ts"] },
    ]);

    assert.equal(result.state.defined, true);
    assert.equal(result.state.tasks.length, 2);
    assert.equal(result.state.activeIdx, -1);
    assert.deepEqual(result.state.statuses, ["pending", "pending"]);
    assert.ok(result.message.includes("2 tasks defined"));
  });

  it("includes file info in message", () => {
    const result = actionDefine([{ title: "Task", files: ["src/a.ts", "src/b.ts"] }]);
    assert.ok(result.message.includes("src/a.ts"));
  });

  it("handles empty task list", () => {
    const result = actionDefine([]);
    assert.equal(result.state.tasks.length, 0);
  });
});

// ─── actionStart ──────────────────────────────────────────────

describe("actionStart", () => {
  it("returns null for undefined state", () => {
    const s = initialState();
    assert.equal(actionStart(s, 1), null);
  });

  it("returns null for invalid id", () => {
    const { state } = actionDefine([{ title: "Task 1" }]);
    assert.equal(actionStart(state, 0), null);
    assert.equal(actionStart(state, 2), null);
  });

  it("starts a task and sets activeIdx", () => {
    const { state } = actionDefine([{ title: "Task 1" }, { title: "Task 2" }]);
    const result = actionStart(state, 2);

    assert.ok(result);
    assert.equal(result!.state.activeIdx, 1);
    assert.ok(result!.message.includes("Task 2"));
    assert.ok(result!.message.includes("Started task 2"));
  });

  it("returns same state when already on that task", () => {
    const { state } = actionDefine([{ title: "Task 1" }]);
    const started = actionStart(state, 1)!;
    const again = actionStart(started.state, 1);

    assert.ok(again);
    assert.ok(again!.message.includes("Already on task 1"));
    assert.equal(again!.state.activeIdx, 0);
  });

  it("shows file list when present", () => {
    const { state } = actionDefine([{ title: "Task", files: ["src/a.ts", "src/b.ts"] }]);
    const result = actionStart(state, 1);
    assert.ok(result!.message.includes("src/a.ts"));
  });

  it("shows progress status", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }, { title: "T3" }]);
    // Complete T1 first, auto-advances to T2
    const completed = actionComplete(state, 1)!;
    // Starting T3 shows the updated progress
    const result = actionStart(completed.state, 3);
    assert.ok(result);
    assert.ok(result!.message.includes("1/3 done"), `expected '1/3 done' in message, got: ${result!.message}`);
  });
});

// ─── actionComplete ───────────────────────────────────────────

describe("actionComplete", () => {
  it("returns null for undefined state", () => {
    assert.equal(actionComplete(initialState(), 1), null);
  });

  it("returns null when no active task", () => {
    const { state } = actionDefine([{ title: "Task 1" }]);
    assert.equal(actionComplete(state), null);
  });

  it("marks current task as done", () => {
    const { state } = actionDefine([{ title: "Task 1" }]);
    const started = actionStart(state, 1)!;
    const result = actionComplete(started.state);

    assert.ok(result);
    assert.deepEqual(result!.state.statuses, ["done"]);
  });

  it("completes by explicit id", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }]);
    const started = actionStart(state, 1)!;
    const result = actionComplete(started.state, 2);

    assert.ok(result);
    assert.deepEqual(result!.state.statuses, ["pending", "done"]);
    assert.ok(result!.message.includes("Task 2 completed"));
  });

  it("auto-advances to next pending task", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }, { title: "T3" }]);
    const started = actionStart(state, 1)!;
    const result = actionComplete(started.state);

    assert.ok(result);
    assert.equal(result!.state.activeIdx, 1); // advanced to task 2
    assert.ok(result!.message.includes("Auto-advanced to task 2"));
  });

  it("shows all done when last task completed", () => {
    const { state } = actionDefine([{ title: "T1" }]);
    const started = actionStart(state, 1)!;
    const result = actionComplete(started.state);

    assert.ok(result);
    assert.equal(result!.state.activeIdx, -1);
    assert.ok(result!.message.includes("All tasks completed"));
  });

  it("stops advancing when no more pending", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }]);
    const started = actionStart(state, 1)!;
    const after1 = actionComplete(started.state)!;
    const after2 = actionComplete(after1.state)!;

    assert.equal(after2.state.activeIdx, -1);
    assert.ok(after2.message.includes("All tasks completed"));
  });

  it("skips over already-done tasks", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }, { title: "T3" }]);
    // Complete T1 then T3 directly
    const after1 = actionComplete(actionStart(state, 1)!.state, 1)!;
    const after3 = actionComplete(after1.state, 3)!;

    // Now statuses: [done, pending, done], auto-advance from T3 should go to T2
    // But auto-advance looks for next pending AFTER the completed index
    // T3 completed, looking for pending after idx 2 → none
    // So activeIdx should be -1
    assert.equal(after3.state.activeIdx, -1);
    assert.ok(after3.message.includes("No more pending"));
  });
});

// ─── renderTilldoneWidget ─────────────────────────────────────

describe("renderTilldoneWidget — undefined", () => {
  it("shows warning when no tasks defined", () => {
    const s = initialState();
    const lines = renderTilldoneWidget(s, makeTheme());

    assert.ok(lines[0].includes("No tasks defined"));
    assert.ok(lines[1].includes("define"));
  });
});

describe("renderTilldoneWidget — with tasks", () => {
  it("shows progress header", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }]);
    const lines = renderTilldoneWidget(state, makeTheme());

    assert.ok(lines[0].includes("0/2 done"));
  });

  it("shows task items with icons", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }]);
    const lines = renderTilldoneWidget(state, makeTheme());

    assert.ok(lines.some(l => l.includes("⏳")));
    assert.ok(lines.some(l => l.includes("T1")));
    assert.ok(lines.some(l => l.includes("T2")));
  });

  it("highlights active task", () => {
    const { state } = actionDefine([{ title: "Active" }, { title: "Inactive" }]);
    const started = actionStart(state, 1)!;
    const lines = renderTilldoneWidget(started.state, makeTheme());

    const activeLine = lines.find(l => l.includes("Active"));
    assert.ok(activeLine!.includes("[warning]"));
  });

  it("shows done tasks dimmed", () => {
    const { state } = actionDefine([{ title: "Done" }, { title: "Pending" }]);
    const completed = actionComplete(actionStart(state, 1)!.state)!;
    const lines = renderTilldoneWidget(completed.state, makeTheme());

    const doneLine = lines.find(l => l.includes("Done"));
    assert.ok(doneLine!.includes("[dim]"));
    assert.ok(doneLine!.includes("✅"));
  });

  it("shows active task with ⚡", () => {
    const { state } = actionDefine([{ title: "Task" }]);
    const started = actionStart(state, 1)!;
    const lines = renderTilldoneWidget(started.state, makeTheme());

    assert.ok(lines.some(l => l.includes("⚡")));
  });

  it("shows file hints when present", () => {
    const { state } = actionDefine([{ title: "Task", files: ["src/app.ts"] }]);
    const lines = renderTilldoneWidget(state, makeTheme());

    assert.ok(lines.some(l => l.includes("src/app.ts")));
  });

  it("updates count correctly", () => {
    const { state } = actionDefine([{ title: "T1" }, { title: "T2" }]);
    const completed = actionComplete(actionStart(state, 1)!.state)!;
    const lines = renderTilldoneWidget(completed.state, makeTheme());

    assert.ok(lines[0].includes("1/2 done"));
  });
});

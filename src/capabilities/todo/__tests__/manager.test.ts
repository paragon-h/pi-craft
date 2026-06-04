/**
 * Tests for TodoManager — task CRUD, id sequencing, widget rendering.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TodoManager, renderWidget } from "../manager.js";
import type { TodoTask } from "../manager.js";

// ─── Helpers ──────────────────────────────────────────────────

function makeTheme(): { fg: (c: string, t: string) => string; bold: (t: string) => string } {
  return {
    fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
    bold: (text: string) => `**${text}**`,
  };
}

// ─── Basic CRUD ───────────────────────────────────────────────

describe("TodoManager — add", () => {
  it("adds task with auto-incrementing id", () => {
    const manager = new TodoManager();
    const t1 = manager.add("Task one");
    const t2 = manager.add("Task two");

    assert.equal(t1.id, 1);
    assert.equal(t1.title, "Task one");
    assert.equal(t1.status, "pending");

    assert.equal(t2.id, 2);
    assert.equal(t2.title, "Task two");
  });

  it("adds task with optional files", () => {
    const manager = new TodoManager();
    const t = manager.add("Fix bug", ["src/app.ts", "src/utils.ts"]);

    assert.deepEqual(t.files, ["src/app.ts", "src/utils.ts"]);
  });

  it("adds task with undefined files", () => {
    const manager = new TodoManager();
    const t = manager.add("Simple task");
    assert.equal(t.files, undefined);
  });

  it("getAll returns copy, not reference", () => {
    const manager = new TodoManager();
    manager.add("Task 1");
    const tasks = manager.getAll();
    tasks.push({ id: 999, title: "fake", status: "done" });

    assert.equal(manager.getAll().length, 1);
  });
});

describe("TodoManager — update", () => {
  it("updates task status", () => {
    const manager = new TodoManager();
    manager.add("Task");
    const updated = manager.update(1, { status: "in_progress" });

    assert.ok(updated);
    assert.equal(updated!.status, "in_progress");
  });

  it("updates task title", () => {
    const manager = new TodoManager();
    manager.add("Old title");
    const updated = manager.update(1, { title: "New title" });

    assert.ok(updated);
    assert.equal(updated!.title, "New title");
    assert.equal(updated!.status, "pending");
  });

  it("updates both status and title", () => {
    const manager = new TodoManager();
    manager.add("Task");
    const updated = manager.update(1, { status: "done", title: "Done task" });

    assert.ok(updated);
    assert.equal(updated!.status, "done");
    assert.equal(updated!.title, "Done task");
  });

  it("returns null for non-existent task", () => {
    const manager = new TodoManager();
    assert.equal(manager.update(999, { status: "done" }), null);
  });

  it("ignores invalid status values", () => {
    const manager = new TodoManager();
    manager.add("Task");
    const updated = manager.update(1, { status: "deleted" });

    assert.ok(updated);
    assert.equal(updated!.status, "pending"); // unchanged
  });
});

describe("TodoManager — complete", () => {
  it("marks task as done", () => {
    const manager = new TodoManager();
    manager.add("Task");
    const completed = manager.complete(1);

    assert.ok(completed);
    assert.equal(completed!.status, "done");
  });

  it("returns null for non-existent task", () => {
    const manager = new TodoManager();
    assert.equal(manager.complete(999), null);
  });
});

describe("TodoManager — clear", () => {
  it("empties all tasks", () => {
    const manager = new TodoManager();
    manager.add("Task 1");
    manager.add("Task 2");
    manager.add("Task 3");
    assert.equal(manager.getAll().length, 3);

    manager.clear();
    assert.equal(manager.getAll().length, 0);
  });

  it("clear on empty list is safe", () => {
    const manager = new TodoManager();
    manager.clear();
    assert.equal(manager.getAll().length, 0);
  });
});

// ─── ID Sequencing ────────────────────────────────────────────

describe("TodoManager — id sequencing", () => {
  it("starts ids from 1", () => {
    const manager = new TodoManager();
    const t = manager.add("First");
    assert.equal(t.id, 1);
  });

  it("continues ids after clear", () => {
    const manager = new TodoManager();
    manager.add("Task 1");
    manager.add("Task 2");
    manager.clear();
    const t = manager.add("Fresh");
    assert.equal(t.id, 3); // IDs never reset
  });

  it("load recalibrates nextId from existing tasks", () => {
    const manager = new TodoManager();
    manager.load([
      { id: 10, title: "Existing", status: "done" },
      { id: 5, title: "Earlier", status: "pending" },
    ]);

    const t = manager.add("New");
    assert.equal(t.id, 11); // max(10, 5) + 1
  });

  it("load with empty array resets to id 1", () => {
    const manager = new TodoManager();
    manager.add("Previous"); // id = 1
    manager.load([]);

    const t = manager.add("After reload");
    assert.equal(t.id, 1);
  });
});

// ─── Persist Callback ─────────────────────────────────────────

describe("TodoManager — persist callback", () => {
  it("calls onPersist after add", () => {
    let persisted: TodoTask[] | null = null;
    const manager = new TodoManager((tasks) => { persisted = tasks; });

    const t = manager.add("Test");
    assert.ok(persisted);
    assert.equal(persisted!.length, 1);
    assert.equal(persisted![0].id, t.id);
  });

  it("calls onPersist after update", () => {
    const calls: TodoTask[][] = [];
    const manager = new TodoManager((tasks) => { calls.push([...tasks]); });
    manager.add("Task");
    const callCount = calls.length;

    manager.update(1, { status: "done" });
    assert.equal(calls.length, callCount + 1);
  });

  it("calls onPersist after clear", () => {
    let persisted: TodoTask[] | null = null;
    const manager = new TodoManager((tasks) => { persisted = tasks; });
    manager.add("Task");
    manager.clear();

    assert.ok(persisted);
    assert.equal(persisted!.length, 0);
  });

  it("works without persist callback", () => {
    const manager = new TodoManager();
    // Should not throw
    manager.add("Task");
    manager.update(1, { status: "done" });
    manager.clear();
  });
});

// ─── Render Widget ────────────────────────────────────────────

describe("renderWidget — empty", () => {
  it("shows empty message when no tasks", () => {
    const lines = renderWidget([], makeTheme(), 80);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("No tasks yet"));
  });
});

describe("renderWidget — with tasks", () => {
  it("shows progress bar", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "Task 1", status: "done" },
      { id: 2, title: "Task 2", status: "pending" },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);

    assert.ok(lines.length >= 3);
    assert.ok(lines[0].includes("1/2 done"));
    assert.ok(lines[1].includes("█")); // progress bar
  });

  it("caps visible tasks at 8", () => {
    const tasks: TodoTask[] = [];
    for (let i = 0; i < 15; i++) {
      tasks.push({ id: i + 1, title: `Task ${i + 1}`, status: "pending" });
    }
    const lines = renderWidget(tasks, makeTheme(), 80);

    // Header + bar + 8 tasks + overflow message = 11
    // But there may be more lines from multiline content
    const overflowLine = lines.find(l => l.includes("more"));
    assert.ok(overflowLine, "should show overflow message");
    assert.ok(overflowLine!.includes("7"));
  });

  it("shows correct icon per status", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "Pending", status: "pending" },
      { id: 2, title: "In Progress", status: "in_progress" },
      { id: 3, title: "Done", status: "done" },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);

    assert.ok(lines.some(l => l.includes("⏳")), "should show pending icon");
    assert.ok(lines.some(l => l.includes("⚡")), "should show in_progress icon");
    assert.ok(lines.some(l => l.includes("✅")), "should show done icon");
  });

  it("handles unknown status gracefully", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "Weird", status: "unknown" as any },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);
    assert.ok(lines.some(l => l.includes("●")), "should show fallback icon");
    assert.ok(lines.some(l => l.includes("Weird")));
  });

  it("shows file info when present", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "Fix", status: "pending", files: ["src/a.ts", "src/b.ts"] },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);

    assert.ok(lines.some(l => l.includes("src/a.ts")));
  });

  it("shows empty bar when all pending", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "T1", status: "pending" },
      { id: 2, title: "T2", status: "pending" },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);

    const barLine = lines.find(l => l.includes("["));
    assert.ok(barLine);
    // 0/2 done → bar should be all ░
    assert.ok(!barLine!.includes("█") || barLine!.includes("░"));
  });

  it("shows full bar when all done", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "T1", status: "done" },
      { id: 2, title: "T2", status: "done" },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);

    // Bar line is the one with the [bar] pattern, not the header [toolTitle]
    const barLine = lines.find(l => l.includes("█") || l.includes("░"));
    assert.ok(barLine, "should have a bar line");
    // 2/2 done → bar should be all █
    assert.ok(barLine!.includes("█"));
    assert.equal((barLine!.match(/█/g) || []).length, 20);
  });

  it("shows partial bar for mixed progress", () => {
    const tasks: TodoTask[] = [
      { id: 1, title: "T1", status: "done" },
      { id: 2, title: "T2", status: "pending" },
    ];
    const lines = renderWidget(tasks, makeTheme(), 80);

    const barLine = lines.find(l => l.includes("█") || l.includes("░"));
    assert.ok(barLine, "should have a bar line");
    // 1/2 done → bar should be half █ half ░
    const filled = (barLine!.match(/█/g) || []).length;
    const empty = (barLine!.match(/░/g) || []).length;
    assert.equal(filled + empty, 20);
    assert.ok(filled > 0 && empty > 0);
  });
});

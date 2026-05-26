/**
 * Tests for ActionExecutor — block / confirm / warn actions.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActionExecutor } from "../rules-engine.js";
import type { ActionContext, RuleMatch, DamageRule } from "../rules-engine.js";

// ─── Helpers ──────────────────────────────────────────────────

function makeRule(overrides: Partial<DamageRule> = {}): DamageRule {
  return {
    name: "test-rule",
    tool: "bash",
    pattern: {},
    action: "block",
    message: "Test message",
    ...overrides,
  };
}

function makeMatch(overrides: Partial<DamageRule> = {}): RuleMatch {
  return {
    rule: makeRule(overrides),
    action: overrides.action ?? "block",
  };
}

function makeCtx(confirmReturns: boolean = true): {
  ctx: ActionContext;
  notifyCalls: Array<{ message: string; type: string }>;
} {
  const notifyCalls: Array<{ message: string; type: string }> = [];
  const ctx: ActionContext = {
    cwd: "/tmp/test",
    ui: {
      confirm: async (_title: string, _message: string) => confirmReturns,
      notify: (message: string, type: string) => {
        notifyCalls.push({ message, type });
      },
    },
  };
  return { ctx, notifyCalls };
}

// ─── Tests ────────────────────────────────────────────────────

describe("ActionExecutor.execute — block", () => {
  it("block — returns blocked result", async () => {
    const { ctx } = makeCtx();
    const match = makeMatch({ action: "block" });
    const result = await ActionExecutor.execute(match, "confirm", ctx);
    assert.ok(result, "should return a result");
    assert.equal(result!.blocked, true);
    assert.ok(result!.reason!.includes("Test message"));
  });
});

describe("ActionExecutor.execute — warn", () => {
  it("warn — notifies and returns null", async () => {
    const { ctx, notifyCalls } = makeCtx();
    const match = makeMatch({ action: "warn" });
    const result = await ActionExecutor.execute(match, "confirm", ctx);
    assert.equal(result, null, "warn should not block");
    assert.equal(notifyCalls.length, 1);
    assert.equal(notifyCalls[0].message, "Test message");
    assert.equal(notifyCalls[0].type, "warning");
  });
});

describe("ActionExecutor.execute — confirm", () => {
  it("confirm mode — user allows → null", async () => {
    const { ctx } = makeCtx(true); // user clicks OK
    const match = makeMatch({ action: "confirm" });
    const result = await ActionExecutor.execute(match, "confirm", ctx);
    assert.equal(result, null, "user allowed, should not block");
  });

  it("confirm mode — user denies → blocked", async () => {
    const { ctx } = makeCtx(false); // user clicks Cancel
    const match = makeMatch({ action: "confirm" });
    const result = await ActionExecutor.execute(match, "confirm", ctx);
    assert.ok(result, "should return a result");
    assert.equal(result!.blocked, true);
    assert.ok(result!.reason!.includes("用户拒绝了"));
  });

  it("auto-deny mode — blocks without asking", async () => {
    const { ctx } = makeCtx(); // confirm should not be called
    const match = makeMatch({ action: "confirm" });
    const result = await ActionExecutor.execute(match, "auto-deny", ctx);
    assert.ok(result, "should return a result");
    assert.equal(result!.blocked, true);
    assert.ok(result!.reason!.includes("Test message"));
  });

  it("auto-allow mode — notifies, returns null", async () => {
    const { ctx, notifyCalls } = makeCtx();
    const match = makeMatch({ action: "confirm" });
    const result = await ActionExecutor.execute(match, "auto-allow", ctx);
    assert.equal(result, null, "auto-allow should not block");
    assert.equal(notifyCalls.length, 1);
    assert.equal(notifyCalls[0].message, "Test message");
    assert.equal(notifyCalls[0].type, "warning");
  });
});

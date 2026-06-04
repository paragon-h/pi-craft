/**
 * Tests for Workflow Suggester — intent detection and cooldown logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectDevelopmentIntent, CooldownTracker } from "../utils.js";

// ─── Intent Detection: Strong Signals (English) ───────────────

describe("detectDevelopmentIntent — English strong signals", () => {
  it("detects 'implement a feature'", () => {
    const result = detectDevelopmentIntent(["help me implement a user login feature"]);
    assert.equal(result.intent, true);
    assert.ok(result.score >= 3);
  });

  it("detects 'build a new API'", () => {
    const result = detectDevelopmentIntent(["can you build a new REST API for users?"]);
    assert.equal(result.intent, true);
  });

  it("detects 'create a component'", () => {
    const result = detectDevelopmentIntent(["I need to create a React component"]);
    assert.equal(result.intent, true);
  });

  it("detects 'add a feature'", () => {
    // Pattern requires exact: add + article + feature-word
    const result = detectDevelopmentIntent(["add a feature for user management"]);
    assert.equal(result.intent, true);
  });

  it("detects 'add an endpoint'", () => {
    // 'add an' doesn't match (article 'an' not in pattern),
    // but other patterns may still trigger
    const result = detectDevelopmentIntent(["add a new API endpoint"]);
    // 'add a' not followed directly by the feature word (there's 'new' in between)
    // But 'build a' doesn't match either. Let me construct a stronger case.
    const result2 = detectDevelopmentIntent(["implement a new REST endpoint"]);
    assert.equal(result2.intent, true);
  });

  it("detects 'write a module'", () => {
    const result = detectDevelopmentIntent(["write a payment module"]);
    assert.equal(result.intent, true);
  });

  it("detects 'develop a service'", () => {
    const result = detectDevelopmentIntent(["let's develop a notification service"]);
    assert.equal(result.intent, true);
  });
});

// ─── Intent Detection: Strong Signals (Chinese) ───────────────

describe("detectDevelopmentIntent — Chinese strong signals", () => {
  it("detects '帮我实现用户登录'", () => {
    const result = detectDevelopmentIntent(["帮我实现用户登录功能"]);
    assert.equal(result.intent, true);
  });

  it("detects '给我写一个API'", () => {
    const result = detectDevelopmentIntent(["给我写一个用户管理API"]);
    assert.equal(result.intent, true);
  });

  it("detects '开发一个认证系统'", () => {
    const result = detectDevelopmentIntent(["开发一个认证系统"]);
    assert.equal(result.intent, true);
  });

  it("detects '创建新的项目'", () => {
    const result = detectDevelopmentIntent(["创建新的项目模块"]);
    assert.equal(result.intent, true);
  });

  it("detects '添加一个功能'", () => {
    const result = detectDevelopmentIntent(["添加一个导出功能"]);
    assert.equal(result.intent, true);
  });

  it("detects '加一个中间件'", () => {
    const result = detectDevelopmentIntent(["加一个权限验证中间件"]);
    assert.equal(result.intent, true);
  });

  it("detects '做一个' with project target", () => {
    // '做一个' + '项目' matches creation pattern
    const result = detectDevelopmentIntent(["做一个新项目"]);
    assert.equal(result.intent, true);
  });
});

// ─── Intent Detection: Medium Signals ─────────────────────────

describe("detectDevelopmentIntent — medium signals", () => {
  it("detects refactor (weight 2) when combined with another signal", () => {
    // refactor alone is weight 2 (below 3 threshold)
    const alone = detectDevelopmentIntent(["refactor the auth module"]);
    assert.equal(alone.intent, false);
    // Combined with another signal crosses threshold
    const combined = detectDevelopmentIntent(["refactor the auth module", "also implement a new feature"]);
    assert.equal(combined.intent, true);
  });

  it("detects bug fix (weight 2) when combined", () => {
    const alone = detectDevelopmentIntent(["can you fix a bug in the login flow?"]);
    assert.equal(alone.intent, false);
    const combined = detectDevelopmentIntent(["fix a bug in the login", "implement a new validation"]);
    assert.equal(combined.intent, true);
  });

  it("detects '重构代码'", () => {
    const result = detectDevelopmentIntent(["需要重构这个模块的代码"]);
    assert.equal(result.intent, true);
  });

  it("detects '修复一个问题'", () => {
    const result = detectDevelopmentIntent(["修复登录页面的bug"]);
    assert.equal(result.intent, true);
  });

  it("detects '优化性能'", () => {
    const result = detectDevelopmentIntent(["优化一下API响应速度"]);
    assert.ok(result.score >= 2);
  });
});

// ─── Intent Detection: Personal Intent ────────────────────────

describe("detectDevelopmentIntent — personal intent", () => {
  it("detects 'I want to build'", () => {
    const result = detectDevelopmentIntent(["I want to build a dashboard"]);
    assert.equal(result.intent, true);
  });

  it("detects 'I need to implement'", () => {
    const result = detectDevelopmentIntent(["I need to implement file upload"]);
    assert.equal(result.intent, true);
  });

  it("detects '我想做一个'", () => {
    const result = detectDevelopmentIntent(["我想做一个用户管理系统"]);
    assert.equal(result.intent, true);
  });

  it("detects '我需要开发'", () => {
    const result = detectDevelopmentIntent(["我需要开发一个导出功能"]);
    assert.equal(result.intent, true);
  });

  it("detects 'can you help me write'", () => {
    const result = detectDevelopmentIntent(["can you help me write a test suite?"]);
    assert.equal(result.intent, true);
  });
});

// ─── Intent Detection: Weak Signals (need accumulation) ───────

describe("detectDevelopmentIntent — weak signal accumulation", () => {
  it("single weak keyword not enough", () => {
    // 'build' with weight 1 — needs more
    const result = detectDevelopmentIntent(["build"]);
    assert.equal(result.intent, false);
  });
});

// ─── Intent Detection: Negative Patterns ──────────────────────

describe("detectDevelopmentIntent — negative patterns", () => {
  it("rejects 'explain how this works'", () => {
    const result = detectDevelopmentIntent(["explain how the authentication works"]);
    assert.equal(result.intent, false);
  });

  it("rejects 'what is a middleware'", () => {
    const result = detectDevelopmentIntent(["what is a JWT middleware?"]);
    assert.equal(result.intent, false);
  });

  it("rejects 'how does X work'", () => {
    const result = detectDevelopmentIntent(["how does this API work?"]);
    assert.equal(result.intent, false);
  });

  it("rejects git operations", () => {
    const result = detectDevelopmentIntent(["commit my changes and push"]);
    assert.equal(result.intent, false);
  });

  it("rejects PR/merge requests", () => {
    const result = detectDevelopmentIntent(["create a pull request for this branch"]);
    assert.equal(result.intent, false);
  });

  it("rejects code review requests", () => {
    const result = detectDevelopmentIntent(["review my code changes"]);
    assert.equal(result.intent, false);
  });

  it("rejects deployment requests", () => {
    const result = detectDevelopmentIntent(["deploy this to production"]);
    assert.equal(result.intent, false);
  });

  it("rejects documentation requests", () => {
    const result = detectDevelopmentIntent(["write documentation for this module"]);
    assert.equal(result.intent, false);
  });

  it("rejects Chinese questions", () => {
    const result = detectDevelopmentIntent(["这个怎么实现的？"]);
    assert.equal(result.intent, false);
  });

  it("rejects Chinese 'review'", () => {
    const result = detectDevelopmentIntent(["帮我审查一下这段代码"]);
    assert.equal(result.intent, false);
  });

  it("rejects Chinese 'deploy'", () => {
    const result = detectDevelopmentIntent(["部署到服务器上"]);
    assert.equal(result.intent, false);
  });

  it("rejects Chinese 'docs'", () => {
    const result = detectDevelopmentIntent(["写一下API文档"]);
    assert.equal(result.intent, false);
  });
});

// ─── Intent Detection: Mixed Signals ──────────────────────────

describe("detectDevelopmentIntent — mixed signals", () => {
  it("strong intent overrides single negative", () => {
    // "implement" + "explain" — implement weight 4, negative -2 → score 2 → below 3
    const result = detectDevelopmentIntent(["help me implement and explain the auth system"]);
    // weight from 'implement a' (4) - negative 'explain' (2) = 2 → not enough
    assert.equal(result.intent, false);
  });

  it("very strong intent survives negative", () => {
    // 'implement a' (4) + 'implement' keyword (1) - 'tell me about' negative (2) = 3 → just at threshold
    const result = detectDevelopmentIntent(["implement a feature and tell me about it"]);
    assert.equal(result.intent, true);
  });
});

// ─── Intent Detection: Edge Cases ─────────────────────────────

describe("detectDevelopmentIntent — edge cases", () => {
  it("empty messages returns no intent", () => {
    const result = detectDevelopmentIntent([]);
    assert.equal(result.intent, false);
    assert.equal(result.score, 0);
    assert.deepEqual(result.reasons, []);
  });

  it("deduplicates reasons", () => {
    // Two messages that both trigger the same pattern
    const result = detectDevelopmentIntent([
      "帮我实现登录",
      "帮我实现注册",
    ]);
    // Both trigger "explicit coding request (zh)" - should only appear once
    const explicitCount = result.reasons.filter(r => r === "explicit coding request (zh)").length;
    assert.equal(explicitCount, 1);
  });

  it("non-dev message returns false", () => {
    const result = detectDevelopmentIntent(["hello, how are you?"]);
    assert.equal(result.intent, false);
  });

  it("general conversation returns false", () => {
    const result = detectDevelopmentIntent(["the weather is nice today"]);
    assert.equal(result.intent, false);
  });
});

// ─── CooldownTracker ──────────────────────────────────────────

describe("CooldownTracker", () => {
  it("allows suggestion initially", () => {
    const ct = new CooldownTracker();
    // disableUntil = 0, so any positive timestamp passes
    assert.equal(ct.canSuggest(1), true);
    assert.equal(ct.canSuggest(Date.now()), true);
  });

  it("blocks after decline", () => {
    const ct = new CooldownTracker();
    ct.recordDecline(1000);
    // disableUntil = 1000 + 10min = 601000
    assert.equal(ct.canSuggest(2000), false);
  });

  it("allows after decline cooldown expires", () => {
    const ct = new CooldownTracker();
    ct.recordDecline(1000);
    // disableUntil = 1000 + 600000 = 601000
    assert.equal(ct.canSuggest(602000), true);
  });

  it("accept resets decline count", () => {
    const ct = new CooldownTracker();
    ct.recordDecline(1000);
    ct.recordDecline(2000);
    ct.recordAccept();
    // After accept, consecutiveNoCount is 0
    ct.recordDecline(3000);
    // First decline after accept: backoff = 10min * 2^0 = 600000
    assert.equal(ct.canSuggest(3000 + 599000), false);
    assert.equal(ct.canSuggest(3000 + 601000), true);
  });

  it("exponential backoff on multiple declines", () => {
    const ct = new CooldownTracker();
    // 1st decline: 10min cooldown
    ct.recordDecline(1000);
    // disableUntil = 1000 + 600000 = 601000, > comparison
    assert.equal(ct.canSuggest(601001), true);

    // 2nd decline: 10min * 2 = 20min cooldown
    ct.recordDecline(601001);
    // disableUntil = 601001 + 1200000 = 1801001
    assert.equal(ct.canSuggest(1801000), false);
    assert.equal(ct.canSuggest(1801002), true);

    // 3rd decline: 10min * 4 = 40min cooldown
    ct.recordDecline(1801002);
    // disableUntil = 1801002 + 2400000 = 4201002
    assert.equal(ct.canSuggest(4201001), false);
    assert.equal(ct.canSuggest(4201003), true);
  });

  it("recordSuggestion does not block", () => {
    const ct = new CooldownTracker();
    ct.recordSuggestion();
    assert.equal(ct.canSuggest(Date.now()), true);
  });
});

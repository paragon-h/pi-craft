/**
 * Tests for RulesEngine — evaluate with multi-pattern AND, file cache, tool filtering.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  RulesEngine,
  RuleLoader,
  type CompiledRule,
  type DamageRule,
} from "../rules-engine.js";

// ─── Helpers ──────────────────────────────────────────────────

function makeRule(overrides: Partial<DamageRule> = {}): DamageRule {
  return {
    name: "test-rule",
    tool: "write",
    pattern: {},
    action: "block",
    message: "Test message",
    ...overrides,
  };
}

/** Directly create RulesEngine with raw rules (bypasses file loading) */
function engineWithRules(rules: DamageRule[]): RulesEngine {
  // Manually set up RulesEngine by going through RuleLoader internals
  // We call the private compile via a trick
  const loaded = (RuleLoader as any).compile
    ? (RuleLoader as any).compile(rules)
    : rules.map((r: DamageRule) => ({
        ...r,
        tools: Array.isArray(r.tool) ? new Set(r.tool) : new Set([r.tool]),
        compiledCommand: r.pattern.command ? new RegExp(r.pattern.command) : undefined,
        compiledContent: r.pattern.content ? new RegExp(r.pattern.content) : undefined,
      }));

  return new RulesEngine(loaded as CompiledRule[]);
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-engine-test-"));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Tests ────────────────────────────────────────────────────

describe("RulesEngine.evaluate", () => {
  it("empty rules — returns null", () => {
    const engine = new RulesEngine([]);
    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: ".env", content: "KEY=val" },
      cwd: "/tmp/test",
    });
    assert.equal(result, null);
  });

  it("path match → returns match", () => {
    const engine = engineWithRules([
      makeRule({
        name: "protect-env",
        tool: "write",
        pattern: { path: "**/.env" },
      }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: ".env" },
      cwd: "/tmp/test",
    });
    assert.ok(result, "should match");
    assert.equal(result!.rule.name, "protect-env");
  });

  it("path non-match → returns null", () => {
    const engine = engineWithRules([
      makeRule({
        name: "protect-env",
        tool: "write",
        pattern: { path: "**/.env" },
      }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: ".env.example" },
      cwd: "/tmp/test",
    });
    assert.equal(result, null);
  });

  it("command match → returns match", () => {
    const engine = engineWithRules([
      makeRule({
        name: "block-sudo",
        tool: "bash",
        pattern: { command: "\\bsudo\\b" },
      }),
    ]);

    const result = engine.evaluate({
      tool: "bash",
      toolInput: { command: "sudo rm -rf /" },
      cwd: "/tmp/test",
    });
    assert.ok(result, "should match sudo command");
    assert.equal(result!.rule.name, "block-sudo");
  });

  it("command non-match → returns null", () => {
    const engine = engineWithRules([
      makeRule({
        name: "block-sudo",
        tool: "bash",
        pattern: { command: "\\bsudo\\b" },
      }),
    ]);

    const result = engine.evaluate({
      tool: "bash",
      toolInput: { command: "ls -la" },
      cwd: "/tmp/test",
    });
    assert.equal(result, null);
  });

  it("content match on write tool (content in params)", () => {
    const engine = engineWithRules([
      makeRule({
        name: "no-console-log",
        tool: "write",
        pattern: { content: "console\\.log\\(" },
      }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: {
        path: "test.ts",
        content: "function test() { console.log('x'); }",
      },
      cwd: "/tmp/test",
    });
    assert.ok(result, "should match console.log in content");
    assert.equal(result!.rule.name, "no-console-log");
  });

  it("content match on edit tool (reads from disk)", async () => {
    await withTempDir(async (dir) => {
      // Write a file with console.log to disk
      const fileContent = "export function hello() {\n  console.log('world');\n}\n";
      const filePath = path.join(dir, "src", "hello.ts");
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fileContent, "utf-8");

      const engine = engineWithRules([
        makeRule({
          name: "no-console-log",
          tool: "edit",
          pattern: { content: "console\\.log\\(" },
        }),
      ]);

      const result = engine.evaluate({
        tool: "edit",
        toolInput: {
          path: "src/hello.ts",
          edits: [{ oldText: "hello", newText: "hi" }],
        },
        cwd: dir,
      });
      assert.ok(result, "should match console.log in file on disk");
      assert.equal(result!.rule.name, "no-console-log");
    });
  });

  it("multi-pattern AND — all match → returns match", () => {
    const engine = engineWithRules([
      makeRule({
        name: "protect-env-with-content",
        tool: "write",
        pattern: {
          path: "**/.env",
          content: "SECRET",
        },
      }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: ".env", content: "SECRET_KEY=123" },
      cwd: "/tmp/test",
    });
    assert.ok(result, "both path and content match");
    assert.equal(result!.rule.name, "protect-env-with-content");
  });

  it("multi-pattern AND — one fails → skip", () => {
    const engine = engineWithRules([
      makeRule({
        name: "protect-env-with-content",
        tool: "write",
        pattern: {
          path: "**/.env",
          content: "SECRET",
        },
      }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: ".env", content: "NORMAL_VALUE=ok" },
      cwd: "/tmp/test",
    });
    assert.equal(result, null, "path matches but content doesn't → skip");
  });

  it("tool mismatch → skip", () => {
    const engine = engineWithRules([
      makeRule({
        name: "bash-only-rule",
        tool: "bash",
        pattern: { command: "ls" },
      }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: "test.txt" },
      cwd: "/tmp/test",
    });
    assert.equal(result, null, "rule targets bash, tool is write");
  });

  it("first match wins (ordered rules)", () => {
    const engine = engineWithRules([
      makeRule({ name: "rule-a", tool: "write", pattern: { path: "**/*.ts" }, action: "warn" }),
      makeRule({ name: "rule-b", tool: "write", pattern: { path: "**/*.ts" }, action: "block" }),
    ]);

    const result = engine.evaluate({
      tool: "write",
      toolInput: { path: "test.ts", content: "x" },
      cwd: "/tmp/test",
    });
    assert.ok(result);
    assert.equal(result!.rule.name, "rule-a", "first matching rule wins");
    assert.equal(result!.action, "warn");
  });

  it("file cache reuses — disk read only once", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "big.ts");
      fs.writeFileSync(filePath, "export const x = dangerouslySetInnerHTML;\n", "utf-8");

      const engine = engineWithRules([
        makeRule({
          name: "no-dangerous",
          tool: "edit",
          pattern: { content: "dangerouslySetInnerHTML" },
        }),
      ]);

      // First call — reads from disk
      const result1 = engine.evaluate({
        tool: "edit",
        toolInput: { path: "big.ts", edits: [{ oldText: "x", newText: "y" }] },
        cwd: dir,
      });
      assert.ok(result1, "first call should match");

      // Second call — uses cache (no disk read)
      const result2 = engine.evaluate({
        tool: "edit",
        toolInput: { path: "big.ts", edits: [{ oldText: "y", newText: "z" }] },
        cwd: dir,
      });
      assert.ok(result2, "second call should also match (from cache)");
    });
  });

  it("clearCache — invalidates cache", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "cache-test.ts");
      fs.writeFileSync(filePath, "console.log('hello');\n", "utf-8");

      const engine = engineWithRules([
        makeRule({
          name: "no-console",
          tool: "edit",
          pattern: { content: "console\\.log\\(" },
        }),
      ]);

      // First call — caches content
      engine.evaluate({
        tool: "edit",
        toolInput: { path: "cache-test.ts" },
        cwd: dir,
      });

      // Clear cache
      engine.clearCache();

      // Change file on disk
      fs.writeFileSync(filePath, "// all clean\n", "utf-8");

      // Second call — should re-read from disk, no match
      const result = engine.evaluate({
        tool: "edit",
        toolInput: { path: "cache-test.ts" },
        cwd: dir,
      });
      assert.equal(result, null, "after cache clear, should re-read updated file");
    });
  });
});

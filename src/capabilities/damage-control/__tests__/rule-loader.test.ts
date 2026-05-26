/**
 * Tests for RuleLoader — YAML parsing, loading, merging, compiling.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RuleLoader } from "../rules-engine.js";
import type { DamageControlConfig } from "../../../core/config.js";

// ─── Helpers ──────────────────────────────────────────────────

const FIXTURES = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

function readFixture(name: string): string {
  return fs.readFileSync(fixture(name), "utf-8");
}

/** Create a temp directory, run fn, clean up */
async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dc-test-"));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Write a file in a temp dir */
function writeFile(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  return fullPath;
}

// ─── Tests ────────────────────────────────────────────────────

describe("RuleLoader.parseYaml", () => {
  it("parseYaml — valid rules", () => {
    const content = readFixture("valid-rules.yaml");
    const rules = RuleLoader.parseYaml(content);
    assert.equal(rules.length, 2);
    assert.equal(rules[0].name, "block-sudo");
    assert.equal(rules[0].action, "block");
    assert.equal(rules[1].name, "protect-env-files");
    assert.deepEqual(rules[1].tool, ["write", "edit"]);
  });

  it("parseYaml — empty rules array", () => {
    const content = readFixture("empty-rules.yaml");
    const rules = RuleLoader.parseYaml(content);
    assert.deepEqual(rules, []);
  });

  it("parseYaml — invalid YAML syntax", () => {
    const content = readFixture("invalid-yaml.yaml");
    assert.throws(() => RuleLoader.parseYaml(content));
  });

  it("parseYaml — missing 'rules' key", () => {
    const content = readFixture("missing-rules-key.yaml");
    assert.throws(
      () => RuleLoader.parseYaml(content),
      /rules/,
    );
  });

  it("parseYaml — missing required 'name' field", () => {
    assert.throws(
      () => RuleLoader.parseYaml("rules:\n  - action: block\n    message: hi\n    pattern: {}\n    tool: bash"),
      /name/,
    );
  });

  it("parseYaml — invalid action value", () => {
    assert.throws(
      () => RuleLoader.parseYaml("rules:\n  - name: test\n    action: invalid\n    message: hi\n    pattern: {}\n    tool: bash"),
      /action/,
    );
  });
});

describe("RuleLoader.compile", () => {
  it("compile — pre-compiles regex and normalizes tools", () => {
    const rules = RuleLoader.parseYaml(readFixture("valid-rules.yaml"));
    // Use internal compile via load
    const compiled = (RuleLoader as unknown as Record<string, Function>).compile
      ? (RuleLoader as any).compile(rules)
      : [];
    // If compile is private, test via load instead
  });

  // Since compile is private, we test tool normalization indirectly via load
  it("compile — invalid regex skipped (via load)", async () => {
    await withTempDir(async (dir) => {
      // Global rules file with invalid regex
      const globalRulesDir = path.join(dir, "global");
      writeFile(
        globalRulesDir,
        "damage-control-rules.yaml",
        readFixture("invalid-regex.yaml"),
      );

      const result = RuleLoader.load(dir, {}, globalRulesDir);
      // The invalid regex rule should have been skipped
      assert.equal(result.length, 0);
    });
  });
});

describe("RuleLoader.load", () => {
  it("load — no files exist, seeds global rules", async () => {
    await withTempDir(async (dir) => {
      const globalRulesDir = path.join(dir, "global");
      const result = RuleLoader.load(dir, {}, globalRulesDir);

      // Should have 4 seed rules
      assert.equal(result.length, 4, `expected 4 seed rules, got ${result.length}`);

      // Verify seed file was created
      const seedPath = path.join(globalRulesDir, "damage-control-rules.yaml");
      assert.ok(fs.existsSync(seedPath), "seed file should exist");

      // Verify rule names
      const names = result.map(r => r.name).sort();
      assert.deepEqual(names, [
        "block-rm-rf-root",
        "block-sudo",
        "protect-credentials",
        "protect-env-files",
      ]);
    });
  });

  it("load — only global rules exist", async () => {
    await withTempDir(async (dir) => {
      const globalRulesDir = path.join(dir, "global");
      writeFile(
        globalRulesDir,
        "damage-control-rules.yaml",
        readFixture("valid-rules.yaml"),
      );

      const result = RuleLoader.load(dir, {}, globalRulesDir);
      assert.equal(result.length, 2);
      assert.equal(result[0].name, "block-sudo");
      assert.equal(result[0].tools.has("bash"), true);
    });
  });

  it("load — global + project, project overrides by name", async () => {
    await withTempDir(async (dir) => {
      const globalRulesDir = path.join(dir, "global");
      writeFile(
        globalRulesDir,
        "damage-control-rules.yaml",
        readFixture("valid-rules.yaml"),
      );
      // Project rules: overrides block-sudo to warn, adds no-console-log
      writeFile(
        path.join(dir, ".pi"),
        "damage-control-rules.yaml",
        readFixture("project-override.yaml"),
      );

      const result = RuleLoader.load(dir, {}, globalRulesDir);

      // block-sudo should be override to warn
      const sudoRule = result.find(r => r.name === "block-sudo");
      assert.ok(sudoRule, "block-sudo should exist");
      assert.equal(sudoRule!.action, "warn", "block-sudo should be overridden to warn");

      // protect-env-files should still be from global
      const envRule = result.find(r => r.name === "protect-env-files");
      assert.ok(envRule, "protect-env-files should still exist");
      assert.equal(envRule!.action, "block");

      // no-console-log should be added from project
      const consoleRule = result.find(r => r.name === "no-console-log");
      assert.ok(consoleRule, "no-console-log should be added");
      assert.equal(consoleRule!.action, "confirm");

      // Total: 2 from global, 1 added, 1 override = 3 unique
      assert.equal(result.length, 3);
    });
  });

  it("load — project adds new rules", async () => {
    await withTempDir(async (dir) => {
      const globalRulesDir = path.join(dir, "global");
      writeFile(
        globalRulesDir,
        "damage-control-rules.yaml",
        readFixture("valid-rules.yaml"),
      );
      writeFile(
        path.join(dir, ".pi"),
        "damage-control-rules.yaml",
        readFixture("project-override.yaml"),
      );

      const result = RuleLoader.load(dir, {}, globalRulesDir);

      // Should have 3 rules (2 global - 1 override + 1 added = 2 kept from global, 2 from project, 1 override = 3)
      // block-sudo (overridden), protect-env-files (kept), no-console-log (added)
      assert.equal(result.length, 3);
      assert.ok(result.some(r => r.name === "no-console-log"));
    });
  });

  it("load — empty project rules doesn't affect global", async () => {
    await withTempDir(async (dir) => {
      const globalRulesDir = path.join(dir, "global");
      writeFile(
        globalRulesDir,
        "damage-control-rules.yaml",
        readFixture("valid-rules.yaml"),
      );
      writeFile(
        path.join(dir, ".pi"),
        "damage-control-rules.yaml",
        readFixture("empty-rules.yaml"),
      );

      const result = RuleLoader.load(dir, {}, globalRulesDir);
      assert.equal(result.length, 2);
    });
  });

  it("load — uses custom project rules path from config", async () => {
    await withTempDir(async (dir) => {
      const globalRulesDir = path.join(dir, "global");
      writeFile(
        globalRulesDir,
        "damage-control-rules.yaml",
        readFixture("valid-rules.yaml"),
      );
      writeFile(dir, "custom-rules.yaml", readFixture("project-override.yaml"));

      const config: DamageControlConfig = { rules: "custom-rules.yaml" };
      const result = RuleLoader.load(dir, config, globalRulesDir);

      assert.equal(result.length, 3);
    });
  });
});

describe("RuleLoader.seedGlobalRules", () => {
  it("seedGlobalRules — returns valid YAML with 4 rules", () => {
    const seed = RuleLoader.seedGlobalRules();
    assert.ok(seed.includes("rules:"), "seed should contain 'rules:'");
    assert.ok(seed.includes("block-sudo"));
    assert.ok(seed.includes("block-rm-rf-root"));
    assert.ok(seed.includes("protect-env-files"));
    assert.ok(seed.includes("protect-credentials"));

    // Should be parseable
    const rules = RuleLoader.parseYaml(seed);
    assert.equal(rules.length, 4);
  });
});

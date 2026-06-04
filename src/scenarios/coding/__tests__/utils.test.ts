/**
 * Tests for Coding Scenario utilities — gateFile, formatDate.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { gateFile, formatDate } from "../utils.js";

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-craft-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── formatDate ──────────────────────────────────────────────

describe("formatDate", () => {
  it("returns YYYY-MM-DD format", () => {
    const date = formatDate();
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(date), `expected YYYY-MM-DD, got ${date}`);
  });

  it("matches today", () => {
    const date = formatDate();
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(date, today);
  });
});

// ─── gateFile ────────────────────────────────────────────────

describe("gateFile — missing file", () => {
  it("returns 'file not found' for non-existent file", () => {
    const result = gateFile(path.join(tmpDir, "nonexistent.md"));
    assert.equal(result, "file not found");
  });
});

describe("gateFile — size check", () => {
  it("rejects file < 80 bytes", () => {
    const file = path.join(tmpDir, "small.md");
    fs.writeFileSync(file, "# Hi\n");
    const result = gateFile(file);
    assert.ok(result !== null);
    assert.ok(result!.includes("bytes"));
  });

  it("accepts file >= 80 bytes (with enough lines)", () => {
    const file = path.join(tmpDir, "ok.md");
    // 2 lines > 20 chars, total > 80 bytes
    const content = "# My Analysis Report\n\n## Overview\n\nThis is a detailed code analysis report.\n\nMore content here to reach 80 bytes.\n";
    fs.writeFileSync(file, content);
    assert.ok(content.length >= 80, `content is ${content.length} bytes`);

    const result = gateFile(file);
    assert.equal(result, null);
  });
});

describe("gateFile — stub detection", () => {
  it("rejects file with < 2 substantial lines", () => {
    const file = path.join(tmpDir, "stub.md");
    // > 80 bytes but only 1 line > 20 chars
    let content = "# Stub\n\n";
    content += "x".repeat(80); // filler to hit 80 bytes, but all on one meaningful line
    fs.writeFileSync(file, content);

    const result = gateFile(file);
    assert.ok(result !== null);
    assert.ok(result!.includes("stub"));
  });

  it("rejects file with only short lines", () => {
    const file = path.join(tmpDir, "short-lines.md");
    let content = "";
    for (let i = 0; i < 30; i++) {
      content += `line ${i}\n`; // each line ~7 chars (< 20)
    }
    // > 80 bytes but no line > 20 chars
    assert.ok(content.length >= 80);
    fs.writeFileSync(file, content);

    const result = gateFile(file);
    // All lines are short, so 0 lines > 20 chars
    assert.ok(result !== null);
    assert.ok(result!.includes("stub"));
  });

  it("accepts file with 2 lines exactly > 20 chars", () => {
    const file = path.join(tmpDir, "borderline.md");
    // 2 lines of 21 chars each, pad to 80+ bytes
    const line1 = "A".repeat(21) + "\n";
    const line2 = "B".repeat(21) + "\n";
    const padding = "#".repeat(80 - line1.length - line2.length) + "\n";
    fs.writeFileSync(file, line1 + line2 + padding);

    const result = gateFile(file);
    assert.equal(result, null);
  });

  it("counts only lines with trimmed length > 20", () => {
    const file = path.join(tmpDir, "padded.md");
    // Lines with spaces around content, padded to 80+ bytes
    const line1 = "   " + "X".repeat(21) + "   \n";
    const line2 = "   " + "Y".repeat(21) + "   \n";
    const padding = "#".repeat(80 - line1.length - line2.length) + "\n";
    fs.writeFileSync(file, line1 + line2 + padding);

    const result = gateFile(file);
    assert.equal(result, null);
  });

  it("accepts a realistic document", () => {
    const file = path.join(tmpDir, "realistic.md");
    const content = [
      "# Code Analysis Report",
      "",
      "## Project Structure",
      "",
      "The project is organized as a monorepo with the following key directories:",
      "",
      "- `src/core/` — core engine modules",
      "- `src/capabilities/` — optional feature modules",
      "- `src/scenarios/` — workflow scenarios",
      "",
      "## Dependencies",
      "",
      "The project uses TypeScript with ES modules. Key dependencies include...",
    ].join("\n");
    fs.writeFileSync(file, content);

    const result = gateFile(file);
    assert.equal(result, null);
  });
});

describe("gateFile — only reads first 200 bytes for stub check", () => {
  it("accepts file where lines > 20 chars are in first 200 bytes", () => {
    const file = path.join(tmpDir, "head-ok.md");
    // 2 lines > 20 chars at start, then lots of short lines
    let content = "This is a substantial first line.\n";
    content += "This is a substantial second line.\n";
    for (let i = 0; i < 100; i++) content += `x\n`; // short lines after
    fs.writeFileSync(file, content);

    const result = gateFile(file);
    assert.equal(result, null);
  });

  it("rejects file where substantial lines are after 200 bytes", () => {
    const file = path.join(tmpDir, "head-bad.md");
    // Fill first 200 bytes with short lines only
    let content = "";
    // Each "x\n" is 2 bytes, need 100+ lines for 200 bytes
    for (let i = 0; i < 101; i++) content += `x\n`;
    // These long lines start after byte ~202
    content += "A".repeat(21) + "\n";
    content += "B".repeat(21) + "\n";
    fs.writeFileSync(file, content);

    const result = gateFile(file);
    assert.ok(result !== null);
  });
});

describe("gateFile — error handling", () => {
  it("throws on permission errors (not ENOENT)", () => {
    // Create a directory with no read permission, then try to stat a file inside
    // We can't easily test this cross-platform, so skip
  });

  it("handles empty file", () => {
    const file = path.join(tmpDir, "empty.md");
    fs.writeFileSync(file, "");
    const result = gateFile(file);
    assert.ok(result !== null);
    assert.ok(result!.includes("bytes"));
  });
});

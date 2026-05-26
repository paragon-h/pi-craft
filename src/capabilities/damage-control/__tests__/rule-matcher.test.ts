/**
 * Tests for RuleMatcher — glob path matching, command regex, content regex.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuleMatcher } from "../rules-engine.js";

describe("RuleMatcher.matchPath", () => {
  it("matchPath — exact file in root", () => {
    assert.equal(RuleMatcher.matchPath(".env", "**/.env"), true);
  });

  it("matchPath — nested path", () => {
    assert.equal(RuleMatcher.matchPath("src/config/.env", "**/.env"), true);
  });

  it("matchPath — deeply nested", () => {
    assert.equal(
      RuleMatcher.matchPath("a/b/c/d/.env", "**/.env"),
      true,
    );
  });

  it("matchPath — non-match different name", () => {
    assert.equal(RuleMatcher.matchPath(".env.example", "**/.env"), false);
  });

  it("matchPath — brace expansion (key)", () => {
    assert.equal(
      RuleMatcher.matchPath("src/secret.key", "**/*.{key,pem}"),
      true,
    );
  });

  it("matchPath — brace expansion (pem)", () => {
    assert.equal(
      RuleMatcher.matchPath("keys/server.pem", "**/*.{key,pem}"),
      true,
    );
  });

  it("matchPath — brace expansion non-match", () => {
    assert.equal(
      RuleMatcher.matchPath("src/secret.txt", "**/*.{key,pem}"),
      false,
    );
  });

  it("matchPath — directory prefix match", () => {
    assert.equal(
      RuleMatcher.matchPath(".git/config", ".git/**"),
      true,
    );
  });

  it("matchPath — empty path", () => {
    assert.equal(RuleMatcher.matchPath("", "**/.env"), false);
  });
});

describe("RuleMatcher.matchCommand", () => {
  it("matchCommand — sudo detected", () => {
    assert.equal(RuleMatcher.matchCommand("sudo rm file", /\bsudo\b/), true);
  });

  it("matchCommand — sudo at start", () => {
    assert.equal(RuleMatcher.matchCommand("sudo apt update", /\bsudo\b/), true);
  });

  it("matchCommand — rm -rf / detected", () => {
    const regex = /\brm\s+.*-rf?\s+\/(\s|$)/;
    assert.equal(RuleMatcher.matchCommand("rm -rf / --no-preserve-root", regex), true);
  });

  it("matchCommand — safe rm not matched", () => {
    const regex = /\brm\s+.*-rf?\s+\/(\s|$)/;
    assert.equal(RuleMatcher.matchCommand("rm file.txt", regex), false);
  });

  it("matchCommand — rm -r / detected", () => {
    const regex = /\brm\s+.*-rf?\s+\/(\s|$)/;
    assert.equal(RuleMatcher.matchCommand("rm -r /", regex), true);
  });

  it("matchCommand — empty command", () => {
    assert.equal(RuleMatcher.matchCommand("", /\bsudo\b/), false);
  });
});

describe("RuleMatcher.matchContent", () => {
  it("matchContent — console.log detected", () => {
    assert.equal(
      RuleMatcher.matchContent(
        "function test() { console.log('hello'); }",
        /console\.log\(/,
      ),
      true,
    );
  });

  it("matchContent — no console.log", () => {
    assert.equal(
      RuleMatcher.matchContent(
        "function test() { consoler.log('hello'); }",
        /console\.log\(/,
      ),
      false,
    );
  });

  it("matchContent — dangerouslySetInnerHTML detected", () => {
    assert.equal(
      RuleMatcher.matchContent(
        '<div dangerouslySetInnerHTML={{ __html: html }} />',
        /dangerouslySetInnerHTML/,
      ),
      true,
    );
  });

  it("matchContent — empty content", () => {
    assert.equal(RuleMatcher.matchContent("", /console\.log\(/), false);
  });
});

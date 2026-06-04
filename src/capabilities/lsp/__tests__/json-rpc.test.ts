/**
 * Tests for LSP JSON-RPC — encoding, decoding, request tracking, helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeMessage,
  parseMessages,
  RequestTracker,
  buildInitializeParams,
  toUri,
  toLanguageId,
} from "../json-rpc.js";
import type { JsonRpcMessage } from "../json-rpc.js";

// ─── encodeMessage ───────────────────────────────────────────

describe("encodeMessage", () => {
  it("encodes a request with Content-Length header", () => {
    const msg = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "initialize",
      params: { rootUri: "file:///project" },
    };
    const encoded = encodeMessage(msg);

    assert.ok(encoded.startsWith("Content-Length: "));
    assert.ok(encoded.includes("\r\n\r\n"));
    const body = encoded.split("\r\n\r\n")[1];
    const parsed = JSON.parse(body);
    assert.equal(parsed.id, 1);
    assert.equal(parsed.method, "initialize");
  });

  it("calculates correct Content-Length for UTF-8", () => {
    const msg = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "textDocument/didOpen",
      params: { text: "hello 🌍" },
    };
    const encoded = encodeMessage(msg);
    const body = encoded.split("\r\n\r\n")[1];

    // Content-Length should match the byte length of body (not char length)
    const headerMatch = encoded.match(/Content-Length: (\d+)/);
    assert.ok(headerMatch);
    const declared = parseInt(headerMatch[1], 10);
    const actual = Buffer.byteLength(body, "utf-8");
    assert.equal(declared, actual);
    // 🌍 is 4 bytes in UTF-8, so byte length > string length
    assert.ok(actual > body.length);
  });

  it("encodes a notification (no id)", () => {
    const msg = {
      jsonrpc: "2.0" as const,
      method: "initialized",
    };
    const encoded = encodeMessage(msg);

    const body = encoded.split("\r\n\r\n")[1];
    const parsed = JSON.parse(body);
    assert.equal(parsed.method, "initialized");
    assert.equal(parsed.id, undefined);
  });

  it("encodes a response with error", () => {
    const msg = {
      jsonrpc: "2.0" as const,
      id: 2,
      error: { code: -32601, message: "Method not found" },
    };
    const encoded = encodeMessage(msg);

    const body = encoded.split("\r\n\r\n")[1];
    const parsed = JSON.parse(body);
    assert.equal(parsed.error.code, -32601);
  });
});

// ─── parseMessages ────────────────────────────────────────────

describe("parseMessages", () => {
  it("parses a single complete message", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "ok" });
    const buffer = `Content-Length: ${body.length}\r\n\r\n${body}`;

    const { messages, remaining } = parseMessages(buffer);
    assert.equal(messages.length, 1);
    assert.equal((messages[0] as any).id, 1);
    assert.equal((messages[0] as any).result, "ok");
    assert.equal(remaining, "");
  });

  it("parses multiple messages in one buffer", () => {
    const body1 = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "first" });
    const body2 = JSON.stringify({ jsonrpc: "2.0", id: 2, result: "second" });
    const buffer =
      `Content-Length: ${body1.length}\r\n\r\n${body1}` +
      `Content-Length: ${body2.length}\r\n\r\n${body2}`;

    const { messages, remaining } = parseMessages(buffer);
    assert.equal(messages.length, 2);
    assert.equal((messages[0] as any).result, "first");
    assert.equal((messages[1] as any).result, "second");
    assert.equal(remaining, "");
  });

  it("returns remaining data for incomplete message", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "partial" });
    // Declare length longer than body
    const buffer = `Content-Length: ${body.length + 100}\r\n\r\n${body}`;

    const { messages, remaining } = parseMessages(buffer);
    assert.equal(messages.length, 0);
    assert.equal(remaining, buffer);
  });

  it("handles partial header (no double CRLF yet)", () => {
    const buffer = "Content-Length:";
    const { messages, remaining } = parseMessages(buffer);
    assert.equal(messages.length, 0);
    assert.equal(remaining, buffer);
  });

  it("skips malformed JSON body", () => {
    const body = "not json at all";
    const buffer = `Content-Length: ${body.length}\r\n\r\n${body}`;

    const { messages, remaining } = parseMessages(buffer);
    assert.equal(messages.length, 0);
    assert.equal(remaining, "");
  });

  it("skips headers without Content-Length", () => {
    const body = "ignored";
    const buffer = `X-Custom: value\r\n\r\n${body}` +
      `Content-Length: ${JSON.stringify({ id: 1 }).length}\r\n\r\n${JSON.stringify({ id: 1 })}`;

    const { messages } = parseMessages(buffer);
    // First header skipped, second parsed
    assert.equal(messages.length, 1);
    assert.equal((messages[0] as any).id, 1);
  });

  it("handles empty buffer", () => {
    const { messages, remaining } = parseMessages("");
    assert.equal(messages.length, 0);
    assert.equal(remaining, "");
  });

  it("is case-insensitive for Content-Length header", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "ok" });
    const buffer = `content-length: ${body.length}\r\n\r\n${body}`;

    const { messages } = parseMessages(buffer);
    assert.equal(messages.length, 1);
  });
});

// ─── RequestTracker ──────────────────────────────────────────

describe("RequestTracker", () => {
  it("registers a request and returns unique id", async () => {
    const tracker = new RequestTracker();
    const { id, promise } = tracker.register(100);

    assert.equal(id, 1);
    assert.ok(promise instanceof Promise);
    // Cleanup: resolve to avoid unhandled rejection
    tracker.handleResponse({ jsonrpc: "2.0", id, result: null });
    await promise;
  });

  it("increments ids", async () => {
    const tracker = new RequestTracker();
    const r1 = tracker.register(100);
    assert.equal(r1.id, 1);
    const r2 = tracker.register(100);
    assert.equal(r2.id, 2);
    const r3 = tracker.register(100);
    assert.equal(r3.id, 3);
    // Cleanup
    tracker.rejectAll("cleanup");
    await Promise.allSettled([r1.promise, r2.promise, r3.promise]);
  });

  it("resolves when response arrives", async () => {
    const tracker = new RequestTracker();
    const { id, promise } = tracker.register<string>(5000);

    const handled = tracker.handleResponse({
      jsonrpc: "2.0",
      id,
      result: "success",
    });

    assert.equal(handled, true);
    const result = await promise;
    assert.equal(result, "success");
  });

  it("rejects when response has error", async () => {
    const tracker = new RequestTracker();
    const { id, promise } = tracker.register(5000);

    tracker.handleResponse({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: "Server error" },
    });

    await assert.rejects(promise, /Server error/);
  });

  it("rejects on timeout", async () => {
    const tracker = new RequestTracker();
    const { promise } = tracker.register(50); // 50ms timeout

    await assert.rejects(promise, /timed out/);
  });

  it("returns false for unmatched response id", () => {
    const tracker = new RequestTracker();
    const handled = tracker.handleResponse({
      jsonrpc: "2.0",
      id: 999,
      result: "orphan",
    });

    assert.equal(handled, false);
  });

  it("rejectAll rejects all pending", async () => {
    const tracker = new RequestTracker();
    const p1 = tracker.register(5000).promise;
    const p2 = tracker.register(5000).promise;

    tracker.rejectAll("server crashed");

    await assert.rejects(p1, /server crashed/);
    await assert.rejects(p2, /server crashed/);
  });

  it("clears pending after rejectAll", async () => {
    const tracker = new RequestTracker();
    const p1 = tracker.register(5000).promise;
    const p2 = tracker.register(5000).promise;

    tracker.rejectAll("gone");

    // Consume rejections
    await Promise.allSettled([p1, p2]);

    // No pending → handleResponse returns false
    const handled = tracker.handleResponse({
      jsonrpc: "2.0",
      id: 1,
      result: "too late",
    });
    assert.equal(handled, false);
  });
});

// ─── Helpers ──────────────────────────────────────────────────

describe("buildInitializeParams", () => {
  it("includes processId and rootUri", () => {
    const params = buildInitializeParams("/home/user/project");
    assert.equal(params.processId, process.pid);
    assert.equal(params.rootUri, "file:///home/user/project");
  });

  it("includes capabilities", () => {
    const params = buildInitializeParams("/app");
    assert.ok(params.capabilities.textDocument);
    assert.ok(params.capabilities.textDocument.hover);
  });
});

describe("toUri", () => {
  it("converts absolute path to file:// URI", () => {
    assert.equal(toUri("/app", "/app/src/main.ts"), "file:///app/src/main.ts");
  });

  it("converts relative path using cwd", () => {
    assert.equal(toUri("/app", "src/main.ts"), "file:///app/src/main.ts");
  });

  it("handles paths without leading slash in cwd", () => {
    assert.equal(toUri("app", "src/main.ts"), "file://app/src/main.ts");
  });
});

describe("toLanguageId", () => {
  it("maps known extensions", () => {
    assert.equal(toLanguageId(".ts"), "typescript");
    assert.equal(toLanguageId(".tsx"), "typescriptreact");
    assert.equal(toLanguageId(".js"), "javascript");
    assert.equal(toLanguageId(".jsx"), "javascriptreact");
    assert.equal(toLanguageId(".go"), "go");
    assert.equal(toLanguageId(".rs"), "rust");
    assert.equal(toLanguageId(".py"), "python");
    assert.equal(toLanguageId(".pyi"), "python");
  });

  it("falls back to extension without dot", () => {
    assert.equal(toLanguageId(".css"), "css");
    assert.equal(toLanguageId(".html"), "html");
  });
});

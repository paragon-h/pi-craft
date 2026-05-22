/**
 * LSP — JSON-RPC 2.0 Message Encoding/Decoding
 *
 * Language Server Protocol uses JSON-RPC over stdio with
 * Content-Length headers as framing (no Content-Type).
 */

import type { ChildProcess } from "node:child_process";

// ─── Types ──────────────────────────────────────────────────────

export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ─── Encoding ──────────────────────────────────────────────────

export function encodeMessage(msg: JsonRpcMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

// ─── Decoding ──────────────────────────────────────────────────

/** Parse complete messages from stream buffer. Returns parsed messages + leftover data. */
export function parseMessages(buffer: string): { messages: JsonRpcMessage[]; remaining: string } {
  const messages: JsonRpcMessage[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf("\r\n\r\n", offset);
    if (headerEnd === -1) break;

    const header = buffer.slice(offset, headerEnd);
    const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
    if (!contentLengthMatch) {
      // Malformed, skip this header and try again
      offset = headerEnd + 4;
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (bodyEnd > buffer.length) break; // Incomplete body

    const body = buffer.slice(bodyStart, bodyEnd);
    try {
      messages.push(JSON.parse(body));
    } catch {
      // Skip malformed messages
    }
    offset = bodyEnd;
  }

  return { messages, remaining: buffer.slice(offset) };
}

// ─── Stream Reader ─────────────────────────────────────────────

export interface StreamCallbacks {
  onMessage: (msg: JsonRpcMessage) => void;
  onError: (err: Error) => void;
  onClose: (code: number | null) => void;
}

/** Read LSP messages from a child process stdout stream */
export function createStreamReader(proc: ChildProcess, callbacks: StreamCallbacks): void {
  let buffer = "";

  proc.stdout!.on("data", (data: Buffer) => {
    buffer += data.toString();
    try {
      const { messages, remaining } = parseMessages(buffer);
      buffer = remaining;
      for (const msg of messages) callbacks.onMessage(msg);
    } catch (err) {
      callbacks.onError(err as Error);
    }
  });

  proc.on("close", (code) => callbacks.onClose(code));
  proc.on("error", (err) => callbacks.onError(err));
}

// ─── Request Tracker ───────────────────────────────────────────

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RequestTracker {
  private pending = new Map<JsonRpcId, PendingRequest>();
  private nextId = 1;

  /** Register a new pending request. Resolves when response arrives. */
  register<T>(timeoutMs: number): { id: JsonRpcId; promise: Promise<T> } {
    const id = this.nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request #${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject, timer });
    });
    return { id, promise };
  }

  /** Handle an incoming response. Returns true if it matched a pending request. */
  handleResponse(msg: JsonRpcResponse): boolean {
    if (msg.id === undefined) return false;
    const pending = this.pending.get(msg.id);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pending.delete(msg.id);

    if (msg.error) {
      pending.reject(new Error(`LSP error #${msg.id}: ${msg.error.message} (code ${msg.error.code})`));
    } else {
      pending.resolve(msg.result);
    }
    return true;
  }

  /** Reject all pending requests (called on server crash) */
  rejectAll(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

// ─── LSP Helpers ───────────────────────────────────────────────

/** Common LSP initialize params */
export function buildInitializeParams(cwd: string) {
  return {
    processId: process.pid,
    rootUri: `file://${cwd}`,
    capabilities: {
      textDocument: {
        diagnostic: { dynamicRegistration: true },
        hover: { dynamicRegistration: true },
        definition: { dynamicRegistration: true },
        references: { dynamicRegistration: true },
      },
    },
    workspaceFolders: [{ uri: `file://${cwd}`, name: cwd.split("/").pop() || cwd }],
  };
}

/** Convert a file path to LSP URI */
export function toUri(cwd: string, filePath: string): string {
  const full = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
  return `file://${full}`;
}

/** Extension → LSP languageId */
export function toLanguageId(ext: string): string {
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".go": "go",
    ".rs": "rust",
    ".py": "python",
    ".pyi": "python",
  };
  return map[ext] || ext.slice(1);
}

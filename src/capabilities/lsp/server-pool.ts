/**
 * LSP — Language Server Process Pool
 *
 * Manages language server processes: spawn, initialize, reuse, restart.
 * One process per server type (e.g. one tsserver for all .ts/.tsx files).
 */

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import {
  encodeMessage,
  createStreamReader,
  RequestTracker,
  buildInitializeParams,
  toUri,
  toLanguageId,
  type JsonRpcMessage,
  type JsonRpcResponse,
  type JsonRpcNotification,
} from "./json-rpc";

// ─── Types ──────────────────────────────────────────────────────

export interface DiagnosticResult {
  uri: string;
  filePath: string;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: 1 | 2 | 3 | 4; // 1=Error 2=Warning 3=Info 4=Hint
  message: string;
  source?: string;
  code?: string | number;
}

export interface HoverResult {
  contents: string;
  range?: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface LocationResult {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

interface ServerState {
  process: ChildProcess;
  requestTracker: RequestTracker;
  serverType: string;
  state: "starting" | "ready" | "error";
  openFiles: Map<string, { version: number }>;
  pendingInit: Promise<void> | null;
  crashed: boolean;
  /** Cache latest diagnostics per URI, updated by publishDiagnostics notifications */
  diagnosticsCache: Map<string, Diagnostic[]>;
}

// ─── Pool ───────────────────────────────────────────────────────

export class LspServerPool {
  private servers = new Map<string, ServerState>();
  private timeout = 15000;

  /** Get or create a server for the given file extension */
  async getServer(
    serverType: string,
    cmdStr: string,
    cwd: string,
  ): Promise<ServerState> {
    let server = this.servers.get(serverType);

    // Health check: if process died silently, mark as crashed and recreate
    if (server?.state === "ready" && server.process.exitCode !== null) {
      server.crashed = true;
      server.state = "error";
      this.servers.delete(serverType);
      server = undefined;
    }

    if (server && server.state === "ready") return server;

    // If there's a crashed server, remove it so we can recreate
    if (server?.crashed) {
      this.servers.delete(serverType);
      server = undefined;
    }

    if (!server) {
      server = this.spawnServer(serverType, cmdStr, cwd);
      this.servers.set(serverType, server);
      try {
        await this.initialize(server, cwd);
      } catch (err) {
        server.crashed = true;
        server.state = "error";
        throw err;
      }
    }

    // If starting, wait
    if (server.state === "starting" && server.pendingInit) {
      await server.pendingInit;
    }

    return server;
  }

  /** Ensure a file is open on the server so diagnostics are available */
  async ensureFileOpen(server: ServerState, filePath: string, cwd: string): Promise<void> {
    const uri = toUri(cwd, filePath);
    const existing = server.openFiles.get(uri);

    if (!existing) {
      // Open the file
      const fullPath = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      const languageId = toLanguageId(fullPath.slice(fullPath.lastIndexOf(".")));

      this.sendNotification(server, "textDocument/didOpen", {
        textDocument: { uri, languageId, version: 1, text: content },
      });
      server.openFiles.set(uri, { version: 1 });

      // Give the server a moment to process
      await sleep(300);
    } else {
      // Refresh content
      const fullPath = filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`;
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const content = fs.readFileSync(fullPath, "utf-8");
      const newVersion = existing.version + 1;

      this.sendNotification(server, "textDocument/didChange", {
        textDocument: { uri, version: newVersion },
        contentChanges: [{ text: content }],
      });
      existing.version = newVersion;

      await sleep(200);
    }
  }

  /** Request diagnostics for a specific file.
   *  Tries pull model first (textDocument/diagnostic), falls back to
   *  cached publishDiagnostics notifications. */
  async getDiagnostics(server: ServerState, filePath: string, cwd: string): Promise<DiagnosticResult> {
    const uri = toUri(cwd, filePath);

    // Try pull-model diagnostic request first
    try {
      const result = await this.sendRequest(server, "textDocument/diagnostic", {
        textDocument: { uri },
      }, 5000); // shorter timeout for unsupported methods
      const items = extractDiagnostics(result, uri);
      return { uri, filePath, diagnostics: items };
    } catch {
      // Fall back to cached publishDiagnostics
      await sleep(500); // give server time to publish
      const items = server.diagnosticsCache.get(uri) ?? [];
      return { uri, filePath, diagnostics: items };
    }
  }

  /** Hover at a position */
  async getHover(server: ServerState, filePath: string, cwd: string, line: number, character: number): Promise<HoverResult | null> {
    const uri = toUri(cwd, filePath);
    const result = await this.sendRequest(server, "textDocument/hover", {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 }, // LSP uses 0-based
    });
    if (!result) return null;
    return normalizeHover(result);
  }

  /** Go to definition */
  async getDefinition(server: ServerState, filePath: string, cwd: string, line: number, character: number): Promise<LocationResult[]> {
    const uri = toUri(cwd, filePath);
    const result = await this.sendRequest(server, "textDocument/definition", {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
    });
    if (!result) return [];
    return normalizeLocations(result);
  }

  /** Find references */
  async getReferences(server: ServerState, filePath: string, cwd: string, line: number, character: number): Promise<LocationResult[]> {
    const uri = toUri(cwd, filePath);
    const result = await this.sendRequest(server, "textDocument/references", {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
      context: { includeDeclaration: true },
    });
    if (!result) return [];
    return normalizeLocations(result);
  }

  /** Shutdown all servers */
  async shutdownAll(): Promise<void> {
    for (const [type, server] of this.servers) {
      try {
        this.sendNotification(server, "shutdown", {});
        server.process.kill("SIGTERM");
      } catch { /* best effort */ }
    }
    this.servers.clear();
  }

  // ─── Internal ─────────────────────────────────────────────

  private spawnServer(serverType: string, cmdStr: string, cwd: string): ServerState {
    const parts = cmdStr.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    const requestTracker = new RequestTracker();

    const server: ServerState = {
      process: proc,
      requestTracker,
      serverType,
      state: "starting",
      openFiles: new Map(),
      pendingInit: null,
      crashed: false,
      diagnosticsCache: new Map(),
    };

    createStreamReader(proc, {
      onMessage: (msg) => {
        if ("method" in msg && "id" in msg) {
          // Incoming request — we don't handle those
        } else if ("id" in msg && !("method" in msg)) {
          // Response to our request
          requestTracker.handleResponse(msg as JsonRpcResponse);
        } else if ("method" in msg) {
          // Notification — capture publishDiagnostics
          const notif = msg as JsonRpcNotification;
          if (notif.method === "textDocument/publishDiagnostics") {
            const params = notif.params as { uri: string; diagnostics: Diagnostic[] } | undefined;
            if (params?.uri) {
              server.diagnosticsCache.set(params.uri, params.diagnostics ?? []);
            }
          }
        }
      },
      onError: (err) => {
        // stderr is normal for some servers (logs), not fatal
      },
      onClose: (code) => {
        if (server.state !== "ready") return; // Expected close during shutdown
        server.crashed = true;
        server.state = "error";
        requestTracker.rejectAll(`Language server '${serverType}' exited with code ${code}`);
      },
    });

    // Forward stderr for debugging but don't treat as error
    proc.stderr?.on("data", (_data) => { /* logs */ });

    return server;
  }

  private async initialize(server: ServerState, cwd: string): Promise<void> {
    const params = buildInitializeParams(cwd);
    const { id, promise } = server.requestTracker.register<unknown>(this.timeout);

    server.process.stdin!.write(encodeMessage({
      jsonrpc: "2.0", id, method: "initialize", params,
    }));

    try {
      await promise;
      this.sendNotification(server, "initialized", {});
      server.state = "ready";
    } catch (err) {
      server.state = "error";
      throw err;
    }
  }

  private sendNotification(server: ServerState, method: string, params: unknown): void {
    server.process.stdin!.write(encodeMessage({
      jsonrpc: "2.0", method, params,
    }));
  }

  private async sendRequest<T>(server: ServerState, method: string, params: unknown, timeout?: number): Promise<T> {
    const { id, promise } = server.requestTracker.register<T>(timeout ?? this.timeout);
    server.process.stdin!.write(encodeMessage({
      jsonrpc: "2.0", id, method, params,
    }));
    return promise;
  }
}

// ─── Response Normalizers ──────────────────────────────────────

function extractDiagnostics(result: unknown, uri: string): Diagnostic[] {
  // textDocument/diagnostic returns { kind: "full", items: [...] }
  const r = result as Record<string, unknown> | undefined;
  if (!r) return [];
  const items = (r.items || r.diagnostics || []) as Diagnostic[];
  return items;
}

function normalizeHover(result: unknown): HoverResult | null {
  const r = result as Record<string, unknown> | undefined;
  if (!r) return null;

  let contents = "";
  if (typeof r.contents === "string") {
    contents = r.contents;
  } else if (r.contents && typeof r.contents === "object") {
    // MarkupContent: { kind: "markdown"|"plaintext", value: string }
    contents = (r.contents as Record<string, string>).value || "";
  } else if (Array.isArray(r.contents)) {
    contents = (r.contents as Array<{ value?: string }>).map(c => c.value || "").join("\n");
  }

  if (!contents) return null;
  return { contents, range: r.range as HoverResult["range"] };
}

function normalizeLocations(result: unknown): LocationResult[] {
  const items = (Array.isArray(result) ? result : [result]).filter(Boolean) as Array<Record<string, unknown>>;
  return items.map(item => ({
    uri: item.uri as string,
    range: item.range as LocationResult["range"],
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

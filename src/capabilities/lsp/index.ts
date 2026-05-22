/**
 * Pi Craft — LSP Capability
 *
 * Registers an `lsp` tool for language server diagnostics.
 * Controllable via config: craft.enableLsp (default: true).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { Type } from "typebox";
import { getCraftConfig, isOn } from "../../core/config";
import { getState } from "../../core/registry";
import { LspServerPool } from "./server-pool";

// ─── Constants ─────────────────────────────────────────────────

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "typescript",
  ".jsx": "typescript",
  ".go": "go",
  ".rs": "rust",
  ".py": "python",
  ".pyi": "python",
};

const SERVER_LABELS: Record<string, string> = {
  "typescript": "TS",
  "go": "Go",
  "rust": "RS",
  "python": "PY",
};

const DEFAULT_SERVERS: Record<string, string> = {
  "typescript": "typescript-language-server --stdio",
  "go": "gopls",
  "rust": "rust-analyzer",
  "python": "pyright-langserver --stdio",
};

const DIAG_SEVERITY: Record<number, string> = {
  1: "🔴",
  2: "🟡",
  3: "🔵",
  4: "💡",
};

// ─── LSP Status ─────────────────────────────────────────────────

interface LspServerState {
  serverType: string;
  label: string;
  available: boolean;
  checked: boolean;
}

class LspStatus {
  private servers = new Map<string, LspServerState>();

  setAvailable(serverType: string, label: string, available: boolean): void {
    if (!this.servers.has(serverType)) {
      this.servers.set(serverType, { serverType, label, available, checked: true });
    } else {
      const s = this.servers.get(serverType)!;
      s.available = available;
      s.checked = true;
    }
    this.push();
  }

  private push(): void {
    const state = getState();
    if (!state?.statusline) return;

    const available = Array.from(this.servers.values())
      .filter(s => s.available)
      .map(s => s.label);

    state.statusline.updateLsp({
      active: available.length > 0,
      servers: available,
    });
  }

  scanForServers(): void {
    const config = getCraftConfig();
    const userServers = config.lsp?.servers ?? {};

    for (const [serverType, label] of Object.entries(SERVER_LABELS)) {
      if (userServers[serverType] === null || (userServers[serverType] as unknown) === "") {
        this.setAvailable(serverType, label, false);
        continue;
      }

      const cmdStr = userServers[serverType] || DEFAULT_SERVERS[serverType];
      if (!cmdStr) {
        this.setAvailable(serverType, label, false);
        continue;
      }

      const cmd = cmdStr.split(/\s+/)[0];
      const available = this.which(cmd);
      this.setAvailable(serverType, label, available);
    }
  }

  private which(cmd: string): boolean {
    try {
      const result = require("node:child_process").spawnSync("which", [cmd], { stdio: "ignore" });
      return result.status === 0;
    } catch {
      return false;
    }
  }
}

const lspStatus = new LspStatus();

// ─── Pool ───────────────────────────────────────────────────────

const pool = new LspServerPool();

// ─── Helpers ────────────────────────────────────────────────────

function getCmdStr(serverType: string): string | null {
  const config = getCraftConfig();
  const userServers = config.lsp?.servers ?? {};
  return userServers[serverType] || DEFAULT_SERVERS[serverType] || null;
}

// ─── Extension Entry ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableLsp")) return;

  pi.on("session_start", async (_event, ctx) => {
    getState()?.statusline?.bind(ctx);
    lspStatus.scanForServers();
  });

  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description: [
      "Query language server for a file. Use after writing or editing code.",
      "Actions:",
      "  diagnostics — Check for errors, warnings, hints in a file",
      "  hover <line> <column> — Get type info and docs at a position",
      "  definition <line> <column> — Find where a symbol is defined",
      "  references <line> <column> — Find all references to a symbol",
    ].join("\n"),
    parameters: Type.Object({
      action: Type.String({ description: "diagnostics | hover | definition | references" }),
      path: Type.String({ description: "File path relative to project root" }),
      line: Type.Optional(Type.Number({ description: "1-based line number (for hover/definition/references)" })),
      column: Type.Optional(Type.Number({ description: "1-based column number (for hover/definition/references)" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = (params as any).action as string;
      const filePath = (params as any).path as string;
      const line = (params as any).line as number | undefined;
      const column = (params as any).column as number | undefined;
      const ext = path.extname(filePath);

      const serverType = EXTENSION_MAP[ext];
      if (!serverType) {
        return {
          content: [{ type: "text", text: `No language server configured for ${ext || "unknown file type"}.\nSupported: ${Object.keys(EXTENSION_MAP).join(", ")}` }],
          details: {},
        };
      }

      const cmdStr = getCmdStr(serverType);
      if (!cmdStr) {
        return {
          content: [{ type: "text", text: `Language server '${serverType}' is not configured.` }],
          details: {},
        };
      }

      try {
        const server = await pool.getServer(serverType, cmdStr, ctx.cwd);
        await pool.ensureFileOpen(server, filePath, ctx.cwd);

        switch (action) {
          case "diagnostics": {
            const result = await pool.getDiagnostics(server, filePath, ctx.cwd);
            return { content: [{ type: "text", text: formatDiagnostics(filePath, result.diagnostics) }], details: {} };
          }

          case "hover": {
            if (!line || !column) {
              return { content: [{ type: "text", text: "line and column are required for hover" }], details: {} };
            }
            const result = await pool.getHover(server, filePath, ctx.cwd, line, column);
            if (!result) {
              return { content: [{ type: "text", text: "No hover information at this position." }], details: {} };
            }
            return { content: [{ type: "text", text: `Line ${line}, Col ${column}\n${result.contents}` }], details: {} };
          }

          case "definition": {
            if (!line || !column) {
              return { content: [{ type: "text", text: "line and column are required for definition" }], details: {} };
            }
            const results = await pool.getDefinition(server, filePath, ctx.cwd, line, column);
            if (results.length === 0) {
              return { content: [{ type: "text", text: "No definition found." }], details: {} };
            }
            const lines = results.map(r => `${r.uri.replace("file://", "")}:${r.range.start.line + 1}:${r.range.start.character + 1}`);
            return { content: [{ type: "text", text: `Definition of symbol at ${filePath}:${line}:${column}:\n${lines.join("\n")}` }], details: {} };
          }

          case "references": {
            if (!line || !column) {
              return { content: [{ type: "text", text: "line and column are required for references" }], details: {} };
            }
            const results = await pool.getReferences(server, filePath, ctx.cwd, line, column);
            if (results.length === 0) {
              return { content: [{ type: "text", text: "No references found." }], details: {} };
            }
            const lines = results.map(r => `${r.uri.replace("file://", "")}:${r.range.start.line + 1}:${r.range.start.character + 1}`);
            return { content: [{ type: "text", text: `${results.length} reference(s) to symbol at ${filePath}:${line}:${column}:\n${lines.join("\n")}` }], details: {} };
          }

          default:
            return { content: [{ type: "text", text: `Unknown action: ${action}. Use diagnostics, hover, definition, or references.` }], details: {} };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `LSP error: ${msg}` }], details: {} };
      }
    },
  });
}

// ─── Formatters ─────────────────────────────────────────────────

function formatDiagnostics(filePath: string, diagnostics: Array<{ severity: number; range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; source?: string; code?: string | number }>): string {
  if (diagnostics.length === 0) {
    return `${filePath}\n✓ No issues found.`;
  }

  const lines = diagnostics.map(d => {
    const icon = DIAG_SEVERITY[d.severity] ?? "●";
    const l = d.range.start.line + 1; // 0-based → 1-based
    const c = d.range.start.character + 1;
    const code = d.code ? ` (${d.code})` : "";
    return `${icon} L${l}:${c}  ${d.message}${code}`;
  });

  return `${filePath} (${diagnostics.length} issue${diagnostics.length > 1 ? "s" : ""})\n${lines.join("\n")}`;
}

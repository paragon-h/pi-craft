/**
 * Pi Craft — LSP Capability
 *
 * Registers an `lsp` tool for language server diagnostics.
 * Controllable via config: craft.enableLsp (default: true).
 *
 * Statusline shows 🔍 with active server names (e.g. "🔍 TS,Go").
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCraftConfig, isOn } from "../../core/config";
import { getState } from "../../core/registry";

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

// ─── State ─────────────────────────────────────────────────────

interface LspServerState {
  serverType: string;
  label: string;
  available: boolean;    // server binary found
  running: boolean;      // process is ready
  checked: boolean;      // availability has been checked
}

class LspStatus {
  private servers = new Map<string, LspServerState>();

  /** Record server availability after checking */
  setAvailable(serverType: string, label: string, available: boolean): void {
    if (!this.servers.has(serverType)) {
      this.servers.set(serverType, { serverType, label, available, running: false, checked: true });
    } else {
      const s = this.servers.get(serverType)!;
      s.available = available;
      s.checked = true;
    }
    this.push();
  }

  setRunning(serverType: string, running: boolean): void {
    const s = this.servers.get(serverType);
    if (!s) return;
    s.running = running;
    this.push();
  }

  /** Push current state to statusline */
  private push(): void {
    const state = getState();
    if (!state?.statusline) return;

    const all = Array.from(this.servers.values());
    const available = all.filter(s => s.available).map(s => s.label);

    state.statusline.updateLsp({
      active: available.length > 0,
      servers: available,
    });
  }

  /** Scan installed servers and report to statusline */
  scanForServers(): void {
    const config = getCraftConfig();
    const userServers = config.lsp?.servers ?? {};

    for (const [serverType, label] of Object.entries(SERVER_LABELS)) {
      // Check if explicitly disabled
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

// ─── Extension Entry ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableLsp")) return;

  // Defer scan to session_start — Core's initState may not be ready yet
  pi.on("session_start", async (_event, ctx) => {
    getState()?.statusline?.bind(ctx);
    lspStatus.scanForServers();
  });

  // Register tool placeholder
  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description: [
      "Query language server for a file. Use after making code changes.",
      "Actions:",
      "  diagnostics — Check for errors, warnings, hints in a file",
      "  hover — Get type info and docs at a position",
      "  definition — Find where a symbol is defined",
      "  references — Find all references to a symbol",
      "(LSP implementation in progress — currently returns stub)",
    ].join("\n"),
    parameters: {
      action: { type: "string", description: "diagnostics | hover | definition | references" },
      path: { type: "string", description: "File path relative to project root" },
    } as any,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = (params as any).action as string;
      const filePath = (params as any).path as string;
      const ext = path.extname(filePath);
      const serverType = EXTENSION_MAP[ext];

      return {
        content: [{
          type: "text",
          text: serverType
            ? `⚠️ LSP not yet implemented.\n\nFile: ${filePath}\nServer: ${serverType}\n\nThis will call ${DEFAULT_SERVERS[serverType] || "configured server"} to perform '${action}'.`
            : `⚠️ No language server configured for ${ext || "unknown file type"}.\n\nSupported: ${Object.keys(EXTENSION_MAP).join(", ")}`,
        }],
        details: {},
      };
    },
  });
}

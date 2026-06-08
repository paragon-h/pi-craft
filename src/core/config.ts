/**
 * Pi Craft — Shared Config Reader
 *
 * Reads `craft` config from pi.craftConfig or settings.json.
 * Cached on first read via globalThis so all extensions share one instance.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const GLOBAL_KEY = "__pi_craft_config__";

export interface DamageControlConfig {
  /** Path to YAML rules file relative to project root. Default: ".pi/damage-control-rules.yaml" */
  rules?: string;
  /** Confirm action behavior */
  promptMode?: "confirm" | "auto-deny" | "auto-allow";
}

export interface LspConfig {
  /** Language server command overrides, keyed by server type.
   *  Set to null or "" to disable a server. Default servers:
   *  - typescript: typescript-language-server --stdio
   *  - go: gopls
   *  - rust: rust-analyzer
   *  - python: pyright-langserver --stdio */
  servers?: Record<string, string | null>;
}

export interface CraftConfig {
  // Core
  enableSubagent?: boolean;
  enableParallelSubagent?: boolean;
  enableCwdGuard?: boolean;

  // Bootstrap — injects skill-checking meta-rule at session start (default-on)
  enableBootstrap?: boolean;

  // Capabilities (all default-on unless noted)
  enableLsp?: boolean;
  enableTodo?: boolean;
  enableWebFetch?: boolean;
  enableMcp?: boolean;
  enableDamageControl?: boolean;
  enableAgentTeam?: boolean;
  enableWorkflowSuggester?: boolean;
  enableSubagentWidget?: boolean;
  enableTilldone?: boolean;  // default-off — strict, explicit opt-in

  // Capability-Specific Configs
  lsp?: LspConfig;
  damageControl?: DamageControlConfig;
}

/** Read and cache config. Call from any extension. */
export function getCraftConfig(pi?: { craftConfig?: CraftConfig }): CraftConfig {
  const cached = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CraftConfig | undefined;
  if (cached) return cached;

  let config: CraftConfig = {};

  // 1. pi may inject config at startup
  if (pi?.craftConfig) {
    config = { ...pi.craftConfig };
  }

  // 2. Fallback: read from settings.json (project first, then global)
  if (Object.keys(config).length === 0) {
    const projectSettings = path.join(process.cwd(), ".pi", "settings.json");
    const globalSettings = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
      ".pi", "agent", "settings.json",
    );
    for (const sp of [projectSettings, globalSettings]) {
      try {
        if (fs.existsSync(sp)) {
          const parsed = JSON.parse(fs.readFileSync(sp, "utf-8"));
          if (parsed.craft) {
            config = parsed.craft;
            if (Object.keys(config).length > 0) break;
          }
        }
      } catch { /* ignore */ }
    }
  }

  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = config;
  return config;
}

// ─── Bool Helpers ──────────────────────────────────────────────

/** Default-on: false only when explicitly set to false */
export function isOn(config: CraftConfig, key: keyof CraftConfig): boolean {
  return config[key] !== false;
}

/** Default-off: true only when explicitly set to true */
export function isEnabled(config: CraftConfig, key: keyof CraftConfig): boolean {
  return config[key] === true;
}

/**
 * Pi Craft — Damage Control Capability
 *
 * YAML-driven safety rules engine.
 * Intercepts tool_call events and evaluates them against loaded rules.
 * Runs AFTER Core's hardcoded checks (CWD Guard, system commands, sensitive files).
 *
 * Configuration:
 *   craft.enableDamageControl: boolean (default true)
 *   craft.damageControl.rules: string (default ".pi/damage-control-rules.yaml")
 *   craft.damageControl.promptMode: "confirm" | "auto-deny" | "auto-allow" (default "confirm")
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCraftConfig, isOn } from "../../core/config";
import type { DamageControlConfig } from "../../core/config";
import { RulesEngine, RuleLoader, ActionExecutor } from "./rules-engine";

// ─── Extension Entry ──────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableDamageControl")) return;

  const dcConfig: DamageControlConfig = config.damageControl ?? {};

  let engine: RulesEngine | null = null;

  // ── session_start: load rules ──────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    try {
      const rules = RuleLoader.load(ctx.cwd, dcConfig);
      engine = new RulesEngine(rules);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        ctx.ui.notify(`Damage Control: 规则加载失败 — ${msg}`, "error");
      } catch {
        /* ctx may not have UI */
      }
      engine = new RulesEngine([]);
    }
  });

  // ── turn_end: clear file cache ─────────────────────────
  pi.on("turn_end", async () => {
    engine?.clearCache();
  });

  // ── tool_call: evaluate rules ──────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    if (!engine) return;

    const match = engine.evaluate({
      tool: event.toolName,
      toolInput: event.input as Record<string, unknown>,
      cwd: ctx.cwd,
    });

    if (!match) return;

    const promptMode = dcConfig.promptMode ?? "confirm";
    const result = await ActionExecutor.execute(match, promptMode, {
      cwd: ctx.cwd,
      ui: ctx.ui,
    });

    if (result?.blocked) {
      return { block: true, reason: `[Damage Control] ${result.reason}` };
    }
  });
}

/**
 * Pi Craft — Cross-Extension Shared State Registry
 *
 * Uses globalThis because jiti creates separate module contexts
 * per extension entry point, so module-level variables are NOT
 * shared across extensions within the same package.
 *
 * Core extension calls initState() on startup.
 * Scenario extensions call getState() to read.
 */

import type { TokenTracker } from "./token-tracker";
import type { SubagentManager } from "./subagent-manager";
import type { StatuslineManager } from "../ui/statusline";
import type { WorkflowEngine } from "./workflow-engine";

const GLOBAL_KEY = "__pi_craft_state__";

export interface CraftState {
  tracker: TokenTracker;
  subagent: SubagentManager;
  statusline: StatuslineManager;
  engine: WorkflowEngine | null;
  parallelEnabled: boolean;
  cwdGuardEnabled: boolean;
  subagentEnabled: boolean;
}

/** Called once by Core extension during initialization */
export function initState(state: CraftState): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = state;
}

/** Get current shared state. Returns null if Core hasn't initialized. */
export function getState(): CraftState | null {
  const s = (globalThis as Record<string, unknown>)[GLOBAL_KEY];
  return (s && (s as CraftState).statusline) ? (s as CraftState) : null;
}

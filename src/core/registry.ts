/**
 * Pi Craft — Cross-Extension Shared State Registry
 *
 * Since all extension entry points in this package share the same
 * Node.js module root, importing this module from any extension
 * gives the same singleton instance.
 *
 * Core extension calls initState() on startup.
 * Scenario extensions call getState() to read.
 */

import type { TokenTracker } from "./token-tracker";
import type { SubagentManager } from "./subagent-manager";
import type { StatuslineManager } from "../ui/statusline";
import type { WorkflowEngine } from "./workflow-engine";

export interface CraftState {
  tracker: TokenTracker;
  subagent: SubagentManager;
  statusline: StatuslineManager;
  engine: WorkflowEngine | null;
  parallelEnabled: boolean;
  cwdGuardEnabled: boolean;
  subagentEnabled: boolean;
}

const _state: Partial<CraftState> = {};

/** Called once by Core extension during initialization */
export function initState(state: CraftState): void {
  Object.assign(_state, state);
}

/** Get current shared state. Scenarios read from this. */
export function getState(): CraftState {
  return _state as CraftState;
}

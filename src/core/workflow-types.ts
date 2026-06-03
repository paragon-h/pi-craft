/**
 * Pi Craft — Shared Workflow Types
 *
 * Minimal type definitions shared across extensions.
 * Replaces the old WorkflowEngine class — no state machine, just types.
 */

export type WorkflowStage =
  | "idle"
  | "code_analysis"
  | "requirement"
  | "design"
  | "testing"
  | "implementation"
  | "completed"
  | "scope"
  | "analyze"
  | "report";

/** Workflow metadata stored as custom session entry by coding/index.ts */
export interface WorkflowMeta {
  type: "coding";
  topic: string;
  requirement: string;
  plansDir: string;
  stage: string;
  startedAt: number;
  stages: { stage: string; completedAt: number; outputFile: string }[];
}

export const CRAFT_WORKFLOW_TYPE = "craft-workflow";

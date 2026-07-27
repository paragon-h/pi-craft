/** Shared type definitions used across multiple extensions. */

export interface Task {
  id: number;
  title: string;
  status: "queued" | "in_progress" | "done" | "cancelled";
}

export interface TodoDetails {
  action: string;
  tasks: Task[];
  nextId: number;
  error?: string;
}

export interface FileChange {
  path: string;
  type: "write" | "read";
}

// ─── Cost tracking types ───────────────────────────────────────────────

export interface TurnCost {
  turnIndex: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  toolNames: string[];
}

export interface ToolUsage {
  calls: number;
  cost: number;
}

export interface SessionCost {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  turns: TurnCost[];
  toolBreakdown: Record<string, ToolUsage>;
}

export interface SessionCostReport {
  sessionPath: string;
  sessionName: string;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
}

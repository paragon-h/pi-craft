/**
 * Pi Craft — Subagent Widget Capability
 *
 * Renders a persistent TUI widget showing subagent execution progress.
 * In single mode: tracks the subagent's turn (from delegation to completion),
 * showing tool calls and activity in real-time.
 * In parallel mode: shows results as they complete.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCraftConfig, isOn } from "../../core/config";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface SubagentWidgetState {
  /** Subagent name */
  agent: string;
  /** Task being performed */
  task: string;
  /** Recent tool calls during execution */
  toolCalls: Array<{ name: string; preview: string; timestamp: number }>;
  /** Whether execution has completed */
  completed: boolean;
  /** Completion status icon */
  statusIcon: string;
  /** Token usage on completion */
  usageSummary: string;
  /** Turn count */
  turnCount: number;
  /** Timestamps */
  startedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// Widget Rendering (pure function — returns text lines for TUI)
// ═══════════════════════════════════════════════════════════════

const MAX_VISIBLE_TOOLS = 5;
const MAX_PREVIEW_LEN = 60;

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function formatToolCall(tc: { name: string; preview: string }, fg: (c: string, t: string) => string): string {
  const icon = tc.name === "bash" ? "$" : tc.name === "read" ? "📖" : tc.name === "write" ? "📝" : tc.name === "edit" ? "✏️" : tc.name === "grep" ? "🔍" : "→";
  return `  ${fg("muted", icon)} ${truncate(tc.preview, MAX_PREVIEW_LEN)}`;
}

function renderWidget(state: SubagentWidgetState, theme: { fg: (c: string, t: string) => string; bold: (t: string) => string }, width: number): string[] {
  const fg = theme.fg.bind(theme);
  const bold = theme.bold.bind(theme);
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────
  const header = state.completed
    ? ` ${state.statusIcon} subagent: ${state.agent} ${fg("dim", "· done")}`
    : ` 🏗 subagent: ${state.agent} ${fg("warning", "· running")}`;
  lines.push(fg("toolTitle", bold(header)));

  // ── Task ────────────────────────────────────────────
  const taskPreview = truncate(state.task, width - 4);
  lines.push(fg("dim", `   ${taskPreview}`));

  // ── Tool calls ──────────────────────────────────────
  if (state.toolCalls.length > 0) {
    const visible = state.toolCalls.slice(-MAX_VISIBLE_TOOLS);
    for (const tc of visible) {
      lines.push(formatToolCall(tc, fg));
    }
    if (state.toolCalls.length > MAX_VISIBLE_TOOLS) {
      lines.push(fg("dim", `  ... and ${state.toolCalls.length - MAX_VISIBLE_TOOLS} more tool calls`));
    }
  }

  // ── Progress bar ────────────────────────────────────
  if (state.completed) {
    lines.push(fg("dim", `  ${state.usageSummary}`));
  } else {
    // Animated running indicator
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m${elapsed % 60}s`;
    lines.push(fg("warning", `  ⏳ Running… ${elapsedStr} · ${state.turnCount} turns`));
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════
// Extension Entry
// ═══════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableSubagentWidget")) return;

  let widgetState: SubagentWidgetState | null = null;
  let turnCallback: (() => void) | null = null;

  function clearWidget(ctx: { hasUI: boolean; ui: { setWidget: (k: string, v: unknown) => void } }) {
    if (!ctx.hasUI) return;
    widgetState = null;
    ctx.ui.setWidget("craft-subagent-progress", undefined);
    if (turnCallback) {
      turnCallback = null;
    }
  }

  function updateWidget(ctx: { hasUI: boolean; ui: { setWidget: (k: string, v: unknown) => void; theme: { fg: (c: string, t: string) => string; bold: (t: string) => string } } }) {
    if (!ctx.hasUI || !widgetState) return;
    const lines = renderWidget(widgetState, ctx.ui.theme, 80);
    ctx.ui.setWidget("craft-subagent-progress", lines);
  }

  // ── agent_start: detect subagent delegation ──────────
  // When a subagent delegation steer message is processed, the LLM
  // starts a new turn as the subagent. We detect this by checking for
  // the subagent identity in the system prompt or the task instruction.
  pi.on("before_agent_start", async (event, ctx) => {
    // Check if the previous tool call in this conversation was a subagent delegation
    // by looking at recent context — if there's a subagent identity hint
    const prompt = event.systemPrompt || "";
    const hasSubagentDelegation =
      prompt.includes("[SUBAGENT MODE:") ||
      prompt.includes("## 🏗 Subagent Delegation");

    if (!hasSubagentDelegation) return;

    // Extract agent name and task from the delegation message
    const agentMatch = prompt.match(/\*\*([^*]+)\*\*\s+subagent/i) || prompt.match(/Subagent Delegation:\s*\*\*([^*]+)\*\*/);
    const taskMatch = prompt.match(/### Task:\s*\n([\s\S]*?)(?:\n\n---|$)/);

    const agent = agentMatch ? agentMatch[1].trim() : "unknown";
    const task = taskMatch ? taskMatch[1].trim() : "executing task...";

    widgetState = {
      agent,
      task,
      toolCalls: [],
      completed: false,
      statusIcon: "✅",
      usageSummary: "",
      turnCount: 0,
      startedAt: Date.now(),
    };

    updateWidget(ctx);
  });

  // ── tool_call: track subagent activity ───────────────
  pi.on("tool_call", async (event, ctx) => {
    if (!widgetState || widgetState.completed) return;

    let preview = "";
    switch (event.toolName) {
      case "bash":
        preview = (event.input.command as string) || "…";
        break;
      case "read":
        preview = (event.input.path as string) || "…";
        break;
      case "write":
        preview = (event.input.path as string) || "…";
        break;
      case "edit":
        preview = ((event.input.path || event.input.file_path) as string) || "…";
        break;
      case "grep":
        preview = `/${event.input.pattern as string || "…"}/`;
        break;
      case "find":
        preview = (event.input.pattern as string) || "*";
        break;
      default:
        preview = event.toolName;
    }

    widgetState.toolCalls.push({
      name: event.toolName,
      preview,
      timestamp: Date.now(),
    });

    updateWidget(ctx);
  });

  // ── turn_end: increment counter ──────────────────────
  pi.on("turn_end", async (_event, ctx) => {
    if (!widgetState || widgetState.completed) return;
    widgetState.turnCount++;
    updateWidget(ctx);
  });

  // ── agent_end: mark as completed ─────────────────────
  pi.on("agent_end", async (_event, ctx) => {
    if (!widgetState || widgetState.completed) return;

    widgetState.completed = true;
    widgetState.statusIcon = "✅";

    // Build a simple usage summary from tool call count
    const toolCount = widgetState.toolCalls.length;
    widgetState.usageSummary = `✓ Done · ${toolCount} tool calls · ${widgetState.turnCount} turns`;

    updateWidget(ctx);

    // Auto-clear after 5 seconds
    setTimeout(() => clearWidget(ctx), 5000);
  });

  // ── subagent tool execution: handle parallel mode ────
  // Listen for subagent tool results to show parallel/chain progress
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "subagent") return;

    const params = event.input as Record<string, unknown>;
    const taskCount = (params.tasks as unknown[] | undefined)?.length
      ?? (params.chain as unknown[] | undefined)?.length
      ?? 0;

    if (taskCount > 1 && ctx.hasUI) {
      // Parallel/chain mode — show a quick widget
      const mode = params.tasks ? "parallel" : "chain";
      widgetState = {
        agent: `${mode} (${taskCount})`,
        task: `Running ${taskCount} subagents in ${mode}`,
        toolCalls: [],
        completed: false,
        statusIcon: "✅",
        usageSummary: "",
        turnCount: 0,
        startedAt: Date.now(),
      };
      updateWidget(ctx);
    }
  });
}

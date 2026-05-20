/**
 * Pi Craft — Subagent Tool Registration & TUI Rendering
 *
 * 注册 subagent 工具到 Pi，支持：
 * - Single / Parallel / Chain 三种模式
 * - Parallel 模式下实时显示各任务状态
 * - Collapsed/Expanded 视图切换 (Ctrl+O)
 * - 详细展示每个 subagent 的 tool call 执行过程
 * - Token 用量统计
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { SubagentManager, SubagentDetails, SingleResult } from "../core/subagent-manager.js";
import { formatTokens, formatCost } from "../core/token-tracker.js";
import type { StatuslineManager } from "../ui/statusline.js";

// ─── 参数 Schema ───────────────────────────────────────────────

const TaskItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
});

const ChainItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task with optional {previous} placeholder" }),
});

const SubagentParams = Type.Object({
  agent: Type.Optional(Type.String({ description: "Agent name (single mode)" })),
  task: Type.Optional(Type.String({ description: "Task to delegate (single mode)" })),
  tasks: Type.Optional(Type.Array(TaskItem, { description: "Array of {agent, task} for parallel execution" })),
  chain: Type.Optional(Type.Array(ChainItem, { description: "Array of {agent, task} for chain execution" })),
});

// ─── 格式化 ────────────────────────────────────────────────────

function fmtToolCall(name: string, args: Record<string, unknown>, fg: (c: string, t: string) => string): string {
  switch (name) {
    case "bash": {
      const cmd = (args.command as string) || "...";
      const preview = cmd.length > 50 ? cmd.slice(0, 50) + "..." : cmd;
      return fg("muted", "$ ") + fg("toolOutput", preview);
    }
    case "read": {
      const p = (args.path as string) || "...";
      return fg("muted", "read ") + fg("accent", p.replace(process.env.HOME ?? "", "~"));
    }
    case "write": {
      const p = (args.path as string) || "...";
      return fg("muted", "write ") + fg("accent", p.replace(process.env.HOME ?? "", "~"));
    }
    case "edit": {
      const p = (args.file_path || args.path || "...") as string;
      return fg("muted", "edit ") + fg("accent", p.replace(process.env.HOME ?? "", "~"));
    }
    case "grep": {
      const pattern = (args.pattern || "") as string;
      return fg("muted", "grep ") + fg("accent", `/${pattern}/`);
    }
    case "find": {
      return fg("muted", "find ") + fg("accent", (args.pattern || "*") as string);
    }
    default:
      return fg("accent", name);
  }
}

function fmtUsage(r: SingleResult): string {
  const parts: string[] = [];
  if (r.usage.turns) parts.push(`${r.usage.turns}t`);
  if (r.usage.input) parts.push(`↑${formatTokens(r.usage.input)}`);
  if (r.usage.output) parts.push(`↓${formatTokens(r.usage.output)}`);
  if (r.usage.cost) parts.push(formatCost(r.usage.cost));
  if (r.model) parts.push(r.model);
  return parts.join(" ");
}

// ─── Collapsed 视图 ────────────────────────────────────────────

function renderCollapsed(details: SubagentDetails, theme: { fg: (c: string, t: string) => string; bold: (t: string) => string }): string {
  const { mode, results } = details;

  if (mode === "single" && results.length === 1) {
    const r = results[0];
    const ok = r.exitCode === 0;
    const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
    const output = getOutput(r).slice(0, 200);
    let text = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))} ${theme.fg("muted", `(${r.agentSource})`)}`;
    if (output) text += `\n${theme.fg("toolOutput", output)}`;
    text += `\n${theme.fg("dim", fmtUsage(r))}`;
    text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
    return text;
  }

  if (mode === "parallel") {
    const done = results.filter((r) => r.exitCode >= 0).length;
    const running = results.filter((r) => r.exitCode === -1).length;
    const ok = results.filter((r) => r.exitCode === 0).length;
    const fail = results.filter((r) => r.exitCode > 0).length;
    let text = running > 0
      ? `${theme.fg("warning", "⏳")} ${theme.fg("toolTitle", theme.bold("parallel"))} ${done}/${results.length} done, ${running} running`
      : `${fail > 0 ? theme.fg("warning", "◐") : theme.fg("success", "✓")} ${theme.fg("toolTitle", theme.bold("parallel"))} ${ok}/${results.length}`;
    for (const r of results) {
      const icon = r.exitCode === -1 ? theme.fg("warning", "⏳") : r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
      text += `\n  ${icon} ${theme.fg("accent", r.agent)} ${theme.fg("dim", fmtUsage(r))}`;
    }
    text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
    return text;
  }

  if (mode === "chain") {
    const ok = results.filter((r) => r.exitCode === 0).length;
    let text = `${ok === results.length ? theme.fg("success", "✓") : theme.fg("error", "✗")} ${theme.fg("toolTitle", theme.bold("chain"))} ${ok}/${results.length}`;
    for (const r of results) {
      const icon = r.exitCode === 0 ? theme.fg("success", "✓") : theme.fg("error", "✗");
      text += `\n  ${icon} ${theme.fg("accent", r.agent)} ${theme.fg("dim", fmtUsage(r))}`;
    }
    text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
    return text;
  }

  return "(no results)";
}

// ─── Expanded 视图 ────────────────────────────────────────────

function renderExpanded(details: SubagentDetails, theme: { fg: (c: string, t: string) => string; bold: (t: string) => string }): Container {
  const { mode, results } = details;
  const mdTheme = getMarkdownTheme();
  const container = new Container();

  const title = mode === "parallel" ? `Parallel (${results.length} tasks)` : mode === "chain" ? `Chain (${results.length} steps)` : `Single`;
  container.addChild(new Text(theme.fg("toolTitle", theme.bold(`subagent ${title}`)), 0, 0));
  container.addChild(new Spacer(1));

  for (const r of results) {
    const ok = r.exitCode === 0;
    const icon = r.exitCode === -1 ? "⏳" : ok ? "✓" : "✗";
    const color = r.exitCode === -1 ? "warning" : ok ? "success" : "error";

    container.addChild(new Text(`${theme.fg(color, icon)} ${theme.fg("accent", r.agent)} ${theme.fg("muted", `(${r.agentSource})`)}`, 0, 0));
    container.addChild(new Text(theme.fg("dim", `Task: ${r.task.slice(0, 200)}`), 0, 0));
    container.addChild(new Spacer(1));

    // Tool calls
    const items = getDisplayItems(r);
    if (items.length > 0) {
      container.addChild(new Text(theme.fg("muted", "─── Tool Calls ───"), 0, 0));
      for (const item of items.slice(-20)) {
        if (item.type === "toolCall") {
          container.addChild(new Text(theme.fg("muted", "→ ") + fmtToolCall(item.name, item.args, theme.fg.bind(theme)), 0, 0));
        }
      }
      container.addChild(new Spacer(1));
    }

    // Output
    const output = getOutput(r);
    if (output) {
      container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
      container.addChild(new Markdown(output.trim().slice(0, 3000), 0, 0, mdTheme));
      container.addChild(new Spacer(1));
    }

    // Stats
    container.addChild(new Text(theme.fg("dim", fmtUsage(r)), 0, 0));
    container.addChild(new Spacer(1));
  }

  return container;
}

// ─── 辅助 ──────────────────────────────────────────────────────

interface DisplayItem {
  type: "text" | "toolCall";
  name?: string;
  args?: Record<string, unknown>;
}

function getDisplayItems(r: SingleResult): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of r.messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "toolCall") {
          items.push({
            type: "toolCall",
            name: (part as Record<string, unknown>).name as string,
            args: (part as Record<string, unknown>).arguments as Record<string, unknown> || {},
          });
        }
      }
    }
  }
  return items;
}

function getOutput(r: SingleResult): string {
  for (let i = r.messages.length - 1; i >= 0; i--) {
    const msg = r.messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

// ─── 注册工具 ───────────────────────────────────────────────────

export function registerSubagentTool(
  pi: ExtensionAPI,
  subagent: SubagentManager,
  statusline: StatuslineManager,
) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: [
      "Delegate tasks to specialized subagents with isolated context.",
      "Modes: single (agent + task), parallel (tasks array for concurrent execution), chain (sequential with {previous} placeholder).",
    ].join(" "),
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const hasChain = (params.chain?.length ?? 0) > 0;
      const hasTasks = (params.tasks?.length ?? 0) > 0;
      const hasSingle = Boolean(params.agent && params.task);
      const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

      if (modeCount !== 1) {
        return {
          content: [{ type: "text", text: `Provide exactly one mode. Available agents: ${subagent.getAgentNames().join(", ")}` }],
          details: { mode: "single", results: [] } as SubagentDetails,
        };
      }

      // Parallel
      if (params.tasks?.length) {
        statusline.updateSubagent(`parallel(${params.tasks.length})`, "running");
        const results = await subagent.runParallel(ctx.cwd, params.tasks, signal, (partial) => {
          onUpdate?.({
            content: partial.content,
            details: partial.details,
          });
        });
        const ok = results.filter((r) => r.exitCode === 0).length;
        statusline.updateSubagent(null);

        // 返回每个 subagent 的完整输出给主 agent
        const outputs = results.map((r) => {
          const output = getOutput(r);
          const ok = r.exitCode === 0;
          return `### ${ok ? "✓" : "✗"} ${r.agent}\n> ${r.task.slice(0, 100)}\n\n${output || "(no output)"}\n`;
        });
        return {
          content: [{ type: "text", text: `Parallel execution: ${ok}/${results.length} succeeded\n\n${outputs.join("\n---\n\n")}` }],
          details: { mode: "parallel", results },
        };
      }

      // Chain
      if (params.chain?.length) {
        let previous = "";
        const chainResults: SingleResult[] = [];
        for (const step of params.chain) {
          statusline.updateSubagent(step.agent, "running");
          const taskText = step.task.replace(/\{previous\}/g, previous);
          const r = await subagent.runSingle(ctx.cwd, step.agent, taskText, signal, (partial) => {
            onUpdate?.({ content: partial.content, details: { mode: "chain", results: [...chainResults, partial.details?.results?.[0] ?? r].filter(Boolean) } });
          });
          chainResults.push(r);
          previous = getOutput(r);
          if (r.exitCode !== 0) break;
        }
        statusline.updateSubagent(null);

        const outputs = chainResults.map((r, i) => {
          const output = getOutput(r);
          const ok = r.exitCode === 0;
          return `### Step ${i + 1}: ${ok ? "✓" : "✗"} ${r.agent}\n> ${r.task.slice(0, 100)}\n\n${output || "(no output)"}\n`;
        });
        return {
          content: [{ type: "text", text: `Chain execution:\n\n${outputs.join("\n---\n\n")}` }],
          details: { mode: "chain", results: chainResults },
        };
      }

      // Single
      if (params.agent && params.task) {
        statusline.updateSubagent(params.agent, "running");
        const r = await subagent.runSingle(ctx.cwd, params.agent, params.task, signal, (partial) => {
          onUpdate?.(partial);
        });
        statusline.updateSubagent(params.agent, r.exitCode === 0 ? "done" : "error");
        return {
          content: [{ type: "text", text: getOutput(r) || "(no output)" }],
          details: { mode: "single", results: [r] },
        };
      }

      return {
        content: [{ type: "text", text: `Invalid parameters. Available agents: ${subagent.getAgentNames().join(", ")}` }],
        details: { mode: "single", results: [] },
      };
    },

    // ─── Collapsed 渲染 ────────────────────────────────
    renderCall(args, theme, _context) {
      if (args.tasks?.length) {
        return new Text(
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `parallel (${args.tasks.length})`) +
          "\n" + theme.fg("dim", args.tasks.map((t: { agent: string; task: string }) => `  ${t.agent}: ${t.task.slice(0, 40)}`).join("\n")),
          0, 0,
        );
      }
      if (args.chain?.length) {
        return new Text(
          theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", `chain (${args.chain.length})`),
          0, 0,
        );
      }
      return new Text(
        theme.fg("toolTitle", theme.bold("subagent ")) +
        theme.fg("accent", (args.agent || "?")) +
        "\n" + theme.fg("dim", (args.task || "...").slice(0, 60)),
        0, 0,
      );
    },

    // ─── Result 渲染 ──────────────────────────────────
    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as SubagentDetails | undefined;
      if (!details || details.results.length === 0) {
        return new Text("(no result)", 0, 0);
      }

      if (expanded) {
        return renderExpanded(details, theme);
      }

      return new Text(renderCollapsed(details, theme), 0, 0);
    },
  });
}

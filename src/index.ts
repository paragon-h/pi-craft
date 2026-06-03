/**
 * Pi Craft — Core Extension
 *
 * Always-loaded infrastructure extension providing:
 * 1. TokenTracker — global token usage monitoring + /tokens dashboard
 * 2. SubagentManager — subagent discovery and lifecycle
 * 3. StatuslineManager — enhanced status bar
 * 4. CWD Guard — write operation boundary enforcement
 * 5. Safety Interlocks — dangerous command / sensitive file confirms
 *
 * Scenarios (coding) are loaded as separate
 * extensions. They access shared state via src/core/registry.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

import { SubagentManager } from "./core/subagent-manager";
import { registerSubagentTool } from "./core/subagent-tool";
import { TokenTracker, setupTokenTracking } from "./core/token-tracker";
import { checkCwdGuard } from "./core/cwd-guard";
import { StatuslineManager } from "./ui/statusline";
import { initState, getState } from "./core/registry";
import { getCraftConfig, isOn, isEnabled } from "./core/config";

// ─── Main Entry ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ─── Initialize Managers ──────────────────────────────
  const tracker = new TokenTracker();
  const subagent = new SubagentManager();
  const statusline = new StatuslineManager();

  // ─── Read Config ──────────────────────────────────────
  const config = getCraftConfig(pi as { craftConfig?: Record<string, unknown> });
  const subagentEnabled = isOn(config, "enableSubagent");
  const parallelEnabled = isEnabled(config, "enableParallelSubagent");
  const cwdGuardEnabled = isOn(config, "enableCwdGuard");

  // ─── Share State With Scenarios ───────────────────────
  initState({
    tracker,
    subagent,
    statusline,
    parallelEnabled,
    cwdGuardEnabled,
    subagentEnabled,
  });

  // ─── Load User-Level Agents ──────────────────────────
  // Built-in agents (scout, architect, etc.) are loaded by the coding scenario.
  if (subagentEnabled) {
    const homeAgentDir = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
      ".pi", "agent", "agents",
    );
    subagent.loadPiAgents(homeAgentDir);
  }

  // ─── Register Subagent Tool ──────────────────────────
  registerSubagentTool(pi, subagent, statusline, tracker, subagentEnabled, parallelEnabled);

  // ─── Token Tracking ──────────────────────────────────
  setupTokenTracking(pi, tracker);

  // ─── Session Start ───────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    statusline.bind(ctx);

    // Track session
    tracker.recordSessionStart();

    // Sync model to subagent manager
    if (ctx.model) {
      subagent.setParentModel(ctx.model.id, ctx.model.provider);
      tracker.setModelProvider(ctx.model.id, ctx.model.provider);
    }

    // Restore token data
    const branchEntries = ctx.sessionManager.getBranch();
    for (const entry of branchEntries) {
      if (entry.type === "custom" && entry.customType === TokenTracker.getCustomType()) {
        const restored = TokenTracker.fromPersistenceData(entry.data);
        for (const snap of restored.getStats().history) {
          tracker.recordUsage(snap.model, snap.provider, {
            input: snap.input,
            output: snap.output,
            cacheRead: snap.cacheRead,
            cacheWrite: snap.cacheWrite,
            cost: snap.cost,
          });
        }
        break;
      }
    }

    // Delayed statusline update for TUI readiness
    // Use a self-calling closure to avoid stale ctx issues after session replacement
    const _statusline = statusline;
    const _tracker = tracker;
    const _parallel = parallelEnabled;
    const _guard = cwdGuardEnabled;
    setTimeout(() => {
      try {
        _statusline.updateTokens(_tracker);
        _statusline.updateParallel(_parallel);
        _statusline.updateGuard(_guard);
      } catch { /* ctx may be stale after session replacement */ }
    }, 50);
  });

  // ─── Turn End — Token Display ────────────────────────
  pi.on("turn_end", async (_event, ctx) => {
    if (ctx.hasUI) {
      statusline.updateTokens(tracker);
    }
  });

  // ─── Model Change Sync ───────────────────────────────
  pi.on("model_select", async (event) => {
    subagent.setParentModel(event.model.id, event.model.provider);
    tracker.setModelProvider(event.model.id, event.model.provider);
  });

  // ─── Tool Interception ───────────────────────────────
  pi.on("tool_call", async (event, ctx) => {
    // Fix write tool parameter: file_path → path
    if (event.toolName === "write" && (event.input as Record<string, unknown>).file_path && !(event.input as Record<string, unknown>).path) {
      (event.input as Record<string, unknown>).path = (event.input as Record<string, unknown>).file_path;
      delete (event.input as Record<string, unknown>).file_path;
    }

    // ── CWD Guard: write operations must be inside project dir ──
    if (cwdGuardEnabled) {
      const reason = checkCwdGuard(event.toolName, event.input as Record<string, unknown>, ctx.cwd);
      if (reason) {
        const ok = await ctx.ui.confirm("⚠️ 外部写操作", `${reason}\n\n是否允许此操作？`);
        if (!ok) return { block: true, reason: `用户拒绝了工作目录外的写操作。\n${reason}` };
      }
    }

    // ── Dangerous System Commands ──────────────────────
    if (event.toolName === "bash") {
      const command = (event.input.command as string) || "";
      const systemDangerPatterns = [
        { pattern: /sudo/, label: "提权操作 (sudo)" },
        { pattern: /(?:^|\s)kill/, label: "终止进程 (kill)" },
        { pattern: /(?:^|\s)docker\s/, label: "Docker 操作" },
      ];
      for (const { pattern, label } of systemDangerPatterns) {
        if (pattern.test(command)) {
          const preview = command.length > 120 ? command.slice(0, 120) + "..." : command;
          const ok = await ctx.ui.confirm(
            `⚠️ 系统级命令: ${label}`,
            `命令: ${preview}\n\n此命令影响范围超出工作目录。是否允许执行？`,
          );
          if (!ok) return { block: true, reason: `用户拒绝了系统级命令: ${label}\n命令: ${preview}` };
          break;
        }
      }
    }

    // ── Sensitive File Protection ──────────────────────
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = ((event.input.path || event.input.file_path || "") as string).toLowerCase();
      const sensitiveFiles = [
        { pattern: /\.env$/, label: "环境变量文件 (.env)" },
        { pattern: /package\.json$/, label: "package.json" },
        { pattern: /package-lock|yarn\.lock|pnpm-lock/, label: "依赖锁文件" },
        { pattern: /go\.mod$/, label: "go.mod" },
        { pattern: /go\.sum$/, label: "go.sum" },
        { pattern: /dockerfile$/i, label: "Dockerfile" },
        { pattern: /docker-compose/, label: "Docker Compose" },
        { pattern: /Makefile$/, label: "Makefile" },
        { pattern: /tsconfig/, label: "TypeScript 配置" },
        { pattern: /\.gitignore$/, label: ".gitignore" },
        { pattern: /credentials|secret|token|key\.pem|id_rsa/, label: "凭证/密钥文件" },
      ];
      for (const { pattern, label } of sensitiveFiles) {
        if (pattern.test(filePath)) {
          const ok = await ctx.ui.confirm(
            `⚠️ 修改敏感文件: ${label}`,
            `文件: ${filePath}\n\n修改此文件可能影响项目配置或安全性。是否允许？`,
          );
          if (!ok) return { block: true, reason: `用户拒绝了敏感文件修改: ${label}` };
          break;
        }
      }
    }

    // NOTE: Stage-specific tool restrictions (read-only stages) are
    // handled by the coding scenario extension, not here.
  });

  // ─── /tokens Command ──────────────────────────────────
  pi.registerCommand("tokens", {
    description: "Show token usage dashboard",
    handler: async (args, ctx) => {
      statusline.bind(ctx);

      // ── /tokens --export: write JSON to .pi/craft/ ──
      if (args?.includes("--export")) {
        const json = tracker.toExportJSON();
        const datetime = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
        const exportDir = path.join(ctx.cwd, ".pi", "craft");
        fs.mkdirSync(exportDir, { recursive: true });
        const filePath = path.join(exportDir, `tokens-${datetime}.json`);
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), "utf-8");
        if (ctx.hasUI) {
          ctx.ui.notify(`📊 Tokens exported → ${filePath}`, "success");
        } else {
          ctx.ui.notify(`Tokens exported: ${filePath}`, "info");
        }
        return;
      }

      if (!ctx.hasUI) {
        const total = tracker.getStats().total;
        ctx.ui.notify(
          `Tokens: In ${formatTotal(total.input, 0)} Out ${formatTotal(total.output, 0)} Cost $${total.cost.toFixed(3)} Turns ${total.turns}`,
          "info",
        );
        return;
      }

      const { createOverviewDashboard, createDetailDashboard } = await import("./ui/token-dashboard");
      const { matchesKey, Key } = await import("@earendil-works/pi-tui");

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        let showDetail = false;
        let overview = createOverviewDashboard(tracker, theme, 80);
        let detail = createDetailDashboard(tracker, theme, 80);
        let lastW = 0;

        return {
          render: (w: number) => {
            if (w !== lastW) {
              overview = createOverviewDashboard(tracker, theme, w);
              detail = createDetailDashboard(tracker, theme, w);
              lastW = w;
            }
            return showDetail ? detail.render(w) : overview.render(w);
          },
          invalidate: () => (showDetail ? detail : overview).invalidate(),
          handleInput: (data: string) => {
            if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
              done(undefined);
              return;
            }
            if (matchesKey(data, Key.tab)) {
              showDetail = !showDetail;
            }
          },
        };
      });
    },
  });

  // ─── ctrl+shift+t Shortcut ────────────────────────────
  pi.registerShortcut("ctrl+shift+t", {
    description: "Show token summary",
    handler: async (ctx) => {
      statusline.bind(ctx);
      // Quick token summary via hotkey — updated at turn_end
      const total = tracker.getStats().total;
      const throughput = tracker.getThroughput();
      ctx.ui.notify(
        `Tokens: ↑${formatTotal(total.input, 0)} ↓${formatTotal(total.output, 0)} $${total.cost.toFixed(3)} | ${throughput}`,
        "info",
      );
    },
  });
}

// ─── Helpers ───────────────────────────────────────────────────

function formatTotal(n: number, pad: number, prefix = ""): string {
  if (n < 1000) return (prefix + n).padStart(pad);
  if (n < 10000) return (prefix + (n / 1000).toFixed(1) + "k").padStart(pad);
  if (n < 1000000) return (prefix + Math.round(n / 1000) + "k").padStart(pad);
  return (prefix + (n / 1000000).toFixed(1) + "M").padStart(pad);
}

/**
 * Pi Craft — Main Extension Entry Point
 *
 * Mono-Repo 扩展入口，负责：
 * 1. 首次运行交互式场景选择
 * 2. 加载 TokenTracker / WorkflowEngine / SubagentManager / StatuslineManager
 * 3. 注册 /craft 命令和子场景路由
 * 4. 注册 /tokens 命令
 * 5. 绑定生命周期事件
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { SubagentManager } from "./core/subagent-manager";
import { registerSubagentTool } from "./core/subagent-tool";
import { TokenTracker, setupTokenTracking } from "./core/token-tracker";
import { WorkflowEngine, READONLY_TOOLS, FULL_TOOLS } from "./core/workflow-engine";
import { StatuslineManager } from "./ui/statusline";

// ─── 场景注册 ──────────────────────────────────────────────────

interface ScenarioModule {
  name: string;
  description: string;
  register(pi: ExtensionAPI, ctx: ExtensionContext, managers: Managers): void;
  startWorkflow(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    managers: Managers,
    args: string,
  ): Promise<void>;
}

interface Managers {
  engine: WorkflowEngine | null;
  tracker: TokenTracker;
  subagent: SubagentManager;
  statusline: StatuslineManager;
}

// 场景懒加载
async function loadScenario(name: string): Promise<ScenarioModule | null> {
  try {
    const mod = await import(`./workflows/${name}/index`);
    return mod.default || mod;
  } catch {
    return null;
  }
}

// ─── 场景设置 ──────────────────────────────────────────────────

const ALL_SCENARIOS: Record<string, { description: string }> = {
  coding: { description: "全流程开发 + Code Review" },
  stock: { description: "股票分析与报告" },
  travel: { description: "旅游规划与预订辅助" },
  knowledge: { description: "知识库管理与检索" },
};

async function getEnabledScenarios(pi: ExtensionAPI): Promise<string[]> {
  // 尝试从 settings 读取 craft 配置
  // pi 没有直接暴露 settings API，通过检查 session 中的配置 entry
  const craftConfig = (pi as Record<string, unknown>).craftConfig as
    | { enabledScenarios?: string[]; disabledScenarios?: string[] }
    | undefined;

  if (craftConfig?.enabledScenarios?.length) {
    return craftConfig.enabledScenarios;
  }

  // 默认全部启用（首次运行会弹出选择器）
  return Object.keys(ALL_SCENARIOS);
}

// ─── 主入口 ────────────────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  // ─── 初始化核心模块 ────────────────────────────────────
  const tracker = new TokenTracker();
  const subagent = new SubagentManager();
  const statusline = new StatuslineManager();

  // 加载内置 subagent 定义
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const builtinAgentsDir = path.join(__dirname, "workflows", "coding", "agents");
  if (fs.existsSync(builtinAgentsDir)) {
    subagent.loadBuiltinAgents(builtinAgentsDir);
  }

  // 也加载 Pi 原生 agents 目录
  const homeAgentDir = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
    ".pi", "agent", "agents",
  );
  subagent.loadPiAgents(homeAgentDir);

  // 注册 subagent 工具（带详细 TUI 渲染）
  registerSubagentTool(pi, subagent, statusline);

  let engine: WorkflowEngine | null = null;
  const managers: Managers = { engine: null, tracker, subagent, statusline };

  // ─── Token 追踪 ────────────────────────────────────────
  setupTokenTracking(pi, tracker);

  // ─── Session start ─────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    statusline.bind(ctx);

    // 同步当前模型到 subagent manager
    if (ctx.model) {
      subagent.setParentModel(ctx.model.id, ctx.model.provider);
    }

    // 恢复 token 数据
    const branchEntries = ctx.sessionManager.getBranch();
    for (const entry of branchEntries) {
      if (entry.type === "custom" && entry.customType === TokenTracker.getCustomType()) {
        const restored = TokenTracker.fromPersistenceData(entry.data);
        // merge into existing tracker
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

    // 确定启用的场景
    const enabledScenarios = await getEnabledScenarios(pi);

    // 恢复工作流
    engine = WorkflowEngine.restore(ctx);
    if (engine && engine.isActive()) {
      managers.engine = engine;
      statusline.updateWorkflow(engine.getType(), engine.getStage());
    }

    // 如果未配置场景，显示设置
    if (!(pi as Record<string, unknown>).craftConfig) {
      statusline.updateScenario(enabledScenarios.join(","));
    } else {
      statusline.updateScenario(enabledScenarios[0] ?? "coding");
    }

    // 更新 token 状态
    statusline.updateTokens(tracker);
  });

  // ─── Token 状态更新 ────────────────────────────────────
  pi.on("turn_end", async (_event, ctx) => {
    if (ctx.hasUI) {
      statusline.updateTokens(tracker);
    }
  });

  // ─── 模型变更同步 ─────────────────────────────────────
  pi.on("model_select", async (event) => {
    subagent.setParentModel(event.model.id, event.model.provider);
  });

  // ─── 工具管控（只读阶段拦截） ──────────────────────────
  pi.on("tool_call", async (event) => {
    // 修正 write 工具参数名：file_path → path
    if (event.toolName === "write" && (event.input as Record<string, unknown>).file_path && !(event.input as Record<string, unknown>).path) {
      (event.input as Record<string, unknown>).path = (event.input as Record<string, unknown>).file_path;
      delete (event.input as Record<string, unknown>).file_path;
    }
    const currentEngine = managers.engine;
    if (!currentEngine || !currentEngine.isActive()) return;

    const stage = currentEngine.getStage();
    const readOnlyStages: string[] = [
      "code_analysis", "requirement", "design", "testing",
      "scope", "analyze", "report",
    ];

    if (!readOnlyStages.includes(stage)) return;

    // write 工具：只允许写入 .pi/craft/plans/ 目录
    if (event.toolName === "write") {
      const filePath = (event.input.path as string) || "";
      if (!filePath.includes(".pi/craft/plans/")) {
        return {
          block: true,
          reason: `当前只读阶段 [${stage}] 不允许使用 write。仅允许写入 .pi/craft/plans/ 目录下的计划文档。`,
        };
      }
      // 允许写入 plans 目录
      return;
    }

    // edit 工具：只允许编辑 .pi/craft/plans/ 目录下的计划文档
    if (event.toolName === "edit") {
      const filePath = (event.input.file_path || event.input.path || "") as string;
      if (!filePath.includes(".pi/craft/plans/")) {
        return {
          block: true,
          reason: `当前阶段 [${stage}] 为只读阶段，不允许 edit 修改代码。仅允许编辑 .pi/craft/plans/ 目录。`,
        };
      }
      return;
    }

    // Bash 限制：只读阶段只允许安全的读操作，或写入 .pi/craft/plans/
    if (event.toolName === "bash") {
      const command = (event.input.command as string) || "";

      // 检查是否写入到 .pi/craft/plans/（允许）
      const writesToPlans = command.includes(".pi/craft/plans/");

      // 绝对禁止的写入操作（除非目标是 plans 目录）
      const writeOps = [">", " >>", "tee ", "dd ", "mkfifo"];
      const hasWriteOp = writeOps.some((op) => command.includes(op));

      if (hasWriteOp && !writesToPlans) {
        return {
          block: true,
          reason: `当前只读阶段不允许写入代码文件。仅允许写入 .pi/craft/plans/ 目录。\n命令: ${command.slice(0, 80)}`,
        };
      }

      // 危险命令（在任何阶段都拦截）
      const alwaysDangerous = [
        "rm ", "mv ", "cp ", "chmod", "chown", "kill", "sudo",
        "npm install", "yarn add", "pnpm add", "pip install", "cargo install",
        "git push", "git commit", "git merge", "git rebase", "git reset --hard",
        "docker", "make ",
      ];
      const hasDangerous = alwaysDangerous.some((d) => command.includes(d));

      // 安全前缀
      const safePrefixes = [
        "ls ", "cat ", "head ", "tail ", "wc ", "stat ",
        "find ", "grep ", "echo ", "pwd", "whoami", "which ",
        "node -v", "node --version", "npm -v", "tsc --", "npx --version",
        "git log", "git diff", "git status", "git branch", "git show",
        "git stash list", "git remote", "env", "printenv", "uname",
      ];
      const startsSafe = safePrefixes.some((p) => command.startsWith(p));

      if (hasDangerous || !startsSafe) {
        // git 子命令中安全的那些
        const isGitSafe = command.startsWith("git ") && !alwaysDangerous.some((d) => command.includes(d));
        if (!isGitSafe) {
          return {
            block: true,
            reason: `当前只读阶段不允许此命令: ${command.slice(0, 60)}...\n允许: ls, cat, head, tail, grep, find, wc, git log/diff/status, echo`,
          };
        }
      }
    }
  });

  // ─── /craft 命令 ───────────────────────────────────────
  pi.registerCommand("craft", {
    description: "Craft workflows: coding, review, status, scenarios",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["coding", "review", "resume", "status", "rollback", "abort", "scenarios"];
      const filtered = subcommands.filter((s) => s.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((v) => ({ value: v, label: v }))
        : null;
    },
    handler: async (args, ctx) => {
      statusline.bind(ctx);

      if (!args || args.trim() === "") {
        ctx.ui.notify(
          "Usage:\n  /craft coding <requirement> [topic-slug]\n  /craft review [target] [topic-slug]\n  /craft status | resume | rollback | abort | scenarios",
          "info",
        );
        return;
      }

      const parts = args.split(/\s+/);
      const subcommand = parts[0].toLowerCase();
      const rest = parts.slice(1).join(" ");

      switch (subcommand) {
        case "scenarios": {
          const enabled = await getEnabledScenarios(pi);
          const list = Object.entries(ALL_SCENARIOS)
            .map(([name, info]) => `${enabled.includes(name) ? "☑" : "☐"} ${name} — ${info.description}`)
            .join("\n");
          ctx.ui.notify(`Scenarios:\n${list}`, "info");
          return;
        }

        case "status": {
          if (!engine || !engine.isActive()) {
            ctx.ui.notify("No active workflow. Use /craft coding <requirement> to start.", "info");
          } else {
            const ctx2 = engine.getContext();
            const docs = engine.getDocumentPathForStage(engine.getStage());
            ctx.ui.notify(
              `Workflow: ${engine.getType()}/${engine.getStage()}\nTopic: ${ctx2.topicSlug}\nDocs: ${ctx2.plansDir}\nCurrent: ${docs ?? "N/A"}`,
              "info",
            );
          }
          return;
        }

        case "resume": {
          engine = WorkflowEngine.restore(ctx);
          if (!engine || !engine.isActive()) {
            ctx.ui.notify("No active workflow to resume.", "info");
            return;
          }
          managers.engine = engine;
          statusline.updateWorkflow(engine.getType(), engine.getStage());

          const scenario = await loadScenario(engine.getType());
          if (scenario) {
            scenario.register(pi, ctx, managers);
          }

          ctx.ui.notify(`Resumed: ${engine.getType()}/${engine.getStage()}`, "info");
          return;
        }

        case "rollback": {
          if (!engine || !engine.isActive()) {
            ctx.ui.notify("No active workflow to rollback.", "info");
            return;
          }
          const prev = engine.rollback();
          if (prev) {
            ctx.ui.notify(`Rolled back to: ${prev}`, "info");
            statusline.updateWorkflow(engine.getType(), prev);
            pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
          } else {
            ctx.ui.notify("Cannot rollback from current stage.", "warning");
          }
          return;
        }

        case "abort": {
          if (!engine) {
            ctx.ui.notify("No active workflow to abort.", "info");
            return;
          }
          const ok = await ctx.ui.confirm("Abort workflow?", "All generated documents will be preserved.");
          if (ok) {
            engine.abort();
            pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
            managers.engine = null;
            statusline.updateWorkflow("", "idle");
            ctx.ui.notify("Workflow aborted. Documents preserved in .pi/craft/plans/", "info");
          }
          return;
        }

        case "coding": {
          if (!rest.trim()) {
            ctx.ui.notify("Usage: /craft coding <requirement description> [topic-slug]", "warning");
            return;
          }

          // 解析参数
          const argParts = rest.split(/\s+/);
          // 最后一个参数如果是简短的英文字母数字+连字符，视为 topic-slug
          const lastPart = argParts[argParts.length - 1];
          const isSlug = /^[a-z0-9][a-z0-9-]{0,30}$/.test(lastPart) && argParts.length > 1;
          const topicSlug = isSlug ? argParts.pop()! : undefined;
          const requirement = argParts.join(" ");

          // 创建 develop 工作流
          engine = WorkflowEngine.create("coding", requirement, topicSlug, ctx.cwd);
          managers.engine = engine;
          engine.transition("code_analysis");
          statusline.updateWorkflow("coding", "code_analysis");

          // 持久化
          pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

          // 加载 coding 场景
          const scenario = await loadScenario("coding");
          if (scenario) {
            scenario.register(pi, ctx, managers);
            await scenario.startWorkflow(pi, ctx, managers, requirement);
          } else {
            ctx.ui.notify("Coding scenario not available.", "error");
          }

          return;
        }

        case "review": {
          // 加载 coding 场景的 review 子场景
          const scenario = await loadScenario("coding");
          if (!scenario) {
            ctx.ui.notify("Coding scenario not available.", "error");
            return;
          }

          // 创建 review 工作流
          engine = WorkflowEngine.create("coding", `review: ${rest || "current changes"}`, undefined, ctx.cwd);
          managers.engine = engine;
          engine.transition("scope");
          statusline.updateWorkflow("coding", "scope");

          pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

          scenario.register(pi, ctx, managers);
          await scenario.startWorkflow(pi, ctx, managers, rest || "");
          return;
        }

        default: {
          ctx.ui.notify(`Unknown subcommand: ${subcommand}\nTry: coding, review, status, resume, rollback, abort, scenarios`, "warning");
        }
      }
    },
  });

  // ─── /tokens 命令 ──────────────────────────────────────
  pi.registerCommand("tokens", {
    description: "Show token usage dashboard",
    handler: async (args, ctx) => {
      statusline.bind(ctx);

      if (!ctx.hasUI) {
        // Print mode: show plain text
        const total = tracker.getStats().total;
        ctx.ui.notify(
          `Tokens: In ${formatTotal(total.input, 0)} Out ${formatTotal(total.output, 0)} Cost $${total.cost.toFixed(3)} Turns ${total.turns}`,
          "info",
        );
        return;
      }

      // Interactive mode: overlay dashboard
      const { createTokenDashboard } = await import("./ui/token-dashboard");
      const { matchesKey, Key } = await import("@earendil-works/pi-tui");

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const dashboard = createTokenDashboard(tracker, theme, 80);

        return {
          render: (w: number) => dashboard.render(w),
          invalidate: () => dashboard.invalidate(),
          handleInput: (data: string) => {
            if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
              done(undefined);
            }
          },
        };
      });
    },
  });

  // ─── 场景注册快捷键 ────────────────────────────────────
  pi.registerShortcut("ctrl+shift+t", {
    description: "Show token summary",
    handler: async (ctx) => {
      statusline.bind(ctx);
      const total = tracker.getStats().total;
      const throughput = tracker.getThroughput();
      ctx.ui.notify(
        `Tokens: ↑${formatTotal(total.input, 0)} ↓${formatTotal(total.output, 0)} $${total.cost.toFixed(3)} | ${throughput}`,
        "info",
      );
    },
  });
}

// ─── Helper ───────────────────────────────────────────────────

function formatTotal(n: number, pad: number, prefix = ""): string {
  if (n < 1000) return (prefix + n).padStart(pad);
  if (n < 10000) return (prefix + (n / 1000).toFixed(1) + "k").padStart(pad);
  if (n < 1000000) return (prefix + Math.round(n / 1000) + "k").padStart(pad);
  return (prefix + (n / 1000000).toFixed(1) + "M").padStart(pad);
}

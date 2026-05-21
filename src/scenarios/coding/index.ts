/**
 * Pi Craft — Coding Scenario Extension
 *
 * Self-contained extension for the coding workflow scenario.
 * Must be loaded alongside the Core extension (which provides
 * TokenTracker, SubagentManager, StatuslineManager via registry).
 *
 * Workflow stages:
 *   Develop: code_analysis → requirement → design → testing → implementation
 *   Review:  scope → analyze → report
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { getState } from "../../core/registry";
import { WorkflowEngine, generateTopicSlug } from "../../core/workflow-engine";
import type { WorkflowStage } from "../../core/workflow-engine";

// ─── Mode State ────────────────────────────────────────────────

let codingInputMode = false;
let pendingRequirement: string | null = null;
let agentsLoaded = false;

// ─── Stage Labels ──────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  code_analysis: "code analysis",
  requirement: "requirement clarification",
  design: "design",
  testing: "testing strategy",
  implementation: "implementation",
  scope: "review scope",
  analyze: "review analysis",
  report: "review report",
};

// ─── Helpers ───────────────────────────────────────────────────

/** Get current shared state. Returns null if core hasn't initialized. */
function state() {
  return getState();
}

function engineRef(): WorkflowEngine | null {
  return state().engine;
}

function setEngine(e: WorkflowEngine | null): void {
  state().engine = e;
}

/** Guard: bail if core hasn't initialized the shared state yet */
function guard() {
  const s = state();
  return s?.statusline ? s : null;
}

// ─── Extension Entry ───────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // ─── Helper: Load built-in agents (lazy, once) ────────
  function ensureAgentsLoaded(): void {
    if (agentsLoaded) return;
    const s = state();
    if (!s.subagentEnabled) return;
    const builtinAgentsDir = path.join(__dirname, "agents");
    if (fs.existsSync(builtinAgentsDir)) {
      s.subagent.loadBuiltinAgents(builtinAgentsDir);
    }
    agentsLoaded = true;
  }

  // ─── Helper: Register develop/review handlers ─────────
  async function registerScenarioHandlers(ctx: ExtensionContext): Promise<void> {
    const engine = engineRef();
    if (!engine || !engine.isActive() || engine.getType() !== "coding") return;

    const s = state();
    const dc = {
      pi, ctx, engine,
      subagent: s.subagent,
      tracker: s.tracker,
      statusline: s.statusline,
      parallelEnabled: s.parallelEnabled,
    };

    const stage = engine.getStage();

    if (["code_analysis", "requirement", "design", "testing", "implementation"].includes(stage)) {
      const { register: registerDevelop } = await import("./develop/index");
      registerDevelop(dc);
    }
    if (["scope", "analyze", "report"].includes(stage)) {
      const { register: registerReview } = await import("./review/index");
      registerReview(dc);
    }
  }

  // ─── Helper: Start workflow ───────────────────────────
  async function startWorkflow(ctx: ExtensionContext, requirement: string): Promise<void> {
    const engine = engineRef();
    if (!engine) return;

    const s = state();
    const dc = {
      pi, ctx, engine,
      subagent: s.subagent,
      tracker: s.tracker,
      statusline: s.statusline,
      parallelEnabled: s.parallelEnabled,
    };

    const stage = engine.getStage();

    if (["code_analysis", "requirement", "design", "testing", "implementation"].includes(stage)) {
      const { start: startDevelop } = await import("./develop/index");
      startDevelop(dc, requirement);
    }
    if (["scope", "analyze", "report"].includes(stage)) {
      const { start: startReview } = await import("./review/index");
      startReview(dc, requirement);
    }
  }

  // ─── Session Start — Restore workflow ─────────────────
  pi.on("session_start", async (_event, ctx) => {
    const s = guard();
    if (!s) return;
    s.statusline.bind(ctx);
    ensureAgentsLoaded();

    const engine = engineRef();
    if (engine && engine.isActive() && engine.getType() === "coding") {
      await registerScenarioHandlers(ctx);

      const stage = engine.getStage();
      const stageName = STAGE_LABELS[stage] ?? stage;
      s.statusline.updateWorkflow("coding", stage as WorkflowStage);

      setTimeout(() => {
        pi.sendUserMessage(
          `Session restored. You are in the **${stageName}** phase of the coding workflow. Continue from where you left off.`,
        );
      }, 50);
    }
  });

  // ─── Stage-Specific Tool Restrictions ─────────────────
  pi.on("tool_call", async (event, ctx) => {
    const engine = engineRef();
    if (!engine || !engine.isActive() || engine.getType() !== "coding") return;

    const stage = engine.getStage();
    const readOnlyStages: string[] = [
      "code_analysis", "requirement", "design", "testing",
      "scope", "analyze", "report",
    ];

    if (!readOnlyStages.includes(stage)) return;

    // write: only allow .pi/craft/plans/
    if (event.toolName === "write") {
      const filePath = (event.input.path as string) || "";
      if (!filePath.includes(".pi/craft/plans/")) {
        return {
          block: true,
          reason: `当前只读阶段 [${stage}] 不允许使用 write。仅允许写入 .pi/craft/plans/ 目录下的计划文档。`,
        };
      }
      return;
    }

    // edit: only allow .pi/craft/plans/
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

    // bash: block write ops unless targeting plans dir
    if (event.toolName === "bash") {
      const command = (event.input.command as string) || "";
      const writesToPlans = command.includes(".pi/craft/plans/");
      const writeOps = [">", " >>", "tee ", "dd ", "mkfifo"];
      const hasWriteOp = writeOps.some((op) => command.includes(op));

      if (hasWriteOp && !writesToPlans) {
        return {
          block: true,
          reason: `当前只读阶段不允许写入代码文件。仅允许写入 .pi/craft/plans/ 目录。\n命令: ${command.slice(0, 80)}`,
        };
      }
    }
  });

  // ─── /craft:coding Command ─────────────────────────────
  pi.registerCommand("craft:coding", {
    description: "Enter coding workflow mode - type your requirement and slug is auto-generated",
    handler: async (_args, ctx) => {
      const s = guard();
      if (!s) return;
      s.statusline.bind(ctx);
      ensureAgentsLoaded();
      codingInputMode = true;
      s.statusline.updateWorkflow("coding", "idle");
      ctx.ui.notify(
        "🔧 Coding workflow mode activated.\n\nPlease describe your requirement below. A topic-slug will be auto-generated.",
        "info",
      );
    },
  });

  // ─── Input Event — Capture requirement in coding mode ──
  pi.on("input", async (event, ctx) => {
    if (!codingInputMode) return { action: "continue" };
    const s = guard();
    if (!s) return { action: "continue" };
    s.statusline.bind(ctx);

    const text = event.text.trim();

    // Slash command exits coding mode
    if (text.startsWith("/")) {
      codingInputMode = false;
      pendingRequirement = null;
      s.statusline.updateWorkflow("", "idle");
      ctx.ui.notify("Exited coding workflow mode.", "info");
      return { action: "continue" };
    }

    // Empty input, stay in mode
    if (!text) {
      ctx.ui.notify("Please enter your requirement description.", "warning");
      return { action: "handled" };
    }

    // Capture requirement, exit input mode
    pendingRequirement = text;
    codingInputMode = false;

    ctx.ui.notify(
      `📝 Captured requirement, generating topic-slug via LLM...\n   "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
      "info",
    );

    const slugPrompt = `Generate a concise English topic-slug (2-3 words, lowercase, hyphenated) for this development requirement. Use common tech abbreviations (e.g., auth, impl, mw, db, ws, k8s, i18n). Reply with ONLY the slug on a single line, nothing else.\n\nRequirement: ${text}`;

    setTimeout(() => pi.sendUserMessage(slugPrompt), 0);
    return { action: "handled" };
  });

  // ─── Agent End — Capture slug from LLM response ───────
  pi.on("agent_end", async (event, ctx) => {
    if (!pendingRequirement) return;
    const s = guard();
    if (!s) return;
    s.statusline.bind(ctx);
    ensureAgentsLoaded();

    const requirement = pendingRequirement;
    pendingRequirement = null;

    // Extract slug from last assistant message
    let slugText = "";
    for (const msg of [...event.messages].reverse()) {
      if (msg.role === "assistant") {
        for (const part of msg.content) {
          if (part.type === "text") slugText += part.text;
        }
        break;
      }
    }

    const firstLine = slugText.split("\n")[0].trim();
    const topicSlug = firstLine
      .replace(/^[`'"]+|[`'"]+$/g, "")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)
      || generateTopicSlug(requirement);

    ctx.ui.notify(
      `✅ Slug generated: ${topicSlug}\n📝 Starting coding workflow...`,
      "info",
    );

    // Create and persist workflow
    const engine = WorkflowEngine.create("coding", requirement, topicSlug, ctx.cwd);
    engine.transition("code_analysis");
    setEngine(engine);
    s.statusline.updateWorkflow("coding", "code_analysis");
    pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

    await registerScenarioHandlers(ctx);
    await startWorkflow(ctx, requirement);
  });

  // ─── /craft Command ────────────────────────────────────
  pi.registerCommand("craft", {
    description: "Craft workflows: coding, review, status, resume, rollback, abort",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["coding", "review", "resume", "status", "rollback", "abort"];
      const filtered = subcommands.filter((s) => s.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((v) => ({ value: v, label: v }))
        : null;
    },
    handler: async (args, ctx) => {
      const s = guard();
      if (!s) return;
      s.statusline.bind(ctx);
      ensureAgentsLoaded();

      if (!args || args.trim() === "") {
        ctx.ui.notify(
          "Usage:\n  /craft coding <requirement> [topic-slug]\n  /craft review [target]\n  /craft status | resume | rollback | abort",
          "info",
        );
        return;
      }

      const parts = args.split(/\s+/);
      const subcommand = parts[0].toLowerCase();
      const rest = parts.slice(1).join(" ");

      switch (subcommand) {
        case "status": {
          const engine = engineRef();
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
          const engine = WorkflowEngine.restore(ctx);
          if (!engine || !engine.isActive()) {
            ctx.ui.notify("No active workflow to resume.", "info");
            return;
          }
          setEngine(engine);
          s.statusline.updateWorkflow(engine.getType(), engine.getStage() as WorkflowStage);

          if (engine.getType() !== "coding") {
            ctx.ui.notify("Resume not supported for this workflow type.", "warning");
            return;
          }

          await registerScenarioHandlers(ctx);

          const stage = engine.getStage();
          const stageName = STAGE_LABELS[stage] ?? stage;
          ctx.ui.notify(`Resumed: coding/${stageName}`, "info");

          setTimeout(() => pi.sendUserMessage(
            `Workflow resumed. You are in the **${stageName}** phase. Continue from where you left off.`,
          ), 0);
          return;
        }

        case "rollback": {
          const engine = engineRef();
          if (!engine || !engine.isActive()) {
            ctx.ui.notify("No active workflow to rollback.", "info");
            return;
          }
          const prev = engine.rollback();
          if (prev) {
            ctx.ui.notify(`Rolled back to: ${prev}`, "info");
            s.statusline.updateWorkflow(engine.getType(), prev as WorkflowStage);
            pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
          } else {
            ctx.ui.notify("Cannot rollback from current stage.", "warning");
          }
          return;
        }

        case "abort": {
          const engine = engineRef();
          if (!engine) {
            ctx.ui.notify("No active workflow to abort.", "info");
            return;
          }
          const ok = await ctx.ui.confirm("Abort workflow?", "All generated documents will be preserved.");
          if (ok) {
            engine.abort();
            pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
            setEngine(null);
            s.statusline.updateWorkflow("", "idle");
            ctx.ui.notify("Workflow aborted. Documents preserved in .pi/craft/plans/", "info");
          }
          return;
        }

        case "coding": {
          if (!rest.trim()) {
            ctx.ui.notify("Usage: /craft coding <requirement description> [topic-slug]", "warning");
            return;
          }

          const argParts = rest.split(/\s+/);
          const lastPart = argParts[argParts.length - 1];
          const isSlug = /^[a-z0-9][a-z0-9-]{0,30}$/.test(lastPart) && argParts.length > 1;
          const topicSlug = isSlug ? argParts.pop()! : undefined;
          const requirement = argParts.join(" ");

          const engine = WorkflowEngine.create("coding", requirement, topicSlug, ctx.cwd);
          engine.transition("code_analysis");
          setEngine(engine);
          s.statusline.updateWorkflow("coding", "code_analysis");

          pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

          await registerScenarioHandlers(ctx);
          await startWorkflow(ctx, requirement);
          return;
        }

        case "review": {
          const engine = WorkflowEngine.create("coding", `review: ${rest || "current changes"}`, undefined, ctx.cwd);
          engine.transition("scope");
          setEngine(engine);
          s.statusline.updateWorkflow("coding", "scope");

          pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

          await registerScenarioHandlers(ctx);
          await startWorkflow(ctx, rest || "");
          return;
        }

        default: {
          ctx.ui.notify(
            `Unknown subcommand: ${subcommand}\nTry: coding, review, status, resume, rollback, abort`,
            "warning",
          );
        }
      }
    },
  });
}

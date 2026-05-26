/**
 * Pi Craft — Coding Scenario Extension
 *
 * Self-contained extension for the coding workflow scenario.
 * Must be loaded alongside the Core extension (which provides
 * TokenTracker, SubagentManager, StatuslineManager via registry).
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { getState, type CraftState } from "../../core/registry";
import { WorkflowEngine, generateTopicSlug } from "../../core/workflow-engine";
import type { WorkflowStage } from "../../core/workflow-engine";
import { Type } from "typebox";

// ─── Mode State ────────────────────────────────────────────────

let codingInputMode = false;
let pendingRequirement: string | null = null;
let pendingStage: WorkflowStage | null = null;
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

// ─── State Access ──────────────────────────────────────────────

/**
 * Get shared state from Core extension.
 * Returns null if Core hasn't initialized yet (parallel loading edge case).
 */
function shared(): CraftState | null {
  const s = getState();
  return s?.statusline ? s : null;
}

/** Engine ref from shared state */
function engineRef(): WorkflowEngine | null {
  return shared()?.engine ?? null;
}

function setEngine(e: WorkflowEngine | null): void {
  const s = shared();
  if (s) s.engine = e;
}

// ─── Extension Entry ───────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // ─── Helper: Load built-in agents (lazy, once) ────────
  function ensureAgentsLoaded(): void {
    if (agentsLoaded) return;
    const s = shared();
    if (!s?.subagentEnabled) return;
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

    const s = shared()!;
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

    const s = shared()!;
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
    const s = shared();
    if (!s) return;

    s.statusline.bind(ctx);
    s.statusline.updateScenario("coding");
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
    const s = shared();
    if (!s) return;
    const engine = s.engine;
    if (!engine || !engine.isActive() || engine.getType() !== "coding") return;

    const stage = engine.getStage();
    const readOnlyStages: string[] = [
      "code_analysis", "requirement", "design", "testing",
      "scope", "analyze", "report",
    ];
    if (!readOnlyStages.includes(stage)) return;

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

  // ─── /coding:develop Command ─────────────────────────
  const VALID_STAGES = ["code_analysis", "requirement", "design", "testing", "implementation"];

  pi.registerCommand("coding:develop", {
    description: "Enter coding workflow mode. Optionally start from a specific stage: design, testing, implementation",
    handler: async (args, ctx) => {
      const s = shared();
      if (!s) {
        ctx.ui.notify("⚠️ Core extension not yet initialized. Try /reload or restart.", "error");
        return;
      }
      s.statusline.bind(ctx);
      ensureAgentsLoaded();

      const stageArg = args?.trim().toLowerCase();
      if (stageArg && !VALID_STAGES.includes(stageArg)) {
        ctx.ui.notify(`Invalid stage: ${stageArg}. Valid: ${VALID_STAGES.join(", ")}`, "warning");
        return;
      }

      pendingStage = (stageArg as WorkflowStage) || null;
      codingInputMode = true;
      s.statusline.updateWorkflow("coding", "idle");

      const hint = pendingStage
        ? `\n\n⚡ Will jump directly to **${pendingStage}** after slug generation.`
        : "";
      ctx.ui.notify(
        `🔧 Coding workflow mode activated.${hint}\n\nPlease describe your requirement below. A topic-slug will be auto-generated.\n\nType any /command to exit, or /coding:abort to stop a running workflow.`,
        "info",
      );
    },
  });

  // ─── Input Event — Capture requirement in coding mode ──
  pi.on("input", async (event, ctx) => {
    if (!codingInputMode) return { action: "continue" };

    const s = shared();
    if (!s) return { action: "continue" };
    s.statusline.bind(ctx);

    const text = event.text.trim();
    if (text.startsWith("/")) {
      codingInputMode = false;
      pendingRequirement = null;
      pendingStage = null;
      s.statusline.updateWorkflow("", "idle");
      ctx.ui.notify("Exited coding workflow mode.", "info");
      return { action: "continue" };
    }
    if (!text) {
      ctx.ui.notify("Please enter your requirement description.", "warning");
      return { action: "handled" };
    }

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

    const s = shared();
    if (!s) return;
    s.statusline.bind(ctx);
    ensureAgentsLoaded();

    const requirement = pendingRequirement;
    const targetStage = pendingStage ?? "code_analysis";
    pendingRequirement = null;
    pendingStage = null;

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
      `✅ Slug generated: ${topicSlug}\n📝 Starting coding workflow at **${targetStage}**...`,
      "info",
    );

    const engine = WorkflowEngine.create("coding", requirement, topicSlug, ctx.cwd);
    engine.transition(targetStage as WorkflowStage);
    setEngine(engine);
    s.statusline.updateWorkflow("coding", "code_analysis");
    pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

    await registerScenarioHandlers(ctx);
    await startWorkflow(ctx, requirement);
  });

  // ─── /coding:review Command ───────────────────────────
  const REVIEW_STAGES = ["scope", "analyze", "report"];

  pi.registerCommand("coding:review", {
    description: "Start code review workflow. Optionally jump to analyze or report stage.",
    handler: async (args, ctx) => {
      const s = shared();
      if (!s) {
        ctx.ui.notify("⚠️ Core extension not yet initialized. Try /reload or restart.", "error");
        return;
      }
      s.statusline.bind(ctx);
      ensureAgentsLoaded();

      const parts = (args || "").trim().split(/\s+/);
      let target = "";
      let stageArg = "scope";

      // Last word might be a stage name
      if (parts.length > 0 && REVIEW_STAGES.includes(parts[parts.length - 1])) {
        stageArg = parts.pop()!;
        target = parts.join(" ");
      } else {
        target = parts.join(" ");
      }

      const scopeTarget = target || "current git diff (uncommitted changes)";
      const engine = WorkflowEngine.create("coding", `review: ${scopeTarget}`, undefined, ctx.cwd);
      engine.transition(stageArg as WorkflowStage);
      setEngine(engine);
      s.statusline.updateWorkflow("coding", stageArg as WorkflowStage);
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

      await registerScenarioHandlers(ctx);
      await startWorkflow(ctx, scopeTarget);
    },
  });

  // ─── start_coding_workflow Tool ──────────────────────
  // LLM can call this to auto-start the coding workflow
  pi.registerTool({
    name: "start_coding_workflow",
    label: "Start Coding Workflow",
    description: [
      "Start the multi-stage coding workflow. Use when you need structured development for a complex feature.",
      "Stages: code_analysis → requirement → design → testing → implementation",
      "Optionally skip to a specific stage if analysis/design already done.",
      "Available stages: code_analysis, requirement, design, testing, implementation",
    ].join(" "),
    parameters: Type.Object({
      requirement: Type.String({ description: "What to build — a clear one-line description" }),
      stage: Type.Optional(Type.String({ description: "Skip to this stage. Default: code_analysis" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const s = shared();
      if (!s) {
        return { content: [{ type: "text", text: "Core extension not initialized. Try /reload." }], details: {} };
      }
      s.statusline.bind(ctx);
      ensureAgentsLoaded();

      const req = (params as any).requirement as string;
      const stageArg = ((params as any).stage as string)?.toLowerCase();
      const targetStage = (VALID_STAGES.includes(stageArg) ? stageArg : "code_analysis") as WorkflowStage;
      const topicSlug = generateTopicSlug(req);

      const engine = WorkflowEngine.create("coding", req, topicSlug, ctx.cwd);
      engine.transition(targetStage);
      setEngine(engine);
      s.statusline.updateWorkflow("coding", targetStage);
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

      await registerScenarioHandlers(ctx);
      await startWorkflow(ctx, req);

      return {
        content: [{
          type: "text",
          text: `✅ Coding workflow started at **${targetStage}** (slug: ${topicSlug}).\n\nRequirement: ${req}`,
        }],
        details: {},
      };
    },
  });

  // ─── /coding:status ──────────────────────────────────
  pi.registerCommand("coding:status", {
    description: "Show current coding workflow status",
    handler: async (_args, ctx) => {
      const s = shared();
      if (!s) return;
      s.statusline.bind(ctx);

      const engine = engineRef();
      if (!engine || !engine.isActive()) {
        ctx.ui.notify("No active workflow. Use /coding:develop to start.", "info");
      } else {
        const ctx2 = engine.getContext();
        const docs = engine.getDocumentPathForStage(engine.getStage());
        ctx.ui.notify(
          `Workflow: ${engine.getType()}/${engine.getStage()}\nTopic: ${ctx2.topicSlug}\nDocs: ${ctx2.plansDir}\nCurrent: ${docs ?? "N/A"}`,
          "info",
        );
      }
    },
  });

  // ─── /coding:resume ──────────────────────────────────
  pi.registerCommand("coding:resume", {
    description: "Resume an existing coding workflow",
    handler: async (_args, ctx) => {
      const s = shared();
      if (!s) return;
      s.statusline.bind(ctx);
      ensureAgentsLoaded();

      const engine = WorkflowEngine.restore(ctx);
      if (!engine || !engine.isActive()) {
        ctx.ui.notify("No active workflow to resume.", "info");
        return;
      }
      if (engine.getType() !== "coding") {
        ctx.ui.notify("Resume only supports coding workflows.", "warning");
        return;
      }

      setEngine(engine);
      s.statusline.updateWorkflow(engine.getType(), engine.getStage() as WorkflowStage);
      await registerScenarioHandlers(ctx);

      const stageName = STAGE_LABELS[engine.getStage()] ?? engine.getStage();
      ctx.ui.notify(`Resumed: coding/${stageName}`, "info");
      setTimeout(() => pi.sendUserMessage(
        `Workflow resumed. You are in the **${stageName}** phase. Continue from where you left off.`,
      ), 0);
    },
  });

  // ─── /coding:rollback ────────────────────────────────
  pi.registerCommand("coding:rollback", {
    description: "Rollback to a previous workflow stage. Use '/coding:rollback design' to jump directly to design.",
    handler: async (args, ctx) => {
      const s = shared();
      if (!s) return;
      s.statusline.bind(ctx);

      const engine = engineRef();
      if (!engine || !engine.isActive()) {
        ctx.ui.notify("No active workflow to rollback.", "info");
        return;
      }

      const stageArg = (args || "").trim().toLowerCase();
      const validStages: WorkflowStage[] = ["code_analysis", "requirement", "design", "testing", "implementation"];
      const targetStage = validStages.includes(stageArg as WorkflowStage) ? (stageArg as WorkflowStage) : undefined;

      const prev = engine.rollback(targetStage);
      if (prev) {
        ctx.ui.notify(`Rolled back to: ${prev}`, "info");
        s.statusline.updateWorkflow(engine.getType(), prev as WorkflowStage);
        pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);
      } else {
        ctx.ui.notify("Cannot rollback to that stage.", "warning");
      }
    },
  });

  // ─── /coding:abort ───────────────────────────────────
  pi.registerCommand("coding:abort", {
    description: "Abort the current coding workflow",
    handler: async (_args, ctx) => {
      const s = shared();
      if (!s) return;
      s.statusline.bind(ctx);

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
    },
  });
}

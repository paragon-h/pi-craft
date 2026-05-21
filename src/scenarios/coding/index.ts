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
  pi.registerCommand("coding:develop", {
    description: "Enter coding workflow mode - type your requirement and slug is auto-generated",
    handler: async (_args, ctx) => {
      const s = shared();
      if (!s) {
        ctx.ui.notify("⚠️ Core extension not yet initialized. Try /reload or restart.", "error");
        return;
      }
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

    const s = shared();
    if (!s) return { action: "continue" };
    s.statusline.bind(ctx);

    const text = event.text.trim();
    if (text.startsWith("/")) {
      codingInputMode = false;
      pendingRequirement = null;
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
    pendingRequirement = null;

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

    const engine = WorkflowEngine.create("coding", requirement, topicSlug, ctx.cwd);
    engine.transition("code_analysis");
    setEngine(engine);
    s.statusline.updateWorkflow("coding", "code_analysis");
    pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

    await registerScenarioHandlers(ctx);
    await startWorkflow(ctx, requirement);
  });

  // ─── /coding:review Command ───────────────────────────
  pi.registerCommand("coding:review", {
    description: "Start code review workflow",
    handler: async (args, ctx) => {
      const s = shared();
      if (!s) {
        ctx.ui.notify("⚠️ Core extension not yet initialized. Try /reload or restart.", "error");
        return;
      }
      s.statusline.bind(ctx);
      ensureAgentsLoaded();

      const target = args?.trim() || "current git diff (uncommitted changes)";
      const engine = WorkflowEngine.create("coding", `review: ${target}`, undefined, ctx.cwd);
      engine.transition("scope");
      setEngine(engine);
      s.statusline.updateWorkflow("coding", "scope");
      pi.appendEntry("craft-workflow-state", engine.toPersistenceEntry().data);

      await registerScenarioHandlers(ctx);
      await startWorkflow(ctx, target);
    },
  });
}

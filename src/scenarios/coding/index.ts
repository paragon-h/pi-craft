/**
 * Pi Craft — Coding Workflow Scenario (Pi-Native)
 *
 * Provides 2 tools: init_workflow + complete_stage.
 * Stage instructions are skills (.md files), loaded by the LLM on demand.
 * Flow control: LLM decides when to advance, extension gates + labels + persists.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { getState } from "../../core/registry";
import { getCraftConfig, isOn } from "../../core/config";
import { CRAFT_WORKFLOW_TYPE } from "../../core/workflow-types";
import { formatDate, gateFile } from "./utils.js";

const CUSTOM_TYPE = CRAFT_WORKFLOW_TYPE;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, "skills");
let agentsLoaded = false;

// ─── Types ────────────────────────────────────────────────

interface StageRecord {
  stage: string;
  completedAt: number;
  outputFile: string;
}

interface WorkflowMeta {
  type: "coding";
  topic: string;
  requirement: string;
  plansDir: string;
  stage: string;
  startedAt: number;
  stages: StageRecord[];
}

// ─── Helpers ──────────────────────────────────────────────

function getMeta(ctx: ExtensionContext): WorkflowMeta | null {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const e = branch[i];
    if (e.type === "custom" && e.customType === CUSTOM_TYPE) return e.data as WorkflowMeta;
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // ── Load built-in agents (lazy, once) ─────────────────
  function ensureAgents(): void {
    if (agentsLoaded) return;
    const state = getState();
    const agentsDir = path.join(__dirname, "agents");
    if (state?.subagentEnabled && fs.existsSync(agentsDir)) {
      state.subagent.loadBuiltinAgents(agentsDir);
    }
    agentsLoaded = true;
  }

  // ═══════════════════════════════════════════════════════════
  // Tool: init_workflow
  // ═══════════════════════════════════════════════════════════
  pi.registerTool({
    name: "init_workflow",
    label: "Init Workflow",
    description: "Create plans directory, set session name, record requirement. Call before loading stage skills.",
    parameters: Type.Object({
      topic: Type.String({ description: "Short kebab-case topic slug, e.g. 'user-auth'" }),
      requirement: Type.String({ description: "One-line description of what to build" }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      ensureAgents();
      const { topic, requirement } = params as { topic: string; requirement: string };
      const date = formatDate();
      const plansDir = path.join(ctx.cwd, ".pi", "craft", "plans", `${date}-${topic}`);
      fs.mkdirSync(plansDir, { recursive: true });

      const meta: WorkflowMeta = {
        type: "coding",
        topic,
        requirement,
        plansDir,
        stage: "code-analysis",
        startedAt: Date.now(),
        stages: [],
      };

      pi.setSessionName(`craft: ${topic}`);
      pi.appendEntry(CUSTOM_TYPE, meta);
      ctx.ui.notify(`📁 ${plansDir}`, "info");

      // Auto-load first stage
      setTimeout(() => {
        pi.sendUserMessage(
          `Load \`/skill:stage-code-analysis\` and begin.\n\n**Plans:** ${plansDir}\n**Requirement:** ${requirement}`,
          { deliverAs: "steer" },
        );
      }, 0);

      return {
        content: [{
          type: "text",
          text: `✅ Workflow initialized.\n**Topic:** ${topic}\n**Plans:** ${plansDir}/`,
        }],
        details: { plansDir, topic },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════
  // Tool: complete_stage
  // ═══════════════════════════════════════════════════════════
  pi.registerTool({
    name: "complete_stage",
    label: "Complete Stage",
    description: "Verify output file, label session tree, persist metadata, auto-load next stage skill.",
    parameters: Type.Object({
      next_stage: Type.String({ description: "Next stage: requirement, design, testing, implementation, review, done" }),
      output_file: Type.String({ description: "Relative path to the document produced" }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const { next_stage, output_file } = params as { next_stage: string; output_file: string };

      // Gate
      const gateErr = gateFile(path.resolve(ctx.cwd, output_file));
      if (gateErr) {
        return {
          content: [{ type: "text", text: `⚠️ Gate failed — ${output_file}: ${gateErr}` }],
          details: { blocked: true, reason: gateErr },
        };
      }

      // Metadata
      const currentMeta = getMeta(ctx);
      const currentStage = currentMeta?.stage ?? "code-analysis";
      const updatedMeta: WorkflowMeta = currentMeta
        ? {
            ...currentMeta,
            stage: next_stage,
            stages: [...currentMeta.stages, { stage: currentStage, completedAt: Date.now(), outputFile: output_file }],
          }
        : {
            type: "coding", topic: "unknown", requirement: "", plansDir: path.dirname(path.resolve(ctx.cwd, output_file)),
            stage: next_stage, startedAt: Date.now(), stages: [{ stage: "code-analysis", completedAt: Date.now(), outputFile: output_file }],
          };
      pi.appendEntry(CUSTOM_TYPE, updatedMeta);

      // Session tree label
      try {
        const leafId = ctx.sessionManager.getLeafId();
        if (leafId) pi.setLabel(leafId, next_stage === "done" ? "✅ workflow:done" : `📌 stage:${next_stage}`);
      } catch { /* ignore */ }

      // Notify
      const notifyMsg = next_stage === "done"
        ? "🎉 Workflow complete!"
        : next_stage === "implementation"
          ? "⚠️ Entering implementation — full write access"
          : `✅ Stage complete → ${next_stage}`;
      ctx.ui.notify(notifyMsg, next_stage === "done" ? "success" : "info");

      // Done
      if (next_stage === "done") {
        // Clear all todo tasks
        getState()?.resetTodo?.();
        return {
          content: [{
            type: "text",
            text: `🎉 Workflow complete!\n\nProduced:\n${updatedMeta.stages.map(s => `- ${s.outputFile}`).join("\n")}`,
          }],
          details: { next_stage: "done", stages: updatedMeta.stages },
        };
      }

      // Auto-load next skill
      setTimeout(() => {
        pi.sendUserMessage(
          `Load \`/skill:stage-${next_stage}\` and continue.\n\nPlans: ${updatedMeta.plansDir}\nRequirement: ${updatedMeta.requirement}`,
          { deliverAs: "steer" },
        );
      }, 0);

      return {
        content: [{ type: "text", text: `✅ Stage complete. Loading **${next_stage}**...` }],
        details: { next_stage, output_file },
      };
    },
  });

  // ═══════════════════════════════════════════════════════════
  // Compaction hook — preserve workflow context
  // ═══════════════════════════════════════════════════════════
  pi.on("session_before_compact", async (event, ctx) => {
    const meta = getMeta(ctx);
    if (!meta) return;
    const stageSummary = meta.stages.length > 0
      ? `Completed: ${meta.stages.map(s => s.stage).join(" → ")}`
      : "No stages completed yet";

    // Preserve stage-specific gates across compaction
    const gateMap: Record<string, string> = {
      "code-analysis": "",
      "brainstorming": "⚠️ HARD-GATE ACTIVE: 设计未批准，禁止写代码",
      "requirement": "",
      "design": "",
      "testing": "",
      "implementation": "⚠️ Full write access — follow TDD",
      "plans": "",
    };
    const gateHint = gateMap[meta.stage] || "";

    return {
      compaction: {
        summary: [
          `[Coding Workflow — ${meta.topic}]`,
          `Requirement: ${meta.requirement}`,
          `Current stage: ${meta.stage}`,
          `Plans: ${meta.plansDir}`,
          stageSummary,
          gateHint,
          `To continue: /skill:stage-${meta.stage}`,
        ].filter(Boolean).join("\n"),
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });

  // ═══════════════════════════════════════════════════════════
  // Session start — inject bootstrap + restore workflow
  // ═══════════════════════════════════════════════════════════
  pi.on("session_start", async (_event, ctx) => {
    // 1. Inject craft-bootstrap meta-rule (if enabled)
    const config = getCraftConfig(pi);
    if (isOn(config, "enableBootstrap")) {
      const bootstrapPath = path.join(SKILLS_DIR, "craft-bootstrap", "SKILL.md");
      try {
        if (fs.existsSync(bootstrapPath)) {
          let bootstrapContent = fs.readFileSync(bootstrapPath, "utf-8");
          // Strip YAML frontmatter (between --- markers) for clean injection
          bootstrapContent = bootstrapContent.replace(/^---\n[\s\S]*?\n---\n/, "");
          setTimeout(() => {
            pi.sendUserMessage(bootstrapContent, {
              deliverAs: "steer",
              label: "craft-bootstrap",
            });
          }, 0);
        }
      } catch { /* bootstrap injection is best-effort */ }
    }

    // 2. Restore interrupted workflow
    const meta = getMeta(ctx);
    if (!meta?.stage || meta.stage === "done") return;
    const completed = meta.stages.length > 0
      ? `\n**Completed:** ${meta.stages.map(s => s.stage).join(" → ")}`
      : "";
    setTimeout(() => {
      pi.sendUserMessage(
        `🔄 Workflow restored | Topic: ${meta.topic} | Stage: ${meta.stage}\nPlans: ${meta.plansDir}${completed}\n\nLoad \`/skill:stage-${meta.stage}\` to continue.`,
        { deliverAs: "steer" },
      );
    }, 50);
  });
}

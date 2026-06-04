/**
 * Pi Craft — Workflow Progress Widget
 *
 * 显示工作流阶段的进度条，如：
 * 🔍 Analyzing → 📋 Requirement → 🎨 Design → 🧪 Testing → ⚡ Implement → ✅ Done
 */

import type { WorkflowStage } from "./workflow-types";

interface StageDef {
  stage: WorkflowStage;
  icon: string;
  label: string;
}

const DEVELOP_STAGES: StageDef[] = [
  { stage: "code_analysis", icon: "🔍", label: "Analyze" },
  { stage: "requirement", icon: "📋", label: "Req" },
  { stage: "design", icon: "🎨", label: "Design" },
  { stage: "testing", icon: "🧪", label: "Test" },
  { stage: "implementation", icon: "⚡", label: "Code" },
  { stage: "completed", icon: "✅", label: "Done" },
];

const REVIEW_STAGES: StageDef[] = [
  { stage: "scope", icon: "🔬", label: "Scope" },
  { stage: "analyze", icon: "🔎", label: "Review" },
  { stage: "report", icon: "📊", label: "Report" },
  { stage: "completed", icon: "✅", label: "Done" },
];

function getStagesForType(type: string): StageDef[] {
  // For the review flow within coding
  if (type === "review") return REVIEW_STAGES;
  return DEVELOP_STAGES;
}

export function renderProgressBar(
  type: string,
  currentStage: WorkflowStage,
  theme: { fg: (color: string, text: string) => string; bold: (text: string) => string },
  width: number,
): string[] {
  const stages = getStagesForType(type);
  const currentIndex = stages.findIndex((s) => s.stage === currentStage);

  if (currentIndex < 0) return [theme.fg("dim", "No active workflow")];

  const lines: string[] = [];
  const maxWidth = Math.min(width - 2, 80);

  // Build progress segments
  let progressLine = "";
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const isCurrent = i === currentIndex;
    const isDone = i < currentIndex;

    const segment = ` ${s.icon}${s.label} `;
    if (isDone) {
      progressLine += theme.fg("success", segment);
    } else if (isCurrent) {
      progressLine += theme.fg("accent", theme.bold(`[${segment.trim()}]`));
    } else {
      progressLine += theme.fg("dim", segment);
    }

    if (i < stages.length - 1) {
      progressLine += theme.fg("dim", isDone ? "──" : "──");
    }
  }

  lines.push(progressLine);

  return lines;
}

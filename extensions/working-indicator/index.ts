/**
 * Working Indicator Extension
 *
 * 实时显示 Agent 当前正在做什么：
 * - 💭 思考中...（流式响应时）
 * - 🔧 执行 bash/npm...（工具运行时）
 * - 📖 读取文件... / ✏️ 编辑文件... 等
 *
 * 自动安装到 .pi/extensions/ 目录后，pi 启动时自动加载。
 *
 * 颜色取自当前主题（thinkingText 用于思考、accent 用于工具运行），
 * 随主题切换自适应，不再使用写死的 ANSI 转义码。
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";

// 工具图标映射
const TOOL_ICONS: Record<string, string> = {
  bash: "🖥️",
  read: "📖",
  write: "✏️",
  edit: "✂️",
  grep: "🔍",
  find: "🔍",
  ls: "📁",
  todo: "✅",
};

// 工具显示名映射
const TOOL_LABELS: Record<string, string> = {
  bash: "执行命令",
  read: "读取文件",
  write: "写入文件",
  edit: "编辑文件",
  grep: "搜索内容",
  find: "查找文件",
  ls: "列出目录",
  todo: "管理任务",
};

// 思考动画帧
const THINK_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// 工具运行动画帧（更快的闪烁点）
const WORK_FRAMES = ["◌", "○", "◌"];

function getThinkingIndicator(theme: Theme) {
  return {
    frames: THINK_FRAMES.map((frame) => theme.fg("thinkingText", frame)),
    intervalMs: 80,
  };
}

function getWorkingIndicator(theme: Theme) {
  return {
    frames: WORK_FRAMES.map((frame) => theme.fg("accent", frame)),
    intervalMs: 120,
  };
}

export default function (pi: ExtensionAPI) {
  let activeToolCount = 0;
  let agentActive = false;

  // 更新状态栏
  // (updateStatus removed — was dead code; status set inline in event handlers)

  pi.on("agent_start", async (_event, ctx) => {
    agentActive = true;
    activeToolCount = 0;
    ctx.ui.setWorkingIndicator(getThinkingIndicator(ctx.ui.theme));
    ctx.ui.setStatus("working-indicator", "  💭 思考中...");
  });

  pi.on("agent_end", async (_event, ctx) => {
    agentActive = false;
    activeToolCount = 0;
    ctx.ui.setWorkingIndicator(undefined); // 恢复默认
    ctx.ui.setStatus("working-indicator", "");
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    activeToolCount++;
    const icon = TOOL_ICONS[event.toolName] ?? "🔧";
    const label = TOOL_LABELS[event.toolName] ?? event.toolName;

    ctx.ui.setWorkingIndicator(getWorkingIndicator(ctx.ui.theme));
    ctx.ui.setStatus("working-indicator", `  ${icon} ${label}...`);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    activeToolCount = Math.max(0, activeToolCount - 1);
    if (activeToolCount === 0 && agentActive) {
      ctx.ui.setWorkingIndicator(getThinkingIndicator(ctx.ui.theme));
      ctx.ui.setStatus("working-indicator", "  💭 思考中...");
    }
  });

  // 启动时初始化
  pi.on("session_start", async (_event, ctx) => {
    agentActive = false;
    activeToolCount = 0;
    ctx.ui.setStatus("working-indicator", "");
  });
}

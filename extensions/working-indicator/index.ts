/**
 * Working Indicator Extension
 *
 * 实时显示 Agent 当前正在做什么：
 * - 💭 思考中...（流式响应时）
 * - 🔧 执行 bash/npm...（工具运行时）
 * - 📖 读取文件... / ✏️ 编辑文件... 等
 *
 * 自动安装到 .pi/extensions/ 目录后，pi 启动时自动加载。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// 柔和的彩虹色
const COLORS = {
  pink: "\x1b[38;2;255;179;186m",
  peach: "\x1b[38;2;255;223;186m",
  yellow: "\x1b[38;2;255;255;186m",
  mint: "\x1b[38;2;186;255;201m",
  sky: "\x1b[38;2;186;225;255m",
  lavender: "\x1b[38;2;218;186;255m",
} as const;
const RESET = "\x1b[39m";

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
const THINK_COLORS = [COLORS.pink, COLORS.peach, COLORS.yellow, COLORS.mint, COLORS.sky, COLORS.lavender];

// 工具运行动画帧（更快的闪烁点）
const WORK_FRAMES = ["◌", "○", "◌"];
const WORK_COLORS = [COLORS.peach, COLORS.yellow, COLORS.mint];

function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

function getThinkingIndicator() {
  return {
    frames: THINK_FRAMES.map((frame, i) =>
      colorize(frame, THINK_COLORS[i % THINK_COLORS.length]!),
    ),
    intervalMs: 80,
  };
}

function getWorkingIndicator() {
  return {
    frames: WORK_FRAMES.map((frame, i) =>
      colorize(frame, WORK_COLORS[i % WORK_COLORS.length]!),
    ),
    intervalMs: 120,
  };
}

export default function (pi: ExtensionAPI) {
  let activeToolCount = 0;
  let agentActive = false;

  // 更新状态栏
  function updateStatus(ctx: { ui: { setStatus: (key: string, text: string) => void } }) {
    if (!agentActive) {
      ctx.ui.setStatus("working-indicator", "");
      return;
    }
    if (activeToolCount > 0) {
      // 工具执行中的状态由 tool_execution_start 单独设置
      return;
    }
    // 思考中
    ctx.ui.setStatus("working-indicator", "  💭 思考中...");
  }

  pi.on("agent_start", async (_event, ctx) => {
    agentActive = true;
    activeToolCount = 0;
    ctx.ui.setWorkingIndicator(getThinkingIndicator());
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

    ctx.ui.setWorkingIndicator(getWorkingIndicator());
    ctx.ui.setStatus("working-indicator", `  ${icon} ${label}...`);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    activeToolCount = Math.max(0, activeToolCount - 1);
    if (activeToolCount === 0 && agentActive) {
      ctx.ui.setWorkingIndicator(getThinkingIndicator());
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

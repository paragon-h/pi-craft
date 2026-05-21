/**
 * Pi Craft — Core Workflow Engine
 *
 * 状态机驱动的多阶段工作流引擎，支持：
 * - 创建/恢复/持久化工作流
 * - 阶段转换（前进、回退）
 * - 文档产物路径管理（.pi/craft/plans/）
 * - 阶段工具管控（只读/可写）
 *
 * 每个工作流对应一组 {date}-{topic}-*.md 文档
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── 类型定义 ────────────────────────────────────────────────

/** Open-ended — scenarios define their own types */
export type WorkflowType = string;

export type WorkflowStage =
  | "idle"
  | "code_analysis"
  | "requirement"
  | "design"
  | "testing"
  | "implementation"
  | "completed";

export interface QAPair {
  question: string;
  options?: string[];
  answer: string;
  timestamp: number;
}

export interface Task {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "done";
  description: string;
  filesInvolved: string[];
  dependsOn: number[];
}

export interface TodoItem {
  text: string;
  completed: boolean;
  taskId?: number; // 关联的 Task
}

export interface ApprovalRecord {
  taskId: number;
  taskTitle: string;
  approved: boolean;
  feedback?: string;
  timestamp: number;
}

export interface WorkflowContext {
  plansDir: string;
  topicSlug: string;
  startDate: string; // YYYY-MM-DD

  codeAnalysis?: {
    completed: boolean;
    documentPath: string;
  };
  requirement?: {
    raw: string;
    clarified: string;
    qaHistory: QAPair[];
    documentPath: string;
  };
  design?: {
    document: string;
    documentPath: string;
    approved: boolean;
    feedback: string[];
  };
  testing?: {
    strategy: "unit" | "e2e" | "both" | "skip";
    testPlan: string;
    documentPath: string;
    approved: boolean;
  };
  implementation?: {
    tasks: Task[];
    todos: TodoItem[];
    tasksPath: string;
    todosPath: string;
    currentTask: number;
    approvalHistory: ApprovalRecord[];
  };
}

export interface StageRecord {
  stage: WorkflowStage;
  enteredAt: number;
  exitedAt?: number;
}

export interface WorkflowState {
  id: string;
  type: WorkflowType;
  stage: WorkflowStage;
  stageHistory: StageRecord[];
  context: WorkflowContext;
  createdAt: number;
  updatedAt: number;
}

export interface StageHandler {
  stage: WorkflowStage;
  label: string;
  tools: string[];
  readOnly: boolean;
  documentSuffix: string; // 如 "code-analysis", "requirement"
  systemPromptSnippet: string;
  subagentNames?: string[];
}

// ─── 工具集定义 ────────────────────────────────────────────────

export const READONLY_TOOLS = ["read", "grep", "find", "ls"];
export const FULL_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
// 只读阶段的 bash 只允许安全命令（ls/cat/git log 等），
// 实际通过 tool_call 事件拦截实现

// ─── 工具函数 ──────────────────────────────────────────────────

export function formatDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 从需求文本生成 topic-slug（LLM 降级 fallback）
 * 提取英文单词并拼接，用于 LLM slug 生成失败时的兜底
 */
export function generateTopicSlug(rawRequirement: string): string {
  // 提取英文单词和常见缩写
  const words = rawRequirement
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1);

  // 过滤常见无意义词
  const skip = new Set(["a", "an", "the", "to", "for", "of", "in", "on", "at",
    "with", "by", "is", "are", "be", "it", "as", "or", "and", "not", "but",
    "this", "that", "will", "can", "need", "should", "must", "make", "want"]);
  const meaningful = words.filter((w) => !skip.has(w));

  // 去重，取前 3 个
  const unique = [...new Set(meaningful)];
  return unique.slice(0, 3).join("-") || Date.now().toString(36);
}

export function ensurePlansDir(cwd: string, date: string, topicSlug: string): string {
  const dir = path.join(cwd, ".pi", "craft", "plans", `${date}-${topicSlug}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 生成文档路径（目录结构）
 */
export function getDocumentPath(plansDir: string, suffix: string): string {
  return path.join(plansDir, `${suffix}.md`);
}

// ─── Workflow Engine ──────────────────────────────────────────

export class WorkflowEngine {
  private state: WorkflowState;
  private stageChangeHandlers: Array<(from: WorkflowStage, to: WorkflowStage) => void> = [];

  private static CUSTOM_TYPE = "craft-workflow-state";

  constructor(state: WorkflowState) {
    this.state = state;
  }

  // ─── 工厂方法 ──────────────────────────────────────────

  static create(
    type: WorkflowType,
    rawRequirement: string,
    topicSlugInput: string | undefined,
    cwd: string,
  ): WorkflowEngine {
    const startDate = formatDate();
    const topicSlug = topicSlugInput || generateTopicSlug(rawRequirement);
    const plansDir = ensurePlansDir(cwd, startDate, topicSlug);

    const state: WorkflowState = {
      id: `craft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      stage: "idle",
      stageHistory: [],
      context: {
        plansDir,
        topicSlug,
        startDate,
        requirement: {
          raw: rawRequirement,
          clarified: "",
          qaHistory: [],
          documentPath: getDocumentPath(plansDir, "requirement"),
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new WorkflowEngine(state);
  }

  static restore(ctx: ExtensionContext): WorkflowEngine | null {
    const branchEntries = ctx.sessionManager.getBranch();
    let lastState: WorkflowState | null = null;

    for (const entry of branchEntries) {
      if (entry.type === "custom" && entry.customType === WorkflowEngine.CUSTOM_TYPE) {
        const data = entry.data as WorkflowState | undefined;
        if (data) lastState = data;
      }
    }

    return lastState ? new WorkflowEngine(lastState) : null;
  }

  // ─── 状态查询 ──────────────────────────────────────────

  getStage(): WorkflowStage {
    return this.state.stage;
  }

  getContext(): WorkflowContext {
    return this.state.context;
  }

  getState(): WorkflowState {
    return this.state;
  }

  getType(): WorkflowType {
    return this.state.type;
  }

  isActive(): boolean {
    return this.state.stage !== "idle" && this.state.stage !== "completed";
  }

  getDocumentPathForStage(stage: WorkflowStage): string | null {
    const { plansDir } = this.state.context;
    const suffixMap: Partial<Record<WorkflowStage, string>> = {
      code_analysis: "code-analysis",
      requirement: "requirement",
      design: "design",
      testing: "testing-plan",
      implementation: "tasks",
      scope: "review-scope",
      report: "review-report",
    };
    const suffix = suffixMap[stage];
    return suffix ? getDocumentPath(plansDir, suffix) : null;
  }

  // ─── 阶段转换 ──────────────────────────────────────────

  transition(nextStage: WorkflowStage): void {
    const prevStage = this.state.stage;

    // 关闭当前阶段
    if (this.state.stageHistory.length > 0) {
      const current = this.state.stageHistory[this.state.stageHistory.length - 1];
      if (current.stage === prevStage) {
        current.exitedAt = Date.now();
      }
    }

    // 记录新阶段
    this.state.stageHistory.push({
      stage: nextStage,
      enteredAt: Date.now(),
    });

    this.state.stage = nextStage;
    this.state.updatedAt = Date.now();

    // 通知监听器
    for (const handler of this.stageChangeHandlers) {
      handler(prevStage, nextStage);
    }
  }

  rollback(): WorkflowStage | null {
    if (this.state.stage === "implementation" || this.state.stage === "completed") {
      // 不允许从实现/完成阶段回退
      return null;
    }

    const history = this.state.stageHistory;
    if (history.length < 2) return null;

    // 移除当前阶段
    history.pop();
    // 回到上一阶段
    const prev = history[history.length - 1];
    if (prev.exitedAt) prev.exitedAt = undefined;
    this.state.stage = prev.stage;
    this.state.updatedAt = Date.now();
    return prev.stage;
  }

  // ─── 持久化 ──────────────────────────────────────────

  /**
   * 返回需要持久化的 entry 数据和类型
   * 调用方使用 pi.appendEntry() 写入 session
   */
  toPersistenceEntry(): { customType: string; data: WorkflowState } {
    return {
      customType: WorkflowEngine.CUSTOM_TYPE,
      data: this.state,
    };
  }

  // ─── 事件 ──────────────────────────────────────────

  onStageChange(handler: (from: WorkflowStage, to: WorkflowStage) => void): void {
    this.stageChangeHandlers.push(handler);
  }

  // ─── 终止 ──────────────────────────────────────────

  abort(): void {
    this.state.stage = "idle";
    this.state.updatedAt = Date.now();
  }
}

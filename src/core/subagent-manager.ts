/**
 * Pi Craft — Subagent Manager
 *
 * 基于 Pi CLI 进程隔离的子代理编排系统。
 * 特点：
 * - 复用 Pi 官方 subagent 的 spawn 方案，但增强可见性
 * - 每个 subagent 的 tool call 实时流式展示
 * - 支持 collapsed / expanded 两种视图
 * - 支持 Approval Gate（可选）
 *
 * 子代理定义位置：
 * - 用户级: ~/.pi/agent/agents/*.md（Pi 原生加载）
 * - 项目级: .pi/craft/agents/*.md（本扩展专属）
 * - 内置: src/scenarios/coding/agents/*.md
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

// ─── 类型 ────────────────────────────────────────────────────

export interface SubagentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: "builtin" | "user" | "project";
  filePath: string;
  requireApproval?: boolean;
}

export interface SingleResult {
  agent: string;
  agentSource: string;
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens: number;
    turns: number;
  };
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

export interface SubagentDetails {
  mode: "single" | "parallel" | "chain";
  results: SingleResult[];
}

export type SubagentUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

// ─── 并发限制 ────────────────────────────────────────────────

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── 工具函数 ──────────────────────────────────────────────────

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-craft-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  });
  return { dir: tmpDir, filePath };
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }
  return { command: "pi", args };
}

// ─── SubagentManager ──────────────────────────────────────────

export class SubagentManager {
  private agents: SubagentConfig[] = [];
  private parentModel: string | undefined;
  private parentProvider: string | undefined;

  /** 设置父 agent 的模型（从 model_select 事件获取） */
  setParentModel(modelId: string | undefined, provider: string | undefined): void {
    this.parentModel = modelId;
    this.parentProvider = provider;
  }

  getParentModel(): string | undefined {
    return this.parentModel;
  }

  // ─── 代理发现 ──────────────────────────────────────────

  /**
   * 加载内置代理（从 src/scenarios/coding/agents/）
   */
  loadBuiltinAgents(agentsDir: string): void {
    if (!fs.existsSync(agentsDir)) return;

    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith(".md")) continue;
      this.loadAgentFromFile(path.join(agentsDir, entry.name), "builtin");
    }
  }

  /**
   * 从 Pi 原生 agents 目录加载（~/.pi/agent/agents/）
   */
  loadPiAgents(agentDir: string): void {
    if (!fs.existsSync(agentDir)) return;

    const entries = fs.readdirSync(agentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith(".md")) continue;
      this.loadAgentFromFile(path.join(agentDir, entry.name), "user");
    }
  }

  private loadAgentFromFile(filePath: string, source: SubagentConfig["source"]): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");

      // 简单 YAML frontmatter 解析
      const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!match) return;

      const frontmatterStr = match[1];
      const body = match[2];

      const frontmatter: Record<string, string> = {};
      for (const line of frontmatterStr.split("\n")) {
        const kv = line.match(/^(\w+):\s*(.+)$/);
        if (kv) frontmatter[kv[1].trim()] = kv[2].trim();
      }

      if (!frontmatter.name || !frontmatter.description) return;

      const tools = frontmatter.tools
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const agent: SubagentConfig = {
        name: frontmatter.name,
        description: frontmatter.description,
        tools: tools?.length ? tools : undefined,
        model: frontmatter.model,
        systemPrompt: body,
        source,
        filePath,
        requireApproval: frontmatter.requireApproval === "true",
      };

      // 去重：同名代理，builtin < user < project
      const existing = this.agents.findIndex((a) => a.name === agent.name);
      if (existing >= 0) {
        const priority: Record<string, number> = { builtin: 0, user: 1, project: 2 };
        if (priority[agent.source] > priority[this.agents[existing].source]) {
          this.agents[existing] = agent;
        }
      } else {
        this.agents.push(agent);
      }
    } catch {
      // skip unparseable files
    }
  }

  getAgent(name: string): SubagentConfig | undefined {
    return this.agents.find((a) => a.name === name);
  }

  getAgents(): SubagentConfig[] {
    return [...this.agents];
  }

  getAgentNames(): string[] {
    return this.agents.map((a) => a.name);
  }

  // ─── 执行单个代理 ──────────────────────────────────────

  async runSingle(
    cwd: string,
    agentName: string,
    task: string,
    signal: AbortSignal | undefined,
    onUpdate: SubagentUpdateCallback | undefined,
  ): Promise<SingleResult> {
    const agent = this.getAgent(agentName);

    if (!agent) {
      const available = this.getAgentNames().join(", ") || "none";
      return {
        agent: agentName,
        agentSource: "unknown",
        task,
        exitCode: 1,
        messages: [],
        stderr: `Unknown agent: "${agentName}". Available: ${available}.`,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
      };
    }

    const args: string[] = ["--mode", "json", "-p", "--no-session"];
    // 模型优先级：agent 显式指定 > 父 agent 模型
    const effectiveModel = agent.model || this.parentModel;
    const effectiveProvider = agent.model ? undefined : this.parentProvider;
    if (effectiveModel) {
      const modelArg = effectiveProvider ? `${effectiveProvider}/${effectiveModel}` : effectiveModel;
      args.push("--model", modelArg);
    }
    if (agent.tools?.length) args.push("--tools", agent.tools.join(","));

    const currentResult: SingleResult = {
      agent: agentName,
      agentSource: agent.source,
      task,
      exitCode: -1,
      messages: [],
      stderr: "",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
      model: effectiveProvider ? `${effectiveProvider}/${effectiveModel}` : effectiveModel,
    };

    const emitUpdate = () => {
      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: getFinalOutput(currentResult.messages) || `(${agentName}: running...)` }],
          details: { mode: "single", results: [currentResult] },
        });
      }
    };

    let tmpPromptDir: string | null = null;
    let tmpPromptPath: string | null = null;

    try {
      if (agent.systemPrompt.trim()) {
        const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
        tmpPromptDir = tmp.dir;
        tmpPromptPath = tmp.filePath;
        args.push("--append-system-prompt", tmpPromptPath);
      }

      args.push(`Task: ${task}`);
      let wasAborted = false;

      const exitCode = await new Promise<number>((resolve) => {
        const invocation = getPiInvocation(args);
        const proc = spawn(invocation.command, invocation.args, {
          cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let buffer = "";

        const processLine = (line: string) => {
          if (!line.trim()) return;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            return;
          }

          if (event.type === "message_end" && event.message) {
            const msg = event.message as Message;
            currentResult.messages.push(msg);

            if (msg.role === "assistant") {
              currentResult.usage.turns++;
              const usage = (msg as Record<string, unknown>).usage as Record<string, number> | undefined;
              if (usage) {
                currentResult.usage.input += usage.input || 0;
                currentResult.usage.output += usage.output || 0;
                currentResult.usage.cacheRead += usage.cacheRead || 0;
                currentResult.usage.cacheWrite += usage.cacheWrite || 0;
                currentResult.usage.cost += (usage as Record<string, Record<string, number>>).cost?.total || 0;
                currentResult.usage.contextTokens = usage.totalTokens || 0;
              }
              const msgRecord = msg as Record<string, unknown>;
              if (!currentResult.model && msgRecord.model) currentResult.model = msgRecord.model as string;
              if (msgRecord.stopReason) currentResult.stopReason = msgRecord.stopReason as string;
              if (msgRecord.errorMessage) currentResult.errorMessage = msgRecord.errorMessage as string;
            }
            emitUpdate();
          }

          if (event.type === "tool_result_end" && event.message) {
            currentResult.messages.push(event.message as Message);
            emitUpdate();
          }
        };

        proc.stdout.on("data", (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) processLine(line);
        });

        proc.stderr.on("data", (data: Buffer) => {
          currentResult.stderr += data.toString();
        });

        proc.on("close", (code: number | null) => {
          if (buffer.trim()) processLine(buffer);
          resolve(code ?? 0);
        });

        proc.on("error", () => resolve(1));

        if (signal) {
          const killProc = () => {
            wasAborted = true;
            proc.kill("SIGTERM");
            setTimeout(() => {
              if (!proc.killed) proc.kill("SIGKILL");
            }, 5000);
          };
          if (signal.aborted) killProc();
          else signal.addEventListener("abort", killProc, { once: true });
        }
      });

      currentResult.exitCode = exitCode;
      if (wasAborted) throw new Error("Subagent aborted");
      return currentResult;
    } finally {
      if (tmpPromptPath) try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
      if (tmpPromptDir) try { fs.rmdirSync(tmpPromptDir); } catch { /* ignore */ }
    }
  }

  // ─── 并行执行 ──────────────────────────────────────────

  async runParallel(
    cwd: string,
    tasks: Array<{ agent: string; task: string }>,
    signal: AbortSignal | undefined,
    onUpdate: SubagentUpdateCallback | undefined,
  ): Promise<SingleResult[]> {
    if (tasks.length > MAX_PARALLEL_TASKS) {
      throw new Error(`Too many parallel tasks (${tasks.length}). Max: ${MAX_PARALLEL_TASKS}`);
    }

    const allResults: SingleResult[] = new Array(tasks.length);
    // Init placeholders
    for (let i = 0; i < tasks.length; i++) {
      allResults[i] = {
        agent: tasks[i].agent,
        agentSource: "unknown",
        task: tasks[i].task,
        exitCode: -1,
        messages: [],
        stderr: "",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
      };
    }

    let completedCount = 0;
    const results = await mapWithConcurrencyLimit(tasks, MAX_CONCURRENCY, async (t, index) => {
      const result = await this.runSingle(cwd, t.agent, t.task, signal, (partial) => {
        if (partial.details?.results[0]) {
          allResults[index] = partial.details.results[0];
          if (onUpdate) {
            onUpdate({
              content: partial.content,
              details: { mode: "parallel", results: [...allResults] },
            });
          }
        }
      });
      allResults[index] = result;
      completedCount++;
      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: `Parallel: ${completedCount}/${tasks.length} done` }],
          details: { mode: "parallel", results: [...allResults] },
        });
      }
      return result;
    });

    return results;
  }

  // ─── 链式执行 ──────────────────────────────────────────

  async runChain(
    cwd: string,
    steps: Array<{ agent: string; task: string }>,
    signal: AbortSignal | undefined,
    onUpdate: SubagentUpdateCallback | undefined,
  ): Promise<SingleResult[]> {
    const results: SingleResult[] = [];
    let previousOutput = "";

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput);

      const result = await this.runSingle(cwd, step.agent, taskWithContext, signal, (partial) => {
        if (onUpdate) {
          const allResults = [...results, partial.details?.results[0] ?? result].filter(Boolean) as SingleResult[];
          onUpdate({
            content: partial.content,
            details: { mode: "chain", results: allResults },
          });
        }
      });

      results.push(result);

      const isError = result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
      if (isError) {
        break;
      }
      previousOutput = getFinalOutput(result.messages);
    }

    return results;
  }
}

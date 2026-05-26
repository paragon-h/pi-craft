/**
 * Pi Craft — Damage Control Rules Engine
 *
 * YAML-driven safety rule engine. Loads rules from global and project-level
 * YAML files, evaluates tool calls against them, and executes block/confirm/warn
 * actions.
 *
 * Fail-open: a broken rule engine never blocks legitimate tool calls.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parse as parseYaml } from "yaml";
import { minimatch } from "minimatch";
import type { DamageControlConfig } from "../../core/config";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type RuleAction = "block" | "confirm" | "warn";

export interface RulePattern {
  /** glob pattern matching file path (write/edit tools) */
  path?: string;
  /** regex pattern matching bash command string */
  command?: string;
  /** regex pattern matching file content (write/edit tools) */
  content?: string;
}

export interface DamageRule {
  name: string;
  description?: string;
  /** Applicable tools: "write", "edit", "bash", or array of these */
  tool: string | string[];
  pattern: RulePattern;
  action: RuleAction;
  message: string;
}

export interface CompiledRule extends DamageRule {
  /** Pre-compiled regex for command matching */
  compiledCommand?: RegExp;
  /** Pre-compiled regex for content matching */
  compiledContent?: RegExp;
  /** Normalized set of applicable tool names */
  tools: Set<string>;
}

export interface RuleMatch {
  rule: DamageRule;
  action: RuleAction;
}

// ═══════════════════════════════════════════════════════════════
// RuleMatcher
// ═══════════════════════════════════════════════════════════════

export class RuleMatcher {
  /** Glob match file path against pattern */
  static matchPath(filePath: string, globPattern: string): boolean {
    if (!filePath) return false;
    // Normalize to forward slashes for minimatch
    const normalized = filePath.replace(/\\/g, "/");
    return minimatch(normalized, globPattern);
  }

  /** Regex match command string against pre-compiled regex */
  static matchCommand(command: string, regex: RegExp): boolean {
    if (!command) return false;
    return regex.test(command);
  }

  /** Regex match file content against pre-compiled regex */
  static matchContent(content: string, regex: RegExp): boolean {
    if (!content) return false;
    return regex.test(content);
  }
}

// ═══════════════════════════════════════════════════════════════
// RuleLoader
// ═══════════════════════════════════════════════════════════════

const DEFAULT_PROJECT_RULES_PATH = ".pi/damage-control-rules.yaml";

function globalRulesDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
  return path.join(home, ".pi", "agent");
}

function globalRulesPath(): string {
  return path.join(globalRulesDir(), "damage-control-rules.yaml");
}

const SEED_RULES_YAML = `# Pi Craft — Damage Control Rules
# 全局默认规则 · 自动生成于首次加载
# 编辑此文件以自定义安全策略
# 项目级规则: .pi/damage-control-rules.yaml (同名规则会覆盖此文件)

rules:
  - name: block-sudo
    description: 阻止提权操作
    tool: bash
    pattern:
      command: '\\bsudo\\b'
    action: block
    message: "已阻止 sudo 提权操作。请避免使用需提权的命令。"

  - name: block-rm-rf-root
    description: 阻止递归删除根目录
    tool: bash
    pattern:
      command: '\\brm\\s+.*-rf?\\s+/(\\s|$)'
    action: block
    message: "已阻止递归删除根目录。这类操作不可逆。"

  - name: protect-env-files
    description: 保护环境变量文件
    tool:
      - write
      - edit
    pattern:
      path: '**/.env'
    action: block
    message: "环境变量文件 (.env) 受保护。如需修改请使用 .env.example。"

  - name: protect-credentials
    description: 保护凭证和密钥文件
    tool:
      - write
      - edit
    pattern:
      path: '**/{credentials,secret,token,key.pem,id_rsa,*.pem}'
    action: block
    message: "凭证/密钥文件受保护。"
`;

export class RuleLoader {
  /**
   * Load and compile all rules (global + project, merged by name).
   * @param cwd - Project working directory
   * @param config - DamageControlConfig from CraftConfig
   * @param _globalRulesDir - Override for testing (default: ~/.pi/agent)
   */
  static load(
    cwd: string,
    config: DamageControlConfig,
    _globalRulesDir?: string,
  ): CompiledRule[] {
    const projectRulesPath = path.join(cwd, config.rules ?? DEFAULT_PROJECT_RULES_PATH);
    const globalPath = _globalRulesDir
      ? path.join(_globalRulesDir, "damage-control-rules.yaml")
      : globalRulesPath();
    const globalDir = path.dirname(globalPath);

    // 1. Load project rules
    let projectRules: DamageRule[] = [];
    if (fs.existsSync(projectRulesPath)) {
      const raw = fs.readFileSync(projectRulesPath, "utf-8");
      projectRules = RuleLoader.parseYaml(raw);
    }

    // 2. Load global rules (seed if not exists)
    let globalRules: DamageRule[] = [];
    if (fs.existsSync(globalPath)) {
      const raw = fs.readFileSync(globalPath, "utf-8");
      globalRules = RuleLoader.parseYaml(raw);
    } else {
      // Auto-generate seed file
      fs.mkdirSync(globalDir, { recursive: true });
      fs.writeFileSync(globalPath, SEED_RULES_YAML, "utf-8");
      globalRules = RuleLoader.parseYaml(SEED_RULES_YAML);
    }

    // 3. Merge by name (project overrides global)
    const merged = RuleLoader.merge(globalRules, projectRules);

    // 4. Compile regexes
    return RuleLoader.compile(merged);
  }

  /** Generate and return the seed rules content string */
  static seedGlobalRules(): string {
    return SEED_RULES_YAML;
  }

  /** Parse YAML string → DamageRule[], validates required fields */
  static parseYaml(content: string): DamageRule[] {
    const doc = parseYaml(content) as Record<string, unknown> | null;
    if (!doc || !doc.rules) {
      throw new Error("YAML 文件缺少 'rules' 顶层字段");
    }
    if (!Array.isArray(doc.rules)) {
      throw new Error("'rules' 必须是一个数组");
    }

    const rules: DamageRule[] = [];
    for (let i = 0; i < doc.rules.length; i++) {
      const item = doc.rules[i] as Record<string, unknown>;
      if (!item || !item.name) {
        throw new Error(`规则 #${i + 1} 缺少必需的 'name' 字段`);
      }
      if (!item.action) {
        throw new Error(`规则 '${item.name}' 缺少必需的 'action' 字段`);
      }
      const action = item.action as string;
      if (!["block", "confirm", "warn"].includes(action)) {
        throw new Error(`规则 '${item.name}' 的 action '${action}' 无效，须为 block/confirm/warn`);
      }
      if (!item.message) {
        throw new Error(`规则 '${item.name}' 缺少必需的 'message' 字段`);
      }
      if (!item.pattern || typeof item.pattern !== "object") {
        throw new Error(`规则 '${item.name}' 缺少必需的 'pattern' 字段`);
      }
      if (!item.tool) {
        throw new Error(`规则 '${item.name}' 缺少必需的 'tool' 字段`);
      }

      rules.push({
        name: item.name as string,
        description: item.description as string | undefined,
        tool: item.tool as string | string[],
        pattern: item.pattern as RulePattern,
        action: action as RuleAction,
        message: item.message as string,
      });
    }
    return rules;
  }

  /** Merge project rules into global rules by name (project overrides) */
  private static merge(global: DamageRule[], project: DamageRule[]): DamageRule[] {
    const map = new Map<string, DamageRule>();
    for (const rule of global) {
      map.set(rule.name, rule);
    }
    for (const rule of project) {
      map.set(rule.name, rule); // override
    }
    return Array.from(map.values());
  }

  /** Pre-compile regex patterns and normalize tool field */
  private static compile(rules: DamageRule[]): CompiledRule[] {
    const result: CompiledRule[] = [];
    for (const rule of rules) {
      const compiled: CompiledRule = {
        ...rule,
        tools: RuleLoader.normalizeTools(rule.tool),
      };

      try {
        if (rule.pattern.command) {
          compiled.compiledCommand = new RegExp(rule.pattern.command);
        }
      } catch {
        // Invalid regex — skip this rule, don't fail entirely
        console.warn(`[Damage Control] 规则 '${rule.name}' 的 command 正则无效，已跳过`);
        continue;
      }

      try {
        if (rule.pattern.content) {
          compiled.compiledContent = new RegExp(rule.pattern.content);
        }
      } catch {
        console.warn(`[Damage Control] 规则 '${rule.name}' 的 content 正则无效，已跳过`);
        continue;
      }

      result.push(compiled);
    }
    return result;
  }

  /** Normalize tool field to Set<string> */
  private static normalizeTools(tool: string | string[]): Set<string> {
    if (Array.isArray(tool)) {
      return new Set(tool);
    }
    return new Set([tool]);
  }
}

// ═══════════════════════════════════════════════════════════════
// ActionExecutor
// ═══════════════════════════════════════════════════════════════

/** Minimal context interface for ActionExecutor (decoupled from pi ExtensionContext) */
export interface ActionContext {
  cwd: string;
  ui: {
    confirm: (title: string, message: string) => Promise<boolean>;
    notify: (message: string, type: string) => void;
  };
}

export interface ActionResult {
  blocked: boolean;
  reason?: string;
}

export class ActionExecutor {
  /**
   * Execute a rule action.
   * @returns { blocked: true, reason: "..." } if blocked
   * @returns null if allowed (warn / auto-allow / user confirmed)
   */
  static async execute(
    match: RuleMatch,
    promptMode: "confirm" | "auto-deny" | "auto-allow",
    ctx: ActionContext,
  ): Promise<ActionResult | null> {
    switch (match.action) {
      case "block":
        return { blocked: true, reason: match.rule.message };

      case "warn":
        ctx.ui.notify(match.rule.message, "warning");
        return null;

      case "confirm":
        switch (promptMode) {
          case "auto-deny":
            return { blocked: true, reason: match.rule.message };
          case "auto-allow":
            ctx.ui.notify(match.rule.message, "warning");
            return null;
          case "confirm":
          default: {
            const ok = await ctx.ui.confirm("⚠️ Damage Control", match.rule.message);
            if (!ok) {
              return { blocked: true, reason: `用户拒绝了: ${match.rule.message}` };
            }
            return null;
          }
        }

      default:
        return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RulesEngine
// ═══════════════════════════════════════════════════════════════

export class RulesEngine {
  private rules: CompiledRule[];
  private fileCache = new Map<string, string>();

  constructor(rules: CompiledRule[]) {
    this.rules = rules;
  }

  /**
   * Evaluate all rules against a tool call.
   * Returns the first matching rule (if any), or null.
   */
  evaluate(opts: {
    tool: string;
    toolInput: Record<string, unknown>;
    cwd: string;
  }): RuleMatch | null {
    for (const rule of this.rules) {
      // --- Tool filter ---
      if (!rule.tools.has(opts.tool)) continue;

      const patterns = rule.pattern;
      let matched = true;

      // --- Path match (write / edit tools) ---
      if (patterns.path) {
        const filePath = (opts.toolInput.path || opts.toolInput.file_path || "") as string;
        if (filePath && !RuleMatcher.matchPath(filePath, patterns.path)) {
          matched = false;
        } else if (!filePath) {
          // Path pattern specified but no path in input — skip this pattern,
          // don't block the tool call just because we can't check
        }
      }

      if (!matched) continue;

      // --- Command match (bash tool) ---
      if (patterns.command && rule.compiledCommand) {
        const command = (opts.toolInput.command || "") as string;
        if (command && !RuleMatcher.matchCommand(command, rule.compiledCommand)) {
          matched = false;
        } else if (!command) {
          // Command pattern but no command in input — skip
        }
      }

      if (!matched) continue;

      // --- Content match (write / edit tools) ---
      if (patterns.content && rule.compiledContent) {
        const content = this.getContent(opts.tool, opts.toolInput, opts.cwd);
        if (content && !RuleMatcher.matchContent(content, rule.compiledContent)) {
          matched = false;
        } else if (!content) {
          // Content pattern but can't get content — skip
        }
      }

      if (matched) {
        return { rule, action: rule.action };
      }
    }

    return null;
  }

  /** Get file content for content matching. Uses toolInput.content for write,
   *  reads from disk for edit (with caching). */
  private getContent(
    tool: string,
    input: Record<string, unknown>,
    cwd: string,
  ): string | null {
    // write tool: content is in the input params
    if (tool === "write" && typeof input.content === "string") {
      return input.content;
    }

    // edit tool: read file from disk
    const filePath = (input.path || input.file_path || "") as string;
    if (!filePath) return null;

    const cacheKey = `${cwd}/${filePath}`;
    if (this.fileCache.has(cacheKey)) {
      return this.fileCache.get(cacheKey)!;
    }

    try {
      const fullPath = filePath.startsWith("/") ? filePath : path.join(cwd, filePath);
      const content = fs.readFileSync(fullPath, "utf-8");
      this.fileCache.set(cacheKey, content);
      return content;
    } catch {
      // File doesn't exist yet — can't check content
      return null;
    }
  }

  /** Clear the file content cache (call after each turn) */
  clearCache(): void {
    this.fileCache.clear();
  }
}

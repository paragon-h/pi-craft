/**
 * Pi Craft — CWD Write Guard
 *
 * 全局工具管控：限制 write/edit/bash 写操作在工作目录内。
 * read/grep/find/ls 不受限制，可读取任意路径。
 *
 * 配置: craft.enableCwdGuard (默认 true)
 */

import * as path from "node:path";
import * as os from "node:os";

/**
 * 检查操作是否在工作目录内。
 * 返回 null = 放行，返回 string = 违规原因。
 */
export function checkCwdGuard(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
): string | null {
  const resolvedCwd = path.resolve(cwd);
  const homeDir = os.homedir();

  /** 展开 ~ 并解析为绝对路径 */
  function resolvePath(p: string): string {
    if (p.startsWith("~")) {
      return path.resolve(p.replace("~", homeDir));
    }
    return path.resolve(p);
  }

  function isInsideCwd(targetPath: string): boolean {
    if (!targetPath) return false;
    const resolved = resolvePath(targetPath);
    return resolved.startsWith(resolvedCwd + path.sep) || resolved === resolvedCwd;
  }

  // ── write ──────────────────────────────────────
  if (toolName === "write") {
    const filePath = (input.path as string) || "";
    if (filePath && !isInsideCwd(filePath)) {
      return `write 目标在工作目录外:\n目标: ${filePath}\n工作目录: ${cwd}`;
    }
  }

  // ── edit ───────────────────────────────────────
  if (toolName === "edit") {
    const filePath = (input.file_path || input.path || "") as string;
    if (!filePath) return null;
    const isAbsolute = filePath.startsWith("/") || filePath.startsWith("~");
    if (isAbsolute && !isInsideCwd(filePath)) {
      return `edit 目标在工作目录外:\n目标: ${filePath}\n工作目录: ${cwd}`;
    }
  }

  // ── bash ───────────────────────────────────────
  if (toolName === "bash") {
    const command = (input.command as string) || "";

    // 只检查写入类命令（mkdir/touch/rm/cp/mv 等），读命令（ls/cat/grep）忽略
    // 注意：rm 可能后跟 -flags（如 rm -rf），末尾去掉 \b（rm -rf 中 - 不是 word char）
    const writeCommands = /\b(mkdir|touch|rm(?:\s|$)|rmdir|cp(?:\s|$)|mv(?:\s|$)|ln(?:\s|$)|chmod|chown|npm\s+init|git\s+init|git\s+clone|go\s+mod\s+init)/;
    const isWriteCmd = writeCommands.test(command);

    // 检测 > / >> / tee 写入外部路径（始终检查）
    // 排除 &1、&2 等 fd 重定向
    const redirectMatch = command.match(/(?:>>|>|tee\s+)(?:-a\s+)?\s*([^&\s]\S*)/g);
    if (redirectMatch) {
      for (const m of redirectMatch) {
        const target = m.replace(/^(?:[>]+|tee\s+(?:-a\s+)?)\s*/, "").trim();
        if (target && !target.startsWith("/dev/") && !isInsideCwd(target)) {
          return `bash 写操作目标在工作目录外:\n命令: ${command.slice(0, 80)}\n工作目录: ${cwd}`;
        }
      }
    }

    // 检测 dd of= 到外部路径
    const ddMatch = command.match(/dd\s+.*\bof=(\S+)/);
    if (ddMatch) {
      const target = ddMatch[1];
      if (target && !target.startsWith("/dev/") && !isInsideCwd(target)) {
        return `dd 写操作目标在工作目录外:\n命令: ${command.slice(0, 80)}\n工作目录: ${cwd}`;
      }
    }

    // 写入类命令：解析所有参数路径（包括相对路径），检查是否在工作目录内
    if (isWriteCmd) {
      // 分割命令为 token，跳过命令名和 flag（-x / --xxx）
      const tokens = command.split(/\s+/).filter(Boolean);
      for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        // 跳过 flag、重定向符、赋值
        if (token.startsWith("-") || token === ">" || token === ">>" || token.includes("=")) continue;
        // 跳过前一个 token 是重定向符的情况
        if (i > 0 && (tokens[i - 1] === ">" || tokens[i - 1] === ">>")) continue;
        // 解析并检查
        if (!isInsideCwd(token)) {
          return `bash 命令目标在工作目录外:\n命令: ${command.slice(0, 80)}\n参数: ${token} → ${resolvePath(token)}\n工作目录: ${cwd}`;
        }
      }
    }
  }

  return null;
}

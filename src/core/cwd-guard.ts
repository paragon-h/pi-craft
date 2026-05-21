/**
 * Pi Craft — CWD Write Guard
 *
 * 全局工具管控：限制 write/edit/bash 写操作在工作目录内。
 * read/grep/find/ls 不受限制，可读取任意路径。
 *
 * 配置: craft.enableCwdGuard (默认 true)
 */

import * as path from "node:path";

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

  function isInsideCwd(targetPath: string): boolean {
    if (!targetPath) return false;
    const resolved = path.resolve(targetPath);
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

    // 检测 > / >> / tee 写入外部路径
    const redirectMatch = command.match(/(?:>|>>|tee\s+)(?:-a\s+)?(\S+)/g);
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
  }

  return null;
}

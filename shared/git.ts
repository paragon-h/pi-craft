/** Git scanning utilities — shared across extensions that display git state. */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface GitScanResult {
  branch: string | null;
  /** Raw `git status --porcelain` lines (XY path), empty when clean or on error. */
  statusLines: string[];
  error: string | null;
}

/**
 * Scan git branch + working tree status for the given cwd.
 * Returns a canonical result shape; never throws — errors are captured
 * into `error` so callers can render a friendly fallback.
 */
export async function scanGit(
  cwd: string,
  timeoutMs = 3000,
): Promise<GitScanResult> {
  try {
    const { stdout: branch } = await execAsync("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      timeout: timeoutMs,
    });
    const { stdout: status } = await execAsync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      timeout: timeoutMs,
    });
    return {
      branch: branch.trim() || null,
      statusLines: status.trim().split("\n").filter(Boolean),
      error: null,
    };
  } catch (e: any) {
    return {
      branch: null,
      statusLines: [],
      error: e?.message ?? "git not available",
    };
  }
}

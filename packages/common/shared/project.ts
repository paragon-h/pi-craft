/** Cross-session project cost scanning — read .jsonl session files from disk. */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeSessionCost, getSessionName, type SessionEntries } from "./session";
import type { SessionCostReport } from "./types";

/**
 * Find the project-specific session directory.
 * cwd /Users/foo/bar → encoded as --Users-foo-bar--
 */
export function findProjectSessionDir(cwd: string, sessionDir: string): string | null {
  const encodedCwd = "--" + cwd.replace(/\//g, "-") + "--";
  const candidates = [
    sessionDir,
    sessionDir.replace(/\/$/, ""),
    join(sessionDir, encodedCwd),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) {
        const hasSessions = readdirSync(c).some((f) => f.endsWith(".jsonl"));
        if (hasSessions) return c;
      }
    } catch {
      // keep trying
    }
  }
  return null;
}

/** Parse a .jsonl session file into entries. */
export function parseSessionFile(filePath: string): SessionEntries {
  const raw = readFileSync(filePath, "utf8");
  const entries: SessionEntries = [];
  for (const line of raw.trim().split("\n")) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/** Scan all sessions in a project directory, return per-session reports + grand total. */
export function scanProjectCost(
  projectDir: string,
): { reports: SessionCostReport[]; grandTotal: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number } } {
  const reports: SessionCostReport[] = [];
  const grandTotal = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

  const files = readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    try {
      const filePath = join(projectDir, file);
      const entries = parseSessionFile(filePath);
      const cost = computeSessionCost(entries);
      const sessionName = getSessionName(entries);

      reports.push({
        sessionPath: filePath,
        sessionName,
        totalInput: cost.totalInput,
        totalOutput: cost.totalOutput,
        totalCacheRead: cost.totalCacheRead,
        totalCacheWrite: cost.totalCacheWrite,
        totalCost: cost.totalCost,
      });

      grandTotal.input += cost.totalInput;
      grandTotal.output += cost.totalOutput;
      grandTotal.cacheRead += cost.totalCacheRead;
      grandTotal.cacheWrite += cost.totalCacheWrite;
      grandTotal.cost += cost.totalCost;
    } catch {
      // skip unreadable sessions
    }
  }

  reports.sort((a, b) => b.totalCost - a.totalCost);
  return { reports, grandTotal };
}

/**
 * Pi Craft — Coding Scenario Utilities
 *
 * Pure functions extracted from the extension entry for testability.
 */

import * as fs from "node:fs";

/** Format today as YYYY-MM-DD */
export function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gate a file produced by a workflow stage.
 * Returns null if acceptable, or a string explaining why it was rejected.
 */
export function gateFile(fullPath: string): string | null {
  try {
    const stat = fs.statSync(fullPath);
    if (stat.size < 80) return `file is only ${stat.size} bytes`;
    const head = fs.readFileSync(fullPath, "utf-8").slice(0, 200);
    if (head.split("\n").filter(l => l.trim().length > 20).length < 2) return "file appears to be a stub";
    return null;
  } catch (err: any) {
    if (err.code === "ENOENT") return "file not found";
    throw err;
  }
}

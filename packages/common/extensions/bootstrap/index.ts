/**
 * Bootstrap Extension — Auto-injects the using-pi-superpowers skill into
 * every session's system prompt, mirroring Superpowers' session-start hook.
 *
 * This ensures skills auto-trigger without the user needing to manually
 * load or invoke the bootstrap skill.
 *
 * Mechanism:
 * - Reads skills/using-pi-superpowers/SKILL.md once at load time
 * - On every before_agent_start, injects content wrapped in
 *   <EXTREMELY_IMPORTANT>...</EXTREMELY_IMPORTANT> into the system prompt
 *
 * Error handling: if the skill file is missing or unreadable, the extension
 * logs a warning and skips injection rather than crashing the whole extension
 * system (which previously caused a silent bootstrap failure).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// @ts-expect-error — jiti supports import.meta at runtime; tsc flags it under CJS inference
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const skillPath = resolve(__dirname, "../../skills/using-pi-superpowers/SKILL.md");

let skillContent: string;
try {
  skillContent = readFileSync(skillPath, "utf-8");
} catch (e) {
  console.error(`[bootstrap] Failed to read skill file at ${skillPath}:`, e);
  skillContent = "";
}

const bootstrapPrefix = "<EXTREMELY_IMPORTANT>\nYou have pi superpowers.\n\n";
const bootstrapSuffix = "\n</EXTREMELY_IMPORTANT>";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    if (!skillContent) return; // skill file not found, skip injection

    const bootstrapInjection = `${bootstrapPrefix}${skillContent}${bootstrapSuffix}`;
    // Avoid double-injection if already present
    if (event.systemPrompt.includes(bootstrapInjection)) return;

    return {
      systemPrompt: `${bootstrapInjection}\n\n${event.systemPrompt}`,
    };
  });
}

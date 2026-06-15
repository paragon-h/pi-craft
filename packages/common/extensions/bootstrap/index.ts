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
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const skillPath = resolve(__dirname, "../skills/using-pi-superpowers/SKILL.md");
const skillContent = readFileSync(skillPath, "utf-8");

const bootstrapPrefix = "<EXTREMELY_IMPORTANT>\nYou have pi superpowers.\n\n";
const bootstrapSuffix = "\n</EXTREMELY_IMPORTANT>";
const bootstrapInjection = `${bootstrapPrefix}${skillContent}${bootstrapSuffix}`;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    // Avoid double-injection if already present
    if (event.systemPrompt.includes(bootstrapInjection)) return;

    return {
      systemPrompt: `${bootstrapInjection}\n\n${event.systemPrompt}`,
    };
  });
}

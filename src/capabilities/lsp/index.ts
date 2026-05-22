/**
 * Pi Craft — LSP Capability
 *
 * Registers an `lsp` tool for language server diagnostics.
 * Controllable via config: craft.enableLsp (default: true).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCraftConfig, isOn } from "../../core/config";

export default function (pi: ExtensionAPI) {
  const config = getCraftConfig();
  if (!isOn(config, "enableLsp")) return;

  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description: [
      "Run language server diagnostics on a file.",
      "Returns errors, warnings, and hints with line/column positions.",
    ].join(" "),
    parameters: {
      // typebox schema here when implemented
    } as any,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const filePath = (params as any).path as string;
      return {
        content: [{
          type: "text",
          text: `⚠️ LSP diagnostics not yet implemented.\n\nFile: ${filePath}\n\nThis capability will spawn a language server (e.g. typescript-language-server, gopls, rust-analyzer) based on file extension and return structured diagnostics.`,
        }],
        details: {},
      };
    },
  });
}

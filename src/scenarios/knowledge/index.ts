/**
 * Pi Craft — Knowledge Management Scenario (Placeholder)
 *
 * This scenario will be built out in a future release.
 * For now it registers a notification command only.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("knowledge", {
    description: "Knowledge management scenario",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "🚧 Knowledge management scenario is under development.\n\n" +
        "This scenario will provide:\n" +
        "  • Personal knowledge base indexing\n" +
        "  • Semantic search across notes\n" +
        "  • Auto-tagging & categorization\n" +
        "  • Knowledge graph visualization",
        "info",
      );
    },
  });
}

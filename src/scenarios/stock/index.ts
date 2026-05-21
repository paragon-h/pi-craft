/**
 * Pi Craft — Stock Analysis Scenario (Placeholder)
 *
 * This scenario will be built out in a future release.
 * For now it registers a notification command only.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("stock", {
    description: "Stock analysis scenario",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "🚧 Stock analysis scenario is under development.\n\n" +
        "This scenario will provide:\n" +
        "  • Market data fetching & visualization\n" +
        "  • Technical analysis reports\n" +
        "  • Portfolio tracking\n" +
        "  • News sentiment analysis",
        "info",
      );
    },
  });
}

/**
 * Pi Craft — Travel Scenario (Placeholder)
 *
 * This scenario will be built out in a future release.
 * For now it registers a notification command only.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("travel", {
    description: "Travel planning scenario",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "🚧 Travel scenario is under development.\n\n" +
        "This scenario will provide:\n" +
        "  • Destination research & recommendations\n" +
        "  • Itinerary planning\n" +
        "  • Budget estimation\n" +
        "  • Booking assistance",
        "info",
      );
    },
  });
}

/**
 * Cost Panel — shows token usage and cost for the current session.
 *
 * Sources data from shared/session.ts's computeSessionCost().
 * Displays session-level cost and token breakdown.
 */

import type { SessionCost } from "../../../shared/types";
import { formatCost, formatTokens } from "../../../shared/format";
import type { PanelItem, SidebarPanel } from "../types";

export class CostPanel implements SidebarPanel {
  id = "cost";
  title = "成本";

  private cost: SessionCost | null = null;

  /** Update cost data (called by the extension on turn_end). */
  update(cost: SessionCost): void {
    this.cost = cost;
  }

  getItems(): PanelItem[] {
    if (!this.cost) {
      return [
        {
          id: "cost-empty",
          icon: "💰",
          label: "暂无成本数据",
        },
      ];
    }

    const c = this.cost;
    return [
      {
        id: "cost-total",
        icon: "💰",
        label: `${formatCost(c.totalCost)}`,
      },
      {
        id: "cost-input",
        icon: "↑",
        label: `Input: ${formatTokens(c.totalInput)} tokens`,
      },
      {
        id: "cost-output",
        icon: "↓",
        label: `Output: ${formatTokens(c.totalOutput)} tokens`,
      },
      {
        id: "cost-cache-read",
        icon: "📖",
        label: `Cache R: ${formatTokens(c.totalCacheRead)} tokens`,
      },
      {
        id: "cost-cache-write",
        icon: "✏️",
        label: `Cache W: ${formatTokens(c.totalCacheWrite)} tokens`,
      },
    ];
  }

  getSummary(): string {
    if (!this.cost) return "-";
    return formatCost(this.cost.totalCost);
  }

  onAction?(_item: PanelItem): void {
    // Informational panel — no actions
  }
}

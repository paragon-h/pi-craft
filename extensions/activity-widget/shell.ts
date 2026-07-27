/**
 * SidebarShell — the core widget component.
 *
 * Implements Component. Manages a list of registered panels and renders
 * them as a vertical stack above the editor. This is a read-only display
 * — no keyboard input or focus management (widget API limitation).
 *
 * Panel actions (onAction) are preserved in the interface for future
 * extensibility but not wired in widget mode.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SidebarPanel } from "./types";

/** Maximum total lines to render, to prevent viewport overflow. */
const MAX_LINES = 20;

export class SidebarShell implements Component {
  private panels: SidebarPanel[] = [];
  private tui: TUI;
  private theme: Theme;

  // Cached render
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(tui: TUI, theme: Theme) {
    this.tui = tui;
    this.theme = theme;
  }

  /** Register a panel. Panels render in registration order. */
  registerPanel(panel: SidebarPanel): void {
    this.panels.push(panel);
    this.invalidate();
  }

  /** Force a re-render. Call after panel data changes. */
  refresh(): void {
    this.invalidate();
    this.tui.requestRender();
  }

  // ── Component ──────────────────────────────────────────────────

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const th = this.theme;
    const lines: string[] = [];
    let lineCount = 0;

    const pushLine = (line: string): boolean => {
      if (lineCount >= MAX_LINES) return false;
      lines.push(line);
      lineCount++;
      return true;
    };

    for (let pi = 0; pi < this.panels.length; pi++) {
      const panel = this.panels[pi]!;
      const items = panel.getItems();

      // Skip empty panels entirely
      if (items.length === 0) continue;

      // Panel header
      const summary = panel.getSummary?.() ?? String(items.length);
      if (!pushLine(th.fg("muted", th.bold(`${panel.title} (${summary})`)))) break;

      // Panel items
      for (const item of items) {
        const maxLabelW = width - 5; // indent + icon + space
        const truncatedLabel = truncateToWidth(item.label, Math.max(1, maxLabelW), "...", true);
        const color = item.icon === "✏️" ? "text" : "dim";
        if (!pushLine(`  ${item.icon} ${th.fg(color, truncatedLabel)}`)) break;
      }

      // Blank line between panels (not after the last)
      if (pi < this.panels.length - 1) {
        if (!pushLine("")) break;
      }
    }

    // If truncated, add indicator
    if (lineCount >= MAX_LINES) {
      lines.push(th.fg("dim", `  ... 更多内容未显示`));
    }

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

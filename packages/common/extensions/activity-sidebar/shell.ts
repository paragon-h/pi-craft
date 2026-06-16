/**
 * SidebarShell — the core sidebar component.
 *
 * Implements Component + Focusable. Manages a list of registered panels,
 * renders them as a vertical stack inside a bordered box, handles keyboard
 * navigation (up/down/enter/tab/escape), and coordinates focus.
 */

import type { Component, Focusable, TUI } from "@earendil-works/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { PanelItem, SidebarPanel } from "./types";

interface RenderItem {
  panelIndex: number;
  itemIndex: number; // -1 means the panel header itself
  panel: SidebarPanel;
  item?: PanelItem;
}

export class SidebarShell implements Component, Focusable {
  private panels: SidebarPanel[] = [];
  private tui: TUI;
  private theme: Theme;
  private onHide: () => void;

  // Focus state (Focusable interface)
  focused = false;

  // Selection state
  private activePanelIndex = 0;
  private activeItemIndex = 0;

  // Cached render
  private cachedWidth?: number;
  private cachedLines?: string[];

  // Flattened render items (rebuilt on each render for navigation mapping)
  private flatItems: RenderItem[] = [];

  constructor(tui: TUI, theme: Theme, onHide: () => void) {
    this.tui = tui;
    this.theme = theme;
    this.onHide = onHide;
  }

  /** Register a panel. Panels render in registration order. */
  registerPanel(panel: SidebarPanel): void {
    this.panels.push(panel);
    this.invalidate();
  }

  /** Force a re-render. Call after panel data changes. */
  refresh(): void {
    this.tui.requestRender();
  }

  // ── Focusable ──────────────────────────────────────────────────

  // `focused` is a public field, set by TUI. No setter needed since
  // we don't have child inputs to propagate to.

  // ── Component ──────────────────────────────────────────────────

  handleInput(data: string): void {
    // Escape or Ctrl+G: hide sidebar
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("g"))) {
      this.onHide();
      return;
    }

    // Tab: next panel
    if (matchesKey(data, Key.tab)) {
      this.activePanelIndex = (this.activePanelIndex + 1) % Math.max(1, this.panels.length);
      this.activeItemIndex = 0;
      this.tui.requestRender();
      return;
    }

    // Shift+Tab: previous panel
    if (matchesKey(data, "shift+tab")) {
      this.activePanelIndex =
        (this.activePanelIndex - 1 + this.panels.length) % Math.max(1, this.panels.length);
      this.activeItemIndex = 0;
      this.tui.requestRender();
      return;
    }

    // Up: move selection up
    if (matchesKey(data, Key.up)) {
      this.moveSelection(-1);
      this.tui.requestRender();
      return;
    }

    // Down: move selection down
    if (matchesKey(data, Key.down)) {
      this.moveSelection(1);
      this.tui.requestRender();
      return;
    }

    // Enter: trigger action on selected item
    if (matchesKey(data, Key.enter)) {
      this.triggerAction();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const th = this.theme;
    const lines: string[] = [];
    const innerW = Math.max(1, width - 2); // account for │ borders
    this.flatItems = [];

    // Top border with title
    const title = " Activity Sidebar ";
    const titleW = visibleWidth(title);
    const leftDash = Math.floor((innerW - titleW) / 2);
    const rightDash = Math.max(0, innerW - titleW - leftDash);
    lines.push(
      th.fg("border", `╭${"─".repeat(leftDash)}`) +
        th.fg("accent", title) +
        th.fg("border", `${"─".repeat(rightDash)}╮`),
    );

    if (this.panels.length === 0) {
      lines.push(
        th.fg("border", "│") +
          truncateToWidth(`  ${th.fg("dim", "No panels registered")}`, innerW, "...", true) +
          th.fg("border", "│"),
      );
    } else {
      for (let pi = 0; pi < this.panels.length; pi++) {
        const panel = this.panels[pi]!;
        const items = panel.getItems();
        const isActivePanel = pi === this.activePanelIndex && this.focused;

        // Register header as a navigable item
        this.flatItems.push({ panelIndex: pi, itemIndex: -1, panel });

        // Panel header
        const headerIcon = isActivePanel ? "▶" : " ";
        const headerText = `${headerIcon} ${panel.title} (${items.length})`;
        const headerColor = isActivePanel ? "accent" : "muted";
        const headerLine =
          th.fg("border", "│") +
          " " +
          truncateToWidth(th.fg(headerColor, th.bold(headerText)), innerW - 1, "...", true) +
          th.fg("border", "│");
        lines.push(headerLine);

        // Panel items
        if (items.length === 0) {
          const emptyLine =
            th.fg("border", "│") +
            "   " +
            truncateToWidth(th.fg("dim", "暂无内容"), innerW - 3, "...", true) +
            th.fg("border", "│");
          lines.push(emptyLine);
        } else {
          for (let ii = 0; ii < items.length; ii++) {
            const item = items[ii]!;
            this.flatItems.push({ panelIndex: pi, itemIndex: ii, panel, item });

            const isSelected = isActivePanel && ii === this.activeItemIndex;
            const icon = item.icon;
            const labelText = item.label;

            // Truncate the label to fit: innerW - 4 (border + space + icon + space)
            const maxLabelW = innerW - 4;
            const truncatedLabel = truncateToWidth(labelText, maxLabelW, "...", true);

            let content: string;
            if (isSelected) {
              // Highlight selected item
              content = th.inverse(` ${icon} ${truncatedLabel}`);
            } else {
              content = th.fg("muted", ` ${icon} `) + th.fg("text", truncatedLabel);
            }

            const padded =
              content + " ".repeat(Math.max(0, innerW - 1 - visibleWidth(content)));
            lines.push(th.fg("border", "│") + padded + th.fg("border", "│"));
          }
        }

        // Divider between panels (not after the last one)
        if (pi < this.panels.length - 1) {
          lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));
        }
      }
    }

    // Footer
    const footerText = this.focused
      ? " ↑↓ 导航 | Tab 切换 | Enter 操作 | Esc 关闭 "
      : " Ctrl+G 聚焦 ";
    const footerW = visibleWidth(footerText);
    const fLeft = Math.floor((innerW - footerW) / 2);
    const fRight = Math.max(0, innerW - footerW - fLeft);
    lines.push(
      th.fg("border", `├${"─".repeat(fLeft)}`) +
        th.fg("dim", footerText) +
        th.fg("border", `${"─".repeat(fRight)}┤`),
    );

    // Bottom border
    lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  // ── Navigation helpers ─────────────────────────────────────────

  private moveSelection(delta: 1 | -1): void {
    if (this.panels.length === 0) return;

    const panel = this.panels[this.activePanelIndex]!;
    const items = panel.getItems();

    if (items.length === 0) {
      // Jump to next/prev panel that has items
      this.jumpPanel(delta);
      return;
    }

    const newIdx = this.activeItemIndex + delta;

    if (newIdx < 0) {
      // Move to previous panel
      this.jumpPanel(delta);
      return;
    }

    if (newIdx >= items.length) {
      // Move to next panel
      this.jumpPanel(delta);
      return;
    }

    this.activeItemIndex = newIdx;
  }

  private jumpPanel(delta: 1 | -1): void {
    const n = this.panels.length;
    if (n === 0) return;

    // Find next panel with items
    for (let step = 1; step <= n; step++) {
      const idx = (this.activePanelIndex + delta * step + n * n) % n;
      const items = this.panels[idx]!.getItems();
      if (items.length > 0) {
        this.activePanelIndex = idx;
        // Position at start or end depending on direction
        this.activeItemIndex = delta > 0 ? 0 : items.length - 1;
        return;
      }
    }
  }

  private triggerAction(): void {
    if (this.panels.length === 0) return;
    const panel = this.panels[this.activePanelIndex]!;
    const items = panel.getItems();
    if (this.activeItemIndex < 0 || this.activeItemIndex >= items.length) return;

    const item = items[this.activeItemIndex]!;
    if (item.action) {
      item.action();
    } else if (panel.onAction) {
      panel.onAction(item);
    }
  }
}

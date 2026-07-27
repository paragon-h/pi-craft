/**
 * Activity Widget — Panel type definitions.
 *
 * Panels are data sources, not components. The SidebarShell owns all
 * rendering and input handling. Each panel provides items and optional
 * action callbacks.
 */

/** A single selectable item within a panel. */
export interface PanelItem {
  /** Unique item identifier within the panel */
  id: string;
  /** Display text (may include ANSI color codes from Theme) */
  label: string;
  /** Emoji icon shown before the label */
  icon: string;
  /** Called when the user selects this item and presses Enter (optional) */
  action?: () => void;
}

/** A panel that provides data for the widget to render. */
export interface SidebarPanel {
  /** Unique panel identifier */
  id: string;
  /** Title shown in the panel header */
  title: string;
  /** Return current items for this panel */
  getItems(): PanelItem[];
  /** Optional summary shown in the panel header, e.g. "2/5" or "$1.23".
   *  If provided, renders as: `title (summary)` instead of `title (itemCount)` */
  getSummary?(): string;
  /** Called when the user selects an item and presses Enter (optional) */
  onAction?(item: PanelItem): void;
}

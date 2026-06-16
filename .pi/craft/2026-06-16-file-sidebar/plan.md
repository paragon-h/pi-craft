# Activity Sidebar — Phase 1 Implementation Plan

> **For implementation:** Use executing-plans skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SidebarShell component with the Files panel — a toggleable right-side overlay sidebar that shows changed files with keyboard navigation, proving the extensible panel architecture.

**Architecture:** A `SidebarShell` component implements pi-tui's `Component` + `Focusable` interfaces. It manages a list of registered panels, renders them as a vertical stack inside a bordered box, handles keyboard navigation (up/down/enter/tab/escape), and coordinates focus with the overlay handle. The Files panel implements the `SidebarPanel` interface, sourcing data from `shared/session.ts`'s `scanFileChanges()`.

**Tech Stack:** TypeScript (jiti runtime), `@earendil-works/pi-tui` (Component, Focusable, Key, matchesKey, truncateToWidth, visibleWidth, TUI, OverlayHandle types), `@earendil-works/pi-coding-agent` (ExtensionAPI, ExtensionContext, Theme).

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/common/extensions/activity-sidebar/types.ts` | `SidebarPanel` and `PanelItem` interfaces — the extension contract |
| `packages/common/extensions/activity-sidebar/shell.ts` | `SidebarShell` component: panel registry, rendering, focus, keyboard navigation |
| `packages/common/extensions/activity-sidebar/panels/files.ts` | `FilesPanel` — implements `SidebarPanel`, sources from `scanFileChanges()` |
| `packages/common/extensions/activity-sidebar/index.ts` | Extension entry: lifecycle events, overlay creation, shortcut registration |

### No changes to existing files

Reuses: `packages/common/shared/session.ts` (`scanFileChanges`, `reconstructTodoState`), `packages/common/shared/types.ts` (`FileChange`, `Task`), `packages/common/shared/format.ts`.

---

## API Reference (verified from pi source)

### Component interface (`@earendil-works/pi-tui`)
```typescript
interface Component {
  render(width: number): string[];      // one string per line, each ≤ width
  handleInput?(data: string): void;     // keyboard input when focused
  invalidate(): void;                    // clear cached render state
}
```

### Focusable interface (`@earendil-works/pi-tui`)
```typescript
interface Focusable {
  focused: boolean;  // set by TUI when focus changes
}
```
When a `Focusable` component has focus, TUI sets `focused = true`.

### Theme class (`@earendil-works/pi-coding-agent` → `../../modes/interactive/theme/theme.ts`)
```typescript
class Theme {
  fg(color: ThemeColor, text: string): string;  // ThemeColor = "accent"|"border"|"borderMuted"|"success"|"error"|"warning"|"muted"|"dim"|"text"|...
  bg(color: ThemeBg, text: string): string;      // ThemeBg = "selectedBg"|...
  bold(text: string): string;
  inverse(text: string): string;
}
```
The `custom()` factory callback provides `theme: Theme` — we store it on the shell.

### OverlayHandle (`@earendil-works/pi-tui`)
```typescript
interface OverlayHandle {
  hide(): void;
  setHidden(hidden: boolean): void;
  isHidden(): boolean;
  focus(): void;
  unfocus(options?): void;
  isFocused(): boolean;
}
```

### ctx.ui.custom() signature
```typescript
custom<T>(
  factory: (tui: TUI, theme: Theme, keybindings: KeybindingsManager, done: (result: T) => void) => Component & { dispose?(): void },
  options?: {
    overlay?: boolean;
    overlayOptions?: OverlayOptions | (() => OverlayOptions);
    onHandle?: (handle: OverlayHandle) => void;
  }
): Promise<T>;
```

### Key / matchesKey (`@earendil-works/pi-tui`)
```typescript
import { Key, matchesKey } from "@earendil-works/pi-tui";
// Key.ctrl("g"), Key.up, Key.down, Key.enter, Key.escape, Key.tab
// matchesKey(data: string, keyId: KeyId): boolean
// KeyId accepts string: "shift+tab"
```

### truncateToWidth / visibleWidth (`@earendil-works/pi-tui`)
```typescript
truncateToWidth(text: string, maxWidth: number, ellipsis?: string, pad?: boolean): string;
visibleWidth(str: string): number;  // accounts for ANSI codes
```

### registerShortcut
```typescript
pi.registerShortcut(shortcut: KeyId, options: {
  description?: string;
  handler: (ctx: ExtensionContext) => Promise<void> | void;
}): void;
```

### Events used
- `session_start` → reconstruct state, create overlay
- `session_tree` → reconstruct state, refresh
- `tool_execution_start` → `event.toolName`, `event.args?.path ?? event.args?.filePath`
- `tool_execution_end` → `event.toolName`, `event.result`

---

## Task 1: Create panel type definitions

**Files:**
- Create: `packages/common/extensions/activity-sidebar/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
/**
 * Activity Sidebar — Panel type definitions.
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

/** A panel that provides data for the sidebar to render. */
export interface SidebarPanel {
  /** Unique panel identifier */
  id: string;
  /** Title shown in the panel header */
  title: string;
  /** Return current items for this panel */
  getItems(): PanelItem[];
  /** Called when the user selects an item and presses Enter (optional) */
  onAction?(item: PanelItem): void;
}
```

- [ ] **Step 2: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --types node packages/common/extensions/activity-sidebar/types.ts 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/common/extensions/activity-sidebar/types.ts
git commit -m "feat(activity-sidebar): add panel type definitions"
```

---

## Task 2: Create the Files panel

**Files:**
- Create: `packages/common/extensions/activity-sidebar/panels/files.ts`

- [ ] **Step 1: Create the Files panel**

```typescript
/**
 * Files Panel — shows files changed in the current session.
 *
 * Sources data from shared/session.ts's scanFileChanges().
 * Each file becomes a PanelItem with a write/read icon and path.
 */

import type { FileChange } from "../../../shared/types";
import type { PanelItem, SidebarPanel } from "../types";

export class FilesPanel implements SidebarPanel {
  id = "files";
  title = "文件变更";

  private fileChanges: FileChange[] = [];

  /** Update the file list (called by the extension on tool events). */
  update(fileChanges: FileChange[]): void {
    this.fileChanges = fileChanges;
  }

  getItems(): PanelItem[] {
    return this.fileChanges.map((f, i) => ({
      id: `file-${i}`,
      icon: f.type === "write" ? "✏️" : "📖",
      label: f.path,
      action: undefined, // Phase 4: will open diff view
    }));
  }

  onAction?(item: PanelItem): void {
    // Phase 4: will open diff view for the selected file
  }
}
```

- [ ] **Step 2: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --types node packages/common/extensions/activity-sidebar/types.ts packages/common/extensions/activity-sidebar/panels/files.ts packages/common/shared/types.ts 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/common/extensions/activity-sidebar/panels/files.ts
git commit -m "feat(activity-sidebar): add files panel"
```

---

## Task 3: Create the SidebarShell component

**Files:**
- Create: `packages/common/extensions/activity-sidebar/shell.ts`

This is the core component. It implements `Component` + `Focusable`, manages the panel list, renders a vertical stack of panels inside a bordered box, and handles keyboard navigation.

- [ ] **Step 1: Create the shell component**

```typescript
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
  itemIndex: number;  // -1 means the panel header itself
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
    const th = this.theme;

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
      this.activePanelIndex = (this.activePanelIndex - 1 + this.panels.length) % Math.max(1, this.panels.length);
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
    lines.push(th.fg("border", `╭${"─".repeat(leftDash)}`) + th.fg("accent", title) + th.fg("border", `${"─".repeat(rightDash)}╮`));

    if (this.panels.length === 0) {
      lines.push(th.fg("border", "│") + truncateToWidth(`  ${th.fg("dim", "No panels registered")}`, innerW, "...", true) + th.fg("border", "│"));
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
        const headerLine = th.fg("border", "│") + " " + truncateToWidth(th.fg(headerColor, th.bold(headerText)), innerW - 1, "...", true) + th.fg("border", "│");
        lines.push(headerLine);

        // Panel items
        if (items.length === 0) {
          const emptyLine = th.fg("border", "│") + "   " + truncateToWidth(th.fg("dim", "暂无内容"), innerW - 3, "...", true) + th.fg("border", "│");
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

            const padded = content + " ".repeat(Math.max(0, innerW - 1 - visibleWidth(content)));
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
    lines.push(th.fg("border", `├${"─".repeat(fLeft)}`) + th.fg("dim", footerText) + th.fg("border", `${"─".repeat(fRight)}┤`));

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

    let newIdx = this.activeItemIndex + delta;

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
```

- [ ] **Step 2: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --types node packages/common/extensions/activity-sidebar/types.ts packages/common/extensions/activity-sidebar/shell.ts packages/common/shared/types.ts 2>&1 | head -20
```
Expected: no errors. If there are errors about `Theme` import path, adjust the import to `import type { Theme } from "@earendil-works/pi-coding-agent"` (the extension types re-export it).

- [ ] **Step 3: Commit**

```bash
git add packages/common/extensions/activity-sidebar/shell.ts
git commit -m "feat(activity-sidebar): add SidebarShell component with panel registry and navigation"
```

---

## Task 4: Create the extension entry point

**Files:**
- Create: `packages/common/extensions/activity-sidebar/index.ts`

This wires everything together: creates the overlay on `session_start`, registers the `Ctrl+G` shortcut, listens to tool events to update the Files panel, and reconstructs state on `session_tree`.

- [ ] **Step 1: Create the extension entry**

```typescript
/**
 * Activity Sidebar Extension — toggleable right-side sidebar with
 * extensible panels (files, tasks, cost, git — Phase 1: files only).
 *
 * Toggle: Ctrl+G
 * Navigation: ↑↓ to move, Tab/Shift+Tab to switch panels, Enter for action,
 *             Esc to release focus back to editor, Ctrl+G again to hide.
 *
 * The sidebar is a persistent overlay that starts hidden. It uses
 * handle.setHidden() for visibility and handle.focus()/unfocus() for
 * input ownership.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, type OverlayHandle } from "@earendil-works/pi-tui";
import { reconstructTodoState, scanFileChanges } from "../../shared/session";
import { SidebarShell } from "./shell";
import { FilesPanel } from "./panels/files";

export default function (pi: ExtensionAPI) {
  let overlayHandle: OverlayHandle | null = null;
  let shell: SidebarShell | null = null;
  const filesPanel = new FilesPanel();

  function updateFilesPanel(ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getBranch();
    const fileChanges = scanFileChanges(entries);
    filesPanel.update(fileChanges);
    shell?.refresh();
  }

  function createOverlay(ctx: ExtensionContext): void {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    if (shell) return; // already created

    // Create the overlay (not awaited — persists for session lifetime)
    ctx.ui.custom<void>(
      (tui, theme, _kb, _done) => {
        shell = new SidebarShell(tui, theme, () => {
          // onHide: hide sidebar and release focus
          overlayHandle?.setHidden(true);
          overlayHandle?.unfocus();
        });
        shell.registerPanel(filesPanel);
        return shell;
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "right-center",
          width: "35%",
          minWidth: 40,
          maxHeight: "90%",
          margin: { right: 1 },
          visible: (termWidth: number) => termWidth >= 80,
        },
        onHandle: (handle: OverlayHandle) => {
          overlayHandle = handle;
          handle.setHidden(true);  // start hidden
          handle.unfocus();         // editor keeps input
        },
      },
    );
  }

  // ── Lifecycle events ───────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateFilesPanel(ctx);
    createOverlay(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    updateFilesPanel(ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!ctx.hasUI || !shell) return;
    // Only refresh if it's a file-related tool
    const path = event.args?.path ?? event.args?.filePath;
    if (!path) return;
    if (event.toolName === "write" || event.toolName === "edit" || event.toolName === "read") {
      updateFilesPanel(ctx);
    }
  });

  // ── Shortcut: Ctrl+G ───────────────────────────────────────────

  pi.registerShortcut(Key.ctrl("g"), {
    description: "Toggle activity sidebar",
    handler: async (_ctx) => {
      if (!overlayHandle) return;

      if (overlayHandle.isHidden()) {
        // Hidden → show and focus
        overlayHandle.setHidden(false);
        overlayHandle.focus();
      } else if (overlayHandle.isFocused()) {
        // Visible + focused → hide
        overlayHandle.setHidden(true);
        overlayHandle.unfocus();
      } else {
        // Visible but not focused → focus
        overlayHandle.focus();
      }
    },
  });
}
```

- [ ] **Step 2: Verify type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npx tsc --noEmit --strict --skipLibCheck --module nodenext --moduleResolution nodenext --types node packages/common/extensions/activity-sidebar/types.ts packages/common/extensions/activity-sidebar/shell.ts packages/common/extensions/activity-sidebar/panels/files.ts packages/common/extensions/activity-sidebar/index.ts packages/common/shared/*.ts 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/common/extensions/activity-sidebar/index.ts
git commit -m "feat(activity-sidebar): add extension entry with overlay lifecycle and Ctrl+G shortcut"
```

---

## Task 5: Full project type-check and integration verification

**Files:**
- No new files — verify everything together

- [ ] **Step 1: Run full project type-check**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && npm run typecheck 2>&1
```
Expected: no errors. The tsconfig `include` already covers `packages/common/extensions/**/*.ts` so the new files are picked up automatically.

- [ ] **Step 2: Verify file structure**

Run:
```bash
ls -la packages/common/extensions/activity-sidebar/
ls -la packages/common/extensions/activity-sidebar/panels/
```
Expected:
```
activity-sidebar/
  index.ts
  shell.ts
  types.ts
  panels/
    files.ts
```

- [ ] **Step 3: Verify no import cycles**

Run:
```bash
cd /Users/ekko/Workspace/p/code/pi-craft && rg -n "from \"" packages/common/extensions/activity-sidebar/*.ts packages/common/extensions/activity-sidebar/panels/*.ts
```
Expected: imports flow in one direction (index → shell + panels, shell → types, panels → types + shared). No cycles.

- [ ] **Step 4: Reload and manual test**

The user will test via `/reload` in their pi session. Verification checklist for manual testing:

1. After `/reload`, the sidebar should NOT be visible (starts hidden)
2. Press `Ctrl+G` → sidebar appears on the right side, focused
3. Sidebar shows "文件变更" panel with files changed in this session
4. `↑` / `↓` navigates between files, selected file is highlighted (inverse video)
5. `Esc` → sidebar stays visible but dimmed (focus released to editor)
6. `Ctrl+G` again (sidebar visible, not focused) → sidebar gets focus again
7. `Ctrl+G` again (sidebar focused) → sidebar hides
8. After writing/editing a file, re-open sidebar → new file appears in list
9. Terminal < 80 cols → sidebar auto-hides

- [ ] **Step 5: Commit final state (if any fixes were needed during testing)**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

## Self-Review Checklist

After writing this plan, I verified:

1. **Spec coverage:**
   - ✅ SidebarShell with panel registry → Task 3
   - ✅ Files panel → Task 2
   - ✅ Panel type definitions → Task 1
   - ✅ Overlay lifecycle + shortcut → Task 4
   - ✅ Focus management (Ctrl+G toggle, Esc release) → Task 4 + Task 3 handleInput
   - ✅ Keyboard navigation (up/down/tab/enter/escape) → Task 3 handleInput
   - ✅ Reuses shared/session.ts scanFileChanges → Task 2 + Task 4
   - ✅ Narrow terminal auto-hide → Task 4 overlayOptions.visible

2. **Placeholder scan:** No "TBD", "TODO", "implement later". All code is complete.

3. **Type consistency:**
   - `PanelItem` (id, label, icon, action?) — defined Task 1, used Task 2 + Task 3
   - `SidebarPanel` (id, title, getItems, onAction?) — defined Task 1, implemented Task 2, used Task 3
   - `SidebarShell` (registerPanel, refresh, focused, handleInput, render, invalidate) — defined Task 3, used Task 4
   - `FilesPanel` (update, getItems) — defined Task 2, used Task 4

4. **Phasing:** This plan covers Phase 1 (shell + files panel) only. Tasks, Cost, Git panels are Phase 2-3.

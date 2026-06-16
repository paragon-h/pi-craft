# Activity Sidebar — Design Doc (v2)

## Goal

A toggleable right-side sidebar that displays multiple activity panels (files, tasks, cost, git) stacked vertically, with interactive selection. Designed as an extensible panel system so new panels can be added without touching the core.

## Motivation

The progress-widget shows only counts. Users want a dedicated sidebar to see *details* — which files changed, task status, cost breakdown, git state — and interact with them (e.g., select a file to view its diff). This evolves beyond a single "file list" into a reusable activity dashboard.

## Approach

A new extension `activity-sidebar` with a **panel registry** architecture:

1. **SidebarShell** — the overlay component that manages panels, focus, navigation, and rendering
2. **Panel interface** — a contract each panel implements (`title`, `render`, `handleInput`, `items`)
3. **Built-in panels** — Files, Tasks, Cost, Git (registered at startup)
4. Overlay via `ctx.ui.custom({ overlay: true })`, `Ctrl+G` toggles visibility + focus

## Architecture

### Panel Interface

```typescript
interface PanelItem {
  id: string;
  label: string;       // display text (may include ANSI colors)
  icon?: string;       // emoji icon
  action?: () => void; // callback when Enter pressed (optional)
}

interface SidebarPanel {
  /** Unique panel identifier */
  id: string;
  /** Title shown in the panel header */
  title: string;
  /** Return current items for this panel */
  getItems(): PanelItem[];
  /** Called when the user selects an item and presses Enter */
  onAction?(item: PanelItem): void;
}
```

Panels are **data sources**, not components. The `SidebarShell` owns all rendering and input handling. This keeps panels simple — they just provide data and optional action callbacks.

### SidebarShell Component

Implements `Component` + `Focusable`.

**State:**
- `panels: SidebarPanel[]` — registered panels (in order)
- `focused: boolean` — set by TUI (Focusable interface)
- `activePanelIndex: number` — which panel is "active" for selection
- `activeItemIndex: number` — which item within the active panel is selected
- `tui: TUI` — for `requestRender()`
- `theme: Theme`

**Render:** Vertical stack of panels. Each panel:

```
╭──── 📁 文件变更 (3) ────╮
│ ✏️  packages/common/extensions/todo/index.ts     ← selected (highlighted)
│ 📖  packages/common/shared/session.ts
│ ✏️  packages/common/extensions/cost-tracker/index.ts
├──── 📋 任务 (2/5) ──────╮
│ 🔄  #2 Refactor todo extension
│ ⬜  #3 Add tests for shared module
├──── 💰 成本 ────────────╮
│ 本次: $1.23 (↑12K ↓3K)
│ 项目累计: $15.67 (8 sessions)
├──── 🌿 Git: main ───────╮
│  M packages/common/extensions/todo/index.ts
│  M packages/common/shared/session.ts
╰────────────────────────╯
```

- Active panel has a highlighted header (accent color) and a `▶` marker
- Selected item within active panel is highlighted (inverse video or accent bg)
- Inactive panels render normally (dimmed header)
- Each panel section separated by `├` divider
- Whole sidebar wrapped in a single `╭...╰` box

**handleInput:**
| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection up/down within current panel; at boundary, jump to prev/next panel |
| `Enter` | Trigger `onAction` on selected item (if it has one) |
| `Tab` | Jump to next panel |
| `Shift+Tab` | Jump to previous panel |
| `Escape` | Release focus back to editor (`handle.unfocus()`) |
| `Ctrl+G` | Toggle sidebar off entirely (`handle.setHidden(true)`) |

**invalidate:** Clear cached render.

### Focus Management

The overlay handle provides `focus()` / `unfocus()`:

```typescript
// Ctrl+G pressed (sidebar hidden):
handle.setHidden(false);
handle.focus();  // sidebar gets keyboard input

// Escape pressed (sidebar focused):
handle.unfocus();  // release input to editor, sidebar stays visible

// Ctrl+G pressed (sidebar visible):
handle.setHidden(true);
handle.unfocus();  // release input + hide
```

The `SidebarShell` implements `Focusable` — when `focused` becomes true, it shows the selection cursor; when false, it renders in a dimmed "passive" state (visible but not interactive).

### Built-in Panels

#### 1. Files Panel (`id: "files"`)

- **getItems():** from `scanFileChanges(sessionEntries)` → each file is a `PanelItem`
  - Write files: `icon: "✏️"`, `label: path`
  - Read files: `icon: "📖"`, `label: path`
- **onAction:** (future) could open diff view — for now, `notify` the file path as a placeholder
- **Update trigger:** `tool_execution_start` (write/edit/read)

#### 2. Tasks Panel (`id: "tasks"`)

- **getItems():** from `reconstructTodoState(sessionEntries)` → each task is a `PanelItem`
  - in_progress: `icon: "🔄"`, accent color
  - queued: `icon: "⬜"`
  - done: `icon: "✅"`, dimmed
  - cancelled: `icon: "❌"`, dimmed
- **onAction:** (future) could start/done a task — for now, `notify` task info
- **Update trigger:** todo tool results (detect via `tool_execution_end` with `toolName === "todo"`)

#### 3. Cost Panel (`id: "cost"`)

- **getItems():** Two items:
  - `本次: $X.XX (↑inK ↓outK tokens)` — from `computeSessionCost`
  - `项目累计: $X.XX (N sessions)` — from `scanProjectCost`
- **onAction:** none (informational)
- **Update trigger:** `turn_end`

#### 4. Git Panel (`id: "git"`)

- **getItems():** from async `git branch` + `git status --porcelain`
  - First item: branch name (`🌿 main`)
  - Subsequent items: one per `git status` line (` M path`, `?? path`, etc.)
- **onAction:** (future) could stage/unstage — for now, `notify`
- **Update trigger:** `tool_execution_start` (file operations may change git state)

### Extension Lifecycle

```
session_start →
  reconstruct all panel data from session branch
  create overlay (hidden), store handle
  unfocus (editor keeps input)

session_tree →
  reconstruct all panel data
  requestRender

tool_execution_start →
  update files panel (if write/edit/read)
  update git panel (async, debounced)
  requestRender

tool_execution_end (todo tool) →
  update tasks panel
  requestRender

turn_end →
  update cost panel
  requestRender

Ctrl+G (shortcut) →
  if hidden: setHidden(false) + focus()
  if visible + focused: setHidden(true) + unfocus()
  if visible + not focused: focus()
```

### Overlay Configuration

```typescript
ctx.ui.custom<void>(
  (tui, theme, _kb, _done) => {
    const shell = new SidebarShell(tui, theme);
    shell.registerPanel(new FilesPanel());
    shell.registerPanel(new TasksPanel());
    shell.registerPanel(new CostPanel());
    shell.registerPanel(new GitPanel());
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
      visible: (termWidth) => termWidth >= 80,
    },
    onHandle: (handle) => {
      overlayHandle = handle;
      handle.setHidden(true);  // start hidden
      handle.unfocus();         // editor keeps input
    },
  },
);
```

### Shortcut

```typescript
pi.registerShortcut(Key.ctrl("g"), {
  description: "Toggle activity sidebar",
  handler: async (ctx) => {
    if (!overlayHandle) return;
    if (overlayHandle.isHidden()) {
      overlayHandle.setHidden(false);
      overlayHandle.focus();
    } else if (overlayHandle.isFocused()) {
      overlayHandle.setHidden(true);
      overlayHandle.unfocus();
    } else {
      overlayHandle.focus();
    }
  },
});
```

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/common/extensions/activity-sidebar/index.ts` | Extension entry: lifecycle, shortcut, overlay setup |
| `packages/common/extensions/activity-sidebar/shell.ts` | `SidebarShell` component: rendering, focus, navigation |
| `packages/common/extensions/activity-sidebar/types.ts` | `SidebarPanel`, `PanelItem` interfaces + panel registry |
| `packages/common/extensions/activity-sidebar/panels/files.ts` | Files panel |
| `packages/common/extensions/activity-sidebar/panels/tasks.ts` | Tasks panel |
| `packages/common/extensions/activity-sidebar/panels/cost.ts` | Cost panel |
| `packages/common/extensions/activity-sidebar/panels/git.ts` | Git panel |

Reuses: `shared/session.ts`, `shared/project.ts`, `shared/types.ts`, `shared/format.ts`.

## Extensibility

Adding a new panel in the future:

1. Create `panels/my-panel.ts` implementing `SidebarPanel`
2. Register it in `index.ts`: `shell.registerPanel(new MyPanel())`
3. Done — no changes to shell or other panels

The shell handles all rendering, navigation, and focus uniformly.

## Edge Cases

- **No files changed:** Files panel shows `暂无文件变更`
- **No tasks:** Tasks panel shows `暂无任务`
- **Not a git repo:** Git panel shows `不在 git 仓库中`
- **Terminal < 80 cols:** Overlay auto-hides via `visible` callback
- **Sidebar visible but not focused:** Renders in passive (dimmed) mode, `Ctrl+G` focuses it
- **session_tree:** Reconstruct all panel data from new branch
- **Overlay not yet created:** Shortcut handler guards with `if (!overlayHandle) return`

## Implementation Phasing

This is a large feature. I recommend building in phases:

1. **Phase 1:** Shell + Files panel (proves the architecture, immediately useful)
2. **Phase 2:** Tasks panel + Cost panel (low effort, reuse existing shared logic)
3. **Phase 3:** Git panel (async, slightly more complex)
4. **Phase 4:** Interactive actions (onAction callbacks — diff view, task toggle, etc.)

The first implementation plan will cover Phase 1. Subsequent phases get their own plans.

## What We're NOT Building (YAGNI for Phase 1)

- No scroll within panels (if items exceed maxHeight, they're truncated with `... N more`)
- No panel reordering (fixed order: files, tasks, cost, git)
- No panel collapse/expand
- No drag-and-drop
- No config for panel visibility

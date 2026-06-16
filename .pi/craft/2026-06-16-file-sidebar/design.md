# File Sidebar Overlay — Design Doc

## Goal

Add a toggleable right-side sidebar that shows the live list of files changed in the current session, without blocking editor input.

## Motivation

The progress-widget shows only a file count (`📁 3 个文件`). Users want to see *which* files changed at a glance, without opening the full `/progress` dashboard. A right-side sidebar is the most intuitive placement.

## Approach

A new extension `file-sidebar` that:

1. Creates a persistent overlay via `ctx.ui.custom({ overlay: true })` with `anchor: "right-center"`
2. Holds the `OverlayHandle` from `onHandle`, immediately calls `unfocus()` so the editor keeps input
3. Starts hidden (`setHidden(true)`)
4. Registers a keyboard shortcut (`Ctrl+G`) to toggle `setHidden()`
5. Reuses `shared/session.ts`'s `scanFileChanges()` for the file list
6. Listens to `tool_execution_start` / `turn_end` to update state and `tui.requestRender()`
7. Reconstructs state on `session_start` / `session_tree`

## Architecture

### Component: `FileSidebarComponent`

Implements pi-tui `Component` interface (`render`, `handleInput`, `invalidate`).

**State:**
- `fileChanges: FileChange[]` — from `scanFileChanges()`
- `tui: TUI` — reference for `requestRender()`
- `theme: Theme`

**Render:** Box with title `📁 文件变更`, one line per file:
```
╭──── 📁 文件变更 ────╮
│ ✏️  packages/common/extensions/progress-widget/index.ts
│ 📖  packages/common/shared/session.ts
│ ✏️  packages/common/extensions/todo/index.ts
│
│ 3 个文件 | 2 写入 1 只读
╰────────────────────╯
```
- Write files (✏️) in `accent` color, read-only files (📖) in `dim`
- Paths truncated with `truncateToWidth(..., "...", true)` if too long
- Footer: total count + breakdown
- Empty state: `暂无文件变更`

**handleInput:** Escape / Ctrl+C → `setHidden(true)` via handle reference (not `done()` — we never close, only hide)

**invalidate:** Clear cached render (required by Component interface)

### Extension lifecycle

```
session_start → reconstruct state, create overlay (hidden), unfocus
session_tree  → reconstruct state, refresh
tool_execution_start (write/edit/read) → update fileChanges, requestRender
turn_end → (no-op for files, but kept for future)
Ctrl+G (shortcut) → toggle handle.setHidden()
```

### Overlay configuration

```typescript
ctx.ui.custom<void>(
  (tui, theme, _kb, done) => new FileSidebarComponent(tui, theme),
  {
    overlay: true,
    overlayOptions: {
      anchor: "right-center",
      width: "30%",
      minWidth: 35,
      maxHeight: "80%",
      margin: { right: 1 },
      visible: (termWidth) => termWidth >= 80,
    },
    onHandle: (handle) => {
      overlayHandle = handle;
      handle.setHidden(true);  // start hidden
      handle.unfocus();         // release input to editor
    },
  },
);
```

**Note:** `ctx.ui.custom()` is called without `await` — the overlay persists for the session lifetime. The component never calls `done()`, so it stays alive. Visibility is controlled entirely via `handle.setHidden()`.

### Toggle via shortcut

```typescript
pi.registerShortcut(Key.ctrl("g"), {
  description: "Toggle file sidebar",
  handler: async (ctx) => {
    if (!overlayHandle) return;
    overlayHandle.setHidden(!overlayHandle.isHidden());
  },
});
```

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/common/extensions/file-sidebar/index.ts` | New extension: sidebar component + lifecycle + shortcut |

No changes to existing files. Reuses `shared/session.ts` (`scanFileChanges`), `shared/types.ts` (`FileChange`), `shared/format.ts`.

## Edge Cases

- **No files changed yet:** Show "暂无文件变更" in the sidebar
- **Terminal < 80 cols:** Overlay auto-hides via `visible` callback
- **session_tree (branch switch):** Reconstruct file list from new branch entries
- **Overlay not yet created (shortcut pressed before session_start):** Guard with `if (!overlayHandle) return`

## What We're NOT Building (YAGNI)

- No scroll/selection interaction (sidebar is view-only)
- No diff content / line counts (just file paths + read/write status)
- No git status (A/M/D) — that's `/progress` dashboard's job
- No left-side variant
- No auto-open on first file change (user toggles manually)

---
name: pi-craft-conventions
description: pi-craft 开发约定 — TypeScript、pi 扩展 API、工作流模式、模块结构
---

# pi-craft 开发约定

## Tech Stack
- TypeScript, ES modules (`"type": "module"` in package.json)
- Node.js built-ins via `node:` prefix: `import * as fs from "node:fs"`
- pi extension SDK: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`
- No build step — TypeScript loaded directly by pi via jiti

## Project Structure
```
src/
├── index.ts              # Core extension entry point
├── core/                 # Pure logic, no UI dependency
│   ├── config.ts         # CraftConfig type + getCraftConfig() (globalThis cached)
│   ├── registry.ts       # Cross-extension singleton: initState() / getState()
│   ├── workflow-types.ts # WorkflowMeta, WorkflowStage, CRAFT_WORKFLOW_TYPE
│   ├── token-tracker.ts  # TokenTracker class + toExportJSON()
│   ├── subagent-manager.ts
│   ├── subagent-tool.ts
│   └── cwd-guard.ts      # checkCwdGuard() pure function
├── ui/                   # TUI rendering
│   ├── statusline.ts
│   ├── token-dashboard.ts
│   └── components/
├── capabilities/         # Optional, independently toggleable
│   ├── lsp/              # LSP diagnostics
│   ├── damage-control/   # YAML safety rules
│   ├── workflow-suggester/
│   ├── subagent-widget/
│   ├── todo/             # Persistent task list + clear
│   └── tilldone/         # Strict task discipline
├── scenarios/
│   └── coding/
│       ├── index.ts      # Coding scenario: 2 tools (init_workflow, complete_stage)
│       ├── agents/       # Subagent .md files
│       └── prompts/      # Prompt templates
└── skills/               # Stage skills (.md, LLM loaded on demand)
    ├── coding-workflow/
    ├── coding-stage-code-analysis/
    ├── coding-stage-requirement/
    ├── coding-stage-design/
    ├── coding-stage-testing/
    └── coding-stage-implementation/
```

## Architecture Principles

### Skills-driven workflow (not state machine)
There is no `WorkflowEngine` class. Workflow progression is LLM-driven:
- `init_workflow` → creates plans dir, auto-loads stage-1 skill
- `complete_stage` → gates output, persists meta, auto-loads next skill
- Stage instructions are `.md` skill files loaded on demand by LLM
- Extension code only provides 2 tools + session hooks

### Session entry ordering
Always iterate session branch in **reverse** to get latest state:
```typescript
const branch = ctx.sessionManager.getBranch();
for (let i = branch.length - 1; i >= 0; i--) {
  if (branch[i].type === "custom" && branch[i].customType === TYPE) return branch[i].data;
}
```
Reason: `appendEntry` adds to the end, so last match = current state.
This applies to `getMeta()` (workflow) and `loadFromSession()` (todo).

## Module Rules

### core/ — Pure logic
- No pi/UI imports. Only `node:*` and internal types.
- Export classes (TokenTracker, SubagentManager) and pure functions (checkCwdGuard).
- Define interfaces alongside classes.
- Config reader `getCraftConfig()` caches in `globalThis` for cross-extension sharing.

### ui/ — TUI rendering
- Imports from `@earendil-works/pi-tui` (Text, Container, Markdown, Spacer).
- Exports classes with `bind(ctx)` pattern for lazy context injection.
- Uses `ctx.ui.theme` for color access, never hardcoded ANSI.
- Status bar via `ctx.ui.setStatus(key, text)`; widget via `ctx.ui.setWidget(key, lines)`.

### capabilities/ — Independent extensions
- Each capability is a separate extension entry in `package.json` → `pi.extensions`.
- Toggled via `settings.json` → `craft.enableXxx`.
- Default-on: `isOn(config, key)` → `config[key] !== false`.
- Default-off: `isEnabled(config, key)` → `config[key] === true`.
- Gated at extension entry: `if (!isOn(config, "enableXxx")) return;`.

### scenarios/coding/ — Coding workflow
- Two registered tools: `init_workflow`, `complete_stage`.
- `getMeta(ctx)` → reads latest `CRAFT_WORKFLOW_TYPE` session entry.
- `gateFile(path)` → rejects files < 80 bytes or < 2 substantial lines.
- `session_before_compact` → injects workflow context summary.
- `session_start` → restores interrupted workflow (skips `done` stage).
- Calls `getState()?.resetTodo?.()` on workflow `done` to clean up todo list.

## Registry Pattern

```typescript
// core/registry.ts
export interface CraftState {
  tracker: TokenTracker;
  subagent: SubagentManager;
  statusline: StatuslineManager;
  parallelEnabled: boolean;
  cwdGuardEnabled: boolean;
  subagentEnabled: boolean;
  resetTodo?: () => void;  // Registered by todo capability, called on workflow done
}

// Core extension: initState({ tracker, subagent, ... })
// Todo capability: getState()?.resetTodo = () => { manager.clear(); ... }
// Coding scenario: getState()?.resetTodo?.()
```

## Extension Patterns

### Event handlers
```typescript
pi.on("event_name", async (event, ctx) => {
  // Return { block: true, reason: "..." } to block
  // Return { action: "handled" } to skip agent (input event)
  // Return undefined to pass through
});
```

### Commands
```typescript
pi.registerCommand("name", {
  description: "...",
  handler: async (args, ctx) => { /* args is string | undefined */ },
});
```

### Tools
```typescript
pi.registerTool({
  name: "tool_name",
  label: "Tool Label",
  description: "...",
  parameters: Type.Object({ /* typebox schema */ }),
  async execute(_id, params, _signal, _update, ctx) {
    return { content: [{ type: "text", text: "..." }], details: {} };
  },
});
```

### Auto-load next skill
```typescript
setTimeout(() => {
  pi.sendUserMessage(
    `Load \`/skill:stage-${name}\` and continue.`,
    { deliverAs: "steer" },
  );
}, 0);
```

### Persistence
```typescript
pi.appendEntry("custom-type", data);  // Write to session
// Restore: ctx.sessionManager.getBranch() — iterate in reverse
```

## Code Style
- Use JSDoc `/** */` for public API, `//` for inline comments.
- Section headers: `// ─── Section Name ──────────────────────────`
- Separator headers: `// ════════════════ Section ─═══════════════`
- Prefer `const` over `let`; `let` only when reassignment needed.
- Type imports: `import type { ... }` for type-only imports.
- Error handling: try/catch with `/* ignore */` comment for intentional ignores.
- Use `setTimeout(() => pi.sendUserMessage(...), 0)` to defer after event handlers.
- Config pattern: `config?.setting !== false` for default-on; `=== true` for default-off.

## Gating Pattern

```typescript
function gateFile(fullPath: string): string | null {
  try {
    const stat = fs.statSync(fullPath);
    if (stat.size < 80) return `file is only ${stat.size} bytes`;
    const head = fs.readFileSync(fullPath, "utf-8").slice(0, 200);
    if (head.split("\n").filter(l => l.trim().length > 20).length < 2)
      return "file appears to be a stub";
    return null;
  } catch (err: any) {
    if (err.code === "ENOENT") return "file not found";
    throw err;
  }
}
```

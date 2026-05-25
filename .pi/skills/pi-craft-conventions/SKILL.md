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
├── index.ts              # Extension entry point (register commands, events, init)
├── core/                 # Pure logic, no UI dependency
│   ├── workflow-engine.ts
│   ├── token-tracker.ts
│   ├── subagent-manager.ts
│   ├── subagent-tool.ts
│   └── cwd-guard.ts
├── ui/                   # TUI rendering
│   ├── statusline.ts
│   ├── token-dashboard.ts
│   └── components/
├── capabilities/         # Optional capability extensions
│   └── lsp/              # LSP diagnostics/hover/definition/references
└── scenarios/            # Workflow scenarios and stages
    ├── coding/
    │   ├── index.ts      # Scenario extension entry (default export)
    │   ├── develop/      # Develop sub-scenario
    │   │   ├── index.ts  # Orchestration: register() + start()
    │   │   └── stages/   # Per-stage config (prompt, tools, rules)
    │   ├── review/       # Review sub-scenario
    │   ├── agents/       # Subagent definitions (.md with YAML frontmatter)
    │   └── prompts/      # Stage-specific prompt templates
    ├── travel/index.ts   # Placeholder scenario
    ├── stock/index.ts    # Placeholder scenario
    └── knowledge/index.ts # Placeholder scenario
```

## Module Rules

### core/ — Pure logic
- No pi/UI imports. Only `node:*` and internal types.
- Export classes (WorkflowEngine, TokenTracker) and pure functions (checkCwdGuard).
- Define interfaces alongside classes (WorkflowState, SubagentConfig).

### ui/ — TUI rendering
- Imports from `@earendil-works/pi-tui` (Text, Container, Markdown, Spacer).
- Exports classes with `bind(ctx)` pattern for lazy context injection.
- Uses `ctx.ui.theme` for color access, never hardcoded ANSI.
- Status bar via `ctx.ui.setStatus(key, text)`; keys in `STATUS_KEYS` const.

### scenarios/ — Workflow scenarios
- Each scenario is a pi extension: `index.ts` exports `default function(pi: ExtensionAPI)`.
- Sub-scenarios (develop, review) export `register(dc)` to set up event handlers and `start(dc, ...)` to kick off.
- Stages export consts: `stage`, `label`, `readOnly`, `tools`, `documentSuffix`, `prompt`, plus `register()`.
- Stage prompts use `PLANS_DIR` and `DOCUMENT_PATH` placeholders replaced at runtime via `buildStagePrompt()`.
- State machine driven by `WorkflowEngine.transition()`, `[STAGE_COMPLETE]` detection in `agent_end`.
- Config-gated via `isOn(config, "enableXxx")` / `isEnabled(config, "enableXxx")`.

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
  handler: async (args, ctx) => { /* ... */ },
});
```

### Tools
```typescript
pi.registerTool({
  name: "tool_name",
  label: "Tool Label",
  description: "...",
  parameters: Type.Object({ /* typebox schema */ }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return { content: [{ type: "text", text: "..." }], details: {} };
  },
});
```

### Persistence
```typescript
pi.appendEntry("custom-type", data);  // Write to session
// Restore in session_start: ctx.sessionManager.getBranch()
```

## Code Style
- Use JSDoc `/** */` for public API, `//` for inline comments.
- Section headers: `// ─── Section Name ──────────────────────────`
- Prefer `const` over `let`; `let` only when reassignment needed.
- Type imports: `import type { ... }` for type-only imports.
- Error handling: try/catch with `/* ignore */` comment for intentional ignores.
- Use `setTimeout(() => pi.sendUserMessage(...), 0)` to defer after event handlers.
- Config pattern: `config?.setting !== false` for default-on; `=== true` for default-off.

## Testing
- Test alongside implementation in the same task.
- Verify with `npx tsc --noEmit` for type checking.
- Never create a separate "add tests" task — tests are part of each implementation task.

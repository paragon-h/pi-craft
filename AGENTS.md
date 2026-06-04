# pi-craft

Pi Coding Agent extension — automated development workflows with subagents, token tracking, and provider optimization.

## Overview
pi-craft is a multi-extension package for Pi that provides a modular plugin architecture. The **Core** extension supplies shared infrastructure (token tracking, subagent system, statusline, security guards), **Capability** extensions provide independent toggleable features, and the **Coding Scenario** drives skill-based development workflows.

### Extension Architecture
Users can selectively enable extensions via `settings.json` package filtering:

```jsonc
// Work computer: Core + Coding only
{ "packages": [{ "source": "pi-craft", "extensions": ["./src/index.ts", "./src/scenarios/coding/index.ts"] }] }

// Default: all extensions load
{ "packages": ["pi-craft"] }
```

## Tech Stack
- TypeScript, ES modules (`"type": "module"`)
- No build step — loaded directly by pi via jiti
- Runtime deps: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, `typebox`
- Node.js built-ins via `node:` prefix

## Architecture

```
src/
├── index.ts                              # 🔧 Core Extension (always loaded)
│                                         #   TokenTracker, SubagentManager, StatuslineManager
│                                         #   /tokens dashboard & --export, cwd guard, safety interlocks
├── core/
│   ├── registry.ts                       # Cross-extension shared state singleton (incl. resetTodo callback)
│   ├── config.ts                         # CraftConfig types + getCraftConfig() cached config reader
│   ├── workflow-types.ts                 # Workflow metadata types (lightweight, no state machine)
│   ├── token-tracker.ts                  # Token usage + cache hit rate + toExportJSON() export
│   ├── subagent-manager.ts               # Subagent discovery, spawn, execution
│   ├── subagent-tool.ts                  # Subagent tool registration + TUI
│   └── cwd-guard.ts                      # Write operation boundary enforcement
├── ui/
│   ├── statusline.ts                     # Enhanced status bar
│   ├── token-dashboard.ts                # /tokens full-screen overlay
│   └── components/
│       └── workflow-progress.ts          # Stage progress bar widget
├── capabilities/                         # Optional, independently toggleable
│   ├── lsp/                              # Multi-language server diagnostics
│   ├── damage-control/                   # YAML safety rules engine
│   ├── workflow-suggester/               # Dev intent detection + proactive suggestions (CN/EN)
│   ├── subagent-widget/                  # Real-time subagent progress TUI widget
│   ├── todo/                             # Persistent task list + clear action
│   └── tilldone/                         # Strict task discipline (opt-in, default off)
└── scenarios/
    └── coding/
        ├── index.ts                      # 🔌 Coding Scenario — 2 tools + session persistence
        │                                  #   init_workflow: create plans dir, auto-load stage-1 skill
        │                                  #   complete_stage: gate output, persist meta, auto-load next skill
        │                                  #   session_before_compact: preserve workflow context
        │                                  #   session_start: restore interrupted workflow
        ├── agents/                        # Built-in subagents (scout/architect/implementer/reviewer)
        └── prompts/                       # Prompt templates
        └── skills/                        # Stage skills loaded on demand
            ├── coding-workflow/SKILL.md
            ├── coding-stage-code-analysis/SKILL.md
            ├── coding-stage-requirement/SKILL.md
            ├── coding-stage-design/SKILL.md
            ├── coding-stage-testing/SKILL.md
            └── coding-stage-implementation/SKILL.md
```

### Extension Responsibilities

#### Core Extension (`src/index.ts`)
| Feature | Description |
|---------|-------------|
| Token tracking | `message_end` → TokenTracker → persistence; `toExportJSON()` for export |
| `/tokens` command | Full-screen dashboard + `/tokens --export` JSON export |
| `ctrl+shift+t` | Quick token summary |
| Subagent tool | Single agent delegation with TUI rendering |
| CWD guard | Blocks write/edit/bash-write outside project directory |
| Safety interlocks | Dangerous commands (sudo/kill/docker), sensitive file writes |
| Statusline base | Tokens, parallel mode, guard indicator |

#### Coding Scenario Extension (`src/scenarios/coding/index.ts`)
| Feature | Description |
|---------|-------------|
| `init_workflow` tool | Creates plans dir, sets session name, records requirement, auto-loads skill |
| `complete_stage` tool | Gates output file, persists metadata, labels session tree, auto-loads next skill |
| Stage gating | Rejects files < 80 bytes or < 2 substantial lines (stub detection) |
| Todo cleanup | Calls `resetTodo()` on workflow done — auto-clears all tasks |
| Compaction hook | `session_before_compact` preserves workflow context summary |
| Session restore | `session_start` restores interrupted workflows (skips "done" stage) |
| Built-in agents | Lazy-loads scout, architect, implementer, reviewer |

### Shared State (`src/core/registry.ts`)
Core initializes managers and calls `initState()`. Scenarios and capabilities read via `getState()`.
Since all extensions share the same package module root via jiti, imports resolve to the same singleton.
The registry also provides a `resetTodo` callback registered by the Todo capability and invoked by
the Coding scenario on workflow completion.

## Commands
- `/tokens` — Token usage dashboard (Tab for detail)
- `/tokens --export` — Export full token stats as JSON to `.pi/craft/tokens-{datetime}.json`
- `/coding:status` — Show current workflow status
- `Ctrl+Shift+T` — Quick token summary popup

## Key Design Decisions

### Skills-driven workflow (no state machine)
Workflow progression is LLM-driven, not code-driven. The extension only provides `init_workflow` and
`complete_stage` tools. Stage instructions live in `.md` skill files loaded by the LLM on demand.
This eliminates the old `WorkflowEngine` class and `develop/`/`review/` scenario directories.

### Session entry ordering
Both `getMeta()` (workflow) and `loadFromSession()` (todo) iterate the session branch in **reverse**
to get the latest matching entry. Appending always adds to the end, so the last match is current state.

### Gating on stage completion
`complete_stage` validates output files before accepting them — blocks stub files to prevent
workflow corruption from incomplete AI outputs.

## Config
In `settings.json` under `craft`:
- `enableSubagent` (default: true) — Subagent master switch
- `enableParallelSubagent` (default: false) — Spawn isolated pi processes for parallel execution
- `enableCwdGuard` (default: true) — Restrict write/edit/bash-write to project working directory
- `enableLsp` (default: true) — Multi-language server diagnostics
- `enableDamageControl` (default: true) — YAML safety rules engine
- `enableWorkflowSuggester` (default: true) — Proactive workflow suggestions (CN/EN)
- `enableSubagentWidget` (default: true) — Real-time subagent progress TUI widget
- `enableTodo` (default: true) — Persistent task list with session survival
- `enableTilldone` (default: false) — Strict task discipline (opt-in)

## Development
```bash
# Local load (for development)
cd ~/Workspace/p/code/pi-craft
pi -e .

# Install from local path (for testing)
pi install /Users/you/Workspace/p/code/pi-craft

# Install from git
pi install git:github.com/paragon-h/pi-craft
```

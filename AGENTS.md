# pi-craft

Pi Coding Agent extension — automated development workflows with subagents, token tracking, and provider optimization.

## Overview
pi-craft is a multi-extension package for Pi that provides a modular plugin architecture. The **Core** extension supplies shared infrastructure (token tracking, subagent system, statusline, security guards), and **Scenario** extensions plug in independently for different workflows.

### Scenario Plugin Architecture
Users can selectively enable scenarios via `settings.json` package filtering:

```jsonc
// Work computer: Core + Coding only
{ "packages": [{ "source": "pi-craft", "extensions": ["./src/index.ts", "./src/scenarios/coding/index.ts"] }] }

// Life computer: Core + Travel + Stock
{ "packages": [{ "source": "pi-craft", "extensions": ["./src/index.ts", "./src/scenarios/travel/index.ts", "./src/scenarios/stock/index.ts"] }] }

// Default: all extensions load (same as today)
{ "packages": ["pi-craft"] }
```

## Tech Stack
- TypeScript, ES modules (`"type": "module"`)
- No build step — loaded directly by pi via jiti
- Runtime deps: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`
- Node.js built-ins via `node:` prefix

## Architecture

```
src/
├── index.ts                              # 🔧 Core Extension (always loaded)
│                                         #   TokenTracker, SubagentManager, StatuslineManager
│                                         #   /tokens dashboard, cwd guard, safety interlocks
├── core/
│   ├── registry.ts                       # 🆕 Cross-extension shared state singleton
│   ├── workflow-engine.ts                # Generic state machine with persistence
│   ├── token-tracker.ts                  # Token usage + cache hit rate stats
│   ├── subagent-manager.ts               # Subagent discovery, spawn, execution
│   ├── subagent-tool.ts                  # Subagent tool registration + TUI
│   └── cwd-guard.ts                      # Write operation boundary enforcement
├── ui/
│   ├── statusline.ts                     # Enhanced status bar
│   ├── token-dashboard.ts                # /tokens full-screen overlay
│   └── components/
│       └── workflow-progress.ts          # Stage progress bar widget
└── scenarios/
    ├── coding/
    │   ├── index.ts                      # 🔌 Coding Scenario Extension
    │   │                                  #   /craft:coding, /craft coding|review|status...
    │   │                                  #   Stage prompt injection, [STAGE_COMPLETE] detection
    │   ├── develop/index.ts + stages/     # Develop sub-scenario state machine
    │   ├── review/index.ts + stages/      # Review sub-scenario state machine
    │   ├── agents/                        # Built-in subagents (.md with YAML frontmatter)
    │   └── prompts/                       # Prompt templates
    ├── travel/index.ts                    # 🔌 Travel Scenario (placeholder)
    ├── stock/index.ts                     # 🔌 Stock Scenario (placeholder)
    └── knowledge/index.ts                 # 🔌 Knowledge Scenario (placeholder)
```

### Extension Responsibilities

#### Core Extension (`src/index.ts`)
| Feature | Description |
|---------|-------------|
| Token tracking | `message_end` → TokenTracker → persistence |
| `/tokens` command | Full-screen dashboard + print mode |
| `ctrl+shift+t` | Quick token summary |
| Subagent tool | Single/parallel/chain with TUI rendering |
| CWD guard | Blocks writes outside project directory |
| Safety interlocks | Dangerous commands (sudo/kill/docker), sensitive file writes |
| Statusline base | Tokens, parallel mode, guard indicator |
| Workflow restore | Recovers engine state to registry (scenarios re-register handlers) |

#### Coding Scenario Extension (`src/scenarios/coding/index.ts`)
| Feature | Description |
|---------|-------------|
| `/craft:coding` | Interactive requirement input with auto slug generation |
| `/craft coding <req> [slug]` | One-shot workflow start |
| `/craft review [target]` | Code review workflow |
| `/craft status\|resume\|rollback\|abort` | Workflow management |
| Stage prompts | `before_agent_start` injects stage-specific system prompts |
| Stage transitions | `agent_end` detects `[STAGE_COMPLETE]` |
| Read-only enforcement | Blocks write/edit in analysis/design phases |
| Built-in agents | Loads scout, architect, implementer, reviewer |
| Progress widget | `ctx.ui.setWidget("craft-progress", ...)` |

### Shared State (`src/core/registry.ts`)
Core initializes managers and calls `initState()`. Scenarios read via `getState()`. Since all extensions share the same package module root, imports resolve to the same singleton instance.

## Commands
- `/tokens` — Token usage dashboard (Core)
- `/craft:coding` — Enter coding workflow mode (Coding scenario)
- `/craft coding <req> [slug]` — Start coding workflow
- `/craft review [target]` — Code review workflow
- `/craft status | resume | rollback | abort` — Workflow management
- `/travel` — Travel scenario (placeholder)
- `/stock` — Stock analysis scenario (placeholder)
- `/knowledge` — Knowledge management scenario (placeholder)

## Config
In `settings.json` under `craft`:
- `enableSubagent` (default: true) — Subagent master switch
- `enableParallelSubagent` (default: false) — Spawn isolated pi processes for parallel execution
- `enableCwdGuard` (default: true) — Restrict writes to project working directory

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

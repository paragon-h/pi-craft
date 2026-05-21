# pi-craft

Pi Coding Agent extension — automated development workflows with subagents, token tracking, and provider optimization.

## Overview
pi-craft is a mono-repo extension for Pi that provides multi-stage development workflows (code analysis → requirement clarification → design → testing → implementation → completion). It includes a subagent system with scout/architect/implementer/reviewer roles, token consumption tracking with cache hit rate monitoring, and security guards (cwd write protection + dangerous command confirmations).

## Tech Stack
- TypeScript, ES modules (`"type": "module"`)
- No build step — loaded directly by pi via jiti
- Runtime deps: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`
- Node.js built-ins via `node:` prefix

## Key Files
- `src/index.ts` — Extension entry point: registers commands, events, initializes managers
- `src/core/workflow-engine.ts` — State machine for multi-stage workflows with persistence
- `src/core/token-tracker.ts` — Token usage tracking with model/provider/session stats
- `src/core/subagent-manager.ts` — Subagent discovery, spawn, and execution
- `src/core/subagent-tool.ts` — Subagent tool registration + TUI rendering
- `src/core/cwd-guard.ts` — Write operation boundary enforcement
- `src/ui/statusline.ts` — Enhanced status bar (workflow stage, tokens, parallel mode, guard)
- `src/ui/token-dashboard.ts` — Full-screen token dashboard overlay (/tokens)
- `src/workflows/coding/` — Coding scenario with develop + review sub-scenarios
- `src/workflows/coding/develop/stages/` — Per-stage config (prompt, tools, rules)
- `src/workflows/coding/agents/` — Subagent definitions (.md with YAML frontmatter)

## Architecture
```
src/core/     → Pure logic, no UI dependency
src/ui/       → TUI rendering (uses @earendil-works/pi-tui)
src/workflows/ → Workflow scenarios and stage configurations
```

Events drive the workflow: `before_agent_start` injects stage-specific system prompts, `agent_end` detects `[STAGE_COMPLETE]` to transition stages, `tool_call` enforces read-only rules and cwd guard.

## Commands
- `/craft:coding` — Enter coding workflow mode (type requirement, slug auto-generated)
- `/craft coding <req> [slug]` — Legacy one-shot command
- `/craft review` — Code review workflow
- `/craft status | resume | rollback | abort | scenarios` — Workflow management
- `/tokens` — Token dashboard

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

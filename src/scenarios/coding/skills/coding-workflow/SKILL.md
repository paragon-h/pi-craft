---
name: coding-workflow
description: Multi-phase structured development workflow. Use when the user asks to build a feature, implement a change, or develop new functionality that requires planning. Coordinates independent stage skills through init_workflow and complete_stage tools.
---

# Coding Workflow

Orchestrator for multi-phase feature development. Each phase is an independent
skill — the orchestrator handles sequencing and transitions.

## When to Use (Trigger)

Load this skill when the user says:
- "Implement ..." / "Build ..." / "Create ..." / "Add ..." (new features)
- "Refactor ..." / "Rewrite ..." (substantial changes)
- Any request that involves multiple files and requires planning

### Don't load for:
- Bug fixes (single file, well-understood)
- Trivial changes (add a log line, rename a variable)
- Questions about how code works

## How It Works

1. Call `init_workflow(topic, requirement)` — creates `.pi/craft/plans/{date}-{topic}/`
2. Load each stage skill in order via explicit `/skill:stage-{name}` commands
3. After each stage, call `complete_stage(next_stage, output_file)`
4. `complete_stage` verifies output, labels the session tree, loads the next skill

## Stage Pipeline

### Recommended Path (with pi-craft superpowers)

| # | Skill | Purpose |
|---|-------|---------|
| 1 | `/skill:stage-code-analysis` | Analyze codebase structure & relevant code |
| 2 | `/skill:brainstorming` | Clarify requirements, explore approaches, present design (HARD-GATE: no code before approval) |
| 3 | `/skill:writing-plans` | Decompose design into bite-sized (2-5min) implementation tasks |
| 4 | `/skill:subagent-driven-development` | Execute via fresh subagent per task + two-stage review |
| 5 | `/skill:finishing-a-development-branch` | Verify, present merge/PR options, clean up |

### Classic Path (original stage skills)

| # | Skill | Purpose |
|---|-------|---------|
| 1 | `/skill:stage-code-analysis` | Analyze codebase structure & relevant code |
| 2 | `/skill:stage-requirement` | Clarify requirements via structured Q&A |
| 3 | `/skill:stage-design` | Architecture & component design |
| 4 | `/skill:stage-testing` | Testing strategy & approval mode |
| 5 | `/skill:stage-implementation` | Write code with task tracking |

### Additional Skills

- `/skill:test-driven-development` — RED-GREEN-REFACTOR iron law (use during implementation)
- `/skill:systematic-debugging` — Root cause analysis before fixes (use for bugs)
- `/skill:verification-before-completion` — Evidence before claims (use before declaring done)

Both paths are valid. The recommended path adds design gating, precision planning, and review quality gates.
The classic path uses the original independent stage skills without gates.

## Standalone Usage

Each stage skill can be used independently without a full workflow:
- `/skill:stage-code-analysis` — analyze any codebase
- `/skill:brainstorming` — design exploration without committing to a workflow
- `/skill:stage-design` — design architecture for an understood problem
- `/skill:stage-implementation` — jump to coding with existing design
- `/skill:test-driven-development` — enforce TDD on any coding task

## Navigation

- `/tree` — see 📌 markers at each stage boundary
- Navigate to any label — rollback to that stage
- `/fork` at any label — branch to try alternative approaches

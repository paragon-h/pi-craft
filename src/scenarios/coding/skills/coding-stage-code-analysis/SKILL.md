---
name: stage-code-analysis
description: Analyze project structure, tech stack, and relevant code areas. Use when the user asks to understand or explore a codebase, not when they want to build something. For building features, use coding-workflow instead.
disable-model-invocation: true
---

# Stage: Code Analysis

Analyze codebase structure and relevant code areas. Can be used standalone
or as Phase 1 of the coding workflow.

## Standalone Usage

Load this skill directly when the user asks to:
- "Analyze this project" / "What's the tech stack?"
- "Explore the codebase" / "How is this structured?"
- "Find all code related to X"

No workflow initialization needed. Just analyze and report.

## Workflow Usage (Phase 1 of 5)

When loaded by the coding-workflow orchestrator:
- The plans directory is already created by `init_workflow`
- Write the analysis to the plans directory
- Call `complete_stage` when done

## Output

If standalone: report directly to the user.
If in workflow: write to the plans directory (path from `init_workflow`).

## Parallel Scouts

If `enableParallelSubagent` is enabled:
- Scout 1: Root scan — package.json, build config, tech stack
- Scout 2: Architecture mapping — directory structure, patterns
- Scout 3: Code search — grep for relevant files
- Scout 4: Data layer — schemas, ORM models, API routes

## Workflow Completion

```
complete_stage({ next_stage: "requirement", output_file: ".pi/craft/plans/2026-06-01-user-auth/code-analysis.md" })
```

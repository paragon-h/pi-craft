---
name: stage-testing
description: Define testing strategy and approach for a feature. Use when the user asks to plan testing, choose a test framework, or decide on testing scope. For full feature development, use coding-workflow instead.
disable-model-invocation: true
---

# Stage: Testing Strategy

Define testing approach and implementation approval mode. Can be used standalone
or as Phase 4 of the coding workflow.

## Standalone Usage

Load this skill when the user asks to:
- "What testing approach should I use for X?"
- "Plan the testing strategy for this feature"
- "Should I use unit tests or e2e tests?"

Ask the user to choose approach and approval mode. Document the decision.

## Workflow Usage (Phase 4 of 5)

When loaded by the coding-workflow orchestrator:
- Read `design.md` from the plans directory
- Write testing plan to the plans directory
- Call `complete_stage` when done

## Process

1. Read the design document
2. Ask user to choose: `unit` / `e2e` / `both` / `skip`
3. Ask user to choose approval mode: `auto` / `per_task` / `on_demand`
4. Document: approach, mode, scope, framework, key test scenarios

## Workflow Completion

```
complete_stage({ next_stage: "implementation", output_file: ".pi/craft/plans/2026-06-01-user-auth/testing-plan.md" })
```

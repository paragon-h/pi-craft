---
name: stage-implementation
description: Implement features with task tracking and approval workflows. Use when the user has a ready design and wants to start coding. For full feature development from scratch, use coding-workflow instead.
disable-model-invocation: true
---

# Stage: Implementation

Write code with task tracking and approval modes. Can be used standalone
or as Phase 5 of the coding workflow.

## Standalone Usage

Load this skill when the user asks to:
- "Implement X based on this design"
- "Start coding, I already have the design ready"
- "Execute the implementation plan"

Create `tasks.md` and `todos.md`. Track progress. No workflow needed.

## Workflow Usage (Phase 5 of 5)

When loaded by the coding-workflow orchestrator:
- Read `design.md` and `testing-plan.md` from plans directory
- Write `tasks.md` and `todos.md` to plans directory
- Update files as tasks complete

## Approval Mode

**`auto`** — Execute continuously. Pause only if stuck.
**`per_task`** — Confirm before each task.
**`on_demand`** — Pause when `[APPROVAL_NEEDED]` is used.

## Safety

- Max 5 consecutive auto-continues, then pause to ask user
- If stuck (errors, confusion, need more info), STOP and ask
- Update tasks.md and todos.md in real-time

## Workflow Completion

```
complete_stage({ next_stage: "done", output_file: ".pi/craft/plans/2026-06-01-user-auth/tasks.md" })
```

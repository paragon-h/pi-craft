---
name: stage-design
description: Create detailed software architecture and component design. Use when the user asks to design architecture, plan component structure, or create technical design documents. For full feature development, use coding-workflow instead.
disable-model-invocation: true
---

# Stage: Architecture Design

Create detailed architecture and component design. Can be used standalone
or as Phase 3 of the coding workflow.

## Standalone Usage

Load this skill when the user asks to:
- "Design the architecture for X"
- "How should I structure this module?"
- "Create a design document for Y"

Call the `architect` subagent. Present the design for feedback. No workflow needed.

## Workflow Usage (Phase 3 of 5)

When loaded by the coding-workflow orchestrator:
- Read `code-analysis.md` and `requirement.md` from plans directory
- Write design to the plans directory
- **Do NOT write any code** — implementation is a separate phase

## Process

1. Read prerequisite documents
2. Call `architect` subagent
3. Present: architecture overview, component breakdown, data flow, API contracts, file change list
4. Incorporate feedback and write final design

## Workflow Completion

```
complete_stage({ next_stage: "testing", output_file: ".pi/craft/plans/2026-06-01-user-auth/design.md" })
```

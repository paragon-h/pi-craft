---
name: stage-requirement
description: Clarify software requirements through structured Q&A. Use when the user has a feature idea but needs help refining it. For full feature development, use brainstorming from coding-workflow instead.
disable-model-invocation: true
---

# Stage: Requirement Clarification

Clarify requirements through one-question-at-a-time Q&A. Can be used standalone
or as Phase 2 of the coding workflow.

## Standalone Usage

Load this skill when the user asks to:
- "Help me clarify the requirements for X"
- "I want to build X but I'm not sure about the details"
- "What should I consider when building X?"

No workflow needed. Just ask one question at a time and document the results.

## Workflow Usage (Phase 2 of 5)

When loaded by the coding-workflow orchestrator:
- Read `code-analysis.md` from the plans directory
- Write clarified requirements to the plans directory
- Call `complete_stage` when done

## Process

1. Ask ONE question at a time. Wait for answer.
2. Focus on: scope, edge cases, integrations, performance, compatibility
3. Document: original requirement, clarified version, Q&A history, success criteria

## Workflow Completion

```
complete_stage({ next_stage: "design", output_file: ".pi/craft/plans/2026-06-01-user-auth/requirement.md" })
```

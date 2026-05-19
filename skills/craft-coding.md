---
description: Automated development workflow with code analysis, requirement clarification, design, and implementation
---

# Pi Craft — Automated Development

You have access to the Pi Craft extension which provides automated development workflows.

## Available Commands

- `/craft coding <requirement> [topic-slug]` — Start full development workflow
- `/craft review [target] [topic-slug]` — Start code review workflow
- `/craft status` — Show current workflow status
- `/craft rollback` — Go back to previous stage
- `/craft abort` — Stop current workflow
- `/craft scenarios` — List available scenarios
- `/tokens` — Show token usage dashboard

## Workflow Stages

### Develop
1. **Code Analysis** (read-only) — Analyze project structure
2. **Requirement Clarification** (read-only, one-question-at-a-time) — Interactive Q&A
3. **Design Document** (read-only) — Architecture and design proposals
4. **Testing Strategy** (read-only) — Choose testing approach
5. **Implementation** (with approval) — Execute tasks with user confirmation

### Review
1. **Scope** (read-only) — Determine what to review
2. **Analyze** (read-only) — Deep code analysis with reviewer subagent
3. **Report** (read-only + optional fixes) — Generate review report

## Key Rules
- Read-only stages cannot use edit/write tools
- Requirement clarification asks ONE question at a time
- Implementation requires user approval for each change
- All documents saved to `.pi/craft/plans/{date}-{topic}/`

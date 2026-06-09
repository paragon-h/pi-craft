---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks — dispatches fresh subagent per task with two-stage review (spec compliance then code quality)
---

# Subagent-Driven Development

Execute a plan by dispatching a fresh subagent per task, with two-stage review: spec compliance first, then code quality.

**Core principle:** Fresh subagent per task + two-stage review = high quality, fast iteration.

**Continuous execution:** Do not pause between tasks to check in. Execute all tasks without stopping. Only stop for: BLOCKED status you cannot resolve, ambiguity that prevents progress, or all tasks complete.

## The Process

```
1. Read the implementation plan (plan.md)
2. Extract ALL tasks with full text and context
3. Create todo items for each task

For each task:
  4a. Dispatch implementer subagent with full task text
      → Subagent implements, tests, commits, self-reviews
      → Reports: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
  
  4b. If implementer asks questions → answer → re-dispatch
  
  4c. Dispatch spec-reviewer subagent
      → Reviews: does code match spec? nothing missing? nothing extra?
      → Issues found → implementer fixes → re-review (step 4c)
  
  4d. Spec ✅ → Dispatch code-quality-reviewer subagent
      → Reviews: clean? tested? maintainable? follows patterns?
      → Issues found → implementer fixes → re-review (step 4d)
  
  4e. Both reviews pass → mark task complete

After all tasks:
  5. Dispatch final code-quality-reviewer for entire implementation
  6. Load `/skill:finishing-a-development-branch`
```

## Task Dispatch Template

When dispatching implementer, provide the FULL task text (don't make subagent read the plan file):

```
subagent(
  agent: "implementer",
  task: """
  Task N: [task name]
  
  [FULL TEXT of task — paste from plan, including code snippets]
  
  Scene context: [how this fits into the larger feature, dependencies]
  Working directory: [cwd]
  """
)
```

## Handling Implementer Status

| Status | Meaning | Action |
|--------|---------|--------|
| DONE | Completed, self-reviewed, committed | Proceed to spec review |
| DONE_WITH_CONCERNS | Completed but has doubts | Read concerns. If about correctness → address. If observations (e.g. "file getting large") → note and proceed |
| NEEDS_CONTEXT | Needs information not provided | Provide context → re-dispatch |
| BLOCKED | Cannot complete | 1. More context? → provide and re-dispatch 2. Task needs more reasoning? → re-dispatch with stronger model 3. Too large? → break into smaller tasks 4. Plan is wrong? → escalate to user |

**Never** ignore a BLOCKED status or force the same model to retry without changes.

## Review Dispatch Templates

### Spec Compliance Review

```
subagent(
  agent: "spec-reviewer",
  task: """
  Review spec compliance for Task N: [task name]
  
  ## Specification
  [FULL TEXT of task requirements from plan]
  
  ## Implementer Report
  [Paste implementer's complete report]
  
  Verify that what was built matches what was requested. Check for missing
  requirements and extra/unnecessary work. Read the actual code — do NOT
  trust the implementer's report.
  
  Files to check: [list from implementer report]
  """
)
```

### Code Quality Review

**Only dispatch after spec compliance ✅**

```
subagent(
  agent: "code-quality-reviewer",
  task: """
  Review code quality for Task N: [task name]
  
  ## What Was Built
  [Implementer's report summary]
  
  ## Files Changed
  [List from implementer report]
  
  Base commit: [before task]
  Head commit: [after task]
  
  Review for: correctness, clarity, file responsibility, pattern compliance,
  test quality, simplicity, decomposition.
  
  Do NOT re-check spec compliance. Focus only on code quality.
  """
)
```

## Model Selection

Use the least powerful model for each role:

| Role | Model | Reason |
|------|-------|--------|
| Mechanical implementation (1-2 files, clear spec) | Fast/cheap | Most tasks are mechanical |
| Integration implementation (multi-file, coordination) | Standard | Needs broader understanding |
| Spec compliance review | Fast/cheap | Mechanical line-by-line comparison |
| Code quality review | Standard | Needs pattern recognition |
| Final review | Strongest | Global perspective |

## Red Flags

**Never:**
- Start implementation without reading the plan first
- Skip either review (spec OR quality)
- Proceed with unfixed review issues
- Dispatch multiple implementers in parallel (conflict risk)
- Make subagent read the plan file (provide full text)
- Skip scene-setting context
- Ignore subagent questions
- Start code quality review before spec compliance is ✅
- Move to next task while either review has open issues
- Accept "close enough" on spec compliance

## Required Sub-Skills

Subagents should use:
- `/skill:test-driven-development` — Every implementer follows TDD

After all tasks complete:
- `/skill:finishing-a-development-branch` — Standard completion workflow

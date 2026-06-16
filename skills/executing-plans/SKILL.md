---
name: executing-plans
description: Use when you have a written implementation plan to execute with review checkpoints
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "Using executing-plans skill to implement this plan."

**Note:** This skill executes all tasks inline using Pi's tools (`read`, `edit`, `write`, `bash`). Pi does not support subagent dispatch — all implementation happens in this session, task by task.

## The Process

### Step 1: Load and Review Plan

1. Read plan file with `read` tool
2. Review critically — identify any questions or concerns about the plan
3. If concerns: Raise them with the user before starting
4. If no concerns: Create a task checklist and proceed

### Step 2: Execute Tasks

For each task:

1. **Announce** which task you're starting
2. **Follow each step exactly** — the plan has bite-sized steps (2-5 minutes each)
3. **Run verifications** as specified — never skip test runs
4. **Commit** after each task when specified
5. **Self-review** your work before marking task complete
6. **Mark task complete** in the checklist

**When implementing, use these tools:**
- `read` — read existing files, check context
- `edit` — make precise code changes
- `write` — create new files
- `bash` — run tests, git commands, project commands

### Step 3: Complete Development

After all tasks complete and verified:

- Announce: "All tasks complete. Loading finishing-a-development-branch skill."
- Load finishing-a-development-branch skill
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- User updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** — stop and ask.

## Execution Discipline

### Before Each Task:
- Announce which task you're on
- Read any files the task references to understand current state
- Understand all steps before starting

### During Each Task:
- Follow TDD when the plan requires it (load test-driven-development skill)
- Commit after each completed sub-step
- Run verification commands exactly as specified

### After Each Task:
- Verify tests pass (all of them, not just new ones)
- Check git status is clean (committed)
- Look at your work with fresh eyes before marking complete
- Self-review: did you build what the task asked for, nothing more, nothing less?

## Red Flags

**Never:**
- Skip verification steps ("it should pass")
- Start implementation on main/master branch without explicit user consent
- Modify the plan without discussing with user
- Skip committing between tasks
- Implement beyond what the task specifies (YAGNI)
- Guess when instructions are unclear

**Always:**
- Review plan critically first
- Follow plan steps exactly
- Run all verifications
- Commit after each task
- Stop when blocked, don't guess

## Integration

**Required workflow skills:**
- **using-git-worktrees** — Ensures isolated workspace
- **writing-plans** — Creates the plan this skill executes
- **test-driven-development** — TDD cycle (loaded per task as needed)
- **finishing-a-development-branch** — Complete development after all tasks

## Pi-Specific Notes

Since Pi executes inline (no subagents):

- **Context management:** After completing 3-4 tasks, summarize progress briefly to keep context clear
- **Task focus:** Work one task at a time. Don't look ahead or behind.
- **File reading:** Read relevant files fresh before each task — don't rely on memory
- **Verification is mandatory:** Pi can't dispatch a reviewer subagent, so self-review is critical. After each task, re-read your changes and verify against the plan before marking complete

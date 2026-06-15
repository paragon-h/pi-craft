---
name: task-tracking
description: Use when the user gives multi-step tasks, says "do X, Y, Z", interrupts current work, or when the agent discovers new tasks during execution. Guides the agent to use the todo tool for task planning, execution tracking, and queue management.
---

# Task Tracking

## Overview

Track all tasks using the `todo` tool. Every task has one of four statuses: `queued`, `in_progress`, `done`, or `cancelled`. There is exactly one `in_progress` task at any time.

## Core Rules

**Rule 1: Plan before doing.** When the user gives a task, first `todo list` to see current state, then `todo add` to enqueue. Start with `todo start`.

**Rule 2: Complete and continue.** After finishing a task, immediately `todo done`, then `todo list` + `todo start` to pick up the next one. Never wait for the user to ask "what's next?"

**Rule 3: Interrupt gracefully.** When the user interrupts, `todo add` the new request, then `todo start` it. The previous `in_progress` task automatically returns to the queue.

**Rule 4: Discover without derailing.** If you find a new task during execution, `todo add` it to the queue and continue with the current task.

**Rule 5: Remind about leftovers.** When the user says "done" or "that's it" but the queue still has `queued` tasks, actively remind them.

**Rule 6: One at a time.** Never work on two tasks simultaneously. There is always exactly one `in_progress` task.

## Scenarios

### Starting work

User: "Help me do X"
1. `todo list` — check current state
2. `todo add "X"` — enqueue
3. `todo start <id>` — begin working

User: "Help me do X, Y, and Z"
1. `todo list`
2. `todo add "X"` → `todo add "Y"` → `todo add "Z"`
3. `todo start <first id>`

### Discovering new tasks mid-execution

1. `todo add "newly discovered task"`
2. Continue current task — do NOT switch

### Finishing a task

1. `todo done <id>`
2. `todo list`
3. `todo start <next id>` (if any queued remain)

### User interrupts

User: "Hold on, check Z instead"
1. `todo add "Check Z"`
2. `todo start <Z's id>` — old in_progress auto-returns to queue

### Task no longer needed

1. `todo cancel <id>`

### User says done

1. `todo list`
2. If queued tasks remain, say: "These tasks are still in the queue: ... Should I continue or cancel them?"

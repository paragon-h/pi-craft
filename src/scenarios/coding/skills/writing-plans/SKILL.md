---
name: writing-plans
description: Use when you have a spec or design document for a multi-step task, before touching any code
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need: which files to touch for each task, exact code, tests, verifications. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `{plansDir}/plan.md` — the plans directory from `init_workflow`, or `.pi/craft/plans/YYYY-MM-DD-{topic}/plan.md` if standalone.

## Scope Check

If the design covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for:

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/skill:subagent-driven-development`
> (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Complete test code — no placeholders
test('specific behavior', () => {
  const result = function(input);
  expect(result).toBe(expected);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/path/test.ts -t "specific behavior"`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// Complete implementation — no placeholders
function function(input) {
  return expected;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/path/test.ts -t "specific behavior"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.ts src/path/file.ts
git commit -m "feat: add specific feature"
```
```

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:

| ❌ Failure | ✅ Instead |
|-----------|-----------|
| "TBD" / "TODO" / "implement later" | Write the actual code or remove the step |
| "Add appropriate error handling" | Write the exact error handling code |
| "Write tests for the above" | Write the actual test code |
| "Similar to Task N" | Repeat the code — engineer may read tasks out of order |
| "Handle edge cases" | List each edge case and its handling |
| Steps describing what to do without showing how | Every code step has a code block |
| References to types/functions not defined in any task | Define everything inline |

## Self-Review

After writing the complete plan, check it against the design:

**1. Spec coverage:** Skim each section in the design. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search for red flags — any pattern from the "No Placeholders" section. Fix them.

**3. Type consistency:** Do types, method signatures, and property names in later tasks match earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. If you find a design requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

> "Plan complete and saved to `{path}`. Two execution options:
>
> **1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Load `/skill:subagent-driven-development`.
>
> **2. Direct Execution** — I execute tasks in this session, checking in at milestones.
>
> **Which approach?"**

- If Subagent-Driven: load `/skill:subagent-driven-development`.
- If Direct: proceed with the plan, using `/skill:test-driven-development` for each task.

## Remember

- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- Assume the implementer knows nothing about your project

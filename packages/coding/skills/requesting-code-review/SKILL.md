---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

## Overview

Pi doesn't support subagent dispatch for automated code review. Instead, perform a thorough self-review against the plan/spec with fresh eyes, treating your own work with the skepticism of a code reviewer.

**Core principle:** Review early, review often. Catch issues before they cascade.

## When to Request Review

**Mandatory:**
- After each task in plan execution
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective needed)
- Before refactoring (baseline check)
- After fixing complex bug

## Self-Review Process

Since Pi doesn't have reviewer subagents, you perform the review yourself with structured rigor.

### Step 1: Get the Diff

```bash
# Get changes since last review point
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main, or last reviewed commit
HEAD_SHA=$(git rev-parse HEAD)

# View the diff
git diff --stat $BASE_SHA..$HEAD_SHA
git diff $BASE_SHA..$HEAD_SHA
```

### Step 2: Structured Review

Review against these categories. Be honest — you're not the implementer right now, you're the reviewer.

#### Plan Alignment
- Does the implementation match the plan / requirements?
- Are deviations justified improvements, or problematic departures?
- Is all planned functionality present?

#### Code Quality
- Clean separation of concerns?
- Proper error handling?
- Type safety where applicable?
- DRY without premature abstraction?
- Edge cases handled?

#### Architecture
- Sound design decisions?
- Integrates cleanly with surrounding code?
- Each file has one clear responsibility?

#### Testing
- Tests verify real behavior, not mocks?
- Edge cases covered?
- All tests passing? (run them!)
- Did you follow TDD (red-green-refactor)?

#### Production Readiness
- Backward compatibility considered?
- No obvious bugs?
- No debugging code left behind?

### Step 3: Categorize Issues

| Severity | Definition | Action |
|----------|-----------|--------|
| **Critical** | Bugs, security issues, data loss risks, broken functionality | Must fix before proceeding |
| **Important** | Architecture problems, missing features, poor error handling, test gaps | Should fix before proceeding |
| **Minor** | Code style, optimization opportunities, documentation polish | Note for later |

### Step 4: Output Review Results

Format:

```
## Code Review: [Task/Feature Name]

### Strengths
[What's well done? Be specific.]

### Issues

#### Critical (Must Fix)
- [file:line] - [issue] - [why it matters] - [how to fix]

#### Important (Should Fix)
- [file:line] - [issue] - [why it matters] - [how to fix]

#### Minor (Nice to Have)
- [file:line] - [issue]

### Assessment

**Ready to proceed?** [Yes | With fixes]

**Reasoning:** [1-2 sentence technical assessment]
```

### Step 5: Act on Feedback

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- After fixing, re-run the review checklist on changed files

## Adversarial Self-Review

When reviewing your own code, actively look for your blind spots:

- "What would break if this assumption is wrong?"
- "Did I test the edge case I'm most worried about?"
- "Is there debugging code or commented-out code I forgot to remove?"
- "Did I implement more than the task asked for?" (YAGNI violation)
- "Would someone new to this code understand what each file does?"

## Integration with Executing Plans

After each task in a plan:
1. Run the self-review process
2. Fix Critical and Important issues
3. Verify all tests pass
4. Only then mark the task complete

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Mark a task complete without reviewing

**If you find significant deviations from the plan:**
Flag them and discuss with the user before proceeding.

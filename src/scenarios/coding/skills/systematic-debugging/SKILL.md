---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior — before proposing fixes
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue: test failures, bugs, unexpected behavior, performance problems, build failures, integration issues.

**ESPECIALLY when:**
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- Already tried multiple fixes
- Previous fix didn't work
- Don't fully understand the issue

**Don't skip when:** issue seems simple, you're in a hurry, or someone wants it fixed NOW. Systematic is faster than thrashing.

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read error messages carefully** — don't skip warnings. Read stack traces completely. Note line numbers, file paths, error codes.

2. **Reproduce consistently** — exact steps. Every time? If not reproducible, gather more data, don't guess.

3. **Check recent changes** — `git log --oneline -10`, `git diff HEAD~1`, new dependencies, config changes, environment differences.

4. **Trace data flow** — where does the bad value originate? What called this with bad value? Keep tracing up until you find the source. Fix at source, not at symptom.

5. **Multi-component systems** — add diagnostic instrumentation at each component boundary: log what enters, log what exits. Identify the failing layer before investigating internally.

### Phase 2: Pattern Analysis

1. **Find working examples** — similar working code in the same codebase. What works that's similar to what's broken?

2. **Compare against references** — if implementing a pattern, read the reference implementation COMPLETELY. Don't skim. Understand fully before applying.

3. **Identify differences** — every difference between working and broken, however small. Don't assume "that can't matter."

4. **Understand dependencies** — what other components does this need? Settings, config, environment? Assumptions?

### Phase 3: Hypothesis and Testing

1. **Form single hypothesis** — "I think X is the root cause because Y." Be specific.

2. **Test minimally** — smallest possible change to test hypothesis. One variable at a time.

3. **Verify** — did it work? Yes → Phase 4. No → new hypothesis. Don't add more fixes on top.

4. **When you don't know** — say "I don't understand X." Don't pretend.

### Phase 4: Implementation

1. **Create failing test** — simplest reproduction, automated if possible. Load `/skill:test-driven-development` for proper failing test creation.

2. **Implement single fix** — address root cause. ONE change. No "while I'm here" improvements.

3. **Verify fix** — test passes? No other tests broken? Issue resolved?

4. **If fix doesn't work** — STOP. How many fixes tried?
   - < 3: Return to Phase 1, re-analyze.
   - **≥ 3: Question the architecture.** Each fix revealing new problems in different places = wrong architecture. Discuss with user before attempting more.

5. **After fix works** — load `/skill:verification-before-completion`. Verify before declaring done.

## Red Flags — STOP and Follow Process

| Thought | Reality |
|---------|---------|
| "Quick fix for now, investigate later" | Later never comes. Fix it properly now. |
| "Just try changing X and see if it works" | Guessing wastes time. Find root cause first. |
| "Skip the test, I'll manually verify" | Untested fixes don't stick. Test first. |
| "It's probably X, let me fix that" | "Probably" ≠ "proven." Phase 1 first. |
| "I don't fully understand but this might work" | If you don't understand, you can't fix. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Stop. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| 1. Root Cause | Read errors, reproduce, check changes, trace data | Understand WHAT and WHY |
| 2. Pattern | Find working examples, compare | Identify differences |
| 3. Hypothesis | Form theory, test minimally | Confirmed or new hypothesis |
| 4. Implementation | Create test, single fix, verify | Bug resolved, tests pass |

## When "No Root Cause" Is Found

If systematic investigation reveals truly environmental/timing-dependent/external issue:
1. Document what you investigated
2. Implement appropriate handling (retry, timeout, error message)
3. Add monitoring/logging for future investigation

**But:** 95% of "no root cause" cases are incomplete investigation.

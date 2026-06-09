---
name: finishing-a-development-branch
description: Use when implementation is complete and all tasks are done — guides completion with structured options for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling the chosen workflow.

**Core principle:** Verify tests → Present options → Execute choice.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
npm test  # or the project's test command
```

**If tests fail:**
```
Tests failing (N failures). Must fix before completing.
Cannot proceed with merge/PR until tests pass.
```
Stop. Do not proceed.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main — is that correct?"

### Step 3: Present Options

Present **exactly these 4 options**, no explanation needed:

```
Implementation complete. All tests pass. What would you like to do?

1. Merge to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

### Step 4: Execute Choice

#### Option 1: Merge Locally

```bash
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
npm test

# If tests pass, delete feature branch
git branch -d <feature-branch>
```

#### Option 2: Push and Create PR

```bash
git push -u origin <feature-branch>

# Create PR (if gh CLI available)
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Keep branch alive for PR iteration.

#### Option 3: Keep As-Is

"Keeping branch `<name>`. No further action taken."

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete branch <name> and all its commits.
Type 'discard' to confirm.
```

Wait for exact confirmation. Then:

```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

## Quick Reference

| Option | Merge | Push | Keep Branch |
|--------|-------|------|-------------|
| 1. Merge locally | yes | — | no |
| 2. Create PR | — | yes | yes |
| 3. Keep as-is | — | — | yes |
| 4. Discard | — | — | no (force delete) |

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on merged result
- Delete work without typed confirmation
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Present exactly 4 structured options
- Get typed "discard" confirmation for Option 4

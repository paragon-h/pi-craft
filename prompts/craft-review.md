---
description: Code review workflow with structured findings and severity ratings
---
Use the /craft review command to review code changes:

```
/craft review [target] [topic-slug]
```

Examples:
- `/craft review` — review current uncommitted changes
- `/craft review src/middleware/auth.ts` — review a specific file
- `/craft review --branch=feature/login` — review a branch vs main

The review will:
1. Determine the review scope
2. Analyze each file with the reviewer subagent
3. Rate findings: 🔴 Critical / 🟡 Major / 🔵 Minor / 💡 Suggestion
4. Generate a review report
5. Optionally auto-fix issues (with your approval)

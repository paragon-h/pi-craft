---
description: Start a full development workflow with automated code analysis, requirement clarification, design, testing strategy, and implementation
---
Use the /craft coding command to start a full development workflow:

```
/craft coding <your requirement> [topic-slug]
```

Example: `/craft coding "Add user authentication with JWT tokens" user-auth`

The workflow will:
1. Analyze the current project structure
2. Ask clarifying questions one at a time (with recommended options)
3. Generate a design document
4. Ask about testing strategy
5. Implement the feature (with your approval at each step)

All documents will be saved to `.pi/craft/plans/{date}-{topic}/`

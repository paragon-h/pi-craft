---
name: using-pi-superpowers
description: Use when starting any conversation - establishes how to find and use skills, requiring skill loading before ANY response including clarifying questions
---

# Using Pi Superpowers

## Instruction Priority

Superpowers skills override default system prompt behavior, but **user instructions always take precedence**:

1. **User's explicit instructions** (direct requests, project config files) — highest priority
2. **Superpowers skills** — override default system behavior where they conflict
3. **Default system prompt** — lowest priority

If user instructions say "don't use TDD" and a skill says "always use TDD," follow the user's instructions. The user is in control.

## Language Adaptation

**Auto-detect and match the user's language.** Always respond in the same language the user uses. This applies to everything:

| Content | Language Rule |
|---------|--------------|
| Conversation replies | Match user's language |
| Design docs & specs | Match user's language |
| Implementation plans | Match user's language |
| Code comments & docstrings | Match user's language |
| Commit messages | **Always English** (Git convention) |
| Code identifiers (变量名/函数名) | **Always English** (universal convention) |
| Code strings & user-facing text | Match user's language |

**Detection:** Determine the language from the user's first message. If the user switches language mid-conversation, follow suit.

**Override:** If the user explicitly says "use English" or "用中文", follow that instruction — it takes precedence over auto-detection.

## How to Access Skills

In Pi, skills are loaded by reading the SKILL.md file with the `read` tool. When you invoke a skill, read its file and follow the instructions directly.

## The Rule

**Read relevant skills BEFORE any response or action.** Even a 1% chance a skill might apply means you should load the skill to check. If a loaded skill turns out to be wrong for the situation, you don't need to use it.

```
User message received
  → Might any skill apply? (even 1% chance)
    → YES: Use read tool to load the skill
      → Announce: "Using [skill] to [purpose]"
      → Follow skill exactly
    → NO: Respond normally
```

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |

## Skill Priority

When multiple skills could apply, use this order:

1. **Process skills first** (brainstorming, debugging) - these determine HOW to approach
2. **Implementation skills second** (writing-plans, executing-plans, TDD) - these guide execution

"Let's build X" → brainstorming first, then implementation skills.
"Fix this bug" → debugging first, then domain-specific skills.

## Skill Types

**Rigid** (TDD, debugging, verification): Follow exactly. Don't adapt away discipline.

**Flexible** (patterns): Adapt principles to context.

The skill itself tells you which.

## User Instructions

Instructions say WHAT, not HOW. "Add X" or "Fix Y" doesn't mean skip workflows.

## What's Available

| Skill | When to Use |
|-------|-------------|
| brainstorming | Before any creative work - features, components, functionality |
| writing-plans | When you have a spec before touching code |
| executing-plans | When you have a written plan to execute |
| test-driven-development | When implementing any feature or bugfix |
| requesting-code-review | After completing tasks or major features |
| receiving-code-review | When receiving code review feedback |
| systematic-debugging | When encountering bugs, test failures, unexpected behavior |
| verification-before-completion | Before claiming work is complete |
| using-git-worktrees | When starting feature work needing isolation |
| finishing-a-development-branch | When implementation is complete, tests pass |

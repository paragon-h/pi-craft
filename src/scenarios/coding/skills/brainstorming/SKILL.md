---
name: brainstorming
description: "You MUST use this before any creative work — creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

Create a task for each item and complete in order:

1. **Explore project context** — files, docs, recent commits. Use `/skill:stage-code-analysis` if available.
2. **Assess scope** — if multiple independent subsystems, flag and decompose before diving into details.
3. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria.
4. **Propose 2-3 approaches** — with trade-offs and your recommendation.
5. **Present design** — in sections scaled to complexity, get user approval after each section.
6. **Write design doc** — save to `.pi/craft/plans/{date}-{topic}/design.md` (or plans dir from `init_workflow`).
7. **Spec self-review** — check for placeholders, contradictions, ambiguity, scope.
8. **User reviews written spec** — ask user to review before proceeding.
9. **Transition to implementation** — load `/skill:writing-plans`.

## The Process

### Understanding the idea

- Explore the current project state first: files, docs, recent commits, existing patterns.
- If working inside a pi-craft workflow (plans dir exists), use `stage-code-analysis` for structured exploration.
- If no workflow exists, optionally call `init_workflow` to create a plans directory, or work standalone.
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems, flag immediately. Don't spend questions refining a project that needs decomposition first.
- For over-scoped projects, help decompose into sub-projects. Each sub-project gets its own spec → plan → implementation cycle.
- Ask questions **one at a time**. Wait for each answer before asking the next.
- Prefer multiple choice questions when possible, but open-ended is fine.
- Only one question per message — if a topic needs more exploration, break it into multiple questions.
- Focus on understanding: purpose, constraints, success criteria, edge cases.

### Exploring approaches

- Propose 2-3 different approaches with clear trade-offs.
- Present options conversationally with your recommendation and reasoning.
- Lead with your recommended option and explain why.

### Presenting the design

- Once you understand what you're building, present the design.
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced.
- Ask after each section whether it looks right so far — user may interrupt to revise.
- Cover: architecture, components, data flow, error handling, testing strategy.
- Be ready to go back and clarify if something doesn't make sense.

### Design for isolation and clarity

- Break the system into smaller units with one clear purpose each, communicating through well-defined interfaces.
- For each unit, you should be able to answer: what does it do, how do you use it, what does it depend on?
- Smaller, well-bounded units are easier to implement and test.
- Can someone understand a unit without reading its internals? Can you change internals without breaking consumers? If not, boundaries need work.

### Working in existing codebases

- Explore current structure before proposing changes. Follow existing patterns.
- Where existing code has problems affecting the work (overgrown files, unclear boundaries), include targeted improvements as part of the design.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Design

### Documentation

- Write the validated design to `{plansDir}/design.md`.
  - If `init_workflow` was called, use its plans directory.
  - If standalone, use `.pi/craft/plans/YYYY-MM-DD-{topic}/design.md`.
- Commit the design document to git.

### Spec Self-Review

After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

### User Review Gate

After the spec review passes, ask the user to review the written spec:

> "Spec written and committed to `{path}`. Please review it and let me know if you want any changes before we create the implementation plan."

Wait for the user's response. If they request changes, make them and re-run the self-review. Only proceed once approved.

### Implementation

- Load `/skill:writing-plans` to create a detailed implementation plan.
- Do NOT invoke any other skill. `writing-plans` is the next and only step.

## Key Principles

- **One question at a time** — Don't overwhelm with multiple questions.
- **Multiple choice preferred** — Easier to answer than open-ended when possible.
- **YAGNI ruthlessly** — Remove unnecessary features from all designs.
- **Explore alternatives** — Always propose 2-3 approaches before settling.
- **Incremental validation** — Present design section by section, get approval before moving on.
- **Be flexible** — Go back and clarify when something doesn't make sense.

## Red Flags — STOP and Reset

| Thought | Reality |
|---------|---------|
| "This is too simple for a design" | Simple things break from unexamined assumptions. Design can be a few sentences. |
| "The user seems to know what they want" | Knowing the destination ≠ knowing the best route. Explore alternatives. |
| "I'll just start coding and iterate" | Skipping design wastes more time in rework. Design first. |
| "I already explored the codebase" | Exploration without the feature in mind misses relevant context. Re-explore. |
| "Let me just sketch the code to think" | Writing code ≠ designing. Code sketches bias implementation. Design in prose. |
| "The design is obvious" | If it's obvious, writing it down takes 2 minutes and prevents misunderstandings. |

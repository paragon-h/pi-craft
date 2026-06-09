# Changelog

## Unreleased — Superpowers Integration

### Added

#### Bootstrap Engine
- `craft-bootstrap` skill: injected at `session_start` as a steer message. Establishes meta-rule: "check for applicable pi-craft skills before any action." ~200 tokens. Subagent-exempt.

#### Workflow Skills
- `brainstorming` skill: Socratic design refinement with HARD-GATE — no code before design approval. One-question-at-a-time, 2-3 approaches with trade-offs, design doc output, self-review, user review gate. Transitions to `writing-plans`.
- `writing-plans` skill: Decomposes approved designs into bite-sized (2-5min) implementation tasks. Each task: exact file paths + complete code + test code + verification steps. Strict "No Placeholders" policy. Self-review (spec coverage, placeholder scan, type consistency). Transitions to `subagent-driven-development`.
- `subagent-driven-development` skill: Per-task orchestration with two-stage review. Dispatches implementer subagent → spec compliance review → code quality review. Handles DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT statuses. Model selection guidance.

#### Discipline Skills
- `test-driven-development` skill: IRON LAW — no production code without a failing test first. RED-GREEN-REFACTOR cycle with mandatory verification at each step. 11 common rationalizations debunked.
- `systematic-debugging` skill: IRON LAW — no fixes without root cause investigation. 4-phase process: root cause → pattern analysis → hypothesis testing → implementation. 3+ failed fixes = question architecture.
- `verification-before-completion` skill: IRON LAW — no completion claims without fresh verification evidence. 5-step gate function: identify command → run → read output → verify → claim.
- `finishing-a-development-branch` skill: Standard completion workflow. Verify tests → present 4 options (merge/PR/keep/discard) → execute.

#### Subagents
- `spec-reviewer` agent: Verifies implementation matches specification line by line. Checks for missing features AND over-building (YAGNI violations = bug).
- `code-quality-reviewer` agent: Reviews code quality with 4 severity levels (Critical/Important/Minor/Suggestion). Only dispatched after spec review passes.
- `implementer` agent (enhanced): TDD discipline, structured status reporting (DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT), self-review checklist, escalation guidelines.

#### Compaction
- `session_before_compact` enhanced: Stage-specific gate hints survive compaction (e.g., "⚠️ HARD-GATE ACTIVE: 设计未批准，禁止写代码"). ~20 tokens vs ~1500 for full skill reload.

#### Config
- 9 new config switches (all default-on): `enableBootstrap`, `enableBrainstorming`, `enableWritingPlans`, `enableTdd`, `enableSubagentReview`, `enableSystematicDebugging`, `enableVerification`, `enableFinishingBranch`

### Changed
- `coding-workflow` skill: Updated with dual-path pipeline (Recommended + Classic). All old stage skills preserved.
- `AGENTS.md`: Updated architecture tree, config section, and added Superpowers Integration design section.
- `TokenTracker.restoreFrom()`: Bulk-copies aggregated stats for proper cross-session recovery (from prior commit).

### Preserved
- All original stage skills (`stage-code-analysis`, `stage-requirement`, `stage-design`, `stage-testing`, `stage-implementation`) remain available for standalone use or classic workflow path.
- All core features: token tracking, LSP, damage control, todo, cwd guard, statusline, workflow suggester.
- Backward compatible: disable `enableBootstrap` to revert to original behavior.

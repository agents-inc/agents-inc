---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/state-transitions.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: wizard/state-transitions.md now canonical with Focus Seeding, Tombstone Lifecycle, Diff Projection, Cancellation sections; root state-transitions.md is a pointer; documentation-bible.md §Splits & Pointers and §Hydration-vs-props capture the rule
---

## What Was Wrong

`reference/state-transitions.md` last validated 2026-04-13 had several drift points against the current wizard-store.ts / edit.tsx / init.tsx:

1. **Phantom file reference.** The "Edit Mode Initialization" section pointed readers to `src/cli/components/hooks/use-wizard-initialization.ts`. That file does not exist; hydration lives in `hydrateWizardStore()` inside `wizard-store.ts` itself, called synchronously from `runEditWizard()`/`runWizard()` before `render(<Wizard />)`.
2. **Wrong hydration mechanics.** Doc claimed the hook "walks through steps via `setStep()` to build `history` naturally" producing e.g. `history=["stack", "domains"]`. Actual code does `setState({ step: initialStep, history: [], approach: "scratch" })` — a direct jump with **empty history**. `ESC` at the entry step has nowhere to back to, which is intentional.
3. **No mention of async focus seeding.** `focusedSkillId` is `null` after hydration. `CategoryGrid`'s mount `useEffect` dispatches `setFocusedSkillId` on first commit. The gap between commit and that effect is the Scenario B race surface that swallows `S` keypresses silently via the `HOTKEY_SCOPE` guard. This is covered in `concepts/guard-pattern.md` but state-transitions.md had zero cross-reference.
4. **Missing tombstone lifecycle view.** Individual `toggleSkillScope` / `toggleTechnology` rows described tombstone mechanics in prose, but there was no active-project → dual-scope → global-only state-transition table even though that's precisely what D-223/D-224 hinge on.
5. **Diff projection invisible.** `SkillAgentSummary` / `step-confirm` derive a diff from the `installedSkillConfigs` snapshot captured at hydration. D-230/D-232 drift was entirely about this snapshot's pre-filter semantics. Not one mention.
6. **Cancel/abort transitions unlisted.** ESC on `stack`, confirm-complete, and Ctrl+C paths were undocumented.

## Fix Applied

Rewrote the hydration section against current code. Added three new sections — Focus Seeding (Async Transition), Tombstone Lifecycle Transitions, Diff Projection (Derived View) — plus a Cancellation / Exit table. Cross-linked `concepts/guard-pattern.md`, `concepts/tombstone-pattern.md`, and the three relevant findings (2026-04-21-e2e-build-step-keypress, 2026-04-21-e2e-keypress-rule-coverage-gap, 2026-04-21-d230-d232-diff-baseline-pre-filter-drift). Bumped `last_validated` to 2026-04-21 in both the authoritative file and the `wizard/state-transitions.md` pointer's frontmatter, and added new keywords (`hydrate`, `focus-seeding`, `scenario-b-race`, `tombstone-lifecycle`, `diff-projection`). Updated DOCUMENTATION_MAP row with the drift notes.

## Proposed Standard

State-transition documentation should treat **hydration**, **async post-mount seeding**, and **snapshot-backed derived views** (diff projection) as first-class transition categories, not afterthoughts hidden in side-effect columns. Any section that claims a hook/file name should be grep-verified at validation time — a phantom hook reference survived a previous 2026-04-13 validation pass because the check only walked `src/cli/stores/wizard-store.ts` line numbers and didn't re-resolve file paths cited in prose.

Add to `DOCUMENTATION_MAP.md` validation checklist (or the codex-keeper instructions): "For any `.ts`/`.tsx` file mentioned by path in a reference doc body, `Glob` the path before calling the doc validated."

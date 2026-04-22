---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/concepts/guard-pattern.md
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/wizard.tsx
  - src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: guard-pattern.md rewritten with Silent Guards, shouldIncludeTriple, Warn-and-Return sections, scope hotkey guard correction, race-surface catalogue, and cross-refs
---

## What Was Wrong

`guard-pattern.md` was last validated 2026-04-13 and had drifted on four axes:

1. **Missing guards.** Three user-visible guards were not documented:
   - `toggleTechnology` "Cannot deselect the only skill in this category" toast (exclusive+required category, ≤1 skill).
   - `wizard.tsx` `HOTKEY_SCOPE` "Scope toggle unavailable in global context" toast (hotkey-layer guard fires before store).
   - `shouldIncludeTriple` in `config-generator.ts` (D-220 delta-pipeline ownership predicate — guard class, not toast).

2. **Wrong outcome claim.** The summary table said the agent scope guard was "No-op (silent)". It is actually a **toast** via the `wizard.tsx` hotkey handler. The silent store-level guard only catches direct action callers (tests, programmatic paths).

3. **Missing silent-surface taxonomy.** The doc had no catalogue of silent guards — yet the Scenario B race class (findings `2026-04-21-e2e-build-step-keypress-missing-stable-render.md` and `2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps.md`) centres on a silent `focusedSkillId === null` guard in the hotkey dispatcher. Without the catalogue, future readers can't distinguish intentional silence (programmatic-misuse defense) from race-prone silence (swallowed keypresses).

4. **Missing warn-and-return layer.** Five actions log via `warn()` and return unchanged (`setSourceSelection`, `setEnabledSources`, `bindSkill`, `populateFromSkillIds`, plus the hotkey dispatcher paths). Not documented as a guard class.

## Fix Applied

Rewrote `guard-pattern.md`:

- Added sections for the three missing guards (Only-Skill Deselect, Scope Toggle Global-Context hotkey guard, stack-build `shouldIncludeTriple`).
- Added scope-silent guards for `toggleSkillScope` / `toggleAgentScope` covering the direct-action-caller path.
- Corrected the summary table (agent scope now shows the hotkey toast + store silent fallback separately).
- Added a new **Silent Guards and Race Surfaces** section with a risk-annotated table identifying the `focusedSkillId === null` path as the only current user-visible race surface, cross-referencing the 2026-04-21 findings.
- Added a **Warn-and-Return Guards** section enumerating programmatic-misuse logs.
- Added cross-refs to tombstone-pattern.md and scope-system.md throughout.
- Bumped `last_validated` to 2026-04-21 in frontmatter, body, and DOCUMENTATION_MAP.md.

## Proposed Standard

Two complementary rules for `.ai-docs/standards/documentation-bible.md`:

1. **Guard-enumeration rule:** Reference docs that inventory guards, actions, or side effects MUST enumerate every user-visible outcome the inventoried code produces. When the user-visible outcome (toast vs silent vs throw) is split between a dispatcher layer (`wizard.tsx`) and a store action layer, document BOTH layers and call out which path wins for which caller class (hotkey vs direct action vs test).

2. **Silent-guard catalogue rule:** Any doc that lists guards or side effects MUST include a "Silent guards" table annotated with race-risk. For each silent guard, state whether silence is (a) intentional contract-violation defense, (b) intentional shaping, or (c) a potential race surface that requires a mitigation (E2E wait, synchronous seeding, etc.). The "Scenario B" finding class is the archetype — a race-prone silent guard disguised as defensive code.

The deeper pattern exposed by this drift (and the tombstone doc drift the day before): **reference docs age faster than the code.** Validation cadence should be tied to finding-file dates, not calendar dates — any concept doc referenced by a recent finding should be revalidated within the same sweep. Propose adding a rule to `.ai-docs/standards/documentation-bible.md`: "When filing a finding that touches a concept doc, re-read and revalidate that doc in the same session."

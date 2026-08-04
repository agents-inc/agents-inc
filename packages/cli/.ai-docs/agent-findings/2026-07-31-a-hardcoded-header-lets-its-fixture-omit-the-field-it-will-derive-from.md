---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/components/wizard/summary-panel.tsx
  - src/cli/components/wizard/summary-panel.test.tsx
  - src/cli/components/wizard/step-confirm.test.tsx
  - src/cli/stores/wizard-store.ts
  - src/cli/consts.ts
  - .ai-docs/reference/component-patterns.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-31
reporting_agent: cli-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: "F-7 — `formatEnabledMarketplaces` replaced by `formatSkillMarketplaces(skillConfigs)`; `enabledSources`/`setEnabledSources` removed from the store; `step-confirm.test.tsx`'s header fixture now states a source instead of inheriting the factory default"
---

## What Was Wrong

Two distinct defects, one enabling the other.

**1. A store field with a setter and no caller.** `enabledSources` was initialised `{}` and written
only by `setEnabledSources`, which had no call site anywhere in the repo — production, tests or E2E.
The Marketplace row in `summary-panel.tsx` read it through `formatEnabledMarketplaces`, whose
"enabled ids" branch was therefore unreachable: every render took the
`DEFAULT_PUBLIC_SOURCE_NAME` fallback and printed the hardcoded string `Agents Inc`. CLAUDE.md
already bans this ("NEVER add backward-compatibility shims or legacy fallbacks", "NEVER build
multi-tier resolution fallbacks"), but the rules are phrased about _resolution chains_, and this was
a _state field_ — nobody read it as covered.

**2. The interesting one: a hardcoded value lets every test fixture omit the field the value will
one day derive from.** Because the row could not vary, no test that rendered it had any reason to
state a source. `step-confirm.test.tsx`'s "should render the marketplace and stack rows above the
summary" built its skills with `buildSkillConfigs(["web-framework-react"])` — and that factory
defaults `source` to `"eject"`. The test asserted `Marketplace Agents Inc` and passed, over a
fixture whose skills were all ejected and which under the real derivation names no marketplace at
all. The assertion was strict; the fixture was silently meaningless. Wiring the row up turned that
into a failure, which is the only reason it was noticed.

That is the general shape: **a value that cannot vary makes its inputs unobservable, so fixtures
drift away from stating them, and the drift is invisible until the value is made real.** Grepping
for the assertion string finds the test; nothing finds the fixture that was never asked to be
right.

## Fix Applied

- `formatEnabledMarketplaces` → `formatSkillMarketplaces(skillConfigs)`, deriving the row from the
  distinct non-`EJECT_SOURCE` values in `SkillConfig.source` (authoritative per D-217), formatted
  through the existing `formatSourceDisplayName` and joined with `" · "`. **Sorted**, so the row
  cannot reorder between renders on config iteration order alone.
- Three cases, because the two zero-marketplace ones are different states: no skills at all →
  `DEFAULT_PUBLIC_SOURCE_NAME` (reachable — the `I` overlay opens from the stack step before
  anything is selected); skills present but all ejected → `ALL_SKILLS_EJECTED_LABEL`, a new named
  constant in `consts.ts`; otherwise the marketplaces are named. Tombstoned (`excluded`) entries
  contribute, matching `computeScopeDiff`, which renders them as rows in the summary below.
- `enabledSources`, `setEnabledSources` and the `WizardStateData` key-union entry and initial-state
  line removed; the `step-settings.tsx` comment that named the field as a future integration point
  reworded.
- `step-confirm.test.tsx`'s header fixture now states `source: DEFAULT_PUBLIC_SOURCE_NAME`
  explicitly. The assertion string was **not** touched — the fixture was wrong, not the assertion.
- `summary-panel.test.tsx` gained cases for all three branches plus dedup, mixed eject/marketplace,
  order-independence and a tombstoned entry.
- Reference docs corrected: the `enabledSources` rows in `store-map.md`,
  `wizard/state-transitions.md` and `concepts/guard-pattern.md` removed.

## Proposed Standard

Two rules, both for `.ai-docs/standards/clean-code-standards.md`.

**A. A store field whose only writer has no caller is dead, not pending.** Extend the existing
"no legacy fallbacks" rule to cover state as well as resolution chains: if a field's setter has zero
call sites, delete the field, the setter, the type entry, the initial state and the branch that
reads it. Do not leave it as a placeholder for a future feature — the reachable branch below it
becomes a hardcoded value that nobody can tell from a real one, and its unreachable sibling rots.
Grep for the setter name before writing the field, not after.

**B. When you make a hardcoded display value derive from data, re-check every fixture that renders
it — the ones that pass are the suspects.** A test asserting a constant string against a component
that ignored its inputs proves nothing about those inputs, so its fixture was free to be wrong and
usually is. Before wiring, list the tests that assert the old constant and confirm each fixture
_independently_ states the field the new derivation reads. A fixture that only passes because it
inherited a factory default (`buildSkillConfigs` defaults `source` to `"eject"`) is the exact case
this catches. And when such a test then fails, fix the fixture, never the assertion — this is the
concrete instance the "NEVER broaden an assertion to make a failing test pass" rule is guarding, and
worth citing there by name.

**Also observed (not fixed):** `.ai-docs/reference/component-patterns.md` still documented
`info-panel.tsx`, a file the F-4 extraction deleted, including its store reads and its manual
`scrollOffset` machinery. Only the store-reads line was corrected in place; the section carries an
inline `NEEDS-VALIDATION` marker now. Reference sections outlive the files they name because nothing
checks that a documented path exists on disk — a one-line CI check over backticked `src/**` paths in
`.ai-docs/reference/` would close the class.

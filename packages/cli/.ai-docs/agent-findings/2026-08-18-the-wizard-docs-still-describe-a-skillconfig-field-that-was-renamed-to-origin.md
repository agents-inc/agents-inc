---
type: convention-drift
severity: high
affected_files:
  - .ai-docs/reference/store-map.md
  - .ai-docs/reference/wizard/state-transitions.md
  - .ai-docs/reference/features/wizard-flow.md
  - .ai-docs/reference/component-patterns.md
  - src/cli/types/config.ts
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/wizard/scope-diff.ts
  - e2e/pages/steps/search-modal.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The four wizard reference documents are corrected and ten enumerations across them are now bound
  to source by scripts/check-enumeration-drift.ts. What is NOT fixed is code-side and outside this
  pass's scope: two stale symbol names in source comments (withSelectedSource in wizard-store.ts,
  D-278 in scope-diff.ts) and one E2E page object driving a screen that does not exist
  (e2e/pages/steps/search-modal.ts, reached by BuildStep.openSearch pressing "/").
---

## What Was Wrong

Four defects, all of the same shape: a document naming a symbol the tree does not hold. A reader
greps, finds nothing, and reasonably concludes the document describes a different codebase.

**1. The per-skill provenance field is `origin`, not `source`.** `src/cli/types/config.ts` declares
`SkillConfig` as `{ id, scope, origin: string, excluded? }`. All four wizard documents described it
as `source` — in the `skillConfigs` shape table, in `createDefaultSkillConfig`'s return value, in
`WizardResultV2`'s field comment, in `HydrateOptions`, in `setInstallMode`'s contract and in the
mode-change condition. The confusion is not gratuitous: two NEIGHBOURING types keep the older word
and are populated FROM `origin` — `SkillDiffRow.source` in `lib/wizard/scope-diff.ts` and
`CategoryOption.source` in `components/wizard/category-grid.tsx` — so "source" is a live name in the
same call chain and a reader cannot tell from the documents which one is meant.

**2. `withActiveEntrySource` does not exist.** The helper is `withActiveEntryOrigin`. It was named
in `store-map.md` twice and in `wizard/state-transitions.md` once, in each case as the mechanism
behind `setInstallMode`.

**3. `HOTKEY_SETTINGS` and `HOTKEY_ADD_SOURCE` do not exist**, anywhere in `src/` or `e2e/`.
`component-patterns.md` tabulated both under "Character hotkeys", and thirteen lines later asserted
"**no other `HOTKEY_*` constants exist** (both re-read off `hotkeys.ts` in full)". A third paragraph
built a rule on the first: "`HOTKEY_SCOPE` and `HOTKEY_SETTINGS` share the `s` key and are
context-gated". `wizard/state-transitions.md` had already been repaired and stated correctly that
both were absent — so the two documents contradicted each other, and the repaired one was the only
one anyone had checked.

**4. `DiffRowStatus` has no `source-changed` member.** The union is
`"added" | "mode-changed" | "removed" | "unchanged"`. `wizard/state-transitions.md` listed
`source-changed` while `component-patterns.md` and `wizard-flow.md` listed `mode-changed` — the same
union enumerated two ways in one directory.

**Two behaviour claims were also backwards.** `wizard/state-transitions.md` stated in three places
that spacebar on a live dual-scope `[P][G]` skill row is inert and returns `GLOBAL_SKILLS_LOCKED`.
`toggleTechnology` has no such branch: it reaches `isDualScopePair` only through
`blocksExclusiveSwap`, so the refusal applies to an exclusive radio SWAP and a plain checkbox
deselect goes through, collapsing the pair via `applySkillRemoval`. `toggleAgent` DOES hold the
inert branch (`isDualScopePairRow`, checked first). The skill and agent paths genuinely diverge
here, and `store-map.md` described the skill side correctly while `state-transitions.md` described
both as inert.

**Undocumented behaviour found while re-deriving.** Only two of the six wizard screens had their key
bindings written down. Nothing documented that `stack`, `domains`, `agents` and `confirm` bind
anything, that Escape means a different thing on every screen, that vim keys are accepted everywhere
except the Sources grid, or that `CheckboxGrid` counts one focus index past its last row and draws
no row for it. Separately, `domain-selection.tsx` passes `CheckboxGrid` no `availableHeight`, so
`useRowScroll`'s `scrollEnabled` is permanently false and the Domains step never clips at any
terminal height — the documents listed it among the views that "clip silently", which is a different
and less serious behaviour than bleeding.

**Code-side, not fixed here.** `wizard-store.ts`'s JSDoc on `resolveSkillRowInputs` names
`withSelectedSource`; the helper is `withSelectedMode`. `scope-diff.ts`'s JSDoc on `agentSlotKey`
cites `D-278`, which `todo/cli.md` records as renumbered after an ID collision, so the comment
points at two different rows. `e2e/pages/steps/search-modal.ts` is a page object for a search modal
the wizard does not have: `BuildStep.openSearch()` presses `/`, no `useInput` handler in `src/cli/`
binds `/`, and no spec imports `SearchModal`.

## Fix Applied

All four documents corrected against source, and the class made mechanically detectable rather than
left to the next reader.

Ten rows added to `scripts/check-enumeration-drift.ts` (registry 41 -> 51 rows, 74 further members
judged), each binding a list that had drifted or could:

| Registered                                             | Members | Document                                |
| ------------------------------------------------------ | ------- | --------------------------------------- |
| exported constants of `hotkeys.ts`                     | 10      | `reference/component-patterns.md`       |
| exported functions of `hotkeys.ts`                     | 2       | `reference/component-patterns.md`       |
| `CLI_COLORS`, `UI_SYMBOLS`, `SCROLL_VIEWPORT`          | 16/19/4 | `reference/component-patterns.md`       |
| `TOAST_MESSAGES` (module-private)                      | 4       | `reference/store-map.md`                |
| `WizardStep`, `DOMAIN_AGENTS`                          | 6/4     | `reference/wizard/state-transitions.md` |
| exported functions of `scope-diff.ts`, `DiffRowStatus` | 5/4     | `reference/features/wizard-flow.md`     |

Failure proved by renaming three members in the working tree (`HOTKEY_SCOPE`,
`TOAST_MESSAGES.ONLY_SKILL_IN_CATEGORY`, the `mode-changed` literal); all three rows reported
`namedButAbsent` / `presentButUnnamed` correctly, and the tree was restored byte-identically
(`md5sum -c`).

Two limits are worth recording because they cost time to discover:

- **`declarationOf` does not require an export modifier**, so a module-private const is registerable.
  That is what made `TOAST_MESSAGES` and `DOMAIN_AGENTS` bindable at all.
- **`WIZARD_STEP_ORDER` is not registerable** — `[...] as const satisfies readonly WizardStep[]`, and
  `unwrap` reads through `as` but not `satisfies`. The `WizardStep` UNION was registered instead,
  which carries the same six names from the declaration the constant is checked against. Likewise
  `WizardState` is a type alias to an object TYPE LITERAL, so the store-field tables cannot be bound;
  and the component/hook/step inventories are directory listings, which a row cannot express.

`reference/component-patterns.md` now owns the `hotkeys.ts` export list outright;
`features/wizard-flow.md` and `wizard/state-transitions.md` link to it instead of restating it, so
there is one writable copy rather than three. Where a second writable copy could not be removed —
`CLI_COLORS` and `UI_SYMBOLS`, which `reference/utilities.md` also owns and is bound to — BOTH copies
are now registered, the same treatment the six `messages.ts` objects already have.

A per-screen structural-key table was added to `wizard/state-transitions.md`, covering all six
screens plus the `I` overlay, with the two cross-screen inconsistencies stated explicitly.

## Proposed Standard

**1. A document that names a source symbol should be bound to it, and the reason is now measurable.**
Every defect above is a NAME, not a count, and the naming direction is the one no reader can catch:
a short list reads as a list, while a list naming a deleted symbol reads as authoritative until
someone greps. `scripts/check-enumeration-drift.ts` already judges membership in both directions —
the gap is that registering is optional. Suggest adding to
`standards/documentation-bible.md` -> "A Count Lives in Exactly One Document": _a list introduced as
exhaustive must either carry a registry row or state in the document why it cannot (naming the guard
it fails at: `satisfies`, type literal, call expression, directory listing, or a list split across
tables)._ Four of my lists hit exactly those guards and now say so in place.

**2. `documentation-bible.md` rule 3 should be tightened to remove an arbitration.** Its headline is
an absolute ban on task IDs, but its stated reasoning is entirely about DEAD ids ("an ID absent from
both is dead") and its self-correction trigger reads conditionally ("if absent, name the behaviour").
Those admit different answers for a LIVE id. The absolute reading is the right one and the evidence
is in this repo: `D-266` is a live open row whose ID appears in **zero** source files, so a reader
cannot check it at all; and `D-278` was renumbered after an ID collision, so one ID now names two
different rows and a source comment in `scope-diff.ts` points at both. A live row is also one commit
from being a dead one. Suggested one-line change to rule 3, for the document's owner rather than for
this pass: replace "an ID absent from both is dead and carries no meaning for a reader" with "an ID
absent from both is dead, and a live one is one commit from it — the ban is unconditional", and make
the self-correction trigger read "Citing a task ID -> Stop. Name the behaviour." with no condition.

**3. A page object with no consumer is not evidence that a screen exists.**
`e2e/pages/steps/search-modal.ts` survived the removal of whatever it drove because nothing imports
it and nothing type-checks it against the UI. Suggest `standards/e2e/page-objects.md` state that a
page object with no importer is deleted, not kept, and that `knip` (already in the repository root)
is the mechanism.

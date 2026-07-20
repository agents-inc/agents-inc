---
type: anti-pattern
severity: medium
affected_files:
  - e2e/pages/steps/sources-step.ts
  - e2e/pages/base-step.ts
  - e2e/fixtures/interactive-prompt.ts
  - e2e/pages/wizards/edit-wizard.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

Three distinct forms of rot had accumulated in the E2E page-object layer.

**1. Speculative API added "for symmetry" with zero adopters.**

`SourcesStep.moveSourceColumnLeft` was added alongside `moveSourceColumnRight`
during the InteractivePrompt migration purely so the pair looked symmetric. No
spec ever pressed arrow-left in the sources grid. It in turn was the only caller
of the protected primitive `BaseStep.pressArrowLeft`, so an entire two-layer
call chain existed to serve nobody.

The same pattern appeared in `e2e/fixtures/interactive-prompt.ts`:
`arrowRight()`, `arrowLeft()` and `space()` were mirror-image wrappers whose only
consumers were two specs that have since migrated to the page-object layer. The
fixture is still live (`e2e/interactive/update.e2e.test.ts` and
`e2e/interactive/uninstall.e2e.test.ts` use `confirm`, `deny`, `pressEnter`,
`ctrlC`, `waitForText`, `getOutput`, `waitForExit`), but those three methods were
dead weight.

Dead page-object methods are worse than dead product code: they advertise
capabilities to the next test author, who then builds a flow on an
interaction path nothing has ever exercised.

**2. A duplicate method whose name contradicted the actual key behaviour.**

`SourcesStep.toggleFocusedSource()` was a pure alias that delegated to
`selectFocusedSourceCell()`. Beyond the redundancy, the surviving question was
which name is _true_. In `src/cli/components/wizard/source-grid.tsx` the Space
handler calls `onSelect(currentRow.skillId, currentOption.id)` — it commits the
focused column as that skill's source. It is idempotent: pressing Space twice on
the same cell selects the same source twice. There is no toggle-off.

So `toggleFocusedSource` named a behaviour the product does not have, and it was
the _more_ popular of the two names (6 call sites vs 2). A misleading page-object
name propagates: the comments at its call sites had already drifted into
describing the interaction as a toggle.

**3. An inlined structural type duplicating an exported one.**

`EditWizardOptions.source` was typed as the inline literal
`{ sourceDir: string; tempDir: string }`, structurally identical to the exported
`E2ESource` from `e2e/helpers/create-e2e-source.ts`. The sibling
`InitWizardOptions` had already been converted to `E2ESource`, so the two wizard
launchers disagreed on how to spell the same concept.

## Fix Applied

- Deleted `SourcesStep.moveSourceColumnLeft` and the now-unreferenced
  `BaseStep.pressArrowLeft`.
- Deleted `InteractivePrompt.arrowRight()`, `arrowLeft()` and `space()`. Kept the
  fixture and all methods its two live consumers use.
- Collapsed the duplicate onto `selectFocusedSourceCell` — the name that matches
  the product behaviour — and deleted `toggleFocusedSource`. Six call sites moved
  across five specs (`edit-add-local-skills`, `cross-scope-lifecycle`,
  `init-wizard-plugin`, `init-plugin-marketplace-fail`, `scope-aware-local-copy`),
  joining the two that already used the surviving name. Chose accuracy over
  call-site count deliberately: renaming 6 sites once is cheaper than every future
  author inferring toggle semantics from the name.
- Replaced the inline shape in `EditWizardOptions` with `E2ESource`, mirroring
  `init-wizard.ts`'s `import type` style.

No assertion was weakened, skipped or deleted; every change is a rename or a
removal of an uncalled method.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, new section
"Page-object API hygiene":

1. **No speculative page-object methods.** Add a step method only when a spec
   calls it in the same change. Do not add a mirror method (`...Left` next to
   `...Right`, `arrowUp` next to `arrowDown`) for symmetry alone. If a primitive
   in `BaseStep` loses its last caller, delete it in the same change.

2. **Name step methods for the product's actual key semantics, not for the
   mental model.** Before naming a method, read the component's `useInput`
   handler. If Space calls `onSelect(...)`, the method is `select…`; reserve
   `toggle…` for handlers that genuinely flip state on and off. A page object is
   documentation — a wrong verb there is a wrong verb in every spec that reads it.

3. **No alias methods on page objects.** One interaction, one method name. An
   alias doubles the vocabulary a test author must learn and guarantees the two
   names drift in their doc comments.

4. **Page-object option types reuse exported fixture types.** When a launcher
   option describes a value produced by a fixture factory, import that factory's
   exported type (`E2ESource`) rather than re-inlining its shape. This is the
   existing "NEVER create redundant type aliases" rule in CLAUDE.md applied to
   inline structural literals — worth stating explicitly for the `e2e/pages/`
   layer, since that is where it recurred.

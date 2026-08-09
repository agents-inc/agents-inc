---
type: audit
severity: medium
affected_files:
  - ../matrix/src/read-model/selection-semantics.ts
  - ../matrix/src/contract/selection-scenarios.ts
  - src/cli/lib/matrix/matrix-resolver.ts
  - src/cli/lib/configuration/default-rules.ts
standards_docs:
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: 'Owner ruling 2026-08-07 settled the blocked decision the finding names — option 1, the framework-constraint verdicts are an accepted loss. CLI-389 phase C then deleted `compatibleWith` across both repos: the 39 groups in `default-rules.ts`, the type and zod fields, `skill-resolution`''s symmetric expansion, the `outsideWhitelist` cause in `packages/matrix`''s selection semantics, `isCompatibleWithSelections` and both label arms, the health-check row, source-loader, search, catalog/schema, and both generated matrices. The three scenarios carrying `divergence: "framework-constraint"` were rewritten as agreements with the ruling and lineage in their `why`, and the union arm was retired. The proposed standard landed in `.ai-docs/reference/features/skills-and-matrix.md` → "Selection semantics: possibility, not presence", which states the distinction and points anything needing a presence semantic at D-306.'
---

## What Was Wrong

CLI-389 Phase C (decision 4) deletes `compatibleWith` and states one hard
dependency: "the CLI computes no requires-closure, and its multi-hop verdicts
currently come out right only via `compatibleWith`. EDITOR-11 step 2 (the shared
closure in `packages/matrix`) must land BEFORE this deletion, or the Astro/Expo-class
verdicts regress in the CLI."

The shared closure has landed. The deletion still regresses those verdicts, because
the closure is not the mechanism that was producing them. Measured, not reasoned:
the contract runner's own subject (`buildCategoriesForDomain`) was run against a
catalogue with every resolved `compatibleWith` array emptied and nothing else
changed. **18 of the 21 `SELECTION_SCENARIOS` pass; the 3 that fail are exactly the
three carrying `divergence: "framework-constraint"`:**

| scenario                                                         | expectation lost                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `a-framework-bound-skill-beside-a-framework-that-cannot-host-it` | `[astro]` → Radix, Vuetify, RHF, Vue Test Utils go `normal` |
| `a-companion-whose-base-is-merely-still-available`               | `[react]` → Expo goes `normal`                              |
| `a-framework-beside-a-companion-bound-to-another`                | `[pinia]` → React, Svelte go `normal`                       |

The two rules answer different questions and no re-keying makes one the other:

- **The whitelist asks whether a declared host is _selected_.** `[astro]` names none
  of Radix's hosts, so Radix is out.
- **`requires` asks whether a candidate is still _possible_.** Astro conflicts with
  Next.js and Remix but not with React, so Radix's `needsAny [react, nextjs, remix]`
  keeps a survivor and Radix stays offerable. Same for Expo (`react-native` is
  unselected but not ruled out) and for the frameworks Pinia cannot run on.

The 39/39 `requires`/`compatibleWith` parity decision 4a rests on is real and was
re-verified here — it is parity of _membership_, not of _semantics_, and only the
membership carried over.

The one substitute that does reproduce the lost verdicts — judging a requirement by
presence in the reached set rather than by exclusion — was measured too, and is
worse than either option: it breaks two further scenarios
(`a-choice-commits-to-none-of-its-options`, and the Nuxt half of the Pinia scenario)
and turns a single Tailwind pick into 97 red cells.

The same measurement establishes what the deletion _fixes_, which the plan
under-counts. The whitelist's presence test fires against **any** non-empty
selection that names no host, not merely against a wrong framework:

| selection                  | skills reported incompatible today | after the deletion |
| -------------------------- | ---------------------------------- | ------------------ |
| a local/custom skill alone | 50                                 | 0                  |
| `[tailwind]` alone         | 50                                 | 0                  |
| `[astro]`                  | 47                                 | 4                  |
| `[react]`                  | 12                                 | 9                  |

So `2026-08-07-whitelist-verdicts-fire-against-local-skill-selections.md` is one
instance of a class, `2026-08-06-compatible-with-is-non-reflexive-so-a-selected-skill-judges-itself-incompatible.md`
is another (the self-verdict disappears with the field), and the three contract
scenarios are the class's only load-bearing survivors.

## Fix Applied

None — the deletion was not made. Phase C's step-2 gate is exactly the check that
caught this, so proceeding past it would have shipped the regression the plan names
as its own failure condition. The tree is unchanged; the parity re-verification, the
surface inventory and the before/after measurements are in the task report.

The blocked decision, stated so it can be settled in one pass: **the CLI's
framework-constraint verdicts are not expressible in the surviving vocabulary.**
Either they are accepted as lost — which makes the CLI agree with the editor, which
never had them, and retires the `framework-constraint` divergence by making both
sides answer "could this still become valid" — or `compatibleWith` stays until a
mechanism that states "this skill needs its host chosen, not merely available"
exists (D-306's territory).

## Proposed Standard

`.ai-docs/reference/features/skills-and-matrix.md`, in the selection-semantics
section, should state the distinction the two mechanisms draw, because nothing
currently does and the plan's dependency claim is what filled the gap:

> A `requires` verdict is about **possibility** — a requirement is unmet only once
> every candidate has been ruled out. A `compatibleWith` verdict is about
> **presence** — a host must be in the selection as clicked. A whitelist is
> therefore never redundant with a `requires` rule of identical membership, and a
> deletion that trades one for the other changes verdicts even at 100% parity.

The second half belongs in `todo/plans/CLI-389-relationship-coverage.md` decision 4a,
whose "zero new declarations" is true of the data and false of the behaviour.

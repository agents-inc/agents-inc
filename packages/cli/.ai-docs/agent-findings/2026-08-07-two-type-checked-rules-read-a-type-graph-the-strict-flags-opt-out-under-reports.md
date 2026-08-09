---
type: standard-gap
severity: high
affected_files:
  - packages/cli/eslint.config.js
  - packages/cli/tsconfig.json
  - packages/cli/src/cli/components/hooks/use-category-grid-input.ts
  - packages/cli/src/cli/lib/loading/multi-source-loader.ts
  - packages/cli/src/cli/base-command.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: missing-rule
status: partial
partial_note: >-
  CLI-422 removed the opt-out and both rules are back on in packages/cli. Class 1 (DefinitelyTyped
  lying about process.stdout.columns) survives and now carries targeted disables. Class 2
  (typedEntries laundering) also survives in practice and carries disables — see the correction
  below. The three proposed bible rules are still unwritten.
---

## What Was Wrong

Enabling `tseslint.configs.recommendedTypeChecked` on `packages/cli` produced 612 reports. Two
rules account for 252 of them, and **both compute their answer from a type graph this package
deliberately under-reports**.

`packages/cli/tsconfig.json` sets `noUncheckedIndexedAccess: false` — the CLI-396 opt-out, owned by
CLI-422 and documented at length in that file. With the flag off, `arr[i]` and `record[k]` are
typed `T` rather than `T | undefined`. Every guard on a lookup therefore reads as dead:

- `@typescript-eslint/no-unnecessary-condition` — 178 reports (91 production, 87 test). A large
  share are index-access guards. `use-category-grid-input.ts` reads
  `const currentOption = currentOptions[focusedCol]; if (currentOption) {…}` — precisely the guard
  the flag exists to require, reported as "value is always truthy".
- `@typescript-eslint/no-unnecessary-type-assertion` — 74 reports, 19 of them non-null assertions.
  The tsconfig's own comment names `focusableIds[0]!` in `step-agents.tsx` as "a no-op without the
  flag". The rule agrees, and says to delete it.

Acting on either set deletes the guards and assertions that flipping the flag back on will need —
and the deletions would read as progress in a diff. **The rules are not wrong; they are answering
a question this package's compiler options have made unanswerable.**

Two further false-positive classes surfaced that the flag does not explain, and which matter
because they are not fixed by CLI-422 either:

1. **DefinitelyTyped inaccuracies.** `process.stdout.columns ?? MIN_TERMINAL_SIZE.COLS` in
   `base-command.ts` is reported as an unnecessary `??`. Node types `columns` as `number`; it is
   `undefined` whenever stdout is not a TTY. The guard is load-bearing and the type is a lie.
2. **Helpers that launder optionality out of a `Partial` record.** `typedEntries` is declared
   `<K, V>(obj: Partial<Record<K, V>>) => [K, V][]`, so the `| undefined` the `Partial` admits is
   gone by the time a caller iterates. `if (!skill) continue` after `typedEntries(matrix.skills)`
   therefore reads as dead while still guarding the explicit-`undefined` case. TypeScript's own
   `Object.entries` does the same thing — verified against `packages/matrix`'s
   `PRELOAD_DEFAULTS`, declared `Readonly<Partial<Record<SkillId, readonly RoleFlavor[]>>>`, whose
   entries destructure to `readonly RoleFlavor[]` with no `undefined`.

Class 2 has a saving grace worth recording: under `exactOptionalPropertyTypes` (on everywhere
except `packages/cli`), writing `{ "some-id": undefined }` into a `Partial<Record<…>>` literal is
a compile error, so the pathological case is unreachable and the guard genuinely is dead. That is
why the identical guards in `packages/matrix` were deleted and the ones in `packages/cli` were
not. The distinction is invisible from the lint report alone.

## Fix Applied

`packages/cli` takes `recommendedTypeChecked` with those two rules `"off"`, carrying a debt comment
that names CLI-393 and CLI-422 and states the reason as correctness rather than volume. Every other
type-checked rule stays on there — they read any-ness rather than optionality, so the opt-out does
not touch them. The other five workspaces take the full set including both rules; their combined
fallout was 19 reports and all were fixed.

Where a guard survived on judgement rather than on rule mechanics, it carries an
`eslint-disable-next-line` with a reason rather than being deleted (see the task report for the
full list).

## Proposed Standard

`typescript-types-bible.md` should carry a section on **when a type-aware lint verdict is not
evidence** — this is the second finding in two days about the gap between what the types say and
what the data does. Three rules, all one line:

1. A workspace that opts out of `noUncheckedIndexedAccess` MUST also disable
   `no-unnecessary-condition` and `no-unnecessary-type-assertion`, with a comment naming the
   opt-out. Enabling one without the other turns the linter into a tool for deleting the guards
   the opt-out is temporarily standing in for.
2. A helper whose signature narrows `Partial<Record<K, V>>` to `[K, V][]` (or `V[]`) is a
   **laundering** helper: it converts a "may be absent" into a "present" by assertion. `typedEntries`
   and `Object.entries` are both this. A guard downstream of one is documentation of the
   explicit-`undefined` case, not dead code — unless `exactOptionalPropertyTypes` is on, which
   makes that case unwritable. State both halves; the second is what makes the first actionable.
3. A `??` or `?.` on a Node or DOM global is exempt from "unnecessary" verdicts by default.
   `process.stdout.columns` and `process.stdout.rows` are the live examples. Prefer a targeted
   disable with the reason over deletion.

## Correction, 2026-08-07 (CLI-422)

The opt-out is gone and both rules are on. Two claims in this finding need amending against what
the re-enable actually measured:

**The counts were inflated by the dishonest graph, as predicted — but by more than expected.**
178 `no-unnecessary-condition` and 74 `no-unnecessary-type-assertion` became **0 and 50** the
moment `noUncheckedIndexedAccess` came back on. Every index-access guard this finding worried
about is now correctly seen as load-bearing; not one was deleted. The 50 surviving assertions were
genuinely redundant and are gone.

**`no-unnecessary-condition` was never enabled here at all.** This finding says the two rules are
"off HERE ONLY" as overrides of the shared config's additions. `packages/cli/eslint.config.js`
does not extend `@workspace/eslint-config` — it composes `recommendedTypeChecked` itself, and
`no-unnecessary-condition` is one of the shared base's additions BEYOND that set. Deleting the
`"off"` line left the rule unconfigured rather than enabled; it had to be added explicitly. Filed
as `2026-08-07-the-cli-eslint-config-restates-the-shared-set-so-its-additions-were-never-inherited.md`.

**Class 2's "saving grace" did not cash out.** This finding predicted that turning
`exactOptionalPropertyTypes` on would make the explicitly-undefined slot unwritable and the
laundering guards genuinely dead — as happened in `packages/matrix`. The flag is now on and the
rule still reports all of them, because the laundering is in the HELPER's return type
(`typedEntries<K, V>(obj: Partial<Record<K, V>>) => [K, V][]`), which no compiler flag touches.
The 21 guards in this class kept their runtime behaviour and carry targeted disables naming the
laundering. Deleting them remains a separate, arguable call; the disables are the inventory for
whoever makes it.

**A third false-positive class this finding did not have:** a `let` assigned inside `beforeAll`
reads as definitely assigned, so its teardown guard reports as always-truthy. 49 sites, retired
via a helper rather than disables — see
`2026-08-07-a-let-assigned-in-beforeall-reads-as-definitely-assigned-and-fifty-teardown-guards-paid-for-it.md`.

---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/features/seed-contract.md
  - .ai-docs/reference/concepts/scope-system.md
  - .ai-docs/reference/commands/edit.md
  - .ai-docs/reference/utilities.md
  - .ai-docs/reference/commands/index.md
  - src/cli/base-command.ts
  - src/cli/commands/edit.tsx
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `standards/documentation-bible.md` gains "An Absence Names No Symbol", placed directly after
  "A Count Lives in Exactly One Document" as its complement — one governs claims that name things,
  the other claims that name nothing. It carries both obligations proposed below: the runnable
  vocabulary sweep (`declares no`, `no equivalent`, `is absent`, `is a gap`, `does not exist`,
  `untested`, `no spec`, `vestigial`) as a step in filling a gap rather than a later tidy-up, and
  the dating rule preferring an absence that names the check which would prove it. A third
  subsection, "Which claims are unguarded", records the five shapes
  `scripts/check-enumeration-drift.ts` structurally cannot bind, so a writer knows when a claim is
  on its own. The five documents were repaired earlier the same day and no file outside
  `agent-findings/` now says `edit --from` carries no home-scope refusal.
---

## What Was Wrong

On 2026-08-17 `refuseProjectScopedContentAtHome` moved from `init.tsx` onto `BaseCommand`, and
`edit --from` began calling it at the same point of the same value as `init --from`
(`edit.tsx::selectionFromSharedConfig`, immediately after `decodeSeedOrFail`). That is recorded in
`2026-08-17-a-second-producer-inherits-the-first-refusals-and-recosts-its-skips.md`.

A day later, five documents still described the state before it. Two of them did not merely omit
the new call — they asserted its absence, in the confident voice a reader trusts:

| Document                              | What it still claimed                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `reference/features/seed-contract.md` | A comparison row: `edit --from` carries "Two, and different... It declares no home-scope location refusal" |
| `reference/features/seed-contract.md` | A **Known Limitations** row: "`edit --from` declares no home-root location refusal"                        |
| `reference/concepts/scope-system.md`  | "`edit --from <id>` is absent from that table, and the absence is a gap rather than a rule"                |
| `reference/utilities.md`              | The builder is for "`init --from` at `$HOME`"                                                              |
| `reference/commands/index.md`         | The same builder's Command column: `init`                                                                  |

**A filled gap is invisible to every check we own.** `scripts/check-enumeration-drift.ts` judges
membership: a document naming a symbol the source has lost, or missing one it holds. An absence
claim names nothing that moved. `edit.tsx` gained no import — it inherits a protected method — so
even a grep for the symbol against the two files finds the same two hits before and after. The
sentence that says a thing is NOT there is the one sentence no source-derived check can falsify,
and it is also the sentence most likely to be acted on: the `scope-system.md` line calls the
absence "a gap rather than a rule", which is an invitation to implement what already exists.

The two claims disagreed with each other in the same file, which is the cheap tell nobody looked
for: `seed-contract.md` already stated, in its own `init --from` section, that the refusal
"puts both `--from` paths on the rule the wizard already follows" — while its comparison table two
screens later said `edit --from` declares none.

## Fix Applied

- `seed-contract.md`: the comparison row now reads "Three: two of its own (both flags at once, no
  terminal) plus refusal 2, shared rather than restated"; the `run()` ordering paragraph names the
  refusal inside `producer` and says why it can be asked no earlier; the false Known Limitations
  row is deleted and replaced by the one that is true — the shared refusal is specced only through
  `init-from-home-scope.e2e.test.ts`, and `edit --from` reaches it with no spec of its own.
- `scope-system.md`: `edit --from <id>` gains a row in the enforcement table, and the "absence is a
  gap" paragraph is replaced by why the method lives on `BaseCommand`.
- `commands/edit.md`: the flow's producer step and the `EXIT_CODES.ERROR` row name the refusal.
- `utilities.md` and `commands/index.md`: the message builder is attributed to both commands.
- No source file was touched. The owner ruled on 2026-08-18 that the refusal is correct and
  intended, and that the documentation was the defect.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, beside "A Count Lives in Exactly One Document":

> **A document that asserts an ABSENCE owns a claim no checker can verify, so the absence's own
> vocabulary is what the next pass greps for.**
>
> Membership checks compare names against source and catch a document that names what is gone or
> misses what arrived. They cannot catch "X declares no Y", "X has no equivalent", "the absence is
> a gap", "untested", "unreachable" — the claim names nothing that moves when it stops being true,
> and the inheriting code often adds no import to grep for.
>
> Two obligations follow:
>
> 1. **Filling a gap includes sweeping the sentences that described it.** Grep `.ai-docs/` for the
>    gap's own words — the symbol it said was missing, and the phrases `declares no`,
>    `no equivalent`, `is absent`, `is a gap`, `untested` — before the change is called finished.
>    A finding that records the fix is not the sweep; this one recorded it and five documents
>    stayed wrong.
> 2. **Write an absence so it dates itself.** State what makes it true, not just that it is:
>    "no spec exercises it" and "no caller reaches it" can each be re-derived in one grep, whereas
>    "it declares none" can only be trusted or doubted.

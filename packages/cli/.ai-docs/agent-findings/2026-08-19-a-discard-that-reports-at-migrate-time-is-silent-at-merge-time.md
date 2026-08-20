---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/marketplace-store.ts
  - apps/editor/src/stores/saved-stack-store.ts
  - apps/editor/src/stores/ui-store.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Item 1 landed. `readSavedMarketplaces` now distinguishes an absent slot from an unreadable one and
  reports the second, carrying the failing field's own name and the issue code and nothing past it;
  the store's unit spec pins both branches and pins that no repository the visitor named appears in
  what was reported. Still open, both in code. `readSavedStack` is unchanged and still answers an
  unreadable snapshot with silence, and no note records that as deliberate. And the third question
  the finding asked to be decided rather than inherited is undecided — `savedMarketplacesSchema` is
  still a whole-slot parse, so one malformed entry still costs every credential beside it.
---

## What Was Wrong

A persisted Zustand store has **two** doors an unreadable slot can arrive at, and `persist` opens
exactly one of them per load. Reading the vendored middleware
(`node_modules/zustand/esm/middleware.mjs`, zustand 5.0.14), `hydrate` calls `options.migrate` only
when the stored `version` differs from the configured one, and hands the raw state to `options.merge`
otherwise. So a corrupt blob carrying the CURRENT version never reaches the migration.

`apps/editor/src/stores/marketplace-store.ts` reports at the door it does not need and is silent at
the door it does. `migrateSavedMarketplaces` calls `reportIssue("Discarded an unreadable marketplace
slot", …)` when it refuses a blob — that is the version-mismatch door, and it exists because the
keyed-shape deploy had to meet browsers holding the single slot. The other door,
`readSavedMarketplaces`, is what `merge` calls on every load at the current version, and it answers an
unparseable slot with `EMPTY` and says nothing. Its doc comment states the conflation deliberately:
an unreadable slot and an empty one are the same answer, because the app opens on the public
catalogue either way.

**That is true about the screen and false about the data.** What that slot holds is a GitHub PAT,
which is displayed once and cannot be read back from anywhere. Answering `EMPTY` puts the app in a
state it will write on the next `set`, so the credential is not merely unread — it is gone. The
sibling store already solved exactly this: `config-store`'s `merge` distinguishes
`persisted === undefined` (an empty slot, which is every first visit) from a blob its schema refuses,
returns `current` for the first without a word, and calls `reportIssue("Discarded unreadable saved
configuration", …)` for the second, carrying only paths and issue codes. That is the shape that
reports without filing a warning against every visitor who has never saved anything, and it is the
shape `readSavedMarketplaces` cannot express while both cases collapse to one `safeParse`.

The census over the same doors:

```
grep -rn 'safeParse' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'
```

Six hits in four files. As discovered: two report, four discard silently, and two of those four
discard something the visitor cannot re-obtain by clicking. **The Reports column below is kept
current rather than frozen at discovery** — the third `Yes` is the fix recorded in the lifecycle
note, and leaving it as `No` would make this table the reason someone re-fixes a closed half:

| Site                                                 | Discards                               | Reports |
| ---------------------------------------------------- | -------------------------------------- | ------- |
| `merge` in `config-store.ts`                         | a saved configuration                  | Yes     |
| `migrateSavedMarketplaces` in `marketplace-store.ts` | a slot at a foreign version            | Yes     |
| `readSavedMarketplaces` in `marketplace-store.ts`    | a marketplace **and its PAT**          | Yes     |
| `readSavedStack` in `saved-stack-store.ts`           | a snapshot the visitor made on purpose | No      |
| `merge` in `ui-store.ts`                             | `rosterCollapsed`, re-set in a click   | No      |

`ui-store` is correct as it stands — a view preference is not something to file an issue about.
`saved-stack-store` is the milder half of the same defect: the snapshot is rebuildable, but only by
redoing the selection that produced it.

**Nothing is known to be losing data today.** Reaching the silent door needs a blob that carries the
current version and fails the schema — a partial write, a hand edit, or the case the rule is actually
about: **a shape change shipped without a version bump.** That last one is not hypothetical for a
schema under active edit, and it is precisely the deploy on which a silent discard becomes a mass
credential loss.

## Fix Applied

**Discovery only when written; item 1 has since landed.** The gap was found by reading zustand's
`hydrate` to check whether "the discard branch needs a `reportIssue`" named one branch or two; it
names two, and this store satisfied one. The credential-keying and discard-path rules were written
into `.ai-docs/standards/editor-and-worker.md` in the same pass.

Item 1 is now in the store. `readSavedMarketplaces` returns empty without a word for a slot that was
never written, and reports the one it could not read — the split `config-store`'s `merge` draws, in
the same order and for the same reason, with the reason stated at the call site. Two things were
decided in landing it that the proposal did not anticipate, and both are worth carrying forward:

- **The report is NOT `config-store`'s payload copied.** That payload is `issue.path.join(".")`,
  which is safe there because the schema keys its records by catalogue ids and unsafe here because
  a key IS the repository the visitor named, one field away from their PAT. Only the first path
  segment travels. The general form of that correction is
  `2026-08-19-a-discard-report-copied-verbatim-carries-the-key-the-visitor-typed.md`, which also
  found a second live site of the same class elsewhere in the app.
- **The spec pins the OUTPUT, not the expression.** It feeds the store a slot keyed by the private
  marketplace fixture and asserts that ref appears nowhere in the recorded report, so any rewrite of
  the mapping is held to the same claim.

Items 2 and 3 are untouched, and the lifecycle note above records them.

## Proposed Standard

The general rule is now written — `.ai-docs/standards/editor-and-worker.md` → "A discard path added
for safety becomes a data-loss path at the next schema change" closes with the migrate/merge split
and the grep above. What this finding asks for is the code the rule now condemns, in two parts:

1. **`readSavedMarketplaces` distinguishes an absent slot from an unreadable one, and reports the
   second.** `config-store`'s `merge` is the shape to copy verbatim, including its reason for the
   split — conflating them files a warning against every first-time visitor, which is what makes the
   report worthless and gets it removed again. The store's untrusted read is exported and unit-tested
   already, so the new branch is directly assertable without a browser.

2. **`readSavedStack` gets the same treatment at lower priority**, or an explicit note recording that
   a rebuildable snapshot is deliberately below the reporting bar. Either is fine; the current
   silence says neither.

A third thing worth deciding rather than inheriting: `savedMarketplacesSchema` refuses the WHOLE slot
when any part of it fails, so one malformed entry costs every credential beside it.
`filedUnderAMarketplace` already applies the per-entry version of that judgement — an entry keyed by
nothing is dropped without its neighbours, on the stated grounds that dropping the others with it
would be the very loss the keyed shape exists to make impossible. The top-level parse has not been
brought in line with it.

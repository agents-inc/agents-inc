---
type: convention-drift
severity: low
affected_files:
  - apps/editor/src/features/configure/components/marketplace-switch-dialog.tsx
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
  - apps/editor/src/lib/api/catalog.ts
standards_docs:
  - packages/cli/.ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: web-tester
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code side landed: the switch dialog keeps `kind` on its refused state, closes `fetchCatalog`'s
  sentence before its own, and points at a token only for `unauthorized`. The
  `editor-and-worker.md` row and sentence the Proposed Standard asks for are pending.
---

## What Was Wrong

`editor-and-worker.md` › "The store holds the refusal; the surface owns the words" says a refusal
crosses a seam as a code, and the surface drawing it writes the sentence. Its table lists four seams.
The catalogue seam isn't one of them. `fetchCatalog` in `catalog.ts` hands back both a code
(`kind`) and a finished sentence (`error`, with no full stop).

Census, run 2026-10-26 from the repository root. It lists every surface that renders that sentence:

```
grep -rn -e 'CatalogFailure\b' -e 'CatalogResult\b' -e 'OFFERS_TOKEN' -e 'target.error' -e 'state.error' apps/editor/src | grep -v '\.test\.' | grep -v 'src/lib/api/catalog.ts'
```

There are two surfaces (`seat-catalog.ts` also matches; it only carries the failure to the
Marketplace dialog as a recovery):

- `marketplace-dialog.tsx` renders `error` alone, and reads `kind` (`OFFERS_TOKEN`) to decide
  whether to offer the token field.
- `marketplace-switch-dialog.tsx` throws `kind` away in `toTargetState`. Its `descriptionFor` then
  appends "Nothing has changed — load it from Marketplace to try a token." to `error`.

So the two sentences run together ("…try again Nothing has changed"). A token is also offered for
an unreachable GitHub, a 5xx and an unparsable catalogue, none of which a token can fix. The user
docs (`editor/marketplaces.md`) say the switch describes the target "in the same words the Load
flow uses", and that no token is offered for a catalogue that won't parse. (EDITOR-98)

## Fix Applied

The tester lane wrote the reds in `apps/editor/e2e/specs/marketplace-switch.spec.ts` › "what the
switch dialog says before it can switch". The developer lane then fixed `marketplace-switch-dialog.tsx`:

- `TargetState`'s refused member is now `{ status: "refused" } & CatalogFailure`.
- `refusalDescription` closes the seam's sentence with a full stop. It then adds "Nothing has
  changed." or, for `unauthorized` only, the Marketplace pointer.

`catalog.ts` is unchanged, because `catalog.test.ts` pins its unpunctuated strings. The token rule
is mirrored as a local `OFFERS_TOKEN`. The Marketplace dialog's copy is not exported, and sharing
one rule needs a change in that file. The "offers a token for …" and "offers no token for …"
specs are what a drift between the two copies would redden.

## Proposed Standard

Add the catalogue seam to that section's table: `CatalogFailure` in `apps/editor/src/lib/api/catalog.ts`,
worded by each Marketplace dialog. Add one sentence: a surface that extends a seam's sentence reads
the seam's code first, and closes the seam's sentence before starting its own. This sits inside the
section's existing rule and doesn't conflict with CLAUDE.md.

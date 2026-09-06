---
type: anti-pattern
severity: medium
affected_files:
  - ../skills/src/skills/web-meta-framework-nextjs/examples/core.md
  - ../skills/src/skills/web-meta-framework-nextjs/examples/metadata.md
  - ../skills/src/skills/web-meta-framework-nextjs/examples/parallel-routes.md
  - ../skills/src/skills/web-testing-react-testing-library/examples/scoped-queries.md
  - ../skills/src/skills/web-testing-react-testing-library/examples/user-events.md
  - ../skills/src/skills/web-testing-react-testing-library/examples/accessibility.md
  - ../skills/src/skills/web-error-handling-result-types/examples/async.md
  - ../skills/src/skills/web-error-handling-result-types/examples/combining.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-09-04
reporting_agent: skill-summoner
category: typescript
domain: web
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

The skill-atomicity rule against codebase-specific imports (`@repo/ui`, `@/lib/db`) says which form
is wrong and not what replaces it. The 2026-08/09 rewrite applied it by **deleting the import line**,
which leaves the symbols it bound undeclared — the example still calls `getInvoice(id)`, and nothing
now says where `getInvoice` comes from.

This is the cause behind most of the dangling-symbol instances in
`2026-09-04-a-skill-example-can-call-a-symbol-it-never-declares-and-nothing-opens-it.md`, which
diagnoses the same end state as `missing-rule`. Both readings are right at their own level: no rule
demanded declaration (that finding), and the rule that fired demanded removal without naming a
replacement (this one). The distinction matters because the remedies differ — one adds a rule, the
other makes an existing rule prescriptive.

The baseline-versus-current comparison is what makes the mechanism visible rather than inferable. In
every case below, the baseline file **imported** the symbol and the rewritten file calls it with no
import at all:

- `web-meta-framework-nextjs/examples/core.md` — baseline `import { getInvoice } from "@/lib/data";`,
  rewritten to nothing, `getInvoice(id)` retained.
- `web-meta-framework-nextjs/examples/metadata.md` — same, for `getAllPosts` and `getPost`, both
  still called.
- `web-meta-framework-nextjs/examples/parallel-routes.md` — same, for `getPhoto` at two call sites
  and `getPhotos` at a third.
- `web-testing-react-testing-library/examples/{scoped-queries,user-events,accessibility}.md` — the
  rewrite merged several code blocks into one and kept only the first block's import header, so
  `CheckoutPage`, `ConfirmDialog`, `SearchResults`, `Editor` and `NotificationToast` lost theirs.
- `web-error-handling-result-types/examples/{async,combining}.md` — whole interface and helper
  declarations dropped, not only imports; `validateOrder(order: Order)` had no `Order`.

**The second-order defect is the one worth the finding.** In `parallel-routes.md` the rewrite did
convert one import rather than deleting it — `@/components/modal` became
`"../../../components/modal"` — and got the depth wrong. The file header comment says the example
lives at `app/@modal/(.)photo/[id]/page.tsx`, which is four directories below the root, and the
target is declared in the same file as `components/modal.tsx`. Three `../` resolves to
`app/components/modal`, a path the example itself contradicts. So the rewrite is nought for two:
deleting the import loses the information, and converting it introduced a false claim in the one
place a reader could check it.

Counts here are a **census of the nine skills in this lane**, not of the corpus: eight files, found
by comparing each flagged file against its git baseline. Other lanes hold the rest.

## Fix Applied

Every import restored, in the form the atomicity rule prescribes rather than the aliased form:

- Next.js data functions imported from a relative `lib/data` at the correct depth, counted against
  each block's own file-path header comment — `../lib/data` from `app/page.tsx`, `../../../lib/data`
  from `app/blog/[slug]/page.tsx`, `../../../../lib/data` from
  `app/dashboard/invoices/[id]/page.tsx`.
- `../../../components/modal` corrected to `../../../../components/modal`.
- The React Testing Library blocks given back their own import headers.
- The Result-type files given back their dropped `interface` and validator declarations, plus a
  `declare const` / `declare function` placeholder where a full sample value would have buried the
  pattern being taught.

Two invented stand-ins were also removed while in these files, both replaced by the real API the
baseline used: `reportToErrorService(error)` back to `console.error`, and `readEnv(key)` back to
`process.env[key]` — the latter in the config-loading example, where the point is which values are
read from the environment.

## Proposed Standard

Add to `.ai-docs/standards/skill-atomicity-bible.md`, extending the existing codebase-specific
imports rule rather than sitting beside it:

> **Genericising an import means rewriting it, never deleting it.** `@/lib/data` becomes a relative
> path or a plainly-local module name; it does not become nothing. Deleting the line leaves every
> symbol it bound undeclared, and an undeclared symbol reads as an intended elision rather than as
> the omission it is.
>
> **A relative path is counted against the block's own file-path header.** Where a fenced example
> opens with `// app/@modal/(.)photo/[id]/page.tsx`, the depth of any `../` in it is checkable
> against that comment and against wherever the target is declared in the same file — and this is
> the one part of an example's import that a reader can verify without leaving the page. Where
> counting is awkward, prefer a sibling path (`./product-api`) over a deep one.

Checked against `CLAUDE.md`'s NEVER/ALWAYS rules; it conflicts with none. It is the prescriptive
half of the ban this file's own diagnosis names, and it composes with the sibling finding's rule —
that one requires a declaration to exist, this one says what the declaration looks like when the
thing being declared is the reader's own module.

**A checker is possible for the second half only, and it is cheap.** For every fenced block whose
first line is a `// <path>` comment, resolve each relative import in the block against that path and
report one that climbs above the repository-shaped root, or that names a directory the same file
declares at a different depth. That would have caught the `modal` defect; it would not have caught a
deleted import, which is the sibling finding's narrower free-identifier scan.

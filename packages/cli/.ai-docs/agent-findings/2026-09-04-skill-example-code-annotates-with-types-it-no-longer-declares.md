---
type: missing-standard
severity: medium
affected_files:
  - ../skills/src/skills/web-data-fetching-swr/examples/pagination.md
  - ../skills/src/skills/web-data-fetching-swr/examples/conditional.md
  - ../skills/src/skills/web-data-fetching-swr/examples/caching.md
  - ../skills/src/skills/web-data-fetching-swr/examples/error-handling.md
  - ../skills/src/skills/web-data-fetching-swr/examples/suspense.md
  - ../skills/src/skills/web-data-fetching-swr/examples/mutations.md
  - ../skills/src/skills/web-state-zustand/examples/core.md
  - ../skills/src/skills/web-error-handling-error-boundaries/examples/react-19-hooks.md
  - ../skills/src/skills/web-error-handling-error-boundaries/examples/recovery.md
  - ../skills/src/skills/web-routing-tanstack-router/examples/core.md
  - ../skills/src/skills/web-routing-tanstack-router/examples/auth-and-context.md
  - ../skills/src/skills/web-files-file-upload-patterns/examples/validation.md
  - ../skills/src/skills/web-files-file-upload-patterns/examples/presigned-upload.md
  - ../skills/src/skills/web-i18n-vue-i18n/examples/lazy-loading.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-09-04
reporting_agent: skill-summoner
category: typescript
domain: web
root_cause: missing-rule
status: partial
partial_note: >-
  The eight skills in this lane are repaired and were audited as a census. The other 76 web-*
  skills are unaudited for this class, and no rule or checker exists yet, so nothing stops it
  recurring or reports the files still carrying it.
---

## What Was Wrong

Every path listed above is in the `agents-inc/skills` repository, not this one.

A two-pass programme rewrote the 84 `web-*` skills. Pass 1 tightened example prose and, in doing so,
**deleted `interface` and `type` declarations while keeping every annotation that referred to them**.
The result reads as correct TypeScript and is not: `useSWR<User>(...)` with no `User` anywhere in the
file, `useState<Status>("all")` with no `Status`, `createContext<UIContextValue | null>(null)` with no
`UIContextValue`.

Twenty-two declarations were missing across seven files in this lane's eight skills. `pagination.md`
alone had nine — `Post`, `Item`, `ItemsResponse`, `User`, `PaginatedResponse`, `Product`,
`ProductsResponse`, `Message`, `MessagesResponse` — so no snippet in that file compiled.

Three properties make the class worth a rule rather than a sweep:

1. **It is invisible to every gate the repository has.** `prettier --check` formats markdown and does
   not type-check fenced code; `validate-metadata.mjs` reads `metadata.yaml`. Nothing opens a code
   block. The defect survives both gates green.
2. **It reads as more authoritative than an untyped example, not less.** A reader copying
   `useSWR<User>` believes a `User` shape was specified and goes looking for it.
3. **A "declared somewhere in the file" check is not sufficient, and would have missed the worst
   instance.** `mutations.md` used `Post` as a return type in its first block, where nothing declared
   it, while a *different* `Post` — `{ id, likes, likedByMe }` against the create-post shape — was
   declared 90 lines further down. A file-scoped detector scores that file clean. Two contradictory
   declarations of one name in one document is the more serious defect, and only reading found it.

The same rewrite produced two neighbouring shapes in these files, both also uncheckable: a stated
*reason* that was invented (`captureOwnerStack` was annotated "the export does not exist on every
React 19 patch release", where React documents it as development-only and absent from production
builds), and a real API genericised into a vaguer one (`examples/s3-upload.md` became
`presigned-upload.md` with every S3 mention removed but S3's exact POST-policy condition syntax left
in place, so the reader cannot tell which storage APIs the array forms apply to).

## Fix Applied

The 22 declarations were restored from the pre-rewrite baseline, written to the shape each snippet
actually uses rather than to the old wording. Where one name carried two contradictory declarations,
they were merged into a single declaration every field of which is exercised by a snippet in the
file — the contradiction is removed rather than preserved. Four missing imports and two missing
environment constants were restored the same way, and the two neighbouring claims above were
corrected against `react.dev` and the AWS S3 POST-policy documentation.

No count in this file is a sample: the 22 and the file list are a census of the eight skills in this
lane. Nothing here measures the other 76.

## Proposed Standard

Add to `.ai-docs/standards/skill-atomicity-bible.md`, in the section governing `examples/`:

> **A code block declares every type it annotates with.** A block may leave out an import for
> brevity, and may name a symbol the reader's own project owns — but only where the surrounding
> prose says so in the same breath (`renderList` and `renderDetail` in
> `web-animation-view-transitions/examples/shared-elements.md` are the shape: named in the code,
> announced as the application's own two lines below it). A capitalised name in a type position with
> no declaration and no such announcement is a defect, not a shorthand.
>
> **One name means one thing per file.** Two declarations of the same type in one example file are a
> contradiction even when each block would compile alone, because a reader takes the file as one
> document.

This conflicts with nothing in `CLAUDE.md` or the atomicity bible; the bible governs what goes in
which file and is silent on whether the code in them resolves.

The enforcement worth building is narrow and mechanical: extract every fenced `typescript`/`tsx`
block from `src/skills/**/examples/*.md`, and report each capitalised identifier used in a type
position that the same block-plus-file never declares or imports. That is a linter over extracted
blocks rather than a compile — full type-checking would demand the placeholder components these
examples deliberately leave undefined. Running it over all 84 skills is what turns this finding's
`partial` into a count.

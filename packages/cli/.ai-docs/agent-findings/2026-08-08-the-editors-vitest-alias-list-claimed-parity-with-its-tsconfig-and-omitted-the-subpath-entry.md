---
type: convention-drift
severity: medium
affected_files:
  - apps/editor/vitest.config.ts
  - apps/editor/tsconfig.app.json
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-08
reporting_agent: web-developer
category: dry
domain: web
root_cause: enforcement-gap
status: partial
partial_note: The code side landed with SERVER-02 — `apps/editor/vitest.config.ts` now carries the subpath alias, ordered ahead of the bare one. What is not written down is the rule that a hand-copied alias list has to be checked against the config it claims to copy, or better, that the two should not be two lists at all.
---

## What Was Wrong

`apps/editor/vitest.config.ts` opens with a comment stating exactly what it is:

```ts
// The same aliases `tsconfig.app.json` declares — vitest does not read them.
```

It was not the same. `tsconfig.app.json` declares four paths; the Vitest config declared three. The
missing one was `@workspace/matrix/*`, the subpath entry — and its absence is not a resolution
failure, because Vite matches a string alias **by prefix**. With only the bare entry present:

```
"@workspace/matrix": ".../packages/matrix/src/index.ts"
```

any subpath import is rewritten by concatenation. `@workspace/matrix/seed` became
`.../packages/matrix/src/index.ts/seed`, and the suite failed with:

```
Error: ENOTDIR: not a directory, open '/home/vince/dev/cli/packages/matrix/src/index.ts/seed'
```

Two things make this worth recording rather than just fixing.

**The error names neither the cause nor the file that caused it.** `ENOTDIR` on a path with a `.ts`
file in the middle of it reads as a corrupt install or a bad export map. Nothing points at an alias
list, and nothing points at the config whose comment promised the list was complete.

**It was latent for as long as nobody imported a subpath.** `apps/editor/src` imports
`seedPayloadSchema` from `@workspace/matrix`, the index — so every existing test passed, and the
gap only surfaced when `@workspace/api-mocks` imported `@workspace/matrix/seed`, which is the entry
point `packages/matrix` publishes for exactly that purpose and which `apps/server` already uses. The
first honest use of a published entry point was the thing that broke.

The general shape: a comment asserting parity between two hand-maintained lists is not parity. It
is a claim, and this repository has no gate that reads it. `deps:check` compares each workspace's
tsconfig, vitest config and eslint config to the _shared_ packages they extend — it has no axis for
two configs inside one workspace that are meant to mirror each other.

## Fix Applied

`apps/editor/vitest.config.ts` gained the subpath entry, placed **above** the bare one because
prefix matching makes order load-bearing:

```ts
"@workspace/matrix/": resolve("../../packages/matrix/src/"),
"@workspace/matrix": resolve("../../packages/matrix/src/index.ts"),
```

The trailing slash is what keeps a bare `@workspace/matrix` out of the first entry. Both spellings
now resolve, and the comment above them is true for the first time.

## Proposed Standard

Two options, and the second is better.

**Cheap:** say in `.ai-docs/reference/monorepo-layout.md`, wherever alias configuration is
described, that a Vite/Vitest string alias matches by prefix — so a package with subpath exports
needs a trailing-slash entry ordered ahead of its bare one, and a bare-only alias silently corrupts
every subpath import rather than failing to resolve.

**Better:** stop maintaining the list twice. `apps/editor` states its aliases in
`tsconfig.app.json` and again in `vitest.config.ts`, and the only thing keeping them in step is a
comment. Either derive the Vitest aliases from the tsconfig's `paths` at config load, or drop the
`@workspace/*` aliases from the Vitest config entirely and let the workspace symlink and each
package's `exports` map do the resolving — which is what already happens for
`@workspace/api-mocks`, whose three entry points resolve in this same suite with no alias at all.
That last point is the argument: the aliases may not be needed, and a list nobody needs is a list
that can only drift.

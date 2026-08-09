---
type: convention-drift
severity: high
affected_files:
  - packages/matrix/src/read-model/preload-defaults.test.ts
  - packages/matrix/src/read-model/assignment-defaults.test.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: "Both halves landed. `assignment-defaults.test.ts` gained `web-docs`, `web-graphql-client` and `web-rpc` in `BREADTH_CATEGORIES` first; `preload-defaults.test.ts` now mirrors the same split across its two sets — `web-docs` into `FRAMEWORK_CATEGORIES`, `web-graphql-client` and `web-rpc` into `STATE_CATEGORIES` — each with a comment recording that the kind was split out of a parent already in the set. Placement was verified against the data rather than pasted: the generated matrix puts docusaurus/vitepress in `web-docs` and apollo/urql/trpc in `web-graphql-client`/`web-rpc`, and every one of those rows carries `planning` in PRELOAD_DEFAULTS, while only the two `web-docs` rows carry `reviewer` — which is why the graphql/rpc kinds belong in the state set and not the framework one, whose rule demands the reviewer flavor. `preload-defaults.ts` was not touched. `npx vitest run` in packages/matrix: 258 passed, 0 failed, 7 files. The proposed standard is NOT landed — `.ai-docs/reference/features/configuration.md` still carries no rule that a category id in a classification set is a migration surface, and the three hand-maintained sets are still three copies of one idea."
---

## What Was Wrong

Two read-model suites decide what a skill _is_ by naming the categories it can sit in, as a
`Set<string>` of category ids:

- `preload-defaults.test.ts` — `FRAMEWORK_CATEGORIES` (six ids) and `STATE_CATEGORIES` (two).
- `assignment-defaults.test.ts` — `BREADTH_CATEGORIES` (eight ids).

The comment above each set says why the ids are written out rather than matched on a suffix:
"upstream spells the API frameworks' category `api-api`, so any `*-framework` suffix rule would
read all five of them as something else." That reasoning is right, and the sets are the owner's
rule about kinds. What neither set says is what happens when a category it names is **split**:
the ids it holds keep existing, but some of the skills that made the rule true have moved to a
successor id the set has never heard of.

The CLI-389 taxonomy pass did exactly that. `web-meta-framework` lost Docusaurus and VitePress to
the new `web-docs`; `web-server-state` lost Apollo, urql and tRPC to `web-graphql-client` and
`web-rpc`. Every one of those skills still carries the same `PRELOAD_DEFAULTS` row it always did —
the table is unchanged — but the tests now read those rows as violations:

```
× names the reviewer flavor nowhere but a framework and the process
  web-meta-framework-docusaurus: expected false to be true
× names the planning flavor nowhere but a framework or a state kind
  web-meta-framework-docusaurus: expected false to be true
× preloads its own domain's frameworks and state kinds, and nothing else
  + "web-data-fetching-graphql-apollo", + "web-meta-framework-docusaurus", …
```

Nothing about the data or the owner's rule changed. Only the vocabulary the rule is written in
did, and the sets are the one place a split has to be mirrored by hand.

## Fix Applied

In two passes. `assignment-defaults.test.ts` was repaired first: `BREADTH_CATEGORIES` gains
`web-docs`, `web-graphql-client` and `web-rpc`, with a comment recording that they are there because
the kinds they hold were split out of two ids already in the set — not because a new kind joined the
column. That suite is green.

`preload-defaults.test.ts` was **held back one pass** rather than left broken: a concurrent agent
owned that file (planning-flavor thinning), and its edit changed which flavors those very rows
carry, so two agents writing the same sets would have lost one side's work. Once that edit landed,
the same repair went in one file over, split across the two sets this suite keeps instead of the
one the sibling keeps:

```ts
const FRAMEWORK_CATEGORIES = new Set<string>([
  …,
  "web-docs",        // split out of web-meta-framework
])

const STATE_CATEGORIES = new Set<string>([
  "web-client-state",
  "web-graphql-client", // split out of web-server-state
  "web-rpc",            // split out of web-server-state
  "web-server-state",
])
```

`preload-defaults.ts` itself needs nothing — no row moved, and its section comments name no
category id (checked).

## Proposed Standard

`.ai-docs/reference/features/configuration.md` → the category section already needs a rule about
category ids inside persisted user data (the CLI-424 finding proposes it). This is its sibling and
belongs in the same paragraph: **a category id written into a test's classification set is a
migration surface too. Splitting a category means auditing every set that names the parent, because
the parent id survives the split and nothing type-checks the omission of the child.** A grep for the
parent id is the check, and it costs one line in an apply manifest's M-rows.

The stronger version, worth its own item: these sets are three hand-maintained copies of one idea —
"which categories describe what a project is built with". Deriving them once in
`packages/matrix/src/read-model/` and having both suites import it would make a split a one-line
edit instead of a three-file grep, and would make the omission visible where the rule lives rather
than in whichever suite happens to assert over the moved skill.

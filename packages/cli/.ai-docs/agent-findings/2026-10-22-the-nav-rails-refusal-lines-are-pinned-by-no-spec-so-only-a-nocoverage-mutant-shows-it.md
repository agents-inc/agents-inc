---
type: standard-gap
severity: low
affected_files:
  - apps/editor/src/components/nav-rail.tsx
  - apps/editor/e2e/specs/accounts.spec.ts
standards_docs:
  - packages/cli/.ai-docs/standards/editor-and-worker.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: web
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`REFUSAL_COPY` in `nav-rail.tsx` words six refusals: sign-in and sign-out, each too-many, refused
and unreachable. Its comment states an invariant: keyed by action, "so a refused sign-out does not
say sign-in". No spec asserts any of the six lines. Census, run over the whole repository:

```
grep -rnF -e 'Too many tries' -e 'Sign-in was refused' -e 'Sign-out was refused' \
  -e 'Could not reach sign-in' -e 'Could not reach sign-out' apps packages \
  --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-test
```

Every hit is in `nav-rail.tsx`. The rail's alert is `configure.accountNotice`, and
`accounts.spec.ts` asserts it only as ABSENT, after a sign-out that succeeded. The `a sign-in the
worker will not serve` specs drive exactly the refusal paths: an unreachable sign-in, a refusal
carrying no JSON, and an unreachable sign-out. They assert only that nothing threw and that a button
still shows. So all of these pass every spec: swapping the two actions' tables, passing the wrong
action to `attemptOf`, or deleting `RefusalLine`.

The lines are correct today. A Playwright script routed the worker's auth routes to 429, to 500 and
to an aborted request for each action, and read the nav alert. It printed each of the six expected
lines.

The only signal that anything is missing is in the editor's Stryker report. Only Playwright reaches
the rail, so its string mutants come back NoCoverage. Expressive-TypeScript Pattern 8 would turn the
annotated table into `as const satisfies`, the form most sibling wording tables in `features/`
already use (`grep -rn 'as const satisfies Record<' apps/editor/src/features`). That would make
those mutants disappear without trace
(`2026-10-22-the-expressive-typescript-skill-recommends-as-const-satisfies-which-stryker-never-mutates`).
After that, no gate would show the gap at all.

## Fix Applied

None. This was found during an expressive-TypeScript pass. That pass tried the Pattern 8 conversion
and then reverted it, so the table keeps its annotation and its mutants. The spec lives outside that
lane.

## Proposed Standard

In `accounts.spec.ts`, `a sign-in the worker will not serve`, assert the line as well as the
survival. Assert `accountNotice` `toHaveText("Could not reach sign-in")` on the unreachable sign-in,
and `"Could not reach sign-out"` on the unreachable sign-out. That pair holds the keyed-by-action
invariant, because a swapped table reddens both.

In `editor-and-worker.md` -> "The store holds the refusal; the surface owns the words", the table
names each surface's wording constant. Each row could also name the spec that pins its wording. A
row with no such spec would then be visible as a gap.

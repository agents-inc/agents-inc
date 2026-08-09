---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/scripts/check-shared-vitest-config.test.ts
  - packages/cli/scripts/check-shared-eslint-config.test.ts
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: "Closed 2026-08-08 in the same pass that found it. check-shared-vitest-config.test.ts now pins apps/server by name beside apps/editor and packages/matrix, and check-shared-eslint-config.test.ts now pins packages/api-mocks, which its own test name already claimed. Both pins were shown to fail before being trusted: with apps/server/vitest.config.ts and packages/api-mocks/eslint.config.js moved aside, the two tests failed on exactly the new assertions and nothing else in either file went red, which is the demonstration that the no-suite / no-config exit was unguarded. Files restored and checksum-verified afterwards."
---

## What Was Wrong

All three cross-workspace checks sort a workspace into one of four outcomes, and only one of them
is a failure:

| Outcome                  | Means                                    | `deps:check` |
| ------------------------ | ---------------------------------------- | ------------ |
| `bound`                  | reaches the shared config                | passes       |
| `opted-out`              | carries the `//no-shared-*` key          | passes       |
| `no-suite` / `no-config` | the workspace has no config of that kind | passes       |
| `diverged`               | stands alone and says nothing about it   | **fails**    |

The third row is the hole. It exists for a good reason — a workspace that runs no Vitest has
nothing to agree or disagree with, and asking it to declare a package it would never import would
be noise. But it also means **a workspace leaves the rule entirely by deleting its config**, and
nothing anywhere says which workspaces are supposed to have one.

Each checker's suite ends with a repository-level test asserting no workspace is `diverged`. That
test cannot see this: deleting `apps/server/vitest.config.ts` moves it from `bound` to `no-suite`,
which is clean. The suite would stay green with the workspace's tests no longer sharing any
settings with its siblings, because it would have no settings at all.

The only thing that closes the hole is naming the bound workspaces, and the two suites had done it
unevenly:

- **`check-shared-vitest-config.test.ts`** pinned `apps/editor` and `packages/matrix`, and covered
  `apps/server` only implicitly — the workspace whose hand-restated config is the reason the check
  was written in the first place.
- **`check-shared-eslint-config.test.ts`** was worse for being confident: its test is named "binds
  **every** workspace that holds an eslint config, the CLI included" and enumerated six of the
  seven. `packages/api-mocks` was missing. Its sibling test, which lists the four workspaces
  legitimately holding no config, is complete — so the file pinned the exempt set by name while
  leaving a member of the enforced set unnamed.

Membership in the eslint file was rewritten from a count to `toContain` mid-flight, with a comment
explaining why counting is wrong ("a list pinned to today's membership is a limit that breaks the
next time the repository grows a workspace"). The reasoning is right and the conversion simply
missed a row.

## Fix Applied

`expect(bound).toContain("apps/server")` in the Vitest suite, carrying an assertion message naming
the invariant, and `expect(bound).toContain("packages/api-mocks")` in the ESLint suite. The Vitest
file also gained the "named rather than counted" comment its sibling already carried, so the next
person adding a workspace finds the same instruction in both places.

Neither pin was trusted on the strength of passing. Each was made to fail first, by moving the
binding config aside and watching that one assertion — and only that one — go red.

## Proposed Standard

**A repository-level membership assertion must name every current member, and a test whose name
says "every" is a claim to be checked against the checker's own output rather than against the
list already in the file.** Both gaps here are the same mistake: extending a list by reading it
instead of by re-deriving it. Re-deriving takes one command —

```
bun -e 'import { check } from "./scripts/check-shared-eslint-config.ts";
  for (const v of check().verdicts) console.log(v.outcome, v.workspace)'
```

— and it is the only form that reports a workspace the list has never heard of.

This is the same shape as
[`2026-08-05-roster-expectations-pinned-by-count-not-by-name.md`](./2026-08-05-roster-expectations-pinned-by-count-not-by-name.md)
one level up: that finding moved assertions off counts and onto names, and this one is what the
next question after that becomes — a name list is only as good as the derivation that produced it.

**Secondly, monorepo-layout.md should keep saying that `no-suite` / `no-config` is an exit as well
as an exemption.** The three subsections describing the checks each mention that a workspace with
no config is not judged; none of them says that this is the route by which a bound workspace can
stop being bound, or that the name pins in the suites are what guard it.

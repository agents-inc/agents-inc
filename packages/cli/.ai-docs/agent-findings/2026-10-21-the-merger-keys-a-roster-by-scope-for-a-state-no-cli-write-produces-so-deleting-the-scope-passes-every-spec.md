---
type: audit
severity: low
affected_files:
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/configuration/config-merger.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`rosterIdentity` in `config-merger.ts` keys each roster entry as
`` `${identity}:${scope}${excluded ? ":excluded" : ""}` ``. Dropping the `:${scope}` part leaves
every configuration spec green (21 files, 3922 tests, measured on a scratch copy of the tree on
2026-10-21). A review left open whether that is a missing spec or a defensive part.

**It changes the result for one roster shape only:** the same name or id at both scopes with the
same excluded flag. Calling `mergeConfigs` directly, with an existing roster holding
`web-framework-react` and `web-developer` at both scopes, active, and an incoming roster naming
neither:

| `authoritativeScope` | scope in key        | scope dropped |
| -------------------- | ------------------- | ------------- |
| none (init)          | `global`, `project` | `global`      |
| `"owned"`            | `global`            | `global`      |
| `"all"`              | none                | none          |

With the scope dropped, the final `uniqueBy` treats the project row as a duplicate of the global
one and silently drops it.

**The CLI never writes that shape.** This is a census of every producer feeding the merger:

- Incoming rosters come from a seed. `skills` and `agents` are records keyed by id in
  `packages/matrix/src/seed.ts`, each with one `scope`.
- `edit` always passes an authority (`applyAuthority` in `commands/edit.tsx`), and so does
  `matchGlobalToSession` in `config-gate/propagate.ts`. Only `init` merges with none.
- `init` refuses a project that already has an installation (`refuseInstalledProject`). So the only
  existing roster it merges over is the home fallback, which is the global config.
  `splitConfigByScope` (`packages/compile/src/seed-to-config.ts`) writes active global rows only
  into that config.
- A project's rosters never carry an active global row beside a project-owned row with the same
  identity. `reconcileProjectSplitAgainstGlobal` tombstones the global row, and
  `partitionInlinedConfigEntries` renders the tombstone in its place.

`projectConfigLoaderSchema` does not refuse duplicates, though. A hand-written `config.ts` holding
both rows loads, and `init --from` in a fresh project under a global config written that way does
reach the difference. A spec is possible, but no spec driven through a command can build the case.
Only a direct `mergeConfigs` call can.

## Fix Applied

None. This was discovery only. The scope part is unchanged, because deleting it would silently drop
a hand-written project row. The spec belongs in `config-merger.test.ts`, which this lane does not
own.

## Proposed Standard

None. For cli-tester, the choice is whether to pin the shape. If pinned, it would be a `mergeConfigs`
spec in `config-merger.test.ts` with no authority, an existing roster at both scopes, and an
incoming roster naming neither, asserting both rows survive with `toStrictEqual`. That spec, run
from a scratch copy, passed on the source and failed with the scope dropped. If left unpinned,
the reason belongs beside `rosterIdentity`: the scope part guards hand-written rosters only.

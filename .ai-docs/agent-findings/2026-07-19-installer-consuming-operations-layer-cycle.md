---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/operations/skills/copy-local-skills.ts
standards_docs:
  - .ai-docs/reference/features/operations-layer.md
date: 2026-07-19
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: Pass 8 Cluster D item 14 — installEject consumes copyLocalSkills via a lazy (dynamic) import to avoid the load-time cycle.
---

## What Was Wrong

Cluster D item 14 dedups the eject installer's private scope-split copy block by
having `installEject` (in `lib/installation/local-installer.ts`) consume the
operations helper `copyLocalSkills` (in `lib/operations/skills/copy-local-skills.ts`).

This is a layering inversion: the operations layer sits ABOVE lib and imports lib
freely (`copy-local-skills` imports `resolveInstallPaths` from `installation`). A
plain static import of `copyLocalSkills` into `local-installer` therefore forms a
load-time cycle:

```
installation/index → local-installer → operations/skills/copy-local-skills → installation/index
```

At runtime the bundled CLI tolerates this (usage is inside function bodies), but
under Vitest the cycle corrupts module mocks: `edit.test.ts` mocks
`installation/index` with `{ ...original, ... }`, and the spread snapshots a
partially-evaluated module, breaking the `copyLocalSkills` binding in the edit copy
path (test observed `copySkillsToLocalFlattened` called 0 times). Reproduced with
both barrel and leaf import variants of `resolveInstallPaths`.

## Fix Applied

`installEject` imports `copyLocalSkills` lazily, inside the function body:

```ts
const { copyLocalSkills } = await import("../operations/skills/copy-local-skills");
```

A dynamic import defers loading until the function runs, so there is no load-time
edge and no cycle for the mock spread to corrupt. This matches the existing
cycle-break precedent in `configuration/config-types-writer.ts` (which dynamically
imports `loading/*`). `copyLocalSkills` gained an explicit
`{ deleteAlternateSourceSkills?: boolean }` option so the installer's
delete-on-alternate-source step is preserved; `init`/`edit` leave it off.

## Proposed Standard

Lib modules MUST NOT statically import the operations layer (it inverts the
dependency direction and creates cycles that break Vitest module mocks). When a lib
function must reuse an operations helper, use a lazy `await import(...)` inside the
call site (the `config-types-writer` precedent), or extract the shared logic down
into lib. Document the "no static lib → operations import" rule in
`reference/features/operations-layer.md` alongside the existing "Commands should not
bypass operations" note.

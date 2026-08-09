---
type: anti-pattern
severity: medium
affected_files:
  - tsup.config.ts
standards_docs:
  - .ai-docs/reference/build-and-packaging.md
  - .ai-docs/standards/commit-protocol.md
date: 2026-08-05
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: CLI-381 — `onSuccess` now runs `fs.remove(dest)` before each `fs.copy`, so both copies mirror rather than merge; `packaging.test.ts` asserts set equality between `dist/src/agents/` and `src/agents/`; the merge-vs-mirror distinction is written into `reference/build-and-packaging.md` §5.
---

## What Was Wrong

`tsup.config.ts` sets `clean: true`, but that does **not** clear `dist/src/agents/`. The agent
partials get there through the `onSuccess` hook's `fs.copy(srcAgents, destAgents)`, and `fs.copy`
merges into the destination — it never removes destination entries that no longer exist in the
source. tsup's own clean does not reach the directory either.

The consequence is that **deleted agents survive in `dist/` across incremental builds**. Reproduced
directly while retiring `web-architecture`, `pattern-scout` and `web-pattern-critique`:

```
# after deleting the three agent dirs from src/agents/ and running `npm run build`
$ ls -d dist/src/agents/developer/web-architecture dist/src/agents/pattern
dist/src/agents/developer/web-architecture
dist/src/agents/pattern                       # both still present

# after `rm -rf dist && npm run build`
26 dirs   # correct: 25 agents + _templates/methodologies, no stale entries
```

Why it matters beyond tidiness: `prepublishOnly` runs `bun run build` with no preceding `rm -rf
dist`, and `dist/` publishes wholesale. A maintainer who publishes from a working tree that was
built before the deletion ships the retired agents' `metadata.yaml` and partials. `loadAllAgents()`
discovers agents by globbing `**/metadata.yaml` under the resolved agents dir, and
`build-and-packaging.md` records that the `dist/src/agents/` copy exists precisely as a hedge
against `CLI_ROOT` resolving to `<pkg>/dist` — so the stale copies sit on a path the loader really
does read, carrying ids that are no longer in the `AgentName` union.

This is the same class of defect the config already defends against one line above: the `onSuccess`
hook deletes stray compiled test files because "dist/ publishes wholesale" and the entry negations
proved unreliable. Stale agent directories are the identical hazard with no equivalent guard.

## Fix Applied

Nothing at the time — discovery only, and out of the scope of the roster change that surfaced it.
The local `dist/` was left correct via `rm -rf dist && npm run build`, and the prediction in the
last sentence held: the next roster change reintroduced it (see the 2026-08-07 successor).

**Fixed under CLI-381 on 2026-08-07**, as this finding proposed, in all three places:

- `tsup.config.ts` — `await fs.remove(dest)` before each `fs.copy`, for the agents copy and the
  `config/` copy alike.
- `packaging.test.ts` — the entry set under `dist/src/agents/` must **equal** the set under
  `src/agents/`.
- `reference/build-and-packaging.md` §5 — the merge-vs-mirror distinction, where the copy step is
  described.

The proof was run in the shape the bug takes. Against the working tree as found, `dist/` already
held five retired reviewer directories from CLI-398, and the new assertion was red before a line of
the fix existed. Then, with the old copy step still in place: build, plant
`dist/src/agents/planning/stale-agent/metadata.yaml`, rebuild — the planted directory and all five
retired ones survived. With the fix, the same rebuild left `planning/` holding only `pm` and
`reviewer/` only `reviewer`, and the assertion passed.

## Proposed Standard

In `tsup.config.ts`, make the agents copy replace rather than merge — remove the destination first,
so the copy is a mirror of the source:

```ts
await fs.remove(destAgents);
await fs.copy(srcAgents, destAgents);
```

The same reasoning applies to the `dist/config/` copy immediately above it, which has the identical
merge semantics and the same publish exposure.

Add the invariant to `packaging.test.ts`, which is already the tripwire for the shipped-tests
version of this bug: assert that the set of agent directories under `dist/src/agents/` equals the
set under `src/agents/` exactly — not a subset. A subset assertion passes on precisely the failure
mode described here.

Document the merge-vs-mirror distinction in `.ai-docs/reference/build-and-packaging.md` where the
`dist/src/agents/` copy is described, so the next person adding an `onSuccess` copy step knows the
default is additive.

---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/types/generated/matrix.ts
  - src/cli/commands/eject.ts
  - e2e/commands/eject-home-config-pair.e2e.test.ts
standards_docs:
  - .ai-docs/reference/features/built-in-catalogue.md
date: 2026-08-09
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`eject skills` against the DEFAULT public marketplace fails outright:

```
$ HOME=/tmp/scratch node bin/run.js eject skills
    Error: ENOENT: no such file or directory, open
    '/tmp/scratch/.cache/agents-inc/sources/github-agents-inc-skills-…/src/skills/
     meta-reviewing-infra-reviewing/SKILL.md'
```

The clone succeeded — the cache directory is there and populated. What is missing is one skill:
the copy walks the matrix, and for the default source the matrix is the pre-computed
`BUILT_IN_MATRIX` (`src/cli/types/generated/matrix.ts`, regenerated from the marketplace by
`generate:types` / `generate:matrix`), not the directory it just fetched. `BUILT_IN_MATRIX` names
`meta-reviewing-infra-reviewing`; the live `agents-inc/skills` checkout does not carry it. Every
default-source eject then dies on the first id the vendored catalogue has and the repository does
not.

Reproduced by hand on a scratch HOME, twice: once against a cold cache (network clone) and once
against a seeded one. Same id, same error.

This is invisible to the suite for a structural reason worth recording: **no E2E ejects from the
default source.** Every eject spec used to point itself at the E2E fixture through `CC_SOURCE`, and
under CLI-466 that channel is gone, so the one spec that cannot name a source — `eject` at `$HOME`,
where the invented config IS the global manifest — was the first to run this path and the first to
see it fail.

## Fix Applied

None to the product — out of CLI-466's scope, and the right fix is a decision about which artifact
is authoritative rather than a patch:

- If the vendored matrix is authoritative, the marketplace is missing a skill it claims to ship.
- If the repository is authoritative, `generate:matrix` has drifted and the vendored copy is stale.
- Either way the copy path could fail per-skill with a message naming the id, instead of an
  `ENOENT` naming a cache path.

The spec was re-pointed rather than left red: `eject-home-config-pair` now ejects `agent-partials`,
which reads no skills source at all, writes the same invented config pair through the same
`ensureMinimalConfig`, and stays offline. Its subject (the pair, and that the pair type-checks) is
unchanged; the JSDoc says why the eject type is not incidental.

## Proposed Standard

In [`features/built-in-catalogue.md`](../reference/features/built-in-catalogue.md), beside the
"default source uses `BUILT_IN_MATRIX`" rule: **the vendored matrix and the marketplace it was
generated from are one artifact, and any path that reads the matrix while copying from the fetched
directory needs them to agree.** A `generate:matrix:check`-style gate answers the drift question
for the repository; nothing answers it for a user whose CLI version predates a marketplace change,
so the copy itself should fail per skill with the id, and continue, rather than abort the run on an
ENOENT that names a cache path nobody can act on.

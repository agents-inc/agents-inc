---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/loading/loader.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The lane's specs are fixed (loader.test.ts answers every mocked read by its path through
  `filesOnDisk`); the Proposed Standard is not written into CLAUDE.md, and the other files in the
  package-wide grep below were not judged.
---

## What Was Wrong

`loader.test.ts` mocks `utils/fs` and fed `readFile` with `mockResolvedValueOnce` chains: the first
call got one file's content, the second call the next. Each spec therefore pinned the ORDER the
loader reads files in, not which file holds what. Census of the file at `HEAD` (2026-10-20):
`git show HEAD:packages/cli/src/cli/lib/loading/loader.test.ts | grep -c "mockResolvedValueOnce\|mockRejectedValueOnce"`
→ 14, seven chains.

Two kinds of order were pinned:

- **metadata.yaml before SKILL.md** — "loads the skill and reports nothing when its metadata.yaml
  describes it" and "skips the skill whose metadata.yaml names the placeholder category" handed the
  metadata to the first read and the SKILL.md to the second. A loader that read SKILL.md first, with
  the same result on a real disk, turned both red.
- **glob order** — the agent and plugin-skill specs answered reads in the order `glob` listed the
  files, so a loader that sorted or reordered its list turned them red.

A third spec shows the same pattern doing worse. "reports the skill directory whose metadata.yaml
describes no skill instead of loading it" served the same unparseable YAML to EVERY read,
SKILL.md included, so the skill could never have loaded. A loader that ignored the unusable verdict
and went on to read SKILL.md still produced `skills: {}`, and the spec stayed green. Its name claims
"instead of loading it", and its data could not show that. This was found by reading the spec, then
checked by hand: in the new form, removing the `continue` after the verdict in `loadSkillsFromDir`
turns it red. The old form was not run against that mutant.

## Fix Applied

`loader.test.ts` gained `filesOnDisk(files)`, which answers each `readFile` from the path asked for
and refuses an unlisted path with an `EACCES` error. All seven chains and the serve-everything spec
now go through it, with SKILL.md listed beside metadata.yaml wherever both exist on a real disk. To
check the rewrite, three loader mutations were made by hand in `loader.ts`. Each turned its spec red
and was then reverted:

- the `requireMetadata` default flipped
- `loadPluginSkills` globbing the plugin root instead of `skills/`
- the post-verdict `continue` removed

`source-fetcher-revalidation.test.ts` keeps its one chain on purpose. That chain is a remote
server's ETag changing between two requests, which is the scenario under test, not a read order.

## Proposed Standard

Add to `packages/cli/CLAUDE.md` → "Test Assertions": when a mocked read or fetch stands in for
several files, answer it by its path (or URL), never with a `…Once` chain. A chain asserts the order
of the reads. Keep `…Once` for a single resource whose answer changes over time, and name that in
the spec. This does not conflict with any NEVER/ALWAYS rule. It sits beside the rule against
encoding a known gap in an assertion's arity: the defect is the same, an assertion that holds for a
reason other than the one its name gives.

Scope of the rest, a census of occurrences rather than a judgement:
`grep -rn "mockResolvedValueOnce\|mockRejectedValueOnce\|mockReturnValueOnce\|mockImplementationOnce" src e2e scripts --include='*.ts' --include='*.tsx' | wc -l`
from `packages/cli` → 32 hits in 12 files after this fix. Only the lane's two files were judged.

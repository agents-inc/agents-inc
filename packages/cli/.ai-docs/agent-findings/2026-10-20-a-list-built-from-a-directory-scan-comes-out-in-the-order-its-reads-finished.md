---
type: standard-gap
severity: medium
affected_files:
  - src/cli/utils/fs.ts
  - src/cli/utils/glob-order.test.ts
  - src/cli/lib/plugins/plugin-validator.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The fast-glob half is done. glob() in src/cli/utils/fs.ts sorts its matches bytewise
  (glob-order.test.ts), `validatePluginSkillFiles` and `validatePluginAgentFiles` scan through it
  (plugin-validator-order.test.ts), and eslint.config.js refuses a fast-glob import under src/cli
  outside fs.ts and dist-staleness.ts, which fast-glob-imports-are-funnelled.test.ts holds in every
  zone. listDirectories sorts bytewise too (list-directories-order.test.ts); the other readdir
  calls under src/cli only count or recurse. Nothing stops a new order-sensitive readdir, and no
  standards doc carries the rule.
---

## What Was Wrong

`glob()` in `src/cli/utils/fs.ts` handed back fast-glob's matches in the order fast-glob found
them. Under a `**` pattern fast-glob reads many directories at once and lists each one's entries
when its read finishes, so one unchanged tree answers in a different order from run to run. The
`build plugins` warning in `plugins.test.ts` pinned `(bad-skill, worse-skill)` and sometimes got
`(worse-skill, bad-skill)` (inherited from the investigation of 2026-10-19, not re-run here). The
fix sorted `glob()`. No standard says why, and `glob-order.test.ts` guards `glob()` alone.

Measured 2026-10-20 on Linux (ext4), scratch trees, not committed:

- fast-glob `**/SKILL.md` over 8 skill folders, 3,000 scans of the unchanged tree: 490 distinct
  orders under Node 23.10, 738 under Bun 1.2.6.
- fast-glob `*.md` over one folder: 1 order in 3,000 under both. Within one directory the order is
  fixed; what moves is how the directories interleave.
- That fixed order depends on the runtime. Node 18.20, 22.23 and 23.10 `readdir` and
  `readdirSync` (with and without `withFileTypes`) answered code-unit order on a 400-folder
  directory whose `ls -U` order was not sorted. `opendir` did not sort, and Bun's `readdir` did
  not either. The `generate:*` scripts in `package.json` run under `bun`, and so does
  `agentsinc:dev`. That fits `clean-code-standards.md` 17.3's account of `readdirSync` being
  "hash-scrambled on the runner's ext4".

The live sibling is `validatePluginSkillFiles` in `src/cli/lib/plugins/plugin-validator.ts`. It
calls fast-glob for `**/SKILL.md` directly and keeps that order through `validatePlugin`, through
`validateInstalledPlugins` and `validateRegistryPlugins` in `src/cli/lib/content-validator.ts`, to
`doctor`. Nothing on that path sorts. The real `validatePlugin`, run 500 times under Node on one
plugin whose 8 skills have no frontmatter, listed the 8 skill errors in 115 distinct orders.
`validatePluginAgentFiles` scans `*.md` in one folder and listed its errors in 1 order across the
same 500 runs.

Census of fast-glob importers on 2026-10-20, every tracked file in the repository:

```
git grep -l 'from "fast-glob"' -- '*.ts' '*.tsx' '*.mts' '*.mjs' ':!*.test.ts' ':!*.test.tsx'
```

11 files, all in `packages/cli`. `plugin-validator.ts` is the only one whose scan order reaches
output. `fs.ts` sorts now. The five under `scripts/` and `journey-page.ts` sort, or only count.
`lint-zones.ts` builds sets. `dist-staleness.ts` takes the newest time. `tsup.config.ts` deletes
each match. No other workspace imports fast-glob.

Lead, not triaged: the `readdir` sites whose order a Bun run would change.

```
grep -rnE '\breaddir(Sync)?\(' src scripts --include='*.ts' --include='*.tsx' | grep -vE '\.test\.tsx?:|__tests__/'
```

## Fix Applied

`glob()` sorts its matches with `bytewise`, pinned by `glob-order.test.ts`. That landed in an
earlier round of this programme, not in this pass. This pass wrote this finding only.
`validatePluginSkillFiles` is unchanged: whether it sorts is the owner's call.

## Proposed Standard

A list built from a directory scan that reaches output (printed, returned, written or compared) is
sorted in the helper the scan goes through (`glob()` is the shape), with `bytewise` or a bare
`.sort()` and never `localeCompare`. Give the two reasons above: fast-glob over several directories
changes order between runs, and `readdir` order changes with the runtime.

This conflicts with `.ai-docs/standards/clean-code-standards.md` 17.3 in two places, argued below.
So the rule goes after 17.3 as a paragraph of its own, and 17.3's wording stays as it is.

- **Display.** 17.3 says "Display code is exempt. The rule governs emission, not presentation". The
  live case here, `doctor`'s list of skill errors, is display. That exemption follows 17.3's
  `localeCompare` grep and says how to triage its hits, so a display stays free to sort by locale,
  and the proposal leaves that alone. In display it reaches only the scan's own order, which nobody
  chose and which can change between runs or between runtimes on one unchanged tree.
- **Where the sort goes.** 17.3 sorts "byte-wise, at the emission site", says "The input happened
  to arrive sorted" is not an ordering, and asks for a spec that feeds the generator permuted
  inputs. A sort in `glob()` discharges none of that. A generator whose output is committed still
  sorts where it writes and still carries its permuted-input spec, even when its input came through
  `glob()`. Folded into 17.3 as "sort once, in the scan helper", the wording would let a generator
  rely on `glob()` having sorted its input, which passes the new rule and breaks the old one.

Cross-checked against `CLAUDE.md`'s rule against leaving a nested record's key order to whoever
assembled it. That rule says "once in the writer, not once per producer", and a scan helper is a
producer. It does not conflict, because its subject is the key order of a serialised nested record,
and a scan's list is not one. Where a scan's list becomes such a record, the writer still
canonicalises it, as that rule says.

What would catch a new one: a `no-restricted-imports` entry for `fast-glob` in `eslint.config.js`
over `src/cli/**`, exempting `src/cli/utils/fs.ts` and `src/cli/lib/testing/dist-staleness.ts`.
The second must keep its imports to builtins and fast-glob, per its paragraph in
`clean-code-standards.md`. Every production scan would then go through `glob()`, which
`glob-order.test.ts` pins. Not built. The rule fails on `plugin-validator.ts` until its two scans
move to `glob()`, which is the owner's call. Each block that sets the rule restates its whole list
(`grep -n 'restrictedImports(' eslint.config.js`), so the entry goes into every one. It cannot see
`readdir`, so that half stays a written rule.

## Fix Applied After the Ruling

The owner ruled to take this finding's recommendation, and it landed the same day.

- `validatePluginSkillFiles` and `validatePluginAgentFiles` in `plugin-validator.ts` scan through
  `glob()` and share one shape, `validateEachFile`, so `doctor` lists a plugin's skill and agent
  errors in path order. `plugin-validator-order.test.ts` runs the real scan and has it answer in
  reverse path order. Both its specs were red before the move and green after. `doctor`, run twice
  on a project plugin whose 8 skills have no frontmatter, listed the 8 errors in one order both
  times. The scan the old code made, run 500 times over that skills folder under Node 23.10,
  answered in 77 orders.
- `eslint.config.js` holds a `FAST_GLOB_IMPORT` entry in every `restrictedImports(...)` block that
  covers `src/cli` files, and a block for `src/cli/lib/testing/dist-staleness.ts` restates the
  `src/cli` list without it. `src/cli/utils/fs.ts` already turns the rule off, and specs sit
  outside every block. The first block, over `TYPESCRIPT_SOURCES`, does not carry the entry: for
  `src/**` the `CLI_SOURCES` block after it replaces it, and its other files are `scripts/**` and
  the root tool configs, which import fast-glob
  (`grep -l 'from "fast-glob"' scripts/*.ts tsup.config.ts`).
- Once `glob()` sorted, `marketplace-generator.test.ts`'s ordering spec still passed with the
  generator's own `sortBy` deleted. It now carries `web-state` beside `web-state-mobx`, which
  `glob()` answers the other way round, since '-' sorts before '/'. It is red with the `sortBy`
  removed.

No paragraph went into `clean-code-standards.md`. The owner's rule is that a standard changes only
when a gate fails, and the lint rule now carries the import half. The `readdir` half stays unwritten
and unenforced.

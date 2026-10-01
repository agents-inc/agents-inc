---
type: anti-pattern
severity: high
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/assertions/uninstall-assertions.ts
  - e2e/assertions/four-surfaces.ts
  - e2e/matchers/project-matchers.ts
  - e2e/interactive/init-wizard-plugin.e2e.test.ts
  - e2e/lifecycle/uninstall-reinit-lifecycle.e2e.test.ts
  - e2e/commands/new-marketplace.e2e.test.ts
  - src/cli/lib/__tests__/helpers/config-io.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-09-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: premise-expired
status: resolved
resolved_by: >-
  The shared path builders now resolve the folder through the product's own `sourceFolderInUse`
  (`sourceFolderIn` / `sourceFolderRelIn` in `e2e/helpers/test-utils.ts`, and the defaults of
  `writeTestTsConfig` / `writeRawTestConfig` in `src/cli/lib/__tests__/helpers/config-io.ts`),
  and every whole-source-folder absence goes through `expectNoSourceFolder`, which asks after all
  three names. Both suites green at 7718 unit and 966 e2e.
---

## What Was Wrong

A shared test helper that names ONE of two live layouts does not merely point at the wrong
directory. It changes what the assertions built on it MEAN, and it does so in two opposite
directions that a reader cannot tell apart:

- A **positive** assertion over a folder that is no longer created goes red, loudly, and gets
  fixed. That was 161 of the 966 e2e tests and 50 of the 7718 unit tests.
- A **negative** assertion over that same folder goes silently, permanently TRUE. Nothing reddens,
  nothing is reported, and the suite reads as having got greener.

`expectCleanUninstall(dir, { removeConfig: true })` was the specimen: its whole config claim was
`directoryExists(path.join(dir, DIRS.CLAUDE_SRC))` is `false`. For every install this release
creates, that directory never existed — so eleven call sites asserted nothing at all about
uninstall, and would have gone on passing with the entire `.agents-inc/claude/` pair left on disk.
`init-wizard-plugin.e2e.test.ts`'s "init must not create the source folder on hard-error" was the
same shape, as was `new-marketplace`'s "does not leave the marketplace looking like an
installation".

The third shape is worse than either, because it looks like a positive check: `four-surfaces.ts`
read `path.join(dir, DIRS.CLAUDE_SRC)` and handed it to two `tsc` probes. One wrote a probe file
into a directory that was not there and the other type-checked a path with no file at it — so the
two claims that the generated pair type-checks AND still narrows were being asked of nothing.

The count that says how much a single helper carries, as a census on the repaired tree:

```
grep -rn 'configTsPath(' e2e --include='*.ts' | wc -l   # 249 call sites, 2026-09-20
grep -rln 'configTsPath(' e2e --include='*.ts' | wc -l  # in 90 files
```

Routing that one function through the resolver took most of the 92 red files I never opened from
red to green. (The brief that dispatched this said "~238 call sites in ~86 files"; both were low,
and the re-derivation is above.)

## Fix Applied

The helpers ask the product which layout a directory is on rather than naming one:

- `sourceFolderIn(dir)` / `sourceFolderRelIn(dir)` in `e2e/helpers/test-utils.ts` wrap
  `sourceFolderInUse` from `src/cli/lib/installation/install-layout.ts`. `configTsPath`,
  `configTypesTsPath`, `writeProjectConfig`, `writeConfigTypes`, `writeCorruptConfig` and
  `getEjectedTemplatePath` are built on them.
- The unit side's twins, `writeTestTsConfig` and `writeRawTestConfig`, default the same way.
- `writeProjectConfigIn(baseDir, sourceFolder, …)` stays as the explicit door for a fixture whose
  SUBJECT is one of the two layouts — a resolver-routed helper cannot state which layout it found,
  so it can neither seed nor pin one.
- Every whole-source-folder absence goes through `expectNoSourceFolder`, which asks after
  `.claude-src`, `.agents-inc` and `.agents-inc/claude` and names the one it found.

One helper change that is not about the rename and is worth keeping in view:
`writeRawTestConfig` grew an explicit `configSubdir` because `loadSourceRepoConfig` reads a
DIFFERENT file — a marketplace source repo declares its layout at `.agents-inc/config.ts`, with no
provider folder. Defaulting it to the installation layout turned both of that reader's fault cases
into the absent-file case, with its spec names unchanged.

## Proposed Standard

`.ai-docs/standards/e2e/assertions.md` already carries "a hand-written absence over one name cannot
fail". The half it does not carry, and which this finding is:

**A shared path builder resolves; a spec pins.** A helper called from many specs must ask the
product where a thing is, because the specs calling it do not all describe the same installation.
A spec whose subject IS a location names it outright, as a literal. The two are not a style choice:
a resolving helper cannot pin a layout, and a pinning helper silently reinterprets every assertion
built on it the moment the product's answer moves.

The mechanical tell, worth a line in the same section: **when a rename makes a suite greener, read
the negatives.** 161 tests went red here and were found in minutes; the four assertions that went
vacuously true were found only because R2's brief went looking for them. Nothing in the gates can
see an assertion that stopped being able to fail — the ESLint `no-restricted-syntax` ban on
source-folder literals reaches helpers but says nothing about what a helper's answer MEANS.

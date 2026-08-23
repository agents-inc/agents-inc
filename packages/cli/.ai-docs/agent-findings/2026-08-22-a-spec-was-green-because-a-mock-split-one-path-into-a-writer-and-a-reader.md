---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.test.ts
  - src/cli/lib/configuration/__tests__/config-types-writer.test.ts
  - src/cli/consts.ts
  - src/cli/lib/configuration/config-types-writer.ts
  - src/cli/lib/config-gate/pair-writer.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-22
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The spec that pinned the unreachable state was replaced with the reachable invariant the same
  call actually establishes, and the docblock at that site names the retired premise so it is not
  re-added. The mock that manufactured the state is gone with the constants it overrode. No gate is
  proposed — see "Proposed Standard", which argues the honest answer here is a rule rather than a
  checker. Found while closing
  `2026-08-21-a-fake-home-is-outlived-by-a-frozen-constant-and-a-detached-child.md`; that finding is
  resolved rather than superseded, so the two are cross-referenced in prose rather than linked.
---

# A spec was green because a mock split one path into a writer and a reader that disagreed

## What Was Wrong

`local-installer.test.ts` carried a spec named _"falls back to standalone config-types when no
global install exists"_. It drove `writeScopedConfigs` from a project context with every entry
project-scoped, and asserted the generated `config-types.ts` was the STANDALONE form — inlined
unions, no `SkillId as GlobalSkillId` import.

It passed for months. The state it describes cannot occur.

**Two module-level readings of one fact had been split by a test-only override.** The WRITER of the
global pair is `globalPairPaths()` in `lib/config-gate/pair-writer.ts`, which calls `os.homedir()`
at runtime. The READER that decides which form to emit is `getGlobalConfigTypesPath()` in
`lib/configuration/config-types-writer.ts`, which read the module-load constant
`GLOBAL_INSTALL_ROOT`. In production these are the same directory — the constant was literally
`os.homedir()`, evaluated in the same process. In this spec they were not: a file-wide `vi.mock`
pinned the constant to `/tmp/nonexistent-global-root` while `process.env.HOME` pointed the writer at
a fake home inside the test's temp tree.

So the call under test wrote `<fakeHome>/.claude-src/config.ts` and `config-types.ts` — proved
directly by listing the directory afterwards, `[ 'config-types.ts', 'config.ts' ]` — and then asked
a different directory whether a global install existed. It answered no, and the standalone branch
ran. Reconciling the reader onto call-time `globalInstallRoot()` made the spec red, which is how the
premise was found.

**What the same call actually does is the opposite of what the spec claimed**, and nothing pinned
it: a project-context write establishes the global pair BEFORE generating the project's types,
because `~/.claude-src/config.ts` is where the project's own path is registered. From a project
context the import form is not a branch — it is the only outcome.

**Why nothing caught it.** Every reading of this spec is locally correct. The mock's comment
explains itself accurately ("so `getGlobalConfigTypesPath()` returns null — the dev machine's real
`~/.claude-src/` must never affect tests"), the goal is legitimate, and the assertion is strict and
specific. The defect is not visible at any single site: it is the RELATIONSHIP between an override
of one reading and a second reading the override does not reach. A reviewer would have to hold both
in mind at once, and neither file names the other.

## Fix Applied

The constants became call-time functions under CLI-645, which removed the override's subject. With
the writer and the reader reconciled:

- The spec now asserts what that call establishes — the global pair on disk, named with
  `toStrictEqual` against `STANDARD_FILES.CONFIG_TS` / `CONFIG_TYPES_TS` rather than counted, and
  the project types in the import form.
- Its docblock states the retired premise and why it was reachable, so the deletion is legible as a
  decision rather than as coverage quietly lost.
- The standalone branch is real and is still covered where it IS reachable: at `$HOME`, by
  `configuration/__tests__/config-types-writer.test.ts` -> _"regenerateConfigTypes — standalone
  unions narrow to the on-disk config"_.
- Both files' `Object.defineProperty(consts, "GLOBAL_INSTALL_ROOT", …)` blocks are gone, replaced by
  the `useFakeHome` helper the rest of the suite already uses. Four such blocks and two file-wide
  module mocks were deleted.

Production behaviour did not change and never depended on the divergence: `git show HEAD:…/consts.ts`
has `export const GLOBAL_INSTALL_ROOT = os.homedir();`, so the two readings agreed in every real run.

## Proposed Standard

> **A test override that redirects ONE of several readings of the same fact manufactures a state
> the product cannot be in, and every assertion written on top of it is green about nothing.**
> Before overriding a module-level path constant, grep for the other ways the code under test
> reaches that same path — a runtime `os.homedir()`, a helper like `globalPairPaths()`, a sibling
> constant — and either redirect all of them or redirect none and use the real mechanism
> (`process.env.HOME` plus the setup file's spy). The tell that one was missed is a spec asserting
> an ABSENCE that the call under test is itself responsible for creating.

This belongs in `standards/e2e/test-data.md` -> _An In-Process Command Spec Owns Its `HOME`, Not
Just Its `cwd`_, which already governs the neighbouring case and now carries the constants half.

**No mechanical gate is proposed, and the reason is worth stating rather than leaving as an
omission.** The defect is a disagreement between two symbols that no type relates and no call graph
joins — `GLOBAL_INSTALL_ROOT` and `globalPairPaths()` never appear in the same file. A scan for
`Object.defineProperty(consts, …)` would have found these five sites and would be satisfied by any
other override mechanism; a scan for module mocks of `consts` would report the several legitimate
ones (`PROJECT_ROOT`, `cacheRoot`) alongside. What actually removed the class here was deleting the
divergence's SUBJECT — making the constant a function, which
`src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts` now keeps deleted. That gate is real and
runs; it just holds the cause rather than this symptom.

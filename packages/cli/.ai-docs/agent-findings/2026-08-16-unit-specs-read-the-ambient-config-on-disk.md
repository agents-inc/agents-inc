---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/configuration/config.test.ts
  - packages/cli/src/cli/lib/loading/source-loader.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-16
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

# Three unit specs read whatever config happens to be on the machine

## What Was Wrong

Three specs in the unit project resolve a config from a directory no test owns, so their result
depends on the developer's machine rather than on the fixture they set up:

- `config.test.ts` → `resolveBranding` → `should return default branding when no config exists`
- `config.test.ts` → `resolveBranding` → `should return default branding when projectDir is undefined`
- `source-loader.test.ts` → `should stand the built-in stacks in when the DEFAULT source ships none`

The first two call `resolveBranding` with a directory that has no config; `loadEffectiveSourceConfig`
then falls through to the global rung and reads the real `~/.claude-src/config.ts`. The third runs
`loadSkillsMatrixFromSource({ devMode: true })`, which resolves the default source from the checkout
and reads this repository's own (gitignored) `packages/cli/.claude-src/config.ts`.

Nothing in these specs writes either file, and neither is isolated: the `resolveSource` describe
block in the same file saves and replaces `HOME`, but the `resolveBranding` block does not.

The drift was invisible while the loaders swallowed every failure into `null`. CLI-501's rename
guard made both files invalid — they still carry the pre-rename `source` key — and the three specs
went red on a developer machine while passing under a clean `HOME`, which is how the leak was found.
Verified by re-running the suite with `HOME` pointed at an empty directory: the two `config.test.ts`
specs pass, and the `source-loader` one still fails because its file lives inside the repository.

## Fix Applied

None — discovery only. Fixing them means giving each spec an isolated `HOME` (and, for the
`source-loader` one, an isolated source root), which is a test change outside the rename this pass
was scoped to. The two `config.test.ts` specs would be covered by moving the `resolveBranding`
describe under the same `HOME` save/restore its sibling `resolveSource` describe already uses.

## Proposed Standard

There is no unit-testing standards doc, so this belongs either in `CLAUDE.md` beside the
existing Test Data rules or in a new `.ai-docs/standards/` document. Whichever it is, the rule is
that a unit spec exercising any config-resolution
entry point (`resolveSource`, `resolveBranding`, `resolveAuthor`, `loadSkillsMatrixFromSource`) must
isolate `HOME` — the resolution ladder walks to the global rung by design, so a spec that does not
name a home directory is asserting against the machine. `useFakeHome` already exists for this and is
used elsewhere in the same suite; the rule is that these entry points are the trigger for reaching
for it, not that some specs happen to.

A cheaper mechanical guard, if one is wanted: have the unit project's setup point `HOME` at a
per-run temp directory by default, so reaching the real one has to be deliberate.

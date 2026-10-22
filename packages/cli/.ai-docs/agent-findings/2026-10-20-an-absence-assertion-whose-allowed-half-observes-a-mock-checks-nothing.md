---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/commands/init-from-plugin-install.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/init-unbacked-plugin-refusal.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/init.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Both instances are fixed in REPO-44 step 7 (lane C2-lib-test-specs). The CLAUDE.md sentence
  proposed below is not written, and nothing mechanical catches the next instance.
---

## What Was Wrong

Two `init --from` specs mocked `writeProjectConfig` from `operations/index.js`, and asserted, after
a refused or failed plugin install, `fileExists(getProjectConfigPath(projectDir, "claude"))` is
`false` — "no config.ts may be left behind". With the writer mocked nothing ever wrote that file, so
the check held for any behaviour. Each file did pair the refusal with an allowed case, as
`packages/cli/CLAUDE.md` requires, but the allowed case observed the mock
(`expect(mockWriteProjectConfig).toHaveBeenCalledTimes(1)`), not the file. The pairing rule was
followed and the absence assertion still checked nothing.

A second absence assertion in the lane could not fail for another reason: `init.test.ts` asserted
the dashboard text `not.toContain("Source:")` with no marketplace configured, and the dashboard's
label is `Marketplace:` (`dashboardCountLines` in `commands/init.tsx`).

Census of the mocked-writer half, over `src` on 2026-10-20 after the fix:

```
grep -rlE "^\s+(writeProjectConfig|writeConfigFile|ensureDir|remove|deleteLocalSkill|copySkillsToLocalFlattened|copyLocalSkills): mock" src --include='*.test.ts' --include='*.test.tsx' | xargs grep -lE "\.toBe\(false\)"
```

It returns `edit.test.ts` only. There `copySkillsToLocalFlattened` and `ensureDir` are still mocked.
The `toBe(false)` hits there are `fileExists` checks on deletes that now run for real.

## Fix Applied

`writeProjectConfig` is unmocked in both files. The allowed cases assert `config.ts` exists on disk
after the run; the refused cases keep their `fileExists(...) === false` checks, which can now fail.
The `invocationCallOrder` comparison between the last install and the write is gone: a failed second
install leaving no config is the behaviour it stood for. The dashboard spec asserts
`Mode:         Eject`, a blank line and then the options line, so a marketplace line under any label
fails it.

## Proposed Standard

Widen `packages/cli/CLAUDE.md` › Test Assertions › "NEVER pin an operation as REFUSED without
pinning … a state where the same operation is ALLOWED" by one sentence: the allowed half observes
the same artefact the refused half asserts absent. An allowed half that reads a mock's call count
leaves the refused half's absence check vacuous whenever the writer is mocked. Checked against
`CLAUDE.md`: it narrows that rule and conflicts with none.

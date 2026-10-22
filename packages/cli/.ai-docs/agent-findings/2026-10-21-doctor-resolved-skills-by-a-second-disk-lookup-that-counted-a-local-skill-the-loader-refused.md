---
type: anti-pattern
severity: low
affected_files:
  - src/cli/commands/doctor.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  checkSkillsResolved reads matrix.skills alone, and localSkillIdsVisibleFrom and its
  discoverLocalSkills import are gone. doctor.test.ts carries the global local-skill control and the
  project and global refused-category specs.
---

## What Was Wrong

`checkSkillsResolved` in `commands/doctor.ts` counted a configured skill as found when it was in
`matrix.skills`, or else when `discoverLocalSkills` found it on disk under the project or under
`os.homedir()`. That is the two-tier lookup CLAUDE.md forbids ("NEVER build multi-tier resolution
fallbacks"). The second tier only ever repeated work the loader had already done.
`loadCatalogue` in `lib/loading/source-loader.ts` merges global local skills (when the cwd is not
HOME) and then project ones into the matrix through `mergeDiscoveredLocalSkills`. It does this
before `initializeMatrix`, and doctor's Marketplace check runs `loadSource({ projectDir })` before
the skills row is read.

So the disk lookup changed the answer in one case only: a local skill the loader refuses. A custom
skill whose `category` no installation declares is dropped with "Skipping local skill ... can be
given to no sub-agent". Doctor still found it on disk and printed `Skills Resolved ✓ 1/1 skill
found`, for a skill no sub-agent can be given.

A review flagged the global half of that lookup, saying no spec could tell it was missing. It asked
for a spec with a global local skill absent from the marketplace, inferring the skill "would be
reported as '(not found)'". That inference was false: removing the global half is an equivalent
mutant for any skill the loader accepts. Such a spec passes with or without it. This is the same
shape as `2026-10-20-a-review-asked-for-a-test-to-kill-a-mutant-no-input-through-the-public-entry-can-reach`.
Here, though, the remedy was deletion, and the deletion changed behaviour where the review had
predicted none.

Evidence, from inside the cli-dist lock on 2026-10-21. The probe copies of the spec files are
regenerated from the tree by `make-probes.py` in the lane's scratch directory.

- Reviewed `doctor.ts`, built: `should report a project|global local skill the loader refuses for a
category nothing declares` both fail with `expected ... to contain '- external-web-tooling-house
(not fou…'`. The other three specs in `broken agent references` pass.
- Fixed `doctor.ts`: all 28 in the doctor spec copy pass.
- Fixed `doctor.ts` with the loader's global merge in the built chunk replaced by `if (false)`:
  exactly `should pass when a stack skill exists only as a global local skill` fails. So the global
  half of skill resolution is guarded where it now lives.

## Fix Applied

The second lookup is deleted. `checkSkillsResolved` is synchronous and reads `matrix.skills` alone,
with a one-line docblock saying the loader has already merged both scopes. The specs (a global
control and a refused-skill pair for each scope) were handed to the owner of `doctor.test.ts`.

## Proposed Standard

No new rule. The existing CLAUDE.md multi-tier rule covers it once a "tier" is read as a second
source as well as a second key. Census of the same shape in other commands: a `discoverLocalSkills`
call outside the loader, in code that also reads the matrix.

```
grep -rn "discoverLocalSkills(" src/cli --include='*.ts' --include='*.tsx' | grep -v __tests__
```

Census run on 2026-10-21, after the fix. It found the declaration in `lib/skills/local-skill-loader.ts`
and one call, `mergeDiscoveredLocalSkills` in the loader. No second lookup is left. A future hit is a
lead, not a defect: the check is whether that caller also reads `matrix.skills` for the same ids.

---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/content-validator.ts
  - packages/cli/src/cli/commands/doctor.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor-content.test.ts
  - packages/cli/e2e/commands/doctor-diagnostics.e2e.test.ts
  - packages/cli/e2e/lifecycle/doctor-dual-scope.e2e.test.ts
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  `validateInstalledSkills` now judges only the directories this installation owns — the ids the
  configs in play name, plus the directories carrying `forkedFrom` — and names the rest in a note
  instead of failing on them. The skills content check is marked `readsConfig: true`, so it stands
  down with the other config-reading rows when the config cannot be read.
---

# doctor judged a shared directory as if the CLI owned it

## What was wrong

`~/.claude/skills/` is Claude Code's directory. Anything that installs a skill writes into it, and
this CLI is one tenant among several. `validateSkillsDirectory` listed every subdirectory and
validated each against `skillMetadataBaseSchema`, so a skill some other tool installed was reported
as a fault in the user's install — `[ERROR] ~/.claude/skills/context7-mcp: Missing metadata.yaml`,
about a file the user never wrote and cannot fix from here.

The same distinction was already drawn twice elsewhere and never reached this pass. `uninstall`
asks it through `readForkedFromMetadata` feeding `shouldRemoveSkill`; `edit --from` asks it through
`skillsAuthoredHere`. Both read the marker the CLI stamps into every directory it writes. `doctor`
asked no ownership question at all.

## The rule, and why it is not `uninstall`'s

`forkedFrom` alone is the wrong test for `doctor`, and would have made it worse rather than
different: **the marker lives inside `metadata.yaml`**. A skill whose metadata is missing or
unparseable — the plainest breakage there is, and the one `doctor` most needs to report — can carry
no marker to be recognised by. A `doctor` that goes quiet on that is worse than one that
over-reports.

So ownership is the union of two claims, either sufficient:

- **the configuration in play names the id** — both configs a run reads, because both scopes are
  walked. This claim carries the skills whose metadata is gone, and the hand-authored skills a user
  has told their config about;
- **the directory carries `forkedFrom`** — the CLI wrote it, and it stays this installation's to
  report even after a configuration stops naming it.

A directory neither claim reaches is named in a note and not judged. It is not silence: a check
that walks past a directory without saying so is indistinguishable from one that missed it, and
the note is what keeps the count and the directory listing from disagreeing.

The pass reads the config now, so `doctor`'s `content-skills` row carries `readsConfig: true` and
stands down with the other config-reading rows when the config cannot be loaded — the same gate
`Marketplaces` already used.

## What the fixtures were saying

Eight unit specs and two e2e specs wrote a skill directory that no config named and no marker
claimed, then asserted `doctor` faulted it. They were describing the defect, not an install: a real
ejected skill directory carries `forkedFrom`, because `injectForkedFromMetadata` is on the copy
path. `writeValidInstalledSkill` now stamps provenance as part of what an install IS, rather than
offering it as an option — a fixture that omits it is describing somebody else's file.

## Proposed standard

`.ai-docs/standards/clean-code-standards.md` has no rule for this, and it is not really a code-style
rule: **a pass that walks a directory the CLI does not own must establish ownership before
reporting a fault, and must say what it stepped over.** The two existing definitions of "ours" in
`uninstall` and `installation-payload.ts` are the precedent; a fourth definition would be the thing
to avoid. The natural home is a short section in
`.ai-docs/reference/concepts/scope-system.md`, which already owns where installed content lives —
what it does not yet say is that one of those directories is shared.

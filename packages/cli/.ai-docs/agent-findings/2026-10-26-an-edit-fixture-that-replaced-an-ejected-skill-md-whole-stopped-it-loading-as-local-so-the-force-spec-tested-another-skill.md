---
type: anti-pattern
severity: medium
affected_files:
  - e2e/commands/eject.e2e.test.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
  - CLAUDE.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

Three things, found while writing the reds for CLI-933 (`eject skills --force` and
`eject all --force` overwrite nothing an earlier eject wrote).

**The first draft's edit changed which skill the spec was about.** It stood for the user's edit
by replacing an ejected `SKILL.md` whole with one sentence, the shape the `--output` specs in
`eject.test.ts` use. A `SKILL.md` with no frontmatter no longer loads as a local skill. On the next
run the edited skill was no longer an earlier eject's copy, so `eject skills --force` copied it and
only it ("1 skill ejected") and passed over the rest. The edit came back, so the one assertion the
spec existed for passed against the defect. The red came only from the count. This was seen in
both the unit draft and the e2e draft. With the edit appended instead, all four reds fail as the
row says: `Warning: No skills found in the marketplace to eject.`, exit 0.

**A green unit spec pinned the defect.** "says there is nothing to eject when the project holds a
local copy of every skill" reached that warning by running `eject skills --force` over copies in
the installation's skills folder. That is the CLI-933 defect itself. A fix would have reddened it
and read as a regression. CLAUDE.md's rule against encoding a known gap names arity, length and
absence. This one was a message.

**The `it.fails` it replaces asserted only the success line.** A fix that only lifts the filter
under `--force` would print that line while copying nothing. `copySelectedSkill` in
`lib/skills/skill-copier.ts` records a local skill already at its destination in place
(`resolveLocalCopiedSkill`) rather than copying it.

Census of specs that overwrite a `SKILL.md` with text:
`grep -rnE "writeFile.*SKILL_MD|SKILL_MD.*writeFile" src e2e --include='*.ts' --include='*.tsx' | grep -v renderSkillMd`.
Every hit was read. Two stand for a user's edit to an ejected skill: `eject.test.ts`'s "copies only
the skills not already there" and "again, after the user edited a skill the first run put there".
Both write into an `--output` folder that no loader reads, so the missing frontmatter does not
change which path runs. The rest are deliberate no-frontmatter subjects, hashing inputs, or
fixture builders.

## Fix Applied

- The edits now append to the ejected `SKILL.md`, which keeps the frontmatter.
- The specs check that the content is restored as well as the line.
- The `No skills found` pin moved to a state that still reaches it without `--force`: the
  project's copies are in its skills folder and the eject goes to another `--output`. The `--force`
  case became a red.

## Proposed Standard

`.ai-docs/standards/e2e/test-data.md` (it binds unit specs too, so CLAUDE.md › Test Data could
carry it instead): **a fixture standing for a user's edit to an installed artefact leaves the
artefact valid for whatever reads it.** Append to the body, or change a value inside it. Do not
replace the whole file, unless the spec's subject is the invalid file. The check is the control
beside the spec: run without the flag under test and confirm the edited artefact is still classed
as it was before the edit (here, still counted among the skills already there).

This does not conflict with any CLAUDE.md rule. The green pin is a member of "NEVER encode a known
gap in an assertion's ARITY, LENGTH or ABSENCE". A message reached only through the defect is the
same class, and the rule could name it.

---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/eject.ts
  - src/cli/lib/skills/skill-copier.ts
  - src/cli/lib/loading/source-loader.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-26
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  The eject defect is fixed (CLI-933): `SourceLoadResult.marketplaceSkills` keeps the marketplace's
  entries from before the local merge, and eject filters and copies from them. The proposed
  `CLAUDE.md` rule is not written.
---

## What Was Wrong

`eject skills --force` over an earlier eject copied nothing. The earlier eject's copies load as
local skills, and `mergeLocalSkillsIntoMatrix` puts each one in place of the marketplace's entry.
After that merge, eject read the marketplace's skills through the merged matrix in two places, and
both gave back the local copy:

- `ejectSkills` dropped every id whose `matrix.skills[id]?.local` was set, with or without
  `--force`. So it could not tell an eject's own output from a skill the user wrote somewhere else.
- `copySkillsToLocalFlattened` resolves each id with `getSkillById`. For an id whose local copy is
  already at the destination, `copySelectedSkill` records the copy in place without copying.

`loadCatalogue` already kept the marketplace's ids from before the merge (`marketplaceSkillIds`,
with the comment "Read before any local merge, after which a skill's provenance is no longer
legible"). It kept only the ids, though, so anything that needed the marketplace's own entry went
back through the merged matrix.

## Fix Applied

- `SourceLoadResult.marketplaceSkills` is a shallow snapshot of the catalogue's entries, taken
  beside `marketplaceSkillIds`. The merge replaces entries rather than mutating them, so a shallow
  copy is enough.
- `copyMarketplaceSkillsToLocalFlattened` in `skill-copier.ts` copies each id from that snapshot.
- `ejectSkills` leaves out only a local copy that sits somewhere other than `<destination>/<id>`
  (`isLocalCopyElsewhere`).

Unit and e2e reds were written by the tester. A mutation that restores the old filter line turns
exactly the four `--force` specs red, and the specs without `--force` stay green.

Sibling census, run over product code:

```
grep -rn -E "\.local\b" src/cli --include='*.ts' --include='*.tsx' | grep -v -E "\.test\.tsx?:|__tests__/" | grep -v localPath
```

It returns five sites. Eject's is the only one deciding whether a copy is the user's own:

- `matrix-health-check.ts` suppresses an audit warning.
- `multi-source-loader.ts` (`tagLocalSkills`) tags installed ejects.
- `external-skills.ts` (`heldByLoadedCatalogue`) exempts a local incumbent by documented design.
- `content-validator.ts` is a variable name.

## Proposed Standard

`packages/cli/CLAUDE.md` → Data Integrity: "A command acting on a marketplace's OWN skill reads it
from `SourceLoadResult.marketplaceSkills`. It never goes through `getSkillById` or
`matrix.skills[id]` after the load, because a local copy has replaced the marketplace's entry
there, and an earlier eject's output is such a copy." This proposal does not conflict with
anything checked. The rule beside it, "ALWAYS use `getSkillById`", is about whether a skill
exists, not about which copy of it you get.

---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/seed/external-skills.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-03
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  readCarriedSkill in src/cli/lib/seed/external-skills.ts takes the description from the skill's
  own SKILL.md frontmatter through parseFrontmatter. Held by the two description specs in
  installation-payload.test.ts and e2e/commands/edit-ui-carries-a-whole-description.
---

## What Was Wrong

When a carried (editor-added) skill is installed, its `metadata.yaml` gets a `cliDescription`, which
is the wizard's label cut to the length `doctor` accepts. `readCarriedSkill` rebuilds the entry for
`share` / `edit --ui`, and it read that label back as the entry's `description`. So every re-share
sent the cut text as the skill's description, and the next install cut it again from there.

The description that was cut still lives whole in the skill's SKILL.md frontmatter. The local
loaders already read it from there (`activationDescription` in `local-skill-loader.ts`).

Census of `cliDescription` readers in CLI source, run from `packages/cli`:

```
grep -rn 'cliDescription' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v __tests__
```

Apart from `readCarriedSkill`, the only readers are `local-skill-loader.ts` and `matrix-loader.ts`.
Both use the label as the wizard's display text, which is what it is for. No other reader sends it
anywhere as a full description.

## Fix Applied

`readCarriedSkill` now parses the SKILL.md frontmatter from the tree it already reads. If no
description can be read there, it refuses the skill with one line: "no description can be read from
its SKILL.md". It does not fall back to the label.

## Proposed Standard

`clean-code-standards.md`: a value derived for display (shortened, formatted) is never read back as
the source it came from. Read the source.

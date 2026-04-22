---
type: anti-pattern
severity: medium
affected_files:
  - /home/vince/dev/skills/src/skills/shared-tooling-changesets/SKILL.md
  - /home/vince/dev/skills/src/skills/shared-tooling-changesets/examples/ci.md
  - /home/vince/dev/skills/src/skills/shared-tooling-changesets/reference.md
  - /home/vince/dev/skills/src/skills/cli-prompts-clack/examples/advanced.md
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-03
reporting_agent: skill-summoner
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: skill content fixes applied in skills repo
---

## What Was Wrong

Two API accuracy issues found in AI-generated skills:

1. **shared-tooling-changesets**: Used `changeset publish --snapshot` flag in 4 places. The `--snapshot` flag only exists on `changeset version`, not `changeset publish`. The correct publish command for snapshots is `changeset publish --no-git-tag --tag <name>` (no `--snapshot` flag).

2. **cli-prompts-clack**: Used `this.valueWithCursor` in the @clack/core TextPrompt example. The property was renamed to `this.userInputWithCursor` in the v1.0 release of @clack/core.

## Fix Applied

1. Removed `--snapshot` from all `changeset publish` commands (4 occurrences across SKILL.md, examples/ci.md, reference.md)
2. Changed `this.valueWithCursor` to `this.userInputWithCursor` in examples/advanced.md
3. Added missing `cancelMessage` and `errorMessage` options to spinner API in reference.md

## Proposed Standard

AI-generated skills should always be verified against official documentation or source code before being added to the marketplace. A skill quality checklist should include "verify all CLI flags and API property names against current library source" as a required step.

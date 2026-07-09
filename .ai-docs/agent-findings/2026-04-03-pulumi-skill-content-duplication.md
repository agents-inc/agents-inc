---
type: anti-pattern
severity: medium
affected_files:
  - /home/vince/dev/skills/src/skills/infra-iac-pulumi/SKILL.md
  - /home/vince/dev/skills/src/skills/infra-iac-pulumi/reference.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
  - .ai-docs/standards/skill-atomicity-primer.md
date: 2026-04-03
reporting_agent: skill-summoner
category: dry
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: skill content trims applied in skills repo
---

## What Was Wrong

Two forms of content duplication found in the infra-iac-pulumi skill:

1. **SKILL.md code blocks duplicated in example files**: Pattern 1 (Resource Definitions) had a 12-line bucket example identical to examples/core.md Pattern 1. Pattern 7 (Transforms) and Pattern 8 (Automation API) had substantial code blocks duplicated in examples/advanced.md.

2. **reference.md anti-patterns table duplicated SKILL.md red_flags**: The reference.md had a 10-row anti-patterns table covering the exact same items as the `<red_flags>` section in SKILL.md, violating the "anti-patterns appear in ONE location" rule from the atomicity bible.

This is consistent with the primer's finding that ~30 skills had content duplicated in 2-3 files.

## Fix Applied

1. Trimmed SKILL.md Pattern 1 to a 4-line illustrative snippet (removed imports and exports that were duplicated in core.md). Trimmed Pattern 7 to a single resource-level transform example (removed stack-level transform duplicated in advanced.md). Trimmed Pattern 8 to a compact 8-line example (removed full setup that was duplicated in advanced.md).

2. Replaced reference.md anti-patterns table with a redirect: "For anti-patterns and common mistakes, see the RED FLAGS section in SKILL.md".

3. Updated SKILL.md TOC entry for reference.md and reference.md subtitle to reflect the change.

## Proposed Standard

The skill-atomicity-bible.md "SKILL.md Content Standard" section already documents the ownership rules, but a more explicit callout could help:

In `skill-atomicity-bible.md`, in the "SKILL.md Content Standard" section, add a note:

> **Duplication checkpoint:** After writing SKILL.md snippets, grep for the same code/table in example files and reference.md. If the same content exists in two places, remove it from the lower-priority file (examples own full code, reference.md owns lookup tables, SKILL.md owns brief snippets and red flags).

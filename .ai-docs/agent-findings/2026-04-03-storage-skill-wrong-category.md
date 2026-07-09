---
type: anti-pattern
severity: medium
affected_files:
  - /home/vince/dev/skills/src/skills/desktop-storage-electron/metadata.yaml
standards_docs: []
date: 2026-04-03
reporting_agent: skill-summoner
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: metadata.yaml fix applied in skills repo
---

## What Was Wrong

The `desktop-storage-electron` skill had `category: desktop-framework` in its `metadata.yaml` instead of `category: desktop-storage`. The category field should match the skill's actual category (matching the directory name pattern `desktop-storage-electron` -> category `desktop-storage`). This mismatch would cause the skill to be filed under the wrong category in the CLI's skill selection UI.

## Fix Applied

Changed `category: desktop-framework` to `category: desktop-storage` in the metadata.yaml file.

## Proposed Standard

Add a validation check (or document in the skill authoring guide) that the `category` field in `metadata.yaml` must match the first two segments of the skill directory name (e.g., `desktop-storage-electron` -> `desktop-storage`). This could be enforced by the CLI's skill validation logic or caught by a lint rule.

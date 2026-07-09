---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/reference/testing/mock-data.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: testing
domain: shared
root_cause: enforcement-gap
status: resolved
---

## What Was Wrong

Mock-data doc (`.ai-docs/reference/testing/mock-data.md`) had four categories of drift from actual `src/cli/lib/__tests__/mock-data/*.ts` exports:

1. **Phantom constants**: `PIPELINE_MATRIX`, `REACT_EXTRACTED`, `REACT_EXTRACTED_BASIC`, `VUE_EXTRACTED_BASIC`, `ZUSTAND_EXTRACTED`, `JOTAI_EXTRACTED`, `SINGLE_AGENT_STACK_TEMPLATE`, `MULTI_AGENT_STACK_TEMPLATE` — listed in doc but do not exist in any mock-data file.
2. **Missing constants**: `MULTI_STYLING_MATRIX` exists in mock-matrices.ts but was absent from doc.
3. **Missing section**: `mock-source-files.ts` (7th file in dir, 6 exports) had no section despite being listed in DOCUMENTATION_MAP as "6 files" claim.
4. **Off-by-one count**: `CATEGORY_GRID_SKILLS` documented as "31-entry array" — actual count is 30.

## Fix Applied

- Removed phantom constant references.
- Added `MULTI_STYLING_MATRIX` to single-domain matrix list.
- Added `mock-source-files.ts` section with all 6 `VALID_*_FILE` fixtures.
- Corrected 31→30 on `CATEGORY_GRID_SKILLS`.
- Enumerated names of all `HEALTH_*_MATRIX` (12), `ALL_SKILLS_*_MATRIX` (8), and pre-built pair/trio matrices instead of "etc." shorthand — catches future phantom references.
- Added `MultiSourceSkillEntry` and `ImportSourceSkill` type exports to doc.
- Bumped `last_validated` to 2026-04-21.

## Proposed Standard

Mock-data registry is high-churn (skills/matrices added frequently). Keep validation cadence at 14 days as currently set. When enumerating constants, prefer exhaustive name lists over `*_MATRIX - Pre-built constants` glob references — glob descriptions enable silent drift (phantom `PIPELINE_MATRIX` survived 8 days because doc said only "etc."). Consider adding a light CI check: parse doc constant names and grep source to detect phantom references.

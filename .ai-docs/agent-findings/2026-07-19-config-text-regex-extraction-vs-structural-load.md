---
type: anti-pattern
severity: medium
affected_files:
  - e2e/fixtures/dual-scope-helpers.ts
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
  - e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts
  - e2e/lifecycle/re-edit-cycles.e2e.test.ts
  - e2e/lifecycle/preloaded-preservation.e2e.test.ts
  - e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts
  - e2e/lifecycle/init-then-edit-merge.e2e.test.ts
  - e2e/lifecycle/eject-skill-directory-cleanup.e2e.test.ts
  - e2e/lifecycle/project-only-deselect-integrity.e2e.test.ts
  - e2e/lifecycle/config-scope-integrity.e2e.test.ts
  - e2e/interactive/init-wizard-scope-split.e2e.test.ts
  - e2e/interactive/edit-wizard-dual-scope-indicator.e2e.test.ts
  - e2e/interactive/edit-skill-accumulation.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-19
reporting_agent: main-loop (Pass 7 expressive-TS test-suite survey; no sub-agents per standing instruction)
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: Pass 7 promoted structural-load helpers to e2e/fixtures/dual-scope-helpers.ts (readSkillEntries, readAllSkillEntries, readConfigSkillIds, readAgentEntries, readSelectedAgents) and converted every config.ts regex extractor in the E2E suite to them; two documented raw-text survivors remain (see below).
---

# Config-text regex extraction instead of structural config loads

## What was found

Roughly a dozen E2E files independently hand-rolled parsers over the rendered
`config.ts` TEXT to assert on config state: skills-array block regexes
(`/const skills:\s*SkillConfig\[\]\s*=\s*\[([\s\S]*?)\];/`), per-entry
`matchAll` + `JSON.parse` object scrapes, a brace-counting stack extractor
(preloaded-preservation), a 55-line multi-strategy parser WITH a last-resort
fallback strategy (re-edit-cycles — also a multi-tier-fallback violation), and
a full parser layer for the agents array (agent-scope-toggle-agents-array).

In plain language: the tests re-implemented the product's config parser, badly,
once per file. Each copy was untested infrastructure whose own bugs could mask
or fabricate product bugs — exactly the class CLAUDE.md's "no local
parser/extractor helpers in test files" rule targets. The rule existed but
named `lastFrame()` and rendered output; config.ts TEXT was read as a gray
area, so copies proliferated.

## The standard now

Assert on config state via a structural load, not text. The product loader is
the parser:

- `readSkillEntries(dir, skillId)` — a skill's SkillConfig entries, sorted
  deterministically (scope, then excluded) for order-independent toStrictEqual.
- `readAllSkillEntries(dir)` / `readConfigSkillIds(dir)` — the full skills
  array / just its ids.
- `readAgentEntries(dir)` — the agents array (dual-scope tombstone shapes
  compare with toStrictEqual directly).
- `readSelectedAgents(dir)` — the selectedAgents list.

All live in `e2e/fixtures/dual-scope-helpers.ts` and wrap
`loadProjectConfigFromDir` with an existence assertion.

## Legitimate raw-text survivors (do not "fix")

1. **Generated TYPE text** (`config-types.ts` union parsers in
   global-agent-propagation-type-consistency and config-scope-integrity):
   there is no structural loader for emitted type declarations; the text IS
   the artifact under test.
2. **Hand-mangled arrange artifacts** (config-scope-integrity's regex-surgery
   verification step): the structural loader validates and legitimately
   REJECTS a deliberately mangled config, so a text check is the only way to
   verify the arrange step — documented on-site.

## How to apply

When writing an E2E assertion about config.ts contents, reach for the
dual-scope-helpers structural readers first. Only assert on raw config text
when the text itself is the contract (generator output format tests, type-text
emission) or when the file is intentionally invalid.

---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/agent-findings/2026-04-20-new-agent-toggle-defaults-global-scope.md
  - .ai-docs/agent-findings/2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md
  - .ai-docs/agent-findings/2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md
  - .ai-docs/agent-findings/2026-04-13-e2e-anti-pattern-audit-d168.md
  - .ai-docs/agent-findings/2026-04-14-missing-home-isolation-in-unit-tests.md
  - .ai-docs/agent-findings/2026-04-14-unit-test-home-isolation.md
  - .ai-docs/agent-findings/TEMPLATE.md
standards_docs:
  - .ai-docs/agent-findings/README.md
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: items 1-3 landed (frontmatter-required note in README, scope-discipline-deferred enum + supersedes/superseded_by keys in TEMPLATE). Item 5a (pre-flight frontmatter presence check) landed in README "Pre-Flight Lint Check" section. Item 4 docs-side landed (README "Audit Reports vs Findings" section documents `type: audit` marker + optional `audits/` subdir). Items 5b (root_cause enum-value scan) and 5c (duplicate affected_files+root_cause+date tuple scan) remain unshipped.
---

## What Was Wrong

Audit of all findings surfaced three classes of frontmatter drift that the current README/TEMPLATE do not prevent:

1. **Missing frontmatter entirely.** `2026-04-20-new-agent-toggle-defaults-global-scope.md` had no YAML block at all — a free-form narrative file was committed alongside its own properly-formatted sibling (`2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`). Duplicate root cause, same day, same `affected_files`. No mechanism flagged the missing frontmatter at write time.

2. **Invented root_cause enum value.** `2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` uses `root_cause: scope-boundary-preserved` — semantically defensible ("deferred cleanup preserved scope discipline") but not one of TEMPLATE.md's five allowed values (`missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap`). Finding writers extend the enum rather than picking the closest match.

3. **Document-class conflation.** `2026-04-13-e2e-anti-pattern-audit-d168.md` uses an entirely different schema (`task`, `auditor`, `status`) — it is an audit tracking document, not a single finding. The `agent-findings/` directory mixes two document classes with no structural separation.

4. **Same-day overlapping findings.** `2026-04-14-missing-home-isolation-in-unit-tests.md` (discovery-only) and `2026-04-14-unit-test-home-isolation.md` (fix-applied) cover the same seven files with the same root cause. Both valid as a discovery→fix lineage record, but nothing cross-links them.

## Fix Applied

- Added proper YAML frontmatter to `2026-04-20-new-agent-toggle-defaults-global-scope.md` with a `superseded_by:` key pointing at its authoritative sibling, plus a narrative note flagging the supersession.
- Left `scope-boundary-preserved` untouched — changing it would obscure the writer's intent. Flagged as template-enum-widening candidate below.
- Left `2026-04-13-e2e-anti-pattern-audit-d168.md` untouched — it documents a real cross-cutting audit effort and does not belong in the finding schema.

## Proposed Standard

Amend `.ai-docs/agent-findings/README.md` and `TEMPLATE.md`:

1. **Require frontmatter.** Add to README Stage 1: "Every finding file MUST open with a YAML frontmatter block matching TEMPLATE.md. Files without frontmatter will not be processed by convention-keeper."

2. **Widen `root_cause` enum** to include `scope-discipline-deferred` (or equivalent) for cases where an anti-pattern was consciously preserved to respect task-scope boundaries — this is a distinct cause from the existing five and already occurs in practice.

3. **Introduce `superseded_by:` / `supersedes:` as first-class keys** in TEMPLATE.md to formalize the cross-link pattern applied in this audit.

4. **Split audit documents from findings.** Create `.ai-docs/agent-findings/audits/` for cross-file sweep reports (D-168-style) so the finding directory remains uniform.

5. **Add a convention-keeper pre-processing step**: before synthesis, scan for (a) files without frontmatter, (b) `root_cause` values outside the enum, (c) duplicate `affected_files + root_cause + date` tuples.

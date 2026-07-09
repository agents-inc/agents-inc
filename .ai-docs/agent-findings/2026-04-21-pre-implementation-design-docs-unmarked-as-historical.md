---
type: convention-drift
severity: low
affected_files:
  - docs/excluded-skills-design.md
  - docs/excluded-skills-edge-cases.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: "Added HISTORICAL DESIGN NOTE banner to both docs pointing to .ai-docs/reference/concepts/tombstone-pattern.md; bodies preserved as immutable plan record."
---

## What Was Wrong

`docs/excluded-skills-design.md` and `docs/excluded-skills-edge-cases.md` were pre-implementation planning documents written before the tombstone pattern shipped (D-223, D-224, D-230, D-232). Both docs described design decisions that have since been implemented, revised, or subsumed by the renderer work — but neither doc was labeled as historical, and both looked authoritative to a reader.

This is a distinct drift class from the one captured in `2026-04-21-tombstone-pattern-doc-drift.md`. That finding addressed drift _within_ the authoritative concept doc (`.ai-docs/reference/concepts/tombstone-pattern.md`). This finding addresses a different failure mode: **authoritative-looking `docs/` files that are actually frozen pre-implementation plans, presenting stale design rationale as current state**.

Risk: a contributor (human or agent) grepping `docs/` for "excluded" or "tombstone" context hits the design docs first, treats them as current, and either re-implements already-shipped behavior or rejects shipped behavior as deviating from "design."

## Fix Applied

Added a one-line blockquote banner at the top of each file:

> **HISTORICAL DESIGN NOTE** — This was a pre-implementation plan. The feature has shipped. Current authoritative documentation: `.ai-docs/reference/concepts/tombstone-pattern.md`.

Bodies left intact — the plan record is immutable history, not something to rewrite.

## Proposed Standard

Addition for `.ai-docs/standards/documentation-bible.md` (design-doc lifecycle section):

> **Rule (Design-Doc Lifecycle):** When a pre-implementation design doc (typically in `docs/`) describes a feature that has shipped, mark it with a `HISTORICAL DESIGN NOTE` banner pointing to the current authoritative doc (usually in `.ai-docs/reference/concepts/` or `.ai-docs/reference/`). Do not rewrite the body — the plan record is valuable as a decision trail. The banner is the only mutation.
>
> Trigger: whenever a changelog entry marks a task as shipped and that task was scoped by a `docs/*-design.md` or `docs/*-plan.md` file, check whether the design doc needs a historical banner. The codex-keeper or release checklist is the natural enforcement point.

Mechanism flag (out of scope for this finding): a grep of `docs/**/*.md` for files whose leading H1 contains "Design" / "Plan" / "Proposal" and whose content references shipped task IDs would surface candidates. Defer to a future sweep.

---
type: convention-drift
severity: low
affected_files:
  - ../../../skills/src/skills/meta-reviewing-web-reviewing/SKILL.md
  - ../../../skills/src/skills/meta-reviewing-web-reviewing/examples/core.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-08-06
reporting_agent: general-purpose
category: dry
domain: shared
root_cause: enforcement-gap
status: open
---

## What Was Wrong

While formatting the new `meta-planning-*` skills during CLI-399,
`npx prettier --check "src/skills/meta-reviewing-*/**"` in the skills repository reported 6
pre-existing files with style issues among the `meta-reviewing-*` siblings (the CLI-398
deliverables, including `meta-reviewing-web-reviewing/SKILL.md` and its `examples/core.md`). The
repo's own `format:check` script is therefore red before this pass touched anything, and its
lint-staged hook (`*.{json,yaml,yml,md}` -> `prettier --write`) evidently did not run over those
files when they landed.

## Fix Applied

None — discovery only. The four new `meta-planning-*` skills were formatted with the repo's own
prettier before delivery; the pre-existing sibling drift was deliberately left untouched to keep
this pass's diff scoped to CLI-399.

## Proposed Standard

Skills authored or edited by an agent land prettier-clean under the skills repository's own
config: run `npx prettier --write` over the touched skill directories as the last authoring step,
and treat a red `format:check` limited to files the pass created as a blocking defect. The
sibling cleanup (running `format` over the `meta-reviewing-*` directories) is a one-command fix
whenever the owner wants the skills repo's `format:check` green again; it belongs to a pass that
owns those files, not this one.

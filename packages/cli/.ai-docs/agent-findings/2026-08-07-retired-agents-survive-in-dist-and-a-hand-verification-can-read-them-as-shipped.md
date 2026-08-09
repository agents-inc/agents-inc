---
type: audit
severity: medium
affected_files:
  - tsup.config.ts
  - package.json
standards_docs:
  - .ai-docs/reference/build-and-packaging.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: CLI-381 — the copy step mirrors instead of merging, and the verification-side claim this finding asked for is now an assertion rather than a hand-run one-liner (`packaging.test.ts`, set equality between `dist/src/agents/` and `src/agents/`).
---

## What Was Wrong

CLI-381 records that `tsup` never clears `dist/src/agents/`, so a deleted agent survives incremental
builds and can publish. This is the first landing since that row was filed that actually deletes
agents, and it confirms the row from the other end: after `pretest:e2e` rebuilt the package,
`dist/src/agents/planning/` held five directories — `pm` (correct) plus `ai-pm`, `api-pm`,
`cli-pm` and `web-pm`, none of which exist in `src/` any more.

The consequence the row does not name: **the full E2E suite ran against that dist**, and so would
any hand verification of the built binary. Nothing failed, because no surface asks for the retired
ids once the roster stops naming them — but "the binary compiles only `pm`" is not something a run
against this dist can establish. A future consolidation whose bug IS a lingering reference would
see the stale directory answer it and pass.

## Fix Applied

CLI-381 landed the same day and owns it; this section records what that left behind. For this
landing the four stale directories were removed from
`dist/src/agents/planning/` by hand before the real-binary verification, so the hand run read a
dist that matched `src/`. The run then behaved correctly: the agents step offered one PM, the
install compiled 11 agents including `pm.md`, and no `*-pm.md` was written.

The hand-cleanup was itself incomplete, which is the sharpest available argument for automating it:
it cleared `planning/` and left `reviewer/`, so `dist/src/agents/reviewer/` still held `ai-reviewer`,
`api-reviewer`, `cli-reviewer`, `infra-reviewer` and `web-reviewer` when CLI-381 opened. Both
proposals below have since landed — the mirror is enforced by the copy step and asserted by
`packaging.test.ts`, and `reference/build-and-packaging.md` §5 carries the warning.

## Proposed Standard

When CLI-381 lands, its acceptance should include the verification-side claim, not just the
publish-side one: `dist/src/agents/` must be a mirror of `src/agents/`, checkable in one line
(`diff <(cd src/agents && find . -type d | sort) <(cd dist/src/agents && find . -type d | sort)`),
and worth running as the first step of any roster change's hand verification until the copy step
clears the directory itself.

Until then, `reference/build-and-packaging.md` should carry the warning where the copy step is
described: a stale agent directory in `dist/` is invisible to every gate in the repository —
E2E included, since E2E is what builds it.

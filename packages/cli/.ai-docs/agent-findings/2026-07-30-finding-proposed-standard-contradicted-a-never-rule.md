---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/agent-findings/2026-07-25-register-deregister-path-normalization-asymmetry.md
  - .ai-docs/agent-findings/TEMPLATE.md
standards_docs:
  - .ai-docs/agent-findings/README.md
  - CLAUDE.md
date: 2026-07-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

A finding's **Proposed Standard** section prescribed a remedy that violates a
CLAUDE.md NEVER rule, and nothing in the findings pipeline catches that.

`2026-07-25-register-deregister-path-normalization-asymmetry.md` correctly
diagnosed the register/deregister normalization split, then proposed:

> `deregisterProjectPath` should normalize with `fs.realpathSync(projectDir)`
> ... (falling back to `path.resolve` only if the path no longer exists on disk).

The parenthetical is a two-tier resolution chain — try realpath, then try
resolve. CLAUDE.md's Data Integrity section says: "NEVER build multi-tier
resolution fallbacks (try exact -> try alias -> try directory name). Data matches
on the first lookup or it's an error." Implementing the finding verbatim would
have re-introduced, inside the very helper meant to unify the rule, the class of
defect the rule exists to prevent — and it would have been invisible in review,
because the implementer could cite an approved finding as justification.

The failure mode is structural, not authorial: findings are written by sub-agents
mid-task and are read later as if authoritative. A finding's diagnosis and its
prescription carry the same apparent weight, but only the diagnosis is grounded
in observed code.

## Fix Applied

The normalization fix was implemented WITHOUT the fallback tier —
`normalizeProjectPath()` calls `fs.realpathSync` and lets a non-existent path
throw, which the one caller that must survive it (`uninstall`) already guards
with warn-and-continue. The superseded finding was marked `resolved` with a note
recording the deliberate divergence, so the next reader does not "restore" the
fallback believing it was overlooked.

## Proposed Standard

Add to `.ai-docs/agent-findings/README.md` (new subsection under "Finding
Format"), and mirror it as a comment in `TEMPLATE.md` above the
`## Proposed Standard` heading:

> **A Proposed Standard is a proposal, not an approved instruction.** Before
> writing one, cross-check it against CLAUDE.md's NEVER/ALWAYS rules and the
> relevant `standards/` doc. If the proposal conflicts with an existing rule, say
> so explicitly and argue the exception — do not state it as a bare
> recommendation. Before IMPLEMENTING a proposal from an existing finding, re-run
> the same cross-check: the finding may predate the rule, or may never have been
> checked against it. A finding is evidence about a defect; it is not an
> exemption from the conventions.

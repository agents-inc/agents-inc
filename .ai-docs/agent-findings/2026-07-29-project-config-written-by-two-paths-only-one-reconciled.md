---
type: architectural-drift
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - .ai-docs/reference/concepts/scope-system.md
  - .ai-docs/reference/config/config-writer.md
date: 2026-07-29
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  Code-side fix HAS shipped — both write sites now call the same
  `reconcileProjectSplitAgainstGlobal` helper. Still pending: the proposed "one reconciliation
  helper per artifact, applied at every write site" rule in tombstone-pattern.md, and the
  write-site inventory in config-writer.md.
---

## What Was Wrong

Two production call sites write a project `config.ts` with the global config inlined
(`writeConfigFile(..., { isProjectConfig: true, globalConfig })`), and they had **asymmetric**
cross-scope reconciliation:

| Write site                                                  | Reconciliation before the write                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `propagateGlobalChangesToProjects` (global change fans out) | `retainReconciledSkills` / `retainReconciledAgents` — identity-keyed |
| project-scope save branch of `writeScopedConfigs`           | **none** — `splitConfigByScope` output handed straight to the writer |

The companion finding
(`2026-07-29-category-exclusivity-enforced-only-in-a-keypress-handler.md`) describes both paths as
reconciling "on skill-id equality". That is accurate for the propagation path only. The second
path performed no reconciliation whatsoever, so it broke a strictly larger set of cases: not just
the category-keyed collision, but the plain identity-keyed D-268 / D-259 pairing that the first
path had handled since it was written. A project owning a skill (or agent) at project scope while
the same id was already active globally got TWO active entries in its own `config.ts` — one id
active at both scopes — with no propagation involved and no category rule required to reproduce
it. Four of the seven RED tests written for this defect exercise that second path.

The asymmetry is easy to miss by reading either site alone: the propagation path's reconciliation
lives in named `retain*` helpers directly above it, so the pattern looks established, while the
`writeScopedConfigs` path reaches the same writer through a differently-named local
(`projectSplitConfig`) with no helper call to notice the absence of.

## Fix Applied

Both sites now call one shared `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig,
matrix)` in `local-installer.ts`, immediately before their `writeConfigFile` call. The propagation
site's former `retainReconciled*` helpers were narrowed to their genuine remaining job — dropping
tombstones whose global entry no longer exists — and renamed `retainProjectOwned*`; the tombstone
synthesis they used to own moved into the shared helper so it cannot be reached from one site and
not the other. Verified: full unit suite (5148 tests) and `e2e/lifecycle` + `e2e/commands`
(389 tests) green.

## Proposed Standard

Add to `.ai-docs/reference/concepts/tombstone-pattern.md`, and cross-link from
`.ai-docs/reference/config/config-writer.md`:

> Reconciliation that governs the shape of a written artifact belongs in ONE helper, called at
> EVERY site that writes that artifact. When a second write site for an existing artifact is
> added, the reconciliation is part of the artifact's contract, not part of the caller — copying
> the write call without the reconciliation call produces a shape the reader believes is
> impossible, because the invariant appears enforced everywhere they happen to look.
>
> Documentation corollary: a doc that describes a reconciliation rule must enumerate the write
> sites the rule runs at, by function name. "Reconciled on write" is not a checkable claim;
> "reconciled at these two functions" is, and a grep for the writer that returns a third call site
> is then an immediately visible defect.
>
> Review corollary: when a finding says "both paths do X", verify it against both paths. A path
> that does nothing at all is easily recorded as a path that does the weaker version of X, and the
> resulting fix gets scoped to strengthening X rather than to installing it.

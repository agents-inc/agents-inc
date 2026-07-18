---
type: standard-gap
severity: low
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs: []
date: 2026-07-17
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

The D-227 fix mandated (and this repo already ships on the skill path) an
unconditional `filter((c) => c.excluded)` tombstone-preservation step in
`preselectAgentsFromDomains` / `preselectAgentsFromStack` (agents) and
`populateFromSkillIds` (skills). Combined with a project-preferring active-entry
builder (`buildAgentConfigForName` / `buildSkillConfigForId`), this correctly
preserves a _dual-scope_ pair (active at one scope + tombstone at a **different**
scope) — the intended D-223/D-227 behavior.

However, when the ONLY saved entry for a name/id is a **global-scope excluded
tombstone** and that name/id is then re-included by preselection, the builder
produces a fresh `{ scope: "global" }` **active** entry while the unconditional
filter also preserves the `{ scope: "global", excluded: true }` **tombstone**.
The result is a same-scope active + tombstone pair for one name/id.

This is not collapsed downstream: `config-merger.ts`'s compound dedup key is
`${name}:${scope}${excluded ? ":excluded" : ""}` (see `skillKey`), so
`X:global` (active) and `X:global:excluded` (tombstone) are distinct keys and
both survive into `config.ts`.

Reachability (agents): the fresh stack-init flow runs `preselectAgentsFromStack`
then `preselectAgentsFromDomains`; a lone global agent tombstone for an agent that
belongs to a selected domain but is absent from the stack survives the first pass,
then gets a global active rebuild in the second — yielding the duplicate. The
skill path has the structurally identical latent case.

Existing tests stay green only because they assert via `.find((c) => c.name === X)`
(first match = the active entry), which does not detect the trailing duplicate
tombstone.

## Fix Applied

None — discovery only. The D-227 implementation intentionally follows the
explicitly-mandated structural mirror of the skill-side D-223 fix (unconditional
`excluded` filter, no `!includes` clause), which brings agents to parity with the
already-shipped skill behavior rather than introducing new asymmetry. Making the
tombstone filter scope-aware on the agent path alone would diverge from the skill
path and was out of scope for D-227.

## Proposed Standard

Preselection tombstone-preservation should preserve an excluded tombstone only when
NO active entry is being emitted at the **same** scope for that name/id (i.e. the
pair is genuinely dual-scope). Apply symmetrically to both `buildAgentConfigForName`

- agent preselection and `buildSkillConfigForId` + `populateFromSkillIds`.

Alternatively (or additionally), make `config-merger.ts` treat a same-name/id
active entry at scope S as superseding an excluded tombstone at the same scope S
during its final dedup pass, so any such duplicate is collapsed on write regardless
of upstream source.

Document the dual-scope invariant ("a tombstone may coexist with an active entry
only at a _different_ scope") in a wizard-store / config standards note so future
tombstone code preserves it.

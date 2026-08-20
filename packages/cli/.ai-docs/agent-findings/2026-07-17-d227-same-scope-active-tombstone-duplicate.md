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
status: resolved
resolved_by: "Preselection now drops a saved tombstone whose (id, scope) slot the rebuild has just filled with an active entry, at all three sites that preserved them unconditionally: survivesRosterRebuild (preselectAgentsFromDomains), agentTombstonesOutsideRebuild (preselectAgentsFromStack) and skillTombstonesOutsideRebuild (populateFromSkillIds), all in wizard-store.ts. Four specs in src/cli/stores/d227-same-scope-tombstone-duplicate.test.ts pin the corrected shape on both the agent and the skill path; three of them were it.fails and are now plain assertions."
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

## Correction — the supersession claim was false

This file previously carried `status: superseded` and named the D-277 self-heal as having closed it
by side effect. It had not, and the claim would have been read as a resolution by anyone auditing
the finding rather than the code.

Two things are wrong with it. `dropOrphanedDerivedAgentMasks` runs over the PROJECT split only — it
never sees the global config a fresh stack-init writes, which is the very config this duplicate is
minted into. And the collapse it performs is conditional on a collision clearing, which is a
different question from "an active entry already occupies this slot": `agentKey` / `skillKey` in
`config-merger.ts` keep `X:global` and `X:global:excluded` distinct, so nothing downstream was
merging the pair away.

The duplicate was still reproducible at the store level on the day the supersession was recorded.
The specs that now pin the corrected shape were `it.fails` until the preselection fix landed, which
is the direct evidence: a finding closed by side effect would have made them pass, and it did not.

The lesson generalises past this file. A `superseded_by` or `resolved_by` written from a reading of
another change is a claim about behaviour, and it needs the same evidence any behavioural claim
does — a spec that fails before and passes after. Without one it is indistinguishable from a guess,
and it retires the finding either way.

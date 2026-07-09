---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/configuration/config-merger.test.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-04-17
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: D-221 compound-key authoritative merge shipped (0.137.0)
---

## What Was Wrong

D-221 documented "scope-aware agentKey + post-merge dedup" as the fix for the
agents-array corruption bug. Tracing the E2E test contract against the edit
pipeline showed that the literal fix was insufficient for the P→G test
scenario: scope-aware keys alone preserve stale project rows AND stale global
tombstones during migration, because they have distinct compound keys from the
new global-active entry and the merger's positional `.map()` rewrites only
keys that match.

The actual semantic needed (and now implemented) is: `newConfig.agents` /
`newConfig.skills` is authoritative for every `name` / `id` it references.
Existing entries whose name/id is in new but whose compound key is NOT in new
are dropped — that is precisely how P→G migration removes stale project rows
and how P→G tombstone cleanup is honored at the merger layer.

Two unit tests (one for skills at line 839, one for agents at line 941 of
`config-merger.test.ts` prior to this fix) encoded the OPPOSITE semantic:
"when new has only an active entry, preserve existing tombstone." This held
under the old name-only key because the tombstone had a distinct key and was
never touched. Under the spec's explicitly-stated scope-aware-key +
authoritative semantics, those tests had to be rewritten.

The rule that production wizard flows (`generateProjectConfigFromSkills` +
`toggleAgentScope`) emit BOTH dual-scope entries when dual-scope is
legitimate — and that the merger relies on this invariant to know when a
tombstone should persist vs. be dropped — is load-bearing but was not written
down. Without it, a reader of the merger test file could reasonably conclude
tombstones should be preserved on merge regardless of what new says.

## Fix Applied

1. `mergeConfigs` now uses compound identity keys
   `${name}:${scope}${excluded ? ":excluded" : ""}` for agents and
   `${id}:${scope}${excluded ? ":excluded" : ""}` for skills.
2. Merge semantics: for each existing entry, rewrite in-place if new has a
   matching compound key; drop if the name/id is in new but the exact slot is
   not; preserve as-is only if the name/id is absent from new.
3. A final `uniqueBy` pass on compound key collapses any pre-existing on-disk
   duplicate rows so corruption is not propagated across edit cycles.
4. Rewrote two unit tests that documented the old preserve-tombstone-on-merge
   behavior to instead document BOTH the new authoritative-for-name semantic
   AND the dual-scope preservation pattern (where `newConfig` carries both
   entries explicitly).

## Proposed Standard

Add a section to `.ai-docs/standards/` (or wherever merger semantics live —
today this is only documented via the jsdoc in `config-merger.ts`) stating:

> The authoritative shape of agent/skill entries at merge time comes from
> `newConfig`. Tombstones, dual-scope pairs, and scope migrations must be
> explicitly represented in `newConfig.agents` / `newConfig.skills`. The
> merger does not infer preservation of existing entries whose name/id is
> already represented in new. This is how the wizard's scope-toggle
> intentions (tombstone creation on G→P, tombstone removal on P→G) reach
> the written config.

Cross-reference in `.ai-docs/DOCUMENTATION_MAP.md` under configuration.

---
type: standard-gap
severity: low
affected_files:
  - src/cli/lib/__tests__/content-generators.ts
  - e2e/interactive/update.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

CLAUDE.md bans hand-written metadata/frontmatter template strings in tests ("NEVER
write inline SKILL.md frontmatter or agent YAML template strings — use
`renderSkillMd()`, `renderAgentYaml()` from `content-generators.ts`").
`renderMetadataYaml()` is that family's `metadata.yaml` renderer, and a sweep of
inline `metadata:` strings across e2e spec files converted them to it.

One site cannot be converted. `e2e/interactive/update.e2e.test.ts` declares a local
`outdatedForkMetadata(displayName, forkedFromId)` helper that emits a skill whose
`forkedFrom.contentHash` is a stale `"0000000"` and which deliberately has **no
top-level `contentHash` field at all**. That absence is the fixture's point: it is
what `update` keys on to report the skill as outdated.

`renderMetadataYaml`'s `SkillMetadataFields` types `contentHash` as **required**, and
the renderer emits `contentHash: "<value>"` unconditionally. There is no way to
express "no top-level contentHash". Converting the helper would silently add a field
the fixture never had, changing what the command under test sees. A second, smaller
mismatch: the local helper `join("\n")`s with no trailing newline, whereas
`renderMetadataYaml` always appends one.

This is not a bug in either file — it is a gap between a blanket "always use the
renderer" rule and a renderer that cannot represent every legitimate fixture shape.
The risk is that a future sweep reads the rule as absolute and forces the swap,
quietly breaking an outdated-detection test in a way no assertion names.

## Fix Applied

None — discovery only. The local `outdatedForkMetadata` helper in
`e2e/interactive/update.e2e.test.ts` was deliberately left as-is; this pass was
strictly behaviour-preserving. All other inline `metadata:` strings in the five
files swept this round were converted to `renderMetadataYaml()` after verifying
field-for-field parse equivalence.

## Proposed Standard

Two options, in preference order:

1. **Make the renderer able to express the shape.** Change `contentHash` in
   `SkillMetadataFields` (`src/cli/lib/__tests__/content-generators.ts`) from
   required to optional and emit it conditionally, matching how every other field
   in that renderer already behaves. Then convert `outdatedForkMetadata` to a thin
   wrapper over `renderMetadataYaml`. This removes the exception rather than
   documenting it. Note this is an assertion-affecting change (it alters emitted
   bytes for any caller relying on the required field) and needs its own
   verification run, so it does not belong in a behaviour-preserving sweep.

2. **If the required field is intentional, document the carve-out.** Add to
   `.ai-docs/standards/e2e/anti-patterns.md`, in the test-data/fixtures section, a
   note that `renderMetadataYaml` always emits `author` and `contentHash`, so a
   fixture that must _omit_ either one is a sanctioned exception to the
   no-inline-metadata rule — and name `outdatedForkMetadata` in
   `e2e/interactive/update.e2e.test.ts` as the known instance, the same way the
   two "documented raw-text survivors" are named elsewhere.

Either way, the general lesson for the CLAUDE.md rule is worth stating explicitly:
**a shared renderer is only mandatory where it is field-for-field expressive.**
When a renderer forces a field the fixture must not have, the correct move is to
report the gap, not to swap and let the extra field ride.

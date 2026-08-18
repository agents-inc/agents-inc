---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/__tests__/content-generators.ts
  - e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

CLAUDE.md bans hand-written metadata/frontmatter template strings in tests, and
`renderMetadataYaml()` in `src/cli/lib/__tests__/content-generators.ts` is the
`metadata.yaml` renderer that rule points at. Adopting it is usually presented as a
mechanical swap.

It is not always mechanical. `renderMetadataYaml` emits a **fixed field order**
(`custom`, `domain`, `author`, `displayName`, `category`, `slug`, `cliDescription`,
`usageGuidance`, `contentHash`, `forkedFrom`) that the caller cannot influence —
passing the object's keys in a different order changes nothing, because the renderer
builds its line array positionally. So an inline string whose fields happen to be in
a different order is **not** byte-replaceable, even when every key and every value is
identical.

Concretely, `HONO_METADATA` in
`e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts` was written as
`author, category, domain, slug, displayName, cliDescription, usageGuidance,
contentHash`. The renderer emits the same eight pairs as `domain, author, displayName,
category, slug, cliDescription, usageGuidance, contentHash`. Same keys, same values,
different bytes on disk.

Why that matters: nothing in the sweep instructions distinguishes "the file's
assertions changed" from "a fixture file's bytes changed". A byte change to a fixture
is invisible to review and invisible to the test names, but it is only safe if two
things hold — (1) the consumer parses the file rather than pattern-matching it, and
(2) no assertion in the suite reads that file as raw text. Both happen to hold here:
`metadata.yaml` is YAML-parsed (mappings are order-independent), the skill
`contentHash` recorded at install time is a hash of `SKILL.md` and not of
`metadata.yaml` (`src/cli/lib/skills/skill-metadata.ts`), and the file's only
`readTestFile` calls target compiled agent `.md` files. The swap was therefore made
after checking all three. Had any `toContain`/`toMatch` read the metadata text, the
correct answer would have been to leave the inline string alone.

The three other sites swept this round (`vitestMetadata` in
`dual-scope-same-source-eject`/`-plugin`, `reactMetadata` in
`edit-global-agent-removal-propagation`/`edit-global-propagation-stale-stack-ref`)
already matched the renderer's order and were byte-identical.

## Fix Applied

All five sites converted to `renderMetadataYaml()`. Equivalence was proven
mechanically rather than by eye: a scratchpad script imported the real renderer,
compared each new call's output against the exact previous inline string, and
reported `byteIdentical` plus a sorted-line `parseEquivalent` check. Result — four
sites byte-identical, one (`HONO_METADATA`) parse-equivalent with reordered fields,
verified against the "no raw-text assertion on metadata.yaml" condition above before
being accepted. No value (`author`, `contentHash`, `cliDescription`, …) was altered
at any site.

## Proposed Standard

Add to `.ai-docs/standards/e2e/test-data.md`, in the fixture-content section, a
`renderMetadataYaml` adoption rule with three steps, and treat it as the general
recipe for adopting any fixed-order renderer:

1. **Compare emitted bytes, do not eyeball the field list.** Diff the renderer's
   output against the exact string being replaced. Same keys and values is not the
   same thing as same file.
2. **If the bytes differ, justify it explicitly.** The swap is only sound when the
   consumer parses the artifact (so ordering is semantically inert) _and_ no
   assertion in the suite reads that artifact as raw text. Record both checks in the
   change description; if either fails, keep the inline string and report the site.
3. **Never hand-edit the replacement to force byte parity.** Writing a YAML string
   to preserve ordering re-introduces the anti-pattern the rule exists to remove.

Related and adjacent, not duplicate: the renderer cannot express a field's _absence_ either
(`contentHash` is typed required on `SkillMetadataFields`), and this one covers the case
where it can express every field but not their _order_. Both point at the same underlying lesson —
a shared renderer is mandatory only where it is expressive enough to reproduce the
fixture exactly, and the burden is on the sweep to prove that per site.

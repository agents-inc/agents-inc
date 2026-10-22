---
type: audit
severity: low
affected_files:
  - src/cli/lib/seed/external-skills.ts
  - src/cli/lib/__tests__/factories/seed-factories.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

A carried skill's `cliDescription` is written from the payload's `description`, and a share reads
`description` back from the installed `SKILL.md` frontmatter (`readCarriedSkill`, on purpose: the
truncated label would shorten the skill on every trip). Where the two differ, the first
`edit` → `edit --from` round trip of an untouched configuration rewrites `metadata.yaml` and
reports `~ <skill> (skill: files rewritten)`. Hand-run on 2026-10-21 with the built CLI, a payload
whose external description was `Write the test first, watch it fail, then write the code` over a
`SKILL.md` saying `Write the test first`:

```
Changes:
  ~ Test-Driven Development (skill: files rewritten)
--- metadata.yaml diff (before < > after):
8c8
< cliDescription: Write the test first, watch it fail, then write the code
---
> cliDescription: Write the test first
```

Only that line moves, and after the first trip the two agree, so it settles. Whether the editor's
payloads carry a description that differs from the manifest's was not checked.

The test factory has the same split by default: `buildSeedExternalSkill` describes its skill as
`Structured brainstorming for hard problems` over a `SKILL.md` describing it as
`Structured brainstorming`. A round-trip spec built on the defaults therefore sees a change it did
not make, which hid the metadata-order defect it was written to catch: the apply had a genuine
line to write either way.

## Fix Applied

None to the behaviour. The round-trip specs written for the order fix state their description
explicitly: `external-skills.test.ts` matches the manifest, so nothing changes, and
`init-from-external-skills.e2e.test.ts` keeps them apart on purpose, so the apply writes and the
spec can hold every other byte still.

## Proposed Standard

An owner question rather than a rule: should an install write `cliDescription` from the manifest
the share will read back, so a round trip is a no-op from the first trip? Separately, the factory's
default could agree with its own manifest, with the disagreement opted into by the specs that want
it.

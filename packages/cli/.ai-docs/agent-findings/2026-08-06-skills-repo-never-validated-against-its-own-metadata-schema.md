---
type: standard-gap
severity: medium
affected_files:
  - src/schemas/metadata.schema.json
  - src/cli/types/generated/source-types.ts
  - package.json
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-08-06
reporting_agent: agent-summoner
category: typescript
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

The skills marketplace repository (`/home/vince/dev/skills`) and this package's generated
contract for it have drifted apart, in both directions, with nothing that reports it.

**1. Six skills that exist on disk are absent from every generated artifact.**
`meta-design-composable-components`, `web-styling-design-tokens`, `web-styling-theming`,
`web-testing-visual-regression`, `web-ui-base-ui` and `web-tooling-component-library` landed in
`src/skills/` on 2026-08-05. None of their slugs appear in `src/cli/types/generated/source-types.ts`
or in the `slug` enum of `src/schemas/metadata.schema.json`. Two consequences follow immediately:

- Every one of the six `metadata.yaml` files declares
  `# yaml-language-server: $schema=.../cli/main/src/schemas/metadata.schema.json`, so an editor
  validating them against `main` reports all six as having an invalid `slug` — the authors of the
  next skill will see a red squiggle on correct work and have no way to tell it from a real defect.
- The skills are invisible to `SkillId`, `SKILL_MAP` and the matrix, so nothing can select them.

**2. Forty-five skills already on disk violate a hard schema constraint.** `cliDescription` is
`maxLength: 60`; 45 of 230 skills exceed it, several by more than 40 characters
(`ai-provider-google-gemini-sdk` is 104). These are not new — they predate the six above, which all
comply. The constraint is therefore either not enforced anywhere or was tightened after the fact
without a migration.

**3. Two directories are not skills at all.** `api-search-getxapi` and `api-search-xquik` contain
an `examples/` folder and nothing else — no `metadata.yaml`, no `SKILL.md`, no `examples/core.md`.

The single cause behind all three: **nothing validates the skills repository against
`metadata.schema.json` on any schedule.** The only gate is `generate:types:check` in
`prepublishOnly`, which (a) runs `generate:types` first and so regenerates rather than reports,
(b) reads whatever the publishing machine happens to have checked out at
`../skills`, and (c) never runs in CI. A publish would quietly absorb the six new skills; it would
not tell anyone that 45 descriptions are over length or that two directories are empty shells.

## Fix Applied

None — discovery only. The finding was produced during a consistency pass whose write scope was
the six new skill directories; every file named above is outside it. Within scope, the six new
skills were brought into full compliance (five required tags, mirrored bookends, correct
`category`/`slug`/`author`, `cliDescription` ≤ 60, an authored `examples/core.md` for
`web-tooling-component-library`, and prettier clean).

## Proposed Standard

Two changes, in this order:

1. **A validation command that reports instead of regenerating.** `generate:types:check` conflates
   "is the generated output current" with "is the source valid". Add a separate
   `validate:skills` that walks `../skills/src/skills/*/metadata.yaml`, validates each against
   `src/schemas/metadata.schema.json`, and additionally asserts the two file-structure rules the
   schema cannot express — `SKILL.md` exists, `examples/core.md` exists. It must exit non-zero on
   the first violation and name the file. Run it in CI on the skills repository, not only at
   publish time, since that is where the source actually changes.

2. **A rule in `skill-atomicity-bible.md` → "Quality Gate Checklist" → "Schema Compliance"** making
   the round trip explicit. The section currently says `npx agents-inc validate` passes, which is
   necessary but describes only one direction. Add: _"A new skill is not complete until
   `generate:types` has been re-run and the new slug appears in
   `src/cli/types/generated/source-types.ts` and in the `slug` enum of
   `src/schemas/metadata.schema.json`. Until it does, the skill's own `$schema` reference rejects
   it."_ The bible is where a skill author looks; `package.json` scripts are not.

The 45 over-length `cliDescription` values are a separate remediation and should be tracked as its
own item rather than folded into either change — deciding whether to shorten 45 descriptions or
relax `maxLength` is a product call, not a tooling one.

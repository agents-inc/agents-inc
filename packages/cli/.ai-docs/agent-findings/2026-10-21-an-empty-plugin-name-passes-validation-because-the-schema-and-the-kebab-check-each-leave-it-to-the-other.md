---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/plugins/plugin-validator.ts
  - src/cli/lib/schemas.ts
  - src/cli/lib/__tests__/kebab-name-judges-agree.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`validatePlugin` returns `{"valid":true,"errors":[],"warnings":[]}` for a `plugin.json` whose
`name` is `""`, and the same for `"version": ""` beside a valid name. In
`pluginManifestObjectSchema`, `name` and `version` are a bare `z.string()`. `validatePluginManifest`
runs its kebab-case and semver checks only behind `isNonEmptyString`, which skips `""`. Each layer
leaves the empty string to the other, so neither refuses it. The guard it replaced
(`manifest.name && typeof manifest.name === "string"`) skipped it as well. `doctor` reaches this
code through `validateInstalledPlugins`. The agent frontmatter does not have the gap, because
`agentFrontmatterValidationSchema.name` carries `.regex(KEBAB_CASE_PATTERN).min(1)`.

The other three kebab-case judges each refuse `""`: `marketplaceSchema` on load,
`validateKebabCaseName` on publish, and `customMetadataValidationSchema.shape.slug`. The
`NAMES` table in `kebab-name-judges-agree.test.ts` has no `""`. That is the one input on which the
`plugin.json` judge disagrees with the other three, so the spec built to catch disagreement never
feeds it.

A review asked for a spec feeding `"name": ""` to the validator, to pin the empty-string half of
`isNonEmptyString`. Such a spec could only assert today's verdict, valid, which would pin this gap
as an expected value. The specs that were written use `skills: ""`, `agents: ""` and an agent's
`name: ""` instead. On each of those the skip is the intended behaviour.

## Fix Applied

None. This was found during a review-fix round whose scope kept the validator's behaviour as it is.

## Proposed Standard

Add `{ name: "", accepted: false }` to `NAMES` in `kebab-name-judges-agree.test.ts`. It should go
red on the `plugin.json` judge. Then refuse the empty string in the schema, with `.min(1)` on
`name` and on `version`, so the kebab-case and semver checks keep skipping it and the user sees one
message, not two. Not in conflict with `CLAUDE.md`.

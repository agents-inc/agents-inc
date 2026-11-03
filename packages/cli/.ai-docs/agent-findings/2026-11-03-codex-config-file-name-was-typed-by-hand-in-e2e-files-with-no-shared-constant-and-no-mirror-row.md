---
type: convention-drift
severity: low
affected_files:
  - e2e/fixtures/codex-agent-roles.ts
  - e2e/fixtures/codex-plugin-switch.ts
  - e2e/fixtures/codex.ts
  - e2e/handrun-journeys.ts
  - e2e/interactive/edit-from-warns-when-a-codex-plugin-stays-switched-on.e2e.test.ts
  - e2e/lifecycle/codex-agent-roles-are-read-by-codex.e2e.test.ts
  - e2e/lifecycle/init-from-warns-when-a-codex-plugin-stays-switched-on.e2e.test.ts
  - e2e/lifecycle/update-warns-when-a-codex-plugin-stays-switched-on.e2e.test.ts
  - e2e/smoke/codex-install-surfaces.smoke.test.ts
  - e2e/smoke/codex-lane.smoke.test.ts
  - e2e/pages/constants.ts
  - scripts/check-mirrored-constants.ts
standards_docs:
  - CLAUDE.md
date: 2026-11-03
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  Landed: `FILES` holds the name, every e2e path to Codex's config uses it, and `MIRRORS` holds it,
  `CLI_INVOKE_COMMAND` and the branding name. Pending: nothing refuses a mirror comment in
  `e2e/pages/constants.ts` that has no `MIRRORS` row.
---

## What Was Wrong

`git grep -n '"config.toml"' HEAD -- packages/cli/e2e` at 2c171d00 gives 10 hits in 10 files (a
census). Seven built the path to Codex's global config: two declared a local
`const CODEX_CONFIG_TOML = "config.toml"`, five joined the literal inline. The other three pin the
warning's text, and a rendering assertion keeps its literal. `FILES` had no entry for the file, so
`CLAUDE.md`'s rule against local path constants in e2e files had nothing to point at, and no check
reads that rule.

The constant that replaced them was added without a `MIRRORS` row. The census
`grep -n -i 'mirrors' e2e/pages/constants.ts` lists 15 mirrored values. Three literal ones had no
row: `FILES.CODEX_CONFIG_TOML`, `CLI_INVOKE_COMMAND` and `BRANDING.DEFAULT_NAME`. Three cannot take
one, because the product value is a function (`cacheRoot()`), a third-party default (giget's cache)
or a template literal (`DEFAULT_SOURCE`).

## Fix Applied

`FILES.CODEX_CONFIG_TOML` replaced the seven path sites (REPO-55 follow-ups). The codex-agent-roles
spec's own path helper was deleted for `codexConfigFile` from `e2e/fixtures/codex-plugin-switch.ts`.
`MIRRORS` gained the three missing rows. In a scratch copy, renaming each product value
(`CODEX_CONFIG_FILE`, `CLI_INVOKE_COMMAND`, `DEFAULT_BRANDING.NAME`) reddens
`check-mirrored-constants-against-this-repository.test.ts`.

Not triaged: `grep -rn '"config.toml"' src` lists unit tests that still type the name. Some pin
rendered text, which keeps its literal.

## Proposed Standard

`scripts/check-mirrored-constants.ts` reads every mirror comment in `e2e/pages/constants.ts` and
refuses one naming a value that has no `MIRRORS` row, unless the value is on a list of unregistrable
mirrors, each with its reason (function, third-party, template literal). Without it, a mirror is
held only while its author remembers the row.

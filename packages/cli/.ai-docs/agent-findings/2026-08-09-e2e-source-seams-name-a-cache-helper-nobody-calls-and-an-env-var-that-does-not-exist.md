---
type: convention-drift
severity: low
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/fixtures/cli.ts
  - src/cli/lib/configuration/config.ts
standards_docs:
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The env-var half is fixed (code): `CLI.run`, both wizard launchers and the three specs that
  cleared it by hand now clear `CC_SOURCE`, the constant the product reads, and CLI-466 narrowed
  that variable to init-time so nothing after an install can be steered by the ambient
  environment at all. The cache-helper half landed as a first caller rather than a strategy:
  `seedDefaultSourceCache` is still the only offline route to the default source, and the one
  spec that now needs it proved it cannot substitute a different catalogue — see
  2026-08-09-the-built-in-matrix-names-a-skill-the-default-marketplace-does-not-ship.md. The
  proposed standard (name the variables the runner clears, pinned to the product constant) is
  still unwritten.
---

## What Was Wrong

Two dead seams around "which source does the E2E binary read", found while wiring CLI-465's
revalidation spec and deliberately left alone (report, don't fix).

**1. `seedDefaultSourceCache` has no callers.** `e2e/helpers/test-utils.ts` exports it with a
paragraph of JSDoc explaining that it re-roots the production `CACHE_DIR` under the test's fake
HOME "so the public-marketplace fallback in the multi-source loader resolves from disk instead of
hitting the network". Grep across `e2e/`, `src/` and `scripts/` returns the declaration and nothing
else. Meanwhile `interactive/real-marketplace.e2e.test.ts` does hit the live marketplace, and
`.ai-docs/standards/e2e/README.md` records `WIZARD_LOAD` being raised 15s → 45s because "`init`
against the real marketplace under full-suite parallelism can sit at 'Loading skills…' well past
15s" — the exact cost the unused helper exists to avoid. Either specs should seed, or the helper
should go; today the repository documents a strategy nothing executes.

**2. `CLI.run` clears an environment variable the CLI has never read.** `e2e/fixtures/cli.ts` sets
`AGENTSINC_SOURCE: undefined` in every non-interactive run's env. The source override is
`SOURCE_ENV_VAR = "CC_SOURCE"` (`src/cli/lib/configuration/config.ts`), which is what
`resolveSource` reads between the flag and the project config. So the line clears nothing, and a
developer with `CC_SOURCE` exported in their shell has it inherited into every `CLI.run` — a
machine-dependent source override that no spec declares. CLI-465's own spec relies on `CC_SOURCE`
being honoured, which is how the asymmetry surfaced.

## Fix Applied

At the time: none — discovery only. Both sat outside CLI-465's scope.

**Fixed 2026-08-09 by CLI-466 (env var half).** `e2e/fixtures/cli.ts`, `init-wizard.ts`,
`edit-wizard.ts` and the three specs that spelled the clearing by hand now clear `CC_SOURCE`. The
name is no longer a contract with nothing: CLI-466 also narrowed the variable to init-time
(`resolveSource` reads it only for `caller: "init"`), so the inherited-shell hazard this finding
describes now reaches exactly one command instead of all of them, and the E2E runner clears it
there too.

**Still open (helper half).** `seedDefaultSourceCache` gained its first caller and immediately
showed why it is not a general answer: for the DEFAULT source the matrix is `BUILT_IN_MATRIX`, not
the seeded directory, so seeding a different catalogue under that cache key fails on the first id
the two do not share. The spec that needed it was re-pointed at an eject type that reads no source.

## Proposed Standard

In `.ai-docs/reference/testing/e2e-infrastructure.md`, next to the HOME-isolation note: **name the
environment variables the E2E runner clears, and pin them to the constant the product reads.** A
fixture that scrubs the ambient environment is a contract with the developer's shell, and it is
worth exactly as much as the accuracy of its variable names — which nothing currently checks.

For the unused helper, the general rule already exists (`deps:dead` / knip reports unused exports)
but is deliberately not a gate. This is a case where reading its output would have paid: the
helper and the 45s timeout that its absence forced are in the same repository, unconnected.

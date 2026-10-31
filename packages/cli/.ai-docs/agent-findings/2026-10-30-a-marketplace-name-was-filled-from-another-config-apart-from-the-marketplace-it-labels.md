---
type: convention-drift
severity: medium
affected_files:
  - packages/compile/src/config-source.ts
  - packages/compile/src/global-config.ts
  - packages/cli/src/cli/lib/configuration/config-merger.ts
  - packages/cli/src/cli/lib/configuration/config.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: >-
  The CLI side landed: `mergeConfigs` names a project made from the public catalogue under a
  config naming another marketplace, and `init --from` no longer reads either stored config. The
  writer-side rule in packages/compile (no lane owns it) is pending.
---

## What Was Wrong

`resolveSource` and `mergeConfigs` both hold that a stored `marketplaceName` labels only the
`marketplace` it was recorded beside. Two writers in `packages/compile` fill the name field by
field instead:

- `mergeInlinedScalarFields` in `config-source.ts` spreads the global config's scalars under the
  project's, so a project recording `marketplace: 'github:agents-inc/skills'` and no name was
  written with the global's `marketplaceName: 'acme'`. A later `edit --from` then installed
  `web-testing-vitest@acme`. Reproduced by the lane's hand run (journey 26) and
  `e2e/lifecycle/mixed-marketplaces-across-scopes.e2e.test.ts`.
- `marketplaceIdentityFilledFrom` in `global-config.ts` fills `marketplaceName` and `marketplace`
  each with `??`, so a global recording the public catalogue unnamed would take an arriving
  project's other name. Read from source, not reproduced; whether a project run reaches it with a
  name to lend is unverified.

The same shape sat in `resolveSource`: an `init --from` id naming no marketplace (the public
catalogue, per `packages/matrix/src/seed.ts`) fell to the global config's marketplace.

## Fix Applied

CLI only. `resolveSource` reads the stored rungs for the `"stored"` caller alone; `mergeConfigs`
(`marketplaceNameBeside`) records `agents-inc` for a public-catalogue config whose merge base names
another marketplace, so the writer has nothing to fill. Guarded by the three e2e cases above and
`config-merger.test.ts` "names a config made from the public catalogue its own, under one naming
another marketplace".

## Proposed Standard

In `packages/compile/src/config-source.ts`, `mergeInlinedScalarFields` emits the global's
`marketplaceName` only when the project carries no `marketplace` or the same one, with a
`config-source.test.ts` case "a project config with its own marketplace never carries the global's
marketplaceName"; `marketplaceIdentityFilledFrom` fills the pair together. A rule for
`packages/cli/CLAUDE.md` -> "Data Integrity": a marketplace's name travels only with the ref it was
recorded beside; never fill one field of the pair from another config. Not cross-checked against a
conflicting rule: none found by `grep -n marketplaceName packages/cli/CLAUDE.md` (no hits).

---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/base-command.ts
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
  - e2e/interactive/from-refuses-an-unshipped-stack-before-writing.e2e.test.ts
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
date: 2026-10-03
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  refuseSharedConfigBeforeAsking now asks refuseUnofferedStack, the install's own stack lookup,
  before the lists and the question. The install's lookup stays as the backstop.
---

## What Was Wrong

Both `--from` producers resolved the payload's `stackId` in one place only: `buildInstallConfig`,
when the run came to write the configuration. By then `init --from` had registered the
marketplace and installed and enabled the plugins, or copied the skills, and `edit --from` had
asked its question and copied the skills. A `stackId` the marketplace does not ship was refused
there, exit 1, and left a half-finished install behind.

The rule was already written down. `refuseSharedConfigBeforeAsking` on `BaseCommand` says every
`--from` refusal is decided before the lists and the question. But it lists the refusals by hand,
and the stack lookup was not on the list, because it is a lookup the install makes rather than a
check anyone wrote. `seed-contract.md` already called it "a known gap".

## Fix Applied

`refuseUnofferedStack` in `local-installer.ts` asks the install's own lookup, and
`refuseSharedConfigBeforeAsking` calls it on the decoded selection, against the marketplace the
install reads. It is the same function, so the pre-flight and the install cannot disagree about
which ids they refuse. `e2e/interactive/from-refuses-an-unshipped-stack-before-writing.e2e.test.ts`
holds both doors, each beside a control where the stack is shipped.

## Proposed Standard

A pre-flight refusal calls the lookup the write step makes. It does not restate the check. Where a
write step can throw because of the payload, that throw is a pre-flight candidate. The census is
the throws on the install path:

```
grep -n "throw new Error" src/cli/lib/installation/local-installer.ts
```

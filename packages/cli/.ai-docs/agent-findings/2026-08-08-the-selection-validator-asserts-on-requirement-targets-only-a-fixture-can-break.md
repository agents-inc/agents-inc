---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/matrix/matrix-resolver.ts
  - src/cli/lib/matrix/skill-resolution.ts
  - src/cli/lib/seed/seed-to-wizard.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

CLI-432's row asked for a test in the shape "a seed payload whose requirement-target id is unknown
to the catalog → `init --from` warns". That state cannot be reached through any loaded matrix, and
the reason is worth writing down because it is invisible from the validator's own file.

`validateRequirements` renders every unmet requirement through `getLabel(getSkillById(id))`, and
`getSkillById` is the asserting lookup — it throws `Skill not found: <id>`. It is safe only because
`resolveRelationships` (`skill-resolution.ts`) drops requirement targets it cannot resolve before
they ever reach a `ResolvedSkill`:

```ts
const resolvedNeeds = resolveSlugsOrSkip(rule.needs, resolve, "requires.needs");
if (resolvedNeeds.length === 0) continue;
```

So a loaded catalog cannot carry a requirement naming a skill it does not have, and the assertion
holds. The invariant lives two modules away from the code that depends on it, and neither says so.

A hand-built mock matrix has no such loader in front of it. `createMockSkill(id, { requires: [...] })`
will happily name an id the matrix omits, and `validateSelection` over that fixture throws rather
than reporting — which is what a spec written to the row's literal wording produces. That trap is
newly reachable from a second direction as of CLI-432: `seedToWizardResult` now runs the production
validator, so any fixture matrix a seed spec passes it is subject to the same invariant.

## Fix Applied

None to production — the guard would be dead code against every real catalog, and adding it would
assert a state the loader already prevents.

The specs were written to the reachable shape instead: a requirement the catalog carries and the
payload does not satisfy, which is the case the CLI-432 row was actually about (a configuration that
was consistent where it was authored, arriving at a catalog whose rules differ). The unknown-id skip
is covered beside it in the same payload, so the two outputs are pinned together.
`REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX` in `mock-data/mock-matrices.ts` names the shape.

## Proposed Standard

Add to `.ai-docs/standards/typescript-types-bible.md`, beside the existing guidance on asserting
lookups:

> **An asserting lookup on data from another module is a claim about that module's output.** Write
> the claim where the assertion is: name the function that guarantees it and what it does to the
> bad case. `getSkillById` inside `validateRequirements` is safe because `resolveSlugsOrSkip` drops
> unresolvable needs at load — a reader of `matrix-resolver.ts` alone cannot know that, and a test
> author building a matrix by hand has no loader enforcing it.

The matching test rule, for the unit-test equivalent of `.ai-docs/standards/e2e/assertions.md`:

> **A fixture can build states the loader forbids.** Before writing a spec around an "impossible"
> input, check whether the production path can produce it. If it cannot, the spec is testing the
> fixture, and the throw it provokes is not a bug report.

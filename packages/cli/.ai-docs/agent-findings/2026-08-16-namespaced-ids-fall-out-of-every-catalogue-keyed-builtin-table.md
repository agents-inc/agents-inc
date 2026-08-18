---
type: architectural-drift
severity: high
affected_files:
  - packages/matrix/src/read-model/assignment-defaults.ts
  - packages/cli/src/cli/lib/configuration/config-generator.ts
  - packages/cli/src/cli/lib/matrix/matrix-health-check.ts
  - packages/cli/e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - packages/cli/e2e/lifecycle/init-then-edit-merge.e2e.test.ts
  - packages/cli/e2e/interactive/init-wizard-scratch.e2e.test.ts
  - packages/cli/e2e/commands/doctor-blind-spots.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code-side fix landed for REACH and for the audit warning; the eagerness half is still open and has
  its own finding. Instance 1's targeting is fixed — `resolveAssignment` takes
  `string | SkillTaxonomy` and the CLI's `isRelevantPair` passes the loaded matrix's own domain and
  category — and instance 2 is fixed, `checkUnauditedSkills` now warning only for ids the built-in
  catalog names, which restores `doctor`'s "0 warnings, 0 errors" for a custom marketplace. Two of
  the five reds go green on that (`init-then-edit-merge`, `doctor-blind-spots`). The other three
  turn out to demand a PRELOAD, not merely a reach: `PRELOAD_DEFAULTS` is authored per skill and a
  namespaced id can hold no row in it, so those three now fail on eagerness rather than on absence.
  See 2026-08-16-marketplace-skills-reach-agents-but-can-never-be-eager.md, which also carries the
  sweep table this finding's item 3 asked for.
---

## What Was Wrong

CLI-498 step 4 applied the marketplace prefix to the E2E fixture's skill ids
(`web-framework-react` → `e2e-test-fixture-web-framework-react`). Five e2e tests turned red across
four files, on TWO causes that are the same shape — and both causes are in production, not in the
fixtures.

The shape: a built-in table keyed by the PUBLIC catalogue's `SkillId` union, consulted with a skill
id that now belongs to a different marketplace's namespace. The lookup misses, and the miss has a
silent fallback rather than an error. Nothing parses the id positionally — the CLI-498 audit was
right that every `split("-")` site takes an agent id — because the coupling is not a PARSE. It is a
catalogue MEMBERSHIP test, and namespacing an id removes it from every one of them at once.

The fixture never tripped either of these before, and the reason is the whole point: its ids
COLLIDED with the public catalogue, and the collision is what made the lookups answer. The
collision CLI-498 exists to remove was carrying these assertions.

**Instance 1 — default assignment goes inert.** `resolveAssignment` in
`packages/matrix/src/read-model/assignment-defaults.ts` is the single place that answers "which
sub-agents does a freshly picked skill reach?", read by BOTH the CLI's config generator and the
editor's default assignments:

```ts
return (skillId: string): readonly AssignmentTarget[] => {
  const skill = skillById(skillId)
  if (!skill) return []
  ...
}
```

Its own doc states the intent — "An id the catalog does not carry — added from GitHub this session,
or stale — reaches nobody: relevance unknown, so callers hand it to manual assignment instead of
any default" — and `config-generator.ts` restates it. That rule was written when "outside the
catalog" meant an oddity. Under CLI-498 it means EVERY skill of EVERY marketplace but the public
one. In the product, not the tests:

- A skill newly picked from a custom marketplace lands on NO sub-agent's stack. It installs, it is
  recorded in `config.skills`, and no agent carries it.
- A sub-agent newly selected in the same session gets NO seeded stack from that marketplace's
  skills, because every candidate triple fails `isRelevantPair`.
- A SCRATCH init from a custom marketplace — the no-stack path, where every pick arrives on the
  resolver's terms and nothing else — compiles its agents with an EMPTY preload list.

Selecting a STACK is unaffected, because that reads the source's own `config/stacks.ts`. That is
why the lifecycle and plugin-install specs stay green and only the scratch / add-a-skill /
add-an-agent paths go red.

**Instance 2 — `doctor` can no longer give a custom marketplace a clean bill of health.**
`checkUnauditedSkills` in `src/cli/lib/matrix/matrix-health-check.ts` warns once per skill whose
`auditEntryFor(skillId)` is undefined, and that table is `Record<SkillId, SkillAuditEntry>` over
the built-ins. So a project installed from any custom marketplace now gets one
`skill-unaudited` warning per skill, on every `doctor` run, with nothing the user can do about it.
For the E2E fixture that is 10 warnings where there were none.

Unlike instance 1 the message is accurate and the behaviour is by design — the warning text
literally reads "source-provided skills are outside the built-in audit manifest". What is new is
that it now fires for every custom marketplace rather than for genuinely unaudited oddities, and
that "0 warnings, 0 errors" becomes unreachable for one.

Observed reds (all five, both causes):

| Spec                                   | Assertion                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `stack-per-agent-curation.e2e.test.ts` | newly-added zustand must appear on `web-developer.web-client-state` — got `undefined`       |
| `stack-per-agent-curation.e2e.test.ts` | `api-developer` stack must be seeded when the agent is newly selected — got `undefined`     |
| `init-then-edit-merge.e2e.test.ts`     | the added skill must reach the compiled agent's dynamic-skills table — absent from the body |
| `init-wizard-scratch.e2e.test.ts`      | `web-developer` frontmatter must preload react — found `[]`                                 |
| `doctor-blind-spots.e2e.test.ts`       | a fully installed plugin project is the healthy baseline — 10 warnings, not 0               |

## Fix Applied

None — discovery only, and deliberately so.

Both fixes are production-side (`packages/matrix` and `src/cli/lib/matrix/`), and CLI-498 step 4 is
scoped to `e2e/` and `src/cli/lib/__tests__/`. Rewriting the five assertions to expect the new
outputs would encode "a custom marketplace's skills reach no agent and always warn" as intended
behaviour, which is an owner ruling nobody has made; CLAUDE.md forbids broadening an assertion to
make a failing test pass. The five tests are therefore left RED and reported, per the "sweep
findings compiled, root-caused with owner, never patch-first" rule.

## Proposed Standard

Two rulings and one rule.

**1. Decide what default assignment means for a non-public marketplace.** Two readings:

- _Targeting is catalogue-only, deliberately._ Then a custom marketplace ships skills that reach no
  agent until the user assigns them by hand, and the four assertions above should be rewritten with
  that ruling cited.
- _Targeting should follow the skill's own taxonomy._ `targetsOf` already branches on
  `skill.domainId` / `skill.categoryId` alone — nothing in it needs the id. Resolving those two
  fields from the loaded skill's metadata instead of from `skillById` makes every marketplace's
  skills targetable without changing the rule itself. This is the reading that keeps a custom
  marketplace usable, and it also settles CLI-454 (a scaffolded marketplace's skills would
  otherwise reach nobody) and EDITOR-30.

**2. Decide whether `skill-unaudited` should fire per skill for a whole marketplace.** The audit
manifest covers the public catalogue by construction, so under CLI-498 the warning's population is
"every skill of every other marketplace". Either it is downgraded to one warning per MARKETPLACE
("N skills from `<name>` are outside the built-in audit manifest"), or `doctor`'s clean-bill
threshold has to acknowledge it — otherwise the check costs a screen of noise and stops
distinguishing anything.

**3. Write the coupling down.** Add to `.ai-docs/standards/e2e/user-journeys.md` § "Journey 26" —
beside the rest of the CLI-498 ruling — that namespacing an id removes it from every built-in table
keyed by the generated `SkillId` union, and that each such lookup whose miss has a SILENT fallback
is a behaviour change rather than an error path. Two are named above; the sweep for the rest
(`skillById`, `getSkillById`, `auditEntryFor`, `PRELOAD_DEFAULTS` and anything else typed
`Record<SkillId, …>`) has not been done, and it belongs in the CLI-498 row as its own step.

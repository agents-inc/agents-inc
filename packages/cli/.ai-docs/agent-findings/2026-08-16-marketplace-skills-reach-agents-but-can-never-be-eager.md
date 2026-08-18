---
type: architectural-drift
severity: high
partial_note: "Eagerness RULED 2026-08-16 (lazy by rule). The reach half landed; the three specs asserting eagerness still need rewriting to the ruling, and Proposed Standard 2 (a Record<SkillId> table has two kinds of miss) plus the built-in-catalogue.md cross-reference gap are both unwritten."
affected_files:
  - packages/matrix/src/read-model/preload-defaults.ts
  - packages/matrix/src/read-model/assignment-defaults.ts
  - packages/cli/src/cli/lib/configuration/config-generator.ts
  - packages/cli/src/cli/lib/matrix/matrix-health-check.ts
  - packages/cli/e2e/lifecycle/stack-per-agent-curation.e2e.test.ts
  - packages/cli/e2e/interactive/init-wizard-scratch.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
---

## What Was Wrong

The owner's ruling that a custom marketplace's skills must reach sub-agents was implemented for
REACH and settles nothing about EAGERNESS, because the two are answered by two different tables and
only one of them can be read through a taxonomy.

`targetsOf` in `assignment-defaults.ts` branches on `domainId` and `categoryId` alone, so telling
the resolver a skill's taxonomy is enough to place a namespaced id — that is the fix that landed.
`PRELOAD_DEFAULTS` in `preload-defaults.ts` is the other table, and it is authored PER SKILL:
`Partial<Record<SkillId, readonly RoleFlavor[]>>`, one hand-written row per catalog skill. A
marketplace's id carries that marketplace's namespace, is not a `SkillId`, and therefore has no row
it could ever match. `createLoadStateResolver` also refuses such an id outright — `assertKnownSkill`
throws, and `domainOfSkill` throws after it — so the assignment resolver has to answer "lazy" for it
rather than consult the table at all.

Nothing about that is wrong on its own terms. `PRELOAD_DEFAULTS`'s own doc says absence is lazy, and
`config-generator.ts`'s `mappedLoadState` has said the same in prose since long before namespacing:
"a local skill, a marketplace one or a hand-written agent has no entry it could ever match — those
are lazy by rule, not by rescue". What is new is the POPULATION. Before CLI-498 that sentence
described an oddity; after it, it describes every skill of every marketplace but the public one, and
"lazy by rule" becomes "a custom marketplace can never preload anything".

Three e2e assertions demand the opposite, and each of them justifies the demand by KIND rather than
by identity — which is the reading the shipped table happens to encode but cannot express:

| Spec                                   | Assertion                                                             | Its own stated reason                                    |
| -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `stack-per-agent-curation.e2e.test.ts` | `web-developer.web-client-state` = `{ id, preloaded: true }`          | "client state is one of the things a developer works in" |
| `stack-per-agent-curation.e2e.test.ts` | `api-developer.api-api` = `{ id, preloaded: true }` on a seeded agent | "the api framework lands preloaded"                      |
| `init-wizard-scratch.e2e.test.ts`      | `web-developer` frontmatter preloads react                            | "a framework preloads on its own domain's agents"        |

All three passed before CLI-498 step 4 because the fixture's ids COLLIDED with the catalog's, so the
catalog's rows answered for the fixture's skills. The collision was carrying the eagerness
assertions exactly as it was carrying the reach ones.

After the reach fix these three no longer fail on absence. They fail on eagerness, and the received
values say so: `web-client-state` now yields the bare string `"e2e-test-fixture-web-state-zustand"`
where it used to yield `undefined`, and `init-wizard-scratch`'s frontmatter is `[]` because the
skill IS on the stack and is lazy. The skill reaches the agent; it just arrives on demand.

## Fix Applied

Reach and the audit warning, not eagerness.

- `assignment-defaults.ts` — the resolver takes `string | SkillTaxonomy`. A caller holding a
  skill's domain and category states them and is answered on them; a caller holding only an id is
  answered from the catalog as before. The docstring's original guard survives, narrowed: an id with
  no taxonomy anyone can name still reaches nobody.
- `config-generator.ts` — `isRelevantPair` passes the taxonomy the LOADED matrix carries, via
  `getCategoryDomain(category)`.
- `matrix-health-check.ts` — `checkUnauditedSkills` warns only for ids the built-in catalog names,
  so a marketplace's skills are no longer reported per skill on every `doctor` run.

Eagerness is deliberately untouched. Making a namespaced skill preload requires a rule that does not
exist, and every candidate is a policy decision rather than a repair:

1. **Lazy by rule** — the reading the code already states. A marketplace's skills reach their
   agents and arrive on demand; the three assertions above are rewritten to expect a lazy entry and
   an empty frontmatter, citing the ruling.
2. **Kind-derived** — a skill with no row of its own inherits what the catalog's skills in its
   CATEGORY are preloaded for. This is what the three assertions' own prose already claims, and it
   needs no new authored data. It does need a choice between intersection and union where a
   category's rows disagree (`web-forms-*` is 3×`["developer"]` and 1×`["developer","researcher"]`;
   `web-meta-framework-*` is mostly with `tester` and twice without), and that choice is the rule.
3. **Author-declared** — a marketplace states eagerness in its own metadata. The largest of the
   three, and the only one that lets an author disagree with the catalog's habits.

Option 2 is the only one that turns the three specs green without editing them.

## Proposed Standard

**1. Eagerness for a marketplace's own skills — RULED 2026-08-16 by the owner: LAZY BY RULE
(option 1).** A skill the catalog's tables do not carry arrives lazy. This is not a new behaviour, it
is the one `mappedLoadState` and `assignment-defaults.ts` already document in as many words —
"lazy by rule, not by rescue" — and the ruling makes it deliberate rather than incidental.

The two tables therefore answer differently ON PURPOSE, which is the fact worth carrying: **reach is
taxonomy-aware and eagerness is not.** `resolveAssignment` takes `string | SkillTaxonomy` and places
a namespaced id by its domain and category, because targeting is derivable from taxonomy.
`PRELOAD_DEFAULTS` is authored per skill id and nothing derives it, so a row-less skill has no answer
to inherit. Kind-derived eagerness (option 2) was rejected as inventing a rule nobody authored;
author-declared eagerness (option 3) is the eventual answer and belongs with leg 2's custom-skills
intake, where a marketplace author's metadata is already being designed.

**A user's saved config still overrides it per `(skill, agent)`** — `SkillAssignment.preloaded` is
the user's-word tier and is unaffected — so a wrong default is recoverable, which is why the cheap
direction is the safe one here.

**Consequence: rewriting `init-wizard-scratch` and `stack-per-agent-curation` IS now legitimate.**
They assert eagerness that the ruling withdraws for a marketplace skill, so they must be rewritten to
assert what is now true, with their comments updated — those comments justify preload by KIND, which
is precisely the reasoning the ruling declines to encode.

**2. Write down that a `Record<SkillId, …>` table has two kinds of miss.** The reach defect and this
one are the same shape and were fixed differently for a reason worth stating: a table whose VALUES
are derivable from a skill's taxonomy can be re-read through it, and a table whose values are
AUTHORED per skill cannot. `.ai-docs/standards/e2e/user-journeys.md` § "Journey 26" is where the
first half was asked for; both halves belong in the same paragraph.

**3. Sweep result — the remaining catalog-keyed lookups**, classified as asked. `(a)` is
legitimately about the public catalog; `(b)` is a membership test that silently drops a
marketplace's skills.

| Site                                                                                                        | Class | Disposition                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| `assignment-defaults.ts` → `skillById`                                                                      | (b)   | FIXED — takes a taxonomy                                                                                                     |
| `matrix-health-check.ts` → `auditEntryFor` over `Record<SkillId, …>`                                        | (b)   | FIXED — warns only for ids the catalog names                                                                                 |
| `preload-defaults.ts` → `PRELOAD_DEFAULTS`, `assertKnownSkill`, `domainOfSkill`                             | (b)   | REPORTED — this finding. Values are authored per skill; no taxonomy read exists                                              |
| `config-generator.ts` → `isSkillId` in `mappedLoadState`                                                    | (b)   | REPORTED — the CLI-side face of the same table                                                                               |
| `skill-audit.ts` → `auditVerdictsPendingApply[skillId]`                                                     | (a)   | A miss means "no pending verdict", which is true of a marketplace's skill                                                    |
| `catalog.ts` → `CATALOG.skillsById`, `isSkillId`                                                            | (a)   | The vendored public catalog, by definition                                                                                   |
| `matrix/vendor/**` → `SkillDefinitionMap`, `idToSlug`, `skills`                                             | (a)   | Vendored copies of the public matrix                                                                                         |
| `matrix-provider.ts` → `getSkillById` and its ~20 callers                                                   | (a)   | Reads the LOADED matrix, which carries every marketplace's skills. Not a catalog test                                        |
| `skill-copier.ts`, `local-installer.ts`, `loader.ts`, `skill-resolution.ts` → `Partial<Record<SkillId, …>>` | (a)   | Runtime maps keyed by whatever the source shipped. Typing only, no membership test                                           |
| `apps/editor` → `skillById` in `config-store.ts`, `derive.ts`, `stack-grid.tsx`                             | (a)   | The editor holds only the public catalog today; EDITOR-30 is where that changes, and `SkillTaxonomy` is the seam it will use |

**4. One adjacent question found by the sweep — RULED, and it is not a gap.** The sweep noted that
`resolveAssignment` returns agents from the vendored `SUB_AGENT_GROUPS`, so a marketplace shipping an
agent outside the generated `AgentName` union would receive no skills, and asked for a ruling.

**Owner ruling, 2026-08-16: marketplaces do not ship sub-agents.** Every sub-agent comes from this
application's own roster. So reading the roster from the vendored union is correct by design, not the
reach defect one axis over, and CLI-498's silence on agent ids is deliberate rather than an
oversight — the namespace rule governs skill ids alone.

Recorded here because the sweep's own framing ("this needs its own ruling before a marketplace can
ship an agent of its own") presumes a capability that is not planned. A future reader finding the
vendored-roster read should not treat it as an unclosed hole.

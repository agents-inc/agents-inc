---
type: architectural-drift
severity: high
affected_files:
  - packages/matrix/src/seed.ts
  - packages/matrix/src/index.ts
  - packages/cli/src/cli/lib/seed/seed-to-wizard.ts
  - packages/cli/src/cli/lib/configuration/config-generator.ts
  - apps/editor/src/stores/persisted-schema.ts
  - apps/server/src/index.ts
standards_docs:
  - .ai-docs/reference/types/zod-schemas.md
date: 2026-08-21
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The anti-drift half landed — the scope-reach rule now has ONE definition in
  packages/matrix, the CLI and the editor both read it, and the worker refuses the pair on
  POST so a bad link cannot be minted. What did NOT land, and needs an owner ruling rather
  than a patch, is the literal instruction to move the rule onto seedPayloadSchema itself.
  Two independent facts make that unimplementable, both measured and written up below.
---

## What Was Wrong

One rule — **a project-scoped skill never reaches a sub-agent resting at global scope** — existed
as three verbatim implementations across three workspaces:

| Where                                                        | Symbol                  |
| ------------------------------------------------------------ | ----------------------- |
| `packages/cli/src/cli/lib/configuration/config-generator.ts` | `isScopePairCompatible` |
| `apps/editor/src/stores/persisted-schema.ts`                 | `isScopePairCompatible` |
| implied by the wire contract, enforced by neither            | —                       |

The editor's copy carried a docblock saying "the name and the rule are the CLI's, not this app's",
which is an accurate description of a duplicate rather than a defence against one. Nothing held the
two bodies together, and the wire contract they both describe enforced neither.

The brief for CLI-614 asked for the rule to be moved onto `seedPayloadSchema` in
`packages/matrix/src/seed.ts`, so the editor, the worker and the CLI would "all refuse identically
and a bad link cannot be created in the first place".

**The anti-drift goal is right and has landed. The proposed mechanism cannot work, for two reasons
that were verified rather than reasoned about.**

### 1. The rule is catalogue-dependent, and a wire schema has no catalogue

The rule compares a skill's `scope` against **the scope of a sub-agent named inside that skill's
`assignments`**. The second operand is the problem. `seedToWizardResult` resolves it in three ways,
and the first two produce identical bytes on the wire:

| Case                                          | On the wire                                   | Correct outcome            |
| --------------------------------------------- | --------------------------------------------- | -------------------------- |
| The agent is known and rests at global        | `assignments: { X: "lazy" }`, `agents` silent | refuse — unwritable pair   |
| The agent is one this catalogue does not know | `assignments: { X: "lazy" }`, `agents` silent | **skip** — rename leniency |
| The agent is pinned off                       | `agents: { X: { on: false } }`                | skip                       |

Only the third is visible to a schema. Cases 1 and 2 are the same bytes, and `seedToWizardResult`
separates them with `KNOWN_AGENTS`, which comes from the CLI's own generated source types. A schema
refusal therefore conflates them — and refusing case 2 is precisely the retroactive breakage the
decode's own docblock exists to prevent: a sub-agent rename would invalidate every link minted
before it.

This is why the shared refinement is applied at the **minting** end and not at every read. A payload
being minted now is minted against a current catalogue, so an unknown-agent row there is an
authoring error rather than historical drift.

### 2. A stricter base schema would delete EDITOR-08's repair flow and 500 every existing bad link

`GET /configs/:id` **does** re-validate on read — `seedPayloadSchema.safeParse(payload)` in
`apps/server/src/index.ts`, returning 500 "Stored config is unreadable" on failure. So tightening
the base schema turns every already-stored payload holding the pair into an unrecoverable 500.

Worse, it contradicts a ruling that landed the same day. EDITOR-08's own words, from
`apps/editor/e2e/specs/scope-reach.spec.ts`:

> It is an ERROR to resolve, not an action to prevent: the assignment is made, the scope moves,
> nothing is dropped — and Install and Share are blocked until the user fixes it, which takes one
> click on the sub-agent's own scope word.

The editor reads shared links through the same `seedPayloadSchema` (`apps/editor/src/lib/api/configs.ts`).
A base-schema refusal makes `fetchSharedConfig` answer "this share link holds an unreadable config"
for exactly the links the repair flow exists to rescue. Five tests under
`test.describe("a shared link holding the pair")` cover that flow.

It is worse still at module scope: `apps/editor/e2e/support/sharing.ts` builds four fixtures through
`seedPayloadSchema.parse(...)` — `OUT_OF_SCOPE_PAYLOAD` (deliberately holding the pair) and the three
`marketplacePayload(...)` products, whose skills are all `scope: "project"` assigned to
`web-developer` with `agents: {}`. A strict base schema throws at import, taking down
`catalog-first.spec.ts`, `shared-link.spec.ts` and `marketplace-switch.spec.ts` along with it.

### The measurement that settles the CLI side

The literal instruction also makes the CLI's own error message strictly worse, because a schema
failure lands in `fetchSeedConfig`'s single `safeParse` and is reported by the one message that
covers every way a payload can fail to decode. Both runs below are the real binary against a local
store serving one hand-written bad payload:

| Base schema         | What `init --from` printed                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lenient (shipped)   | `This configuration cannot be installed: … web-framework-react -> web-developer` … `Re-share it with each sub-agent above pinned to the project, or each skill at global` |
| strict (as briefed) | `Configuration 'BadPair1' is not in a format this version of the CLI can install … re-share the configuration to mint a current one`                                      |

The strict message names no skill, no sub-agent and no remedy the recipient of a link can act on —
they do not own the configuration they were asked to re-share. Exit code is `EXIT_CODES.ERROR` in
both cases.

## Fix Applied

**One definition, in the contract both ends already import.** `packages/matrix/src/seed.ts` now
owns:

- `seedScopeSchema` / `SeedScope` — the scope vocabulary, previously an inline
  `z.enum(["project", "global"])` written twice in the same file.
- `isSeedScopePairWritable(skillScope, agentScope)` — the rule itself.
- `seedAgentScope(entry)` — the sparse-map resolver, reading `DEFAULT_SELECTION_OPTIONS.scope` so
  the wire and the CLI's decode cannot disagree about what an absent key means. This was a private
  function in `seed-to-wizard.ts` and is now shared, which is what the brief meant by "share the
  default rather than restating it".
- `unwritableSeedAssignments(payload)` — every offending pair, both halves named.
- `installableSeedPayloadSchema` — the base schema plus a `superRefine` over the above.

`isScopePairCompatible` survives in both the CLI and the editor as the local name their call sites
read it under, and both now delegate. There is one body.

**The refusals the ruling named, all three, without the collateral:**

| Surface         | Where it refuses                                                           |
| --------------- | -------------------------------------------------------------------------- |
| editor (mints)  | Share is blocked on `summarize(config).unscopedAgentCount > 0` (EDITOR-08) |
| worker (stores) | `POST /configs` now takes `installableSeedPayloadSchema` — 400, new        |
| CLI (installs)  | `seedToWizardResult` throws, now over the shared predicate                 |

`seedToWizardResult` keeps its own throw **deliberately**, and the brief's "do not leave two
implementations that can drift" is satisfied by construction: it no longer has an implementation,
only a call. It has to stay a separate check because it is the only one of the three that owns a
catalogue and can therefore tell case 1 from case 2 above — and because it produces the message the
table above shows is worth keeping.

**The worker's own canonical fixture was one of these payloads.** `payload()` in
`apps/server/src/index.test.ts` had `web-developer` carrying a model and an effort but no scope,
against a project-scoped skill — so the worker's whole POST suite was built on a configuration
nobody could install. It is pinned to the project now, the same repair
`packages/api-mocks/src/fixtures.ts` had already received for `STORED_PAYLOAD`.

### On `SEED_VERSION`

**Not bumped, deliberately.** The version literal answers "can this consumer read these bytes",
and every field, every enum and every optionality rule is unchanged — a v5 payload parses to the
same value before and after. What changed is which payloads one NEW schema, at one write boundary,
will accept. A bump would be actively harmful here: the repo's discard-don't-migrate policy means
bumping stops every existing v5 id from decoding, including the ones EDITOR-08's repair flow is
built to open. The version exists to stop a consumer silently STRIPPING something it does not
understand; a refusal strips nothing and is not silent.

### Mutation-checked

| Mutation                                          | What went red                                             |
| ------------------------------------------------- | --------------------------------------------------------- |
| `isSeedScopePairWritable` forced to `true`        | the refusal test and the pair-naming test                 |
| the `on: false` carve-out removed                 | "ignores an assignment row naming a sub-agent pinned off" |
| `seedAgentScope` default hardcoded to `"project"` | the refusal test and the pair-naming test                 |
| the worker's route left on the base schema        | the new 400 test — watched red before the wiring landed   |

Each test file also pins the permitted case beside the refusal, per CLAUDE.md § Test Assertions,
including one that asserts the READ schema still accepts what the installable one turns away — the
control that would redden if anyone later "finishes the job" by tightening the base.

## Proposed Standard

**A cross-field validation rule belongs at the boundary that owns both operands.** The scope-reach
rule reads a skill's scope and a sub-agent's effective scope, and only a consumer with a catalogue
can resolve the second — so the wire can carry the rule's DEFINITION but not its full ENFORCEMENT.
The general form: before moving a refusal into a shared schema, name every operand and ask which
component can resolve each. Where one operand needs data the schema does not have, the schema gets
the predicate and the consumer keeps the check.

**And the direction of travel decides the strictness.** A schema used for both reads and writes
cannot be tightened, because the two directions want opposite answers: minting should refuse what
cannot be installed, while reading must stay lenient enough to open a bad artefact for repair. Two
schemas, one derived from the other, is the shape — and the derived one goes on the write path.
`apps/server/src/index.ts` now carries both on adjacent routes with the asymmetry stated at the
POST.

Both belong in `.ai-docs/reference/types/zod-schemas.md`, which currently documents the seed
contract as a single schema and does not distinguish read from write use.

**Recurrence gate — proposed, not built.** The class this finding is named for is "a CLI-only
refusal added at the consumer instead of the shared contract". A mechanical check is possible and
narrow: `isSeedScopePairWritable` should have exactly one function BODY in the repository, and a
scan for `skillScope === "project" && agentScope === "global"` outside `packages/matrix/src/seed.ts`
would have caught all three copies. That is a one-line grep gate of the kind
`scripts/check-enumeration-drift.ts` already runs for enumerations, and it is the shape to copy.
It is proposed rather than added because the general form ("a rule two workspaces share must have
one body") is not mechanisable from a grep — only this specific predicate is, and a gate that
covers one predicate should be honest about covering one predicate.

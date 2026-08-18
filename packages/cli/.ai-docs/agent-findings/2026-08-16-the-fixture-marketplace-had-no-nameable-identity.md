---
type: anti-pattern
severity: medium
affected_files:
  - e2e/helpers/create-e2e-plugin-source.ts
  - e2e/helpers/create-e2e-source.ts
  - e2e/fixtures/expected-values.ts
  - e2e/global-setup.ts
  - e2e/pages/constants.ts
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - .ai-docs/standards/e2e/assertions.md
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  The fixture marketplace name is now the shared, stable
  `E2E_MARKETPLACE_NAME` in e2e/pages/constants.ts, read by the writer
  (create-e2e-plugin-source.ts), the cleanup sweep (global-setup.ts) and the
  assertion side (expected-values.ts). `E2E_SKILL_IDS` is derived from
  `E2E_SKILLS` instead of hand-copied, and the display-title map is now keyed
  by the disk writer's id set rather than the other way round. Pinned by
  e2e/integration/fixture-marketplace-namespace.e2e.test.ts, watched red first.
---

## What Was Wrong

Three separate expressions of one idea — that a fixture's published identity and its
skill set have a single owner — were each written twice or not at all.

**1. The published marketplace name could not be named.** `createE2EPluginSource`
defaulted its marketplace to `` `e2e-test-${Date.now()}` ``. Forty-four e2e files go
through that helper and roughly a dozen assert on the name, but every one of them reads
the value back off the returned fixture object (`fixture.marketplaceName`), so a
timestamp satisfies them exactly as well as a constant would. Nothing anywhere pinned
what the fixtures publish under. That is invisible while the name is only an opaque
handle, and fatal the moment it is also a namespace: a marketplace's skill ids carry
the marketplace's name as their prefix, and a prefix that changes every run cannot be
written into a fixture id or compared against one.

**2. `E2E_SKILL_IDS` was a hand-written copy of a list that already existed.** The ten
ids in `e2e/fixtures/expected-values.ts` restated the ten `E2E_SKILLS` entries in
`e2e/helpers/create-e2e-source.ts`. The same file documents, twice and at length, why
`E2E_STACK_AGENTS` and `E2E_STACK_SKILL_IDS` are read off the stack object rather than
re-typed — "a hand-written second list can agree with the installer while both disagree
with the stack". Its nearest neighbour had the identical failure mode and the opposite
treatment. The reference docs had already drifted off the copy: `e2e-infrastructure.md`
described `E2E_SKILL_IDS` as a "9-entry tuple" and listed nine ids, one short.

**3. The display-title map owned the disk writer.** `E2ESkill["id"]` was typed
`keyof typeof E2E_SKILL_TITLES`, so the map of strings the wizard _renders_ decided which
skills a source is allowed to _write_. The writer could not gain, lose or rename a skill
until the title map granted permission. That is backwards — what lands on disk is the
fact, and the title is a presentation detail hanging off it.

A fourth, smaller drift sat underneath: `e2e/global-setup.ts` defined its own private
`E2E_MARKETPLACE_PREFIX = "e2e-test-"`, the string its stale-registration sweep matches
on, with no connection to the helper producing the names being swept. CLAUDE.md already
forbids locally-defined constants in e2e files; the rule names `DIRS`, `FILES`,
`TIMEOUTS`, `STEP_TEXT` and friends, and a marketplace name did not read as one of those
categories.

## Fix Applied

- `E2E_MARKETPLACE_PREFIX` and `E2E_MARKETPLACE_NAME` (`e2e-test-fixture`) live in
  `e2e/pages/constants.ts`. The sweep in `global-setup.ts` reads the prefix; the writer in
  `create-e2e-plugin-source.ts` defaults to the name; `expected-values.ts` re-exports the
  name for the assertion side. Verified against the real Claude registry that the sweep
  still removes the stable name after a run.
- `e2eSkillId(bare)` composes an id inside that namespace, exported before its second
  caller exists under CLAUDE.md's `skillSlotKey` carve-out. Nothing applies it yet — the
  ids themselves are a later step.
- `E2E_SKILLS` is `as const satisfies readonly E2ESkill[]` and is now the sole definition
  of the fixture skill set. `E2E_SKILL_IDS` is `E2E_SKILLS.map(...).sort()`, re-exported
  from `expected-values.ts` under the same doc-comment convention its two derived siblings
  already use, so all 155 spec files importing it are untouched.
- `E2E_SKILL_TITLES` is `as const satisfies Record<E2ESkillId, string>`, where `E2ESkillId`
  is read off `E2E_SKILLS`. Ownership is inverted and the map is now total: deleting one
  title key was probed and produces a compile error naming the id the writer declares.
  Titles stay decoupled from ids deliberately — the build grid sorts by display name, so a
  title that tracked its id would relocate every cursor target.
- `e2e/integration/fixture-marketplace-namespace.e2e.test.ts` pins the name against the
  sweep prefix, against the public catalogue's name and against `validateKebabCaseName`,
  and asserts the published `marketplace.json` carries it. Watched red on the timestamp
  first (`expected 'e2e-test-1786886674610' to be 'e2e-test-fixture'`).

Docs were left alone — out of scope for this pass. Three statements are now stale and
should be corrected by the documentation pass:
`.ai-docs/reference/testing/e2e-infrastructure.md` says `marketplaceName` "defaults to
`e2e-test-<Date.now()>`", types `E2E_SKILL_TITLES` as `Partial<Record<SkillId, string>>`,
and describes `E2E_SKILL_IDS` as a nine-entry tuple; `.ai-docs/standards/e2e/assertions.md`
calls it "a tuple". It is a derived `readonly` array of ten.

## Proposed Standard

`.ai-docs/standards/e2e/test-data.md` — add to the fixture-constants section:

> **A fixture's published identity is a constant, never a per-run value.** Any string a
> fixture writes that a spec might one day assert on — a marketplace name, a stack id, a
> project name — is declared once in `e2e/pages/constants.ts` and read from there.
> Timestamps and randomness belong in temp _paths_, which no assertion names, and nowhere
> else. A per-run identity is not merely unassertable: it silently converts every
> assertion that reads it back off the fixture object into a tautology.

`.ai-docs/standards/e2e/assertions.md` — extend the existing note on `E2E_STACK_AGENTS`
and `E2E_STACK_SKILL_IDS` being derived, so it covers the whole class rather than the two
instances that happened to be written that way:

> **Every expected value describing what a fixture contains is DERIVED from the fixture,
> not re-typed beside it.** If a constant in `expected-values.ts` lists what a source
> ships, it must be computed from the definition in `create-e2e-source.ts`. A second
> hand-written list can agree with the code under test while both disagree with the
> fixture — and the drift is invisible until a skill is added and the assertions quietly
> stop covering it.

CLAUDE.md — the existing rule reads "NEVER define path/timeout/text constants locally in
E2E test files". It names five example constant groups, and a marketplace name matched
none of them closely enough to be recognised. Widen the wording to "any shared constant"
and add `e2e/global-setup.ts` to the files it covers; the rule was never meant to exempt
the one file outside `e2e/pages/` that the sweep lives in.

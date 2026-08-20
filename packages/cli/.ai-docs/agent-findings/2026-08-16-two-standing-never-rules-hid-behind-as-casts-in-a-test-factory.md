---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/factories/skill-factories.ts
  - src/cli/lib/__tests__/factories/skill-factories.test.ts
  - src/cli/lib/__tests__/mock-data/mock-skills.ts
  - src/cli/lib/__tests__/mock-data/mock-matrices.ts
  - src/cli/lib/__tests__/helpers.test.ts
  - src/cli/lib/matrix/matrix-health-check.test.ts
  - src/cli/lib/matrix/matrix-resolver.test.ts
  - src/cli/lib/matrix/skill-resolution.test.ts
  - src/cli/lib/matrix/skill-resolution.integration.test.ts
  - src/cli/lib/loading/source-loader.test.ts
  - src/cli/lib/configuration/__tests__/config-types-writer.test.ts
  - scripts/generate-source-types.test.ts
standards_docs:
  - .ai-docs/reference/testing/factories.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  All three factories in skill-factories.ts — createTestSkill, createMockSkill and, as of the
  second pass below, createMockExtractedSkill — now read their taxonomy from one stated table and
  throw on a miss. No factory in the file derives a field from an id. The reference doc carries the
  contract. Proposed standards 1 and 2 are now written — CLAUDE.md's Data Integrity bullet and
  clean-code-standards § 15.2 both name slug, domain AND category and both name test factories, and
  § 7.2 states that a cast on a value the same expression just computed is not a boundary cast.
  What remains pending is proposed standard 3: the reviewing agents' own prompts do not carry the
  two detection shapes, and reading the factory is the only detector this class has.
---

## What Was Wrong

`createTestSkill(id, description, overrides?)` derived a fixture skill's whole taxonomy by splitting
the id on `-`:

```ts
const segments = id.split("-");
const rawPrefix = segments[0] ?? "web";
const domain = (DOMAIN_PREFIX_MAP[rawPrefix] ?? rawPrefix) as Domain;
const category = (canonicalCategories[id] ?? `${segments[0]}-${segments[1]}`) as CategoryPath;
const slug = deriveSlugFromId(id); // segments.slice(2).join("-")
```

Two of those lines break rules CLAUDE.md states as NEVER, and both breaches had been sitting in the
tree unnoticed:

- **"NEVER derive `slug` from skill ID or directory path — `slug` is a required field in metadata,
  always pass it explicitly."** `deriveSlugFromId` is that derivation by name, and
  `createMockSkill` used it too.
- **"NEVER build multi-tier resolution fallbacks. Data matches on the first lookup or it's an
  error."** `canonicalCategories[id] ?? \`${segments[0]}-${segments[1]}\`` is exactly a second tier:
  miss the table, invent a category from the first two segments.

**Why nothing caught it.** Both branches were already `as`-cast — `as Domain`, `as CategoryPath`,
`as SkillSlug` — so a wrong answer is not a type error, it is a value. The factory writes fixtures,
so no product code reads it, and no gate reads it either: `tsc` is satisfied by the casts, ESLint
has no rule for "this string was computed rather than stated", and the test suite asserted on the
fixtures the derivation happened to produce. Every mechanism the repository owns was pointed
somewhere else. A rule can be stated twice in CLAUDE.md and still be broken in the tree for as long
as nobody looks, and the place nobody looks is the test layer.

**The derivation was already producing wrong values, before any namespace existed.** Fifty-five of
the seventy-four ids in the table derived a slug that is not a member of the generated `SkillSlug`
union, and two ids that ARE in the shipped catalogue derived a slug the catalogue contradicts:
`web-server-state-react-query` derived `state-react-query` where the catalogue says `react-query`,
and `infra-ci-cd-github-actions` derived `cd-github-actions` where it says `github-actions`. The
second had already been patched at its call site with a `slug:` override — the workaround was in the
tree, the cause was not.

**What made it urgent** is CLI-498, which prefixes every custom-marketplace skill id with its
marketplace name; the e2e and test fixture sources are custom marketplaces. Given
`e2e-web-framework-react` the old factory returned, silently and with a green suite:

```
{ domain: "e2e", category: "e2e-web", slug: "framework-react", displayName: "Framework React", ... }
```

A namespaced id would have quietly acquired a fabricated domain and a fabricated category across
every fixture that used it. This is the failure the 2026-08-16 correction in
`standards/e2e/user-journeys.md` § Journey 26 predicted, and it is why the factory had to be fixed
before any fixture id moves.

## Fix Applied

Tests first, red captured, then the factory, then the call sites.

**Shape chosen: one table, one lookup, hard error.** The existing `getCanonicalSkillCategories()`
lazy singleton — already the file's single source for category, and already throwing in
`createMockSkill` when an id missed it — was widened from `Record<string, string>` (id → category)
to `Record<string, { domain; category; slug }>` and renamed `getCanonicalSkillTaxonomy()`. Every
value is now stated per id rather than computed from it. `deriveSlugFromId` and `DOMAIN_PREFIX_MAP`
are deleted; `deriveDisplayName` stays, because it derives from the slug that resolution produced,
not from the id.

Both factories now read `overrides?.x ?? canonical?.x` per field and throw when a field is in
neither place, naming the id and the fields to pass. That is parameter precedence over canonical
data — one lookup, not a resolution chain — and it is the shape `createMockSkill` already had for
category. A namespaced id is simply absent from the table, so it either carries the taxonomy its
caller states or fails loudly. It can no longer carry a fabricated one.

Table values preserve today's behaviour exactly, except the two slugs the shipped catalogue
contradicts, which now match the catalogue. Nothing asserted the wrong values.

**Ruling on `createMockSkill`, which was in scope:** it had ONE of the two defects. Its category
resolution was already correct — single lookup, throw on miss, no invented second tier — but its
slug came from the same `deriveSlugFromId`, so it broke the slug rule identically. Fixed, and with
no churn at its 268 call sites: the slug is in the table those ids already resolve through. Only
the ids in neither table nor override needed the new field, which is the whole of the call-site
work below.

**Call sites updated** (`createTestSkill` needed none — all 19 ids it is called with are in the
table, and the one whose slug the table corrected already overrode it):

- `mock-skills.ts` — `web-realtime-sse` and `local-house-style` state a slug; `CATEGORY_GRID_SKILLS`
  gains a `slug` field on all 30 entries, which `mock-matrices.ts` passes through.
- `matrix-health-check.test.ts`, `matrix-resolver.test.ts`,
  `skill-resolution.integration.test.ts`, `config-types-writer.test.ts`, `helpers.test.ts` — the
  fictional one-off ids (`web-custom-tool`, `web-perf-skill{n}`, `web-feature-advanced`, the four
  `acme-*` ids, `web-unknown-mystery`) state a slug beside the category they already stated.
- `api-monitoring-sentry` went into the table instead, being shared fixture data rather than a
  one-off.

**New spec:** `src/cli/lib/__tests__/factories/skill-factories.test.ts`, 11 tests. Four pin the
existing correct behaviour so the change cannot regress it; seven were red before the fix — a
namespaced id refused rather than split, an unregistered id refused rather than fabricated, slug
read from the table rather than the trailing segments (using the id whose real slug the derivation
contradicts, so the test fails on the derivation itself and not on a convention), and displayName
following a stated slug.

## Second Instance — `createMockExtractedSkill`, Same File, Same Day

The first pending item in the note above is now closed. `createMockExtractedSkill` carried the same
defect one field worse — it split the id four ways:

```ts
const segments = id.split("-");
const domain = segments[0] ?? "web";
const category = segments[1] ?? "framework";
const name = segments.slice(2).join("-") || "skill";
const directoryPath = `${domain}/${category}/${name}`;
// ...then category: `${domain}-${category}`, slug: name, displayName: name
```

**It too was already wrong on today's unprefixed ids** — and here the shipped catalogue can
adjudicate, because eight of the eleven distinct ids that reach this factory are real skills in
`BUILT_IN_MATRIX`. Four of those eight derived a category the catalogue contradicts:

| id                     | derived         | catalogue          |
| ---------------------- | --------------- | ------------------ |
| `api-database-drizzle` | `api-database`  | `api-orm`          |
| `api-framework-hono`   | `api-framework` | `api-api`          |
| `web-state-zustand`    | `web-state`     | `web-client-state` |
| `web-state-jotai`      | `web-state`     | `web-client-state` |

Three of the four already carried a `category:` override at one or more call sites, and
`web-local-skill` carried one against a derived `web-local` as well — the workaround was in the tree
at five sites and the cause was not, exactly as `infra-ci-cd-github-actions` was for the slug.
`api-database-drizzle` is the one nobody had patched: `source-loader.test.ts` fed `api-database`
into a matrix merge and asserted only `local: true`, so the wrong category passed through in
silence. That is the same signature as the first instance — the defect is only ever visible where
somebody happened to assert on the field it corrupted.

**`directoryPath` was wrong for every id, not merely some.** It emitted `web/framework/react`, and
no product path produces that shape. `extractAllSkills` sets `directoryPath` to the skill's
directory relative to the skills root, which `createTestSource` writes as `<category>/<id>`;
`local-skill-loader.ts` and `scripts/generate-source-types.ts` use a flat directory name; the
catalogue's `path` is `skills/<id>`. A three-level tree split out of the id is a value the loader
could never return, and `path` inherited it — `skills/web/framework/react/`, where `createMockSkill`
ten lines above writes `skills/web-framework/web-framework-react/` for that same skill. Two
factories in one file disagreed about where one skill lives, and neither was reading a fixture.

`displayName` was the fourth fabricated field: the trailing segments verbatim, so lowercase
`"react"` where the catalogue says `"React"`. One assertion had encoded that artefact.

**Fix — the same shape, no second one invented.** One lookup in `getCanonicalSkillTaxonomy()`,
`overrides?.x ?? canonical?.x` for domain, category and slug, and a throw naming the id and the
fields to pass. `displayName` becomes `deriveDisplayName(slug)`, derived from the slug resolution
produced, which the first pass established as legitimate. `directoryPath` becomes
`${category}/${id}` — the resolved category, then the whole id as a directory name, which is what
`createTestSource` writes and `extractAllSkills` therefore reads back, and which makes `path` agree
with `createMockSkill`. The id is a directory name there, not a source of fields; nothing is split,
and a namespaced id changes only which directory the fixture claims to sit in.

Three ids reached the factory without being in the table — `web-state-jotai`, `api-queue-bullmq`,
`ai-provider-cohere-sdk`. All three are real catalogue skills rather than one-offs, so they went
into the table with catalogue-true values instead of being patched at their call sites.

**Call sites: 54, not the 27 across 2 files the scope predicted** — `skill-resolution.test.ts` (21),
`scripts/generate-source-types.test.ts` (22) and `loading/source-loader.test.ts` (11); the scripts
file was not in the brief at all. **Fifty of the 54 needed no change**, and both of the files the
brief did not fully anticipate needed none whatsoever. The four that changed are the fictional
`web-custom-tool` in `skill-resolution.test.ts`, which now states a slug beside the category and
domain it already stated. One assertion in that file moved — `displayName: "react"` to `"React"` —
correcting a value the derivation had produced rather than broadening one to pass.

**Spec:** ten more tests in `skill-factories.test.ts`. Nine were red before the fix; the tenth pins
that a stated `path` still stands.

## Proposed Standard

**1. A test factory may not compute identity or taxonomy from an identifier.** CLAUDE.md's slug rule
already says this for slug and is silent on domain and category, which is how the category fallback
survived beside it. Widen the existing bullet under "Data Integrity" to: _NEVER derive `slug`,
`domain` or `category` from a skill ID or directory path — in product code or in test factories.
These are stated fields. A factory looks them up in one table and throws when the lookup misses._
Name the test layer explicitly: the rule was written for product code and the factories read as
exempt.

**2. `as` on a computed value needs a reason the way `any` does.** Every cast in this defect carried
a comment, and each comment described the mechanism (`Boundary cast: slug is derived from the ID's
trailing segments`) rather than justifying it — the comment stated the violation and read as
permission. Worth a line in `.ai-docs/standards/`: _a cast on a value the same expression just
computed is not a boundary cast. Boundary casts sit at parse boundaries, where the value came from
outside; a cast on your own arithmetic only suppresses the check that would have caught it._

**3. The gap this exposes has no owner.** `tsc`, ESLint, Prettier and the suite all passed on this
code for as long as it existed, and would pass on the next instance. Nothing here is checkable
mechanically — which is the argument for the reviewing agents holding it explicitly, since the only
detector available is somebody reading the factory. The recurring shape to look for: a `??` whose
right-hand side builds a value out of the same string the left-hand side used as a key.

The second instance shows a second shape that same detector walks past, because it has no table and
therefore no `??` over one: `id.split("-")` followed by `segments[n] ?? "web"`. The default is doing
the hiding — it guarantees the split always yields something, so the function has no failure mode to
notice and no branch a reviewer's eye catches. Both shapes reduce to one question, which is the one
worth asking of any factory: **is this field stated anywhere, or did the function make it up from
the key?**

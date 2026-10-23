---
type: standard-gap
severity: medium
affected_files:
  - apps/server/src/auth.ts
  - apps/www/src/lib/links.ts
  - packages/api-mocks/src/fixtures.ts
  - packages/api-mocks/src/handlers.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-10-22
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: missing-rule
status: partial
partial_note: >-
  The constants named below carry the clause. No standard says when a constant needs one, and the
  census below covered only that lane's files.
---

## What Was Wrong

TypeScript checks a fresh object literal for unknown keys and nothing else. A constant that reaches
its consumer through a spread, or passed as a variable, is never checked, so a misspelt key
compiles and the consumer's default applies.

Three such constants mirrored a named type and were bound to none:

- `DECLINE_LOCATION` in `apps/server/src/auth.ts`, spread into `cloudflareOptionsFor`'s return and
  passed to `withCloudflare`. `better-auth-cloudflare` documents `autoDetectIpAddress` and
  `geolocationTracking` as `@default true`. A copy of the file with `geoLocationTracking` misspelt
  compiled (`tsc` exit 0), so the opt-out would silently switch back on. Unverified: whether a
  re-enabled `geolocationTracking` then fails loudly at session creation against a schema with no
  geolocation columns. `db/auth-schema.test.ts` reads `getAuthTables({})`, so plugin fields are
  outside it, and `autoDetectIpAddress` has an `ipAddress` column to write into.
- `EXTERNAL_LINK_ATTRS` in `apps/www/src/lib/links.ts`, given as Starlight sidebar `attrs` (a
  string-keyed record) and spread onto the 404 header's anchors. Copies of `links.ts` with `rell`
  and of `astro.config.ts` compiled (`tsc` exit 0), so every external link would lose
  `noopener noreferrer` silently.
- `EXTERNAL_SKILL`, `OTHER_EXTERNAL_SKILL` and `OVERSIZED_EXTERNAL_SKILL` in
  `packages/api-mocks/src/fixtures.ts` hold the `repo`, `path` and `files` a payload's `external`
  entry carries (`apps/editor/e2e/specs/external-skills.spec.ts` compares them), but nothing named
  `SeedExternalSkill` in either file. With a copy of `seed.ts` renaming the contract's `path`, the
  HEAD fixtures compiled (exit 0). `handlers.ts` read the trees through an uncommented
  `as Record<string, string>` cast.

## Fix Applied

Each constant is now `as const satisfies <the consumer's type>`: `CloudflareOptions`
(`Parameters<typeof withCloudflare>[0]`), Astro's `HTMLAttributes<"a">`, and `ServedSkillTree`
(`Pick<SeedExternalSkill, "repo" | "path" | "files">`, exported from `fixtures.ts`).
`handlers.ts` types `SKILL_TREES` as `readonly ServedSkillTree[]`, and the cast is gone. The same
probes now fail at the definition: TS2561 `'geoLocationTracking' does not exist in type
'WithCloudflareOptions'`, TS2561 `'rell' does not exist in type 'HTMLAttributes<"a">'`, and
TS2344 on `ServedSkillTree` for the renamed contract.

`typescript-types-bible.md` § 10 says a `satisfies` clause must not change the type it annotates.
Type-equality probes (`Equal<typeof NEW, typeof OLD>`, each paired with a negative control that
failed) showed all five constants keep their HEAD types.

Census (this lane's files only, not the CLI, editor or compile): every `as const` with no
`satisfies` in `packages/{matrix,api,api-mocks,ui}/src`, `apps/server/src` and `apps/www/src`,
excluding tests, stories and generated files. Each hit was judged one way. Either a named type
exists and nothing checks the constant against it (changed), or no named type exists, or a use
site already checks it. Every hit the command prints now is left: `PATHS` (`GLYPH_PATHS`),
`PANE_SIDES`, `PALETTE`, the three scope arrays and `DRAG_END_EVENTS` (each checked where it is
passed), `INDEXED_REPOS`, `SIGNED_IN_USER`, the five response bodies, the drizzle `schema` spread,
and three inline literal narrowings (`"lazy" as const`, `"unauthorized" as const`, a `[a, b] as
const` tuple). Re-run:

```
grep -rn 'as const' packages/matrix/src packages/api/src packages/api-mocks/src packages/ui/src apps/server/src apps/www/src --include='*.ts' --include='*.tsx' | grep -v satisfies | grep -v -e '\.test\.' -e '\.stories\.' -e '/generated/' -e '/vendor/'
```

What would catch the clause being removed: nothing. Neither the worker's suites nor www's
`scripts/check-*.ts` assert the options passed or the built anchors' `rel`.

## Proposed Standard

In `typescript-types-bible.md` § 10: a constant that reaches its consumer through a spread or as a
variable, and mirrors a type the consumer declares, takes `as const satisfies <that type>`. Name the
consumer's own type, not a shape written for the purpose. Where a use site already checks the shape,
or no such type exists, leave it. Checked against CLAUDE.md and § 10: no conflict. It narrows § 10's
`satisfies`-must-not-change-the-type rule rather than contradicting it.

## Correction

The Proposed Standard prescribes `as const satisfies`, but only `satisfies` refuses an unknown key,
so the `as const` half is withdrawn.
`2026-10-22-the-expressive-typescript-skill-recommends-as-const-satisfies-which-stryker-never-mutates.md`,
filed after this one, keeps `as const` only where a reader consumes the literal types, because
Stryker makes no mutants under it. As first written, the two gave different answers for
`DECLINE_LOCATION`. Now this finding decides that the check is there, and that one decides whether
`as const` is.

Measured on copies of each constant in a scratch project extending its workspace's `tsconfig.json`
(`tsc` 6.0.3). `satisfies` alone refuses the misspelt key with TS2561 for all three types:
`geoLocationTracking` against `WithCloudflareOptions`, `rell` against `HTMLAttributes<"a">`, and `pth`
against `Pick<ServedSkillTree, "path" | "repo">`. The same literal under `as const` with no clause
compiles (exit 0). Without `as const`, `DECLINE_LOCATION` loses only `readonly`, and `false` stays
`false`. `EXTERNAL_LINK_ATTRS` also widens `rel` to `string`. A served skill tree widens `repo`,
`path` and each file's text to `string`, and keeps its keys.

The five constants keep `as const` because each had it at HEAD, and this change added a check
without changing a type.

Corrected proposal: in `typescript-types-bible.md` § 10, a constant that reaches its consumer
through a spread or as a variable, and mirrors a type the consumer declares, takes
`satisfies <that type>`. The rest of the wording above stands. Whether `as const` comes before the
clause is the other finding's rule.

Landing it also rewrites § 10's opening line, "Use `as const` for constant data to get literal types
automatically", which the Stryker finding's rule (`as const` only where a reader consumes the
literal types) contradicts.

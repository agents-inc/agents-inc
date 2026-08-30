---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/features/configure/lib/output-preview.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: web-developer
category: typescript
domain: web
root_cause: missing-rule
status: resolved
resolved_by: >-
  SUPERSEDED MECHANISM, corrected 2026-08-26. The sentinel defect this finding reports
  is still fixed, but the mechanism first recorded here — a `primarySourceName` in
  `apps/editor/src/features/configure/lib/output-preview.ts` mirroring `sourceForSkill`
  — was itself defective and has been deleted. It read `availableSources`, which only the
  CLI's multi-source loader fills, so in a browser it answered `agents-inc` for every
  visitor. The pin named here went with it: it took the marketplace off the plugin
  variant's `origin`, which is written from the same empty field, so both sides of the
  comparison collapsed to the same value and it could never fail. Both are documented in
  `2026-08-26-two-derivations-of-one-structurally-empty-field-agree-so-the-pin-between-them-cannot-fail`.
  The live mechanism is `seatedMarketplace()` in the same module — a discriminated union
  a caller cannot reach a ref on believing it holds a name — rendered by
  `marketplacePhrase` for prose and `ejectedSourceLine` for the coordinate. Pinned by four
  specs split by SEAT rather than by install mode, including "never names the eject
  sentinel as a source repository", which is this finding's own claim.
  Note that no gate caught the stale citation: `check-finding-citations` extracts backticked
  identifiers and holds them against the working tree, and `primarySourceName` still exists
  in `packages/cli`'s wizard store, so the name resolved while naming the wrong thing.
---

## What Was Wrong

`SkillConfig.origin` carries two different kinds of thing in one `string` field. For a plugin
skill it is a marketplace NAME — `agents-inc`, or whatever the catalogue declares as the skill's
primary source. For an ejected skill it is the sentinel `EJECT_SOURCE`, which is the literal
`"eject"` and names no marketplace, no repository and no place at all.

The output preview's note for an ejected catalogue directory interpolated that field into a source
coordinate:

```
Source: ${skill.origin}/${SKILLS_DIR_PATH}/${skill.id}
```

and rendered

```
Source: eject/src/skills/web-framework-react
```

**The site that renders it is the one site where the sentinel is the only reachable value.** The
note exists solely to explain an ejected directory, so `origin` is `"eject"` on every render — the
defect is 100% reproducible, was never intermittent, and was still invisible, because the output is
a well-formed, plausible-looking path. That is the whole shape of the class: a sentinel does not
produce a crash or a blank, it produces a lie that reads like data.

Two things made it survive review. The first is that the docblock asserted the false half in as
many words — _"The coordinate is built from the skill's own `origin`, which is the marketplace name
the config records for it — the same value the install reads back"_ — which is true of the plugin
note thirty lines below and false of the function it sat on. A reader checking the code against its
comment finds agreement. The second is that nothing in the type can tell the two apart: both arms
are `string`, so no narrowing exists at the interpolation site and no `tsc` run has an opinion.

This matters more here than it would elsewhere, because the dialog's entire premise is byte-honesty
— the design file's constraint is _"the moment someone diffs it against reality and it is off, they
stop trusting the configurator"_ — and an invented repository coordinate is precisely the failure
that premise names.

The nearest existing rule is `packages/cli/CLAUDE.md`'s _"NEVER print a skill or agent
`displayName` inside a block that describes the filesystem"_, which is the same class stated for one
specific field: a value that is correct for one audience and wrong as a path. It does not generalise
on its own, because a reader looking for it greps for `displayName`.

Census — every interpolation of an `origin` into rendered text, which is deliberately wider than the
class so the reader can see what was ruled out rather than take a filtered list on trust:

```
grep -rn 'origin}/\|\${.*\.origin}' apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules
```

Six hits on 2026-08-26. Three are not this field at all (`location.origin` in `use-share-link.ts`, a
Playwright route in `e2e/fixtures.ts`, an `effective.origin` scope word in `configuration/config.ts`)
and two put a `SkillConfig.origin` into prose rather than a coordinate (`config-to-seed.ts`'s
diagnostic, an e2e matcher's failure message) — a marketplace named in a sentence is fine whichever
arm it is on, because a reader cannot mistake it for somewhere to go. **The one remaining hit is
`pluginReferenceNote`, in the same module, ten lines from the defect, and it is CORRECT**: it renders
only for a plugin skill, where `origin` genuinely is the marketplace name. Two notes side by side
with the same expression, one right and one wrong, is why the mistake reads as consistent.

## Fix Applied

The note now takes the marketplace as an argument rather than reading `origin`, and the argument is
resolved from the seated catalogue:

```ts
const primarySourceName = (skill: CatalogSkill): string =>
  skill.availableSources?.find((source) => source.primary)?.name ?? DEFAULT_PUBLIC_SOURCE_NAME;
```

which mirrors `sourceForSkill` in `packages/compile/src/seed-to-config.ts` — the function that
writes a plugin skill's `origin` in the first place, so both surfaces answer the same question the
same way.

**The mirror was the second choice and the reason is worth recording.** Exporting `sourceForSkill`
and calling the one implementation is strictly better, and it was written and reverted: the module is
bound by a row in `scripts/check-enumeration-drift.ts` (`CONFIG_GENERATOR`), so a seventh export
reddened `scripts/check-enumeration-drift.test.ts` with

```
presentButUnnamed: ["sourceForSkill"]
```

and closing that requires editing `.ai-docs/reference/config/scope-split.md`'s exhaustive table
**and** the checker's own `from:` anchor, which carries the ordinal `"so a seventh export cannot
land without this table naming it:"`. Both are files another lane had open. So the finding has a
second half: **a new export from a drift-bound module is a three-file change across two workspaces,
and a lane that does not own those files cannot make it.** The anchor string is the avoidable part
— an ordinal inside the anchor means the anchor has to move every time the table grows.

What holds the mirror to the original is stated rather than hoped for:
`output-preview.test.ts`'s "names the marketplace an ejected skill is copied from, never the eject
sentinel" builds the same skill twice, as a plugin and as an eject, reads the marketplace off the
origin the **decode** recorded for the plugin variant, and asserts the note both contains
`${marketplace}/src/skills/${id}` and does not contain `${sentinel}/`. Two answers that disagree
redden it.

## Proposed Standard

For `clean-code-standards.md`, and phrased as a question rather than a blacklist, because the same
expression is correct at the neighbouring site:

> **A field whose domain includes a sentinel must not be interpolated into a coordinate without
> first establishing which arm it is on.** A coordinate is anything a reader could act on: a path, a
> URL, a repository reference, an import specifier, an identifier someone might grep for. Ask what
> the field holds at _this_ call site — if the answer is "the sentinel, always", the field is the
> wrong source and the right one is whatever the sentinel replaced.
>
> The tell is a sentinel that is a plain `string` beside names that are also plain `string`s. There
> is no narrowing to forget, so nothing reports it, and the rendered result is well-formed.

No checker is proposed. Deciding whether an interpolation target is a coordinate needs the meaning
of the surrounding sentence, and the census above returns the correct site as readily as the wrong
one — a gate over it would be two hits, one of them a permanent false positive.

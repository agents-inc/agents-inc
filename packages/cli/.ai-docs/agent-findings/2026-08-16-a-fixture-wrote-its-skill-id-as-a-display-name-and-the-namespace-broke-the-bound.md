---
type: convention-drift
severity: medium
affected_files:
  - e2e/fixtures/project-builder.ts
  - e2e/helpers/test-utils.ts
  - e2e/commands/doctor-diagnostics.e2e.test.ts
  - e2e/commands/local-skill-invalid-metadata-yaml.e2e.test.ts
  - e2e/commands/compile-incomplete-skill-metadata.e2e.test.ts
  - e2e/commands/compile-malformed-skill-metadata.e2e.test.ts
  - e2e/commands/uninstall-global-propagation.e2e.test.ts
  - e2e/lifecycle/doctor-global-scope-blind-spots.e2e.test.ts
  - e2e/lifecycle/edit-global-propagation-stale-stack-ref.e2e.test.ts
  - e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-16
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  The residue is cleared and the rule is written down. Standards — a fourth bullet under
  `.ai-docs/standards/e2e/test-data.md` -> "A Fixture Writes Content the Product Could Have
  Written" now states that a fixture's metadata.yaml must satisfy the same schema the product
  enforces and that a display name is not an identifier, which is where the four builder writers
  would have seen it instead of on a sibling constant's doc comment. Code — all 34 inline sites
  named under "Residue" now write `E2E_SKILL.<slug>.display`, and so do 8 further sites the
  finding's own grep missed because they pass the id through a local alias (`REACT`, `VITEST_ID`,
  `HONO`, a loop's `skill.id`). Twenty-two grid-addressing sites across seven spec files were moved
  from id to display in the same pass — the rename had broken the coincidence that let a row be
  addressed either way. Full e2e suite green at 206 files.
---

## What Was Wrong

Four `ProjectBuilder` writers wrote an installed skill's `metadata.yaml` with its own skill id as
the `displayName`:

```ts
metadata: renderMetadataYaml({
  displayName: skillId,
  ...categorySlugFor(skillId),
  ...
});
```

That was harmless while a fixture skill id was `web-framework-react` (19 characters). The fixture
marketplace gained a namespace — `e2eSkillId` composes `e2e-test-fixture-<bare>` so a published
identity is written in its marketplace's namespace, as a real one is — and the same ids became 33 to
36 characters. `skillMetadataBaseSchema` in `src/cli/lib/schemas.ts` bounds `displayName` at
`min(1).max(30)`, and `splitMetadataValidationIssues` downgrades exactly ONE issue to advisory (an
over-length `cliDescription`); everything else stays an error.

So every project the fixture built carried an installed skill whose `metadata.yaml` violated the
schema. `doctor`'s content layer validates every installed `metadata.yaml`
(`validateInstalledSkillMetadata` in `content-validator.ts`), so it reported the truth:

```
    Skills                  ✗  1 skill: 1 error, 0 warnings
                               - [ERROR] ~/.claude/skills/e2e-test-fixture-web-framework-react: metadata.yaml: displayName: Too big: expected string to have <=30 characters
```

`doctor` aggregates one exit code across both layers, so the content row's `fail` alone produced
exit 1 — and five specs asserting `EXIT_CODES.SUCCESS` on a project the fixture calls healthy
failed. The report was right and the fixture was wrong.

The rule the fixture broke was already written down — in a doc comment on ONE constant, in a
different file. `FORKED_FROM_METADATA` in `e2e/helpers/test-utils.ts` says:

> Carries the full descriptive field set a real fork copies from its origin, not just the fork
> provenance: `doctor`'s content layer validates every installed metadata.yaml against the strict
> schema, so a fixture missing them reads as a broken install rather than a forked one.

That constant writes `displayName: "web-framework-react"` — unprefixed, inside the bound. The four
writers in `project-builder.ts` never saw the note, because it lives on a sibling constant rather
than in a standard.

## Fix Applied

`SKILL_CATEGORY_SLUGS` already existed in `project-builder.ts` as the one per-id map of identity
facts a fixture writes, with a `categorySlugFor` accessor that throws on an unmapped id (deriving
any of them from an id being banned by CLAUDE.md). `displayName` is the same class of fact, so it
joined the map rather than getting a second lookup beside it: the map is now
`SKILL_IDENTITY_FIELDS` and the accessor `metadataFieldsFor`.

Each `displayName` is `E2E_SKILL.<slug>.display` — the title the fixture SOURCE writes into that
skill's own `metadata.yaml` (`E2E_SKILL_TITLES` in `create-e2e-source.ts`). An installed copy and
the catalogue entry it came from now name the skill identically, which is what an ejected copy is;
before the fix they disagreed, and only the source's title happened to be what the wizard painted.

Three writers lost their `displayName:` line to the spread; `ProjectBuilder.minimal` names
`E2E_SKILL.vitest.display` directly, beside the `E2E_SKILL.vitest.slug` it already named.

Established by A/B rather than by inspection: neutralising `checkUnresolvedRuleSlugs` (the other
change landing the same day) and rebuilding left all four failures in place; neutralising the
fixture's `displayName` alone turned all twelve tests in the two files green.

## Residue — 34 inline sites the builder fix did not reach (CLEARED)

`ProjectBuilder` is not the only writer. Eighteen spec files called `renderMetadataYaml` directly
and passed `displayName: E2E_SKILL.<slug>.id`, which is the same defect written out by hand (the
list below says twenty; recounting the same grep gives 34 sites across 18 files):

```
grep -rn "displayName: E2E_SKILL\..*\.id" e2e
```

`commands/compile-warns-scope-dropped-stack-pair`, `commands/uninstall-global-propagation` (2),
`interactive/edit-agent-scope-routing`, `interactive/edit-skill-accumulation` (2),
`interactive/edit-wizard-dual-scope-collapse-removal-row` (2),
`interactive/edit-wizard-excluded-skills` (8),
`interactive/edit-wizard-global-scope-pending-removal-row` (2), `interactive/edit-wizard-launch`,
`interactive/sources-inert-row-selection-check` (2), `lifecycle/doctor-global-scope-blind-spots` (3),
`lifecycle/edit-global-agent-removal-propagation`, `lifecycle/edit-global-remove-dual-scope-partial`,
`lifecycle/edit-global-source-toggle-propagation-compiled-ref`,
`lifecycle/edit-project-scope-last-skill-stack-cleanup`,
`lifecycle/edit-project-source-migration-propagates`,
`lifecycle/edit-remove-last-skill-stack-cleanup`, `lifecycle/edit-remove-skill-stack-surgical` (3),
`lifecycle/empty-scope-dirs-removed`.

Three in `doctor-global-scope-blind-spots.e2e.test.ts` failed on the day this was written, and one
more the list did not single out: `commands/uninstall-global-propagation`'s first spec closes with
a `doctor` run against the project it seeded, so its own fixture failed it. The other 30 put a
metadata.yaml on disk that violates the schema and no assertion in their spec ever opened it, so
they were latent: the next spec to run `doctor`, or `compile`, against one of those fixtures
inherits the failure.

All 34 now write `E2E_SKILL.<slug>.display`, alongside the eight further sites the grep above
misses because they reach the id through a local alias rather than naming it — `displayName:
REACT` (`lifecycle/edit-global-propagation-stale-stack-ref`), `displayName: VITEST_ID`
(`lifecycle/dual-scope-same-source-eject`, `lifecycle/dual-scope-same-source-plugin`),
`displayName: HONO` (`lifecycle/dual-scope-mixed-source-compiled-ref`), and a loop's
`displayName: skill.id` / `displayName: id` (`interactive/edit-wizard-detection` twice,
`interactive/edit-agent-scope-routing`, `lifecycle/agent-scope-toggle-keeps-curation`). Forty-two
sites in total. **A grep keyed to the literal `E2E_SKILL.<slug>.id` under-counts this defect by a
quarter** — the aliases are what a spec writes once it names the skill more than twice.

## The other half — a row addressed by id where the grid paints its display name

Before the namespace prefix an id and its title were often the SAME STRING, so a spec could address
a build-grid or Sources-grid row by either and nothing distinguished them. The rename separated
them and left twenty-two such sites red across seven files: `focusSkill` / `selectSkill` /
`getScopeBadgesForSkill` (and `readSkillBadgesViaEdit`, which forwards to it) take the LABEL, and
so do `toContain` assertions on a rendered frame. All now pass `E2E_SKILL.<slug>.display`; the
config-side assertions in the same specs keep the id, which is why two of the files now carry both
constants (`REACT_SKILL_ID` and `REACT_SKILL_LABEL`).

One is not a naming fix at all and is worth its own line: `interactive/edit-wizard-navigation`'s
`S`-key spec ran against the DEFAULT catalogue and focused `"React"`, which had been the installed
fixture skill's own row only because the two ids coincided. Post-rename that string is the public
catalogue's React — a different, unselected cell — so the `s` press toggled scope on nothing and
the confirm step showed no Global section. It now focuses the installed copy's title.

## Left alone, deliberately

Two things in the same class were found and NOT changed, because no assertion demands them and
each is its own decision:

- `interactive/edit-wizard-detection`'s second spec derives a skill's `category` and `slug` from
  its id by string-splitting (`id.split("-")`, first two parts as category, the rest as slug).
  Against a namespaced id that yields `category: "e2e-test"` and `slug:
"fixture-web-framework-react"` — an installed copy that disagrees with the catalogue entry it
  came from on both fields, which is the same defect as the `displayName` one, in two more fields.
  It does not fail: `categoryPathSchema` accepts any kebab-case string. Deriving a slug from an id
  is separately banned by CLAUDE.md.
- `lifecycle/global-scope-lifecycle`'s doctor spec carries `expect(stdout).toContain("")` — an
  empty `toContain`, which passes on any input. Its comment shows it is residue from replacing a
  weak fragment match with the regex on the following line.

## Proposed Standard — LANDED

`.ai-docs/standards/e2e/test-data.md` -> "A Fixture Writes Content the Product Could Have Written"
carries it as a fourth bullet: a fixture's `metadata.yaml` must satisfy the same schema the product
enforces, a display name is not an identifier, and the value to write is
`E2E_SKILL.<slug>.display` — which is also what the grid paints, so it is what a page object
addresses a row by.

The bound itself is worth a second look by the owner, separately from this finding: a namespaced id
in the PUBLIC catalogue would run into the same 30 characters if anything ever wrote one as a
display name, and nothing outside the schema says the two fields are different kinds of thing.

## The wrap point that moved with the id

Two `compile` specs assert `STEP_TEXT.COMPILE_METADATA_UNUSABLE` ("does not describe") on an oclif
error box. Nothing about the message changed — the skill id printed on the line ABOVE it grew by
17 characters, oclif re-wrapped the box, and the sentence started straddling a line break as
`does not\n ›    describe`. Both now assert through `flattenCliOutput`, the existing helper for
exactly this (`e2e/fixtures/seed-config-store.ts`), which is what
`commands/edit-refuses-unusable-local-skill-metadata` already does for the sibling
`METADATA_UNUSABLE_WAY_OUT` line. Shortening the fragment was the alternative and is worse: it
would also pass on a message that had been truncated. `STEP_TEXT`'s comment on the constant now
says so, as its neighbour already did.

---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/lib/api/catalog.ts
  - apps/editor/src/lib/api/catalog.test.ts
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/config-store.test.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-19
reporting_agent: web-developer
category: architecture
domain: web
root_cause: premise-expired
status: resolved
supersedes: 2026-08-19-a-discard-report-copied-verbatim-carries-the-key-the-visitor-typed.md
resolved_by: >-
  All three sites truncate, and each is pinned by an assertion over the whole reported payload
  rather than over the expression that builds it. `issuesOf` answers twice — `wholePath` for the
  dialog of whoever fetched the catalogue with their own token, `firstSegment` for the report.
  `persistedConfigSchema`'s discard branch keeps the first path segment. `reportPruning` sends the
  boolean `droppedStack` in place of the stack id it used to name. The predecessor's own guard was
  already correct and already green, so the fixture was replaced too: a catalogue that IS a
  catalogue apart from one entry, which fails INSIDE the record rather than on it. The standards
  table that certified the first of those safe now carries three rows and every one reads No.
---

## What Was Wrong

A zod issue path is only safe to report in full when every segment it can produce is the schema's own
vocabulary. `.ai-docs/standards/editor-and-worker.md` said so, worked the question through per
schema, and published a table with `persistedConfigSchema` marked **Safe to join: Yes**. That row was
false when it was published, and a live leak sat under it.

**The table's justification inspects precisely the class of id that never reaches the slot.** It
argues from `externalSkillId`, which mints `external-<kebab(category)>-<kebab(name)>` and so cannot
widen a segment past a sanitised directory name. But `onlyPersistableSkills` filters _external_
skills OUT of what gets persisted and keeps every id the SEATED catalogue holds — and
`useCatalogStore.load` seats a fetched matrix. So the ids the proof reasons about are the ones the
filter removes, and the ids that survive into `skills` and `remembered` are the marketplace's own. On
a private catalogue every one of them is a name the org chose.

Demonstrated end to end rather than argued: with the joined form in place, the store's discard branch
emits `skills.acme-web-widgets.install: invalid_value`.

Three production sites, found by two censuses rather than one:

| Site                                    | What it sent                                      | Now                                        |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `issuesOf` in `lib/api/catalog.ts`      | the whole path over `matrixSchema`                | `wholePath` shown, `firstSegment` reported |
| the discard branch in `config-store.ts` | the whole path over `persistedConfigSchema`       | the first segment only                     |
| `reportPruning` in `config-store.ts`    | `droppedStackId`, a bare VALUE and no path at all | the boolean `droppedStack`                 |

The third is the one no `issue.path` census can reach. It carried a comment reading _"Catalog slugs
and counts — nothing here describes the user"_, which was true while there was one catalogue and it
was ours; a stack id is `matrixStackSchema.id`, as marketplace-owned as a skill id, and this is the
exact report a visitor switching back OFF their marketplace files.

`matrixSchema` also has **three** marketplace-keyed records rather than the two its top level shows:
`categories` and `skills` there, and `matrixStackSchema`'s own `skills`, nested two deep — agent id,
then category id — because a stack names the agents it staffs and the roster is as marketplace-owned
as the skills are.

### Where the report goes is what decides that a leak occurred

The predecessor left `catalog.ts` an owner's call "because nothing is one field away from a
credential". That is the wrong test. Adjacency to a credential decides how bad a leak is, not whether
one occurred. What decides whether one occurred is where the report goes, and that is fixed rather
than open to judgement: `sentry.ts` calls `setReportingSink` with a Sentry sink configured
`tunnel: ${env.VITE_API_URL}/monitoring`, so every `reportIssue` context and every `reportError`
payload transits our own worker before it reaches Sentry at all. A diagnostics channel is therefore
not a neutral place that becomes sensitive when a secret is nearby — for this codebase it is
_specifically_ the infrastructure that `catalog.ts` fetches browser-direct in order to route around,
and its header says so: "an org's skill names, descriptions and stack philosophy are the org's, so
the bytes go from their repository to their browser and pass through nothing of ours." Any org
vocabulary in a report has already crossed that line, whether or not a token was ever in the same
object. Ask where the payload lands before asking what is beside it; the first question has one
answer for the whole app, and the second has a different answer at every call site.

### The guard was already correct, and green, and proved nothing

`catalog.test.ts` carried the right shape — stringify the entire `reportIssue` call log and refuse
the private id, exactly the shape `marketplace-store.test.ts` settled on — and it passed because
`MALFORMED_CATALOG` sets `skills: []`, breaking `skills` at the _top level_. Every path that fixture
can produce is one segment long, and a one-segment path can never contain a record key, which is the
only thing the assertion was there to catch. The fixture was not weak in the ordinary sense of
covering too few cases; it was structurally incapable of reaching the class, so the test's greenness
carried no information at all.

The rule: when the danger lives in a path segment, the fixture must fail _inside_ the record, not on
it — and a reviewer's check is to ask what the deepest path the fixture can generate looks like, then
compare that depth against the first `z.record` in the schema. If the fixture bottoms out above that
record, the guard is decorative. Prove it by swapping the redaction out and watching the id appear; a
guard that has never emitted the string it forbids has not been shown to forbid it.

### Root cause: the premise expired

The rule was right when it was written and expired without a sound. `persistedConfigSchema`'s records
were keyed by our vocabulary for as long as there was one catalogue and it was ours, and the
standards' proof of that — `externalSkillId` mints `external-<kebab(category)>-<kebab(name)>`, so the
widest a segment gets is a sanitised directory name — was valid for the only route a foreign id could
then take. The marketplace seat added a second route and did not touch the standards, the schema, or
the reporting site: `useCatalogStore.load` seats a fetched matrix, `onlyPersistableSkills` keeps every
id the seated catalogue holds (it filters _external_ skills out, which is why the original proof
inspects precisely the class that never arrives), and a private org's skill ids began flowing into a
payload documented as safe. **A rule that was wrong when written fails review; a rule whose premise
expires passes review forever, because the reasoning still reads as sound and only the world has
moved.** This corpus is full of the second kind. The cheap countermeasure is not more review — it is
naming, in the rule itself, the fact it depends on, so that a change to that fact has something to
collide with. Here the fact is one sentence: _"`persistedConfigSchema` is safe to join only while
every id it persists is minted by this repository"_ — which the marketplace seat would have
contradicted in the same commit that introduced it.

## Fix Applied

All three sites, in source, each with the reason written at the call site rather than in a commit
message.

`issuesOf` splits into two destinations. `shown` keeps the whole path, because it reaches the dialog
of whoever just fetched this catalogue with their own token and has to locate one broken entry among
hundreds. `reported` keeps `firstSegment`. The two expressions are named rather than written inline,
because they differ by a character and the whole failure guarded against is one being copied where
the other belonged. The split is the first segment rather than a walk down to the first record key,
since which depth is safe is a property of the schema and a walk encoding it in the handler would go
quietly wrong the next time `matrixSchema` grows a field.

The discard branch in `config-store.ts` keeps the first segment and the code.

`reportPruning` sends `droppedStack` as a boolean. The id named a catalogue this browser no longer
has seated and could not be looked up anyway, so the boolean is the whole of what an observer can act
on.

Both guards assert over the stringified call log rather than over the field, because a check on the
reported field alone passes while the path leaks. `catalog.test.ts` gained a fixture that breaks one
entry INSIDE `skills` rather than breaking `skills` itself, which is what makes its existing
assertion capable of failing.

The standards table is replaced: three rows — `persistedConfigSchema`, `savedMarketplacesSchema`,
`matrixSchema` — and every one reads **No**.

## Proposed Standard

Landed in `.ai-docs/standards/editor-and-worker.md`, in the section that already carries the
migrate/merge split, as four additions rather than one:

1. **The corrected table**, all three rows No, with the reason the old Yes row was wrong stated
   explicitly rather than deleted — the argument that produced it is the kind a careful reader would
   reconstruct.
2. **The destination test**: ask where the payload lands before asking what is beside it. One answer
   for the whole app, versus a different answer at every call site.
3. **The fixture-depth rule**: compare the deepest path the fixture can generate against the first
   `z.record` in the schema.
4. **The census is two questions.** `grep -rn 'issue\.path' apps/editor/src` finds PATH leaks only.
   The value half is `grep -rn 'reportIssue(' apps/editor/src`, read for what each context field
   CONTAINS rather than for how it was built — 18 sites at the time of writing, a census of the
   editor's non-test source, and worth re-deriving rather than trusting.

One honest residual, recorded in the same section: `error-boundary.tsx` hands the whole thrown error
to `reportError`, which ends at `captureException`, and a `ZodError`'s message is its issues
serialised with `path` included. So a `.parse` that THROWS is a reporting site with no `issue.path`
and no `reportIssue(` near it, and **neither grep can see it**. There are two, both over
`seedPayloadSchema` — `toSeedPayload`, and the round-trip parse in `use-install-command.ts`. Left as
they are because each parses data the app itself just produced, which is a judgement about likelihood
rather than a proof of safety.

Cross-checked against `CLAUDE.md` and the standards docs: this corrects a published rule rather than
contradicting one, and the `premise-expired` value it is filed under was added to `TEMPLATE.md`'s
enum in the same pass, per that file's rule 4.

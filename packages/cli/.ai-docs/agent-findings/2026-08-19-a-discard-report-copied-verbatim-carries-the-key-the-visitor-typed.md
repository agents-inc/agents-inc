---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/lib/api/catalog.ts
  - apps/editor/src/env.schema.ts
  - apps/editor/src/stores/marketplace-store.ts
  - apps/editor/src/stores/config-store.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-08-19
reporting_agent: web-developer
category: architecture
domain: web
root_cause: rule-not-specific-enough
status: superseded
superseded_by: 2026-08-19-zod-path-joins-leak-marketplace-owned-record-keys.md
---

## Superseded — read the replacement for the corrected census

`2026-08-19-zod-path-joins-leak-marketplace-owned-record-keys.md` replaces this file. Two things
below are now false and are kept rather than edited, because what a wrong finding claimed is the
evidence for how it went wrong.

- **The census table marks the `config-store` discard branch "Safe — the writer keys these records
  by nothing else". It is not, and it was leaking when this was written.** The argument reasons from
  `externalSkillId`, and `onlyPersistableSkills` filters external skills OUT while keeping the seated
  catalogue's own ids — so the proof inspects exactly the class of id that never reaches the slot.
- **"Not fixed: `issuesOf`" and the `partial_note` that said the same thing are both closed.** All
  three sites carry the truncation, the third of them a VALUE leak in `reportPruning` that no
  `issue.path` census could ever have found. The `partial_note` was removed from the frontmatter when
  the status changed, and it asserted exactly the two pending halves named here.

The discriminator this finding states is correct and survives unchanged. What it got wrong is one
row of its own worked example.

## What Was Wrong

A discard path that reports what it refused is the right shape, and the editor now uses it in four
places. **What travels in the report is a separate decision from whether to report**, and the two
were treated as one thing: `config-store`'s `merge` was held up as the shape to copy, and the shape
includes its context payload — `issue.path.join(".")` for each zod issue, with the codes and no
values.

That payload is safe where it was written and unsafe one store over, for a reason nothing in it
shows. `persistedConfigSchema` keys its records by CATALOGUE IDS: `onlyPersistableSkills` filters
the persisted map to skills the loaded catalogue knows and drops added ones, so every segment a
path can produce is either a field name from the schema or an id from a public catalogue.
`savedMarketplacesSchema` keys its record by **the repository the visitor typed**, and the value
beside that key is their GitHub PAT. Copied verbatim, the same expression reports
`saved.acme/private-skills: invalid_type` — the org's private repository name, into a channel whose
whole design premise is that a private marketplace never touches our infrastructure.

Demonstrated rather than argued: with the verbatim form in place, the store's own unit spec emits
the private ref. `apps/editor/src/lib/observability/report.ts` is a swappable sink, silent in
production until something is listening, so what the payload carries is a statement about whatever
monitoring service is wired in later — not about the console.

**The discriminator is whose vocabulary keys the schema.** A zod issue path is only safe to report
in full when every segment it can produce is the schema's own — a field name, an array index, or an
id from a catalogue the app already publishes. Wherever the schema is a `z.record` keyed by user
input, a path segment IS the user input, and the path is truncated to its first segment.

The census over every production site that builds a report string out of an issue path:

```
grep -rn 'issue\.path' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Four hits in four files, and one of them is a live instance:

| Site                                                     | What a path segment can be                         | Verdict                                              |
| -------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `parseEnv` in `env.schema.ts`                            | an environment variable name                       | Safe — the schema's own vocabulary                   |
| `merge` in `stores/config-store.ts`                      | a field name or a public-catalogue id              | Safe — the writer keys these records by nothing else |
| `readSavedMarketplaces` in `stores/marketplace-store.ts` | a repository the visitor named                     | Fixed — first segment only                           |
| `issuesOf` in `lib/api/catalog.ts`                       | a PRIVATE marketplace's own skill and category ids | **Live** — joins the whole path                      |

`issuesOf` is the sharpest of the four because its own comment states the rule it breaks: _"Paths
and codes, never values. A private marketplace's skill names are the org's own, and a diagnostics
channel is exactly the wrong place for the one thing this whole design keeps off our
infrastructure."_ The comment is correct about values and wrong about paths — `matrixSchema` declares
`skills` and `categories` as records keyed by id, so a single malformed entry in a private
marketplace's `catalog.json` reports that entry's id. The author who wrote that comment had the rule
exactly right and applied it to the half of the payload that was not the risk.

`config-store`'s safety is a property of its WRITER rather than of its parse: it reads untrusted
storage, so a hand-edited blob could carry any key. It is listed safe because every blob the app
itself writes is keyed by catalogue ids, which is the realistic population; a reader deciding it is
unsafe would also be defensible, and the point of naming the discriminator is that the question is
answerable at all.

**On the handoff this finding was drafted from, source disagrees and source wins.**
`.ai-docs/standards/editor-and-worker.md` was reported as carrying an instruction to copy
`config-store`'s `merge` verbatim; it does not — its section on discard paths ends at the
migrate/merge split and says nothing about the payload, and the word appears in that file only in an
unrelated comment about vendored output. The verbatim instruction lives in the Proposed Standard of
`2026-08-19-a-discard-that-reports-at-migrate-time-is-silent-at-merge-time.md`, which is a finding —
frozen the moment it was written, cited as approved when implemented, and never re-checked. That is
the same failure another finding in this directory already names about a Proposed Standard that aged
into a wrong instruction, and this one is the more expensive version because acting on it leaks data
rather than reddening a test.

## Fix Applied

`readSavedMarketplaces` reports the first path segment and the issue code, with the reason written
at the call site rather than in a commit message: a segment under `saved` is a repository the
visitor named and the value beside it is their credential, so only the field's own name travels —
matching what the migration next door already does by reporting version numbers alone.

`apps/editor/src/stores/marketplace-store.test.ts` pins it as a property of the OUTPUT rather than
of the expression: it feeds the store a slot keyed by the private-marketplace fixture ref and asserts
that ref appears nowhere in the recorded call. An assertion on the shape of the mapping expression
would pass against any rewrite of it.

Not fixed: `issuesOf` in `apps/editor/src/lib/api/catalog.ts`.

## Proposed Standard

For `.ai-docs/standards/editor-and-worker.md`, in the discard-path section that already carries the
migrate/merge split — one paragraph, stated as the discriminator rather than as a ban:

> **A zod issue path is only safe to report in full when every segment it can produce is the
> schema's own vocabulary.** Field names, array indices and ids from a catalogue the app publishes
> are the schema's; a `z.record` key is whatever the user typed. Where the schema is keyed by user
> input, truncate to the first segment — the failing field's own name is what makes the report
> actionable, and everything past it is the payload. Copying a discard path from another store
> copies the SPLIT it draws between an absent slot and an unreadable one; it does not copy the
> context payload, which is a question about that store's schema and has to be asked again.

The census grep above belongs beside it as the worklist, and `issuesOf`'s comment is the argument
for stating this in a document rather than trusting care: the site that gets it wrong is the one
whose author was already thinking about exactly this risk.

Cross-checked against `CLAUDE.md` and the standards docs: nothing there rules on observability
payloads, so this adds a rule rather than contradicting one. It does sit beside the existing
`editor-and-worker.md` guidance on keying credentials by their marketplace, and it is the same
argument one layer out — a repository name is the visitor's, wherever it turns up.

---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/loading/multi-source-loader.ts
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/types/matrix.ts
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: Removed the `marketplaceDisplayName` / `SkillSource.displayName` / `SourceOption.displayName` chain end-to-end; the sources grid now labels columns via `SOURCE_DISPLAY_NAMES[id] ?? id`.
---

## What Was Wrong

A field named for one concept was populated from a different concept, and then
rendered as a third concept. `SourceLoadResult.marketplaceDisplayName` — whose
name promises "the marketplace's display name" — was assigned
`marketplace.owner.name`, i.e. the name of the PERSON or org that owns the
marketplace. It was then threaded through `loadSkillsFromAllSources` into
`SkillSource.displayName`, into `SourceOption.displayName`, and finally consumed
by `formatSourceLabel()` in `source-grid.tsx` as the highest-priority source
column label:

```ts
return option.displayName ?? SOURCE_DISPLAY_NAMES[option.id] ?? option.id;
```

Because `displayName` won the `??` chain, the wizard's Sources step rendered a
column headed by a person's name. Against the user's real marketplace
(`name: "agents-inc"`, `owner: { name: "Vincent Bollaert" }`) the column read
**"Vincent Bollaert"** instead of **"Agents Inc"**.

Two things made this hard to catch:

1. **The name lied in a plausible direction.** "marketplaceDisplayName" reads
   like a prettified source label, so every downstream consumer treated it as
   one. Nobody re-checked the assignment.
2. **It was latent on one path and live on another.** `owner.name` had fed the
   field on the remote path for some time, but nothing local exercised it. When
   `loadFromLocal` was changed to read the source's `marketplace.json` (a
   correct fix for the per-skill `source` field), the same population extended
   to local sources and the wrong label surfaced.

The existing unit test encoded the mismatch rather than catching it:
`expect(result.marketplaceDisplayName).toBe("Test Owner")` — the fixture value
is literally an owner name, asserted against a marketplace-named field.

## Fix Applied

Removed the field end-to-end rather than renaming it or re-deriving it.

The decisive question was: _is there any honest source of data for this field?_
The marketplace manifest (`Marketplace` in `src/cli/types/plugins.ts`) has only
`name` (an identifier), `description` (prose, far too long for an 18-char
column), and `owner` (a person). Re-deriving `displayName` from `marketplace.name`
would have made it a strict duplicate of `SourceOption.id` — and worse, it would
have _shadowed_ `SOURCE_DISPLAY_NAMES`, so a marketplace named `agents-inc`
would render "agents-inc" instead of "Agents Inc". There is no manifest field
that carries a short human-readable source label distinct from the id, so the
field could never hold information beyond `id`. Per the pre-1.0 "remove old code
cleanly" rule, it was deleted:

- `SourceLoadResult.marketplaceDisplayName` and the `DEFAULT_BRANDING.NAME`
  assignment on the default-source branch
- the `marketplaceDisplayName` parameter on `loadSkillsFromAllSources` and the
  `displayName` parameter on `tagPrimarySourceSkills`
- `SkillSource.displayName` and `SourceOption.displayName`
- `formatSourceLabel()` now reads `SOURCE_DISPLAY_NAMES[option.id] ?? option.id`

Column headers (`SOURCE_HEADER_NAMES`) never consumed `displayName` and are
unchanged; the deliberate header/inline vocabulary split ("Local"/"Eject",
"Plugin"/"Agents Inc") is preserved exactly.

Note this also removed an unrelated inconsistency: the default-source branch had
been labelling its column `DEFAULT_BRANDING.NAME` = `"Agents Inc."` (trailing
period) while `SOURCE_DISPLAY_NAMES["agents-inc"]` = `"Agents Inc"` (no period),
so the same marketplace rendered differently depending on which load path ran.

## Proposed Standard

Add to `.ai-docs/standards/clean-code-standards.md`, under a new
**"Field Names Must Match Field Contents"** section:

> A field's name must describe what it holds, not what it is used for. If a
> field named for entity A is assigned data from entity B, that is a bug even
> when the rendered result looks acceptable — the next reader will propagate the
> wrong meaning.
>
> When you find such a mismatch, do not fix it by adjusting the consumer. Ask
> which of these is true and act accordingly:
>
> 1. **The name is right, the derivation is wrong** → fix the assignment.
> 2. **The derivation is right, the name is wrong** → rename the field, then
>    check every consumer still makes sense under the honest name. Consumers
>    that no longer make sense were the actual bug.
> 3. **No honest data source exists** → delete the field. A field that can only
>    ever duplicate another field, or that has no correct value available at its
>    assignment site, is dead weight. (Pre-1.0: remove cleanly, no shim.)
>
> Never leave a name/meaning mismatch in place on the grounds that the output
> currently looks fine.

Add to `.ai-docs/standards/typescript-types-bible.md`, under display/label types:

> User-facing label resolution must be centralized in one lookup
> (`SOURCE_DISPLAY_NAMES`, `formatSourceDisplayName`). Do not let per-record
> optional `displayName` fields override a central label map — an optional field
> that wins a `??` chain over a curated map silently disables the map for
> exactly the records someone bothered to populate.

Add to `.ai-docs/standards/e2e/anti-patterns.md` (or the testing bible):

> An assertion whose expected value comes from a different concept than the
> field under test (`expect(x.marketplaceDisplayName).toBe("Test Owner")`) is
> documenting a bug, not guarding behaviour. When writing an assertion on a
> named field, confirm the expected literal belongs to the concept the field
> name denotes.

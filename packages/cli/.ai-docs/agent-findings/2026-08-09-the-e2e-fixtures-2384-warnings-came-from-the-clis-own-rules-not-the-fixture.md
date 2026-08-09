---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/loading/source-loader.test.ts
  - e2e/interactive/init-wizard-unreachable-source.e2e.test.ts
  - e2e/pages/constants.ts
  - .ai-docs/reference/features/built-in-catalogue.md
  - .ai-docs/reference/features/skills-and-matrix.md
standards_docs:
  - .ai-docs/reference/features/built-in-catalogue.md
date: 2026-08-09
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-471. `relationshipsForSource` in source-loader.ts narrows the built-in rules to the slugs the
  loaded source ships before merging the source's own rules on top; the fixture load went from 2384
  unresolved-slug warnings to zero, with every resolved relation byte-identical. Pinned by two specs
  in source-loader.test.ts ("source-loader relationship rules") and two frame assertions in
  init-wizard-unreachable-source.e2e.test.ts.
---

## What Was Wrong

The E2E fixture source (`e2e/helpers/create-e2e-source.ts`) was reported as shipping relationship
rules that referenced the full catalogue's slugs — 2384 dangling references, each warning
"Unresolved slug '…' — skipping" on every load, and painted over every wizard spec's frame since
the startup band landed.

**The fixture ships no rules at all.** `createE2ESource` writes `config/skill-rules.ts` only when a
spec passes `relationships`, and the deliberate-warning specs are the only callers that do. The
2384 lines came from the CLI's own `defaultRules` — a hand-written constant naming 176 slugs of the
public catalogue — which `loadAndMergeFromBasePath` applied **whole** to every non-default source.
The fixture ships 10 skills carrying 6 of those slugs, leaving 170 dangling; and because
`resolveRelationships` re-walks every rule for every skill, each dangling reference warns once per
skill in the source. Ten skills is what turns a few hundred references into 2384 lines.

So the drift was not fixture data drifting from fixture skills. It was a CLI dataset written
against one catalogue being applied verbatim to another — the same class of mistake
`resolveOfferedStacks` already refuses for `defaultStacks` ("a catalogue of stacks written against
a different catalogue of skills"), one dataset over. No fixture-side edit could have reached zero:
the defaults merge in whether or not the source writes a rules file.

The warnings were never actionable — the rules belong to the CLI, not to the source the user named
— and they cost the step four rows in every wizard frame: the band paints the first three messages
and counts the rest, and it does not shrink. The cached-copy warning
`init-wizard-unreachable-source` exists for survived only by accident of ordering (the fetch speaks
before anything is parsed, so it is message one). Any warning raised _during_ parsing would have
been the 2385th line, counted and unreadable, with nothing in the suite able to tell that apart
from not being raised.

## Fix Applied

`relationshipsForSource(sourceRules, skills)` in `source-loader.ts` narrows
`defaultRules.relationships` to the slugs the extracted skills carry, then merges the source's own
rules in front of the narrowed set. Group rules keep only present members and are dropped below two
of them; a `requires` rule survives only if its `skill` and at least one of its `needs` are present.

The narrowing changes no resolved matrix — `resolveSlugsOrSkip` already discarded members that
resolve to no skill — verified relation-for-relation against both the ten-skill E2E fixture and the
full public catalogue, where it is a no-op. **A source's own rules are never narrowed**: a slug its
author typed that its skills do not carry is that source's defect and this warning is the only
place it is reported, which is what the three `relationships.e2e.test.ts` specs assert.

Red-first: both new unit specs failed with 1669 and 1655 warnings respectively, and both new e2e
frame assertions failed on `Unresolved slug`, before the fix.

## Proposed Standard

For `.ai-docs/reference/features/built-in-catalogue.md` → "Precedence", which now carries it:

> **A built-in dataset is written against the built-in catalogue. Before applying one to a source
> the CLI did not author, scope it to what that source actually carries** — offer it only to the
> default marketplace (`defaultStacks`), or narrow it to the source's own skills
> (`defaultRules`). Applying it whole produces references to skills that do not exist, and the
> user cannot act on any of them because the data is not theirs.

Second, a testing note worth carrying into `.ai-docs/standards/e2e/`: **a spec asserting a message
is visible in a bounded region must also assert what else is in that region.** The startup band
paints three lines and counts the rest, so `toContain(THE_WARNING)` is a statement about the
warning's position in a queue as much as about the warning — and the queue held 2384 entries no
spec had ever looked at.

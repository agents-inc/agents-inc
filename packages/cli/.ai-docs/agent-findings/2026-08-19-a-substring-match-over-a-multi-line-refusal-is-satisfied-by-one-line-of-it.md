---
type: anti-pattern
severity: medium
affected_files:
  - e2e/commands/eject-default-source-skill-absent.e2e.test.ts
  - e2e/fixtures/default-source-cache.ts
  - src/cli/lib/skills/skill-copier.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-19
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The fixture defect is corrected — the seeder writes both files a copy needs and its docblock
  records that a skill written with SKILL.md alone fails at the destination, which no checkout of a
  real marketplace can produce. Pending in two places. The spec still asserts the item line alone,
  so it cannot yet distinguish the one failure under test from a fixture producing hundreds; and
  neither half of the rule below is written into any standards document.
---

## What Was Wrong

A new E2E spec covers a refusal that had never been reachable: ejecting from the DEFAULT public
marketplace against a checkout that is missing one skill the vendored catalogue names. Every other
source a spec can name is a directory, and for a directory the matrix is built from the files, so
the two cannot disagree; the default source is the one place they are separate artefacts. The spec
seeds the cache the fetch would have written into, omits one skill, and asserts the refusal names
that skill's id.

**It passed on its first run, and it was passing over a fixture that had broken every other skill in
the catalogue.** The seeder wrote SKILL.md and nothing else. A copy is not finished when the
directory lands: the copier stamps provenance into the destination by reading the copy's own
`metadata.yaml`, so every skill the fixture wrote failed at that read — a failure no real checkout
can produce, because no published skill omits that file.

The assertion could not see it. The refusal the copier raises is a header plus **one indented line
per failed skill**:

```
Could not copy <n> of <m> skills:
  <skill-id>: <why>
  <skill-id>: <why>
  …
```

and the spec's claim was `toContain("<the omitted id>: ENOENT")`. That line was present, because the
omitted skill did fail for exactly the reason under test. It was simply sitting in a wall of lines
that were the fixture's fault. **A `toContain` over a multi-line refusal is satisfied by one line of
it**, and a per-item refusal is exactly the shape where noise and signal are the same kind of line —
same prefix, same separator, same field order — so nothing about the matched line distinguishes it
from the ones around it.

The measurement is what makes this worth a rule rather than a note. The vendored catalogue holds 238
skills, re-derivable with:

```
npx tsx -e "import { BUILT_IN_MATRIX } from './src/cli/types/generated/matrix.ts'; console.log(Object.keys(BUILT_IN_MATRIX.skills).length)"
```

The fixture seeds every one of them but the omitted skill, so the refusal ran to hundreds of lines
of which exactly one was the line under assertion. **The count line is the discriminator and it was
never read**: `Could not copy 1 of 238 skills` and `Could not copy 238 of 238 skills` are the same
assertion's two worlds, and only the first is the fault the spec exists to pin. It was found by a
hand-run, not by the suite — the suite was green throughout.

**Second half, and it extends an earlier fixture finding in the other direction.** That one was
about fixtures writing INSTALLED content no real install would produce, measured against the schema
the product writes: nine fixtures wrote agent files with no frontmatter and non-hex content hashes,
and two tests had promoted "doctor happens not to check this" into an asserted invariant. This one is about a fixture standing
in for FETCHED content, and the bar is different: it must satisfy everything the CLI READS from a
checkout, not merely what a copy needs to start. The two files a skill directory carries are not
interchangeable — one is what the copy moves and the other is what the copy stamps — and a fixture
written from the first alone looks complete to its author and to review.

## Fix Applied

The seeder writes both files, with the taxonomy READ from the catalogue entry rather than derived
from the id, and the content hash computed from the file it just wrote — the two things a published
`metadata.yaml` actually carries. Its docblock states why both files are there and what a one-file
version costs, so the next person editing it is told rather than left to rediscover it.

Not fixed: the assertion. The spec still names the item and not the count, so it remains satisfiable
by a future fixture regression of the same shape.

## Proposed Standard

Two rules for `.ai-docs/standards/e2e/assertions.md`, beside the existing guidance on asserting the
specific failure rather than that a failure occurred.

**1. Where a refusal enumerates per-item failures, assert the count line as well as the item.**

> A message of the form "N of M failed" followed by one line per failure has two claims in it, and a
> substring match on an item line tests only the weaker one. Assert the count line too — it is the
> only part of the output that distinguishes the fault under test from a harness producing the same
> fault everywhere. This is not a preference for stricter matching in general: it applies precisely
> where the noise and the signal are the same KIND of line, so that nothing about a matched line
> tells the reader how many neighbours it had.

**2. A fixture standing in for fetched content satisfies what the CLI READS from it.**

> The bar for a fixture is not "enough for the operation to begin" but "everything the operation
> reads before it reports". Where a real artefact always carries a file, a fixture that omits it
> produces failures no user can ever see — and because those failures are usually uniform, they fill
> the output rather than changing its shape, which is what makes them invisible to a substring
> assertion. Derive the fixture from what the code path reads, not from what the first step needs.

Cross-checked against `CLAUDE.md`: neither conflicts with a NEVER/ALWAYS rule. Rule 1 sits with the
standing ban on broadening an assertion to make a failing test pass — it is the same concern from
the other side, an assertion that was never narrow enough to fail. Rule 2 sits with the test-data
rules requiring factories over inline construction, and it names the property a factory has to have
rather than only where it has to live.

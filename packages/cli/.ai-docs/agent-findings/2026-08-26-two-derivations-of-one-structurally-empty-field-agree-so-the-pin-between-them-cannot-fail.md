---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/features/configure/lib/output-preview.ts
  - apps/editor/src/features/configure/lib/output-preview.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-26
reporting_agent: web-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The product now answers the marketplace question once, from the SEAT, through a
  `seatedMarketplace(): SeatedMarketplace` discriminated union in
  `apps/editor/src/features/configure/lib/output-preview.ts`; both notes render that one
  answer, `marketplacePhrase` for prose and `ejectedSourceLine` for the path coordinate,
  and `primarySourceName` is deleted. The vacuous pin is replaced by four specs under
  "the marketplace an ejected skill is copied from" in `output-preview.test.ts`, split by
  SEAT rather than by install mode — the arm that can fail seats `MARKETPLACE_CATALOG` at
  `MARKETPLACE_CANONICAL_REF` and holds the note to the ref the test itself seated. Red
  phase manufactured twice by reinstating the defect, each time restoring the file
  byte-identical by sha256.
---

## What Was Wrong

Two halves. The product half was already filed and deliberately deferred; the TEST half is why it
could be deferred without anyone noticing what that cost.

### The product half, already reported

`2026-08-26-a-shared-helper-agrees-about-its-computation-never-about-the-rows-it-is-handed.md`
names it exactly, under "Not fixed, reported instead — a third site of instance 2's class, same
module": `ejectedCatalogueNote` rendered

```
Source: ${primarySourceName(skill)}/src/skills/<id>
```

and `primarySourceName` was the editor's own mirror of `sourceForSkill`, reading
`CatalogSkill.availableSources` — populated by the CLI's multi-source loader and by nothing a
browser runs:

```
grep -c availableSources packages/matrix/src/vendor/generated/matrix.ts   →  0
grep -c availableSources packages/api-mocks/src/fixtures.ts              →  0
```

So a visitor seated on `github:acme/skills` was told their skill is copied from
`agents-inc/src/skills/acme-web-widgets`. Its immediate neighbour `pluginReferenceNote` had been
fixed one change earlier to read the seat, which left the pane **internally inconsistent — two
adjacent notes disagreeing about one fact**, visible in a single screenshot. That is worse than a
uniform error, because it tells a reader the surface was not thought through, and this dialog's
whole premise is byte-honesty.

### The test half, which is new

The claim was pinned. The pin was named "names the marketplace an ejected skill is copied from,
never the eject sentinel", it carried a 22-line docblock arguing its own rigour, and **it could not
fail.** It built the same skill twice, as a plugin and as an eject, took the marketplace off the
PLUGIN variant's recorded `origin`, and asserted the ejected note contained it:

```ts
const marketplace = originIn(asPlugin); // config.skills[].origin
expect(note).toContain(`${marketplace}/src/skills/${REACT}`);
```

`origin` is written by `sourceForSkill` off `availableSources`. The note's own source came from
`primarySourceName`, off `availableSources`. **Both sides of the comparison were derived from the
same structurally-empty field**, so both collapsed to `DEFAULT_PUBLIC_SOURCE_NAME` and the
assertion compared `"agents-inc"` to `"agents-inc"` forever. Repoint the product at any other
marketplace and the expectation follows it; break the product entirely and the expectation breaks
identically.

**Why it read as rigorous, and this is the generalisable part.** The two expressions do not look
alike. One is `preview.roots[].config.skills.find(...).origin`; the other is
`catalog.skills[id].availableSources.find((s) => s.primary).name`. Different objects, different
layers, different call paths — which is exactly the shape of a genuine cross-check, and the
docblock argued for it on those grounds ("the marketplace is read structurally off the plugin
variant's own config … rather than parsed back out of the note, which would put a parser in a test
file and prove only that the note agrees with itself"). The reasoning is correct and the conclusion
is false, because what makes them agree is a THIRD thing neither expression names: a field that no
code in this runtime writes. The pin did prove the note agreed with itself. It just did so through
a longer route than the one the author ruled out.

### Why nothing caught it

- **`tsc` cannot.** `availableSources?: SourceRef[]` is legitimately optional; the CLI fills it and
  the browser does not, and both are valid programs.
- **The suite cannot.** Every spec in `output-preview.test.ts` ran on the resting seat, where the
  public catalogue is the honest answer — so the note was CORRECT in every state the suite could
  observe. A defect reachable only from a state no test enters is not a coverage gap that a count
  can show: the file had 21 passing specs about this module.
- **The existing rule names the wrong mechanism.** `packages/cli/CLAUDE.md` already forbids binding
  an assertion to a constant that merely has the same VALUE as the literal it replaces, and calls
  the failure a "diverged-constant vacuum". No constant appears on either side here. The shared
  term is an empty field, reached by two different paths, and nobody grepping for the constant rule
  would arrive at this.

## Fix Applied

**Product.** One function owns the question. `seatedMarketplace(): SeatedMarketplace` returns a
discriminated union — `{ kind: "public", name }` or `{ kind: "ref", ref }` — so a caller cannot
reach `ref` believing it holds a name. `marketplacePhrase` renders it as prose for the plugin note;
`ejectedSourceLine` renders it as a path coordinate, and only the `public` arm has a bare name that
can stand as a path segment. A ref is labelled and placed AFTER the path
(`Source: src/skills/<id>, in the marketplace at github:acme/skills`) rather than dropped into the
slot a name belongs in, because `github:acme/skills/src/skills/<id>` is a coordinate that parses
and resolves to nothing. `primarySourceName` is deleted; the `CatalogSkill` type import went with
it. Public-catalogue output is byte-unchanged, verified by rendering both arms.

**Pin.** Split by SEAT, which is the axis the defect lives on, rather than by install mode, which
it does not:

1. public seat → the note names `agents-inc` by name (the byte-unchanged guard);
2. acme seat → the note names the seated ref and **not** `agents-inc` (the arm that fails);
3. acme seat → the plugin note and the ejected note name the same marketplace (the adjacency the
   user sees);
4. the eject-sentinel half of the original claim, kept, still read off the config's own value.

`MARKETPLACE_CANONICAL_REF` is bound rather than written out because it is the test's own INPUT —
the store is seated with it two lines above — while `agents-inc/src/skills` stays a literal because
it is TEXT the product renders, per the second half of the same CLAUDE.md rule.

**Red phase manufactured, twice.** A pin written after a fix has never failed. The defect was
reinstated (`return \`Source: ${DEFAULT_PUBLIC_SOURCE_NAME}/${path}\``), specs 2 and 3 went red with
the received body printed in full, and the file was restored and confirmed byte-identical by
`sha256sum -c` — once against the first implementation and again against the shipped one after the
expressive-TypeScript pass.

**Census of the class, run rather than assumed.** The class is "a browser-side surface deriving a
marketplace identity from `availableSources` / `origin` rather than from the seat":

```
grep -rn "availableSources\|\.origin\b" apps/editor/src --include='*.ts' --include='*.tsx'
```

Seven hits, and after the fix none is an instance. Two live readers of `origin` remain in
`output-preview.ts` and both use it as the plugin/eject DISCRIMINATOR (`isPluginSkill`, and the
`originById` map feeding `pluginRefFor`), which is a use `EJECT_SOURCE` makes correct regardless of
`availableSources`. `use-share-link.ts` reads `location.origin`, an unrelated symbol. The two other
marketplace-naming surfaces — `marketplaceSourceUrl` in `derive.ts` and the Install dialog's
subtitle — already read `activeMarketplace()`. So the class had exactly one remaining instance and
it is closed.

## Proposed Standard

**For `packages/cli/CLAUDE.md`, as a second clause on the existing "never bind an assertion to a
constant that merely has the same VALUE" rule** — it is the same failure with a mechanism the
current wording cannot describe:

> The shared term need not be a constant. Two derivations of one field that **nothing in the
> environment under test populates** also move together, and they hide it better: the expressions
> differ, sit on different objects and read as an independent cross-check. The tell is an OPTIONAL
> field whose only writer lives in another runtime — `availableSources` is filled by the CLI's
> multi-source loader and by nothing a browser runs, so every browser-side derivation of it
> collapses to one default. Before binding an assertion to a derived value, ask what would have to
> change for the two sides to disagree; if the answer is "a field neither side names, that this
> runtime never sets", the assertion is vacuous. Where a value is only meaningful under a
> non-default seat, the spec must SEAT one — the pin belongs on the axis the defect lives on.

**And one line for `.ai-docs/standards/e2e/assertions.md`**, which is where someone writing a spec
looks:

> A suite that only ever runs on the resting seat can only observe the states where the default is
> the right answer. Cover the arm where it is the wrong one, or the assertion is about a
> configuration nobody ships.

**No checker is proposed, and the reason is the finding.** The defect is not lexical: both sides of
the vacuous comparison are ordinary property reads, and whether they are independent depends on
which runtime fills the field three packages away. A grep for `availableSources` finds the field,
not the assertions that silently rest on it. What WOULD close it mechanically is making the field's
absence representable — a browser-side catalogue type that does not carry `availableSources` at all,
so a read is a compile error rather than an `undefined` with a plausible default. That is a
`packages/matrix` type change well outside this remediation and is named here rather than made.

## Correction to a neighbouring finding, not applied

`2026-08-26-a-sentinel-is-a-legal-value-of-the-field-and-an-invalid-coordinate.md` carries
`status: resolved` with a `resolved_by:` citing `primarySourceName` as the fix mechanism and the
now-retired pin as its evidence. The defect that finding reports — the `eject` sentinel rendered as
a repository — **is still fixed**, and specification 4 above still holds it. But its cited mechanism
no longer exists on disk and its cited pin has been replaced. Left unedited deliberately: this pass
was a remediation with a named scope, the directory's own protocol is to append a `## Correction`
rather than rewrite a body, and deciding whether that finding is `resolved` or `superseded` is a
lifecycle judgement for whoever owns the corpus. Reported here so the link is not lost.

---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/config-gate/propagate.ts
  - src/cli/lib/configuration/__tests__/config-writer.test.ts
  - src/cli/lib/configuration/config-writer.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
date: 2026-08-26
reporting_agent: pm
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`generateConfigSource` in `src/cli/lib/configuration/config-writer.ts` branches three ways on its
`ConfigSourceOptions`. One of the three has no production caller and cannot be reached by any
command, and nothing anywhere says so.

The branch is the import-from-global form — the one that emits
`import globalConfig from "<absolute path>/.claude-src/config"` and spreads it. It is selected when
`isProjectConfig` is true and `globalConfig` is absent.

The census, and it is a census rather than a sample — every non-test mention in the package:

```
grep -rn "generateConfigSource\|writeConfigFile" --include='*.ts' src | grep -v "__tests__\|\.test\.ts"
```

Five production call sites. Three pass no options at all and take the standalone branch. The fourth
is `writeConfigFile` in `src/cli/lib/config-gate/propagate.ts`, which forwards whatever it is given —
and it has exactly one caller, `writeProjectConfigPair` in the same file, which always passes both
`isProjectConfig: true` **and** `globalConfig: effectiveGlobal`. That combination routes to the
inlining branch every time. So the import form is unreachable.

Confirm the same thing from the other end:

```
grep -rn "isProjectConfig" --include='*.ts' src | grep -v __tests__
```

One line.

**What makes this worth filing rather than shrugging at is the spec block above it.** The suite in
`src/cli/lib/configuration/__tests__/config-writer.test.ts` exercises the dead branch directly and at
length — count them with:

```
grep -c 'isProjectConfig: true' src/cli/lib/configuration/__tests__/config-writer.test.ts
```

Those specs are green, they are well written, and every one of them is a claim about bytes no
installation has ever received. A reader arriving at `generateConfigSource` sees three branches with
three bodies of coverage and has no way to tell that one of them is furniture. The reference document
beside it, `.ai-docs/reference/config/config-writer.md`, describes all three as live.

The cost is not the dead code. It is that the branch is the load-bearing example in three separate
architecture claims that were made **because of it** and are wrong:

- `todo/plans/editor-v6/decisions.md` §2 tells a preview implementor that "three writer variants,
  three byte shapes" must be selected between per root. Two.
- The same section names "the import-from-global form emits an absolute machine-specific path from
  `getGlobalConfigImportPath()`" as a hazard a browser cannot answer. `getGlobalConfigImportPath` is
  reachable only through this branch, so the hazard is not live. (The machine-specific path that IS
  live is `computeGlobalTypesImportPath` in `config-types-writer.ts`, in the types half, and it is
  relative rather than absolute — a different function, a different file and a different shape.)
- A pass planning to extract these renderers into a shared package would have moved the branch, its
  helper, and its specs.

Nothing in the repository's gates can see this. `tsc` sees a function that is exported and imported.
ESLint sees a private function with a caller. The suite sees full coverage. `knip` would report the
export but not the branch, and `knip` is deliberately not a gate — the root `package.json` says so at
length and gives the reason.

## Fix Applied

None — discovery only. Whether the branch should be deleted or given back a caller is a product
question: the import form produces a materially smaller, more readable project `config.ts` than the
inlined snapshot, and the change that made `writeProjectConfigPair` always inline may have been
deliberate or may have been a widening nobody noticed. That is the owner's call and it is not this
programme's subject.

What this pass did do is stop the false premise propagating: `todo/plans/editor-v6/phase-b-spec.md`
opens with a corrections table whose first two rows are this finding, so the Phase B implementor is
told two variants rather than three before reading anything else.

## Proposed Standard

**A branch reachable only from tests is a claim about production that production does not make, and
the tests are what hide it.** The generalisable half is not "delete dead code" — it is that
per-branch spec coverage reads as evidence a branch is live, and it is the only evidence most readers
will look for.

Two candidates, and the first is much cheaper:

1. **A rule in `.ai-docs/standards/clean-code-standards.md`**, beside the existing entries about
   claims that cannot fail: when a function's behaviour is selected by an options object, the
   docblock names the production call site of each branch. A branch whose line reads "no production
   caller" is then a fact a reader can see and a grep can find, and the sentence goes stale loudly —
   the named call site either exists or does not. `generateConfigSource`'s own docblock already
   describes the three branches; adding the caller to each line is one edit.

2. **A runnable check, if the class turns out to be wider than one function.** For each exported
   function taking a discriminating options object, resolve which branches any non-test caller can
   select. This is real work and should not be built for a single instance. **The census that would
   justify it has not been run** — this finding measured one function. The cheap first pass is
   `grep -rn "options?\.\w* &&\|options?\.\w* ?\?" --include='*.ts' src/cli/lib`, read by hand.

Neither conflicts with anything in `CLAUDE.md`. The nearest existing rules are the assertion-shape
family — "NEVER encode a known gap in an assertion's ARITY, LENGTH or ABSENCE" and "NEVER let a
spec's NAME claim validation that its mocks have removed" — and this is their third sibling: there
the assertion could not fail, here the assertion cannot fail _usefully_, because its subject is not
in the product.

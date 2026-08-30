---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/matrix/matrix-provider.ts
  - packages/compile/src/catalog.ts
  - packages/compile/src/config-source.ts
  - packages/compile/src/index.ts
  - packages/compile/src/seed-to-config.ts
  - packages/cli/src/cli/lib/configuration/__tests__/renderers-come-from-the-shared-package.test.ts
standards_docs:
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-08-26
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The dead CLI declaration of `byCategoryDeclarationOrder` was deleted from
  `src/cli/lib/matrix/matrix-provider.ts` rather than re-exported (pre-1.0, no back-compat
  shims), and the three prose sites naming its old home were repointed at
  `packages/compile/src/catalog.ts` — the `CLAUDE.md` rule that centralised it, the
  key-order section of `.ai-docs/reference/config/config-writer.md`, and the export list in
  `.ai-docs/reference/features/skills-and-matrix.md`. The enforcement half is NOT resolved:
  `EMPTIED_MODULES` still names only wholly-emptied modules, so the next partially-emptied
  one is as invisible as this one was. That is the Proposed Standard below and it is
  deliberately unlanded, because the guard file belongs to another lane.
---

## What Was Wrong

The `@workspace/compile` extraction moved `byCategoryDeclarationOrder` — the comparator that
decides the category key order reaching `config.ts` — into `packages/compile/src/catalog.ts`,
where it takes the catalogue as a parameter. It moved both of its callers with it:
`inCanonicalCategoryOrder` in `seed-to-config.ts`, which orders a stack it BUILDS, and
`canonicalizeStackOrder` in `config-source.ts`, which orders a stack it merely EMITS.

**The CLI's copy was left behind.** `src/cli/lib/matrix/matrix-provider.ts` went on exporting a
second declaration of the same rule, reading the mutable `matrix` singleton instead of a
parameter, with **zero callers anywhere in the repository**:

```
grep -rn "byCategoryDeclarationOrder" --include='*.ts' --include='*.tsx' packages apps scripts
```

Seven hits across five files before the deletion; the one in `matrix-provider.ts` was its own
`export function` line and nothing else. Nothing in the bytes was wrong — the two bodies were
semantically identical on the day this was found. The hazard is entirely prospective: a
plausible-looking, correctly-documented definition of a centralised rule, sitting in the module
the repository's own instructions told a reader to look in.

That last part is what makes it worse than an ordinary dead export. `packages/cli/CLAUDE.md`
named this exact declaration as _"where the rule itself lives so the builder and the writer cannot
disagree about it"_ — so the surviving copy was not merely reachable, it was **advertised**, by
the sentence whose whole purpose was to prevent a second copy. Two reference docs said the same.
The instruction that centralised the rule had become the instruction that would decentralise it.

### Why nothing caught it

Three gates could plausibly have, and each is out of population for a different reason:

- **`tested-exports-reach-production.test.ts`** scans exports the SUITE invokes and production
  does not. A symbol nothing invokes at all is in neither set.
- **`renderers-come-from-the-shared-package.test.ts`** is the extraction's own acceptance
  criterion and is exactly the right shape — its `EMPTIED_MODULES` list pairs a CLI module with
  the symbols that must no longer be DECLARED in it, and its own docblock says private helpers are
  named there deliberately because _"they are where a copy actually survives"_. But every one of
  its six entries is a module the extraction emptied **whole** (`config-writer.ts`,
  `config-types-writer.ts`, `compiler.ts`, `agent-provenance.ts`, `utils/string.ts`, `consts.ts`).
  `matrix-provider.ts` was emptied of **one symbol** and legitimately keeps seven others, so it
  never became a candidate for the list.
- **`knip` (`bun run deps:dead`)** would report it as an unused export, and is deliberately not a
  gate anywhere — owner's ruling, recorded in the root `package.json`.

**The class, stated so it generalises:** the guard that checks for surviving copies is keyed on
_modules the change emptied_, which is the same population a human reviewer holds in their head.
A module the change only **partially** empties is in nobody's population — not the guard's,
because it still declares things; not the reviewer's, because it is still a live module they are
not thinking of as "gone".

### Census of the class — exact at one

Every symbol declared at top level in both `packages/compile/src` and `packages/cli/src`,
then each checked for a CLI-side reference beyond its own declaration:

```
decls() { grep -rhoE '^(export )?(async )?function [A-Za-z_][A-Za-z0-9_]*|^(export )?const [A-Za-z_][A-Za-z0-9_]* *[:=]' "$@" --include='*.ts' --include='*.tsx' \
  | sed -E 's/^(export )?(async )?function //; s/^(export )?const //; s/ *[:=]$//' | sort -u; }
comm -12 <(decls packages/compile/src) <(decls packages/cli/src)
```

Twenty-two names, run after the deletion so this one is absent by construction. **All twenty-two
have at least one CLI-side caller** — the floor is `addToDomainSelections` at exactly one
(`wizard-store.ts:1461`), and the rest range up to `validateSelection` at 63. Six of the
twenty-two (`agents`, `skills`, `stack`, `REACT`, `VITEST`, `ZUSTAND`) are same-named locals and
fixture constants rather than duplicated rules, and were checked anyway rather than dismissed by
eye. So `byCategoryDeclarationOrder` was the only dead duplicate the extraction left, and the
finding is about the missing guard rather than about a backlog.

## Fix Applied

The declaration and its docblock are deleted from `matrix-provider.ts`, and `typedKeys` dropped
from that module's import (it had no other reader there). Deleted rather than re-exported: the
repository is pre-1.0 and forbids back-compat shims, and a re-export would have kept the module
answering for a rule it no longer owns.

The three prose sites that named the old home are repointed at `packages/compile/src/catalog.ts`.
The `skills-and-matrix.md` entry is rewritten as a **negative** claim — "the comparator is not
here, it lives in `@workspace/compile`" — rather than deleted, because a reader arriving at that
export list from `CLAUDE.md`'s old sentence needs to be told where it went, and a silent absence
does not tell them.

**Nothing mechanically holds any of this.** Deleting the copy removes today's instance; the class
is untouched, and a future extraction that partially empties a module will leave the same residue
with the same silence.

## Proposed Standard

**1. Extend `EMPTIED_MODULES` to partially-emptied modules, and rename what it means.** The list
in `renderers-come-from-the-shared-package.test.ts` already has the right mechanism and the wrong
population. The one-entry repair is:

```ts
{ file: "lib/matrix/matrix-provider.ts", symbols: ["byCategoryDeclarationOrder"] },
```

Its second assertion — that each listed module imports `"@workspace/compile"` — already passes for
this file, which imports `seatCatalog` from it. Not landed here because that file belongs to
another lane in the current programme. Note that a pin added after the fact has no red phase
unless someone manufactures one; per
`2026-08-26-the-binding-vi-mock-needs-hoisted-is-the-one-in-its-argument-list`, whoever lands it
should re-add the declaration, watch the entry fail, and remove it again.

**2. One line in `.ai-docs/standards/briefing.md`, extending the census habit two of its
neighbours already asked for.** `2026-08-26-a-re-export-facade-unbinds-every-gate-keyed-on-a-modules-path`
asked for a census of the module a change EMPTIES;
`2026-08-26-an-import-ban-repointed-at-the-package-missed-the-cli-module-the-same-split-created`
extended it to the module a change CREATES. The third case is the module a change **partially
empties** — and it is the one with no natural prompt to look, because the module survives the
change and reads as untouched. Concretely: after moving a symbol out of a module that keeps
others, grep the symbol name repository-wide and confirm the old module is not among the hits.

**3. A rule that has no home yet, and is the sharper half.** When an instruction file names a
symbol's LOCATION as the reason a rule is centralised — as `packages/cli/CLAUDE.md` did here —
that sentence is a **pointer with no referential integrity**, and moving the symbol silently
inverts its meaning. This is adjacent to the existing "prefer deleting a claim to rewriting it"
ruling but is not covered by it: the claim here was worth keeping and simply pointed at the wrong
file. Cross-checked against `CLAUDE.md`'s NEVER/ALWAYS rules and
`.ai-docs/standards/documentation-bible.md`; it conflicts with neither, and the nearest existing
rule ("ALWAYS grep for the old value when changing test data or renaming anything") covers renames
but not moves. Suggested home: `documentation-bible.md`, beside the count-lives-in-one-document
rule, since it is the same defect one field over — a fact stated in two places where only one of
them is checkable.

---
type: standard-gap
severity: low
affected_files:
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/seed/config-to-seed.ts
  - src/cli/lib/seed/publish-seed.ts
  - src/cli/commands/edit.tsx
  - src/cli/lib/__tests__/factories/agent-factories.ts
  - src/cli/lib/operations/project/write-project-config.test.ts
  - src/cli/base-command.ts
  - e2e/pages/retry-space.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-21
reporting_agent: cli-developer
category: typescript
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Both halves landed. The convention half was already in documentation-bible.md; the gate half
  arrived 2026-08-22 as scripts/check-symbol-citations.ts, on the owner's CLI-629 ruling permitting
  a compiler-API walk. It resolves every JSDocLink node against the type checker over the three
  tsconfig projects the typecheck script names, and the ESLint route this finding compared was
  dropped for the reasons its own instrument table gives. Two forms the table below does not carry
  were found by that walk on its first run and are filed as
  2026-08-22-a-backticked-citation-is-still-a-citation-and-the-rule-reads-as-if-it-is-not.
---

## What Was Wrong

Two things, and the second is the one worth keeping.

**The convention is real and unenforced.** `{@link X}` means "resolve this" and a backtick does
not — the split is already followed almost everywhere in this package, and nothing anywhere checks
it. Verified by injecting one unresolvable `{@link}` into an e2e spec on 2026-08-21: `bun run
typecheck` exited 0 in silence and `bun run lint` exited 0 in silence.

**A claim written to justify gating it had itself gone stale.** `todo/cli.md` -> CLI-581 asserted
that a `{@link}`-only scan over `src/cli` "reports zero unresolvable". It reports nine across the
package today. That is the shape this corpus keeps meeting: the sentence was true when measured,
nothing about it changed visibly, and it reads as verified against a tree that has moved.

## Census

Every figure below is a census over the whole package, not a sample, measured 2026-08-21.

Citation volume — a FIXED-string grep, because `grep` here is **ugrep 7.8.4** and a brace in an ERE
is a repetition operator, so a pattern-based census can return zero and be lying:

```
grep -rIoh -F '{@link' src e2e scripts --include='*.ts' --include='*.tsx' | wc -l
```

Resolution — the authority is the TypeScript checker itself: walk every `JSDocLink` node reached
through `node.jsDoc`, `node.comment` and `node.tags` (`ts.forEachChild` descends into none of the
three), and ask `checker.getSymbolAtLocation(link.name)`. Run once per tsconfig — `tsconfig.json`,
`e2e/tsconfig.json`, `tsconfig.scripts.json` — and resolve `extends` with
`ts.getParsedCommandLineOfConfigFile`, **not** `ts.parseJsonConfigFileContent`, which silently
ignores `extends` and produced a program holding 212 of 413 root files on the first attempt here.

| Tree      | Citations the checker reached | Unresolvable |
| --------- | ----------------------------: | -----------: |
| `src`     |                           182 |            8 |
| `e2e`     |                            59 |            1 |
| `scripts` |                            11 |            0 |

Nine of 252, or 3.6%. **The convention needs no rostered exception** — this is a fix-in-one-pass
backlog, not a declared-debt one.

The nine, in three classes:

| Site                                                      | Citation                                           | Class                                    | Working spelling                           |
| --------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `stores/wizard-store.ts:2003`                             | `populateFromSkillIds`                             | interface member cited from outside it   | `{@link WizardState.populateFromSkillIds}` |
| `stores/wizard-store.ts:2003`                             | `startFromScratch`                                 | interface member cited from outside it   | `{@link WizardState.startFromScratch}`     |
| `commands/edit.tsx:232`                                   | `dir`                                              | type-literal member cited from a sibling | `{@link EditRoot.dir}`                     |
| `commands/edit.tsx:234`                                   | `dir`                                              | type-literal member cited from a sibling | `{@link EditRoot.dir}`                     |
| `lib/__tests__/factories/agent-factories.ts:14`           | `loadAgentDefs`                                    | symbol not imported into the file        | import it, or backtick it                  |
| `lib/operations/project/write-project-config.test.ts:173` | `AgentDefs`                                        | symbol not imported into the file        | import it, or backtick it                  |
| `lib/seed/config-to-seed.ts:217`                          | `import("./seed-to-wizard.js").seedToWizardResult` | `import(...)` namepath                   | import the name, or backtick it            |
| `lib/seed/publish-seed.ts:19`                             | `import("./fetch-seed.js").fetchSeedConfig`        | `import(...)` namepath                   | import the name, or backtick it            |
| `e2e/pages/retry-space.ts:5`                              | `import("./retry-enter.js").retryEnterUntil`       | `import(...)` namepath                   | import the name, or backtick it            |

The third class is the one worth knowing before it is written again: `{@link}` takes an entity
name, `import(...)` is not one, and the parser stops at the word `import`. Neither `tsc` nor
TypeDoc resolves it. It reads exactly like a precise citation and is a dead one.

## The instruments disagree, and each is wrong in a different direction

CLI-581 named three candidates. Measured:

| Instrument                                                | Of the nine | False positives                                                            | Verdict                                             |
| --------------------------------------------------------- | ----------: | -------------------------------------------------------------------------- | --------------------------------------------------- |
| `jsdoc/no-undefined-types` (`eslint-plugin-jsdoc@64.2.1`) |           4 | 2 — `base-command.ts:153`, class members that `tsc` resolves               | partial gate, and it taxes a correct construct      |
| TypeDoc `--validation.invalidLink@0.28.20`                |           9 | 16 in `src` alone, all "resolved but is not included in the documentation" | complete, but the noise class outnumbers the signal |
| `tsc` quick-info / checker walk                           |           9 | 0                                                                          | exact, and it is a script rather than a rule        |

Reproduction for the first row — full-package run, only the injected mutation removed:

```
npx eslint --no-config-lookup --config <probe> --format json \
  'src/**/*.ts' 'src/**/*.tsx' 'e2e/**/*.ts' 'scripts/**/*.ts'
```

reports six `jsdoc/no-undefined-types` errors: the four true positives above (`loadAgentDefs`,
`AgentDefs`, `populateFromSkillIds`, `startFromScratch`) and two on `src/cli/base-command.ts:153`,
where `{@link exitIfWorkIncomplete}` and `{@link hasIncompleteWork}` cite `protected` members of
the same class from a sibling PROPERTY's docblock. The TypeScript checker resolves both. The rule
reads ESLint's scope, where a class member is not a binding, so it cannot. A probe isolates the
boundary: the same citation from a sibling METHOD's docblock is accepted, from a sibling
PROPERTY's it is not.

It also misses all three `import(...)` namepaths, for the mirror-image reason — it never asks the
type graph anything, so a namepath the parser mangled looks like an ordinary undefined name only
when the mangled head happens to be undefined, and `import` is a keyword it does not report.

Two operational notes on the ESLint route, both measured rather than read:

- `eslint-plugin-jsdoc@61.7.1` — the version `npm` resolves under this machine's node — declares
  `eslint@^7 || ^8 || ^9` and does not support the ESLint 10 this package runs. `64.2.1` supports
  it and requires node `^22.22.2 || >=24.15.0`. The dev machine here is node v23.10.0, outside that
  range; `.github/workflows/ci.yml` pins `NODE_VERSION: 22`, which is inside it. So the constraint
  bites local development, not CI.
- Do not conclude from the rule's compiled source that it cannot see links. Grepping
  `dist/rules/noUndefinedTypes.cjs` for `link` returns zero, and the rule reports links anyway —
  the traversal lives elsewhere in the plugin. That grep was run here, believed, and was wrong; the
  behavioural probe is what settled it.

## Fix Applied

`.ai-docs/standards/documentation-bible.md` -> "Where this stops: in a source comment, `{@link}` is
the citation and a backtick is prose", appended to "A Name in a Document Is a Claim About Source".
It states the split, the two non-resolving forms with their working spellings, the census command
with the ugrep hazard, and — explicitly — that nothing gates it and the two candidate instruments
disagree.

**No gate landed, and the reason is ownership rather than judgement.** All six sites
`jsdoc/no-undefined-types` reports sit in files that lane did not own, with four other lanes
working the same tree. Turning the rule on would have reddened `bun run lint` for all of them.

## Proposed Standard

Already written, in the section named above. What is left is a decision, not a rule:

**Adopt `jsdoc/no-undefined-types` only alongside the nine fixes**, and know it is a 4-of-9 gate
that also demands `{@link BaseCommand.exitIfWorkIncomplete}` where `{@link exitIfWorkIncomplete}`
is correct today. That is a permanent tax on a correct construct in exchange for partial coverage,
and it is a genuine trade rather than an obvious win.

**The complete instrument is the checker walk**, and it is roughly forty lines against
`typescript`, which this package already depends on. CLI-581's row rules out "a bespoke scanner",
and that ruling was aimed at a TEXT scanner — the class that cannot work here, because backticked
prose deliberately names what is gone. A walk over `JSDocLink` nodes asking the checker is not that
class: it reads the same symbol table an editor reads, it has no heuristic, and it returned zero
false positives over 252 citations. Whether the ruling extends to it is an owner call.

**Do not adopt TypeDoc for this.** It is exact on resolution and adds a documentation generator as
a devDependency used only as a linter, needs one run per tsconfig, and emits more warnings for
"resolved but not exported" than it does for the defect — a ratio that trains a reader to skim the
output, which is how a gate stops being one.

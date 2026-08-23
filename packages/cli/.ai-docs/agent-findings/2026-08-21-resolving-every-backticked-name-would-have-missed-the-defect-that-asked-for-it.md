---
type: audit
severity: medium
affected_files:
  - packages/cli/scripts/check-enumeration-drift.ts
  - packages/cli/.ai-docs/reference/boundary-map.md
  - packages/cli/.ai-docs/reference/types/zod-schemas.md
  - packages/cli/.ai-docs/reference/skills/skill-primitives.md
  - packages/matrix/src/built-in-matrix.ts
  - packages/matrix/src/built-in-agents.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/standards/briefing.md
date: 2026-08-21
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

The proposal on the table was a checker that **resolves every backticked identifier in `.ai-docs`
against source**, on the reasoning that it would have caught a table of five schema symbols that
were never real. Measured against this corpus, it would not have — and its two hits on that very
class would both have been false positives against the document that was RIGHT.

### The corpus

Every backticked span in `.ai-docs/reference/` that is identifier-shaped (a camelCase/PascalCase
hump or `CONSTANT_CASE`), fenced code blocks excluded because they are quoted evidence rather than
claims:

- **2707 distinct names, 9782 occurrences.**
- **2634 resolve** somewhere under `packages/cli/{src,e2e,scripts}`, `packages/matrix/src`,
  `packages/ui/src`, `apps/editor/src` or `apps/server/src` (898 files scanned).
- **73 do not**, appearing as **88 (name, document) pairs**.

### Failure one — it misses the founding instance, because three of the five names resolve

`boundary-map.md` listed `skillIdSchema`, `categorySchema`, `domainSchema`, `agentNameSchema` and
`boundSkillSchema` as living in `src/cli/lib/schemas.ts`. None of the five is in that file. But three
of them resolve elsewhere, as file-local non-exported consts in a sibling workspace:

```
grep -rn 'skillIdSchema\|categorySchema\|agentNameSchema' packages/matrix/src
```

`packages/matrix/src/built-in-matrix.ts` declares `const skillIdSchema = z.enum(SKILL_IDS)`,
`const categorySchema = z.enum(CATEGORIES)` and `const agentNameSchema = z.enum(AGENT_NAMES)`;
`built-in-agents.ts` declares a second `agentNameSchema`. A resolver answers "present" for all three
and reports nothing.

### Failure two — its only two hits on that class are false positives

The two that do not resolve, `boundSkillSchema` and `skillSourceTypeSchema`, occur in exactly one
place in the whole corpus: `reference/types/zod-schemas.md`'s sentence saying **they do not exist**.
That sentence is correct, and it is the sentence that caught the defect. A resolver flags it as
drift.

This is the ruling in `standards/briefing.md` § 3 arriving as a measurement: `{@link}` means
"resolve this", a backtick does not. **51% of the unresolved pairs (45 of 88) sit in a sentence
whose subject IS the absence** — and that undercounts, because the phrasings are open-ended. Three
found by hand in a sample of four:

| Name                           | Document                     | The sentence around it                                            |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `additiveMergeAgentCategories` | `config/config-merger.md`    | "No function named `additiveMergeAgentCategories` exists."        |
| `FetchSkillsOptions`           | `skills/skill-primitives.md` | "The inert `FetchSkillsOptions` … went with the `--refresh` flag" |
| `ScopedConfigWriteResult`      | `config/config-writer.md`    | "unlike the `ScopedConfigWriteResult` it replaces"                |

A large share of the rest are names of things that are correctly outside the tree — `parserOptions`,
`tsconfigRootDir`, `projectService`, `globalIgnores`, `sideEffects`, `globalDependencies`,
`ignoreRestSiblings`, `reportUnusedDisableDirectives`, `cacheDirectory`, `patchConsole`,
`exitOnCtrlC`, `allowImportingTsExtensions`, `commandIDs`, `ViteUserConfig`, `YAMLParseError`,
`appendFileSync`, `mapToObj`, `sumBy`.

### Why it fails, stated once

**Existence is not the predicate. Existence AT THE NAMED LOCATION is** — and in the founding
instance the location was a `File` column reading `schemas.ts`. A resolver that asks "does this name
exist anywhere" answers a different question from the one the document asserted, which is why it can
be simultaneously blind to the defect and noisy about the correction.

### The same blindness one door along

`check-finding-citations.ts` excludes `.ai-docs/` by design, so a `.ai-docs/` document citing a
deleted finding is invisible to it. `reference/wizard/state-transitions.md` carried
`Source: .ai-docs/agent-findings/2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack.md`
— deleted after the 2026-08-19 ruling graded it WRONG — under a paragraph headed "Known bug (OPEN)"
proposing the remedy that ruling rejected. Nothing could see it.

## Fix Applied

The three documents the class was found in were corrected (`boundary-map.md` and `zod-schemas.md`
already had been; `skills/skill-primitives.md`'s `.superRefine(validateCategoryField)` — a call and
a symbol that appear nowhere in `src/` — was the survivor). No checker was written: the proposal
under test is refuted above, and the alternative below is a proposal, not a landed gate.

## Proposed Standard

**Do not build the universal resolver.** Record the refutation, so the idea is not re-proposed on
the same reasoning.

**Build the located-symbol reader instead, as a `states:` mode on the registry that already
exists.** `scripts/check-enumeration-drift.ts` has every part needed: `table-pairs` reads two NAMED
columns and answers `key = value` per row, and `declarationOf` already resolves a symbol within one
named file. What is missing is a **subset** verdict — report `namedButAbsent` only, never
`presentButUnnamed` — because these tables are deliberately partial and the existing readers bind
exhaustive claims in both directions.

That mode is immune to both failure families by construction:

- Absence-naming prose is never in a symbol/file table, so it is never read.
- A name resolving in a sibling workspace is still refused, because the row asks the file the
  document named.

**The population is already there and already shaped.** A markdown-table parse over
`.ai-docs/reference/` on 2026-08-21 found **67 tables, 518 rows**, pairing an identifier-shaped
first column with a column of `.ts` paths — `boundary-map.md` alone holds 22 of them, including the
"Utility Schemas" table that produced this whole class. Rows should be added by hand, as every
existing registry row is: a handful of the 67 pair a non-symbol key with a non-file column
(`Scope` / `Config Path`, `Runtime` / `Generator`) and would report nonsense.

The cheap standing proxy for that population — every table row whose first cell is a backticked
identifier and whose line carries a `.ts` path, which is looser than the parse because it does not
require the paths to sit in one column. **601 rows across 33 files on 2026-08-21:**

```
grep -rE '^\| *`[A-Za-z_$][A-Za-z0-9_$]*(\(\))?` *\|.*\.tsx?' .ai-docs/reference --include='*.md' | wc -l
```

Use `grep -E` or `-P` here rather than a bracket expression containing `)`: the `grep` on this
machine is ugrep 7.8.4, where `[^)]` inside such a pattern returns nothing and exits 1 with no
stderr, which reads as "no matches" rather than as a broken pattern.

**And state the limit honestly wherever this is written down.** The mode catches a symbol named in a
table beside the file it is supposed to live in. It does not catch prose, so it would have caught
one of the three instances that produced CLI-610 and neither of the other two — the eagerly-created
directories and the described-but-absent `superRefine` were both sentences. A gate that covers the
densest third of a class is worth having; a gate sold as covering the class is how the other
two-thirds stop being looked for.

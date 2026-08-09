---
last_validated: 2026-08-06
---

# Documentation Bible -- Agents Inc. CLI

> Standards for creating and maintaining AI-optimized documentation in `.ai-docs/`.
> Consult this file only when creating or updating documentation.

---

## The Governing Rule

`.ai-docs/` exists to give an agent the **actual current state** of the app: its architecture, its
invariants, where things live, and what rules they obey. It is not a record of the work that
produced that state.

**The paragraph test — apply it to every paragraph you write or keep:**

> Does an agent implementing a feature tomorrow need this to be correct, or is it a record of
> somebody having been correct in the past?

Keep the first. Cut the second.

An invariant of the system is state and belongs — "every Ink render goes through
`src/cli/components/render.ts`" is architecture. The chronology of how it got that way is history
and does not: the date it landed, the pass that documented it, the task ID that drove it, what an
earlier version of the document used to claim, what a previous pass got wrong.

**`git log` is the archive.** The commit messages already carry the why at the moment each decision
was made, frozen to their commit and therefore never stale. Do not open a decision log, a changelog
section or a validation history to give the clutter somewhere to live.

### Four rules that follow from it

1. **No pass narration.** A document never records what a pass did, checked, corrected or found.
   No `corrected 2026-08-06`, no "this section previously said X", no "a prior audit claimed Y", no
   "verified this session".

2. **State the fact, not the diff.** Write `retry` is `1`, not "`retry` was `2` and is now `1`".
   The superseded value survives only where knowing it prevents a live mistake — a trap an agent
   will actually walk into (a stale global install shadowing the local build; two copies of React
   in one tree; an import whose hoisting order matters). There the history **is** the warning.
   Everywhere else — a "was" column, a superseded count, a renamed symbol nobody references — cut
   it.

3. **No task IDs.** `todo/repo.md` and `todo/cli.md` are the live trackers; an ID absent from both
   is dead and carries no meaning for a reader. Name the behaviour instead of the ticket that
   produced it. The one exception is `agent-findings/`, whose filenames and frontmatter are dated
   evidence by design.

4. **Staleness is one line of frontmatter, and nothing else.** See below.

---

## Core Principles

**1. Investigation First** — never document code you have not read. Base every claim on actual file
contents.

**2. AI-Centric Focus** — structure for AI parsing: tables, explicit paths, code blocks. No
tutorials, no explanations of general concepts.

**3. Path Verification** — every file path MUST be verified to exist, and every symbol cited MUST
be verified to exist in it. Cite by symbol, never by line number.

**4. Write Verification** — re-read every file after editing. Never report success without
verification.

**5. Progressive Loading** — load `DOCUMENTATION_MAP.md` first, then only the documents you need.

---

## Staleness

Every document carries exactly one staleness signal, in its frontmatter:

```yaml
---
last_validated: YYYY-MM-DD
---
```

Binding rules:

1. **It means the whole document was re-derived from source on that date.** Nothing narrower.
2. **A pass that checked part of a document does not move it.** Correct what you found, leave the
   date. Moving it would report the sections nobody opened as freshly checked — those are the ones
   most likely to be wrong.
3. **No annotation blocks anywhere.** No HTML-comment validation banners, no `FULL` / `PARTIAL`
   markers, no `✓ / ✗` scope lists, no `**Last Validated:**` line in the body. The frontmatter date
   is the entire mechanism.
4. **A pointer's date records link integrity**, not source validation — the last time its redirect
   targets were confirmed to resolve. A pointer lagging its targets is the expected steady state.
   Do not re-stamp a pointer you did not open, and do not churn one to the current date.
5. **If you leave a named area of a document knowingly unverified and it matters, file it in
   `agent-findings/`.** That is the home for dated point-in-time evidence; a document is not.
6. **Every count the document owns must have been re-derived from source in that same pass.**
   This is the one mechanical, checkable half of rule 1, and it is where the date is most often
   advanced falsely: a pass that moved three figures and stamped the date reports the other four as
   checked. Counts are the cheapest claims in any document to re-derive — read the tuple, run the
   test file, evaluate the module — so there is no version of "I re-derived this document" that
   skips them. If you touched some counts and not others, correct what you found and **leave the
   date**; the document is then honestly stale rather than falsely fresh. See
   [A Count Lives in Exactly One Document](#a-count-lives-in-exactly-one-document) for which counts
   a document owns. Source: `agent-findings/2026-08-07-built-in-catalogue-relationship-counts-drifted-under-a-fresh-last-validated.md`,
   where `built-in-catalogue.md` carried `conflicts: 28` against 12 and `requires: 50` against 98
   under a `last_validated` stamped that same day.

Thresholds — how long a date may age before the document is due for a whole-file pass:

| Document class                                                  | Threshold |
| --------------------------------------------------------------- | --------- |
| `reference/store-map.md` (tracks the highest-churn source file) | 7 days    |
| Reference documents generally                                   | 14 days   |
| Low-churn areas (architecture, packaging, monorepo, pointers)   | 30 days   |
| `standards/`                                                    | Quarterly |

---

## The Map

`DOCUMENTATION_MAP.md` is an **index**: which documents exist and what each one covers. It is read
before the documents it describes, so anything wrong in it is authoritative for every agent that
never opens the owning doc.

- It does **not** restate `last_validated` dates — frontmatter owns them, and a second copy can
  only drift.
- It does **not** record passes, closed gaps, completed work or its own audit history.
- Adding a document means adding a row; deleting one means deleting the row.

---

## A Count Lives in Exactly One Document

Annotations in an index, a tree diagram or a "covers" column describe **scope**, never
**quantity**.

```
GOOD: zod-schemas.md   # Zod schemas (bridge, loader, structural, strict)
BAD:  zod-schemas.md   # All 39 Zod schemas (bridge, loader, structural, strict)
```

A count belongs in **one** place: the document that re-verifies it against source. A second copy
guarantees drift, because validation is organised per document — the agent assigned
`zod-schemas.md` re-counts the schemas and nothing tells it that another file quotes the same
number.

| Count                                                                     | Owning doc (the ONLY place the number is written)            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Zod schema count                                                          | `reference/types/zod-schemas.md`                             |
| `SkillId` / `SkillSlug` / `Category` / `Domain` / `AgentName` union sizes | `reference/type-system.md` ("Counts")                        |
| `defaultCategories` size + exclusive/required split                       | `reference/features/skills-and-matrix.md` ("Current Counts") |
| Factory / helper / assertion counts                                       | `reference/testing/factories.md`                             |
| Source-file and E2E-file totals                                           | `DOCUMENTATION_MAP.md` ("Coverage")                          |
| Packaging counts (tarball entries, entry globs)                           | `reference/build-and-packaging.md`                           |

Everything else names the owning doc instead of restating the number. **When a pass changes a
count, grep `.ai-docs/` for both the old and the new value before finishing.** If a stale copy is
outside your ownership, record the mismatch in a file you do own and report it.

---

## Format Rules

**Tables over prose** — agents extract structured data more reliably from tables.

**Absolute paths from the project root** — `src/cli/lib/compiler.ts`, never "the compiler file" and
never `./lib/compiler.ts`.

**Code blocks over descriptions** — show the actual pattern, not an explanation of it.

**Consistent terminology** — one term per concept, across all docs.

### File-Path Conventions

Three accepted forms. Pick ONE for a given document's prose and stay with it.

| Form                  | When to use                                                          | Example                                   |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| Full canonical        | Prose in standards and reference docs                                | `src/cli/lib/matrix/matrix-provider.ts`   |
| Bare (root-relative)  | Inside tree diagrams / file tables under a stated root (`src/cli/`)  | `matrix/matrix-provider.ts`, `consts.ts`  |
| Frontmatter-full-path | **Required** in agent-findings `affected_files:` / `standards_docs:` | `- src/cli/lib/matrix/matrix-provider.ts` |

A single document's prose must not mix `src/cli/utils/x.ts` and `utils/x.ts` for the same file.
Tree diagrams and tables may use the bare form because their root is stated in the preceding
heading or column. Reference tables may legitimately pair bare + canonical in two columns.

`reference/monorepo-layout.md` is the one deliberate exception: its subject is the repository
around `packages/cli`, so its paths are repository-root-relative. Do not "normalise" them.

### No Source Line Numbers — Cite by Symbol

**Cite a path and a SYMBOL, never a line number.** Write ``  `classifyLocalSkill` in
`skills/skill-metadata.ts` ``, not `` `skill-metadata.ts:240` ``. A symbol name survives every edit
above it and is greppable; a line number rots on the next unrelated insertion, silently, while
still reading as authoritative.

Line ranges in an inventory TABLE whose whole purpose is to locate a declaration are the one
tolerated exception, and they carry the same rot — prefer the symbol column.

`grep -rEc '\.tsx?:[0-9]+' .ai-docs/reference/` returning zero is the check.

---

## Validation

**Steps:**

1. Read every claim in the document — file paths, symbol names, signatures, counts.
2. Verify each against source with Read/Grep/Glob.
3. Fix errors, add omissions.
4. If and only if you re-derived the whole document, move its `last_validated`.

**What to verify:**

| Claim type            | How to verify                                       |
| --------------------- | --------------------------------------------------- |
| File path             | Read the file — does it exist?                      |
| Symbol name           | Grep the file — is it still declared there?         |
| Function signature    | Read the source — does the signature match exactly? |
| Count                 | Grep/count the actual entries                       |
| Type definition       | Read the type file — do the fields match?           |
| Data flow description | Trace the actual code path                          |

### Re-Validation Triggers Beyond Cadence

Re-validate a document in the current session, ignoring its threshold, when:

- An `agent-findings/*.md` entry lists it in `affected_files:` / `standards_docs:` / `related:`, or
  names a function it documents.
- A change lands in a file it references.
- It covers a class of behaviour (tombstones, guards, state transitions) and a finding in the same
  session touches that class.

Reference docs age faster than code.

### Heading Diff: Detecting Sections That Were Never Written

**A validation sweep MUST diff a document's heading list against the exported surface of the
modules it owns.** The claim-by-claim loop only checks claims that exist, so it is structurally
incapable of finding a missing section — and when an owned area gains a **new** subsystem rather
than a changed one, the absent heading is the only drift signal.

Per document, per sweep:

1. Determine the modules the doc owns (read the hook table below in reverse: doc -> source dirs).
2. `Glob` those dirs and list every exported symbol (`export const|function|type|class`).
3. Extract the doc's heading list (`grep '^#'`).
4. Diff. A cluster of exports with no owning heading is a missing section, not a stale line.
5. New section names come from the source, not from what the doc already discusses.

### Doc-Touching Changes (Feature / Rename / Deletion Hooks)

When shipping a change that touches these files, grep the listed docs and update them in the same
session. **Every source directory under `src/cli/` must appear here** — a directory with no row
produces no hook, and a change there ships undocumented no matter how diligent the agent is.

| Change                                                                                                                                                           | Doc(s) to grep + update                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Command or its public signature added / deleted / renamed (`src/cli/commands/**`) — includes `static flags`, `static baseFlags`, `static args`, `static aliases` | `commands/index.md`, `dependency-graph.md`, `boundary-map.md`                                                       |
| Component added / deleted / renamed (`src/cli/components/**`, `src/cli/hooks/**`)                                                                                | `component-patterns.md`, `dependency-graph.md`                                                                      |
| New trust-boundary op (read/write/exec), or a change to an existing one                                                                                          | `boundary-map.md`                                                                                                   |
| Change to `config-types-writer.ts`                                                                                                                               | `boundary-map.md`, `dependency-graph.md`                                                                            |
| Any change under `src/cli/stores/**`, or a store refactor (prop-driven <-> hydration-before-render)                                                              | `store-map.md`, `wizard/state-transitions.md`, `features/wizard-flow.md`                                            |
| Mock-data constants added / removed                                                                                                                              | `testing/mock-data.md`                                                                                              |
| Any change under `src/cli/lib/installation/**`                                                                                                                   | `features/plugin-system.md`, `concepts/scope-system.md`, `concepts/tombstone-pattern.md`, `config/config-writer.md` |
| Any change under `src/cli/lib/plugins/**` or to `permission-checker.tsx`                                                                                         | `features/plugin-system.md`, `boundary-map.md`                                                                      |
| Matrix composition inputs (`default-categories.ts`, `default-rules.ts`, `lib/matrix/**`, `lib/loading/**`, regenerated `types/generated/**`)                     | `features/skills-and-matrix.md` (esp. Known Limitations + Current Counts), `type-system.md`, `types/core-types.md`  |
| Any change under `src/cli/lib/configuration/**`                                                                                                                  | `features/configuration.md`, `config/config-writer.md`, `config/config-merger.md`, `config/scope-split.md`          |
| Any change under `src/cli/lib/operations/**`                                                                                                                     | `features/operations-layer.md`, `types/operations-types.md`, `dependency-graph.md`                                  |
| Any change under `src/cli/lib/agents/**`, or to `lib/compiler.ts` / `lib/output-validator.ts`                                                                    | `features/agent-system.md`, `features/compilation-pipeline.md`                                                      |
| Any change under `src/cli/lib/skills/**` or `src/cli/lib/stacks/**`                                                                                              | `features/skills-and-matrix.md`, `features/compilation-pipeline.md`, `skills/skill-primitives.md`                   |
| Any change under `src/cli/lib/wizard/**`                                                                                                                         | `features/wizard-flow.md`, `wizard/state-transitions.md`, `concepts/guard-pattern.md`                               |
| Any change under `src/cli/lib/seed/**`                                                                                                                           | `features/seed-contract.md`                                                                                         |
| Any change under `src/cli/lib/config-gate/**`                                                                                                                    | `boundary-map.md`, `config/config-writer.md`                                                                        |
| Any change to `lib/schemas.ts` or `lib/schema-validator.ts`                                                                                                      | `types/zod-schemas.md` (owns the schema count), `boundary-map.md`                                                   |
| Any change under `src/cli/utils/**`, or to `consts.ts` / `lib/exit-codes.ts`                                                                                     | `utilities.md`                                                                                                      |
| Any change under `src/cli/types/**`                                                                                                                              | `type-system.md`, `types/core-types.md`, `types/operations-types.md`                                                |
| Test-infrastructure change (`__tests__/factories/`, `__tests__/helpers/`, `e2e/pages/`, `e2e/helpers/`)                                                          | `testing/factories.md`, `testing/e2e-infrastructure.md`, `standards/e2e/*`                                          |
| `scripts/**` generators, `tsup.config.ts`, `package.json` scripts                                                                                                | `features/code-generation.md`, `build-and-packaging.md`, `monorepo-layout.md`                                       |

**Grep the diff, not the release notes.** A release note describes user-visible behaviour; a hook
row describes which document owns the code that produced it. The two do not overlap reliably.

---

## Content Rules for Specific Document Kinds

### Command reference

1. **Verify `static flags` and `static baseFlags` before documenting flags.** If either is `{}`,
   the command has no flags of that kind.
2. **Glob `src/cli/commands/**/*.{ts,tsx}` and diff against the index table.** Flag any row whose
   file does not exist, and any command file with no row.
3. **Diff every documented flag/arg row against `static flags` / `static baseFlags` /
   `static args`.** A documented flag that no longer parses is a **hard error, not staleness** — an
   agent following the doc emits an invocation oclif rejects.
4. **A removed flag leaves an explicit callout naming the removal and the replacement behaviour**,
   not just a deleted row. This is the one place a superseded value earns its keep: everyone who
   already knows the old flag needs the signal.

### Known Limitations

When a documented system has an open hardening task in `todo/cli.md`, the reference doc MUST carry
a **Known Limitations** section with file and function anchors.

- **Re-check a limitation against the fix, not merely re-date it.** A limitation MUST be
  re-validated whenever a change lands touching the code it names, even while the task stays open.
- State the **mechanism** (unchanged / changed) separately from the **reach** (which paths can
  still hit it). A fix commonly changes only the reach. Where the reach is now guarded by a test,
  name that test.
- **A limitation whose fix shipped is removed in the same session as the fix.** A closed limitation
  left standing reads as an open one and gets designed around.
- The dangerous shape is the half-right limitation — authoritative in tone, wrong in blast radius.
  Where a limitation asserts an observable artifact (an `order: 999` entry, a file that should not
  exist, an absent field), **grep the artifact during validation**.

### Wizard and component docs

- **Hydration vs props:** if state flows through a `hydrateXStore(options)` call before render
  rather than through props, name that function, show the `HydrateOptions` type, and keep the
  `XxxProps` shape minimal.
- **Hook table:** every entry MUST be confirmed to exist via `Glob` before re-validation.
- **Hotkey registry:** enumerate only constants that exist in `hotkeys.ts`, and include an explicit
  "No other `HOTKEY_*` constants exist" sentinel.

### Store map

- Every non-exported helper at module scope MUST appear under Internal Helpers.
- State fields that are (a) set once and never modified, or (b) act as decision probes read by
  multiple actions, MUST enumerate their consumers — not just their authoring action.
- The hydration entry point (the imperative `setState` batch before first render) gets its own
  section, separate from the action table.

### Guard and side-effect inventories

1. **Enumerate every user-visible outcome** the inventoried code produces. Where a guard is split
   between a dispatcher layer (the `wizard.tsx` hotkey handler) and a store action layer, document
   BOTH and state which path wins for which caller class (hotkey vs direct action vs test).
2. Include a **Silent Guards table** annotated with race risk: whether the silence is intentional
   contract-violation defence, intentional shaping, or a race surface needing an E2E wait or
   synchronous seeding.

### Exhaustive enumeration over glob shorthand

Listing constants or exports (mock data, skills registry, hotkeys, Zod schemas) uses **exhaustive
name lists**, never `*_MATRIX - pre-built constants` or `etc.`. Glob descriptions let a phantom
export survive indefinitely, because nothing in the doc claims it should not be there.

### Splits and pointers

When a document is split, the original becomes a pointer **in the same session** — never leave the
pre-split body alongside its children.

A pointer contains: a "where content lives now" table mapping topics to child paths, the reason the
path is kept (inbound links), and no other content.

**Direction is not implied by path depth.** A pointer may be the root file or the subdirectory
file. Two current pairs are root-pointer/subdirectory-canonical (`commands.md` ->
`commands/index.md`, `state-transitions.md` -> `wizard/state-transitions.md`). Determine direction
by **reading both files**: the canonical one holds the body, the pointer holds a redirect table and
nothing else. Getting it backwards excludes a canonical doc from staleness tracking entirely.

---

## Progressive Loading

| Tier    | What to load             | When                                         |
| ------- | ------------------------ | -------------------------------------------- |
| **1st** | `DOCUMENTATION_MAP.md`   | Always first — shows what exists             |
| **2nd** | The area's reference doc | When working on that area                    |
| **3rd** | The subsystem's doc      | When working inside that subsystem           |
| **4th** | `documentation-bible.md` | Only when creating or updating documentation |

### Cross-Reference Instead of Duplicate

| Belongs in `.ai-docs/`     | Belongs in a skill                    |
| -------------------------- | ------------------------------------- |
| File locations and paths   | Coding patterns and conventions       |
| State shape and actions    | Best practices (React, Zustand, etc.) |
| Data flow through codebase | Anti-patterns to avoid                |
| Component relationships    | Testing patterns                      |

---

## Creating New Documentation

**Create when:** a new subsystem is added, an existing one is significantly restructured, or a
validation pass finds an undocumented area.

**Do not create when:** the information is derivable by reading the code, duplicates a skill, is
general knowledge, or is small enough for a line in CLAUDE.md.

**Template:**

```markdown
---
last_validated: YYYY-MM-DD
---

# [Area]

## Overview

**Purpose:** [one sentence]
**Entry point:** `src/cli/[path]`

## File Structure

| File                    | Purpose     |
| ----------------------- | ----------- |
| `src/cli/lib/[file].ts` | Description |

## Data Flow

1. `file.ts` does X
2. `other-file.ts` does Y

## Key Types

| Type       | File            | Purpose     |
| ---------- | --------------- | ----------- |
| `TypeName` | `types/file.ts` | Description |

## Key Functions

| Function       | File          | Signature                     |
| -------------- | ------------- | ----------------------------- |
| `functionName` | `lib/file.ts` | `(param: Type) => ReturnType` |
```

Then add a row to `DOCUMENTATION_MAP.md`.

---

## Quality Standards

Good AI documentation is **specific** (every claim has a path and a symbol), **verifiable**,
**structured** (tables and code blocks), **current** (the date is recent and the cited symbols
still exist), and **minimal** (WHERE things are and WHAT they do).

| Anti-pattern       | Example                                        | Fix                                                                                         |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Vague claims       | "The codebase uses Zustand"                    | "Wizard state: `src/cli/stores/wizard-store.ts`, accessed via `useWizardStore()` selectors" |
| Tutorial content   | "Zustand is a lightweight state library..."    | Remove — agents already know what Zustand is                                                |
| Missing paths      | "Exit codes are defined as constants"          | "`EXIT_CODES` in `src/cli/lib/exit-codes.ts`"                                               |
| Invented examples  | Code not from actual source                    | Quote the actual code, cited by symbol                                                      |
| General knowledge  | "oclif is a framework for building CLIs..."    | Document THIS project's oclif patterns only                                                 |
| Duplicating skills | Repeating Zustand patterns from a skill        | Cross-reference the skill                                                                   |
| Pass narration     | "Corrected 2026-08-06; previously said Ink v5" | State the current fact and nothing else                                                     |
| Dead task IDs      | "the D-279 masking layer"                      | Name the behaviour: "the cross-scope masking layer"                                         |

### Self-Correction Triggers

| Trigger                                          | Correction                                               |
| ------------------------------------------------ | -------------------------------------------------------- |
| Documenting without reading the code             | Stop. Read the actual source files.                      |
| Generic description instead of a file path       | Stop. Give a specific path plus a symbol name.           |
| Citing a source line number                      | Stop. Cite the enclosing symbol.                         |
| Writing what this pass checked or corrected      | Stop. That is the commit message's job.                  |
| Writing a fact as a diff from its previous value | Stop. State the fact.                                    |
| Citing a task ID                                 | Stop. Check the trackers; if absent, name the behaviour. |
| Moving `last_validated` after a partial pass     | Stop. Leave the date.                                    |
| Reporting success without re-reading the file    | Stop. Read the file to confirm the write landed.         |

---

## Critical Reminders

**(You MUST read actual code files before documenting — never document based on assumptions)**

**(You MUST verify every file path and every cited symbol against source — and cite symbols, never line numbers)**

**(You MUST apply the paragraph test to everything you write or keep)**

**(You MUST NOT record what your pass did in the documents it touched)**

**(You MUST re-read files after editing to verify changes were written)**

---

## Agent Findings

`.ai-docs/agent-findings/` is the deliberate exception to everything above: its entries are dated
point-in-time evidence and say so. They are not maintained, not re-validated and not swept for
staleness.

Every file there (other than `README.md` and `TEMPLATE.md`) MUST:

1. **Open with a YAML frontmatter block matching `TEMPLATE.md`.** Files without frontmatter are not
   processed by convention-keeper or codex-keeper sweeps.
2. **Use a `root_cause` from the allowed enum** (`missing-rule | rule-not-visible |
rule-not-specific-enough | convention-undocumented | enforcement-gap |
scope-discipline-deferred`). When an authentic root cause does not fit, widen the enum in
   `TEMPLATE.md` rather than inventing an ad-hoc value.
3. **Declare `status:`.** Reading an absent status as `open` mis-classifies resolved work as
   outstanding and invents work that was already done.
4. **Cross-link** via `supersedes:` / `superseded_by:` when a discovery finding is replaced by a
   fix finding over the same files and root cause.
5. **Quote every multi-sentence value, or write it as a `>-` block scalar.** A plain YAML scalar
   cannot contain a bare `: `, and prose is where a colon turns up — so the fields carrying prose
   are exactly the fields that break, which is to say `resolved_by:` and `partial_note:`, the two
   this standard makes conditionally REQUIRED. Ten findings were unparseable this way, and every
   scan in the table below was silently skipping all ten while reporting a count over the rest.
   `TEMPLATE.md` -> schema rule 5 has the authoring guidance.

Seven defect classes a pre-processing pass scans for. **Class `g` runs first**: every other row is
defined over parsed frontmatter, so a scan that reports a count without first proving the directory
parses is a count over the files it could read, which is not the same claim.

| #   | Defect                                                        | Detection                                                                           |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| g   | Frontmatter no YAML parser can read                           | `scripts/check-findings-frontmatter.ts` — parses every file, fails on any it cannot |
| a   | File without frontmatter                                      | No leading `---` block                                                              |
| b   | `root_cause:` outside the enum                                | `grep -h '^root_cause:'` vs the enum in `TEMPLATE.md`                               |
| c   | Duplicate `affected_files + root_cause + date` tuple          | Compare tuples across files                                                         |
| d   | `type:` outside the `TEMPLATE.md` enum                        | `grep -h '^type:'`; note `enforcement-gap` is a `root_cause` value, never a `type`  |
| e   | `superseded_by:` / `supersedes:` without `status: superseded` | Cross-check the pair on each file                                                   |
| f   | Missing `status:`                                             | `grep -L '^status:'`                                                                |

Any rollup quoting a status distribution MUST state how many files had no `status:` and were
inferred.

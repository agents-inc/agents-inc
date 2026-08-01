---
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-07-30 · SYNC (product 0.146.0) — index-consistency pass. -->

# Documentation Bible -- Agents Inc. CLI

> Standards for creating and maintaining AI-optimized documentation in `.ai-docs/`.
> Only consult this file when creating or updating documentation.

---

## Core Principles

**1. Investigation First** - Never document code you haven't read. Base all claims on actual file contents.

**2. AI-Centric Focus** - Structure for AI parsing: tables, explicit paths, code blocks. No tutorials or explanations of general concepts.

**3. Path Verification** - Every file path MUST be verified to exist before documenting. Every line number MUST be checked against source.

**4. Write Verification** - Re-read every file after editing. Never report success without verification.

**5. Progressive Loading** - Load only what you need. Start with `DOCUMENTATION_MAP.md`, then load specific docs as needed.

---

## Document Hierarchy

### The Actual Structure

```
.ai-docs/
  DOCUMENTATION_MAP.md          # THE INDEX - load this first
  reference/
    architecture-overview.md    # System architecture, data flow, directory structure
    boundary-map.md             # System boundaries: input, parse, write, exec, security
    commands.md                 # POINTER -> commands/index.md
    component-patterns.md       # Ink component conventions, hooks, styling constants
    dependency-graph.md         # Cross-cutting import maps: commands -> ops -> lib -> utils
    findings-impact-report.md   # Agent findings cross-referenced against reference docs
    state-transitions.md        # Wizard state machine: steps, actions, resets, hotkeys
    store-map.md                # Zustand wizard store state, actions, consumers
    test-infrastructure.md      # Test helpers, factories, fixtures, E2E infrastructure
    type-system.md              # Union types, branded types, Zod schemas, typed helpers
    utilities.md                # Shared utilities, constants, logger, fs helpers
    architecture/               # Pointer files to root-level originals
      overview.md               # -> architecture-overview.md
      dependency-graph.md       # -> dependency-graph.md
      boundary-map.md           # -> boundary-map.md
    commands/                   # Command details
      index.md                  # CANONICAL commands reference (root commands.md is the pointer)
      edit.md                   # Detailed edit command flow, types, utilities
    concepts/                   # Cross-cutting concerns
      scope-system.md           # Project vs global scope, path resolution, config splitting
      tombstone-pattern.md      # Excluded/tombstone lifecycle, SkillConfig.excluded
      guard-pattern.md          # Unified view of all wizard store guards
    config/                     # Configuration details
      configuration.md          # -> features/configuration.md (pointer)
      config-writer.md          # Config writer and config types writer detail
    testing/                    # Test infrastructure splits
      infrastructure.md         # Vitest config, test projects, directory structure
      factories.md              # Factory/helper/assertion tables
      mock-data.md              # SKILLS registry, TEST_CATEGORIES, mock-data constants
      e2e-infrastructure.md     # E2E config, POM, matchers, fixtures, timeouts
    types/                      # Type system splits
      core-types.md             # Generated unions, core data structures, type guards
      operations-types.md       # Operations layer types, edit command types
      zod-schemas.md            # Zod schemas (bridge, loader, structural, strict)
    wizard/                     # Wizard pointer files
      flow.md                   # -> features/wizard-flow.md
      state-transitions.md      # -> state-transitions.md
      store-map.md              # -> store-map.md
      component-patterns.md     # -> component-patterns.md
    features/
      agent-system.md           # Agent templates, partials, Liquid compilation, metadata
      compilation-pipeline.md   # Liquid templates, agent assembly, output validation
      configuration.md          # Config loading, resolution hierarchy, config writer
      operations-layer.md       # Composable operations: source, skills, project
      plugin-system.md          # Plugin discovery, manifest generation, installation
      skills-and-matrix.md      # Skills matrix, categories, resolution, source loading
      wizard-flow.md            # Wizard steps, state transitions, keyboard navigation
```

### A Count Lives in Exactly One Document

**Annotations in the tree above, and in the "What Each Document Covers" table below, describe SCOPE, never QUANTITY.**

```
GOOD: zod-schemas.md   # Zod schemas (bridge, loader, structural, strict)
BAD:  zod-schemas.md   # All 39 Zod schemas (bridge, loader, structural, strict)

GOOD: factories.md     # Factory/helper/assertion tables
BAD:  factories.md     # Factory/helper/assertion tables (34 factories)
```

A count belongs in **one** place: the document that re-verifies it against source. Duplicating a count into a second file guarantees drift, because:

- The two files have **different owners** (`standards/` is convention-keeper's, `reference/` is codex-keeper's) and **different validation cadences**.
- Validation is organised **per document**. The agent assigned `zod-schemas.md` re-counts the schemas and bumps that file's `last_validated`. Nothing tells it another file quotes the same number.
- Index drift is **silent and high-blast-radius**: the index is read _before_ the doc it describes, so a number there is taken as authoritative by every agent that never opens the owning doc.

Evidence this is real, not theoretical: the annotation `# All 39 Zod schemas` survived in this file from 2026-07-23 to 2026-07-30 — through a full documentation sweep and two targeted syncs — while the true count (35) sat corrected in `zod-schemas.md` the whole time.

**When a validation pass changes a count, grep `.ai-docs/` for BOTH the old and the new value before finishing.** Any other file quoting it is drift. If the other file is outside your ownership, record the mismatch in a file you _do_ own — naming the stale file, its stale value, and its owner — and report it. Never leave two surfaces disagreeing unremarked.

**Ownership registry for the counts that are duplicated most often:**

| Count                                                                     | Owning doc (the ONLY place the number is written)                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Zod schema count                                                          | `reference/types/zod-schemas.md`                                          |
| `SkillId` / `SkillSlug` / `Category` / `Domain` / `AgentName` union sizes | `reference/type-system.md` ("Counts" section)                             |
| `defaultCategories` size + exclusive/required split                       | `reference/features/skills-and-matrix.md` ("Current Counts")              |
| Factory / helper / assertion counts                                       | `reference/testing/factories.md`                                          |
| Source-file and E2E-file totals                                           | `DOCUMENTATION_MAP.md` ("Coverage Metrics")                               |
| Agent-findings totals                                                     | `reference/findings-impact-report.md` (header, against a pinned snapshot) |

Everything else references the owning doc by name instead of restating the number.

### Loading Decision Tree

```
Need to work on any area of the codebase?
|
+-> Load DOCUMENTATION_MAP.md FIRST (quick orientation, status of all docs)
|
+-> Need specific feature understanding?
|     +-> Load the relevant .ai-docs/ file for that area
|
+-> Need to add/update documentation?
      +-> Load this file (documentation-bible.md)
```

### What Each Document Covers

| Document                           | Covers                                                                            | Load When                   |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| `DOCUMENTATION_MAP.md`             | Index of all docs, validation history, staleness tracking                         | Always first                |
| `architecture-overview.md`         | Directory structure, data flow, technology stack, entry points                    | Understanding system design |
| `commands/index.md` (CANONICAL)    | Every CLI command with flags, args and exit codes (`commands.md` is a pointer)    | Working on commands         |
| `component-patterns.md`            | Ink components, hooks, `CLI_COLORS`, `UI_SYMBOLS`, `CategoryOption` types         | Working on wizard UI        |
| `store-map.md`                     | `WizardState` shape, all actions, store consumers, initial state                  | Modifying wizard state      |
| `test-infrastructure.md`           | Factory functions, fixtures, `SKILLS.*` registry, E2E test structure              | Writing or updating tests   |
| `type-system.md`                   | `SkillId`, `Domain`, `AgentName` unions, Zod schemas, typed helpers               | Working with types          |
| `utilities.md`                     | `consts.ts`, `messages.ts`, `logger.ts`, `fs.ts`, `exec.ts`                       | Using shared utilities      |
| `features/compilation-pipeline.md` | Compiler stages, template resolution, output validation                           | Modifying compilation       |
| `features/configuration.md`        | Config resolution (flag > env > project > global > default), config writer        | Working on config system    |
| `features/plugin-system.md`        | Plugin discovery, manifest, installation, marketplace integration                 | Working on plugins          |
| `features/skills-and-matrix.md`    | Skills matrix loading, category resolution, source switching                      | Working on skills/matrix    |
| `features/wizard-flow.md`          | Wizard steps (stack -> skills -> sources -> agents -> confirm), state transitions | Modifying wizard flow       |
| `features/operations-layer.md`     | Composable operations (source, skills, project), typed options/results            | Working on commands or ops  |
| `features/agent-system.md`         | Agent templates, partials, metadata.yaml, Liquid compilation                      | Working on agents           |
| `dependency-graph.md`              | Command -> operations -> lib -> utils import maps, layer boundaries               | Understanding import chains |
| `boundary-map.md`                  | CLI input, file parse, file write, shell exec, security boundaries                | Adding validation or I/O    |
| `state-transitions.md`             | Wizard state machine: step sequence, action->state table, reset matrix            | Debugging wizard state      |
| `findings-impact-report.md`        | Agent findings cross-referenced against reference docs, priority list             | Prioritizing doc validation |

---

## Documentation Standards

### Format Rules

**Tables over prose** - AI agents extract structured data more reliably from tables.

```markdown
GOOD:
| File | Purpose |
|------|---------|
| `src/cli/lib/compiler.ts` | Main compilation: Liquid templates, agent assembly |

BAD:
The compiler is located in the lib directory and handles Liquid templates.
```

**Absolute paths** - Always use paths from project root, never relative references.

```markdown
GOOD: `src/cli/lib/compiler.ts`
BAD: "the compiler file"
BAD: `./lib/compiler.ts`
```

**Code blocks over descriptions** - Show the actual pattern, not an explanation of it.

**Consistent terminology** - Use one term for each concept throughout all docs.

### File-Path Conventions in Docs

Three accepted forms for referring to a source file. Pick ONE for a given doc's prose and stay with it -- do not mix within a single doc.

| Form                  | When to use                                                          | Example                                   |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| Full canonical        | Prose rules in standards/bible docs, reference-doc prose             | `src/cli/lib/matrix/matrix-provider.ts`   |
| Bare (root-relative)  | Inside tree diagrams / file tables under a stated root (`src/cli/`)  | `matrix/matrix-provider.ts`, `consts.ts`  |
| Frontmatter-full-path | **Required** in agent-findings `affected_files:` / `standards_docs:` | `- src/cli/lib/matrix/matrix-provider.ts` |

**One-doc-one-form:** a single doc's prose must not mix `src/cli/utils/x.ts` and `utils/x.ts` for the same file. Tree diagrams and tables within that doc may use the bare form because their root is stated in the preceding heading or table column.

**Reference tables** may legitimately pair bare + canonical in two columns (see `utilities.md`, `skills-and-matrix.md`, `dependency-graph.md`) -- that is a presentation pattern, not prose.

**Agent findings** set canonical paths once in `affected_files:`; prose inside the finding may then use bare names because the header supplies the context.

### Line Numbers and Staleness

Line numbers in documentation go stale as code changes. The validation process handles this:

- **Line numbers are approximate** - They indicate where to look, not exact positions
- **Validated dates** track when line numbers were last confirmed against source
- **DOCUMENTATION_MAP.md** tracks validation status for every document
- **Volatile areas** (store-map, wizard-flow) need validation every 7-14 days
- **Stable areas** (architecture, utilities) can go 30 days between validations

### Validation Process

The project uses adversarial audits to keep documentation accurate. See the Validation History section of `DOCUMENTATION_MAP.md` for examples.

**Validation steps:**

1. Read every claim in the document (file paths, line numbers, function signatures, counts)
2. Verify each claim against actual source code using Read/Grep/Glob tools
3. Fix errors, add omissions
4. Update the "Last Validated" date in `DOCUMENTATION_MAP.md`

**What to verify:**

| Claim Type                 | How to Verify                                         |
| -------------------------- | ----------------------------------------------------- |
| File path                  | Read the file -- does it exist?                       |
| Line number                | Read the file at that line -- does the content match? |
| Function signature         | Read the source -- does the signature match exactly?  |
| Count (e.g., "10 entries") | Grep/count the actual entries                         |
| Type definition            | Read the type file -- do fields match?                |
| Data flow description      | Trace through the actual code path                    |

### Re-Validation Triggers (Beyond Calendar Cadence)

A doc must be re-validated in the current session (ignoring the 7/14/30-day cadence) when ANY of the following hold:

- An `agent-findings/*.md` entry lists the doc in `affected_files:` / `standards_docs:` / `related:`, or names a function the doc documents.
- A shipped task ID (e.g., D-217, D-228, D-230) touches a file the doc references.
- A concept doc covers a class of behavior (tombstones, guards, state transitions) and a finding in the same session touches that class.

Rule of thumb: reference docs age faster than code. Any concept/reference doc referenced by a recent finding must be revalidated in the same sweep -- do not wait for cadence.

### Doc-Touching Changes (Feature / Rename / Deletion Hooks)

When shipping a feature, rename, or deletion that touches these files, grep the listed docs and update in the same session.

**Every source directory under `src/cli/` MUST appear in this table.** A directory with no row produces no doc hook, and a change there ships undocumented no matter how diligent the agent is. The table is the checklist; if the area is not on it, a targeted sync pass will correctly skip it.

| Change                                                                                                                                                                             | Doc(s) to grep + update                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Command **or its public signature** added / deleted / renamed (`src/cli/commands/**`) — includes any change to `static flags`, `static baseFlags`, `static args`, `static aliases` | `commands/index.md`, `dependency-graph.md`, `boundary-map.md`                                                       |
| Component added / deleted / renamed (`src/cli/components/**`, `src/cli/hooks/**`)                                                                                                  | `component-patterns.md`, `dependency-graph.md`                                                                      |
| New trust-boundary op (read/write/exec) or change to existing                                                                                                                      | `boundary-map.md`                                                                                                   |
| D-feature touching `config-types-writer.ts` or `stack-plugin-compiler.ts`                                                                                                          | `boundary-map.md`, `dependency-graph.md`                                                                            |
| Store refactor (prop-driven <-> hydration-before-render), or any change under `src/cli/stores/**`                                                                                  | `store-map.md`, `wizard/state-transitions.md`, `features/wizard-flow.md`                                            |
| Mock-data constants added / removed                                                                                                                                                | `testing/mock-data.md`                                                                                              |
| **Any change under `src/cli/lib/installation/**`\*\*                                                                                                                               | `features/plugin-system.md`, `concepts/scope-system.md`, `concepts/tombstone-pattern.md`, `config/config-writer.md` |
| **Any change under `src/cli/lib/plugins/**`or to`permission-checker.tsx`\*\*                                                                                                       | `features/plugin-system.md`, `boundary-map.md`                                                                      |
| Matrix composition inputs (`default-categories.ts`, `default-rules.ts`, `lib/matrix/**`, `lib/loading/**`, regenerated `types/generated/**`)                                       | `features/skills-and-matrix.md` (esp. Known Limitations + Current Counts), `type-system.md`, `types/core-types.md`  |
| Any change under `src/cli/lib/configuration/**`                                                                                                                                    | `features/configuration.md`, `config/config-writer.md`, `config/config-merger.md`, `config/scope-split.md`          |
| Any change under `src/cli/lib/operations/**`                                                                                                                                       | `features/operations-layer.md`, `types/operations-types.md`, `dependency-graph.md`                                  |
| Any change under `src/cli/lib/agents/**`, or to `lib/compiler.ts` / `lib/output-validator.ts`                                                                                      | `features/agent-system.md`, `features/compilation-pipeline.md`                                                      |
| Any change under `src/cli/lib/skills/**` or `src/cli/lib/stacks/**`                                                                                                                | `features/skills-and-matrix.md`, `features/compilation-pipeline.md`                                                 |
| Any change under `src/cli/lib/wizard/**`                                                                                                                                           | `features/wizard-flow.md`, `wizard/state-transitions.md`, `concepts/guard-pattern.md`                               |
| Any change to `lib/schemas.ts` or `lib/schema-validator.ts`                                                                                                                        | `types/zod-schemas.md` (owns the schema count), `boundary-map.md`                                                   |
| Any change under `src/cli/utils/**`, or to `consts.ts` / `lib/exit-codes.ts` / `lib/feature-flags.ts`                                                                              | `utilities.md`                                                                                                      |
| Any change under `src/cli/types/**`                                                                                                                                                | `type-system.md`, `types/core-types.md`, `types/operations-types.md`                                                |
| Test-infrastructure change (`__tests__/factories/`, `__tests__/helpers/`, `e2e/pages/`, `e2e/helpers/`)                                                                            | `testing/factories.md`, `testing/e2e-infrastructure.md`, `standards/e2e/*`                                          |

If an update cannot be made in the same session, add a `NEEDS-VALIDATION` note to the doc's `DOCUMENTATION_MAP.md` row.

**Grep the diff, not the release notes.** A targeted sync pass must grep the shipped diff for the files named in this table, not only for the docs the release notes happen to mention. A release note describes user-visible _behaviour_; a doc hook describes which reference doc owns the _code_ that produced it. The two do not overlap reliably — the D-279 masking work is described in the changelog under a wizard-facing heading while the code lives entirely in `local-installer.ts`.

**Why the two bolded rows exist.** Before 2026-07-30 this table had no row for `src/cli/lib/installation/**` or `src/cli/lib/plugins/**`. `local-installer.ts` is 1584 lines — the joint most-cited file in `agent-findings/` (22 citations) — and it absorbed the entire D-279 cross-scope masking layer. Two consecutive targeted sync passes (0.145.0, 0.146.0) both skipped `features/plugin-system.md` and were behaving _correctly against the checklist they were given_. A change to the single largest file in the install path triggered no hook, while a change to any component file did.

### Heading Diff: Detecting Sections That Were Never Written

**A validation sweep MUST diff a doc's heading list against the exported surface of the modules it owns.**

The standard validation loop (read each claim, verify it against source, fix it) is _structurally incapable_ of finding a missing section. It only checks claims that exist. When a doc's owned area gains a **new** subsystem rather than a changed one, the absence of a matching heading is the only drift signal — and nothing in a claim-by-claim pass looks for an absence.

Procedure, per doc, per sweep:

1. Determine the modules the doc owns (use the hook table above, read in reverse: doc -> source dirs).
2. `Glob` those dirs and list every exported symbol (`export const`, `export function`, `export type`, `export class`).
3. Extract the doc's heading list (`grep '^#'`).
4. **Diff.** Every exported symbol should be reachable from some heading. A cluster of exports with no owning heading is a missing section, not a stale line.
5. New section names come from the source, not from what the doc already discusses.

This is how a 349-line feature (the cross-scope reconciliation layer) shipped with **zero** documentation while the doc it belonged in passed every structural check that ran against it.

### Command Reference Docs (`commands.md`)

When documenting or validating a command:

1. **Verify `static flags` and `static baseFlags` before documenting flags.** If either is `{}`, the command has no flags of that kind. Do not document inherited `--source` when `baseFlags = {}`.
2. **Glob `src/cli/commands/**/\*.{ts,tsx}` and diff against the index table.\*\* Flag any row whose file does not exist and any command file not in the table.
3. **Any command whose `run()` begins with `if (!FEATURE_FLAGS.X)` MUST carry a `Feature flag:` line** in its section, cross-referencing the current value in `src/cli/lib/feature-flags.ts`.

4. **Diff every documented flag/arg row against the command's `static flags` / `static baseFlags` / `static args`.** A documented flag that no longer parses is a **hard error, not staleness** — treat it with the same severity as a documented file path that does not exist. An agent following the doc emits an invocation oclif rejects; compare a stale prose paragraph, which at worst under-informs.

   A removed flag MUST leave behind an **explicit callout naming the removal** (and the replacement behaviour, if any), not just a deleted table row. Silently deleting the row makes the doc self-consistent but leaves everyone who already knows the old flag with no signal. The `> **`--all` removed (D-274, breaking).**` block in `commands/index.md` is the intended shape.

   Evidence: `uninstall --all` was removed as a documented breaking change in 0.145.0, and `commands/index.md` kept advertising it across two releases, because the hook table's row was command-level and nothing fired for a signature-level change.

### Known Limitations Rule

When a documented system has active hardening tasks in `todo/TODO.md` (e.g., D-214), the reference doc MUST include a **Known Limitations** section cross-referenced to the task ID with file/function anchors. Describing code as if its TODOs were closed is drift.

**Re-validation clause — a limitation must be re-checked against the fix, not merely re-dated.**

A Known Limitation MUST be re-validated whenever a change lands that touches the code it names — **even when the referenced task is still open**. A fix that narrows a limitation's reach without closing it must update the limitation's _current behaviour_ in the same session.

State the **mechanism** (unchanged / changed) separately from the **reach** (which paths can still hit it). A fix commonly changes only the second. Where the reach is now guarded by a test, name that test.

**Also re-check a limitation against the fix that CLOSED it.** A limitation whose fix shipped must be removed or moved to a "Resolved" note in the same session as the fix — a closed limitation left standing reads as an open one and gets designed around. This is not hypothetical: D-240 shipped in 0.145.0 and was still documented as an OPEN limitation in **three separate reference docs** afterwards.

The dangerous shape is the _half_-right limitation: it reads as authoritative and gets trusted. Limitation #6 in `features/skills-and-matrix.md` claimed "built-in marketplace drift is masked instead of failing loudly" — true when written, falsified when 38 category definitions were added to `defaultCategories` (which now covers all 89 generated categories, test-pinned). The underlying gap was genuinely still open, so the limitation had to stay listed; only its **blast radius** was wrong.

**Cheap mechanical check:** for any limitation whose current-behaviour text asserts an observable artifact (`order: 999` entries in `BUILT_IN_MATRIX`, a file that should not exist, a field that should be absent), **grep the artifact during validation**. In the case above it was zero.

### Hydration-vs-Props / Hook Table / Hotkey Registry

Component / wizard reference docs MUST:

- **Hydration-vs-props:** If state flows through a `hydrateXStore(options)` call before render (not props), name that function, show the `HydrateOptions` type, and keep the actual `XxxProps` shape minimal.
- **Hook table:** Every entry MUST be verified to exist via `Glob` before re-validation. Deleted hooks produce immediate drift.
- **Hotkey registry:** Hotkey lists MUST enumerate only constants that exist in `hotkeys.ts` (or the project's equivalent registry) and include an explicit **"No other `HOTKEY_*` constants exist"** sentinel.

### Store Map Completeness

When documenting a Zustand store:

- Every non-exported helper at module scope MUST appear in Internal Helpers.
- Store state fields that are (a) set once and never modified, or (b) act as decision probes consumed by multiple actions, MUST enumerate their consumers in the field description -- not just their authoring action.
- The hydration entry point (imperative `setState` batch called before first render) gets its own section, separate from the action table.

### Guard / Silent-Guard Rules

Reference docs inventorying guards, actions, or side effects MUST:

1. **Enumerate every user-visible outcome** the inventoried code produces. When a guard is split between a dispatcher layer (`wizard.tsx` hotkey handler) and a store action layer, document BOTH layers and call out which path wins for which caller class (hotkey vs direct action vs test).
2. Include a **Silent Guards table** annotated with race-risk. For each silent guard, state whether silence is (a) intentional contract-violation defense, (b) intentional shaping, or (c) a potential race surface requiring mitigation (E2E wait, synchronous seeding). Cross-reference the archetype Scenario-B findings.

### Exhaustive Enumeration over Glob Shorthand

When listing constants / exports in reference docs (mock-data, skills registry, hotkey registry, Zod schemas):

- Prefer **exhaustive name lists** over `*_MATRIX - Pre-built constants` or `etc.` shorthand.
- Glob descriptions enable silent drift (phantom `PIPELINE_MATRIX` survived 8 days because the doc said only "etc.").

### Splits & Pointers

When a doc is split into children, the original MUST become a pointer **within the same session** as the split. Never leave the pre-split body alongside children -- parallel maintenance guarantees drift.

A pointer file contains:

1. A "where content lives now" table mapping topics -> child paths.
2. A list of inbound-link reasons (why the path is kept).
3. NO duplicated content beyond a semantic-shift index that cross-links to the children.

**Drift detection:** During sweeps, any file whose frontmatter `related:` overlaps with a sibling's AND whose headings duplicate the sibling's is a drift candidate -- audit the body, not just the date. If an original and a split-child sibling exist and `|original.last_validated - child.last_validated| > 7 days`, treat as drifted-original candidate.

**Direction is not implied by path depth.** A pointer may be the root file or the subdirectory file; there is no positional convention. Two of the current pointers are root-level (`commands.md` -> `commands/index.md`, `state-transitions.md` -> `wizard/state-transitions.md`) because those pairs were flipped after the split. Always determine direction by **reading both files** — the canonical one holds the body; the pointer holds a redirect table and nothing else. Never infer it from the directory layout, and never carry a prior classification forward without re-reading.

### Pointer Freshness Rule

## Validation Annotation Form (binding)

Every doc carries **at most one** validation annotation, immediately after its frontmatter. It records **scope only** — what this pass checked and what it did not. Nothing else.

```html
<!-- VALIDATED 2026-08-01 · FULL — every claim re-derived from source. -->
```

```html
<!-- VALIDATED 2026-08-01 · PARTIAL
     ✓ §1, §18, directory tree, lib/wizard exports
     ✗ §4-17 — no diff touched them; still on 2026-07-30 basis
-->
```

Binding rules:

1. **Replace, never append.** There is no "prior annotation follows" chain. The previous block is deleted, not nested. An annotation is a statement about the file's _current_ validation state, not a log.
2. **Six lines maximum.**
3. **Scope only.** What was checked, what was not, and the date. **No record of what was corrected or why** — that is what the commit message and `agent-findings/` are for, and both are searchable in ways an HTML comment is not.
4. **A `PARTIAL` annotation must not move `last_validated`.** The staleness dashboard reads frontmatter, so stamping a partially-checked file current reports its unverified sections as freshly checked — destroying the one signal that distinguishes "verified" from "swept past".
5. **If a constraint would be reverted by the next reader because the reasoning is invisible in the result, it belongs in the document body as prose — not in a comment.** A hidden warning protects nothing. This is the only case where "why" survives in the file, and it survives _visibly_.

**Why the cap exists.** These docs are consumed by agents, which read raw markdown — so an HTML comment is invisible to a human reading rendered output and fully visible to the actual reader, who pays context for it. Before this rule, `DOCUMENTATION_MAP.md` carried 45KB of annotation in a 272KB file, most of it a per-pass changelog duplicating information already in git. The scope marker is load-bearing; the history is not.

---

A pointer file contains **no source-derived claims** — only a redirect table. Its `last_validated` therefore records the last time its **redirect targets were confirmed to resolve**, not the last time source was checked. Four consequences, all binding:

1. **A sweep that validates a pointer's targets does NOT re-stamp the pointer.** Re-stamping requires actually opening the pointer and confirming its redirect table resolves. An agent that made no judgement on a file must not date it as though it had — a date is a claim about work performed.
2. **Pointers are measured against a link-integrity threshold (30 days)**, not against the content threshold of their targets.
3. **A pointer is `OK` while its targets exist and its redirect table resolves**, regardless of how much newer those targets are. A pointer lagging its targets is the _expected_ steady state, not drift.
4. **Un-restamped pointers MUST NOT be churned to the current date** by a sweep that made no content judgement on them. Repeatedly bumping pointer dates to match a sweep destroys the only signal that distinguishes "verified" from "swept past".

Record a pointer's status in `DOCUMENTATION_MAP.md` as `OK (pointer)` with its own date. Do not treat a date gap between a pointer and its target as an Invariant 3 violation.

### Map Self-Consistency Audit

Every 10th iteration (or when visible drift appears), audit `DOCUMENTATION_MAP.md` against itself:

1. **Count invariants:** `Total Areas` header == count of Reference-table rows. `Documented` == `Total Areas`.
2. **Row uniqueness:** No file appears in more than one staleness-dashboard row.
3. **Cross-surface sync:** For each tracked doc, `Days Stale` in the dashboard must match `Last Validated` in the Reference table (same date basis, +/-0), and **both must match the file's own frontmatter `last_validated` on disk**. Disk is authoritative; the map is derived. Pointer files are exempt from the pointer-vs-target date gap (see Pointer Freshness Rule) but not from disk-vs-map agreement on their own date.
4. **Disk vs map:** `Glob reference/**/*.md` count equals tracked-row count + untracked-pointer count. **Verify the pointer set by name, not only by arithmetic** — a mis-labelled pointer keeps the total correct while excluding a canonical doc from staleness tracking. This is not hypothetical: `commands/index.md` was listed as a pointer in two consecutive audits while root `commands.md` (the actual pointer) held the tracked row, so the canonical commands reference went untracked and drifted through two releases advertising a flag oclif rejects.
5. **Header dates:** `Last Updated`, `Last Validated`, `Date basis` must not lag the newest row annotation by more than 1 day.

**Re-derive, never carry forward.** Every count and every date in this audit must be recomputed from disk in the session that records it. A number copied from the previous audit is the exact failure the audit exists to catch — the audit's own output is not evidence.

Record the iter number and fixes in the Validation History in the same format as content-validation iters.

---

## Progressive Loading

### The Principle

AI agents have limited context windows. Load documentation progressively -- start with the index, then load specific docs as needed.

### Loading Tiers

| Tier    | What to Load             | When                                                               |
| ------- | ------------------------ | ------------------------------------------------------------------ |
| **1st** | `DOCUMENTATION_MAP.md`   | Always first -- shows what exists and its validation status        |
| **2nd** | Relevant root-level doc  | When working on that area (e.g., `commands.md` for command work)   |
| **3rd** | Relevant feature doc     | When working on that subsystem (e.g., `features/configuration.md`) |
| **4th** | `documentation-bible.md` | Only when creating or updating documentation                       |

### Cross-Reference Instead of Duplicate

If information exists in `.claude/skills/`, reference it -- don't duplicate it.

| Should be in `.ai-docs/`   | Should be in `.claude/skills/`        |
| -------------------------- | ------------------------------------- |
| File locations and paths   | Coding patterns and conventions       |
| State shape and actions    | Best practices (React, Zustand, etc.) |
| Data flow through codebase | Anti-patterns to avoid                |
| Component relationships    | Testing patterns                      |

---

## Creating New Documentation

### When to Create Documentation

- New feature or subsystem added to the codebase
- Existing feature significantly restructured
- Validation audit reveals undocumented area

### When NOT to Create Documentation

- Information is derivable from reading the code directly
- Information duplicates what's in `.claude/skills/`
- Information is general knowledge (how TypeScript works, how Zustand works)
- The area is small enough that a comment in CLAUDE.md suffices

### Template: New Feature Doc

For a new feature doc in `.ai-docs/features/`:

```markdown
# [Feature Name]

**Last Updated:** [YYYY-MM-DD]

## Overview

**Purpose:** [One sentence]
**Entry Point:** `src/cli/[path]`
**Key Files:** [count]

## File Structure

| File                    | Purpose     | Line Range     |
| ----------------------- | ----------- | -------------- |
| `src/cli/lib/[file].ts` | Description | Relevant lines |

## Data Flow

1. **Step 1** -- `file.ts` does X
2. **Step 2** -- `other-file.ts` does Y

## Key Types

| Type       | File            | Line | Purpose     |
| ---------- | --------------- | ---- | ----------- |
| `TypeName` | `types/file.ts` | :XX  | Description |

## Key Functions

| Function       | File          | Line | Signature                     |
| -------------- | ------------- | ---- | ----------------------------- |
| `functionName` | `lib/file.ts` | :XX  | `(param: Type) => ReturnType` |
```

### Template: New Reference Doc

For a new root-level reference doc in `.ai-docs/`:

```markdown
# [Area Name]

**Last Updated:** [YYYY-MM-DD]

## Overview

[Brief description of what this documents]

## [Main Section]

| Item   | Location       | Purpose     |
| ------ | -------------- | ----------- |
| `item` | `src/cli/path` | Description |

## [Additional Sections as needed]
```

### After Creating a New Doc

1. Add an entry to `DOCUMENTATION_MAP.md` with status `[DONE]` and current date
2. Update the Coverage Metrics section if source file count changed
3. Set a validation schedule (7 days for volatile, 14-30 days for stable)

---

## Quality Standards

### What Makes Good AI Documentation

- **Specific** -- every claim has a file path and line reference
- **Verifiable** -- every claim can be checked against source code
- **Structured** -- tables and code blocks, not prose
- **Current** -- validation dates are recent, line numbers match source
- **Minimal** -- documents WHERE things are and WHAT they do, not WHY or HOW in general

### What to Avoid

| Anti-Pattern       | Example                                           | Fix                                                                                         |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Vague claims       | "The codebase uses Zustand"                       | "Wizard state: `src/cli/stores/wizard-store.ts`, accessed via `useWizardStore()` selectors" |
| Tutorial content   | "Zustand is a lightweight state library..."       | Remove -- agents already know what Zustand is                                               |
| Missing paths      | "Exit codes are defined as constants"             | "`EXIT_CODES` in `src/cli/lib/exit-codes.ts`"                                               |
| Invented examples  | Code not from actual source                       | Use actual code with file:line references                                                   |
| General knowledge  | "oclif is a framework for building CLIs..."       | Document THIS project's oclif patterns only                                                 |
| Duplicating skills | Repeating Zustand patterns from `.claude/skills/` | Cross-reference: "See skill: web-state-zustand"                                             |

### Self-Correction Triggers

If you notice yourself doing any of these, stop and correct:

| Trigger                                              | Correction                                             |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Documenting without reading code first               | Stop. Read the actual source files.                    |
| Using generic descriptions instead of file paths     | Stop. Replace with specific paths and line numbers.    |
| Describing patterns based on assumptions             | Stop. Verify with Grep/Glob/Read.                      |
| Writing tutorial-style content                       | Stop. Focus on WHERE things are and WHAT they do.      |
| Duplicating content from `.claude/skills/`           | Stop. Add a cross-reference instead.                   |
| Reporting success without re-reading the file        | Stop. Use Read tool to confirm changes were written.   |
| Documenting store methods without reading the source | Stop. Read actual source to get accurate signatures.   |
| Skipping validation date updates                     | Stop. Update "Last Validated" in DOCUMENTATION_MAP.md. |

---

## Critical Reminders

**(You MUST read actual code files before documenting -- never document based on assumptions)**

**(You MUST verify every file path and line number against actual source code)**

**(You MUST re-read files after editing to verify changes were written)**

**(You MUST update DOCUMENTATION_MAP.md when creating or modifying docs)**

**(You MUST NOT duplicate HOW patterns from .claude/skills/ -- cross-reference instead)**

**(You MUST load DOCUMENTATION_MAP.md first, not this file, unless you are updating documentation)**

---

## Findings Impact Report Regeneration

`reference/findings-impact-report.md` is append-only between full regenerations.

**Append flow:**

1. Each batch of new findings gets a dated H3 under "Incremental Updates" with: (a) finding -> impacts table, (b) actions list, (c) any new systemic patterns.
2. The original primary tables (root cause, severity, per-doc impact, per-source-file churn, systemic patterns, open vs closed) are NOT mutated by appends.

**Full regeneration trigger:**

A full regeneration is required when ANY of the following hold:

- **More than 10 new findings accumulate in the Incremental Updates section.**
- The oldest un-aggregated finding is more than 30 days old.
- A major release bundle ships (promote the bundle's findings into primary tables).

**Regeneration procedure:**

1. Enumerate every finding under `.ai-docs/agent-findings/*.md` that falls in the target window.
2. For each finding, extract: date, root cause, severity, category, domain, affected files, proposed standard.
3. Rebuild primary tables from scratch: root-cause/severity/category/domain summaries, per-reference-doc impact, per-source-file churn, per-test-area churn.
4. Consolidate systemic patterns (merge duplicate classes; rename A, B, C... rather than re-using 1, 2, 3 across regenerations).
5. Deduplicate proposed standards into a single numbered list.
6. Add a timeline rollup by date.
7. Mark each finding CLOSED (shipped fix or codified rule) or OPEN (discovery / deferred followup).
8. **Reset the Incremental Updates section to empty.**
9. Bump `last_validated` and update `DOCUMENTATION_MAP.md` with a regeneration note.

**Cadence:** At minimum one full regeneration per major release cluster; additionally whenever the >10-entry threshold is hit.

---

## Agent Findings Frontmatter

Every file in `.ai-docs/agent-findings/*.md` (other than `README.md` and `TEMPLATE.md`) MUST:

1. **Open with a YAML frontmatter block matching `TEMPLATE.md`.** Files without frontmatter will not be processed by convention-keeper or codex-keeper sweeps.
2. **Use a `root_cause` value from the allowed enum** (current: `missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred`). When an authentic root cause does not fit, widen the enum in `TEMPLATE.md` rather than inventing an ad-hoc value.
3. **Cross-link related findings** via first-class keys `supersedes:` and `superseded_by:` when a discovery finding is later replaced by a fix finding covering the same files and root cause.

Cross-cutting audit sweeps (D-168-style, multi-file meta-reports) live in `.ai-docs/agent-findings/audits/`, not the main findings directory -- they use a different schema.

A pre-processing pass by convention-keeper / codex-keeper scans for **six** defect classes:

| #   | Defect                                                            | Detection                                                                          |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| a   | File without frontmatter                                          | No leading `---` block                                                             |
| b   | `root_cause:` outside the enum                                    | `grep -h '^root_cause:'` vs the enum in `TEMPLATE.md`                              |
| c   | Duplicate `affected_files + root_cause + date` tuple              | Compare tuples across files                                                        |
| d   | **`type:` outside the `TEMPLATE.md` enum**                        | `grep -h '^type:'`; note `enforcement-gap` is a `root_cause` value, never a `type` |
| e   | **`superseded_by:` / `supersedes:` without `status: superseded`** | Cross-check the pair on each file                                                  |
| f   | **Missing `status:`**                                             | `grep -L '^status:'`                                                               |

Classes (d), (e) and (f) were added 2026-07-30. They are the three that actually drifted, and the original three-check list covered none of them. `status:` is a **required** field per `TEMPLATE.md`; the "defaults to `open`" convention in `README.md` describes how to _read_ legacy files, not a licence to omit it.

**Rollups must declare inference.** Any report quoting a status distribution MUST state how many files had no `status:` and were inferred. Do not restate the figure here — per "A Count Lives in Exactly One Document" it is owned by `reference/findings-impact-report.md`, which re-derives it from disk at every pass. This paragraph previously carried "39 of 125", which was stale in both the numerator and the denominator by the time anyone read it, and is precisely the drift the ownership rule exists to stop.

The rule stands on its own merits, and the worked example is now a closed one. The 2026-07-30 status-backfill pass eliminated the gap entirely — every finding on disk declares a `status:`, so current rollups declare zero inference. It also showed why the requirement matters more than it looks: reading an absent `status:` as `open` had mis-classified **30 of the 36** status-less files, most of them `partial` and nine of them already `resolved`. An undeclared inference does not merely blur a rollup, it invents work that was already done.

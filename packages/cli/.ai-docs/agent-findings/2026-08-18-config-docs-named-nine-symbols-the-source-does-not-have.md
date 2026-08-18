---
type: convention-drift
severity: high
affected_files:
  - .ai-docs/reference/config/config-writer.md
  - .ai-docs/reference/config/config-merger.md
  - .ai-docs/reference/config/scope-split.md
  - .ai-docs/reference/config/configuration.md
  - .ai-docs/reference/features/configuration.md
  - .ai-docs/reference/features/compilation-pipeline.md
  - .ai-docs/reference/features/code-generation.md
  - src/cli/lib/configuration/config-generator.ts
  - scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The documentation half has landed — every false claim below is corrected on the seven pages,
  and six membership rows are registered in scripts/check-enumeration-drift.ts. Two code-side
  items are NOT fixed and are the reason this is partial. First, the doc comment on
  splitConfigByScope in src/cli/lib/configuration/config-generator.ts still states that the
  project partition's selectedDomains key "is cleared rather than duplicated", which the body
  does not do; either the comment or the body needs an owner ruling, and a sub-agent may not
  pick. Second, four neighbouring enumerations in this area cannot be registered at all because
  of shapes the drift checker refuses by design — listed under "What Cannot Be Bound" below.
---

## What Was Wrong

A full re-derivation of the configuration and code-generation pages from source, on the operating
assumption that every claim was wrong until re-derived. It was the right assumption. **Nine symbol
names on these pages do not exist in the tree**, and several of the surviving claims described the
opposite of what the code does.

### Symbols named by the documentation that the source does not have

| Named as                               | Named in                                              | What the source has                                                                       |
| -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `collectCustomDomains`                 | `config/config-writer.md` (keyword + table + section) | `isCustomDomain(domain, declaredDomains)`                                                 |
| `customSkillSet`                       | `config/config-writer.md`                             | the predicate `isCustomSkill(id, matrix)`                                                 |
| `customAgentSet`                       | `config/config-writer.md`                             | the predicate `isCustomAgent(name, declared, flaggedCustom)`                              |
| `customCategorySet`                    | `config/config-writer.md`                             | the predicate `isUndeclaredCategory(category, matrix)`                                    |
| `marketplaceDomains`                   | `config/config-writer.md`                             | nothing — the subtraction it belonged to is deleted                                       |
| `derivePluginRef`                      | `features/compilation-pipeline.md`, **four** places   | `pluginRefFor(skill): { pluginRef?: PluginSkillRef }` (a spreadable partial, not the ref) |
| `ProjectConfig.source`                 | `features/configuration.md`, `config-merger.md`       | `ProjectConfig.marketplace` — and `source` is a REFUSED key                               |
| `SkillConfig.source`                   | `features/configuration.md`                           | `SkillConfig.origin` — likewise refused by name                                           |
| `ConfigWriteResult.propagatedProjects` | `features/compilation-pipeline.md`                    | `ConfigWriteResult.propagation: GateReport`                                               |

The first five were reported on 2026-08-17 by
`2026-08-17-two-branches-of-one-writer-answered-the-custom-question-differently.md`, whose Proposed
Standard says in as many words that this document "should note that `collectCustomDomains` is gone".
It was not done, and nothing connected the finding to the page. That is the enforcement gap: a
finding is a note to a future reader, not a check.

`ProjectConfig.source` and `SkillConfig.source` are the sharper case, because the loader _refuses_
them. `RENAMED_CONFIG_FIELDS = { source: "marketplace" }` and
`RENAMED_SKILL_ENTRY_FIELDS = { source: "origin" }` in `lib/schemas.ts` sit behind a
`superRefine` that fails the parse and prints the rename. So a reader who wrote a config from the
documented shape got a hard error naming the doc's own field as obsolete.

### Claims that inverted what the code does

- **`splitConfigByScope` does NOT clear `selectedDomains` on the project half.** `scope-split.md`'s
  scalar table said `undefined (project inherits at runtime)`. The project literal is
  `{ ...config, name, agents, skills, stack }` — it overrides four keys, and the spread's
  `selectedDomains` survives. The global literal's
  `...(config.selectedDomains !== undefined && { selectedDomains })` re-sets a key the spread
  already placed and is a no-op in every branch. **The function's own doc comment says the same
  false thing**, which is presumably where the page got it; the code-side half is left open above.
  It has never been observable in an emitted config because both project writers recompute the
  field — `partitionInlinedConfigEntries` as a deduplicated global ∪ project union,
  `generateProjectConfigWithGlobalImport` as a spread of the same two — so the duplication is
  absorbed downstream.
- **`mergeConfigs` treats `marketplace` as fill-only, not "existing wins".** `config-merger.md`
  listed it among five fields carried forward unconditionally and then described the fill-only rule
  against the non-existent `source`. The guard is
  `if (existingConfig.marketplace && !newConfig.marketplace)`. Getting this backwards means
  believing `init --marketplace <ref>` cannot repoint an existing install, when repointing is
  exactly what that guard is for. `marketplaceName` — which IS unconditional — was absent from the
  document entirely.
- **`recompilePropagatedProjectAgents` is not called by `init` or `edit`.**
  `compilation-pipeline.md` said it was, in two places, and its flow diagram drew the loop under the
  four commands. Its one production caller is `recompilePropagated` in
  `src/cli/lib/config-gate/recompile.ts`; the gate runs it inside the write and the commands render
  the resulting `GateReport.recompile`. `config-writer.md` documents the current contract correctly
  and says the old one was the defect class — the two pages disagreed about the same call.
- **The flag is `--marketplace` and the variable is `CC_MARKETPLACE`.** `features/configuration.md`
  documented the resolution precedence as `--source` / `CC_SOURCE` / the `source` config field —
  three names, none of which exists. `SOURCE_ENV_VAR` kept its identifier; its value did not.

### Functionality no page documented at all

- **`resolveEffectiveGlobalConfig` picks between TWO resolutions**, and only one of them is
  `mergeGlobalConfigs`. Under `authoritativeScope: "all"` it takes `matchGlobalToSession`, which
  runs `mergeConfigs(globalSplit, existing, { authoritativeScope: "all" })` and therefore REMOVES
  global entries the session left out. This is the one path on which a project-context write deletes
  global state, and no page named it — `config-merger.md` said `mergeGlobalConfigs` was invoked
  "only from `writeScopedFromWizard`'s project branch". `addSessionToGlobal`'s `hasGlobalItems`
  short-circuit, and its deliberate absence from the `"all"` path, were likewise undocumented.
- **`ConfigSchemaError`, `ConfigDefaultExportError`, and `loadSourceConfig`'s selective re-raise.**
  Neither error class appeared anywhere under `reference/`. `loadSourceConfig`'s catch re-raises
  both and returns `null` only for a file that could not be evaluated — the opposite of the
  "swallows every failure" shape a reader would assume from a bare `catch`. The comment in
  `configuration/config.ts` explains why: `resolveSource` reads the return value alone, so a
  swallowed refusal walks past that rung and installs from a marketplace nobody named.
- **`existingConfigForMerge`.** `mergeWithExistingConfig` does not hand the loaded config to
  `mergeConfigs` verbatim: when the load came from `loadProjectConfig`'s home fallback it
  substitutes the incoming name first, so the global config's `name` (`"global"`) is not stamped
  onto a project's first-written file. The home-fallback load was documented; the name protection
  was not.
- **`WizardWriteArgs` has seven fields.** `config-writer.md` gave the signature as "the same six
  inputs", omitting `authoritativeScope` — the field that selects between the two resolutions above.
- **`AgentScopeConfig.model` / `.effort`, and `CompileAgentConfig.model` / `.effort`.** Both type
  blocks were documented as three-field shapes. `buildCompileAgents` builds a `tuning` object from
  the agent's own overrides _before_ the skill work and returns it for a stack-less agent, so
  "a missing stack yields `{}`" was wrong too.
- **Six `ProjectConfig` fields are not declared by `projectConfigLoaderSchema`.** `branding`,
  `skillsDir`, `agentsDir`, `stacksFile`, `categoriesFile` and `rulesFile` round-trip as
  `.passthrough()` data, ordered by `canonicalizeFieldOrder`'s tail. Nothing said so.
- **`assembleConfigTypesSource` emits six aliases, not four.** `SelectedAgentName` and
  `ProjectAgentName` fall back to the alias above them rather than to `never`, which is why the
  blank global pair emits `projectAgentName: "SelectedAgentName"` beside four `never`s.

### Counts that had drifted

| Claim                                                     | Was | Is  |
| --------------------------------------------------------- | --- | --- |
| `scripts/generate-source-types.test.ts`                   | 34  | 35  |
| `scripts/generate-matrix-package.test.ts`                 | 14  | 20  |
| `src/cli/lib/__tests__/config-gate-enforcement.test.ts`   | 23  | 24  |
| `config-types-writer.ts` exported functions (both copies) | 5   | 8   |
| `scope-predicates.ts` exported functions                  | 7   | 8   |
| `propagate.ts` exported functions                         | 12* | 11  |

\* and the twelfth was `registerProjectPath`, which is module-private.

## Fix Applied

Every row above is corrected on the seven pages, with the correction stated rather than softened —
each names what the source does and, where a reader would otherwise re-derive the old claim, why the
old one looked right.

**Six membership rows registered** in `scripts/check-enumeration-drift.ts`, binding four config
modules' export lists to the tables that claim to enumerate them:

| Source module            | Bound to                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `config-writer.ts`       | `config/config-writer.md` **and** `features/configuration.md` |
| `config-types-writer.ts` | `config/config-writer.md` **and** `features/configuration.md` |
| `config-generator.ts`    | `config/scope-split.md` (table added — none existed)          |
| `scope-predicates.ts`    | `features/configuration.md`                                   |

Two of the four are bound in **two** documents apiece, deliberately: the `config/` deep-dive and the
`features/` overview each carry the same table, which is the two-writable-copies condition, and
registering one would let the other be repaired independently. The registry's existing
message-builder pair records the same reasoning.

Failure was proved rather than assumed: renaming `activeAgentNames` to `activeAgentNamesRENAMED` in
the working tree produced

```
DRIFTED  the exported functions of configuration/scope-predicates.ts in reference/features/configuration.md
           namedButAbsent: [activeAgentNames]
           presentButUnnamed: [activeAgentNamesRENAMED]
clean: false
```

and reverting restored `clean: true` with all 32 rows agreeing.

`config/configuration.md` was checked against the same-name-pair suspicion and is a genuine
redirect stub, not a second writable copy. That determination is now recorded on the file, with the
rule that the redirect table is the only content it may hold — so the next pass does not re-litigate
it.

### What Cannot Be Bound

Four enumerations in this area fail the checker's guards by design, and each is a hard failure
rather than a skip — which is correct, and is why they are listed rather than registered:

| Enumeration                                   | Guard it fails                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ProjectConfig` (`types/config.ts`)           | a type alias to an object TYPE LITERAL; `membersOfSymbol` reads object literals, array literals and unions only |
| `CANONICAL_FIELD_ORDER` (`config-writer.ts`)  | `[...] as const satisfies readonly (keyof ProjectConfig)[]` — `unwrap` reads through `as` but not `satisfies`   |
| `EXTRACTED_FIELDS` (`config-writer.ts`)       | `new Set([...])` — a call expression, not a literal                                                             |
| `SCHEMA_ENTRIES` (`generate-json-schemas.ts`) | an array of OBJECT literals; `stringsOf` refuses a member no reader can name                                    |

The `satisfies` case is the one worth widening: it already blocks `SKILL_IDS` and `SKILL_SLUGS` in
`type-system.md`, and now `CANONICAL_FIELD_ORDER` — three lists across two areas, all failing on one
missing line in `unwrap`. `code-generation.md`'s `src/schemas/` file list is a directory listing
rather than a symbol and is out of scope for this mechanism entirely.

## Proposed Standard

1. **`unwrap` in `scripts/check-enumeration-drift.ts` should read through `ts.isSatisfiesExpression`
   as it already reads through `ts.isAsExpression`.** One line, and it converts three currently
   unbindable lists into bindable ones. `as const satisfies` is this codebase's house style for a
   vocabulary array, so the shapes the checker cannot read are precisely the ones most worth
   reading.

2. **`standards/documentation-bible.md` § "A Count Lives in Exactly One Document" should say that a
   finding's Proposed Standard is not a repair.** The `collectCustomDomains` family was reported
   with the document named, and sat for a day because nothing bound the two. The rule the directory
   needs is that a finding proposing a documentation repair either lands that repair in the same
   turn or registers a drift row that will fail until it does.

3. **`standards/documentation-bible.md` should require a renamed field to be recorded at the
   rename, not at the next audit.** `source` → `marketplace` and `source` → `origin` are both
   enforced in `lib/schemas.ts` with a message telling the user the CLI will not fall back — and
   both spellings survived in `reference/` long enough for the documentation to instruct a reader
   into a hard parse error. A rename that ships a refusal has already identified every document
   that needs changing; the grep is the cheap half.

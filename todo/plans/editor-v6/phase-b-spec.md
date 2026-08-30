# Editor v6 — Phase B: the output preview

**Programme:** [`README.md`](./README.md) · **Decisions:** [`decisions.md`](./decisions.md) (§1 is B4's,
§2 is B1–B3's) · **Tracker row:** EDITOR-09 in [`../../editor.md`](../../editor.md).

Owner item 6: _"a new call to action that shows the actual compiled output, with real syntax
highlighting."_

Four items. Each is independently landable and each carries success criteria a test can assert.
Everything below was re-derived against the tree on 2026-08-26; the corrections that re-derivation
produced are in [§0](#0-corrections-to-the-inputs) and they change what gets built.

---

## 0. Corrections to the inputs

**Read this section first.** Five statements in `decisions.md` §2, the programme README's
correction table and the design research did not survive re-derivation. Four of them make the work
smaller; one makes it larger. Where this section and any input disagree, this section wins.

| #   | The input said                                                                                                                                               | The tree says                                                                                                                                                                                                                                                                                                                                                                                                                                             | Consequence                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | "Three writer variants, three byte shapes … a preview must select per root"                                                                                  | **Two are reachable in production.** `generateProjectConfigWithGlobalImport` has exactly one production call site — `writeConfigFile` in `lib/config-gate/propagate.ts`, inside `writeProjectConfigPair` — and it **always** passes `globalConfig`, which routes to the inlined branch. Verify: `grep -rn "isProjectConfig" --include='*.ts' src \| grep -v __tests__` returns one non-test line                                                          | The preview selects between **standalone** (global root) and **inlined-global** (project root). The third variant is dead in production and the preview never draws it            |
| C2  | "The import-from-global form emits an absolute machine-specific path from `getGlobalConfigImportPath()`"                                                     | That function is reachable only through C1's dead branch. The machine-specific path that **does** reach a real file is `computeGlobalTypesImportPath(projectDir)` in `config-types-writer.ts`, and it is **relative** (`path.relative(<project>/.claude-src, $HOME/.claude-src)`), and the branch that uses it runs only when a global `config-types.ts` **already exists on disk**                                                                       | The unknowable value is one import line in the **project `config-types.ts`**, not in `config.ts`. See [§B3.5](#b35-the-five-things-a-preview-gets-wrong) rule 2                   |
| C3  | "Six Liquid templates under `packages/cli/src/agents/`"                                                                                                      | **Seven.** `find src/agents -name '*.liquid' -type f` from `packages/cli` lists `_templates/agent.liquid` plus six under `_templates/methodologies/`. The markdown count re-derives clean: `find src/agents -name '*.md' -type f \| wc -l`                                                                                                                                                                                                                | B2 vendors whatever the `find` returns; no count is written into the generator                                                                                                    |
| C4  | The design draws `config.ts` as `agents: { "web-developer": { model, effort, skills: {…} } }` and `skills: { react: { source: "plugin:agents-inc/react" } }` | **Both are arrays of records, and the field names differ.** `agents: AgentScopeConfig[]` where an entry is `{ name, scope, model?, effort?, excluded? }`; `skills: SkillConfig[]` where an entry is `{ id, scope, origin, excluded? }` and `origin` is `"eject"` or a **marketplace name** (`"agents-inc"`), never a `plugin:` specifier. The per-agent skill map is `stack`, a separate top-level field. Ground truth: `head -6 ~/.claude-src/config.ts` | The design's two `config.ts` templates are discarded wholesale. The renderer produces the bytes; there is no template to transcribe                                               |
| C5  | The design and the README both put the generated files under `~/.claude/` and `./.claude/`                                                                   | **A root is two directories.** The config pair is `<base>/.claude-src/config.ts` and `<base>/.claude-src/config-types.ts` (`CLAUDE_SRC_DIR`); agents are `<base>/.claude/agents/<AgentName>.md` and ejected skills `<base>/.claude/skills/<id>/` (`resolveInstallPaths` in `lib/installation/install-base-dir.ts`)                                                                                                                                        | The tree's root node is the **base** (`~/`, `./`), with `.claude-src/` and `.claude/` as its two children. "Two roots, one tree, no tab bar" survives; the level below it changes |

Two further design-vs-tree divergences, both load-bearing for B3 and both settled here:

- **A plugin skill has no path under either root.** `installPluginSkills` shells out to
  `claude plugin install <path> --scope <scope>` (`utils/exec.ts`); the destination belongs to Claude
  Code. Drawing `~/.claude/skills/<id>` for a plugin skill names a directory that will not exist,
  which `packages/cli/CLAUDE.md` forbids by name ("a user must be able to copy any line out of such a
  block and `cd` into it"). Resolution in [§B3.2](#b32-the-tree).
- **Ejected skill contents are copied, not generated.** `copySkillsToLocalFlattened` is a directory
  copy. The design's `SKILL.md` and `reference.md` templates are invented bytes. The preview must not
  show them. Resolution in [§B3.3](#b33-the-content-pane).

The four corrections the programme README's table already ruled on (`config-types.ts` not
`config.d.ts`; `AgentName` not `AgentId`; `agents: []` not `agents: {}`; an empty `stack` omitted
rather than emitted) all re-derived clean and are folded into the sections below. **They are
satisfied for free** once the renderer is shared: they are properties of `generateConfigSource` and
`assembleConfigTypesSource`, not rules a second implementation has to remember.

---

## 1. Why this phase exists, in one paragraph

The prototype's preview is a hand-written reconstruction of what the installer emits, and thirteen of
its lines are measurably wrong about it. The design file states the constraint itself: _"the moment
someone diffs it against reality and it is off, they stop trusting the configurator."_ A preview is
worth building only if it is produced by the same code that produces the real thing. That is
`decisions.md` §2, already ruled, and this phase is its implementation.

---

## 2. Scope fence

### In Phase B

- A new workspace package holding the pure renderers, called by **both** the CLI's write path and the
  editor's preview.
- A generator that vendors the agent template corpus into that package as string data, with a drift
  gate.
- A read-only preview dialog in the editor showing what an install writes, per root.
- Client-side syntax highlighting via Shiki, lazy, from a theme shared with the docs site.

### Explicitly NOT in Phase B

| Not built                                                            | Why                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetching an ejected skill's real bytes from a marketplace            | A network call, a cache, an invalidation story and a third-party-trust surface. The preview names the source coordinate instead. `SkillContentsDialog` already exists for reading a skill's bytes and is the place to extend later |
| Highlighting third-party bytes                                       | `skill-contents-dialog.tsx`'s rendering-safety decision — plain text, no renderer, no sanitiser — is shipped and stays. External skills' files render as plain text in the preview too                                             |
| Any write, download, copy-to-clipboard or "install from here" action | The footer is a stat line and Close, matching the Install dialog's rule that installing is a CLI command                                                                                                                           |
| A diff against an installation already on disk                       | The preview cannot see disk. See [§B3.5](#b35-the-five-things-a-preview-gets-wrong) rule 4                                                                                                                                         |
| A shareable permalink to a preview                                   | Needs the server-rendered variant `decisions.md` §1 parks                                                                                                                                                                          |
| The docked composer, and anything with a model behind it             | Phases C and D                                                                                                                                                                                                                     |
| Phase A's chrome and roster work                                     | Phase A. **B3 depends on A0** — see [§5](#5-sequencing-and-lane-ownership)                                                                                                                                                         |
| A server endpoint that renders the preview                           | `decisions.md` §2 rules the extraction a prerequisite for it, not an alternative. Once the package exists the endpoint is a later, small change                                                                                    |
| Fixing the blank-emitter key-order defect                            | A real CLI defect found on the way past. Filed to `todo/cli.md`; not this programme's subject                                                                                                                                      |

---

## B1 — Extract a shared pure renderer into a new workspace package

### B1.1 The package, and its name

**`packages/compile`, package name `@workspace/compile`.**

Justification against the monorepo's own naming (`README.md`, and `ls packages/`): every private
workspace is `@workspace/<directory>` and every directory is a bare noun naming what it holds —
`matrix`, `ui`, `api-mocks`, `eslint-config`. `compile` is this repository's own word for turning a
configuration into files: the `compile` command, `compileAgentForPlugin`, `recompileAgents`,
`compile-agents.ts`, "compiled agents" throughout `.ai-docs`. A package named for the domain word the
codebase already uses is the least surprising name available, and it sits beside `matrix` as a
second bare-noun domain package.

**It must not go in `packages/matrix`, and this is measured rather than argued.** `CHUNK_GROUPS` in
`apps/editor/vite.config.ts` declares:

```js
{ name: "catalog", test: /packages[\\/]matrix[\\/]/, priority: 10 }
```

That group is on the first-paint path. The corpus B2 vendors is the largest single artefact in this
phase, and `FIRST_PAINT_BUDGET_BYTES` in `apps/editor/scripts/first-paint-budget.ts` leaves single-digit
percentage headroom over the measurement recorded in that file's own docblock. Putting the corpus
behind a rule that matches `packages/matrix` fails the build on the first run. Verify the rule still
reads that way before starting: `grep -n 'catalog' -A3 apps/editor/vite.config.ts`.

**Scaffold it from `packages/matrix`, file for file** — it is the closest sibling and it already
passes every cross-workspace gate:

| File               | Copy from                          | Change                                                                       |
| ------------------ | ---------------------------------- | ---------------------------------------------------------------------------- |
| `package.json`     | `packages/matrix/package.json`     | name, the `exports` map below, deps `liquidjs` + `@workspace/matrix` + `zod` |
| `tsconfig.json`    | `packages/matrix/tsconfig.json`    | the two `paths` entries repointed                                            |
| `vitest.config.ts` | `packages/matrix/vitest.config.ts` | verbatim (`export { nodeConfig as default }`)                                |
| `eslint.config.js` | `packages/matrix/eslint.config.js` | verbatim, including `globalIgnores(["src/generated"])`                       |

`workspaces` in the root `package.json` is `["apps/*", "packages/*"]`, so the package is picked up
with no root edit.

### B1.2 The exports map, and the one rule it enforces

```jsonc
"exports": {
  ".":                     "./src/index.ts",
  "./config-source":       "./src/config-source.ts",
  "./config-types-source": "./src/config-types-source.ts",
  "./agent-source":        "./src/agent-source.ts",
  "./engine":              "./src/engine.ts",
  "./seed-to-config":      "./src/seed-to-config.ts",
  "./corpus":              "./src/generated/corpus.ts",
  "./preview":             "./src/preview.ts"
}
```

**`src/index.ts` must not re-export `./corpus` or `./preview`, transitively or otherwise.** The
corpus is the phase's heaviest artefact and `./preview` is the only module that pulls both it and
`liquidjs`. A barrel that reaches either drags them onto whatever imports the barrel. This is a
success criterion with a test, not a note — see [§B1.7](#b17-success-criteria).

### B1.3 What moves, symbol by symbol

Everything in this table was opened and read on 2026-08-26. Re-derive each before moving it.

**Already pure — moves unchanged except where the third column says otherwise.**

| Symbol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | From                                               | Change on the way                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `generateConfigTypesSource`, `generateProjectConfigTypesSource`, `assembleConfigTypesSource`, `generateBlankGlobalConfigTypesSource`, `formatUnion`, `formatMaybeSectionedUnion`, `formatSectionedUnion`, `generateStackAgentConfig`, `formatSkillUnion`, `formatExtendedUnion`, `formatLiteralUnion`, `EMPTY_UNION_TYPE`, `MULTI_LINE_THRESHOLD`, `STACK_AGENT_CONFIG_INLINE_THRESHOLD`, `STACK_AGENT_CONFIG_LOOSE_LINE`, `PROJECT_CONFIG_TYPES_BEFORE`, `PROJECT_CONFIG_INTERFACE_AFTER`, `deriveCategories`, `deriveDomains` | `src/cli/lib/configuration/config-types-writer.ts` | none — `generateConfigTypesSource` already takes `matrix` as a parameter and is the shape everything else is being brought to |
| `buildAgentTemplateContext`, `sanitizeCompiledAgentData`, `sanitizeLiquidSyntax`, `pluginRefFor`                                                                                                                                                                                                                                                                                                                                                                                                                                | `src/cli/lib/compiler.ts`                          | drop the `verbose(...)` call from `buildAgentTemplateContext`                                                                 |
| `provenanceMarker`, `hasProvenanceMarker`, `stampProvenanceMarker`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `src/cli/lib/agents/agent-provenance.ts`           | none. `cliVersion` and `readOwnVersion` stay behind                                                                           |
| `bytewise`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `src/cli/utils/string.ts`                          | none — dependency-free leaf, and `generateStackAgentConfig` needs it                                                          |

**Pure except one ambient read.**

| Symbol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | From                                            | Change on the way                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateConfigSource` and its private helpers — `cleanForEmission`, `canonicalizeFieldOrder`, `canonicalizeStackOrder`, `compareNamesInCodeUnitOrder`, `withKeysOrderedBy`, `compactAssignment`, `carriesFlags`, `compactCategoryAssignments`, `compactCategories`, `compactStackAssignments`, `renderEntryLine`, `renderScalarField`, `buildTypeImports`, `mergeInlinedScalarFields`, `resolveProjectName`, `partitionInlinedConfigEntries`, `generateStandaloneConfig`, `generateProjectConfigWithInlinedGlobal`, `CANONICAL_FIELD_ORDER`, `EXTRACTED_FIELDS` | `src/cli/lib/configuration/config-writer.ts`    | **the matrix becomes a parameter.** `canonicalizeStackOrder` reaches `byCategoryDeclarationOrder()` and `isExclusiveCategory` reaches the mutable `matrix` export of `lib/matrix/matrix-provider.ts`, which `initializeMatrix()` replaces after the local-skill merge. New signature: `generateConfigSource(config, matrix, options?)`. `generateConfigTypesSource` already does this and is the shape to copy |
| `seedToWizardResult`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `src/cli/lib/seed/seed-to-wizard.ts`            | already takes `matrix`; its `getCategoryDomain` and `validateSelection` reads must take it too                                                                                                                                                                                                                                                                                                                 |
| `generateProjectConfigFromSkills`, `splitConfigByScope`, `buildStackProperty`, `isScopePairCompatible`, `toStackAssignment` and their private helpers                                                                                                                                                                                                                                                                                                                                                                                                            | `src/cli/lib/configuration/config-generator.ts` | same matrix parameterisation; drop `verbose`/`warn`                                                                                                                                                                                                                                                                                                                                                            |

**Stays in the CLI, and each one is a seam.**

| Impure thing                                                                                                                              | Where it stays                                       | The seam                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getGlobalConfigImportPath()` (`os.homedir()`)                                                                                            | `config-writer.ts`                                   | **Do not move it.** Per C1 its only branch is dead in production. Delete-or-keep is a separate decision; this phase leaves it alone and the package never imports it                                                                                                                                                                                                                                                                                    |
| `readAgentFiles` (five `readFile`s per agent)                                                                                             | `compiler.ts`                                        | The package's `renderAgent` takes `AgentFiles` as data. The CLI reads them off disk; the editor reads them out of the corpus                                                                                                                                                                                                                                                                                                                            |
| `createLiquidEngine`'s layered `root:` array                                                                                              | `compiler.ts`                                        | The package exports `createEngineFromTemplates(templates: Record<string, string>): Liquid`, implementing liquidjs's `FS` interface (`node_modules/liquidjs/dist/fs/fs.d.ts`) over a plain record. **`MapFS` exists at `dist/fs/map-fs.d.ts` but is not re-exported from the package root**, so this is our own ~15 lines. The CLI keeps its fs-rooted engine so project template overrides keep working. Both hand a `Liquid` to the same `renderAgent` |
| `cliVersion()` (reads its own `package.json`)                                                                                             | `agent-provenance.ts`                                | `renderAgent(engine, data, version)` takes the version. What the editor passes is [§B2.3](#b23-the-version-the-corpus-was-generated-from)                                                                                                                                                                                                                                                                                                               |
| `getGlobalConfigTypesPath`, `computeGlobalTypesImportPath`, `buildConfigTypesBackgroundData`, `regenerateConfigTypes`, `writeConfigTypes` | a new `src/cli/lib/configuration/config-types-io.ts` | These four are the whole reason `config-types-writer.ts` reaches `fileExists`, `writeFile`, `loadProjectConfigFromDir` and `globalInstallRoot`. Split them out; what remains in `config-types-writer.ts` is a re-export of the package                                                                                                                                                                                                                  |
| `installPluginSkills` / `claudePluginInstall`                                                                                             | `lib/operations/skills/`, `utils/exec.ts`            | Not a renderer at all — it spawns the `claude` binary. There is nothing to lift and the preview can only show the reference                                                                                                                                                                                                                                                                                                                             |

### B1.4 The `consts.ts` split

`src/cli/consts.ts` is the root blocker: it runs `fileURLToPath(import.meta.url)` at module load to
derive `PROJECT_ROOT`, and every renderer reaches it. Split it:

- **New `packages/compile/src/paths.ts`** holds the pure half the renderers need: `CLAUDE_DIR`,
  `CLAUDE_SRC_DIR`, `LOCAL_SKILLS_PATH`, `STANDARD_DIRS`, `STANDARD_FILES`, `EJECT_SOURCE`,
  `DEFAULT_PLUGIN_NAME`, `GLOBAL_CONFIG_NAME`, `LOCAL_PSEUDO_CATEGORY`, `DIRS`.
- **`src/cli/consts.ts` re-exports every one of them** from the package, so **no CLI call site
  moves**. What stays declared there is `CLI_ROOT`, `PROJECT_ROOT`, `globalInstallRoot()` and the
  `node:url` / `node:os` imports they need.

Verify the current membership before moving anything: `grep -n "^export const" src/cli/consts.ts`.

### B1.5 The eslint ban must move with the renderers

`packages/cli/eslint.config.js` declares `CONFIG_WRITER_IMPORTS`, which bans `generateConfigSource`
from `**/config-writer` and `generateConfigTypesSource` / `assembleConfigTypesSource` /
`regenerateConfigTypes` from `**/config-types-writer`, across `src/**/*.{ts,tsx}` with only tests and
`src/cli/lib/config-gate/**` ignored.

**The rule matches on the import specifier. A move changes the specifier and the ban silently stops
firing, with nothing failing to signal it** — `reportUnusedDisableDirectives` cannot see this,
because no disable directive is involved. Repoint the `group` patterns to
`@workspace/compile/config-source` and `@workspace/compile/config-types-source` **in the same
change**, keeping the existing `**/config-writer` entries so a re-export cannot become a bypass.

### B1.6 The drift gate — copy the precedent, do not invent one

`packages/matrix/src/contract/selection-scenarios.ts` opens by recording that two implementations
answered the same questions and did not always agree, that the CLI's answers were ruled
authoritative, and that the fix was a shared read model plus a **data-only scenario module with one
runner per side**. Both runners exist:
`packages/cli/src/cli/lib/matrix/selection-scenarios.contract.test.ts` and
`apps/editor/src/features/configure/lib/derive.contract.test.ts`.

Build the equivalent:

- **`packages/compile/src/contract/emission-scenarios.ts`** — data only, importing neither side. Each
  scenario is `{ id, title, payload: SeedPayload, expected: Record<string, string> }`, where the keys
  are destination paths relative to each root and the values are the exact expected bytes. It must
  include, at minimum, one scenario per row of this table, because each pins a rule a second
  implementation gets wrong:

  | Scenario pins                                        | Why it is in the minimum set                                                                                                                                                      |
  | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | an empty root                                        | `EMPTY_UNION_TYPE`, `agents: []`, and `stack` **omitted** rather than emitted empty                                                                                               |
  | a hyphenated id as an object key                     | every key is quoted unconditionally via `JSON.stringify`; a conditional bare-identifier test diverges on every id                                                                 |
  | a stack with two sub-agents and two categories each  | `compareNamesInCodeUnitOrder` for sub-agent keys, `byCategoryDeclarationOrder()` for category keys — the ordering whose absence swapped two rows of a compiled `web-developer.md` |
  | an exclusive category holding one skill              | `compactCategoryAssignments` unwraps the array; a non-exclusive category at length one does not                                                                                   |
  | a project root with global-scoped items              | the inlined-global form's **different** `export default` ordering (`name, <scalars>, skills, agents, stack, selectedDomains`)                                                     |
  | a compiled agent with both preloaded and lazy skills | `buildAgentTemplateContext` preserves order across the split, so `config.ts`'s stack key order **is** the order of the sub-agent's skill-activation table                         |

- **`packages/compile/src/contract/emission-scenarios.test.ts`** — the package's own runner, asserting
  the package produces `expected` for each scenario.
- **`packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts`** — the CLI's runner, and the one
  that carries the phase. For each scenario: `init --from` the payload into a temp dir, then
  `toStrictEqual` the shared renderer's output against `readCompiledAgents(dir)` plus the two config
  files read back with `loadConfigOrFail`. **Copy `share-round-trip-compiled-bodies.e2e.test.ts`'s two
  guards as well as its comparison**: name the agent roster against a constant rather than counting
  it (a count cannot see a swap), and remember `readCompiledAgents` answers `{}` for an absent
  directory, so two installations that compiled nothing satisfy the comparison for free.

### B1.7 Success criteria

| #   | Criterion                                                                                                                             | How a test asserts it                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The CLI's writers call the package.** `config-writer.ts`, `config-types-writer.ts` and `compiler.ts` hold no copy of a moved symbol | `grep -c "^function canonicalizeStackOrder\|^function generateStandaloneConfig\|^export function buildAgentTemplateContext" src/cli/lib/configuration/config-writer.ts src/cli/lib/compiler.ts` returns 0 for each, and each file imports from `@workspace/compile/*`                                |
| 2   | Every existing CLI suite is green with no assertion weakened                                                                          | `bun run build && npm test` and `bun run test:e2e` in `packages/cli`. **`npm test` does not build** — a stale `dist/` aborts the run with zero tests collected, which reads as a pass if only the exit code is checked                                                                               |
| 3   | The package imports no node builtin                                                                                                   | `grep -rnE "from \"node:\|from \"(fs\|path\|os\|url\|crypto)\"" packages/compile/src --include='*.ts'` returns nothing outside `src/generated/`                                                                                                                                                      |
| 4   | The root barrel does not reach the corpus or liquidjs                                                                                 | a spec in `packages/compile` that imports `../src/index.ts` and asserts the module graph excludes both, or — simpler and sufficient — `grep -rn "corpus\|preview\|liquidjs" packages/compile/src/index.ts` returns nothing                                                                           |
| 5   | The emission contract holds on both sides                                                                                             | `emission-scenarios.test.ts` green in `packages/compile`, `preview-matches-install.e2e.test.ts` green in `packages/cli`                                                                                                                                                                              |
| 6   | The eslint ban still fires                                                                                                            | add a fixture import of `generateConfigSource` from `@workspace/compile/config-source` in a non-gate CLI file and confirm `bun run lint` reports it; then remove the fixture                                                                                                                         |
| 7   | Cross-workspace gates pass                                                                                                            | `bun run deps:check` at the repository root — syncpack plus the three shared-config checkers, one of which will reject a new package whose `tsconfig.json` / `vitest.config.ts` / `eslint.config.js` does not extend the shared config or carry the documented `//no-shared-*` opt-out               |
| 8   | The published CLI still works                                                                                                         | `@workspace/compile` is added to `noExternal` in `packages/cli/tsup.config.ts` beside `@workspace/matrix`, for the reason that file's comment already states, and is a **devDependency** — promoting it to `dependencies` silently externalises it and breaks `init --from` in the published tarball |

---

## B2 — Vendor the agent template corpus as string data

### B2.1 What is vendored

Everything under `packages/cli/src/agents/` that the compile reads. Do not write a count into the
generator or into a test; derive it:

```
cd packages/cli && find src/agents -name '*.md' -type f | wc -l    # the per-agent partials
cd packages/cli && find src/agents -name '*.liquid' -type f        # the templates, root + methodologies
```

Per agent, `readAgentFiles` reads `identity.md`, `playbook.md`, and optionally `output.md` (with a
category-directory fallback), `critical-requirements.md` and `critical-reminders.md`. The generator
must reproduce that read set exactly, **including the fallback**, or an agent whose `output.md` lives
one directory up renders differently in the browser than on disk.

### B2.2 Follow the existing generator, do not invent a shape

`packages/cli/scripts/generate-matrix-package.ts` is the single writer of cross-boundary generated
data, and its shape is the precedent:

- a module that **runs nothing at module scope** and exports `generate({ … })` and `check({ … })`;
- a thin runner, `scripts/run-generate-matrix-package.ts`, owning argv, console output and exit codes;
- `EmittedFile = { path, content }` and `matchesCommitted()` comparing in memory — writing nothing on
  `--check`, and reporting a file it emits that is not committed at all, which `git diff` could not see;
- sorted output (`bytewise`) because the artefact is byte-compared and must not carry the collation of
  whichever machine ran it;
- a header on every emitted file naming the command that rewrites it and the gate that checks it —
  copy the wording already in `packages/matrix/src/vendor/*.ts`;
- a `*.test.ts` beside the generator.

**Write a sibling, `scripts/generate-compile-package.ts` + `scripts/run-generate-compile-package.ts`,
rather than extending the matrix one.** Its runner hardcodes `MATRIX_ROOT`, its docblock names
`packages/matrix` as its subject, and its `--check` error message tells the reader to run
`generate:matrix`. A second target root inside it would make all three wrong for one of the two
packages.

Wire it exactly as its sibling is wired:

| Where                                       | What                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/package.json`                 | `"generate:compile"` and `"generate:compile:check"`, and add `generate:compile` to the `"generate"` chain                                                                                                                                                                                                              |
| `.github/workflows/ci.yml`, `check-web` job | a step beside the existing `bun run generate:matrix:check`, with `working-directory: packages/cli`. It belongs in `check-web` for the same reason its sibling does: the writer is in `packages/cli` but the files it guards belong to the web side, and every input is in this repository so the runner can regenerate |

### B2.3 The version the corpus was generated from

The generator emits one extra export beside the corpus:

```ts
export const CORPUS_CLI_VERSION =
  "<the version in packages/cli/package.json at generation time>"
```

This is what answers gotcha 5. `cliVersion()` reads the CLI's own manifest at runtime and a browser
has no such manifest; a preview that guesses diverges on the first body line of **every** compiled
agent. `CORPUS_CLI_VERSION` lets the editor make a claim that is true rather than a guess: _these are
the bytes `agents-inc v<version>` writes for this configuration._ The footer states the version. A
visitor whose installed CLI is older will get different bytes, and that is a real difference the
preview should surface rather than hide.

It also gives the drift gate a second thing to catch: bump the CLI's version without regenerating and
`generate:compile:check` goes red.

### B2.4 Success criteria

| #   | Criterion                                                | How a test asserts it                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The gate catches drift                                   | `generate-compile-package.test.ts`: emit against a fixture checkout, mutate one partial on disk, assert `check()` reports that file and `clean === false`. Then assert a file the generator emits which is absent from the target counts as drifted                                                                                             |
| 2   | The committed corpus matches its source                  | `bun run generate:compile:check` in `packages/cli` exits 0 on a clean tree, and non-zero after touching any file `find src/agents -name '*.md' -o -name '*.liquid'` lists                                                                                                                                                                       |
| 3   | The corpus is complete                                   | a spec asserting the corpus holds an entry for every agent `AGENT_DEFINITIONS` names, and that each entry carries `identity` and `playbook` — the two `readAgentFiles` reads non-optionally                                                                                                                                                     |
| 4   | **A browser render equals a disk render, byte for byte** | a spec in `packages/compile`: build one agent's `CompiledAgentData` from the corpus, render it through `createEngineFromTemplates(corpusTemplates)`, and `toStrictEqual` it against the same agent rendered by the CLI's `compileAgentForPlugin` through the fs-rooted engine. This is the single assertion that says the vendoring is faithful |
| 5   | The corpus is reachable only through its own subpath     | criterion 4 of [§B1.7](#b17-success-criteria), re-run                                                                                                                                                                                                                                                                                           |
| 6   | CI runs the gate                                         | the new step is present in `.github/workflows/ci.yml` and the job is green                                                                                                                                                                                                                                                                      |

---

## B3 — The preview dialog

### B3.1 The entry point

**Where.** The roster footer in `apps/editor/src/features/configure/components/roster-panel.tsx`.
Note the real footer holds **three** buttons — Save, Share, Install — where the design draws only
Install. The block goes **immediately above Install and below Share**, honouring the design's stated
reason (_"above the Install button reads as a step before it; below reads as an aside. I prefer above
— you preview, then you install"_) within the footer that actually exists.

**What.** A recessed field, not an outline and not a fill. The design records the reason in three
places and it is a page-wide rule: `Install` is the panel's only filled element, and the panel has no
borders to spend. The recess is the segmented-track colour used inverted.

```
rest:   background #eeece4 · glyph #b0762c · label #3d3b33
hover:  background #e7e4d9 · glyph #b0762c (no hover rule) · label #161513
```

Geometry and type, from `.plink`: full width, `box-sizing: border-box`, padding `10px 12px`, margin
below `9px`, gap `7px`, label `600 10px 'IBM Plex Mono'` at `.04em`, uppercase,
`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.

**Copy: `Preview generated code`.** Exactly that, rendered uppercase by the type rule. "Generated" is
load-bearing — it says the files do not exist yet. **No count**, and this is a decision rather than an
omission: the design's README and DECISIONS.md both say "file count right-aligned muted", the shipped
prototype renders no count, and the lab entry that shipped states the omission as the decision ("at
250px the label is all that fits, and the dialog footer already states the file count"). Follow the
prototype and the lab note; the two prose files are stale on that line. The `.ct` CSS rule and the
`outCount` prop are both dead in the source.

**Glyph.** A code-brackets pair at 13px, Lucide geometry, stroke 1.75, `currentColor`:
`M16 18l6-6-6-6` and `M8 6l-6 6 6 6`.

**A `<button>`, not a `<div>`.** The prototype is a `div` with an `onClick`, with no keyboard
affordance, no focus-visible and no pressed state. Use a real button with the package's one focus
ring (`focus-visible:ring-1 focus-visible:ring-ring`, as `DialogHeader`'s close glyph does).

**Depends on A0** for `#eeece4`, `#e7e4d9` and `#3d3b33`, none of which has a token today. Verify:
`grep -ic 'eeece4\|e7e4d9\|3d3b33' packages/ui/src/styles/globals.css`.

**State.** `apps/editor/src/stores/ui-store.ts` — `dialog: "none" | "install" | "add" | "marketplace"`
gains `"output"`. **Not `"preview"`**: `previewSkillId` and `previewSkill()` already exist on the same
store for the skill-contents sheet, and a second `preview` would read as the same thing. And a fifth
`dialog` value rather than a field of its own, because — unlike `previewSkillId`, whose docblock
explains why it stacks over Install — the output preview is one of the mutually exclusive dialogs.

### B3.2 The tree

**Two roots, one tree, no tab bar, no breadcrumb.** This is the load-bearing structural decision and
it survives every correction in §0: scope separates itself, so flipping an agent's scope word in the
roster visibly moves its `.md` row from one root to the other with no extra chrome.

**Per C5, a root is a base directory with two children.** Emission order, per root, global first:

```
~/                                                     (root, no label)
  .claude-src/                                         (dir, no label)
    config.ts                                    new
    config-types.ts                              new
  .claude/                                             (dir, no label)
    agents/                                            (dir, no label)
      web-developer.md                           new
    skills/                                            (dir, no label)
      web-styling-tailwind/                      eject      ← amber
        <no children — see B3.3>
  plugin skills                                        (group, no label, NOT a path)
    web-framework-react                          plugin
<9px spacer>
./                                                     (root, no label)
  …
```

Rules:

- A root is emitted only when it holds at least one agent or skill. A root holding neither is
  **absent**, not empty.
- `.claude-src/` is always present in an emitted root (the config pair is always written).
  `.claude/agents/` and `.claude/skills/` appear only when non-empty. `plugin skills` appears only
  when the root has at least one plugin-origin skill.
- **`plugin skills` is deliberately not a path**, per §0. Plugin scope really is per-root
  (`claude plugin install --scope project|user`), so grouping it under the root is truthful; giving it
  a directory name would not be. This sharpens rather than weakens the design's argument that
  plugin-versus-eject is "the plugin/eject decision made visible" — one lives under a path and the
  other does not.
- Three state labels and no more: `new` (grey), `plugin` (grey), `eject` (**amber**, on the directory
  row only — its children, when there are any, read `new`). Root and directory rows carry no label.
- Indentation is `padding-left: 14 + depth * 13` px, no guide lines, no carets, no collapse. The tree
  is always fully open, matching the skill grid's own rule.
- Every row is clickable, including roots and directories. Selection is a single path string and
  drives three things at once: the row's selected state, the header subtitle, and the content pane.
- **A selection that no longer exists falls back rather than blanking.** The tree is regenerated from
  live state on every render — flipping a scope relocates rows constantly — so a stale `outSel` must
  resolve to the project root's `config.ts`, then the global root's. This is the one prototype
  behaviour most worth copying verbatim.

Visual, from `.otree` / `.otr` / `.otn` / `.otm`:

```css
tree pane:  width 250px; flex:none; overflow-y:auto; overflow-x:hidden;
            scrollbar-gutter:stable; padding:10px 0; border-right:1px solid #ece9e0
row:        display:flex; align-items:baseline; height:19px; padding-right:24px; white-space:nowrap
row hover:  #faf9f5      row selected: #f7eeda, name in #a06a1c
name:       400 9.5px 'IBM Plex Mono' #3d3b33 · dir 500 #161513 · root 600 #161513
            min-width:0; flex:0 1 auto; overflow:hidden; text-overflow:ellipsis
label:      margin-left:auto; padding-left:10px; flex:none; 400 7.5px 'IBM Plex Mono' #c0bcae
            amber variant #a06a1c
spacer:     height 9px, between the two roots
```

`scrollbar-gutter: stable` **plus** `overflow-x: hidden` **plus** the row's `padding-right: 24px` are
one decision in three parts — state labels clearing the gutter — and the design README names it. The
filename ellipsizes; the label never does. The `#ece9e0` divider is a **lighter** hairline than the
`#dcd7c9` used elsewhere, deliberately, so a split inside a dialog reads quieter than the dialog's own
rules; do not substitute one for the other. **Depends on A0** for `#ece9e0` and `#3d3b33`.

**Keyboard.** The prototype has none. Add arrow-key navigation over the flat row list and `Enter` to
select; `Home`/`End` and type-ahead are not required in Phase B.

### B3.3 The content pane

Layout: `flex:1; min-width:0; overflow:auto; padding:14px 20px 18px`. One element per line,
`400 9.5px/1.75 'IBM Plex Mono'`, `white-space: pre-wrap`, `min-height: 17px` so a blank line stays
visible. Long lines wrap rather than scrolling horizontally within a line; the pane itself still
scrolls both ways.

What each node shows:

| Node                                                      | Content                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts`, `config-types.ts`                            | the shared renderer's exact bytes, highlighted as TypeScript                                                                                                                                                                                                                                           |
| `agents/<name>.md`                                        | the shared renderer's exact bytes — the **real** Liquid render, not the design's four-line sketch. Its first body line is the provenance marker. Highlighted as Markdown                                                                                                                               |
| an ejected **catalogue** skill's directory                | **no invented file bodies.** A short note naming the source coordinate and stating that the directory is copied verbatim from the marketplace at install time. The preview does not know its file list without a network call, which is out of scope                                                   |
| an ejected **external** (session-added) skill's directory | its real files, listed as children, because the bytes travel in the payload (`seedExternalSkillSchema.files`) and are already seated in `catalog-store`. Rendered as **plain text**, not highlighted — `skill-contents-dialog.tsx`'s rendering-safety decision applies unchanged to a stranger's bytes |
| a plugin skill                                            | the reference note: the plugin coordinate, that no files are written and the skill resolves from the marketplace at run time, and that switching it to eject writes a copy you own — with `eject` picked out in amber                                                                                  |
| a root or directory row                                   | an empty pane. Acceptable; the subtitle carries the path                                                                                                                                                                                                                                               |

**Do not transcribe the design's `config.ts`, `config.d.ts`, `SKILL.md` or `reference.md` templates.**
Per C4 and §0 they describe a shape the CLI does not emit and bytes it does not write. The two config
files come from the renderer; the two skill files are not generated at all.

### B3.4 The shell, header and footer

Use `@workspace/ui/components/dialog`: `Dialog`, `DialogContent`, `DialogHeader`, `DialogPanes`,
`DialogPane`, `DialogFooter`, `DialogFooterNote`, `DialogClose`. `SkillContentsDialog` is the model —
it already does file-list-plus-contents inside these primitives.

- **Width.** 760px. `DialogContent`'s `wide` is 620px, so pass `className="w-[47.5rem]"`, as
  `skill-contents-dialog.tsx` passes `w-[46rem]` for the same reason.
- **The pane split is the inverse of `DialogPane`'s default.** `DialogPane side="left"` is `flex-1`
  with `border-r`; `side="right"` is a fixed `12.25rem`. The preview wants a **fixed 250px left** and a
  **flexible right**. Resolve it in `packages/ui` — either a third `side` value or a documented
  className contract — rather than fighting it from the app; the divider colour also differs
  (`#ece9e0`, per A0), and a one-off override in the app puts a design-system decision in a feature file.
- **Header.** Title `Output preview`, uppercased by `DialogHeader`'s own type rule. The subtitle slot
  carries `{path} · {marker}`, verbatim, no uppercase, no tracking — `./.claude/agents/web-developer.md · new`.
  Separator is space, U+00B7, space. **No breadcrumb anywhere in the body**: the header changes as you
  click, which is the whole of decision 48b and its stated cost.
- **The marker is binary**: `reference only` for a plugin node, `new` for everything else. `reference
only` appears **only** here and is never a tree label; `new`/`plugin`/`eject` appear only in the tree
  and never here.
- **Footer.** A stat line and a single `Close`. No primary action — installing is a CLI command, the
  same rule the Install dialog follows. Separator `·` between every pair.
- **Escape and a focus trap.** The prototype has neither; Base UI's `Dialog` provides both. Do not
  hand-roll the veil click — the primitive owns it.

**The footer stat line** counts only files that are actually written: the two config files per
emitted root plus one per compiled agent, plus an external ejected skill's real files. Plugin
references, ejected catalogue directories, root nodes and directory nodes are all excluded. Say what
is counted in the spec of the assertion, not in prose in the component.

Beside the stat, the footer carries the honesty line B3.5 requires.

### B3.5 The five things a preview gets wrong

`decisions.md` §2 names five. None is fixed by sharing the renderer. Each is answered here, and **not
one of them is papered over.**

**1 — Writer variants.** Per C1 only two are live. The preview selects by the same rule
`writeScopedFromWizard` uses: the global root renders **standalone**; the project root renders
**inlined-global**, with the global config the preview itself just produced. The inlined form's
different `export default` ordering comes free, because the shared renderer is the CLI's. The one
thing the browser cannot know is whether the visitor will install from `$HOME` — in which case there
is no project root at all and both halves are standalone. The footer states that the project root is
drawn as an install into a project directory.

**2 — The machine-specific path.** Per C2 this is one line, in the project `config-types.ts`, and
which branch produces it depends on whether a global `config-types.ts` exists on disk.

- **If the configuration has no global-scoped item**, the global root is absent, the project
  `config-types.ts` takes the standalone form, and the preview is exactly right.
- **If it does**, the project `config-types.ts` takes the import form and its import specifier is
  `path.relative(<project>/.claude-src, $HOME/.claude-src)`. **Render that one specifier as a named
  placeholder** — visually distinct, in the muted punctuation colour — and say in the footer that the
  path is computed on the machine at install time. **Do not invent a plausible relative path.** The
  placeholder is honest; `../../../.claude-src` is the exact failure the design's constraint names.

**3 — Ambient matrix state.** `canonicalizeStackOrder` and `isExclusiveCategory` read whatever matrix
they are handed. B1 makes that a parameter, so the preview cannot silently pick up a different one —
but a visitor with **locally-authored skills** on their machine has a matrix the browser has never
seen, and category declaration order and exclusive-category unwrapping can both differ for them.
This is **scoped out and stated**: the preview is drawn against the seated catalogue, and the footer
says so. Externally-added skills are covered, because they are in the seated catalogue.

**4 — A preview cannot see what an install would merge.** The real path runs
`resolveEffectiveGlobalConfig`, `reconcileProjectSplitAgainstGlobal`, tombstone masking and
`registerProjectPath` against the config already on disk. None of it is reachable from a browser and
no amount of sharing fixes it. **The preview is therefore scoped to a clean machine, and says so in
the footer.** Three specific consequences the user is told about:

- an existing global installation contributes entries the preview does not show;
- a project entry that collides with a live global one is masked at install time, so it may be shown
  here and absent there;
- the global `config.ts` carries a `projects` tracking array that the preview cannot populate — it is
  the last member of `CANONICAL_FIELD_ORDER` and is dropped from project configs by design.

Word the footer as a claim, not a hedge: **"what installing this configuration on a machine with no
existing agents-inc installation writes."**

**5 — `cliVersion()` in every agent's first body line.** Answered by B2's `CORPUS_CLI_VERSION`. The
marker renders with the version the corpus was generated from and the footer names it. A visitor on
an older CLI genuinely gets different bytes, and surfacing that beats hiding it.

### B3.6 Success criteria

| #   | Criterion                                                                                   | How a test asserts it                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The entry point opens the dialog                                                            | Playwright spec in `apps/editor/e2e/specs/output-preview.spec.ts`, driven through a page object in `e2e/pages/dialogs.ts`, following `skill-contents.spec.ts`                                                                                                                                   |
| 2   | The entry point is keyboard-reachable and its label is exact                                | `getByRole("button", { name: /preview generated code/i })`, focused by Tab and activated by Enter                                                                                                                                                                                               |
| 3   | Both roots appear, and each holds `.claude-src/config.ts` and `.claude-src/config-types.ts` | assert on the rendered rows for a fixture configuration with one global-scoped and one project-scoped skill                                                                                                                                                                                     |
| 4   | **Flipping an agent's scope moves its `.md` between roots**                                 | one spec: assert the row under `./`, cycle the scope word in the roster, assert the row under `~/` and absent from `./`. This is the dialog's whole argument                                                                                                                                    |
| 5   | **Flipping a skill to eject turns a plugin row into a directory**                           | assert the row moves out of `plugin skills` and into `.claude/skills/<id>/`, its label turns `eject`, and the footer's ejected count increments                                                                                                                                                 |
| 6   | A plugin skill is never labelled `new` and never appears under a `skills/` path             | assert both, by row text and by absence                                                                                                                                                                                                                                                         |
| 7   | The header subtitle tracks the selection                                                    | select two nodes, assert the subtitle text for each, including the `reference only` marker on a plugin node                                                                                                                                                                                     |
| 8   | A stale selection falls back rather than blanking                                           | select an agent `.md`, flip that agent's scope, assert the pane shows the project root's `config.ts`                                                                                                                                                                                            |
| 9   | **The rendered bytes are the renderer's**                                                   | a vitest spec that renders the dialog for a fixture payload and asserts the content pane's text `toStrictEqual` the string `@workspace/compile` returns for the same payload. Bind to the renderer's **output**, not to a transcribed literal — a literal here would be a second implementation |
| 10  | The empty state is handled                                                                  | with nothing selected, assert the entry point is either disabled or opens a dialog with a stated empty message. The prototype handles neither; pick one and pin it                                                                                                                              |
| 11  | Third-party bytes are not interpreted                                                       | a spec seating an external skill whose file contains `<img src=x onerror=alert(1)>` and asserting those characters render as text                                                                                                                                                               |
| 12  | The footer's honesty line is present                                                        | assert the clean-machine wording and the corpus version are both in the footer                                                                                                                                                                                                                  |

---

## B4 — Syntax highlighting

Shiki, client-side, fine-grained imports, lazy behind `import()`, rendered through `codeToTokens`.
The decision and its two reasons are `decisions.md` §1 and are not revisited. Verified present:
`shiki@4.4.1` is already resolvable at the repository root (transitively, via the docs site's
toolchain) but is declared in **no** workspace manifest — `apps/editor` must declare it. `shiki/core`
exports `createHighlighterCore` and `codeToTokens`; `shiki/engine/javascript` is the wasm-free engine
and is the right one for a browser bundle with no asset to ship.

### B4.1 Where the theme lives

`inkRampSyntaxTheme` in `apps/www/astro.config.ts` — with `PALETTE`, `STRUCTURE_SCOPES`,
`LITERAL_SCOPES` and `COMMENT_SCOPES` — is a Shiki-format TextMate theme built from this design
system's palette, and `todo/www.md` records the owner's ruling on it. Copying it into the editor
means two syntax identities that will drift.

**Move it to `packages/ui/src/lib/syntax-theme.ts`, exported as `@workspace/ui/lib/syntax-theme`.**

The justification is already written in the astro config's own comment: _"The five design tokens this
theme spends, by their names in `packages/ui/src/styles/globals.css`. They are literal hex here and
nowhere else on this site … If the palette moves, these five move with it."_ The theme mirrors five
tokens (`--color-ink`, `--color-subtle`, `--color-faint`, `--color-brand-ink`, `--color-code`) that
are declared in `packages/ui`. Putting the mirror in the same package as the thing it mirrors is the
only arrangement where a palette change and its syntax consequence are one diff.

Mechanics:

- Both consumers already depend on `@workspace/ui` (`apps/www` and `apps/editor`, verify with
  `grep -n '@workspace/ui' apps/*/package.json`), and the existing `"./lib/*": "./src/lib/*.ts"`
  export entry resolves the subpath with **no manifest change**.
- The module must import nothing — no React, no astro, no shiki. Its return type is declared
  structurally in the module. `apps/www/astro.config.ts` keeps the one astro-specific line it needs
  (`SyntaxTheme = NonNullable<StarlightExpressiveCodeOptions["themes"]>[number]`) and satisfies it at
  the call site; the editor satisfies shiki's own theme type at its call site.
- **It stays a factory, `inkRampSyntaxTheme(name, type)`, and must not become an exported constant.**
  Two independent reasons and both are binding: the astro config records that the highlighter
  **mutates** `settings` while resolving scopes, so a readonly array is rejected at the boundary; and
  `packages/cli/CLAUDE.md` forbids exporting a shared constant whose value holds a mutable array,
  because callers receive it by identity and one mutation corrupts every holder. A factory answers both.
- `SYNTAX_THEMES` — the light/dark pair Starlight requires — stays in `apps/www/astro.config.ts`. It
  is that site's arrangement, not a shared one.

### B4.2 The grammars, and no more

Three, one bundle each, each a single grammar (verified: each of
`@shikijs/langs/dist/{typescript,markdown,yaml}.mjs` exports exactly one grammar and no embedded set):

| Grammar      | Needed for                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` | `config.ts`, `config-types.ts`                                                                                                                                                                    |
| `markdown`   | `agents/<name>.md`                                                                                                                                                                                |
| `yaml`       | the frontmatter block inside a compiled agent. The markdown grammar's first pattern is `#frontMatter`, which embeds `source.yaml`; without `yaml` loaded the frontmatter falls back to plain text |

**No others.** `json`, `bash`, `tsx` and the rest have no subject in this dialog. Third-party bytes are
plain text by decision (see [§2](#2-scope-fence) and B3.3), so no grammar covers them.

Verification that `yaml` is genuinely needed rather than assumed: render a compiled agent and assert
the `name:` **value** in the frontmatter carries the literal token colour (`--color-brand-ink`) rather
than the default. If it does so without `yaml` loaded, drop it and shrink the payload.

### B4.3 The rendering contract, and how it decouples B3 from B4

`codeToTokens` returns plain `{ content, color, fontStyle }` objects that render as ordinary React
children. This is the second reason Shiki won: `skill-contents-dialog.tsx`'s shipped
rendering-safety decision — no markdown renderer, no sanitiser, no `dangerouslySetInnerHTML` — survives
verbatim. Every HTML-emitting alternative, `codeToHtml` included, breaks it.

Define one function the content pane calls:

```
renderTokens(code: string, lang: "typescript" | "markdown" | "text"): Promise<Token[][]>
```

B3 ships against a minimal implementation returning one token per line. B4 replaces the
implementation. **This is what lets B3 and B4 land in either order** — and it means a Shiki failure
degrades to readable plain text rather than an empty pane, which the error path must assert.

The highlighter is created once per session in the lazily-imported module, with shiki's own cache on.

### B4.4 The budget assertion

`apps/editor/scripts/first-paint-budget.ts` runs **inside `vite build`**, so `bun run build` in
`apps/editor` is the gate and there is no separate command to remember. It enforces two things, and
both matter here:

1. the statically-reachable payload must stay under `FIRST_PAINT_BUDGET_BYTES`; a chunk reached only
   through `import()` is deliberately not counted;
2. **no emitted chunk may mix first-party source with `node_modules`** — and this check runs over
   **every** chunk, lazy ones included. A lazy chunk carrying `packages/compile` source alongside
   `liquidjs` and `shiki` trips it.

So the criteria are:

| #   | Criterion                                                     | How it is proved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Nothing new is on the first-paint path, and no chunk is mixed | `bun run build` in `apps/editor` exits 0. The plugin throws on either failure with an itemised list; a green build is the plugin's own verdict rather than an argument about it                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | **The delta is recorded, not merely cleared**                 | run the build twice — once at the base commit, once with the change — each time with `FIRST_PAINT_BUDGET_BYTES` temporarily set to `0` **and not committed**. The plugin then always throws, printing `First paint is N KB gzipped …` followed by every chunk and its gzip size. Diff the two totals and paste both into the PR. This uses the script's own numbers, which is the only reading comparable to the one in its docblock — Node's and Bun's zlib disagree by about 2% on the same bytes, so state which runtime produced the figures |
| 3   | The corpus and the highlighter really are lazy                | in the itemised list from criterion 2, neither `packages/compile` nor a shiki chunk appears among the statically-reachable parts                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | A named chunk group keeps it that way                         | add a `CHUNK_GROUPS` entry matching `/packages[\\/]compile[\\/]/`. `vendor` at priority 40 with `entriesAware: true` already claims `liquidjs` and `shiki` into an entry-aware chunk; the new group keeps first-party source out of it. Use `[\\/]`, never `/` — these match absolute module ids, which use backslashes on Windows                                                                                                                                                                                                               |
| 5   | The docs site is unchanged                                    | `bun run build` in `apps/www` exits 0, and a spot check of one rendered code block's colours before and after the theme move. Expressive Code caches its output, so `rm -rf dist .astro node_modules/.astro` before concluding the move did nothing                                                                                                                                                                                                                                                                                              |
| 6   | Both sides read one definition                                | `grep -rn 'inkRampSyntaxTheme\|STRUCTURE_SCOPES\|LITERAL_SCOPES' apps packages --include='*.ts' --include='*.tsx' \| grep -v node_modules` shows exactly one declaration site, in `packages/ui`                                                                                                                                                                                                                                                                                                                                                  |

---

## 5. Sequencing and lane ownership

### Order

```
A0 (Phase A) ─────────────────────────────┐
                                          │
B1a  package + config renderers  ─┬─ B2 ──┤
B1b  agent renderer              ─┤       ├─ B3  preview dialog
B1c  seed → config               ─┘       │
                                          │
B4a  theme → packages/ui ── B4b  Shiki ───┘
```

- **B1a unblocks B2** — B2 only needs the package to exist.
- **B1b and B1c are independent of each other** and both independent of B2.
- **B4a and B4b are independent of B1 and B2 entirely.**
- **B3 needs B1 complete, B2 complete, and A0.** It does **not** need B4, because of B4.3's
  `renderTokens` seam.

### What runs in parallel, and the files each lane owns

| Lane  | Items             | Owns exclusively                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | B1a, B1b, B1c, B2 | `packages/compile/**`; `packages/cli/src/cli/lib/configuration/**`; `packages/cli/src/cli/lib/compiler.ts`; `packages/cli/src/cli/lib/agents/agent-provenance.ts`; `packages/cli/src/cli/lib/seed/seed-to-wizard.ts`; `packages/cli/src/cli/consts.ts`; `packages/cli/src/cli/utils/string.ts`; `packages/cli/scripts/generate-compile-package*.ts`; `packages/cli/package.json`; `packages/cli/eslint.config.js`; `packages/cli/tsup.config.ts`; `packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts`; `.github/workflows/ci.yml` |
| **2** | B4a               | `packages/ui/src/lib/syntax-theme.ts`; `apps/www/astro.config.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **3** | B4b, B3           | `apps/editor/**` — including `vite.config.ts`, `package.json`, `tsconfig.app.json`, `vitest.config.ts`, `e2e/**`                                                                                                                                                                                                                                                                                                                                                                                                                               |

Lanes 1 and 2 can run at the same time. Lane 3 cannot start until lane 1's exports and lane 2's theme
module exist.

**Two shared files need naming, because more than one lane wants them:**

- `packages/ui/src/components/dialog.tsx` — lane 2 owns `packages/ui`, but B3's pane-split change
  (§B3.4) lands there. Give it to **lane 3** and tell lane 2 not to touch it; the two changes are in
  different files within the package.
- `packages/ui/src/styles/globals.css` — **A0 owns it**, in Phase A. B3 must not add tokens there;
  if A0 has not landed, B3 stops and reports rather than adding the five colours itself.

An agent needing a change in another lane's file reports the exact change rather than making it.

### How each item is finished

The root `CLAUDE.md` order, and it is not optional: tests red first and watched to fail, implement
until green, then `meta-design-expressive-typescript` (that skill only, no sub-agents), then hand-run
the real thing, then docs through `codex-keeper`, then `todo/` in the same turn — tracker row deleted,
one line into `archive.md`, `ROADMAP.md` updated if a phase moved.

**"Hand-run the real thing" has two halves in this phase**: `npx agents-inc init` in a scratch
directory for lanes 1 and 2, and the dialog opened in a browser for lane 3. Passing tests and a
working surface are different claims.

**Sub-agents do not edit `todo/`.** The orchestrator does, as each lane lands.

---

## 6. Handoffs

### For the developer

Read before writing anything: `packages/cli/CLAUDE.md`, `packages/cli/.ai-docs/DOCUMENTATION_MAP.md`,
and `packages/cli/.ai-docs/reference/config/config-writer.md` — the last is the canonical prose for
every ordering and quoting rule B1 moves.

The conventions that bind hardest here, each derived from code read this session:

- **Render and write stay separate.** `config-writer.ts` holds no filesystem call and its own docblock
  says so; the config-gate exists because a rendered pair half that any caller may then write is the
  ungated write the gate prevents. Extract functions that return strings; the write stays in
  `config-gate/pair-writer.ts::writeIfChanged`.
- **Never reach the matrix singleton from shared code.** Pass it.
- **Quote always, never conditionally.** Every key in an emitted `config.ts` is quoted because it goes
  through `JSON.stringify`. A conditional bare-identifier test diverges on every id.
- **Order is the roster's, never the producer's.** `CANONICAL_FIELD_ORDER` for top-level fields,
  `compareNamesInCodeUnitOrder` for sub-agent keys (never `localeCompare` — it makes the bytes a
  property of the machine), `byCategoryDeclarationOrder()` for category keys, `bytewise` for
  type-alias category properties.
- **Order is load-bearing in the agent split.** `buildAgentTemplateContext` partitions preserving
  order, and that order comes from `config.ts`'s stack keys.
- **Use the existing Liquid seam.** LiquidJS v10 accepts a pluggable `fs: FS`. Change what the engine
  is built from; leave `renderCompiledAgent`, `sanitizeCompiledAgentData` and
  `buildAgentTemplateContext` untouched.
- **`@workspace/matrix` is node-free and must stay so.** `@workspace/compile` must be too.

### For the tester

- **Assert on raw emitted strings** with `toContain`, `toMatchInlineSnapshot` or a structural load.
  Never define a parser, extractor or regex scan inside a test file to pick data out of rendered
  output — if it has non-trivial logic it needs its own tests to be trusted.
- **Compare generated artefacts at both ends of a round trip**, not each end against its own config.
  A difference that is consistent within each installation is invisible to every config-level check.
- **Never assert a roster or directory listing by count.** `toStrictEqual` against a named constant —
  a count cannot see a swap.
- **Do not bind a rendering assertion to the constant the product renders.** Copy `e2e/pages/constants.ts`'s
  mirror discipline: the editor's e2e constants mirror the product's strings rather than importing them,
  precisely so a change to the string reddens the test.
- **A gap goes in the assertion, named.** Not in an arity, not in a length, not in an absence.
- Fixture data comes from factories. If a factory does not exist, create one.

### For the reviewer

Focus, in this order:

1. **Does the CLI actually call the package?** This is B1's whole acceptance criterion and the one
   thing that separates this from client-side reconstruction with a `package.json`. Check the imports,
   not the intent.
2. **Did the eslint ban move with the renderers?** It fails silently and nothing signals it.
3. **Is anything invented?** Any byte in the preview that the CLI does not produce is the defect this
   phase exists to remove. The ejected-skill body and the machine-specific import path are the two
   places where inventing is tempting.
4. **Is the corpus behind `import()`?** Read the itemised budget output, not the chunk config.
5. **Is the theme one definition?** One declaration site, and it is a factory rather than a constant.
6. **Does any tree row name a path that will not exist?** Plugin skills are the case; the roster
   `displayName` rule in `packages/cli/CLAUDE.md` is the principle.

---

## 7. Open questions

**Resolved here, recorded so they are not re-argued:**

- Q: Which writer variant does the preview draw? → Two, not three; the third is dead in production (C1).
- Q: What version does the provenance marker carry? → `CORPUS_CLI_VERSION`, emitted by B2's generator,
  named in the footer.
- Q: Where do plugin skills sit in the tree? → Under the root, in a `plugin skills` group that is
  deliberately not a path.
- Q: Does the preview show ejected skill file bodies? → Only for external skills, whose bytes travel in
  the payload; and as plain text. Catalogue skills get the source coordinate and no invented bytes.
- Q: Does the preview fetch anything? → No. Phase B makes no network call.

**Needs the owner:**

- Should the entry point be **disabled** with nothing selected, or open a dialog with an empty state?
  The prototype does neither and the design README lists empty states as not designed. B3 criterion 10
  pins whichever is chosen; it does not choose.
- The design's `Preview generated code` sits above Install in a footer that, in the real editor, also
  holds Save and Share. Three buttons plus a recessed block is a denser footer than the design drew.
  If it reads badly at 250px, the fallback is to move the block above Save rather than to add a fill.

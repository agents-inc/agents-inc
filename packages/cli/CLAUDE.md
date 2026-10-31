<critical-requirement>
1. NEVER write implementation code or edit test files directly. Always delegate to CLI developer or CLI tester. No exceptions for "small" or "quick" fixes.

2. When delegating to a sub-agent, tell it to read CLAUDE.md before starting work.

3. After any fix, trace ALL scenarios through the code before calling it done.

4. ALWAYS read [docs/architecture.md](../../docs/architecture.md) before working on an area of the codebase you have not worked in.

5. NEVER run ANY git command that WRITES — no `git add`, `commit`, `reset`, `stash` (push/pop/drop), `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`, amend. READ-ONLY git is allowed (owner clarification 2026-08-09): `git status`, `log`, `show`, `diff`, `blame`, `stash list` — use it to check history and verify changes. The user curates their staging area intentionally. This applies to sub-agents too — state both halves when delegating. The one exception is a `commit-plan` skill run, on the terms in the root `CLAUDE.md`.
</critical-requirement>

# Project Memory for Claude

Behavioural rules and conventions. How the codebase fits together: [`docs/architecture.md`](../../docs/architecture.md).

## NEVER do this

### Git & Workflow

- NEVER run ANY git command that WRITES (rule 5 lists them, and its `commit-plan` exception). If you think you need to discard working tree changes, ask the user how to proceed; verify with read-only git rather than guess
- NEVER use git worktrees (`isolation: "worktree"`) — owner, reaffirmed 2026-09-03: "I don't use worktrees". No exception for a compiled agent: that narrowing is withdrawn and no shipped agent carries the key. The CLI still SUPPORTS `isolation` in agent metadata (Claude Code documents it; a consuming project may want it) — this rule governs using it, not supporting it
- NEVER introduce new workflow patterns (tools, flags, strategies) that the user hasn't explicitly requested
- NEVER put machine-specific absolute paths in any file tracked by git

### Type Safety & Casts

- NEVER cast a valid union member — not `as SkillId`, `as SkillSlug`, or `as any` (the same defect, with sibling type-checking off too). The literal string IS the type; noise casts hide the ones doing real work. Only cast at parse boundaries (YAML, JSON, CLI args) or for deliberately invalid error-path test data. Before fabricating an out-of-union ID, check the signature can receive one: a union-typed parameter makes it unreachable in production, so use a real union member that fails the runtime check (a valid `SkillId` absent from the set under test). Fabricated IDs at a boundary that genuinely accepts unvalidated input should use `string` type, not casts.
- NEVER use `as unknown as T` double casts — fix the upstream type instead
- NEVER use `{} as Record<K, V>` — use `const x: Partial<Record<K, V>> = {}` with a type annotation

### Data Integrity

- NEVER use optional chaining (`?.`) or null coalescing (`?? ""`, `|| []`) on data that must exist — use asserting lookups. Silent fallbacks hide bugs.
- NEVER build multi-tier resolution fallbacks (try exact → try alias → try directory name). Data matches on the first lookup or it's an error.
- NEVER fall back to `path.basename(dir)` as a skill ID — use `frontmatter.name` from `parseFrontmatter()`
- NEVER derive `slug`, `domain` or `category` from a skill ID or directory path — **in product code, and in test factories and fixtures**. All three are stated metadata fields: look them up in one table and throw on a miss (shape: `getCanonicalSkillTaxonomy()` in `__tests__/factories/skill-factories.ts`). A display name from the slug the lookup returned is fine; anything from the id is not.
- NEVER print a skill or agent `displayName` in a block describing the filesystem (under a "copied to:" / "compiled to:" / path header): its entries are literal directory and file names, so use the id or the basename of the recorded `destPath` — a user must be able to copy any line out of such a block and `cd` into it. `displayName` is for selection UI, search results, change summaries and `list`'s rows only (`edit.tsx`'s `+ Reviewing` / `~ Reviewing` lines are choices, not paths). This is the inverse of the `path.basename` rule above, not a restatement of it. The name is recorded at install (`init --from` and `edit --from` write it on each skill's `config.ts` entry); a row drawn from an entry reads that record, then the seated catalogue, then the id (`getSkillEntryDisplayName` in `lib/matrix/matrix-provider.ts`), and no command adds a side read (a marketplace, another scope's copies) to name a row.
- NEVER add backward-compatibility shims or legacy fallbacks — the project is pre-1.0. Remove old code cleanly.
- NEVER let plugin install per-skill failures silently produce orphan config entries. If `installPluginSkills` returns non-empty `failed`, hard-error (`this.error(..., { exit: EXIT_CODES.ERROR })`) BEFORE `writeConfigAndCompile` runs. Warnings for user context are fine; persisting `config.ts` entries claiming `origin: "<marketplace>"` for skills that never installed is not. Uninstall failures are diagnostic-only.

### Scope Awareness (project vs global)

- NEVER hardcode `projectDir` for skill/agent paths when a skill has a `scope` field — `os.homedir()` for `"global"`, `projectDir` for `"project"`. ALWAYS use `resolveInstallPaths(projectDir, scope)` with the explicit scope parameter when resolving skill/agent directories
- NEVER use `path.join(projectDir, LOCAL_SKILLS_PATH)` without checking scope — global-scoped local skills live at `~/.claude/skills/`, not `<project>/.claude/skills/`
- NEVER load global local skills as a fallback only when project has none — ALWAYS load both project AND global local skills and merge them (project takes precedence on conflict); pattern: `src/cli/lib/loading/source-loader.ts`, `src/cli/commands/compile.ts`
- NEVER pass a uniform scope to `claudePluginInstall`/`claudePluginUninstall` for multiple skills — each skill has its own scope in its `SkillConfig`. ALWAYS split skill lists by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`) before any path-dependent operation (copy, delete, install, uninstall)
- NEVER use conditional fallbacks like `if (x.length === 0) { use fallback }` when both primary and fallback data should always be merged
- NEVER report a single path for artifacts that are split by scope (the rules above cover writing; this covers display). If a command prints where skills or agents live, derive the paths from the same scope-aware read that produced the counts, so the two cannot disagree, and print one block per non-empty scope, global first — see `formatInstallationDisplay` in `lib/plugins/plugin-info.ts`.
- NEVER carry a single `agentsDir` / `skillsDir` on a display or report type. Model the directories that actually hold content (`InstallationInfo.agentDirs: string[]`), so an empty scope is structurally unrepresentable. Where such a field has no reader at all, delete it rather than widening it — a field with no reader has no shape to get right, and widening invents a contract nothing asked for.

### Test Assertions

- NEVER define local parser/extractor helpers inside a test file (loops, regex scans, state machines picking data out of rendered output or config text) — such logic needs its OWN tests. Assert on raw output (`toContain`, `toMatchInlineSnapshot`) or a structural load (`loadProjectConfig` for config.ts). If a helper is genuinely reusable across tests, live it in `src/cli/lib/__tests__/helpers/` WITH its own tests if shared across the CLI, else in a `__tests__/helpers/` beside the code it serves, where a vitest project COLLECTS them (live example: `src/cli/lib/hosts/__tests__/helpers/fake-child-process.ts` and `fake-child-process.test.ts`, collected by `src/**`). Never inline and untested, and never where no project looks — none collects `*.test.ts` under `e2e/helpers/` (`vitest.config.ts` includes only `src/**` and `scripts/**`; `e2e/vitest.config.ts` requires `.e2e.test.ts` / `.smoke.test.ts`), so such a test never runs yet looks like coverage. E2E specs reach helpers via `e2e/helpers/test-utils.ts`, which imports each by name into its single `export { ... }` block (live: `normalizeGlobalConfig`, `writeTestPackageJson`).
- NEVER let a shared assertion helper's signature overstate what it checks — callers trust the signature, not the body. **Where a matcher already loads the artefact structurally for one field, every field it claims is checked structurally**: a mixed matcher is worse than a wholly textual one, since its rigorous fields lend the rest credibility. The option-NAME case is `clean-code-standards.md` 15.11.
- NEVER split/loop/regex-scan `lastFrame()` output in component tests — use `toContain("+ React")` or snapshot the frame. The rendered frame is the contract.
- NEVER end a `toContain` that pins a block of output on the block's own last line. End it on the line after (the blank line or the next line), so a line printed under the block fails it: `[...lines, ""].join("\n")` stops at the last newline, which any next line still matches; `[...lines, "", ""]` or `[...lines, "<next line>"]` does not.
- NEVER broaden an assertion to make a failing test pass — investigate why it fails. If it's a fixture limitation, keep the strict assertion as a commented-out `// KNOWN GAP:` with an explanation. If it's a product bug, mark the test `it.fails`.
- NEVER encode a known gap in an assertion's ARITY, LENGTH or ABSENCE. This covers a test that PASSES because of a gap (the rule above, one that FAILS): `toHaveLength(1)` over a grouped map, `toBeUndefined()` on a field another layer should populate, or a test named for what does not happen hides the defect from search and reddens only when the fix lands, reading as a regression. Name the gap in the assertion — the group key (`byCategory["uncategorized"]`) or a full `toStrictEqual` against a named constant — in the test whose subject IS the gap, where whoever retires it will look (not an arity pin riding along in a plugin-count test).
- NEVER let a spec's NAME claim validation that its mocks have removed. If the module owning the parse is mocked, the assertion is a pass-through: the name says so, or that spec drops the mock. The tell is a mocked collaborator whose whole job is what the name promises — it type-checks, lints and passes, so no gate sees it. Census: for each `vi.mock` of a parsing or loading module, does any spec in that file name "validates", "rejects" or "schema" while relying on the mock's return value?

```
grep -rln 'vi.mock' src --include='*.test.ts' --include='*.test.tsx' | xargs grep -lE 'it\("[^"]*(validat|reject|schema)'
```

- NEVER bind an assertion to a constant that merely has the same VALUE as the literal it replaces, and never bind a RENDERING assertion to the constant the product renders. **Same value is not the same concept**: a negative assertion binds to the constant governing ITS OWN test's data — `SKILLS.react.id` in a spec fed by `MULTI_SOURCE_PUBLIC_SKILLS` or a hand-written config-source blob is a **diverged-constant** vacuum, worse than a stale literal: repoint the constant and it searches for a string the fixture never held. Live examples, correctly left literal: `config-source-sections.test.ts` (its ids are byte markers) and `skill-resolution.integration.test.ts`. A rendering assertion keeps its literal, since one importing the rendered constant moves with it — hence `e2e/pages/constants.ts` MIRRORS the product's strings, and `DOCTOR_UNOWNED_INSTALL` living only there is the design, not a gap. Bind when the literal names a SYMBOL whose deletion should break the test (a `SkillId`, an `AgentName` — a compile error); keep the literal when it is TEXT the product renders.
- NEVER paste an expected value that the code under test copies out of a file in this repository (an agent's `description`, a skill's frontmatter); read it from that file. Unlike rendered text, which `e2e/pages/constants.ts` mirrors, it has nothing to mirror, and a pasted copy reddens only when the file is reworded. Live example: `agentDefinitionEntry` in `scripts/generate-matrix-package-against-this-repository.test.ts`.
- NEVER assert a directory listing, roster or generated union by count alone (`toHaveLength(n)`) — assert the members with `toStrictEqual` against a named constant; a count cannot detect a swap. Check: `grep -rn -A4 'await readdir(' src e2e --include='*.ts' --include='*.tsx' | grep 'toHaveLength('`.
- NEVER pin an operation as REFUSED without pinning, in the same file, a state where the same operation is ALLOWED. A refusal alone cannot tell a correctly-scoped guard from one that swallowed its whole domain — both leave config and filesystem byte-identical and exit 0, so the spec stays green while the guard grows. The guard that produced this rule refused a dual-scope skill as a unit, making the project's OWN half unremovable too. The pair goes in ONE file: a permitted case in another spec is not a control, as nothing makes the two move together. Worklist, the guard-named specs:

```
ls e2e/*/*guard*
```

- NEVER delete an unused binding in a test file without triaging it first — in a test it very often marks an assertion planned and never written. An unasserted destructured `stdout` / `lastFrame` / `exitCode` means the test checked nothing about the result; an unused type import on an assertion helper usually means its parameters were restated structurally and are no longer shape-checked (licensing inline test data at every call site); an unused factory import usually means the fixture beside it is built inline. Delete only once the binding names nothing the test should assert; if the intended assertion is unclear, report it rather than inventing one, and never weaken an existing assertion to clear the report.

### Test Data

- NEVER construct test data inline — use factories from `__tests__/factories/` and `__tests__/helpers/` and fixtures from `__tests__/fixtures/create-test-source.ts`. If a factory doesn't exist, create one.
- NEVER create custom mock skills when a canonical `SKILLS.*` entry from `test-fixtures.ts` would work — ALWAYS prefer `SKILLS.*` over `createMockSkill()` for standard domain skills
- NEVER call `createMockMatrix(SKILLS.*)` inline when a pre-built constant exists in `mock-matrices.ts` — ALWAYS use the pre-built constant
- NEVER pass the entire `SKILLS` registry to `createMockMatrix` — ALWAYS spread individual entries: `createMockMatrix(SKILLS.react, SKILLS.hono)`
- NEVER construct `ProjectConfig`, `ProjectSourceConfig`, or `AgentScopeConfig[]` inline — ALWAYS use config factories: `buildProjectConfig()`, `buildSourceConfig()`, `buildAgentConfigs()`, `buildSkillConfigs()`
- NEVER write inline SKILL.md frontmatter or agent YAML template strings — use `renderSkillMd()`, `renderAgentYaml()` from `content-generators.ts`
- NEVER repeat agent metadata strings inline — ALWAYS use `AGENT_DEFS` from `mock-agents.ts`
- NEVER put TODO/task IDs in test names (`describe()`, `it()`), assertion messages (2nd arg to `expect`), or inline test comments — file-level JSDoc ONLY, if anywhere. Names describe BEHAVIOR ("version field is not emitted on init"), messages the INVARIANT ("config.ts must not contain version field") — not tickets, whose IDs look authoritative and mean nothing once closed.
- NEVER define path/timeout/text constants locally in E2E test files — use `DIRS`, `FILES`, `TIMEOUTS`, `SOURCE_PATHS`, `STEP_TEXT`, `EXIT_CODES` from `e2e/pages/constants.ts`
- NEVER write a helper function in an E2E test file without first grepping `e2e/helpers/test-utils.ts` and `e2e/fixtures/` for an existing one
- NEVER stand a spec at a terminal by setting `process.stdin.isTTY = true` — call `standAtTerminal()` from `__tests__/helpers/terminal-input.ts`. `isTTY` is half a terminal: vitest workers' stdin is a pipe without `setRawMode`, and every prompt enters raw mode before painting, so the spec dies on `input.setRawMode is not a function` once it reaches one. The census should come back empty: `grep -rn "stdin.isTTY = true" src e2e scripts --include='*.ts' --include='*.tsx'`

### Code Style

- NEVER create redundant type aliases — use `Pick<>`, `Partial<>`, or `&`. Check `types/` first.
- NEVER add unnecessary comments — only when unintuitive, complex, or for edge cases; the root CLAUDE.md's "Comments are few and short" rule binds
- NEVER reassign constants to other constants — use the original directly
- NEVER build intermediate data structures imperatively — use `.map()`, `.flatMap()`, or literal arrays
- NEVER export constants only used within the same file — run grep before adding `export`.
- NEVER export a shared constant whose value holds a mutable array or object that callers receive BY IDENTITY — one `push` corrupts every holder, and no type flags it. Return a fresh value from a factory (`validResult()` / `invalidResult(msg)` in `lib/validation-result.ts`; its docblock says why), or independent literals per site where the concept is not worth naming (no singleton, no coupling, no import). Reject `as const` / `readonly` where the fields are mutable on a widely-used type (it cascades), and `Object.freeze` outright (runtime-only, invisible to the type system, a silent no-op outside strict mode). Live worklist — `NOTHING_RECOMPILED` in `lib/config-gate/recompile.ts`: exported, returned by `recompilePropagated` and a default parameter in `lib/config-gate/index.ts`, so several callers hold one `warnings: string[]`:

```
grep -rn -A6 -E '^(export )?const [A-Z][A-Z0-9_]+: [A-Z]' src/cli --include='*.ts' --include='*.tsx' | grep -E '\[\],?$|: \[\]'
```

- NEVER leave the key order of a serialised nested record to whoever assembled it. Canonicalise **once in the writer**, not once per producer — a producer that REPLACES another's output replaces its order too. Shape: `canonicalizeStackOrder` in `packages/compile/src/config-source.ts`, run from `cleanForEmission`: sub-agent keys in code-unit name order, category keys via `byCategoryDeclarationOrder` in `packages/compile/src/catalog.ts`, where the rule lives so builder and writer cannot disagree. Neither is re-exported here; the builder calling the comparator is `inCanonicalCategoryOrder` in `packages/compile/src/seed-to-config.ts`, so the CLI has no call site (its copy in `lib/matrix/matrix-provider.ts` was deleted: a centralised rule declared a second time invites a future caller, and no gate sees an uncalled symbol). It matters because `buildAgentTemplateContext` splits `agent.skills` into preloaded and dynamic PRESERVING order: `config.ts` key order IS the order the sub-agent is handed. Stack assemblers: `grep -rn "Partial<Record<AgentName, StackAgentConfig>>" --include='*.ts' --include='*.tsx' src e2e`. Use `bytewise` from `utils/string.ts` or a bare `.sort()`, never `localeCompare` — `clean-code-standards.md` 17.3.

  **Testing corollary: a round trip needs one assertion comparing both ends' GENERATED ARTEFACTS, not only each end against its own config** — config checks are order-blind (`skills` and `agents` are generator-sorted; deep equality ignores `stack` key order). The gate is `e2e/lifecycle/share-round-trip-compiled-bodies.e2e.test.ts`: build origin, share, reinstall with `init --from`, assert the config sides agree (to locate the red), then `readCompiledAgents` at both ends with `toStrictEqual`. Copy its two guards: the roster is named against `E2E_STACK_AGENTS`, not counted (a count misses a swap); and `readCompiledAgents` answers `{}` for a missing directory, so two installations that compiled nothing satisfy the comparison for free.

- NEVER answer a `no-unused-vars` report on a CAUGHT ERROR by renaming it `_error` — treat it as a bug report: the binding exists because an author meant to report the cause, which on a diagnostic surface almost always matters. `_error` is for genuinely irrelevant causes only. The lint sees only this bound variant; a bare `catch {}` discards the cause as thoroughly — see `clean-code-standards.md` § 3.6 for that half and its usual residue, the no-interpolation template literal.
- NEVER write an `eslint-disable` for a rule you merely disagree with: the construct must be **required** and the rule's own escape hatch must not work, and the directive's comment carries the proof, not a restatement of the rule. **Where TypeScript requires the construct, the proof is the compiler error code** — the bar for any new disable: `interface Assertion<T>` in `e2e/matchers/setup.ts` keeps its unused `T` because declaration merging matches on the parameter's NAME, so the documented `^_` escape hatch fails with TS2428 (`All declarations of 'Assertion' must have identical type parameters`). Otherwise name the concrete breakage: the `no-var` in `skill-factories.ts` names the TDZ crash `let` causes under circular ESM imports; the `no-unnecessary-condition` disables name the `Partial<Record>` slot whose `| undefined` `Object.entries` launders away. "The rule is annoying here" and "the fix is a big refactor" are not reasons. The reason goes after `--` on the directive line or, if longer, in the comment immediately above it.
- NEVER leave an inline disable where the idiom is general rather than local: fix it in `eslint.config.js` and delete the disable. Live precedent: `**/*.d.ts` turns `@typescript-eslint/triple-slash-reference` off, since a triple-slash reference is the only construct by which an ambient declaration file contributes globals — true of every declaration file, not just the one reported. An override plus a redundant disable is worse than either; `linterOptions.reportUnusedDisableDirectives` is `"error"` here, so a directive suppressing nothing fails lint. Census, and the six sites carrying their reason above the line rather than after `--`:

```
grep -rn -B1 'eslint-disable' src e2e scripts --include='*.ts' --include='*.tsx' | grep 'eslint-disable' | grep -v -- ' -- '
```

## ALWAYS do this

### Delegation & Process

- ALWAYS write a brief under [`docs/briefing.md`](../../docs/briefing.md), and read it before executing one. A brief (the prompt one agent hands another) never reaches the tree, so **no checker can open one**; the discipline is the whole enforcement. Hardest-binding: **re-derive before you write** (a brief was measured against a tree that has since moved; a row that does not describe the tree is stopped on and reported, never justified with invented work); **a brief carries the command, not its result** (no count — the invocation that produces one); **corrections are a required field of every report**, "nothing" written out since silence reads as a brief that held, logged by the orchestrator one line per dispatch in the programme's progress file; **name the files each lane owns** when more than one agent works (a change in another lane's file is reported, not made). Ruled 2026-08-19, not re-litigated: the verifier is never the fixer, a verdict carries a reproduction rather than a judgement, deleting a claim beats rewriting it
- ALWAYS grep for the old value when changing test data or renaming anything
- ALWAYS search for all call sites when removing a workaround
- ALWAYS visit every call site and record its posture when changing a function from returning a SENTINEL to THROWING — abort (the failure makes the operation unsafe) or degrade (it must still run without it); not complete until each has chosen. No default is safe: swallowing makes a broken install look absent, escaping aborts commands that must survive it. **A `Promise.all` member is a call site**, far from any `try` and among non-throwing `fileExists` / `directoryExists` siblings that make the block read as total. `loadProjectConfigFromDir` in `lib/configuration/project-config.ts` returns `null` only when the file is ABSENT and throws `ConfigLoadError` when it exists and cannot be loaded; most of its production sites carry the decision in a comment. Degrade: `loadUninstallConfig` in `commands/uninstall.tsx`. Abort, hoisted to startup: `ensureConfigReadable` on `BaseCommand` (over `findConfigLoadFailures`). `configuredSkillIds` in `lib/content-validator.ts`, the remaining `Promise.all` shape, is safe because it reaches `doctor` through a `readsConfig: true` row and `safeCheck`, so a throw becomes a failed row, not an aborted command — stated here because that function does not show it.
- When a task is deferred, ALWAYS set its `Status` to `Deferred` in `todo/cli.md` — never delete the row
- ALWAYS write a finding to `.ai-docs/agent-findings/` when a sub-agent fixes an anti-pattern, discovers a missing standard, or notices convention drift — use the template from `.ai-docs/agent-findings/TEMPLATE.md`
- ALWAYS tell sub-agents: "If you fix an anti-pattern or discover a missing standard, write a finding to `.ai-docs/agent-findings/` using the template in `.ai-docs/agent-findings/TEMPLATE.md`"

### Releasing

- ALWAYS follow the release checklist in `.ai-docs/standards/commit-protocol.md`. This package publishes as `agents-inc` — one package, one version, one `npm publish`; no second package to bump (the `agents-inc` alias was folded into this one in 0.150.0).

### Type Safety

- ALWAYS use type guards (`isAgentName()` from `utils/type-guards.ts`) instead of `as` casts for runtime narrowing
- ALWAYS use `getSkillById(id)` from `matrix/matrix-provider.ts` for skill lookups where the skill must exist — NEVER a `matrix.skills[id]!` non-null assertion. Only use `matrix.skills[id]` when genuinely optional.
- ALWAYS use `parseFrontmatter()` from `lib/loading/loader.ts` for SKILL.md parsing
- ALWAYS type factory function parameters with the narrowest union type (`SkillId`, not `string`); error-path tests cast at the call site. **The one exception:** a factory that must serve BOTH the public catalogue and a non-catalogue namespace (fixture marketplaces via `e2eSkillId` / `testMarketplaceSkillId`, external skills) keeps `<Id extends string>` — live case `buildSkillConfigs` in `__tests__/helpers/skill-config-builders.ts`. Narrowing it forces one of two things this file forbids: casting a namespaced id into a union it is not in (`e2eSkillId` is deliberately `string`), or substituting a catalogue id, which `refuseCatalogueCollisions` in `lib/loading/source-loader.ts` rejects at load, refusing the fixture marketplace whole. Such a factory carries a docblock saying why; audits exclude it BY THAT DOCBLOCK, not by count. Measure any narrowing against **both** projects before filing it — `npx tsc --noEmit` and `npx tsc -p e2e/tsconfig.json --noEmit` (once 6 errors vs 83).
- ALWAYS use `typedEntries()` / `typedKeys()` from `utils/typed-object.ts` (not raw `Object.entries()`)

### Test Data

- ALWAYS use spread isolation `{ ...SKILLS.react }` when passing to functions that mutate objects in-place
- When fixing test data, ALWAYS evaluate the construction pattern too, not just the values
- ALWAYS read `.ai-docs/standards/e2e/README.md` before writing or modifying E2E tests
- ALWAYS use `toStrictEqual` (not `toEqual`) for object and array comparisons in assertions
- ALWAYS verify config AND filesystem after any operation that changes either: assert the resulting state of both. If it should NOT change something, snapshot before and assert identical after. Never check only one side.
- ALWAYS constrain a shared expected-value constant to the generated union it mirrors — `as const satisfies readonly AgentName[]`, `satisfies Record<string, readonly SkillId[]>`. One that merely mirrors `AGENT_NAMES` or `SKILL_IDS` unconstrained exports its own type errors to its consumers, none at the stale line; constrained, a removal reddens the one line that owns it. Where the clause goes (an object with getters takes it on the member arrays) is `typescript-types-bible.md` § 10. Worklist: every `as const` in the two expected-value modules without a clause; an object wrapper whose members each carry one is § 10's correct shape and an expected hit:

```
grep -rn 'as const' src/cli/lib/__tests__/expected-values.ts e2e/fixtures/expected-values.ts | grep -v 'as const satisfies'
```

---

## Test Data Factories

Use factories from `__tests__/factories/` and `__tests__/helpers/` and constants from `__tests__/mock-data/`. Grep for `createMock*`, `build*`, `SKILLS.*`, `AGENT_DEFS.*`, `render*` to find what's available.

```
Is it a complete skill/agent/category object?
├─ YES → Use factory from factories/ (createMockSkill, createMockAgent, createMockCategory)
└─ NO → Is it a full project directory structure?
    ├─ YES → Use createTestSource() from fixtures/create-test-source.ts
    └─ NO → Does it create a config, matrix, or stack?
        ├─ YES → Use a factory (createMockMatrix, buildInstallSelection, etc.) — NEVER inline
        └─ NO → Is it a partial object for one test case?
            ├─ YES → Inline is fine
            └─ NO → Use factory with overrides parameter
```

---

## Code Conventions

- **File naming:** kebab-case for ALL files and directories
- **Exports:** Named exports only (no default exports). Use `.js` extensions on relative imports in new files. Exception — a default export is required where a framework loads the module by it: oclif commands (`src/cli/commands/**`) and hooks (`src/cli/hooks/**`), and tool configs (`*.config.*`, plus `e2e/global-setup.ts`). Never "fix" these to named exports: config loaders read only `.default`, and oclif's undocumented named-export fallback takes the first sibling match — both break at runtime, not at `tsc`. Nothing else is exempt.
- **Constants:** No magic numbers or hardcoded strings — use `STANDARD_FILES.*`, `STANDARD_DIRS.*`, `UI_SYMBOLS.*`, `CLI_COLORS.*` from `consts.ts` (and `EXIT_CODES.*` from `lib/exit-codes.ts`)
- **Error handling:** `getErrorMessage(error)` for unknown errors, `this.handleError(error)` in commands, `EXIT_CODES.*` constants, no silent catch blocks
- **Logging:** `warn()` for user issues, `verbose()` for diagnostics, `log()` for always-visible
- **TypeScript:** Zero `any` without justification, no `@ts-ignore` without comment, Zod schemas at parse boundaries, all remaining casts must have comments explaining why

---

## Pre-Commit Checklist

Items not already covered by NEVER/ALWAYS rules above:

- [ ] Tests written and passing — **`bun run build` FIRST, then `npm test`.** `npm test` is `vitest run` alone and does NOT build; there is deliberately no `pretest` hook, so tsup builds do not race on one `dist/` (`package.json`'s `//test` note). A stale `dist/` is refused by `assertDistIsFresh` in `lib/testing/dist-staleness.ts`, which says to build — and a run that aborts on the guard collects ZERO tests, and a zero-test run reads as a pass if only the exit code is checked
- [ ] Type check passes (`tsc --noEmit`)
- [ ] No ESLint errors
- [ ] No `console.log` left in code
- [ ] No commented-out code
- [ ] Use `createTempDir()` / `cleanupTempDir()` in tests (not raw `mkdtemp`)
- [ ] Type definitions updated if public API changed

---

## Key Documentation

- [docs/architecture.md](../../docs/architecture.md) — how the workspaces fit, generated code, tests and gates
- [docs/briefing.md](../../docs/briefing.md) — how a brief states a fact, and what a report owes back
- [todo/cli.md](../../todo/cli.md) — active tasks and blockers

<critical-reminder>
1. You do NOT write code. Delegate to sub-agents. Tell them to read CLAUDE.md.
2. Trace ALL scenarios after any fix.
3. NEVER run ANY git command that writes (add, commit, reset, stash, checkout, restore, clean, push). Read-only git is allowed. So is a `commit-plan` skill run (rule 5). The user curates their staging area intentionally.
</critical-reminder>

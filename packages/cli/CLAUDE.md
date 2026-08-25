<critical-requirement>
1. NEVER write implementation code or edit test files directly. Always delegate to CLI developer or CLI tester. No exceptions for "small" or "quick" fixes.

2. When delegating to a sub-agent, tell it to read CLAUDE.md before starting work.

3. After any fix, trace ALL scenarios through the code before calling it done.

4. ALWAYS read [.ai-docs/DOCUMENTATION_MAP.md](./.ai-docs/DOCUMENTATION_MAP.md) before working on any area of the codebase. It indexes verified documentation for every major system.

5. NEVER run ANY git command that WRITES — no `git add`, `commit`, `reset`, `stash` (push/pop/drop), `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`, amend. READ-ONLY git is allowed (owner clarification 2026-08-09): `git status`, `log`, `show`, `diff`, `blame`, `stash list` — use it to check history and verify changes. The user curates their staging area intentionally. This applies to sub-agents too — state both halves when delegating.
</critical-requirement>

# Project Memory for Claude

This file provides behavioral rules and conventions. For codebase reference documentation, see `.ai-docs/`.

## Workspace Directories

| Directory                   | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| `/home/vince/dev/cli`       | CLI tool (this repo) - entry point for all operations |
| `/home/vince/dev/skills`    | Plugin marketplace - skills, agents, stacks           |
| `/home/vince/dev/cv-launch` | Test project - install targets for testing            |

## NEVER do this

### Git & Workflow

- NEVER run ANY git command that WRITES (`git add`, `commit`, `reset`, `stash` push/pop/drop, `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`) — the user curates their staging area intentionally; if you think you need to discard working tree changes, ask the user how to proceed. Read-only git (`status`, `log`, `show`, `diff`, `blame`, `stash list`) is allowed — use it to verify rather than guess
- NEVER use git worktrees (`isolation: "worktree"`)
- NEVER introduce new workflow patterns (tools, flags, strategies) that the user hasn't explicitly requested
- NEVER put machine-specific absolute paths in any file tracked by git

### Type Safety & Casts

- NEVER cast a valid union member — not `as SkillId`, not `as SkillSlug`, and not `as any`. The literal string IS the type. `as any` on a union member is the same defect with the type-checking of every sibling property switched off as well, and it is why 36 pure-noise casts in one file made the 2 doing real work invisible. Only cast at parse boundaries (YAML, JSON, CLI args) or for deliberately invalid error-path test data (testing that bad IDs produce errors). Before fabricating an out-of-union ID, check whether the function's signature can even receive one — if the parameter is typed to the union, a non-union value is unreachable in production and the test asserts about an impossible input; use a real union member that fails the runtime check instead (a valid `SkillId` absent from the set under test). Fabricated IDs at a boundary that genuinely accepts unvalidated input should use `string` type, not casts.
- NEVER use `as unknown as T` double casts — fix the upstream type instead
- NEVER use `{} as Record<K, V>` — use `const x: Partial<Record<K, V>> = {}` with a type annotation
- NEVER use `matrix.skills[id]!` non-null assertions — use `getSkillById(id)` from `matrix/matrix-provider.ts`

### Data Integrity

- NEVER use optional chaining (`?.`) or null coalescing (`?? ""`, `|| []`) on data that must exist — use asserting lookups. Silent fallbacks hide bugs.
- NEVER build multi-tier resolution fallbacks (try exact → try alias → try directory name). Data matches on the first lookup or it's an error.
- NEVER fall back to `path.basename(dir)` as a skill ID — use `frontmatter.name` from `parseFrontmatter()`
- NEVER derive `slug`, `domain` or `category` from a skill ID or directory path — **in product code, and in test factories and fixtures**. All three are stated metadata fields; look them up in one table and throw on a miss (`getCanonicalSkillTaxonomy()` in `__tests__/factories/skill-factories.ts` is the shape). The rule read as product-only while it named only `slug`, and both breaches lived in the test layer behind `as Domain` / `as CategoryPath` casts, deriving categories the shipped catalogue contradicts. Deriving a display name from the slug the lookup returned is fine; deriving anything from the id is not.
- NEVER print a skill or agent `displayName` inside a block that describes the filesystem — anything under a "copied to:" / "compiled to:" / path header. Those entries are literal directory and file names, so use the id or the basename of the recorded `destPath`; a user must be able to copy any line out of such a block and `cd` into it. The init report printed `Reviewing/` and `CLI Reviewing/` for directories named `meta-reviewing-reviewing/` and `meta-reviewing-cli-reviewing/`. `displayName` is for selection UI, search results and change summaries only (the `+ Reviewing` / `~ Reviewing` lines in `edit.tsx` describe choices, not paths). This is the inverse of the `path.basename` rule above, not a restatement of it.
- NEVER add backward-compatibility shims or legacy fallbacks — the project is pre-1.0. Remove old code cleanly.
- NEVER let plugin install per-skill failures silently produce orphan config entries. If `installPluginSkills` returns non-empty `failed`, hard-error (`this.error(..., { exit: EXIT_CODES.ERROR })`) BEFORE `writeConfigAndCompile` runs. Warnings for user context are fine; persisting `config.ts` entries claiming `origin: "<marketplace>"` for skills that never installed is not. Uninstall failures are diagnostic-only.

### Scope Awareness (project vs global)

- NEVER hardcode `projectDir` for skill/agent paths when a skill has a `scope` field — use `os.homedir()` for `"global"` scope, `projectDir` for `"project"` scope
- NEVER use `path.join(projectDir, LOCAL_SKILLS_PATH)` without checking scope — global-scoped local skills live at `~/.claude/skills/`, not `<project>/.claude/skills/`
- NEVER load global local skills as a fallback only when project has none — always merge both project and global local skills (project takes precedence on conflict)
- NEVER pass a uniform scope to `claudePluginInstall`/`claudePluginUninstall` for multiple skills — each skill has its own scope in its `SkillConfig`
- NEVER let a marketplace `primarySource` override a user's saved `origin` in config — a saved origin (`EJECT_SOURCE`, which is `"eject"`, or a marketplace name) always takes priority over computed defaults. The field is `origin`; it was `source` and every doc that still says so is stale, including the `forkedFrom.source` beside it, which is a DIFFERENT field and was not renamed
- NEVER use conditional fallbacks like `if (x.length === 0) { use fallback }` when both primary and fallback data should always be merged
- NEVER refuse to record a global config change the same run already made on global DISK or in the global plugin registry. "Never modify global config from project-level operations" governs global state the operation did **not** touch, and reading it as an invariant about ALL global state is what deleted a shipped feature once: `executeMigration` resolves each skill's paths from ITS OWN scope, so a project-context edit that switches a global-scoped skill between plugin and eject has already copied it under `$HOME` and moved its user-scope registration before the config is written. Refusing the config write protects nothing — it leaves disk saying eject, the global config saying plugin and the registry empty, and the three e2e specs under "edit source switch -- scope-aware migration" went red with the switch never running. **Config authority follows the work actually performed, and no further:** `recordGlobalSourceMigrations` in `commands/edit.tsx` rewrites exactly the ids `executeMigration` acted on this run that are active at global scope, and only their `origin` field — never `marketplace`, `stack`, `agents` or another project's view. Never widen `authoritativeScope` to `"all"` to achieve it; `"owned"` in `configuration/config-merger.ts` is the roster's rule and is deliberately untouched by this. And before implementing a refusal for any user-visible operation, grep the e2e suite for specs that exercise it and assert it succeeds — a refusal is a product change, where a divergence between two persisted views of one operation is a bug, and making the two views agree is the smaller fix.
- NEVER report a single path for artifacts that are split by scope. The rules above cover WRITING; scope-blind DISPLAY code kept passing review because nothing covered reporting. If a command prints where skills or agents live, derive the paths from the same scope-aware read that produced the counts, and print one block per non-empty scope (global first, then project) — see `reportAgentsCompiled` in `commands/init.tsx` and `formatInstallationDisplay` in `lib/plugins/plugin-info.ts`. `list` once printed "Agents: 9" directly above a project directory holding zero, because the counts had been fixed to sum both scopes and the path had not.
- NEVER carry a single `agentsDir` / `skillsDir` on a display or report type. Model it as the list of directories that actually hold content (`InstallationInfo.agentDirs: string[]`), so an empty scope is structurally unrepresentable in the output. Where such a field has no reader at all, delete it rather than widening it — a field with no reader has no shape to get right, and widening invents a contract nothing asked for.

### Test Assertions

- NEVER define local parser/extractor helpers inside a test file (loops, regex scans, state machines that pick data out of rendered output or config text). If the helper has non-trivial logic it would need its OWN tests to be trusted. Instead: assert directly on the raw output with `toContain`, `toMatchInlineSnapshot`, or a structural load (e.g., `loadProjectConfig` for config.ts). If a helper is genuinely reusable across tests, live it in `src/cli/lib/__tests__/helpers/` WITH its own tests — never inline and untested. That directory is the ONLY home for a tested helper: no vitest project collects `*.test.ts` under `e2e/helpers/` — the projects in `vitest.config.ts` include only `src/**` and `scripts/**`, and those in `e2e/vitest.config.ts` require an `.e2e.test.ts` or `.smoke.test.ts` suffix — so a helper test written there never runs while looking like coverage. E2E specs reach these helpers through `e2e/helpers/test-utils.ts`, which imports each one by name and names it in its single `export { ... }` block; `normalizeGlobalConfig` and `writeTestPackageJson` are the live examples of that route, and `journey-page.ts` is one carrying its own `journey-page.test.ts` beside it.
- NEVER let a shared assertion helper's signature overstate what it checks. Nobody opens a helper they are calling, so the signature is what every call site believes, and two halves of it fail silently. The TYPE: `skillIds?: readonly string[]` where `SkillId[]` is meant, on all four expectation types that have call sites — `ConfigExpectations` (`toHaveConfig`), `expectPhaseSuccess`, `expectDualScopeInstallation` and `toHaveAgentDynamicSkills` — so a typo, a display name or a slug is accepted and reported about. This is the factory rule below ("ALWAYS type factory function parameters with the narrowest union type") arriving from the assertion end. And the MECHANISM: `toHaveConfig` checks `marketplace` and `origin` by loading the file through `loadConfigOrFail`, each with a comment saying an unkeyed `includes` was answered by whichever occurrence came first — while its `skillIds` check, a few statements above that load, is `content.includes(id)`, a substring scan satisfied by an id inside a comment, inside a tombstone the expectation never named, or inside a longer id containing it. **Where a matcher already loads the artefact structurally for one field, every field it claims is checked structurally**; a mixed matcher is worse than a wholly textual one, because the rigorous fields make the others look rigorous. The option-NAME half is `clean-code-standards.md` 15.11 and is not restated. The type census is a worklist rather than a verdict — an id at a boundary that genuinely accepts unvalidated input stays `string`, as `skippedUnknownSkills` in `utils/messages.ts` correctly does:

```
grep -rnE 'skillIds\??: (readonly )?string\[\]' e2e src --include='*.ts' --include='*.tsx'
```

- NEVER split/loop/regex-scan `lastFrame()` output in component tests — use `toContain("+ React")` or snapshot the frame. The rendered frame is the contract; that's what you assert.
- NEVER broaden an assertion to make a failing test pass — investigate why it fails. If it's a fixture limitation, keep the strict assertion as a commented-out `// KNOWN GAP:` with an explanation. If it's a product bug, mark the test `it.fails`.
- NEVER encode a known gap in an assertion's ARITY, LENGTH or ABSENCE. The rule above covers a test that FAILS because of a gap; this covers the more common one that PASSES because of it — a data-loss bug is usually consistent, so the assertion recording it looks like any other green invariant. `toHaveLength(1)` over a grouped map, `toBeUndefined()` on a field another layer is meant to populate, and a test named for what does not happen all pin a defect in a form no search for the defect can find, and they redden only when the fix lands — reading as a regression the change caused rather than a pin it was meant to retire. Name the gap in the assertion itself: the group key (`byCategory["uncategorized"]`), or a full `toStrictEqual` against a named constant. And put the pin in the test whose subject IS the gap — an arity pin riding along in a plugin-count test is somewhere no one retiring the gap has reason to look.
- NEVER let a spec's NAME claim validation that its mocks have removed. If the module owning the parse is mocked, the assertion is a pass-through and the name must say so — or the mock must be dropped for that spec. `matrix-loader.test.ts` mocks `loadConfig`, which is where `schema.safeParse(raw)` runs, and then asserts the loader's return equals the mock's own input: after mocking, the code under test is `return data.categories`, so a spec named for loading AND validating exercised neither. This shape is invisible to every gate — it type-checks, lints and passes — and it survived the `required` flag being retired from the schema **because the schema never ran**, leaving the dead field sitting on both sides of one `toStrictEqual` where it read as an ordinary expected value. The tell is a mocked collaborator whose whole job is the thing the test name promises. Census: for each `vi.mock` of a parsing or loading module, check whether any spec in that file names "validates", "rejects" or "schema" while relying on the mock's return value.

```
grep -rln 'vi.mock' src --include='*.test.ts' --include='*.test.tsx' | xargs grep -lE 'it\("[^"]*(validat|reject|schema)'
```

- NEVER bind an assertion to a constant that merely has the same VALUE as the literal it replaces, and never bind a RENDERING assertion to the constant the product renders. Two halves, both learned by getting them wrong in one pass on 2026-08-25. **Same value is not the same concept**: a negative assertion must bind to the constant that governs ITS OWN test's data. `SKILLS.react.id` inside a spec fed by `MULTI_SOURCE_PUBLIC_SKILLS`, or by a hand-written config-source blob, trades a stale-literal vacuum for a **diverged-constant** vacuum and is strictly worse — repoint the constant and the assertion silently searches for a string the fixture never contained, while reading as rigorous. `config-source-sections.test.ts` (whose subject is a string slicer and whose ids are byte markers, not skill identities) and `skill-resolution.integration.test.ts` are the live examples, both correctly left as literals. **And a rendering assertion must keep its literal**: an assertion that imports the very constant the component renders cannot fail when that constant changes, because both sides move together. `wizard-layout.test.tsx` states this at the top of the file and `e2e/pages/constants.ts` exists to MIRROR the product's strings rather than import them, for exactly this reason — so `RESIZE_PROMPT`, `SCROLL_MORE_ABOVE`, `DOCTOR_UNOWNED_INSTALL` and `SCOPE_PROJECT` living only in that mirror is the design, not a gap to close. The rule that separates the two: bind when the literal names a SYMBOL whose deletion should break the test (a `SkillId`, an `AgentName`), because deletion is then a compile error; keep the literal when it is TEXT the product renders. Eight proposed conversions were stopped by this, each of which would have introduced the defect the pass was removing.
- NEVER assert a directory listing, roster or generated union by count alone (`toHaveLength(n)`). Assert the members with `toStrictEqual` against a named constant. A count tells you something changed; only the members tell you what, and a count cannot detect a swap — one role removed and another added leaves it green. Check with `grep -rn -A4 'await readdir(' src e2e --include='*.ts' --include='*.tsx' | grep 'toHaveLength('`.
- NEVER pin an operation as REFUSED without pinning, in the same file, a state where the same operation is ALLOWED. A refusal on its own cannot tell a correctly-scoped guard from one that has swallowed its entire domain — both leave the config and the filesystem byte-identical and both exit 0, so the assertion reads the same either way and stays green while the guard grows. The guard that produced this rule refused a dual-scope skill as a unit: refusing the INHERITED global half was correct, and because it fired on the pair, the project's OWN half became unremovable too, so "remove a skill from this project" had no reachable subject at all in a global-first installation — with every spec covering the refusal green throughout. `isGloballyLockedSkill` and `blocksExclusiveSwap` in `stores/wizard-store.ts` hold the narrowed version. Copy the shape of `e2e/lifecycle/dual-scope-s-round-trip-space-inert.e2e.test.ts`: one `it` where spacebar DROPS the project half of a pair, and one beside it where spacebar is an inert global-locked no-op on the agent row — neither assertion means anything without the other. The pair goes in ONE file; a permitted case sitting in a different spec is not a control, because nothing makes the two move together. The guard-named specs are the worklist, and `global-skill-toggle-guard.e2e.test.ts` and `global-agent-toggle-guard.e2e.test.ts` are both all-refusal today:

```
ls e2e/*/*guard*
```

- NEVER delete an unused binding in a test file without triaging it first — it is a signal, not lint noise. In production code a dead variable is usually just dead; in a test it is very often the thing the author meant to assert on, so it marks the exact spot where an assertion was planned and never written. A destructured `stdout` / `lastFrame` / `exitCode` that is never asserted on means the test ran the code and checked nothing about the result. An unused type import on an assertion helper usually means its parameters were restated structurally and are no longer shape-checked — which then licenses the inline-test-data violation at every call site. An unused factory import usually means the fixture beside it is built inline. Delete only after establishing the binding names nothing the test should have asserted; where the intended assertion is not obvious, report it rather than inventing one, and never weaken an existing assertion to make the report go away.
- NEVER add a key-press method to an E2E step page object without calling `waitForWizardFooter()` first — React effects may not have fired yet, causing handlers to silently no-op. NEVER call it on a screen that is not rendered by `WizardLayout` — it is a one-string match on the wizard footer text `"select"`, so on the dashboard (or any other footer-less screen) it hangs for the full 45s timeout instead of settling — `BaseStep.defaultTimeout` is `TIMEOUTS.WIZARD_LOAD`, which is `45_000`. The rule covers `BaseStep` subclasses only; non-wizard page objects need their own screen-specific sentinel.

### Test Data

- NEVER construct test data inline — use factories from `__tests__/factories/` and `__tests__/helpers/` and fixtures from `__tests__/fixtures/create-test-source.ts`. If a factory doesn't exist, create one.
- NEVER create custom mock skills when a canonical `SKILLS.*` entry from `test-fixtures.ts` would work
- NEVER call `createMockMatrix(SKILLS.react)` inline when a pre-built constant exists in `mock-matrices.ts`
- NEVER pass the entire `SKILLS` registry to `createMockMatrix` — spread individual entries
- NEVER construct `ProjectConfig`, `ProjectSourceConfig`, or `AgentScopeConfig[]` inline — use `buildProjectConfig()`, `buildSourceConfig()`, `buildAgentConfigs()`
- NEVER write inline SKILL.md frontmatter or agent YAML template strings — use `renderSkillMd()`, `renderAgentYaml()` from `content-generators.ts`
- NEVER repeat agent metadata strings inline — use `AGENT_DEFS` from `mock-agents.ts`
- NEVER put TODO/task IDs in test names (`describe()`, `it()`), assertion messages (2nd arg to `expect`), or inline test comments. Task IDs belong in file-level JSDoc ONLY, if anywhere. Test names describe BEHAVIOR ("version field is not emitted on init"), not tickets. Assertion messages describe the INVARIANT ("config.ts must not contain version field"), not the ticket that added it. Names rot — IDs look authoritative but become meaningless once the task is closed.
- NEVER define path/timeout/text constants locally in E2E test files — use `DIRS`, `FILES`, `TIMEOUTS`, `SOURCE_PATHS`, `STEP_TEXT`, `EXIT_CODES` from `e2e/pages/constants.ts`
- NEVER write a helper function in an E2E test file without first grepping `e2e/helpers/test-utils.ts` and `e2e/fixtures/` for an existing one

### Code Style

- NEVER create redundant type aliases — use `Pick<>`, `Partial<>`, or `&`. Check `types/` first.
- NEVER add unnecessary comments — only when unintuitive, complex, or for edge cases
- NEVER reassign constants to other constants — use the original directly
- NEVER build intermediate data structures imperatively — use `.map()`, `.flatMap()`, or literal arrays
- NEVER export constants only used within the same file — run grep before adding `export`. Exception: helpers that build an identity or lookup key that more than one surface must agree on. Export those before a second caller exists — the export is the single definition every surface is meant to call, not an oversight. Live examples: `skillSlotKey` and `agentSlotKey` in `src/cli/lib/wizard/scope-diff.ts`; two surfaces each writing their own skill key is what made the Sources tab and the confirm step disagree. Nothing else is exempt.
- NEVER export a shared constant whose value holds a mutable array or object, where callers receive it BY IDENTITY. One `push` anywhere corrupts every holder, and no type flags it: the fields are declared mutable, so the trap is invisible at every call site and at the declaration alike. Return a fresh value from a factory instead — `validResult()` in `lib/validation-result.ts` is the pattern, and its docblock states the reason where the const used to be; it pairs with `invalidResult(msg)`, which is a second gain, because a const beside a factory was the real inconsistency. Where the named concept is not worth keeping, independent literals at each site cost ten duplicated lines and buy no singleton, no cross-module coupling and no import. Reject `as const` / `readonly` where the fields are mutable on a widely-used type (it cascades), and reject `Object.freeze` outright: runtime-only, invisible to the type system, and a silent no-op outside strict mode. Live worklist — `NOTHING_RECOMPILED` in `lib/config-gate/recompile.ts` is exported, returned by `recompilePropagated` and used as a default parameter in `lib/config-gate/index.ts`, so several callers hold one `warnings: string[]`:

```
grep -rn -A6 -E '^(export )?const [A-Z][A-Z0-9_]+: [A-Z]' src/cli --include='*.ts' --include='*.tsx' | grep -E '\[\],?$|: \[\]'
```

- NEVER leave the key order of a nested record to whoever assembled it when that record is serialised. Canonicalise it **once in the writer**, not once per producer: a producer that REPLACES another's output rather than merging with it also replaces its ordering, and nothing downstream can tell. `canonicalizeStackOrder` in `lib/configuration/config-writer.ts` is the shape — run from `cleanForEmission`, sub-agent keys in code-unit name order and each sub-agent's category keys through `byCategoryDeclarationOrder` in `lib/matrix/matrix-provider.ts`, which is where the rule itself lives so the builder and the writer cannot disagree about it. The adjacent rule was already right and one level too shallow: `cleanForEmission` canonicalised the config's TOP-LEVEL field order for word-for-word this reason, while `stack` — a record of records — stayed as producer-dependent as the fields above it. Five modules assemble a stack (`grep -rn "Partial<Record<AgentName, StackAgentConfig>>" --include='*.ts' --include='*.tsx' src e2e`) and only the wizard's ordered anything, so a shared configuration rebuilt by `init --from` matched field for field and compiled a `web-developer.md` with two rows of its skill-activation table swapped — `buildAgentTemplateContext` splits `agent.skills` into preloaded and dynamic PRESERVING order, so the key order in `config.ts` IS the order the sub-agent is handed. Use `bytewise` from `utils/string.ts` or a bare `.sort()`, never `localeCompare` — see `clean-code-standards.md` 17.3.

  **The testing corollary, which is the half that let this run: a round trip needs one assertion comparing the two ends' GENERATED ARTEFACTS, not only each end against its own config.** Every config-level check held at both ends and could not fail — `skills` and `agents` are sorted by the generator, and `stack` is compared key-order-insensitively by any deep equality, so a difference consistent WITHIN each installation is invisible to all of them. `e2e/lifecycle/share-round-trip-compiled-bodies.e2e.test.ts` is the gate: it builds its origin through the wizard, shares, reinstalls with `init --from`, asserts the config sides agree (deliberately, to say which assertion carries the red) and then compares `readCompiledAgents` at both ends with `toStrictEqual`. Copy its two guards as well as its comparison — the roster is named against `E2E_STACK_AGENTS` rather than counted, because a count cannot see a swap and a swap is the subject; and `readCompiledAgents` answers `{}` for a directory that is not there, so two installations that compiled nothing satisfy the comparison for free.

- NEVER answer a `no-unused-vars` report on a CAUGHT ERROR by renaming it `_error`. Treat it as a bug report: the binding exists because an author meant to report the cause, and the reporting is what is missing. Renaming asserts "this cause does not matter", which on a diagnostic surface is almost never true — the `validate` command's whole job is telling a user what is wrong with their source repo, and two of its catches were dropping the reason, so a YAML syntax error surfaced as `Failed to parse YAML` with no line, no column and no cause while `parseYaml` had all three. `_error` is for genuinely irrelevant causes only, and the lint report is the smaller half of the class: it can only see the bound-and-discarded variant, and a bare `catch {}` discards the cause just as thoroughly while being invisible to it — see `clean-code-standards.md` § 3.6 for the unbound half and for the no-interpolation template literal that is its usual residue.
- NEVER write an `eslint-disable` for a rule you merely disagree with. The gate is that the construct is **required** and the rule's own escape hatch does not work, and the directive's comment carries the proof — not a restatement of what the rule said. **Where TypeScript is what requires the construct, the proof is the compiler error code**, and that is the bar for any new disable: `interface Assertion<T>` in `e2e/matchers/setup.ts` keeps its unused `T` because declaration merging matches on the parameter's NAME, so the rule's documented `^_` escape hatch does not compile — TS2428, `All declarations of 'Assertion' must have identical type parameters`. Where the compiler is not the reason, name the concrete thing that breaks instead: the `no-var` in `skill-factories.ts` names the TDZ crash `let` would cause under circular ESM imports, and the `no-unnecessary-condition` disables name the `Partial<Record>` slot whose `| undefined` `Object.entries` launders away. "The rule is annoying here" is not a reason and neither is "the fix is a big refactor". The reason goes after `--` on the directive line, or — where it needs more than a line — in the comment immediately above it.
- NEVER leave an inline disable where the idiom is general rather than local: fix it in `eslint.config.js` and delete the disable. `**/*.d.ts` turning `@typescript-eslint/triple-slash-reference` off is the live precedent — an ambient declaration file exists to contribute globals and a triple-slash reference is the only construct that does, which is true of every declaration file rather than of the one that reported it. An override plus a redundant disable is worse than either alone, and `linterOptions.reportUnusedDisableDirectives` is `"error"` in this package, so a directive suppressing nothing fails the lint run rather than scrolling past. Census, and the six sites carrying their reason above the line rather than after `--`:

```
grep -rn -B1 'eslint-disable' src e2e scripts --include='*.ts' --include='*.tsx' | grep 'eslint-disable' | grep -v -- ' -- '
```

## ALWAYS do this

### Delegation & Process

- ALWAYS write a brief under [`.ai-docs/standards/briefing.md`](./.ai-docs/standards/briefing.md), and read it before executing one. A brief is the prompt one agent hands another; it is never written to the tree, so **no checker can open one** and the discipline is the whole enforcement. The four that bind hardest: **re-derive before you write** — every figure and symbol in a brief was measured against a tree that has since moved, and an agent whose row does not describe the tree stops on it and reports rather than inventing work to justify it; **a brief carries the command, not its result** — no count in a brief, write the invocation that produces one; **corrections are a required field of every report**, with "nothing" written out when nothing was wrong, because a silent report is indistinguishable from a brief that held — and the orchestrator accumulates them, one line per dispatch in the programme's progress file, since a correction read once and discarded measures nothing; and **name the files each lane owns** whenever more than one agent is working, so a change wanted in another lane's file is reported rather than made. Ruled 2026-08-19 and not re-litigated: the verifier is never the fixer, a verdict carries a reproduction rather than a judgement, and deleting a claim beats rewriting it
- ALWAYS delegate implementation and test code to sub-agents. Tell them to read CLAUDE.md. Tell them: "Do NOT run any git commands."
- ALWAYS trace ALL scenarios through the code after any fix
- ALWAYS grep for the old value when changing test data or renaming anything
- ALWAYS search for all call sites when removing a workaround
- ALWAYS visit every call site and record its posture when changing a function from returning a SENTINEL to THROWING. The change is not complete until each one has chosen abort (the failure makes the operation unsafe) or degrade (the operation must still run without it), and there is no safe default: swallowing the throw makes a broken install look absent, letting it escape aborts commands that must survive it. `loadProjectConfigFromDir` in `lib/configuration/project-config.ts` returns `null` only when the file is ABSENT and throws `ConfigLoadError` when it exists and cannot be loaded — most of its production sites carry the decision in a comment, and the one that was missed loaded the config inside a `Promise.all` with a `.then()` and no `.catch`, so `uninstall` died before deleting anything precisely when the config was corrupt, two functions away from its own comment saying that must never happen. **A `Promise.all` member is a call site**: the throw is nowhere near a `try`, and the non-throwing `fileExists` / `directoryExists` members around it make the block read as total. `loadUninstallConfig` in `commands/uninstall.tsx` is the degrade posture written out; `ensureConfigReadable` on `BaseCommand` (over `findConfigLoadFailures`) is the abort posture hoisted to startup; and `configuredSkillIds` in `lib/content-validator.ts` is the remaining `Promise.all` shape, safe because it reaches `doctor` through a `readsConfig: true` row and `safeCheck`, so a throw becomes a failed row rather than an aborted command — which is a posture, stated here because it is not visible in that function.
- When a task is deferred, ALWAYS set its `Status` to `Deferred` in `todo/cli.md` — never delete the row
- ALWAYS write a finding to `.ai-docs/agent-findings/` when a sub-agent fixes an anti-pattern, discovers a missing standard, or notices convention drift — use the template from `.ai-docs/agent-findings/TEMPLATE.md`
- ALWAYS tell sub-agents: "If you fix an anti-pattern or discover a missing standard, write a finding to `.ai-docs/agent-findings/` using the template in `.ai-docs/agent-findings/TEMPLATE.md`"

### Releasing

- ALWAYS follow the release checklist in `.ai-docs/standards/commit-protocol.md`. This package publishes as `agents-inc` — one package, one version, one `npm publish`. There is no second package to bump; the `agents-inc` alias that used to shadow it was folded into this one in 0.150.0.

### Scope Awareness

- ALWAYS use `resolveInstallPaths(projectDir, scope)` with the explicit scope parameter when resolving skill/agent directories
- ALWAYS split skill lists by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`) before any path-dependent operation (copy, delete, install, uninstall)
- ALWAYS load both project AND global local skills and merge them — see `src/cli/lib/loading/source-loader.ts` and `src/cli/commands/compile.ts` for the correct pattern
- ALWAYS preserve the saved `origin` from config over any computed default when restoring wizard state. `buildSkillConfigForId` in `stores/wizard-store.ts` is the one shape: `origin: saved?.origin ?? defaultOriginFor(matrix.skills[id])`, and the fallback is not `primarySourceName` on its own — `defaultOriginFor` answers `EJECT_SOURCE` for a skill the matrix flags local-only and `primarySourceName(skill) ?? DEFAULT_PUBLIC_SOURCE_NAME` for everything else. Dropping the local-only arm gives a locally-written skill a marketplace origin, which names an install that cannot happen

### Type Safety

- ALWAYS use type guards (`isCategory()`, `isDomain()`, `isAgentName()` from `utils/type-guards.ts`) instead of `as` casts for runtime narrowing
- ALWAYS use `getSkillById(id)` from `matrix/matrix-provider.ts` for skill lookups where the skill must exist. Only use `matrix.skills[id]` when genuinely optional.
- ALWAYS use `parseFrontmatter()` from `lib/loading/loader.ts` for SKILL.md parsing
- ALWAYS type factory function parameters with the narrowest union type (`SkillId`, not `string`). Error-path tests cast at the call site. **The one exception, which this rule's silence about it produced a false bug row on 2026-08-25:** a factory that must serve BOTH the public catalogue and a non-catalogue namespace — fixture marketplaces through `e2eSkillId` / `testMarketplaceSkillId`, and external skills — keeps `<Id extends string>`, and `buildSkillConfigs` in `__tests__/helpers/wizard-simulation.ts` is the live case. Narrowing it has only two outcomes and both are forbidden elsewhere in this file: casting a namespaced id into a union it is not in (`e2eSkillId` is deliberately typed `string` and says so — "casting it into one would be a lie about the catalogue"), or substituting a catalogue id, which `refuseCatalogueCollisions` in `lib/loading/source-loader.ts` rejects at load, so a fixture marketplace shipping one is refused whole and the specs asserting `1/1 skills found` die. Such a factory carries a docblock saying why, and an audit narrowing these excludes them BY THAT DOCBLOCK rather than by count. Measure any such narrowing against **both** projects before filing it — `npx tsc --noEmit` alone reported 6 errors in 1 file where `npx tsc -p e2e/tsconfig.json --noEmit` reported 83 across 31.
- ALWAYS use `typedEntries()` / `typedKeys()` from `utils/typed-object.ts` (not raw `Object.entries()`)

### Test Data

- ALWAYS prefer `SKILLS.*` from `test-fixtures.ts` over `createMockSkill()` for standard domain skills
- ALWAYS use `createMockMatrix` spread syntax: `createMockMatrix(SKILLS.react, SKILLS.hono)`
- ALWAYS use spread isolation `{ ...SKILLS.react }` when passing to functions that mutate objects in-place
- ALWAYS use pre-built matrix constants from `mock-matrices.ts` instead of inline `createMockMatrix(SKILLS.*)` calls
- ALWAYS use config factories: `buildProjectConfig()`, `buildSourceConfig()`, `buildAgentConfigs()`, `buildSkillConfigs()`
- ALWAYS use `AGENT_DEFS` from `mock-agents.ts` for agent metadata
- When fixing test data, ALWAYS evaluate the construction pattern too, not just the values
- ALWAYS read `.ai-docs/standards/e2e/README.md` before writing or modifying E2E tests
- ALWAYS use `toStrictEqual` (not `toEqual`) for object and array comparisons in assertions
- ALWAYS verify config AND filesystem after any operation that changes either. If a test completes a wizard flow or runs a command that creates, modifies, or removes files or config entries, assert the resulting state of both. If it should NOT change something, snapshot before and assert identical after. Never check only one side.
- ALWAYS constrain a shared expected-value constant to the generated union it mirrors — `as const satisfies readonly AgentName[]`, `satisfies Record<string, readonly SkillId[]>`. A constant that merely mirrors `AGENT_NAMES` or `SKILL_IDS` and is not held against them exports its own type errors: retiring three agents produced 25 `tsc` errors across four consumer files (19 in one integration spec) and **none** at the line that actually held the stale name, and the message named the value only as an unassignable member of an inferred union rather than as this constant's own. Constrained, a removal reddens the one line that owns it. This says nothing about where the clause goes — an object with getters takes it on the member arrays, not on the object, for reasons that are `typescript-types-bible.md` § 10's subject and are not restated here. The worklist is every `as const` in the two expected-value modules with no clause on it; an object wrapper whose members each carry one is § 10's correct shape and an expected hit:

```
grep -rn 'as const' src/cli/lib/__tests__/expected-values.ts e2e/fixtures/expected-values.ts | grep -v 'as const satisfies'
```

---

## Test Data Factories

Use factories from `__tests__/factories/` and `__tests__/helpers/` and constants from `__tests__/mock-data/`. Grep for `createMock*`, `build*`, `SKILLS.*`, `AGENT_DEFS.*`, `render*` to find what's available. Never inline test data — if a factory doesn't exist, create one.

```
Is it a complete skill/agent/category object?
├─ YES → Use factory from factories/ (createMockSkill, createMockAgent, createMockCategory)
└─ NO → Is it a full project directory structure?
    ├─ YES → Use createTestSource() from fixtures/create-test-source.ts
    └─ NO → Does it create a config, matrix, or stack?
        ├─ YES → Use a factory (createMockMatrix, buildWizardResult, etc.) — NEVER inline
        └─ NO → Is it a partial object for one test case?
            ├─ YES → Inline is fine
            └─ NO → Use factory with overrides parameter
```

---

## Code Conventions

- **File naming:** kebab-case for ALL files and directories
- **Exports:** Named exports only (no default exports). Use `.js` extensions on relative imports in new files. Exception — a default export is required wherever a framework loads the module by it: oclif commands (`src/cli/commands/**`) and hooks (`src/cli/hooks/**`), and tool configs (`*.config.*`, plus `e2e/global-setup.ts`). Never "fix" these to named exports — config loaders read `.default` and nothing else, and oclif's undocumented named-export fallback just scans siblings and takes the first match; neither breaks at `tsc`, only at runtime. Nothing else is exempt.
- **Constants:** No magic numbers or hardcoded strings — use `STANDARD_FILES.*`, `STANDARD_DIRS.*`, `UI_SYMBOLS.*`, `CLI_COLORS.*` from `consts.ts` (and `EXIT_CODES.*` from `lib/exit-codes.ts`)
- **Error handling:** `getErrorMessage(error)` for unknown errors, `this.handleError(error)` in commands, `EXIT_CODES.*` constants, no silent catch blocks
- **Logging:** `warn()` for user issues, `verbose()` for diagnostics, `log()` for always-visible
- **TypeScript:** Zero `any` without justification, no `@ts-ignore` without comment, Zod schemas at parse boundaries, all remaining casts must have comments explaining why

---

## Pre-Commit Checklist

Items not already covered by NEVER/ALWAYS rules above:

- [ ] Tests written and passing — **`bun run build` FIRST, then `npm test`.** `npm test` does NOT build: it is `vitest run` and nothing else, and there is deliberately no `pretest` hook (`package.json`'s `//test` note records it being removed to stop three tsup builds racing on one `dist/`). So `npm test` refuses a stale `dist/` exactly as a bare `vitest run` does — `assertDistIsFresh` in `lib/testing/dist-staleness.ts` names it and tells you to build. **This line claimed the opposite until 2026-08-25**, which is worth knowing because the failure is quiet in one direction: a run that aborts on the guard collects ZERO tests, and a zero-test run reads as a pass if only the exit code is checked
- [ ] Type check passes (`tsc --noEmit`)
- [ ] No ESLint errors
- [ ] No `console.log` left in code
- [ ] No commented-out code
- [ ] Use `createTempDir()` / `cleanupTempDir()` in tests (not raw `mkdtemp`)
- [ ] Type definitions updated if public API changed

---

## Key Documentation

| Document                                                           | Purpose                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| [.ai-docs/DOCUMENTATION_MAP.md](./.ai-docs/DOCUMENTATION_MAP.md)   | Codebase documentation index                           |
| [.ai-docs/standards/briefing.md](./.ai-docs/standards/briefing.md) | How a brief states a fact, and what a report owes back |
| [todo/cli.md](../../todo/cli.md)                                   | Active tasks and blockers                              |

<critical-reminder>
1. You do NOT write code. Delegate to sub-agents. Tell them to read CLAUDE.md.
2. Trace ALL scenarios after any fix.
3. NEVER run ANY git command that writes (add, commit, reset, stash, checkout, restore, clean, push). Read-only git is allowed. The user curates their staging area intentionally.
</critical-reminder>

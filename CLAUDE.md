<critical-requirement>
1. NEVER write implementation code or edit test files directly. Always delegate to CLI developer or CLI tester. No exceptions for "small" or "quick" fixes.

2. When delegating to a sub-agent, tell it to read CLAUDE.md before starting work.

3. After any fix, trace ALL scenarios through the code before calling it done.

4. ALWAYS read [.ai-docs/DOCUMENTATION_MAP.md](./.ai-docs/DOCUMENTATION_MAP.md) before working on any area of the codebase. It indexes verified documentation for every major system.

5. NEVER run ANY git commands that modify the staging area or working tree — no `git add`, `git reset`, `git stash`, `git checkout`, `git restore`, `git clean`. The user curates their staging area intentionally. This applies to sub-agents too — explicitly forbid git commands when delegating.
</critical-requirement>

# Project Memory for Claude

This file provides behavioral rules and conventions. For codebase reference documentation, see `.ai-docs/`.

## Workspace Directories

| Directory                          | Purpose                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `/home/vince/dev/cli`              | CLI tool (this repo) - entry point for all operations |
| `/home/vince/dev/skills`           | Plugin marketplace - skills, agents, stacks           |
| `/home/vince/dev/cv-launch`        | Test project - install targets for testing            |

## NEVER do this

### Git & Workflow
- NEVER run ANY git command that modifies the staging area or working tree (`git add`, `git reset`, `git stash`, `git checkout`, `git restore`, `git clean`) — the user curates their staging area intentionally; if you think you need to discard working tree changes, ask the user how to proceed
- NEVER use git worktrees (`isolation: "worktree"`)
- NEVER introduce new workflow patterns (tools, flags, strategies) that the user hasn't explicitly requested
- NEVER put machine-specific absolute paths in any file tracked by git

### Type Safety & Casts
- NEVER use `as SkillId` or `as SkillSlug` casts on valid union members — the literal string IS the type. Only cast at parse boundaries (YAML, JSON, CLI args) or for deliberately invalid error-path test data (testing that bad IDs produce errors). Fabricated test IDs that aren't in the union should use `string` type, not casts.
- NEVER use `as unknown as T` double casts — fix the upstream type instead
- NEVER use `{} as Record<K, V>` — use `const x: Partial<Record<K, V>> = {}` with a type annotation
- NEVER use `matrix.skills[id]!` non-null assertions — use `getSkillById(id)` from `matrix/matrix-provider.ts`

### Data Integrity
- NEVER use optional chaining (`?.`) or null coalescing (`?? ""`, `|| []`) on data that must exist — use asserting lookups. Silent fallbacks hide bugs.
- NEVER build multi-tier resolution fallbacks (try exact → try alias → try directory name). Data matches on the first lookup or it's an error.
- NEVER fall back to `path.basename(dir)` as a skill ID — use `frontmatter.name` from `parseFrontmatter()`
- NEVER derive `slug` from skill ID or directory path — `slug` is a required field in metadata, always pass it explicitly
- NEVER add backward-compatibility shims or legacy fallbacks — the project is pre-1.0. Remove old code cleanly.
- NEVER let plugin install per-skill failures silently produce orphan config entries. If `installPluginSkills` returns non-empty `failed`, hard-error (`this.error(..., { exit: EXIT_CODES.ERROR })`) BEFORE `writeConfigAndCompile` runs. Warnings for user context are fine; persisting `config.ts` entries claiming `source: "<marketplace>"` for skills that never installed is not. Uninstall failures are diagnostic-only.

### Scope Awareness (project vs global)
- NEVER hardcode `projectDir` for skill/agent paths when a skill has a `scope` field — use `os.homedir()` for `"global"` scope, `projectDir` for `"project"` scope
- NEVER use `path.join(projectDir, LOCAL_SKILLS_PATH)` without checking scope — global-scoped local skills live at `~/.claude/skills/`, not `<project>/.claude/skills/`
- NEVER load global local skills as a fallback only when project has none — always merge both project and global local skills (project takes precedence on conflict)
- NEVER pass a uniform scope to `claudePluginInstall`/`claudePluginUninstall` for multiple skills — each skill has its own scope in its `SkillConfig`
- NEVER let a marketplace `primarySource` override a user's saved `source` in config — saved source (`"local"` or marketplace name) always takes priority over computed defaults
- NEVER use conditional fallbacks like `if (x.length === 0) { use fallback }` when both primary and fallback data should always be merged

### Test Assertions
- NEVER define local parser/extractor helpers inside a test file (loops, regex scans, state machines that pick data out of rendered output or config text). If the helper has non-trivial logic it would need its OWN tests to be trusted. Instead: assert directly on the raw output with `toContain`, `toMatchInlineSnapshot`, or a structural load (e.g., `loadProjectConfig` for config.ts). If a helper is genuinely reusable across tests, live it in `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own tests — never inline and untested.
- NEVER split/loop/regex-scan `lastFrame()` output in component tests — use `toContain("+ React")` or snapshot the frame. The rendered frame is the contract; that's what you assert.
- NEVER broaden an assertion to make a failing test pass — investigate why it fails. If it's a fixture limitation, keep the strict assertion as a commented-out `// KNOWN GAP:` with an explanation. If it's a product bug, mark the test `it.fails`.
- NEVER add a key-press method to an E2E step page object without calling `waitForWizardFooter()` first — React effects may not have fired yet, causing handlers to silently no-op. NEVER call it on a screen that is not rendered by `WizardLayout` — it is a one-string match on the wizard footer text `"select"`, so on the dashboard (or any other footer-less screen) it hangs for the full 15s timeout instead of settling. The rule covers `BaseStep` subclasses only; non-wizard page objects need their own screen-specific sentinel.

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
- NEVER export constants only used within the same file — run grep before adding `export`

## ALWAYS do this

### Delegation & Process
- ALWAYS delegate implementation and test code to sub-agents. Tell them to read CLAUDE.md. Tell them: "Do NOT run any git commands."
- ALWAYS trace ALL scenarios through the code after any fix
- ALWAYS grep for the old value when changing test data or renaming anything
- ALWAYS search for all call sites when removing a workaround
- When a task is deferred, ALWAYS move it to `TODO-deferred.md` — never delete
- ALWAYS write a finding to `.ai-docs/agent-findings/` when a sub-agent fixes an anti-pattern, discovers a missing standard, or notices convention drift — use the template from `.ai-docs/agent-findings/TEMPLATE.md`
- ALWAYS tell sub-agents: "If you fix an anti-pattern or discover a missing standard, write a finding to `.ai-docs/agent-findings/` using the template in `.ai-docs/agent-findings/TEMPLATE.md`"

### Scope Awareness
- ALWAYS use `resolveInstallPaths(projectDir, scope)` with the explicit scope parameter when resolving skill/agent directories
- ALWAYS split skill lists by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`) before any path-dependent operation (copy, delete, install, uninstall)
- ALWAYS load both project AND global local skills and merge them — see `src/cli/lib/loading/source-loader.ts` and `src/cli/commands/compile.ts` for the correct pattern
- ALWAYS preserve saved `source` from config over computed `primarySource` when restoring wizard state — `saved?.source ?? primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME`

### Type Safety
- ALWAYS use type guards (`isCategory()`, `isDomain()`, `isAgentName()` from `utils/type-guards.ts`) instead of `as` casts for runtime narrowing
- ALWAYS use `getSkillById(id)` or `getSkillBySlug(slug)` from `matrix/matrix-provider.ts` for skill lookups where the skill must exist. Only use `matrix.skills[id]` when genuinely optional.
- ALWAYS use `parseFrontmatter()` from `lib/loading/loader.ts` for SKILL.md parsing
- ALWAYS type factory function parameters with the narrowest union type (`SkillId`, not `string`). Error-path tests cast at the call site.
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
- **Exports:** Named exports only (no default exports). Use `.js` extensions on relative imports in new files.
- **Constants:** No magic numbers or hardcoded strings — use `STANDARD_FILES.*`, `STANDARD_DIRS.*`, `UI_SYMBOLS.*`, `CLI_COLORS.*` from `consts.ts` (and `EXIT_CODES.*` from `lib/exit-codes.ts`)
- **Error handling:** `getErrorMessage(error)` for unknown errors, `this.handleError(error)` in commands, `EXIT_CODES.*` constants, no silent catch blocks
- **Logging:** `warn()` for user issues, `verbose()` for diagnostics, `log()` for always-visible
- **TypeScript:** Zero `any` without justification, no `@ts-ignore` without comment, Zod schemas at parse boundaries, all remaining casts must have comments explaining why

---

## Pre-Commit Checklist

Items not already covered by NEVER/ALWAYS rules above:

- [ ] Tests written and passing (`npm test`)
- [ ] Type check passes (`tsc --noEmit`)
- [ ] No ESLint errors
- [ ] No `console.log` left in code
- [ ] No commented-out code
- [ ] Use `createTempDir()` / `cleanupTempDir()` in tests (not raw `mkdtemp`)
- [ ] Type definitions updated if public API changed

---

## Key Documentation

| Document                                     | Purpose                         |
| -------------------------------------------- | ------------------------------- |
| [.ai-docs/DOCUMENTATION_MAP.md](./.ai-docs/DOCUMENTATION_MAP.md) | Codebase documentation index    |
| [TODO.md](./todo/TODO.md)                    | Active tasks and blockers       |

<critical-reminder>
1. You do NOT write code. Delegate to sub-agents. Tell them to read CLAUDE.md.
2. Trace ALL scenarios after any fix.
3. NEVER run ANY git commands that modify the staging area or working tree. The user curates their staging area intentionally.
</critical-reminder>

---
last_validated: 2026-04-21
---

# Anti-Patterns

Every "never do this" rule with rationale. Organized by category.

---

## Session and Keystroke Leakage

### Never import `TerminalSession` in test files

**What:** `import { TerminalSession } from "../helpers/terminal-session.js"` in a `.e2e.test.ts` file.

**Why:** `TerminalSession` is the raw PTY layer. Tests must use page objects (wizards and steps) to interact with the terminal. Direct session access bypasses all the framework's timing, text matching, and navigation logic.

**Instead:** Use `InitWizard.launch()`, `EditWizard.launch()`, `InteractivePrompt`, or `DashboardSession`.

### Never call session methods in test files

**What:** `session.waitForText()`, `session.enter()`, `session.arrowDown()`, `session.space()`, `session.write()` in test code.

**Why:** These are low-level terminal operations. Every keystroke needs a delay after it, and every text check needs a timeout. The framework handles this internally.

**Instead:** Use step methods: `wizard.stack.selectFirstStack()`, `build.selectSkill("react")`, `agents.toggleAgent("API Developer")`.

---

## Timing Leakage

### Never use `delay()` in test files

**What:** `await delay(500)` or `await delay(STEP_TRANSITION_DELAY_MS)` in an `it()` block.

**Why:** The framework encapsulates all timing in `BaseStep` methods. Delays in tests are a sign that the test is working at the wrong abstraction level.

**Instead:** All step methods include appropriate delays internally. If you need to wait for something, use a step method or `waitForText` through a page object.

### Never use `setTimeout` in test files

**What:** `await new Promise(r => setTimeout(r, 1000))` or similar.

**Why:** Same as above. Manual timing is fragile and makes tests flaky.

**Instead:** The framework handles all timing. Use `{ timeout: TIMEOUTS.LIFECYCLE }` for tests that need more time.

### Never reference `INTERNAL_DELAYS` in test files

**What:** `import { INTERNAL_DELAYS } from "../pages/constants.js"` or using `INTERNAL_DELAYS.STEP_TRANSITION`.

**Why:** `INTERNAL_DELAYS` is exported only for the framework's internal use (BaseStep, DashboardSession, InteractivePrompt). Tests should not know about keystroke timing.

**Instead:** Use `TIMEOUTS` for per-test timeout overrides. The framework handles all internal delays.

---

## Filesystem in Tests

### Never use `writeFile`/`mkdir` in `it()` blocks

**What:** `await writeFile(path.join(projectDir, ".claude-src", "config.ts"), content)` inside a test.

**Why:** This couples the test to the config file format. When the format changes, the test breaks even though the CLI behavior didn't change.

**Instead:** Use `ProjectBuilder` methods in `beforeEach` or as inline fixture calls. If `ProjectBuilder` doesn't support your scenario, extend it with a new static method rather than inlining. See `ProjectBuilder.dualScopeWithImport()` as an example of encapsulating complex setup. See [test-data.md](./test-data.md).

### Never use `readFile`/`readdir` in `it()` blocks for assertions

**What:** `const content = await readFile(configPath, "utf-8"); expect(content).toContain(...)`.

**Why:** This couples the test to the file's path and format. The assertion should describe what the user sees, not how the CLI stores it.

**Instead:** Use matchers: `await expect(project).toHaveConfig({ skillIds: [...] })`. See [assertions.md](./assertions.md).

### Never inline mkdir + createPermissionsFile for dual-scope setup

**What:** `await mkdir(fakeHome, { recursive: true }); await createPermissionsFile(fakeHome);` inside an `it()` block.

**Why:** `createTestEnvironment()` from `dual-scope-helpers.ts` does this correctly and includes the permissions file. Inlining risks forgetting `createPermissionsFile`, which causes flaky PTY hangs.

**Instead:** Use `const env = await createTestEnvironment()` which returns `{ fakeHome, projectDir, tempDir }`.

### Always capture and clean up ProjectBuilder temp dirs

**What:** `const project = await ProjectBuilder.editable({ ... });` without storing the parent temp dir.

**Why:** `ProjectBuilder.editable()` internally calls `createTempDir()` and creates a subdirectory. If only `project.dir` is stored, the parent temp dir leaks. Over many test runs, `/tmp` accumulates orphaned directories.

**Instead:** `tempDir = path.dirname(project.dir);` then clean up in `afterEach`:

```typescript
afterEach(async () => {
  if (tempDir) {
    await cleanupTempDir(tempDir);
    tempDir = undefined!;
  }
});
```

**Exception:** Lifecycle tests sometimes read specific file content for detailed assertions that no matcher covers (e.g., checking YAML frontmatter fields). This is acceptable in lifecycle tests where the assertion is about compilation output, not implementation details. If you find yourself doing this in 3+ places, add a matcher.

### Never construct paths with `path.join` in test assertions

**What:** `const configPath = path.join(dir, ".claude-src", "config.ts"); expect(await fileExists(configPath)).toBe(true)`.

**Why:** Testing file existence without checking content is weak (an empty file passes). And the path construction couples to directory structure.

**Instead:** Use content-aware matchers: `await expect({ dir }).toHaveConfig()`.

---

## Production Imports

### Never import from `src/cli/` in test files

**What:** `import { CLAUDE_DIR } from "../../src/cli/consts.js"` in a `.e2e.test.ts` file.

**Why:** E2E tests exercise the CLI as a black box. Importing production code breaks this boundary. It also means the test may silently depend on production behavior that changes.

**Instead:** Use `e2e/pages/constants.ts` for paths (`DIRS.CLAUDE`), files (`FILES.CONFIG_TS`), text (`STEP_TEXT`), timeouts (`TIMEOUTS`), and exit codes (`EXIT_CODES`).

**Acceptable:** `import type { SkillId } from "../../src/cli/types/index.js"` -- type-only imports have no runtime effect.

---

## Index-Based Navigation

### Never use counted arrow presses to reach items

**What:** `for (let i = 0; i < 7; i++) { await step.navigateDown(); }` to reach a specific item.

**Why:** Adding or reordering items breaks these tests silently. The test passes but selects the wrong item.

**Instead:** Navigate by name: `await agents.toggleAgent("API Developer")`, `await wizard.stack.selectStack("E2E Test Stack")`.

**Exception:** `InteractivePrompt` (non-wizard prompts like uninstall confirmation) may need index-based navigation because prompt items lack unique text. Document the assumption:

```typescript
// Navigate to "Remove plugins only" -- second option in prompt
await prompt.arrowDown();
```

---

## Hardcoded Strings

### Never use raw UI text in tests

**What:** `await expect(output).toContain("Choose a stack")` or `await expect(output).toContain("initialized successfully")`.

**Why:** When UI text changes, every test that hardcodes the old text breaks. Constants centralize the change to one file.

**Instead:** Use `STEP_TEXT` constants: `expect(output).toContain(STEP_TEXT.STACK)`, `expect(output).toContain(STEP_TEXT.INIT_SUCCESS)`.

### Never use inline timeout numbers

**What:** `it("test", { timeout: 180000 }, async () => {})` or `await wizard.waitForExit(60000)`.

**Why:** Magic numbers are impossible to grep for and easy to miscalibrate.

**Instead:** Use `TIMEOUTS` constants: `{ timeout: TIMEOUTS.LIFECYCLE }`.

### Never use hardcoded path segments

**What:** `".claude"`, `".claude-src"`, `"config.ts"`, `"SKILL.md"`.

**Instead:** Use `DIRS.CLAUDE`, `DIRS.CLAUDE_SRC`, `FILES.CONFIG_TS`, `FILES.SKILL_MD` from constants.

---

## Inline Test Data

### Never create project fixtures inline in tests

**What:** `await mkdir(path.join(tempDir, ".claude-src"), { recursive: true }); await writeFile(...)` inside a test file.

**Why:** Duplicates setup logic. When the config format changes, every inline fixture breaks.

**Instead:** Use `ProjectBuilder` methods or `writeProjectConfig()` from test-utils. See [test-data.md](./test-data.md).

### Never inline mkdir + writeFile for agent stubs

**What:** `await mkdir(agentsDir); await writeFile(path.join(agentsDir, "web-developer.md"), "---\nname: ...\n---\ncontent")` inside an `it()` block.

**Why:** Duplicates across files and couples tests to the agent file format.

**Instead:** Use a file-local `writeAgentStub()` or `writeAgentFile()` helper. If the pattern appears in 3+ files, extract to `test-utils.ts`.

**Exception:** When creating intentionally corrupt/invalid files for error-path tests, inline construction with an explanatory comment is acceptable.

---

## Duplicated Helpers

### Extract shared assertion helpers at 2+ files

**What:** The same assertion function or wizard navigation flow defined identically in two or more test files.

**Why:** Duplicated helpers drift. When one copy is updated, the other silently becomes incorrect.

**Instead:**

- Assertion functions used in 2+ files -> extract to `e2e/assertions/` (e.g., `config-assertions.ts`, `scope-assertions.ts`)
- Common wizard navigation patterns (e.g., "complete edit from build step") -> methods on the wizard page object (e.g., `EditWizard.completeFromBuild()`)
- Setup patterns used in 3+ files -> new `ProjectBuilder` static method
- Assertion patterns -> new custom matcher in `project-matchers.ts`

---

## Creating New Helpers

### Always check existing shared helpers before writing local ones

**What:** Defining a local function in a test file (e.g., `function skillsPath(...)`, `function addForkedFromMetadata(...)`) without first checking `test-utils.ts`, `dual-scope-helpers.ts`, and `constants.ts`.

**Why:** The shared utilities grow over time. A helper you need likely already exists. Duplicating it means two copies that drift apart.

**Before writing any helper function in a test file:**

1. Grep `e2e/helpers/test-utils.ts` for the function name or a similar name
2. Grep `e2e/fixtures/` for related helpers
3. Grep `e2e/pages/constants.ts` for the constant value
4. Grep `e2e/assertions/` for assertion utilities
5. Grep `e2e/fixtures/expected-values.ts` for expected value constants

**Where new helpers belong:**

- Path helpers (like `skillsPath`, `agentsPath`) -> `test-utils.ts`
- Dual-scope lifecycle helpers -> `dual-scope-helpers.ts`
- Constants (paths, timeouts, text) -> `constants.ts`
- Project creation patterns -> new `ProjectBuilder` method
- Assertion utilities -> `e2e/assertions/` (phase-assertions, scope-assertions, uninstall-assertions)
- Agent matchers -> `e2e/matchers/agent-matchers.ts`
- Expected value constants -> `e2e/fixtures/expected-values.ts`

---

## Parser/Extractor Helpers in Test Files

### Never define parser/extractor helpers with non-trivial logic inside a test file

**What:** A local helper like `getSkillPrefixesByScope(output, skillName)` — a loop, a regex scan (`/([+\-~\u2022])\s+[A-Za-z]/`), a `currentScope` state-machine variable that toggles on label matches, or a first-match-wins rule that plucks diff prefixes out of `lastFrame()` / `getFullOutput()`.

**Why:**

1. **The helper has non-trivial logic and no tests.** A state machine and a regex capturing one of several diff characters would need its own tests to be trusted. An uninstrumented parser silently produces wrong answers when layout changes.
2. **It obscures the rendered contract.** The actual contract is the substring `"+ React"` / `"• React"` in the frame. A parsed-struct indirection hides what the component produces and what the bug shape looks like.
3. **It drops the bug-shape negative check.** `toStrictEqual` on a parsed struct only implicitly negates at the scopes the helper happened to look. Explicit `not.toContain("<bug-prefix> <name>")` is strictly stronger.

**Instead:** Assert directly on `lastFrame()` / `getFullOutput()` with `toContain("<prefix> <name>")` for each expected row plus explicit `not.toContain(...)` for every diff prefix that must NOT appear. When two rows share the same prefix, prove it by exhaustively negating all other prefixes (see [assertions.md § Diff-Shape Assertions](./assertions.md)).

If a helper is genuinely reusable across 2+ test files, move it to `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own unit tests — never inline and untested.

See `.ai-docs/agent-findings/2026-04-21-complex-helpers-in-component-tests-anti-pattern.md` and `.ai-docs/agent-findings/2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md`.

---

## Weak Assertions

### Never wrap assertions in fileExists conditionals

**What:** `if (await fileExists(settingsPath)) { expect(settings).toHaveProperty("permissions"); }`

**Why:** If the file is missing (e.g., because the command failed to create it), the entire assertion block is silently skipped. The test appears to pass with zero assertions executed.

**Instead:** Assert the file exists unconditionally first, then check content:

```typescript
expect(await fileExists(settingsPath)).toBe(true);
const settings = JSON.parse(await readTestFile(settingsPath));
expect(settings).toHaveProperty("permissions");
```

Or better, use a matcher: `await expect(project).toHaveSettings({ hasKey: "permissions" })`.

### Never assert generic absence

**What:** `expect(output).not.toContain("error")`.

**Why:** Matches any text containing "error", including legitimate content like skill IDs or help text.

**Instead:** Assert specific absence: `expect(output).not.toContain("Failed to archive")`.

### Never assert existence without content

**What:** `expect(await fileExists(configPath)).toBe(true)`.

**Why:** An empty or corrupted file passes this check.

**Instead:** Use content-aware matchers: `await expect(project).toHaveConfig({ skillIds: [...] })`.

---

## Type Casts

### Never use `as SkillId` on valid union members

**What:** `"web-framework-react" as SkillId` in test code.

**Why:** The literal string `"web-framework-react"` is already a valid `SkillId`. The cast adds noise.

**Instead:** Use the literal string directly. Only cast at parse boundaries (YAML/JSON) or for deliberately invalid test-only IDs.

---

## Assertion Quality

### Never use existence-only assertions

**What:** `expect(result).toBeDefined()` or `expect(await fileExists(path)).toBe(true)` without checking content.

**Why:** An empty file, wrong config, or partially-constructed object all pass.

**Instead:** Use content-aware matchers: `await expect(project).toHaveConfig({ skillIds: [...] })` or read and verify content.

### Never use count-only assertions

**What:** `expect(array).toHaveLength(3)` without verifying WHICH items.

**Why:** 3 wrong items pass the same as 3 right items.

**Instead:** `expect(array.sort()).toStrictEqual([...exactItems])` or use assertion utilities like `expectConfigSkills`.

### Never use `expect.arrayContaining` for diff-shape collections

**What:** `expect(rows).toEqual(expect.arrayContaining([{ prefix: "•", name: "React" }]))` for info-panel rows, config section diffs, or scope-per-skill prefix maps.

**Why:** `arrayContaining` passes as long as the expected entries exist — it silently tolerates extra wrong entries. A spurious `- React` row alongside the expected `• React` (the D-230-class "bug shape") ships undetected.

**Instead:** `toStrictEqual` on a scope-anchored slice so the entire rendered shape is pinned. If a positive-only match is unavoidable, pair it with an explicit `.not.toEqual(expect.arrayContaining([<bug-shape>]))`. See [assertions.md § Diff-Shape Assertions](./assertions.md).

### Never use bare matcher calls

**What:** `await expect(project).toHaveConfig()` or `await expect(project).toHaveCompiledAgents()` without parameters.

**Why:** Only checks the file exists, not its content. A corrupted or wrong config passes.

**Instead:** Always pass parameters: `toHaveConfig({ skillIds: [...], agents: [...], source: "..." })`.

### Never omit negative assertions after removals

**What:** After uninstall/deselection, only checking what remains — not checking that removed items are gone.

**Why:** If the removal failed silently, the test still passes because the remaining items are present.

**Instead:** Use `expectCleanUninstall(dir)` or add explicit `notContains` / `toHaveNoLocalSkills()` checks.

### Never check the wrong scope directory

**What:** `await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer")` when agents compile to `fakeHome`.

**Why:** In dual-scope setups, agents default to global scope. Compiled agents go to `$HOME/.claude/agents/`, not `<project>/.claude/agents/`.

**Instead:** Check the correct directory for each scope. Use `expectDualScopeInstallation` for structured dual-scope checks.

### Never use toHaveAgentDynamicSkills for preloaded skills (or vice versa)

**What:** Checking for a preloaded skill in the body, or a dynamic skill in frontmatter.

**Why:** Preloaded skills appear in YAML frontmatter `skills:` array. Dynamic skills appear in `<skill_activation_protocol>` body section. They're mutually exclusive.

**Instead:** Check `create-e2e-source.ts` — `createMockSkillAssignment(id, true)` = preloaded (use `toHaveAgentFrontmatter`), default = dynamic (use `toHaveAgentDynamicSkills`).

### Never write assertion values without verifying them against production code

**What:** Writing `expect(config.agents).toStrictEqual([{ name: "web-developer", scope: "project" }])` without checking what the code actually produces.

**Why:** This was the #1 source of incorrect assertions (30+ instances). Common mistakes:

- Agents default to `scope: "global"`, not `"project"`
- Config preserves skills in domain iteration order, not alphabetical
- `compactStackAssignments` compacts `{ id, preloaded: false }` to bare string IDs
- `toStrictEqual` treats `excluded: undefined` as different from a missing `excluded` property

**Instead:** Read the production source to understand exact return types. Run the test once to see actual values. Only then write the expected values.

### Never use broad negative assertions on merged configs

**What:** `expect(projectConfig).not.toContain('"source":"eject"')` on a config that contains both project-scoped and global-scoped entries.

**Why:** The merged config contains entries from BOTH scopes. An excluded global entry legitimately retains `"source":"eject"` as a tombstone. A broad `not.toContain` catches entries from the wrong scope.

**Instead:** Target the specific scope's entry with a regex or use `toHaveConfig` which checks config content at a higher level:

```typescript
const projectHonoSource = config.match(/"api-framework-hono","scope":"project","source":"([^"]+)"/);
expect(projectHonoSource![1]).not.toBe("eject");
```

### Never assume skill ordering is alphabetical

**What:** `expect(config.skills.map(s => s.id)).toStrictEqual(["api-framework-hono", "web-framework-react", "web-state-zustand"])` (alphabetical).

**Why:** Config preserves skills in domain iteration order (web skills first, then api, then meta). The actual order is `["web-framework-react", "web-state-zustand", "api-framework-hono"]`.

**Instead:** Sort both sides: `expect(config.skills.map(s => s.id).sort()).toStrictEqual([...expected].sort())`, or use `expectConfigSkills` which normalizes ordering automatically.

---

## Rules Carried Forward from the Old Bible

These rules from the original `e2e-testing-bible.md` remain valid:

- **No task IDs anywhere except file-level JSDoc.** Never include `D-NNN` / `P-BUILD-1` / `Bug A` tokens in `describe()` names, `it()` names, assertion messages (2nd arg to `expect`), or inline test-body comments. Test names describe BEHAVIOR ("renders spurious minus on G→P toggle"), assertion messages describe INVARIANTS ("config.ts must not contain version field"). IDs look authoritative but rot once the task closes. See `.ai-docs/agent-findings/2026-04-21-task-ids-in-test-names-sweep-needed.md` (151 occurrences across 30 files — pending sweep).
- **`ensureBinaryExists()` in `beforeAll`.** Every test file must verify the CLI binary exists.
- **`describe.skipIf()` for external dependencies.** Plugin tests use `describe.skipIf(!claudeAvailable)`. Marketplace tests use `describe.skipIf(!hasSkillsSource)`.
- **Split files at 300 LOC** or when covering 2+ unrelated concerns.
- **Never test the Claude CLI binary from E2E tests.** Testing `claude plugin install` directly is a smoke test. Place in `smoke/` with `.smoke.test.ts` extension.
- **`it.fails()` for known bugs.** Document the bug with a comment. When fixed, removing `it.fails()` makes the test pass.
- **Use `createTempDir()` / `cleanupTempDir()`.** Never import `mkdtemp` or `os.tmpdir()` directly.

---

## Related

- [test-structure.md](./test-structure.md) -- The golden rule and cleanup conventions
- [assertions.md](./assertions.md) -- Matcher patterns
- [patterns.md](./patterns.md) -- Correct patterns for each test type

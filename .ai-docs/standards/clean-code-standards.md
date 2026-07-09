---
last_validated: 2026-04-21
---

# Clean Code Standards

Enforceable rules from 70+ refactoring tasks across 9 iterations. Each rule is reviewer-checkable.

---

## 1. View Components

**1.1 No business logic in components.** Components render JSX. Computations, data transforms, and side effects go in hooks or the store.

```tsx
// BAD: inline useCallback with store logic in a component
const onToggle = useCallback(
  (subcat, techId) => {
    /* store logic */
  },
  [store, matrix],
);

// GOOD: extracted hook returns the props object
const buildStepProps = useBuildStepProps({ store, matrix, installedSkillIds });
return <StepBuild {...buildStepProps} />;
```

**1.2 Extract hooks when a component has 3+ hooks (useCallback/useEffect/useInput) for one concern.** Name `use-{concern}.ts` in `components/hooks/`. Accept a typed options object, return a typed result object.

**1.3 Split components at 300 LOC or 2+ distinct UI sections.** The parent becomes a thin orchestrator.

**1.4 Sub-components used only within a single file stay in that file.** Do not create separate files for `Footer`, `LegendRow`, `SkillTag`, `SearchPill`, etc. when they are only rendered by their parent component.

---

## 2. Function Size & Decomposition

**2.1 Decompose functions over 50 LOC or with 2+ distinct phases (I/O + transform, fetch + process).** Sequential I/O operations (create dir, copy file, write manifest) can stay in one function. Name helpers for what they do, not when they run.

```ts
// BAD: 75-line function doing I/O + transform + render
async function compileAgent(name, agent, root, engine) {
  /* everything inline */
}

// GOOD: thin orchestrator calling focused helpers
async function compileAgent(name, agent, root, engine) {
  const files = await readAgentFiles(name, agent, root);
  const data = buildAgentTemplateContext(name, agent, files);
  return engine.renderFile("agent", sanitizeCompiledAgentData(data));
}
```

**2.2 Use a typed options object for 4+ parameters.**

```ts
// BAD
async function resolveAgentNames(specified, config, agents, outputDir, pluginDir) {}
// GOOD
async function resolveAgentNames(params: ResolveAgentNamesParams) {}
```

**2.3 Helpers that don't need instance state are module-level functions, not methods.**

---

## 3. Error Handling

**3.1 Use `getErrorMessage(error)` from `utils/errors.ts` for all unknown error values.** Never inline `error instanceof Error ? error.message : String(error)`.

```ts
// BAD
catch (error) { warn(`Failed: ${error instanceof Error ? error.message : String(error)}`); }
// GOOD
catch (error) { warn(`Failed: ${getErrorMessage(error)}`); }
```

**3.2 Use `this.handleError(error)` in oclif command catch blocks for general errors.** Defined in `base-command.ts` -- calls `getErrorMessage()` and exits with `EXIT_CODES.ERROR`. Use `this.error(message, { exit: EXIT_CODES.X })` directly when you need a specific exit code or custom message.

```ts
// BAD: inline error extraction
catch (error) { this.error(error instanceof Error ? error.message : "Unknown error", { exit: 1 }); }
// GOOD: general catch-all
catch (error) { this.handleError(error); }
// ALSO GOOD: specific exit code needed
catch (error) { this.error(getErrorMessage(error), { exit: EXIT_CODES.INVALID_ARGS }); }
```

**3.3 No silent catch blocks.** Log with `verbose()` at minimum. Bare `catch {}` is acceptable only for existence checks and optional feature detection (e.g., `fileExists`, `isClaudeCLIAvailable`).

```ts
// BAD
catch { return []; }
// GOOD
catch (error) { verbose(`Failed to load: ${getErrorMessage(error)}`); return []; }
```

**3.4 Logging level rules.** `warn()` for user-visible issues (always shown). `verbose()` for diagnostic info (gated by `--verbose`). `log()` for always-visible progress. In oclif commands, use `this.log()` / `this.warn()`. Follow the style guide in `logger.ts`: capital first letter, single-quoted dynamic values, no "Warning:" prefix, lowercase after colons.

---

## 4. Constants

**4.1 Use `CLI_COLORS.*` from `consts.ts` for all color strings in components.** Values: `PRIMARY` (cyan), `SUCCESS` (green), `ERROR` (red), `WARNING` (yellow), `INFO` (blue), `NEUTRAL` (gray), `FOCUS` (cyan), `UNFOCUSED` (white), `WHITE` (white), `LABEL_BG` (#383838). Exceptions: `"#000"` (literal black on colored bg), `"blackBright"` (non-semantic border shade).

```tsx
// BAD                              // GOOD
<Text color="cyan">Selected</Text>  <Text color={CLI_COLORS.PRIMARY}>Selected</Text>
```

**4.2 Use named constants from `consts.ts` for all file/directory name strings.** Key constants: `STANDARD_FILES.*`, `STANDARD_DIRS.*`, `CLAUDE_DIR` (`.claude`), `CLAUDE_SRC_DIR` (`.claude-src`), `PLUGIN_MANIFEST_DIR` (`.claude-plugin`), `PLUGINS_SUBDIR` (`plugins`), `LOCAL_SKILLS_PATH`, `SKILLS_DIR_PATH`. Search `consts.ts` before hardcoding any path segment.

```ts
// BAD                                            // GOOD
path.join(dir, "metadata.yaml")                   path.join(dir, STANDARD_FILES.METADATA_YAML)
path.join(dir, ".claude-plugin")                  path.join(dir, PLUGIN_MANIFEST_DIR)
path.join(dir, ".claude", "agents")               path.join(dir, CLAUDE_DIR, "agents")
```

**4.3 No magic numbers.** Name all numeric constants `SCREAMING_SNAKE_CASE`.

**4.4 Group related constants in `as const` objects.** See `YAML_FORMATTING`, `UI_SYMBOLS`, `UI_LAYOUT` in `consts.ts`.

**4.5 User-facing message strings go in `utils/messages.ts`.** Grouped by category: `ERROR_MESSAGES`, `SUCCESS_MESSAGES`, `STATUS_MESSAGES`, `INFO_MESSAGES`. One-off messages used in a single location can remain inline.

**4.6 Watch for trailing punctuation in branding constants.** `DEFAULT_BRANDING.NAME` is `"Agents Inc."` (ends with a period). Do not add a period after it in sentences — it produces a double period.

```ts
// BAD — renders "maintained by Agents Inc.."
<Text>maintained by {DEFAULT_BRANDING.NAME}.</Text>

// GOOD — no extra period
<Text>maintained by {DEFAULT_BRANDING.NAME}</Text>
```

---

## 5. Security

**5.1 Validate user-supplied values used in filesystem paths.** Check null bytes, path traversal (`..`), slashes, and format before any `fs` operation.

**5.2 Validate resolved paths stay within expected parent directories.**

```ts
const normalizedPath = path.resolve(resolvedPath);
return normalizedPath.startsWith(path.resolve(expectedParent) + path.sep);
```

**5.3 Validate CLI arguments passed to `spawn()`.** Each argument type gets its own validator with: (1) empty/whitespace rejection, (2) length limit, (3) control character rejection, (4) format pattern allowlist. See `validatePluginPath()`, `validatePluginName()` in `exec.ts` and `validateMarketplaceName()` in `commands/new/marketplace.ts`.

**5.4 Sanitize user-controlled data before template rendering.** Strip Liquid syntax (`{{`, `}}`, `{%`, `%}`) before passing to the Liquid engine. See `sanitizeLiquidSyntax()` in `compiler.ts`.

**5.5 Use try-catch instead of check-then-use for security-critical filesystem operations.** When an untrusted path is involved (user input, skill IDs from YAML), attempt the operation and handle failure rather than checking first. Existence checks are fine for control flow with trusted paths (e.g., detecting optional template directories).

```ts
// BAD: race between check and operation on user-supplied path
if (await directoryExists(src)) await copy(src, dest);
// GOOD: attempt, handle failure
try {
  await copy(src, dest);
} catch (e) {
  warn(`Failed: ${getErrorMessage(e)}`);
}
```

**5.6 Enforce file size limits at parsing boundaries.** Use `readFileSafe(path, maxSizeBytes)` from `utils/fs.ts` for untrusted files. Named size constants in `consts.ts`: `MAX_MARKETPLACE_FILE_SIZE`, `MAX_PLUGIN_FILE_SIZE`, `MAX_CONFIG_FILE_SIZE`.

---

## 6. Testing

**6.1** Test file naming: `{module}.test.ts` next to the source, or `__tests__/` for shared test infrastructure and integration tests.

**6.2** Import shared utilities from these directories -- never redefine locally:

| Utility                                              | Source                                                    |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `fileExists`, `directoryExists`                      | `__tests__/helpers/` (test) or `utils/fs.ts` (production) |
| `readTestYaml`                                       | `__tests__/helpers/`                                      |
| `buildWizardResult`, `buildSourceResult`             | `__tests__/helpers/`                                      |
| `parseTestFrontmatter`                               | `__tests__/helpers/`                                      |
| `SKILLS.react`, `SKILLS.hono`, etc.                  | `__tests__/test-fixtures.ts` (canonical registry)         |
| `createMockSkill(id, overrides?)`                    | `__tests__/factories/skill-factories.ts`                  |
| `createComprehensiveMatrix()`, `createBasicMatrix()` | `__tests__/factories/matrix-factories.ts`                 |
| `createTestDirs()`, `cleanupTestDirs()`              | `__tests__/helpers/test-dir-setup.ts`                     |
| `createTempDir()`, `cleanupTempDir()`                | `__tests__/helpers/test-dir-setup.ts`                     |
| `createTestSource()`, `cleanupTestSource()`          | `__tests__/fixtures/create-test-source.ts`                |
| `createMockCategory(id, displayName, overrides?)`    | `__tests__/factories/category-factories.ts`               |

**6.3** Extract local test helpers when 3+ tests share identical setup/assertion logic.

```ts
async function expectFlagAccepted(args: string[]): Promise<void> {
  const { error } = await runCliCommand(args);
  const output = error?.message || "";
  expect(output.toLowerCase()).not.toContain("unknown flag");
}
```

**6.4** Use `SKILLS.*` from `test-fixtures.ts` for standard skill fixtures (e.g., `SKILLS.react`, `SKILLS.hono`). For custom skills not in the registry, use `createMockSkill(id, overrides?)` from `__tests__/factories/skill-factories.ts`. Do not define per-test skill factory functions. Available registry keys: `react`, `vue`, `zustand`, `pinia`, `scss`, `tailwind`, `vitest`, `hono`, `drizzle`, `antiOverEng` (methodology).

**6.5** Use named constants from `test-constants.ts` for keyboard input (`ARROW_UP`, `SPACE`, `ENTER`, `ESCAPE`) and timing (`RENDER_DELAY_MS`, `INPUT_DELAY_MS`, `STEP_TRANSITION_DELAY_MS`).

**6.6** Every exported utility function must have a test file.

**6.7** Use `createTempDir()`/`cleanupTempDir()` from `__tests__/helpers/test-dir-setup.ts` for temp directory lifecycle. **Never import `mkdtemp` from `fs/promises` or `os` for `tmpdir()` in test files** — these are the #1 recurring violation. If you see `import { mkdtemp }` or `import os from "os"` in a test file, replace with the helpers.

```ts
// BAD
let tempDir: string;
beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "test-"));
});
afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// GOOD
let tempDir: string;
beforeEach(async () => {
  tempDir = await createTempDir("cc-mytest-");
});
afterEach(async () => {
  await cleanupTempDir(tempDir);
});
```

**6.8** Place static fixture files (YAML configs, plugin structures, skill files) in `src/cli/lib/__tests__/fixtures/` with domain subdirectories. Use for data that tests validate against but don't modify.

```
src/cli/lib/__tests__/fixtures/
+-- agents/          # agent partials and templates
+-- commands/        # command test fixtures
+-- plugins/         # complete plugin directory structures
+-- skills/          # SKILL.md files
+-- stacks/          # stack definition files
+-- create-test-source.ts  # factory for dynamic fixture directories
```

For dynamic test data (created/modified per test), use factory functions from `__tests__/factories/` or `create-test-source.ts` instead.

**6.9** Test factory functions use the signature `(requiredParams..., overrides?: Partial<T>): T`. Required params identify the object; optional overrides customize it. Spread overrides last.

```ts
// Pattern used by all factory functions in __tests__/factories/
function createMockSkill(
  id: SkillId,
  overrides?: Partial<ResolvedSkill>,
): ResolvedSkill {
  return { id, /* defaults */, ...overrides };
}
```

**6.10** No `as` casts in tests. Use valid typed literals -- if a value doesn't type-check, fix the value or the type. Two exceptions require a `// Boundary cast:` comment: (1) intentionally invalid data for error-path testing (`const invalidId = "bad" as SkillId`), and (2) partial mock data at test fixture boundaries (`{ "web-developer": mockAgent } as Record<AgentName, AgentDefinition>`).

**6.11** No TODO/task IDs in test names (`describe()`, `it()`), assertion messages, or inline test comments. File-level JSDoc only. Names rot; IDs look authoritative but become meaningless once the task is closed or renumbered.

```ts
// BAD — task ID in describe block
describe("D-217 per-skill source-based plugin reference", () => { ... });

// BAD — task ID in it() name
it("D-229 hard-errors before writing config when install fails", () => { ... });

// GOOD — describe the behavior, not the ticket
describe("per-skill source-based plugin reference", () => { ... });
it("hard-errors before writing config when install fails", () => { ... });
```

**6.12** Use `toStrictEqual` for object and array equality in tests. `toEqual` silently tolerates extra keys with `undefined` values, masking contract drift.

```ts
// BAD — tolerates extra { someNewField: undefined } on the result
expect(result).toEqual({ id: "react", name: "React" });

// GOOD — catches accidental extra fields or shape drift
expect(result).toStrictEqual({ id: "react", name: "React" });
```

**6.13** Use pre-built matrix constants from `mock-matrices.ts` instead of inline `createMockMatrix(SKILLS.*)` calls. Only fall back to `createMockMatrix(...SKILLS.react, SKILLS.hono)` (spread individual entries — never pass the whole `SKILLS` registry) when no pre-built matrix fits. When a factory would mutate its input, spread for isolation: `createMockMatrix({ ...SKILLS.react })`.

**6.14** Use config factories — `buildProjectConfig()`, `buildSourceConfig()`, `buildAgentConfigs()`, `buildSkillConfigs()` from `__tests__/factories/config-factories.ts`. Never construct `ProjectConfig`, `ProjectSourceConfig`, or `AgentScopeConfig[]` inline. Use `AGENT_DEFS` from `__tests__/mock-data/mock-agents.ts` for agent metadata — never repeat agent strings inline.

**6.15** Use `renderSkillMd()` and `renderAgentYaml()` from `__tests__/content-generators.ts` for SKILL.md frontmatter and agent YAML. Never write inline template strings for skill or agent file content — the renderers track real schema drift.

**6.16** Verify config AND filesystem after any state-changing operation. If a test completes a wizard flow or runs a command that creates, modifies, or removes files or config entries, assert the resulting state of both. If the operation should NOT change something, snapshot before and assert identical after. Never check only one side.

**6.17** Do not split, loop, or regex-scan `lastFrame()` output in component tests. Assert directly with `toContain("+ React")` or snapshot the frame. The rendered frame is the contract; that's what you assert. For parser/extractor helpers with non-trivial logic, see 6.18.

**6.18** Never define parser/extractor helpers with non-trivial logic inside a test file (loops, regex scans, state machines that pick data out of rendered output or config text). If a helper is genuinely reusable across tests, live it in `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own tests — never inline and untested. Instead, assert directly on raw output with `toContain`, `toMatchInlineSnapshot`, or a structural load (e.g. `loadProjectConfig` for `config.ts`).

---

## 7. Type Safety

**7.1** Use `typedEntries()` / `typedKeys()` from `utils/typed-object.ts`. No `Object.entries(obj) as [K, V][]`.

```ts
// BAD                                                    // GOOD
(Object.entries(obj) as [AgentName, AgentConfig][])       typedEntries<AgentName, AgentConfig>(obj)
```

**7.2** Boundary casts (`as T`) are acceptable **only** at data entry points where typed code meets untyped data. Every cast requires a `// Boundary cast: <reason>` comment. If you cannot write the reason, the cast should not exist. The six acceptable categories:

1. **YAML/JSON parse** -- after Zod validation of parsed data. The Zod schema validates structure; the cast narrows the output type (especially with `.passthrough()`, see 7.5). Examples: `project-config.ts:39`, `loader.ts:33`.

2. **Filesystem** -- directory names and filenames are untyped strings that correspond to typed identifiers by convention. Example: `loader.ts:155` casts keys from a directory-name-keyed map to `SkillId`.

3. **Type narrowing after runtime validation** -- a value's compile-time type is wider than what runtime checks have established. The cast narrows to the validated subset. Example: `wizard-store.ts:146` casts `CategoryPath` to `Category` after domain lookup confirms existence.

4. **Data definition** -- literal data structures where TypeScript can verify the values but the container type is wider than the union. Example: `metadata-keys.ts:21` casts `"imported"` to `CategoryPath` in a constant definition.

5. **Framework (oclif)** -- framework types don't declare custom properties attached at runtime. Example: `base-command.ts:23` casts oclif's `Config` to access `sourceConfig` attached in the init hook.

6. **Test fixtures** -- test helpers that construct mock data are data entry boundaries. Partial mocks and intentionally invalid data are acceptable with a comment. Example: `mock-skills.ts` casts fictional skill IDs for test isolation.

Boundary casts are **NOT** acceptable for: mid-pipeline workarounds (fix the upstream return type instead), consumer code casts (fix the library's return type so all consumers benefit), or convenience casts to silence type errors without investigation.

**7.3** Use Zod schemas at JSON/YAML parse boundaries. No `JSON.parse(...) as T` in production code. For YAML files, use `readFileSafe(path, maxSizeBytes)` from `utils/fs.ts` for size-limited reads, then `parseYaml(content)` from the `yaml` package, then `schema.safeParse(parsed)` for validation. For JSON, parse then validate with `schema.safeParse()`. See `schema-validator.ts` and `local-skill-loader.ts` for the canonical pattern.

**7.4** Use `formatZodErrors(issues)` from `schemas.ts` for Zod error display. Pass `result.error.issues` (not the full error object). No inline `issues.map(...)`. Note: `schema-validator.ts` has a `formatZodErrors(error)` variant that takes the full `z.ZodError` and returns `string[]` for multi-error validation output (used by `plugin-validator.ts`).

**7.5** Post-safeParse `as T` is acceptable when `.passthrough()` widens Zod output. The `.passthrough()` option preserves unknown fields for forward compatibility, widening the output type to `{ ...fields... } & { [k: string]: unknown }`. The cast narrows back to the validated interface. Add a `// Boundary cast:` comment.

**7.6** No `as SkillId` / `as SkillSlug` / `as AgentName` / `as Category` / `as Domain` casts on valid union members. A literal string that matches the union IS the type — no cast required. Only cast at parse boundaries (see 7.2) or for intentionally invalid error-path test data. Fabricated test IDs that are not in the union should be typed `string`, not cast.

**7.7** No `{} as Record<K, V>` / `{} as Partial<Record<K, V>>`. Annotate the variable type instead.

```ts
// BAD
const counts = {} as Record<AgentName, number>;
// GOOD
const counts: Partial<Record<AgentName, number>> = {};
```

**7.8** No `as unknown as T` double casts. If you need two casts to express a type, the upstream return type or schema is wrong — fix it there.

**7.9** No non-null assertions on map/matrix lookups that have an asserting helper. Prefer `getSkillById(id)` / `getSkillBySlug(slug)` from `matrix/matrix-provider.ts` over `matrix.skills[id]!`. Use the raw index access only when the skill is genuinely optional.

**7.10** Type factory function parameters with the narrowest union type (`SkillId`, not `string`). Error-path tests that need invalid values cast at the call site with a `// Boundary cast:` comment — do not widen the signature to accommodate them.

**7.11** Use `parseFrontmatter()` from `lib/loading/loader.ts` for SKILL.md parsing. Do not re-implement frontmatter extraction or import a second parser — the loader already handles schema validation and gives a typed result.

**7.12** No redundant type aliases. Compose with `Pick<>`, `Partial<>`, `Omit<>`, or `&` before introducing a new named type. Check `src/cli/types/` for an existing alias first.

```ts
// BAD — duplicates existing ResolvedSkill fields
type SkillSummary = { id: SkillId; name: string; slug: SkillSlug };

// GOOD — derive from the source of truth
type SkillSummary = Pick<ResolvedSkill, "id" | "name" | "slug">;
```

---

## 8. DRY

**8.1** Extract a shared helper when the same 5+ lines appear in 3+ locations. Place in nearest shared scope.

**8.2** Three similar lines is acceptable. Do not prematurely abstract.

```ts
// OK: no abstraction needed
const identity = await readFile(path.join(dir, STANDARD_FILES.IDENTITY_MD));
const playbook = await readFile(path.join(dir, STANDARD_FILES.PLAYBOOK_MD));
const output = await readFileOptional(path.join(dir, STANDARD_FILES.OUTPUT_MD), "");
```

**8.3** Compose existing functions before creating new ones.

**8.4** Prefer Remeda utilities over hand-rolled loops when they improve clarity. Production: `unique`, `uniqueBy`, `sortBy`, `groupBy`, `mapValues`, `pipe`, `flatMap`, `filter`, `countBy`, `sumBy`, `difference`, `indexBy`, `zip`. Used across 20+ files.

**8.5** Do not reassign one constant to another. Use the original constant directly — `const MY_NAME = DEFAULT_BRANDING.NAME` is noise.

**8.6** Build derived collections with `.map()`, `.flatMap()`, or literal arrays. Do not declare an empty array and `push()` in a loop — the imperative build step is always a poorer read than the functional form.

---

## 9. Dead Code

**9.1** Remove exported functions with zero imports outside their file. Search first, then remove tests.

**9.6** Prefix intentionally unused parameters with `_` (e.g., `_onClose`, `_input`). This signals intent and suppresses linter warnings. Remove the parameter entirely if the interface allows it.

**9.2** Un-export symbols only used within their own file. If a module-level constant is only consumed to derive an exported value, keep it un-exported (e.g., `CLI_ROOT` -> `PROJECT_ROOT` in `consts.ts`).

**9.3** Delete skipped tests or fix them. No `it.skip` without a linked issue.

**9.4** Remove commented-out code. Git history is the archive.

**9.5** Delete barrel files (`index.ts`) that only re-export from 1-2 modules. Import directly from the source file. Barrel files are justified when they aggregate 5+ exports from multiple modules (see `lib/configuration/index.ts`, `lib/matrix/index.ts`).

---

## 10. Store Design

**10.1** Computed values depending only on store state go in the store as getters, not in components as `useMemo`. See `getStepProgress()` in `wizard-store.ts`.

```ts
// BAD: 20-line useMemo in component
const completedSteps = useMemo(() => {
  /* business logic */
}, [store]);
// GOOD: store getter
getStepProgress: () => {
  return { completedSteps, skippedSteps };
};
```

**10.2** Store actions extract pure business logic into module-level helpers. The action calls helpers + `set()`. Helpers receive data as arguments (no store dependency).

```ts
// Module-level (no store dependency)
function resolveSkillForPopulation(skillId, skills, categories) { ... }
// Store action: thin orchestrator
populateFromSkillIds: (ids, skills, cats) => set(() => {
  for (const id of ids) { const r = resolveSkillForPopulation(id, skills, cats); ... }
})
```

**10.3** Use `useRef` for one-time initialization guards, not `useState` (avoids unnecessary re-render). See `use-wizard-initialization.ts`.

**10.4** When a store or component has substantial pure logic (validation, filtering, option building), extract it into a `lib/{concern}/` module with an `index.ts` barrel. See `lib/wizard/build-step-logic.ts`.

---

## 11. Documentation

**11.1** Add JSDoc to exported functions over 20 LOC or with non-obvious behavior. Include `@param` and `@returns` for complex signatures.

**11.4** JSDoc `@example` tags must show actual literal values, not constant references. Documentation should be self-contained.

```ts
// BAD — reader must look up what DEFAULT_PLUGIN_NAME resolves to
/** @example DEFAULT_PLUGIN_NAME */

// GOOD — shows the actual value
/** @example "agents-inc" */
```

**11.2** Add field-level comments on type/interface fields with non-obvious semantics (e.g., `needsAny?: boolean` needs a comment explaining AND vs OR).

**11.3** When production behavior changes, update relevant docs. `docs/reference/architecture.md` for pipeline, data flow, or system design changes. `docs/reference/commands/index.md` for new flags, wizard steps, or keyboard shortcuts. `README.md` for user-facing setup instructions.

---

## 12. Console Output

**12.1** No `console.log` / `console.warn` / `console.error` in production code. Use `log()`, `warn()`, `verbose()` from `utils/logger.ts`. In oclif commands, use `this.log()` / `this.warn()`.

**12.2** Use named exit codes from `lib/exit-codes.ts`: `SUCCESS` (0), `ERROR` (1), `INVALID_ARGS` (2), `NETWORK_ERROR` (3), `CANCELLED` (4). No magic numbers in `process.exit()` or `this.error(..., { exit: })` calls.

**12.3** Follow the message style guide in `logger.ts` for all warning and log messages: capital first letter, single-quoted dynamic values (`'value'`), no "Warning:" prefix (added by `warn()`), lowercase after colons.

---

## 13. Imports

**13.1** New files use `.js` extensions on relative imports. Existing files keep their current style. Do not mix styles within a single file.

**13.2** No default exports. Use named exports only.

---

## 14. Comments

**14.1** Comments explain WHY, not WHAT. Do not add comments that restate what the code already says.

```ts
// BAD: restates the code
// Check if skill is installed
if (skill.installed) { ... }

// BAD: narrates control flow
// If no sources found, return early
if (sources.length === 0) return [];

// GOOD: explains non-obvious reason
// Must sort before dedup — uniqueBy keeps the first occurrence
const sorted = sortBy(skills, [s => s.priority]);
```

**14.2** Do not add section separator comments (`// --- Methods ---`, `// === Exports ===`). File structure should be self-evident from code organization.

**14.3** Do not narrate what happens next (`// approach is now set, step-stack.tsx will show DomainSelection`). Code flow speaks for itself.

**14.4** Do not restate a function or variable name in a comment above it (`// Pre-select domains inferred from stack` above `preselectDomainsFromStack()`).

**14.5** Acceptable comments: business rules not evident from code, workaround explanations, TODO items with context, gotchas (e.g., hoisting behavior), JSDoc on exported functions over 20 LOC (per rule 11.1), and `// boundary cast` annotations (per rule 7.2).

---

## 15. Data Integrity

**15.1 No optional chaining (`?.`) or null coalescing (`?? ""`, `|| []`) on data that must exist.** Silent fallbacks hide bugs. Use asserting lookups (e.g., `getSkillById(id)`) or throw explicitly. Optional chaining is for genuinely optional fields; it is not a shortcut to avoid thinking about invariants.

```ts
// BAD — hides a missing category as an empty array
const skills = matrix.categories[id]?.skills ?? [];
// GOOD — asserting helper throws on missing category
const category = getCategoryById(id);
const skills = category.skills;
```

**15.2 No multi-tier resolution fallbacks.** Data matches on the first lookup or it is an error. Do not chain "try exact → try alias → try directory name → fall back to basename". Each alternative lookup hides a data bug. Specifically: never fall back to `path.basename(dir)` as a skill ID — use `frontmatter.name` from `parseFrontmatter()`. Never derive `slug` from skill ID or directory path — `slug` is a required metadata field, always pass it explicitly.

**15.3 No backward-compatibility shims or legacy fallbacks.** The project is pre-1.0. Remove old code cleanly; do not leave a branch that reads an old field "in case the user has a stale config".

**15.4 No conditional data merges (`if (x.length === 0) use fallback`).** When primary and fallback data should both be visible, always merge them. Conditional merges produce scope-dependent behavior that's hard to reproduce.

**15.5 Single-writer normalization.** If one writer normalizes a comparison key with `fs.realpathSync`, every reader and deleter must use `fs.realpathSync`. Mixing `path.resolve` with `fs.realpathSync` on the two sides of a lookup produces silent no-op deletes under symlinks. Pick one normalization and document it at the field definition.

**15.6 Return values must be consumed or removed.** A function returning a multi-field result (`{ updated, skipped }`, `{ config, changed, droppedStale }`) must have every field read by at least one production caller. An architecturally orphaned field is either dead code to delete from the return type OR a missing observability hook. Silent skips, silent sweeps, and silent drops are anti-patterns — surface the count with `warn()` at the caller, or delete the field from the return shape.

**15.7 Hard-error before destructive writes when install intent cannot be honored.** Per-skill install failures (e.g., `installPluginSkills().failed.length > 0`) must `this.error(..., { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs — otherwise the config persists entries claiming `source: "<marketplace>"` for skills that never installed, and no `cc` command can self-heal the orphan. Uninstall failures are diagnostic-only and may continue. See `2026-04-20-d229-plugin-install-failure-orphan-config.md`.

**15.8 Writer selection for `config-types.ts`.** When writing a PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts`), call `regenerateConfigTypes`. When writing a GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), call `writeStandaloneConfigTypes` / `generateConfigTypesSource`. Never call `writeStandaloneConfigTypes` for a project path — it bypasses the import-from-global branch and produces duplicated standalone unions. See `.ai-docs/reference/config/config-writer.md`.

---

## 16. Scope Awareness (project vs global)

**16.1 Always resolve skill/agent paths through `resolveInstallPaths(projectDir, scope)`.** Never hardcode `projectDir` when a skill has a `scope` field. Use `os.homedir()` as the root for `"global"` scope, `projectDir` for `"project"` scope. Passing `projectDir` to a global-scoped skill writes to the wrong filesystem.

**16.2 Never use `path.join(projectDir, LOCAL_SKILLS_PATH)` without checking scope.** Global-scoped local skills live at `~/.claude/skills/`, not `<project>/.claude/skills/`. Split skill lists by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`) before any path-dependent operation (copy, delete, install, uninstall).

**16.3 Merge project and global local skills; never use one as a fallback only when the other is empty.** Always load both and merge — see `source-loader.ts` and `compile.ts` for the canonical pattern. Project takes precedence on ID conflicts. A conditional fallback (`if (project.length === 0) use global`) produces scope-dependent behavior that's impossible to reproduce.

**16.4 Never pass a uniform scope to `claudePluginInstall` / `claudePluginUninstall` for multiple skills.** Each skill carries its own scope in its `SkillConfig`; group per-scope before invoking.

**16.5 Saved `source` wins over computed `primarySource`.** Never let a marketplace `primarySource` override a user's saved `source` in config. The precedence for wizard restoration is `saved?.source ?? primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME`. A saved source (`"local"` or a marketplace name) is the user's intent; computed defaults are only a floor.

---

## 17. Repository Hygiene

**17.1 Never commit machine-specific absolute paths in tracked files.** Paths like `/home/vince/…` or `C:\Users\…` pollute diffs for other contributors and CI. Use `process.cwd()`, `os.homedir()`, `path.join(projectDir, …)`, or a test-local temp dir from `createTempDir()` instead. If a tool insists on an absolute path (e.g., `settings.json` hook commands), parameterize via an env var or scope the file to `.claude/settings.local.json` which is gitignored.

**17.2 Do not introduce git worktrees (`isolation: "worktree"`).** Worktrees fragment the repo state and break the single-working-tree assumption many workflows depend on. If you need isolated branches, use a separate clone.

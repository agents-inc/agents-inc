---
last_validated: 2026-07-30
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

**3.5 A refusal must not diagnose a cause it cannot observe.** Name the remedy instead. Where several causes collapse into one detection — a `safeParse` failure, a missing map entry, a non-zero exit — the code knows only that the check failed, so a message picking one cause is a guess presented as a finding, and the user acts on it. `fetch-seed.ts` refused a stale shared id with "it may have been created by a newer version" when a `SEED_VERSION` bump produces the opposite direction in bulk: every id minted before the bump, meeting a newer CLI. Readers concluded their CLI was out of date and upgraded, which cannot help. It now leads with "re-share the configuration to mint a current one" and names the upgrade second and conditionally — one sentence that gives all three causes the same available action.

One message for several causes is fine; one message asserting which cause occurred is not. Where a genuine remedy differs per cause, the code must be able to tell them apart before the message may — and if it cannot, that is a defect in the detection, not in the wording. The hedging vocabulary is the tell, and it is greppable:

```
grep -rnP '(may|might) have been|was probably|is likely|by a newer|by an older' src/cli/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

One live hit, and it is the shape the rule ASKS for rather than a breach — `absentFromSourceWarning` in `src/cli/stores/wizard-store.ts`, raised by `resolveSkillForPopulation` for an installed skill the loaded matrix does not carry. It still hedges ("may have been removed or renamed") because it genuinely cannot tell a marketplace drop from a namespaced id or from a source this run did not load, and it closes by naming the one action available for all three: what happens to the skill (left out of this session's selection) and the way out (`<CLI_INVOKE_COMMAND> update`, to refresh the marketplace). One message for several causes, with a remedy that fits every one of them. The classification the code CAN make lives downstream, in `removalReason` (`lib/skills/unresolved-skill-entries.ts`), which reads the filesystem and tells a marketplace drop from a local install whose files are gone — reachable to `edit` and not to a synchronous store function holding only the matrix, which is why the store offers the remedy instead of guessing at the reason.

**So the grep above answers a hit that is correct, and that is the state to keep it in.** A hedging phrase is the tell, not the verdict: the question it opens is whether the code could have told the causes apart, and where it could not, whether the message gives all of them the same available action. Judge the next hit on that, not on the vocabulary.

**3.6 A `catch` that produces a user-facing message carries the cause, and the two shapes that drop one are both silent.** 3.1 mandates `getErrorMessage(error)` and 3.3 permits a bare `catch {}` for existence checks and feature detection — the gap between them is where a dropped cause lives. `@typescript-eslint/no-unused-vars` sees only the bound-and-discarded variant; an unbound `catch {}` discards the cause just as thoroughly and reports nothing, so the unbound one needs a written rule and a comment saying why the cause is irrelevant. Absent that comment, read a bare `catch {}` as a defect rather than a decision. `source-validator.ts` held all three: two lint-visible sites, and a third in `validateYamlFiles` that no linter could see, emitting the identical `Failed to parse YAML` with no line, no column and no reason while `parseYaml` threw a `YAMLParseError` carrying all three. Both YAML phases now build the sentence through one `yamlParseFailure(error)` helper in that file, so they cannot diverge again by editing one site; the row reads `Failed to parse YAML: Nested mappings are not allowed in compact mappings at line 1, column 25`, which is the whole difference between a refusal an author can act on and one they cannot.

**The usual residue of a dropped cause is a template literal with no `${}`.** Nothing in the toolchain produces backticks for a string with no interpolation — Prettier leaves quote style alone, and neither `quotes`, `prefer-template` nor `no-useless-concat` covers it — so the backticks are what an interpolation left behind when it was removed or never finished. The smoking gun here was `` `Cross-reference validation skipped: failed to load categories/rules` ``, which told the user validation was skipped and not that their own `skill-categories.ts` had a syntax error, in a file that had done it correctly a hundred lines earlier. Grep the diagnostic positions, not every backtick — the general form is drowned by JSDoc code spans:

```
grep -rnP '(message: |warn\(|verbose\(|this\.error\(|reason: )`[^`$]*`' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Three hits today, all `verbose()` diagnostics with no caught error in scope. A hit inside a `catch` is the defect.

**3.7 A caller that must distinguish two failures needs the throw to carry the distinction.** Where one function is the only code that can tell two conditions apart, it says which — an error subclass, or a discriminated result — and no caller re-derives it by matching on message text. A message is presentation and changes without notice; a type does not. `fetchMarketplace` throws `MarketplaceManifestAbsentError` and `MarketplaceNameRefusedError` (`lib/loading/source-fetcher.ts`) purely so `readManifestState` in `source-loader.ts` can classify into a four-member `ManifestState` — `absent` / `refused` / `unreadable` / `named` — without reading a sentence, and a caller that does not care still catches an ordinary `Error`. The remedies differ (add the file, versus rename what it declares, versus repair the file that is already there), which is the test for whether a distinction is owed at all; `doctor`'s `ConfigState` splits its own three states on the same principle. Collapsing them reported every schema violation in a manifest as an absent file, and a reader who checked found it exactly where the message said it was not.

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

**4.5.1 An unimported constant is a defect, not spare capacity.** A key in one of those tables with no consumer outside `messages.ts` and its own spec reads as a maintained part of the surface — `messages.test.ts` pins every key with `toStrictEqual`, so being enumerated in a passing spec is what makes residue look deliberate. Delete it. When a command is deleted or rewritten, grep `utils/messages.ts` for every string it printed and remove the ones nothing else prints, in the same change; three keys survived long enough to be found by accident, and one of them (`NO_SKILLS_FOUND`) was actively misleading because three commands printed their own inline version, so a reader grepping the constant concluded it was the one in use. Nothing here is reserved for a future caller — 9.1 and 9.2 say the same thing about functions, and a string is not exempt because it is cheap.

**4.6 Watch for trailing punctuation in branding constants.** `DEFAULT_BRANDING.NAME` is `"Agents Inc."` (ends with a period). Do not add a period after it in sentences — it produces a double period.

```ts
// BAD — renders "maintained by Agents Inc.."
<Text>maintained by {DEFAULT_BRANDING.NAME}.</Text>

// GOOD — no extra period
<Text>maintained by {DEFAULT_BRANDING.NAME}</Text>
```

**4.7 Every user-facing command instruction reads `${CLI_INVOKE_COMMAND} <cmd>`.** Interpolate the constant from `consts.ts` (value `"npx agents-inc"`); never hardcode the prefix in a message. Docs, code comments and agent playbooks write the same `npx agents-inc <cmd>` form literally. Prose that merely NAMES a command ("the `agents-inc list` table") stays bare. `bin` in `package.json` registers both `agents-inc` and `agentsinc`, so an existing global install answers to either — only the first is promoted.

```ts
// BAD
this.error("No installation found. Run 'npx agents-inc init' first.");
// GOOD
this.error(`No installation found. Run '${CLI_INVOKE_COMMAND} init' first.`);
```

---

## 5. Security

**5.1 Validate user-supplied values used in filesystem paths.** Check null bytes, path traversal (`..`), slashes, and format before any `fs` operation.

**5.2 Validate resolved paths stay within expected parent directories.**

```ts
const normalizedPath = path.resolve(resolvedPath);
return normalizedPath.startsWith(path.resolve(expectedParent) + path.sep);
```

**5.3 Validate CLI arguments passed to `spawn()`.** Each argument type gets its own validator with: (1) empty/whitespace rejection, (2) length limit, (3) control character rejection, (4) format pattern allowlist. See `validatePluginPath()` and `validatePluginName()` in `exec.ts`.

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

**5.7 Write through `writeFile()` from `utils/fs.ts`.** ESLint bans importing `writeFile`, `writeFileSync`, `appendFile`, `appendFileSync` or `outputFile` from `fs`, `node:fs`, `fs/promises`, `node:fs/promises` or `fs-extra` anywhere under `src/`. `utils/fs.ts` is the single write choke point: it holds the runtime tripwire for the global config pair (15.8), and it `ensureDir`s the parent, so a preceding `mkdir` is redundant. Tests and `e2e/` are exempt; `utils/fs.ts` itself is the one production exemption, because it IS the wrapper.

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

**6.10** No `as` casts in tests. Use valid typed literals -- if a value doesn't type-check, fix the value or the type. **One** exception, and it requires a `// Boundary cast:` comment: intentionally invalid data for error-path testing (`const invalidId = "bad" as SkillId`).

A sparse-but-VALID fixture is not an exception -- it is a signal that the callee's parameter is wrong. When a test holds a partial map and the function demands a total one, cast nothing: widen the parameter to `Partial<Record<K, V>>` per typescript-types-bible §4, and declare the fixture with an annotation.

```ts
// BAD -- the cast re-asserts a totality the callee invented
const agents = { "web-developer": mockAgent } as Record<AgentName, AgentDefinition>;

// GOOD -- annotation on the binding; the callee takes Partial<Record<...>>
const agents: Partial<Record<AgentName, AgentDefinition>> = { "web-developer": mockAgent };
```

**`{ "web-developer": mockAgent } as Record<AgentName, AgentDefinition>` is NOT an exception, however plausible it reads.** A cast of that shape re-asserts a totality the callee invented, and it does not stay in one file: 24 signatures across loading, resolution, compilation, the config gate and installation declared total agent maps that no call path fills, and `local-installer.test.ts` accumulated **53 casts** — 43 of them the same `emptyAgents as Record<AgentName, AgentDefinition>` — existing only to launder that one wrong type into every call site, two of them `as unknown as` double casts a CLAUDE.md NEVER already forbids. Widening the parameters to `Partial` deletes them all with no other change and surfaces zero unhandled `undefined`, because every site was already guarded. That is what a false total map always looks like from underneath, and it is the signal to widen the parameter rather than cast the fixture.

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

**6.17a** A component that lays content out in fixed-width columns must carry at least one `toMatchInlineSnapshot()` per layout branch. `toContain` proves a label exists and an `indexOf` check proves one label precedes another — neither proves a label sits above the column it names, and in a table-like view that position is the contract. A branch is each structurally distinct arrangement: `source-grid.tsx` has two — grouped (scope gutter present) and flat (no gutter) — and `source-grid.test.tsx` carries one snapshot for each. Use a row with no double-width glyph when the point is position; the 🔒 (`UI_SYMBOLS.LOCK`) in that grid takes two columns and makes an aligned frame read as ragged.

This narrows 6.17 rather than contradicting it — snapshotting is already one of the two options 6.17 offers, and for this component class it becomes the required one. Grounding: the `Scope` caption in `source-grid.tsx` rendered 11 columns right of the labels it captioned, and all 56 tests then in `source-grid.test.tsx` passed — including a `describe("scope-grouped rendering")` block covering that exact branch — because every assertion was `toContain(...)` or an ordering check, and a misplaced caption satisfies both.

**A snapshot regenerated with `-u` is a proposal, not a verification, and 6.17a is not satisfied by
one.** `-u` writes whatever the component currently renders, so it agrees with the code by
construction and a wrong layout comes back green. That is not hypothetical: both `source-grid`
snapshots were regenerated when the scope gutter was removed and both passed, encoding a layout
nobody had asked for — on the very component the rule was written for, one day after it was written.
Nothing else covers geometry, which is the point of the rule: `tsc`, ESLint, Prettier, the unit suite
and every E2E spec touching the Sources grid were all green against it, and the diff a reviewer sees
is a wall of aligned spaces that reads as noise unless somebody counts columns.

So the obligation is on the update, not only on the existence of the snapshot: **derive the intended
column starts from the component's own width constants, confirm by index that each caption sits over
the cell it names, and state the derivation in the test's JSDoc** so the next reader re-checks it
rather than re-deriving it. `source-grid.tsx` declares `SKILL_NAME_WIDTH`, `INSTALL_MODE_COL_WIDTH`
and `SCOPE_COL_WIDTH`, and `source-grid.test.tsx` carries the derivation beside its snapshots,
including the relation between the two branches — the flat branch is the grouped one shifted left by
exactly `SCOPE_COL_WIDTH`, which is a single check that covers both frames at once.

**Every regeneration owes that full derivation, and the cheaper trigger is rejected.** The
alternative was to require it only when the snapshot's **leading whitespace** changes. Leading
whitespace is a proxy for a column shift and a good one for a shift that moves the first cell of a
line, which is what the `Scope` caption above was; it says nothing about a caption that moves
between two columns further right, a width change absorbed by a cell that was already padded, or a
header re-emitted into the neighbouring box. A trigger silent on those licenses skipping the check
in precisely the cases where nothing else would notice, which is the property that made 6.17a
necessary in the first place. The cost is real and is accepted rather than designed around: one
column count per snapshot, on every `-u`, derived from the three width constants above. What it
buys is the only thing standing between a `-u` and a green suite pinning a layout nobody chose.

**6.18** Never define parser/extractor helpers with non-trivial logic inside a test file (loops, regex scans, state machines that pick data out of rendered output or config text). If a helper is genuinely reusable across tests, live it in `src/cli/lib/__tests__/helpers/` WITH its own tests — never inline and untested. **That is the only directory where such a test is collected**, and the alternative this rule used to offer is one nothing runs: the projects in `vitest.config.ts` include `src/**` and `scripts/**` only, and both projects in `e2e/vitest.config.ts` require an `.e2e.test.ts` or `.smoke.test.ts` suffix, so a plain `*.test.ts` written under `e2e/helpers/` is collected by nothing and never runs while looking exactly like coverage. E2E specs reach a tested helper by importing it — `e2e/helpers/test-utils.ts` names each one and re-exports it, which is how `normalizeGlobalConfig` and `writeTestPackageJson` are reached — and `journey-page.ts`, with `journey-page.test.ts` beside it in the collected directory, is the shape a new one takes. Instead, assert directly on raw output with `toContain`, `toMatchInlineSnapshot`, or a structural load (e.g. `loadProjectConfig` for `config.ts`).

**6.19** A spec that invokes the CLI by oclif command id is testing the build output, not the source, and its green means nothing until the build is current. Two suites have this property, and they are the ones whose greens to distrust: everything calling `runCliCommand` (`src/cli/lib/__tests__/commands/**` today, and any `integration/` spec that imports it), which reaches oclif through `package.json` -> `oclif.commands.target` = `./dist/commands`; and everything under `e2e/`, which spawns `bin/run.js` against that same directory. Neither `tsc` nor a code review can see the gap — `runCliCommand` addresses a command by its id string, so nothing imports the module whose absence is the defect.

This is enforced rather than remembered, in two layers because one is not enough. `turbo.json` orders a `build` ahead of `test`, `test:e2e` and `test:smoke` through `dependsOn`; the `globalSetup` guard refuses outright — before a single spec is collected — when `dist/` predates a tree compiled into it, which is what covers every path turbo does not order, `npx vitest run <file>` and a bare `bun run test` alike. **The npm `pretest*` hooks were a third layer and were removed on 2026-08-23**: turbo runs those tasks concurrently, so each hook's build raced the ordered one and `turbo run test test:e2e` fired three tsup builds where one was wanted — `clean: true` meant the loser died with `ENOENT ... unlink dist/chunk-*.js`, aborting a push with no legible error. Do not reinstate them, do not delete either surviving half, and do not "fix" the guard into an auto-build: a refusal keeps a direct run fast and deliberate.

The guard is `assertDistIsFresh` in **`src/cli/lib/testing/dist-staleness.ts`**, called by a three-line `vitest.global-setup.ts`. It lives under `src/` deliberately: a package-root file is in no tsconfig of this package and matches no `files` block in `eslint.config.js`, so the logic that polices every suite was type-checked and linted by nothing while it sat there. Keep it there, keep it dependency-free beyond node builtins and fast-glob — `globalSetup` evaluates it before dist freshness is known — and keep `dist-staleness.test.ts` beside it, because a guard whose own behaviour is unasserted is the next version of the same problem.

"A tree compiled into it" is plural and that is the point: `packages/matrix/src` counts as much as `packages/cli/src`, because tsup inlines `@workspace/matrix` into the bundle rather than importing it, and matrix has no build output of its own to go stale in the CLI's place. **Anything else this package ever inlines from another workspace belongs in `BUILD_INPUT_TREES` (in `dist-staleness.ts`) on the same day it is inlined** — a build input the guard cannot see is a false green it cannot stop.

Grounding: deleting `src/cli/commands/import/skill.ts` left `dist/commands/import/skill.js` behind, and its eleven-spec integration file passed in full against the orphan — the whole suite reported 136 files green with the command's source already gone from the tree. The trap is invisible in the direction that matters: a command spec that stays green after you delete its command reads as "nothing depended on it", when it should read as "here is the spec you missed".

**6.20** A negated word assertion must not run against text the harness contributed to. Before writing `expect(x).not.toMatch(/\bword\b/i)` or `not.toContain("word")` over a message, establish which parts of that message the product COMPOSES and which parts it ECHOES back — paths, ids, refs, marketplace names, user input. A negative over echoed text is a statement about the fixture, and the fixture usually wins.

```ts
// BAD — the refusal names the temp path, and `\b` matches on both sides of a hyphen,
// so this fails on `/tmp/cc-source-fetcher-test-XXXX/…` whatever the product's prose says
tempDir = await createTempDir("cc-source-fetcher-test-");
await expect(fetchFromSource(missing)).rejects.not.toThrow(/\bsources?\b/i);

// GOOD — the fixture is named out of the vocabulary under test
tempDir = await createTempDir("cc-fetcher-test-");
```

Four rules, the first two in order of preference:

1. **Name the fixture out of the WHOLE vocabulary under test, not merely the forbidden half.** A rename has two halves and the harness can defeat either — naming a fixture after the SURVIVING noun satisfies the "the new word arrived" positives off the echoed value, which is the same defect with the sign flipped and harder to spot because the spec is green. Prefer a name that says what the value is to the HARNESS (`fixture`) over one that says what it is to the PRODUCT (`marketplace`, `source`): a harness word cannot be renamed out from under the spec by a product decision.
2. **Scope the negative to the composed half** when the echoed value genuinely cannot avoid the word — anchoring is the cheapest form (`/^\s*Sources?(\s|$)/m` cannot be satisfied by an absolute path, because a path cannot start the line with the word).
3. **Record the constraint where the name is CHOSEN**, and treat shared fixtures as the priority case. A name in `__tests__/fixtures/` or `e2e/helpers/` has many callers and none can see why it is what it is. **A fixture name is never private to the spec that chose it once any message echoes it.**
4. **A class check must NAME the trees it read.** The defect exists wherever a negated word meets harness-contributed text — `src/` unit specs, `e2e/`, and component tests alike. A sweep of one tree settles one tree; write down which, or the conclusion reads as a statement about the repository. The e2e half is [`standards/e2e/assertions.md`](./e2e/assertions.md).

**6.21** A fixture source is a custom marketplace. Any fixture written by `createTestSource()` — or any other writer whose output `loadSkillsMatrixFromSource()` reads — publishes its skill ids through `inTestMarketplace(skills)` / `testMarketplaceSkillId(bareId)` from `__tests__/fixtures/create-test-source.ts`. A bare public-catalogue id in a fixture source is refused at load, and the refusal is correct: the fixture, not the guard, is what is wrong.

```ts
// BAD — four bare public-catalogue ids; the load-side collision guard refuses the whole source
await createTestSource({ skills: DEFAULT_TEST_SKILLS });

// GOOD — republished in the fixture marketplace's own namespace
await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
```

Two exceptions and one adjacent rule:

- A fixture that deliberately MODELS the public catalogue declares itself with a `package.json` naming `PUBLIC_CATALOGUE_PACKAGE` (`@agents-inc/skills`). Package identity is the only signal the guard reads — the name in `marketplace.json` is the claim under test.
- Installed and local skills stay bare. A local skill overriding a catalogue id is a supported path, not a marketplace claim.
- Only the id is namespaced. Slugs, categories and display titles are not, and neither are sub-agent names.

**Namespacing an id also removes it from every built-in table keyed by the generated `SkillId` union** — the coupling is a membership test, not a parse, and the miss usually has a silent fallback. Classification of those tables: [`standards/e2e/user-journeys.md` § Journey 26](./e2e/user-journeys.md).

**6.22 When you wire a hardcoded display value to real data, the tests that still pass are the suspects.** A value that cannot vary makes its own inputs unobservable, so every fixture rendering it is free to omit the field the value will one day derive from — and the drift is invisible until the wiring lands. Grepping the asserted string finds the test; nothing finds the fixture that was never asked to be right. Before wiring, list every test asserting the old constant and confirm each fixture states the field the new derivation reads **independently**, rather than inheriting it from a factory default: `buildSkillConfig` in `__tests__/helpers/wizard-simulation.ts` defaults `origin` to `"eject"`, so a summary-panel spec built with `buildSkillConfigs(["web-framework-react"])` asserted `Marketplace Agents Inc` over a fixture whose skills were all ejected, which under the real derivation names no marketplace at all. The assertion was strict and the fixture was silently meaningless; the header now comes from `formatSkillMarketplaces(skillConfigs)` in `components/wizard/summary-panel.tsx`, and the fixture states `origin` explicitly. **When such a test then fails, fix the fixture, never the assertion** — this is the concrete case CLAUDE.md's "NEVER broaden an assertion to make a failing test pass" is guarding.

**6.23 A fixture can build states the loader forbids, so check the production path before writing a spec around an "impossible" input.** If the input cannot be produced, the spec is testing the fixture and the throw it provokes is not a bug report. `validateRequirements` in `lib/matrix/matrix-resolver.ts` renders every unmet requirement through `getLabel(getSkillById(id))`, and `getSkillById` throws on a miss; it is safe only because `resolveEveryNeed` in `lib/matrix/skill-resolution.ts` takes a requirement's needs **whole or not at all**, returning `null` unless every one resolves, so no loaded catalog can carry a requirement naming a skill it does not have. A hand-built matrix has no loader in front of it — `createMockSkill(id, { requires: [...] })` will happily name an id the matrix omits — and `validateSelection` over that fixture throws instead of reporting. Write the reachable shape instead: a requirement the catalog carries and the payload does not satisfy, which is what `REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX` in `mock-data/mock-matrices.ts` names, with the unknown-id skip pinned beside it in the same payload so the two outputs move together.

**6.24 A test suite's freedom from the network is a property of the SUITE, not of the tests that remembered.** Where any test in a runner may reach a third party, the default is **refusal**, and reaching out is what an individual test opts into. A per-test stub is opt-in by construction, so "forgot to stub" and "deliberately unstubbed" are indistinguishable from outside the file — and the failure mode of forgetting is a **pass**, which is why no amount of review closes this and a runner-level default does.

Both live instances are in `apps/editor`, and they are the two shapes:

| Runner     | Where the default lives                 | What it does                                                                                                              |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Vitest     | `vitest.config.ts` -> `vitest.setup.ts` | MSW for **every** file, `onUnhandledRequest: "error"` — a request to anything unmocked fails the test that made it        |
| Playwright | `e2e/fixtures.ts`, the `page` fixture   | `page.route` over each third-party origin, `route.abort("blockedbyclient")`, and a teardown `expect` on what it collected |

Three details are load-bearing and none is obvious. **The guard covers every file, not the ones that call out** — the `vitest.config.ts` comment states the reason and it is the whole rule: "that is only a guarantee if it holds where nobody thought to ask." **The Playwright routes are installed at page creation so they are the OLDEST**, and a per-spec stub added later takes precedence, so the fallback only ever sees what nobody claimed. And **an abort alone is not enough**: it reaches the app as some failure or other, and a spec that only asks whether an error appeared is satisfied by the wrong one. The teardown assertion is what makes the omission legible.

The defect that produced this rule is the argument for the last point. An editor spec named "a directory that cannot be read is refused rather than added" installed no stub, resolved a staged skill against live `api.github.com`, and passed on the **size** refusal instead of the unreadable one it was written for — asserting, in effect, that a third party keeps a directory over 256 KB. `expect(dialog.error).toBeVisible()` cannot tell four refusal kinds apart. **Where a UI has several ways to say no, assert WHICH one** — the kinds here are a discriminated union with distinct wording, so `toContainText` was always available.

**6.25 A red-first run is evidence only when the red comes from the assertion, and `toThrow(<a name that does not resolve yet>)` cannot supply one.** Vitest reads `toThrow(undefined)` as "threw anything at all", so an assertion naming a refusal constant the module has not exported yet matches whatever the code happened to throw — and the test that looked red-first passes for the wrong reason the moment any error appears. This is precisely the shape a test written BEFORE its implementation takes, which is when the vacuous form is least visible: four of thirteen new refusal tests on `check-enumeration-drift.ts` were written this way on 2026-08-19 and none of them was ever proved. `tsc` sees it — TS2305, module has no exported member — but `tsc` is not what the red-first step runs.

Assert a refusal through `expectRefusal(run, refusal, because?)` in `scripts/refusal-expectations.ts`, which judges the message before it uses it: `undefined` and `""` are each refused by name, and everything else is handed to `toThrow` as before. `vacuousThrowAssertions()` in the same module is the gate — it parses every suite under `scripts/` and condemns two shapes, `toThrow(<a name the file imports>)` and `toThrow()` with no argument at all, both of which accept any failure. A constant the file DECLARES is deliberately left alone: it cannot be the one its module forgot to export.

The gate covers `scripts/` because that is where a refusal is asserted by imported message constant as a matter of course — one shared idiom across every gate this package owns. **It is not repository-wide, and that is stated rather than hidden** — the census below found over 140 sites in the CLI's own suites, most naming a locally-declared constant or an error class, and converting them would be a scope decision rather than a sweep:

```
grep -rn 'toThrow(' src e2e --include='*.ts' --include='*.tsx' | grep -vP "toThrow\(([\"\`/)]|')"
```

**6.26 A test whose real work is a large fraction of the suite's `testTimeout` carries its own timeout, and that timeout is DERIVED from the work rather than written as a number.** A test sized close to the default passes alone, passes on a quiet re-run, and fails when the machine is busy — which reads to whoever meets it as a regression their change caused, and teaches the next reader to re-run rather than investigate. `spec-gates.test.ts`'s escape-shape gate is the live case: `LINT_ZONES.length * ESCAPE_SHAPES.length * 2` in-process type-aware ESLint passes, ~2.7s on an idle machine against a 10s default, observed failing once during a wave with six agents live.

Two things are wrong to do instead. **Raising the suite default** hands the same headroom to every unit test in the package, where a ten-second unit test is itself the bug. **Writing the timeout as a literal** leaves it claiming to be sized for a loop that has since grown: another zone or another shape is more work every time, and the failure lands on whoever added it under a name that says nothing about them. Multiply the loop's own dimensions by a stated per-unit budget, put the measurement and its date in the budget's docblock, and the timeout tracks the work on its own. Prove the wiring by shrinking the budget below the real work once and watching that one test — and only that one — time out.

---

## 7. Type Safety

**7.1** Use `typedEntries()` / `typedKeys()` from `utils/typed-object.ts`. No `Object.entries(obj) as [K, V][]`.

```ts
// BAD                                                    // GOOD
(Object.entries(obj) as [AgentName, AgentConfig][])       typedEntries<AgentName, AgentConfig>(obj)
```

**7.2** Boundary casts (`as T`) are acceptable **only** at data entry points where typed code meets untyped data. Every cast requires a `// Boundary cast: <reason>` comment. If you cannot write the reason, the cast should not exist. The six acceptable categories:

1. **YAML/JSON parse** -- after Zod validation of parsed data. The Zod schema validates structure; the cast narrows the output type (especially with `.passthrough()`, see 7.5). Examples: `loadProjectConfigFromDir` in `configuration/project-config.ts`, `loadAgentsFromDir` in `loading/loader.ts`.

2. **Filesystem** -- directory names and filenames are untyped strings that correspond to typed identifiers by convention. Example: `classifyLocalSkill` in `skills/skill-metadata.ts` casts a map key (a directory name) to `SkillId`.

3. **Type narrowing after runtime validation** -- a value's compile-time type is wider than what runtime checks have established. The cast narrows to the validated subset. Example: `resolveSkillForPopulation` in `wizard-store.ts` casts `CategoryPath` to `Category` after domain lookup confirms existence.

4. **Data definition** -- literal data structures where TypeScript can verify the values but the container type is wider than the union. Example: `LOCAL_DEFAULTS.CATEGORY` in `metadata-keys.ts` casts `"dummy-category"` to `CategoryPath` in a constant definition.

5. **Framework (oclif)** -- framework types don't declare custom properties attached at runtime. Example: the `sourceConfig` getter in `base-command.ts` casts oclif's `Config` to reach the value attached in the init hook.

6. **Test fixtures** -- test helpers that construct mock data are data entry boundaries. Partial mocks and intentionally invalid data are acceptable with a comment. Example: `mock-skills.ts` casts fictional skill IDs for test isolation.

Boundary casts are **NOT** acceptable for: mid-pipeline workarounds (fix the upstream return type instead), consumer code casts (fix the library's return type so all consumers benefit), or convenience casts to silence type errors without investigation.

**A cast on a value the same expression just computed is not a boundary cast, however it is commented.** A boundary cast sits where the value came from OUTSIDE; a cast on your own arithmetic only suppresses the check that would have caught it. This is the failure mode the comment requirement invites rather than prevents: every cast in the `slug` / `domain` / `category` derivation carried one, and each described the MECHANISM (`Boundary cast: slug is derived from the ID's trailing segments`) rather than justifying it — so the comment stated the violation and read as permission. If the reason you can write is a restatement of what the line does, the cast is a mid-pipeline workaround under the row above.

**7.3** Use Zod schemas at JSON/YAML parse boundaries. No `JSON.parse(...) as T` in production code. For YAML files, use `readFileSafe(path, maxSizeBytes)` from `utils/fs.ts` for size-limited reads, then `parseYaml(content)` from the `yaml` package, then `schema.safeParse(parsed)` for validation. For JSON, parse then validate with `schema.safeParse()`. See `schema-validator.ts` and `local-skill-loader.ts` for the canonical pattern.

**A `try`-less `parseYaml` / `JSON.parse` sitting directly above a `safeParse` reads as one guarded operation and is not.** The `safeParse` catches a SCHEMA failure and returns; it cannot catch a PARSE failure on the line above, which is a different class and throws. The visual adjacency is the whole defect — a reader scanning for error handling finds a `safeParse` and a `warn` and stops looking. `extractAllSkills` had exactly this, so one unparseable `metadata.yaml` anywhere under a marketplace's `skills/` killed the entire matrix load with an error naming no file, landing hardest on the marketplace author who has just edited the starter skill a scaffold handed them. Either wrap the parse (`readSkillMetadata` has the `let` + `try`/`catch` form to copy) or state in a comment that the throw is deliberate and who catches it. Worth a named rule precisely because it is invisible: the correct form was two modules away and the defect still shipped.

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

**7.9** No non-null assertions on map/matrix lookups that have an asserting helper. Prefer `getSkillById(id)` from `matrix/matrix-provider.ts` over `matrix.skills[id]!`. Use the raw index access only when the skill is genuinely optional.

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

**8.6a A function whose result is serialized builds ONE object literal, with the conditional fields as spreads at the position they must serialize at.** This is 8.6's object twin and it carries a second reason 8.6 does not. For an emitted file, **insertion order IS the byte layout**, so construct-then-mutate encodes the file format in the sequence of statements below the literal — invisibly, at a distance, and with no name on it. It also hides the final shape: a reader has to scan every subsequent statement to learn which fields can exist at all.

```ts
// BAD — the reader learns the shape, and the key order, by scanning downwards
const manifest = { name, version };
if (options.description) manifest.description = options.description;
if (author) manifest.author = author;

// GOOD — the literal is the file layout
return {
  name,
  version: options.version ?? DEFAULT_VERSION,
  ...(options.description ? { description: options.description } : {}),
  ...(author ? { author } : {}),
};
```

Applies to everything that reaches `JSON.stringify` or a source-emitter: `plugin.json`, `marketplace.json`, the generated catalogue modules, and the `config.ts` / `config-types.ts` pair. `ensureMinimalConfig` and `generateProjectConfigFromSkills` are the in-tree exemplars. The check is a property assignment onto a local inside the modules that serialize their own return — currently clean:

```
grep -rnP '^\s+[a-z][A-Za-z0-9]*(\.[a-zA-Z0-9]+)+ = ' src/cli/lib/marketplace-scaffold.ts src/cli/lib/plugins/plugin-manifest.ts src/cli/lib/marketplace-generator.ts src/cli/lib/seed/publish-seed.ts src/cli/lib/stacks/stacks-loader.ts src/cli/lib/loading/source-fetcher.ts
```

The spread is `...(cond ? { k: v } : {})` here rather than typescript-types-bible §4a's `...(v !== undefined && { k: v })` because these builders are answering "should this field be emitted at all", not "is this optional property absent" — same syntax, different question, and §4a governs the other one.

**8.7 Two key families look alike and must stay apart.** `skillSlotKey` / `agentSlotKey` in `src/cli/lib/wizard/scope-diff.ts` build a SLOT key, `id:scope` — "is this the same row?" — so the Sources tab and the confirm step agree on what changed this session. `skillKey` / `agentKey` in `src/cli/lib/configuration/config-merger.ts` build a MERGE key, the same `id:scope` plus a `:excluded` suffix on deletion markers (tombstones) — "which config entry replaces which?". For a live entry the two produce an identical string; only tombstones tell them apart, which is why they read as duplicates.

Never unify them, and never route one through the other's helper. Strip the suffix from the merge key and a tombstone collides with the live entry it exists to mask, so the merge treats them as one entry and one overwrites the other. Add the suffix to the slot key and a tombstone stops matching its live entry, so the diff surfaces render it as an extra row instead of a mask. Both fixes that introduced the slot keys — the skill key first, `agentSlotKey` after — examined the merge keys and deliberately left them alone.

**8.8 Before deduplicating repeated literals, ask whether the sites have the same reason to change.** Identical-looking literals are not necessarily the same concept, and a shared constant that unites two of them converts an accident into a cross-module constraint. **The tell is a JSDoc that has to explain the constraint**: `EMPTY_RELATIONSHIPS` carried "kept without `compatibleWith` so the generated skill-rules.ts stays byte-identical", which is the generator's output format constraining the loader's runtime default for an absent config field — two call sites that looked the same and had never been the same concept. It was deleted back to independent literals; `VALID_EMPTY` beside it became the factory `validResult()`, because there the named concept WAS worth keeping. That is the judgement 8.1 and 8.2 do not make for you: extract on shared reason to change, not on shared bytes. Two further corrections worth carrying. **A factory is not automatically the right fix** — it removes a mutation trap (see CLAUDE.md's ban on exporting a shared constant holding mutable arrays) while preserving whatever coupling the shared constant created, so judge the coupling first. And **widening a module-private literal into an exported one is not a new defect, it is a widened blast radius** — `plugin-validator.ts` already held a module-local `EMPTY_RESULT` before the refactor exported its equivalent, and that distinction is what a reviewer is judging when a refactor surfaces a latent trap.

---

## 9. Dead Code

**9.1** Remove exported functions with zero imports outside their file. Search first, then remove tests. **Exception:** identity/lookup-key helpers such as `skillSlotKey` / `agentSlotKey` (see 8.7) — these exist to precede their second caller, so a bare barrel re-export, or none at all, is the expected state and not evidence of dead code. Nothing else is exempt.

**9.6** Prefix intentionally unused parameters with `_` (e.g., `_onClose`, `_input`). This signals intent and suppresses linter warnings. Remove the parameter entirely if the interface allows it.

**9.2** Un-export symbols only used within their own file. If a module-level constant is only consumed to derive an exported value, keep it un-exported (e.g., `CLI_ROOT` -> `PROJECT_ROOT` in `consts.ts`). **Exception:** identity/lookup-key helpers such as `skillSlotKey` / `agentSlotKey` (see 8.7) — the export is the single definition every surface must call, so it precedes the second caller rather than following it. Nothing else is exempt.

**9.3** Delete skipped tests or fix them. No `it.skip` without a linked issue.

**9.4** Remove commented-out code. Git history is the archive.

**9.5** Delete barrel files (`index.ts`) that only re-export from 1-2 modules. Import directly from the source file. Barrel files are justified when they aggregate 5+ exports from multiple modules (see `lib/configuration/index.ts`, `lib/matrix/index.ts`).

**9.8 A store field whose only writer has no caller is dead, not pending.** 15.3's "no legacy fallbacks" and 15.2's "no multi-tier resolution" are both phrased about resolution CHAINS, so a state field with the same defect reads as uncovered and survives review. If a setter has zero call sites in production, tests and E2E alike, delete the field, the setter, the type-union entry, the initial-state line and the branch that reads it — do not keep it as a placeholder for a feature that has not been specified. The cost is not the dead branch: it is that the LIVE branch beside it degrades to a hardcoded value nobody can tell from a derived one, and then 6.22 applies to every fixture that renders it. `enabledSources` was initialised `{}` and written only by `setEnabledSources`, which nothing anywhere called, so the wizard's Marketplace row printed the constant `Agents Inc` on every render for as long as the field existed. Grep the setter name before writing the field, not after:

```
grep -rnw '<setterName>' src e2e scripts
```

**9.7 Documentation weight is not evidence of use.** The grep that decides whether a symbol is dead is `grep -rnw <name> src e2e scripts`, and nothing in a document can outvote it. Volume of documentation measures how often a file has been read, not whether anything calls into it.

**An invariant has two sides, and a side held only by test code is not a side.** The most expensive of those five rows had promoted a test helper to a repository-wide invariant: `source-fetch-and-cache.md` recorded that the `"sources"` cache-path segment "is written twice in the repo" and gave the duplication a Trap and a limitation row, because the dead helper held the second copy. A reader arriving before touching the cache path would have concluded there were two derivations to keep in sync. Delete the helper and the invariant does not need repairing — it evaporates. So when a document tells you a value is written in two places, run the grep in the document-to-code direction and label any side that lives in a fixture as such; and before writing such a sentence, check that both sides are production.

**Grep a spec's basename before deleting it.** A reference to a spec file is prose, not an import, so nothing resolves it and nothing goes red when the file goes. The Trap above pointed the reader at "the file header of `e2e/interactive/sources-step-duplicate-marketplace-column.e2e.test.ts`" for its evidence; that spec had been removed an unknown number of weeks earlier and the Trap read as authoritative the whole time. This is the same protocol `.ai-docs/agent-findings/INDEX.md` spells out for deleting a finding, applied unchanged to deleting a test:

```
grep -rn 'sources-step-duplicate-marketplace-column' .ai-docs/ e2e/ src/ scripts/ todo/
```

Run it with the basename of the file you are about to delete, and retire every hit in the same change.

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

**12.2** Use named exit codes from `lib/exit-codes.ts`: `SUCCESS` (0), `ERROR` (1), `INVALID_ARGS` (2), `NETWORK_ERROR` (3), `CANCELLED` (4), `COMPLETED_WITH_FAILURES` (5). No magic numbers in `process.exit()` or `this.error(..., { exit: })` calls. `COMPLETED_WITH_FAILURES` is raised through `this.exit()` at the END of a command that ran to completion, never through `this.error()` — the work landed and the ending reports what did not, so an abort would relabel a state already on disk rather than prevent it.

**12.3** Follow the message style guide in `logger.ts` for all warning and log messages: capital first letter, single-quoted dynamic values (`'value'`), no "Warning:" prefix (added by `warn()`), lowercase after colons.

---

## 13. Imports

**13.1** New files use `.js` extensions on relative imports. Existing files keep their current style. Do not mix styles within a single file.

**13.2** No default exports. Use named exports only. **Exception:** modules a framework loads by their default export — oclif commands (`src/cli/commands/**`) and hooks (`src/cli/hooks/**`), and tool configs (`*.config.*` plus `e2e/global-setup.ts`). Never convert these to named exports: a config loader reads `module.default` and nothing else, so a named export loads as an empty config — clean at `tsc`, no runtime error, just a config that silently does nothing. The `Exports` bullet under "Code Conventions" in `CLAUDE.md` is the authority; nothing outside those paths is exempt.

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

**14.6 An `eslint-disable-next-line` is the line IMMEDIATELY preceding the code it suppresses.** Where another comment belongs there too — a `// Boundary cast:` annotation, a JSDoc, a reason too long for the `--` clause — the disable goes **last**. This is not tidiness, it is an armed `--fix` trap: a directive one line too high suppresses nothing, so the real report stands AND the directive is reported as unused, and both are auto-fixable in the wrong direction. `skill-factories.ts` sat with its `no-var` directive a line above a boundary-cast comment, so `eslint --fix` would have deleted the directive and rewritten `var` to `let` — the exact change the directive's own reason says throws, because `test-fixtures.ts` calls `createMockSkill()` at module scope during a circular import. The ESLint entry in `lint-staged` is check-only rather than `--fix` for that reason.

`linterOptions.reportUnusedDisableDirectives` is `"error"` in this package, so the misplacement is caught the moment it is written. **It cannot catch the other half of the class: a directive that suppresses a real report for a false reason.** Two `no-unnecessary-condition` disables in `lib/wizard/build-step-logic.ts` each claimed an auto-synthesized category "can arrive without" `order` / `exclusive`; no producer can make that true — `synthesizeCategory`, `defaultCategories`, the local-skill category `source-loader.ts` adds and a source's own `skill-categories.ts` supply both, and both parse boundaries declare them non-optional. What caught them was reading the producers, not the linter. So **a directive's reason names the producer, the compiler error code, or the concrete construct that makes it necessary — in a form the next reader can check.** CLAUDE.md's Code Style entry is the authority on what counts as a reason; this rule is only about where the line goes.

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

**15.2 No multi-tier resolution fallbacks.** Data matches on the first lookup or it is an error. Do not chain "try exact → try alias → try directory name → fall back to basename". Each alternative lookup hides a data bug. Specifically: never fall back to `path.basename(dir)` as a skill ID — use `frontmatter.name` from `parseFrontmatter()`.

**Never derive `slug`, `domain` or `category` from a skill ID or a directory path — in product code or in a test factory or fixture.** All three are stated metadata fields; look them up in one table and throw when the lookup misses. The rule read as product-only for as long as it named only `slug`, and both breaches lived in the test layer, where nothing else was looking: `createTestSkill` and `createMockExtractedSkill` split an id on `-` and cast each piece (`as Domain`, `as CategoryPath`, `as SkillSlug`), so a wrong answer was a value rather than a type error. It was already producing wrong values before any namespacing existed — `api-database-drizzle` derived category `api-database` where the catalogue says `api-orm`, `web-state-zustand` derived `web-state` where it says `web-client-state` — and the workarounds were in the tree as per-call-site `category:` overrides while the cause was not. `getCanonicalSkillTaxonomy()` in `src/cli/lib/__tests__/factories/skill-factories.ts` is the one-table shape; `deriveDisplayName` is the sanctioned exception, because it derives from the slug the lookup returned rather than from the id.

Two detectors, because the two shapes hide differently. A `??` whose right-hand side builds a value out of the same string the left-hand side used as a key is the first. The second has no table and therefore no `??` — `id.split("-")` followed by `segments[n] ?? "web"`, where the default is what removes the failure mode a reviewer's eye would catch:

```
grep -rnP '\b[a-zA-Z]*[Ii]d\.split\(' src/cli/lib/__tests__/ e2e/ --include='*.ts' --include='*.tsx'
```

That grep is currently empty. The last site it caught — `e2e/interactive/edit-wizard-detection.e2e.test.ts`, which split `skill.id` into a `category` and a `slug` for `renderMetadataYaml` while the `E2E_SKILL` entry it read the id from already carried the slug — now spreads `metadataFieldsFor(skillId)`, exported from `e2e/fixtures/project-builder.ts`, which reads one table and throws naming the skill and the table on a miss.

Keep the instance as the reason the rule exists rather than as a closed ticket, because it is the clearest demonstration that a derivation can be wrong in silence. Every fixture skill id is namespaced by the fixture marketplace (`e2eSkillId` prefixes each one with the marketplace's own name), so on `e2e-test-fixture-web-framework-react` the two-segments-then-the-rest split wrote category `e2e-test` and slug `fixture-web-framework-react` — neither of which is a member of anything. Nothing in that spec read either field back; its assertions are display names, an exclusive category's selected counter and scope badges. The suite was green whichever way the derivation went, and would have stayed green had it been wronger.

**15.3 No backward-compatibility shims or legacy fallbacks.** The project is pre-1.0. Remove old code cleanly; do not leave a branch that reads an old field "in case the user has a stale config".

**15.4 No conditional data merges (`if (x.length === 0) use fallback`).** When primary and fallback data should both be visible, always merge them. Conditional merges produce scope-dependent behavior that's hard to reproduce.

**15.5 Single-writer normalization.** If one writer normalizes a comparison key with `fs.realpathSync`, every reader and deleter must use `fs.realpathSync`. Mixing `path.resolve` with `fs.realpathSync` on the two sides of a lookup produces silent no-op deletes under symlinks. Pick one normalization and document it at the field definition.

**15.6 Return values must be consumed or removed.** A function returning a multi-field result (`{ updated, skipped }`, `{ config, changed, droppedStale }`) must have every field read by at least one production caller. An architecturally orphaned field is either dead code to delete from the return type OR a missing observability hook. Silent skips, silent sweeps, and silent drops are anti-patterns — surface the count with `warn()` at the caller, or delete the field from the return shape.

**Where the multi-field result carries a `changed` / `dirty` flag that gates a write, every field the
function can ALTER participates in that flag.** A field carried but not counted is inert, and it is
inert in the way that is hardest to see: it works on the run that creates the file, because the
whole object is new and something else set the flag, and it silently does nothing on every run
afterwards. `mergeGlobalConfigs` in `lib/config-gate/propagate.ts` is the worked example — it was
extended to carry `marketplace` and `marketplaceName` across a merge, and carrying them alone would
have made the fix inert, because a run whose only delta is the now-known marketplace computes
`changed === false`, skips the write and drops the field again. Both fields are in its `changed`
expression and the comment above it says that is why. `resolveEffectiveGlobalConfig` in the same
module is what reads the flag: its `changed` gates the write, its `globalDataChanged` gates
propagation, and the two are deliberately different questions.

The check is per FIELD rather than per function — for each key on which the returned object can
differ from its input, find that key in the expression computing the flag — and the population is
small enough to read end to end:

```
grep -rnP '\bchanged: boolean|\bdirty: boolean' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

Six returns today, all of them in `config-gate/`.

**15.7 Hard-error before destructive writes when install intent cannot be honored.** Per-skill install failures (e.g., `installPluginSkills().failed.length > 0`) must `this.error(..., { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs — otherwise the config persists entries claiming `origin: "<marketplace>"` for skills that never installed, and no `cc` command can self-heal the orphan. Uninstall failures are diagnostic-only and may continue.

**15.8 The global config pair is `config-gate/`'s exclusive privilege.** `~/.claude-src/config.ts` and its `config-types.ts` sibling may only be written through the public entries exported from `src/cli/lib/config-gate/index.ts`. Those entries are the only code that mints the write token, because the write owes consequences (propagate to registered projects, recompile their agents — 15.10) that no caller can be relied on to remember. Four layers hold it:

| Layer               | Where                                             | What it stops                                                                                                                                                               |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1 module privacy   | `installation/index.ts`, `configuration/index.ts` | Neither barrel re-exports a raw pair writer, so reaching one is a compile error rather than an import away                                                                  |
| L2 ESLint           | `eslint.config.js`                                | Importing any `config-gate/` file but `index`, statically or via `import()`; raw `fs` writes (5.7); the pair-source renderers `generateConfigSource` / `*ConfigTypesSource` |
| L3 runtime tripwire | `writeFile()` in `utils/fs.ts`                    | Any pair write whose async call tree holds no token — throws `GlobalPairWriteViolation`, whatever route reached the primitive                                               |
| L4 guard test       | `lib/__tests__/config-gate-enforcement.test.ts`   | Barrel leaks, plus a source scan for any module that both writes and names the pair — because L1-L3 each guard a named entry point and a bypass is written by naming none   |

Exactly two files outside the gate may import its private modules, both enforcement guards, both pinned **by name** in the guard test: `utils/fs.ts` (needs `assertGateToken`) and `configuration/config-types-writer.ts` (needs `GlobalPairWriteViolation` to refuse a home-directory write by name). Do not add a third. Specs are exempt from the ESLint bans — a test asserting on a writer has to import it — but not from the tripwire or the source scan.

**15.9 Writer selection for `config-types.ts`.** A PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts`) is written by `regenerateConfigTypes`, which emits the import-from-global form and throws `GlobalPairWriteViolation` if handed the home directory. The GLOBAL half has no direct writer: call the gate's `writeScopeConfigTypes` / `reconcileTypesFromDisk`, which dispatch on `isHomeDirectory(projectDir)` themselves. Never branch on scope at the call site. See `.ai-docs/reference/config/config-writer.md`.

**15.10 A gated write carries out its own consequences and reports them.** A `config-gate` entry that propagates a global change also recompiles the projects it rewrote, and returns a `GateReport` whose `propagated` / `recompile` fields the caller renders — `init`, `edit`, `compile` and `uninstall` each do. Never re-implement the fan-out at a call site, and never discard the report: both audited gaps in the previous contract (a project-context source migration, a global uninstall) were a caller forgetting to recompile. 15.6 applies to the report like any other multi-field result.

**15.11 A field's name is a claim about its contents, not about its use.** A field named for entity A holding data from entity B is a defect even when the rendered output looks acceptable, because the next reader propagates the wrong meaning rather than checking the assignment. `SourceLoadResult.marketplaceDisplayName` was assigned `marketplace.owner.name` — the person who owns the marketplace — and threaded through two more `displayName` fields into the Sources grid, where the column for the `agents-inc` marketplace read "Vincent Bollaert". It survived because the name lied plausibly in one direction and the unit test encoded the mismatch rather than catching it: `expect(result.marketplaceDisplayName).toBe("Test Owner")`, an owner's name asserted against a marketplace-named field.

Three outcomes, and the third is the one people skip:

1. **The name is right, the derivation is wrong** → fix the assignment.
2. **The derivation is right, the name is wrong** → rename, then re-read every consumer under the honest name. Consumers that stop making sense were the actual bug.
3. **No honest source of data exists** → delete the field. A field that can only duplicate another field, or that has no correct value available at its assignment site, is dead weight (pre-1.0: remove cleanly, no shim). That is what happened here — the marketplace manifest carries a `name`, a `description` and an `owner`, and none of them is a short human label distinct from the id.

Never leave a mismatch standing because the output currently looks fine, and treat **an option name on a helper as the same claim as a field name**. `PluginProjectOptions` took `marketplace` (which wrote `config.marketplaceName`) alongside `source` (which wrote `config.marketplace`), so a reader trusting the option names got both fields exactly backwards; the fixture options now carry the config's own field names. When you write an assertion on a named field, confirm the expected literal belongs to the concept the name denotes — see 6.10 for the cast half of the same discipline.

**15.12 A precondition that can change while the process runs is re-derived where it is consumed.** A check performed once during command startup guarantees the condition at t=0 and nothing after. Terminal size, TTY-ness, config on disk, network reachability: the surface that depends on one of these re-derives it on every render or every use, and the startup check is an optimisation — fail before building anything — never the enforcement point. `BaseCommand.ensureTerminalSize()` ran once in `init()` and installed a resize listener it removed the moment the size became valid, so the gate stopped you launching small and not becoming small; launching at 30 rows and resizing to 16 painted the build grid straight through the footer. The machinery for the fix was already mounted — `WizardLayout` already called `useTerminalDimensions()` for its own height and never compared the value to anything.

Two properties make this class invisible, and both are worth recognising directly. The check and the thing it protects live in **different lifecycles** — an imperative one-shot in `init()`, a React tree that re-renders for the whole session — so a reader of the check sees a loop that waits for a valid size and reasonably concludes the size is handled. And the tell is **a one-shot listener removed on success**:

```
grep -rnP 'removeListener|\.off\(' src/cli/base-command.ts src/cli/commands/
```

One hit, and it is the kept startup gate: blocking before Ink mounts is cleaner than mounting a tree in order to refuse to draw it, so the two gates are complementary and `reference/component-patterns.md` records which catches what. Both read one shared predicate and one shared message formatter in `src/cli/utils/terminal.ts` — see 18.1, because a second copy of a user-visible string is a surface with no assertable identity. Where the re-check replaces the tree rather than overlaying it, say so at the site: Ink lays children out at the small size regardless of what covers them, so an overlay keeps bleeding underneath.

**15.13 Identity guards come in complete sets.** When a type has more than one identity axis, a guard on one and not the other is worse than no guard, because the present guard reads as evidence the class was considered. `buildSlugMap` warned on a duplicate slug and kept the first; twenty lines below, `mergeMatrixWithSkills` wrote `resolvedSkills[skill.id] = resolved` as a bare assignment in a loop, so two skills declaring the same id resolved in glob order and the loser left no trace. One file, one axis guarded carefully and the other not at all. Dedupe on every axis, or say in a comment which one is deliberately unguarded and why — and prefer making the symmetry structural, as `buildResolvedSkillMap` and `buildSlugMap` now are, so the asymmetry cannot return at the level it lived at. Namespacing does not close this: prefixing prevents CROSS-marketplace collisions, and two skills within one marketplace carry the same prefix.

**15.14 A rule that constrains the SHAPE of persisted data is enforced on the write path, never only in a keypress handler.** `config.ts`, `config-types.ts` and the compiled stack outlive the session that produced them, and propagation, hand-edits and cross-scope inlining never route through the keyboard. A store action may enforce the rule _additionally_, for immediate feedback, but it is never the only enforcement point. Category exclusivity — `CategoryDefinition.exclusive`, "at most one selected skill in this category" — was enforced in `toggleTechnology` in `stores/wizard-store.ts` and nowhere else, so a project owning Angular at project scope beside a global install of React wrote two active skills in one exclusive category into the project's own `config.ts`; the compiled agent then advertised both, `doctor` reported "Skills Resolved 2/2", and `validate` reported no errors. It is enforced now on the write path at **two** sites, and naming only one is what lets the next reader take one of them for the whole guard:

| Site                                 | Where                                                                                                                        | What it does when the rule is broken                                                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconcileProjectSplitAgainstGlobal` | `lib/config-gate/propagate.ts`, called immediately before the inlining writer at both sites that write a project `config.ts` | Repairs. `buildProjectCollisionTest` treats an exclusive category the project already occupies as a collision, so the colliding global entry is masked with a tombstone and the project-owned skill wins locally                                                 |
| `compactCategoryAssignments`         | module-private in `packages/compile/src/config-source.ts`, inside `cleanForEmission`'s compaction of every stack             | Refuses. An exclusive category holding more than one assignment cannot be expressed in the emitted form at all — the bare value IS the assignment there — so it throws rather than dropping the extra and writing a config that does not match what was selected |

The two do different jobs and one does not stand in for the other: reconciliation runs only where a project split meets a global config, while compaction runs on every emission, including a stack a source or a hand-edit assembled with no global config anywhere near it.

**Both write-path sites read the flag the same way, and it is the opposite of the keypress handler's.** Neither reads `defaultCategories`, which is the rule at the end of this section, and both answer `false` for a category the matrix does not DECLARE (`matrix.categories[category]?.exclusive === true`) — a rule that masks or refuses persisted entries may only fire on a flag the data actually carries. `use-build-step-props.ts` defaults the same lookup the other way (`cat?.exclusive ?? true`) before handing it to `toggleTechnology`, which is right for a keypress: refusing a second pick costs the user one press, and an undeclared category is more likely a source that forgot the flag than one that meant a multi-select. The asymmetry is deliberate on both ends, and it is stated here so that neither end is "fixed" into agreeing with the other. The `[]` suffix on the emitted union asks the same question and gets the same answer, because both write-path renderers now reach ONE `isExclusiveCategory` — exported from `packages/compile/src/catalog.ts`, taking the catalogue as a parameter. The three hand-written copies this paragraph used to count became one when the renderers moved into `packages/compile`; `propagate.ts` and `matrix-health-check.ts` still declare their own, so the asymmetry above is still a thing two ends can be "fixed" into agreeing about.

**The corollary is what makes the class findable.** A reconciliation keyed on **identity** — an `id`, a `name` — is structurally incapable of seeing a constraint keyed on a **grouping**: category exclusivity, `conflictsWith`, "one per role". The two write paths that carried the bug both reconciled on skill-id equality and were each correct on their own terms. So when you add or review a cross-scope reconciliation, state at the site which key it uses and therefore which class of constraint it cannot see. This is the same defect shape as 15.13 one level up: there, two identity axes and a guard on one; here, two _kinds_ of constraint and a reconciliation that answers one.

Read the flags from the merged matrix the caller passes in, never from `defaultCategories` — a source repository may override a category's `exclusive` flag, and a write path reading the built-in copy enforces the wrong catalogue's rule.

**15.15 A file the CLI writes into an installed skill directory is the only thing a later command can ask about that install.** `share`, `edit --ui` and `uninstall` all read `metadata.yaml` offline: no catalogue, no network. So a field added to it is invisible on every directory written before the field existed, and there is no migration that can add it retroactively — the information was never captured. **Record everything the INVERSE operation will need at the moment of writing, not when the inverse is built.** `injectForkedFromMetadata` recorded `forkedFrom.source`, the repository a carried skill's bytes came from, and not `forkedFrom.path`, the directory inside it; nothing needed the directory at the time, because the producer that would need it did not exist yet. The result was a skill that installs into project A, shares from A, and installs into a clean project B as nothing at all — because a `path`-less record is byte-for-byte what an ordinary ejected catalogue skill records, so `share` re-emits it as a bare id no other machine can resolve.

Two consequences worth stating with it. **The discriminator should be the property, not a flag** — "has a recorded directory" IS what makes a skill external, so `path` decides it and a separate `external: true` would be a second writable copy of the same fact. And **half an address is refused rather than guessed**: a directory recorded with no repository produces a named refusal, so no payload claims to carry content it could not read.

**15.16 An existence check tests the exact path its refusal names.** `directoryExists(path.dirname(p))` and `fileExists(p)` answer different questions, and a guard naming one while testing the other is correct only for the inputs where the two happen to agree. **The refusal text is the specification**: if it says "this file is missing", the check is on the file. `fetchMarketplace` guarded `.claude-plugin/marketplace.json` by testing `.claude-plugin/`, and the shape that separates them is the commonest one in this domain — a plugin repository ships `.claude-plugin/plugin.json` and no marketplace beside it, so for every such repository the guard answered "the manifest is there", the read two statements later threw ENOENT, and the absence surfaced as a generic failure. The existing message needed no change when the check was fixed; it was already true of the condition the guard was meant to detect and false of the one it detected. Note the direction the damage ran: the mismatch was harmless while one caller collapsed every throw into one sentence, and became a **new** false statement — a plugin repository reported as a marketplace whose manifest is present and broken — the moment 3.7's classification was added. Currently clean, and the grep is cheap enough to run on any new guard:

```
grep -rPn '(directoryExists|fileExists)\((path\.)?dirname' src e2e scripts --include='*.ts' --include='*.tsx'
```

---

**15.17 An artefact that ships to consumers narrows EVERY built-in table it inherits, not just some of them.** A published catalogue carries several tables the CLI supplies by default — relationship rules, category definitions, and anything else the built-ins seed — and they are one decision, not several: either the artefact advertises what its own marketplace actually holds, or it advertises the CLI's defaults. Narrowing one and not the others produces a catalogue that is internally inconsistent about what it is, and the inconsistency is invisible from inside either half. `narrowToShippedSlugs` in `lib/matrix/skill-resolution.ts` narrowed the RULES half against the slugs a source ships; the CATEGORIES half was not narrowed, **nothing said the two were one rule**, and a published catalogue advertised 102 categories its marketplace had nothing in for months. The tell is that each half reads correct on its own: the rules narrowing has a docblock explaining exactly why it is right, and the categories pass-through has no docblock at all, because nobody was ever asked the question. When adding a table to a shipped artefact, the question to answer in writing is "does this narrow with the others", and a `no` needs the reason beside it.

**15.18 A spec over a published artefact asserts every block it carries, not the subset that happens to be right.** An artefact with three blocks and a headline claiming all three is discharged by asserting three, and a spec asserting two reads as full coverage — the reader sees a journey row marked COVERED and a spec that visibly checks the artefact, and has no way to see which block went unasked. This is the arity form of the assertion rules in `standards/e2e/anti-patterns.md`: the gap is in what the spec does NOT name, so no search for the defect can find it. The instance: a journey asserted two of three blocks of a published catalogue and the unasserted one was the wrong one — the narrowing defect above lived in exactly the block nothing looked at. **Enumerate the artefact's blocks from the artefact's own schema or writer, never from the spec's imagination**, so a fourth block added later reddens the spec instead of silently joining the unasserted set.

## 16. Scope Awareness (project vs global)

**16.1 Always resolve skill/agent paths through `resolveInstallPaths(projectDir, scope)`.** Never hardcode `projectDir` when a skill has a `scope` field. Use `os.homedir()` as the root for `"global"` scope, `projectDir` for `"project"` scope. Passing `projectDir` to a global-scoped skill writes to the wrong filesystem.

**16.2 Never use `path.join(projectDir, LOCAL_SKILLS_PATH)` without checking scope.** Global-scoped local skills live at `~/.claude/skills/`, not `<project>/.claude/skills/`. Split skill lists by scope (`filter(s => s.scope === "global")` / `filter(s => s.scope !== "global")`) before any path-dependent operation (copy, delete, install, uninstall).

**16.3 Merge project and global local skills; never use one as a fallback only when the other is empty.** Always load both and merge — see `source-loader.ts` and `compile.ts` for the canonical pattern. Project takes precedence on ID conflicts. A conditional fallback (`if (project.length === 0) use global`) produces scope-dependent behavior that's impossible to reproduce.

**16.4 Never pass a uniform scope to `claudePluginInstall` / `claudePluginUninstall` for multiple skills.** Each skill carries its own scope in its `SkillConfig`; group per-scope before invoking.

**16.5 A saved `origin` wins over any computed default.** Never let a marketplace `primarySource` override the `origin` a user's config already records. The field is `origin` — it was `source`, and the rename did not reach `forkedFrom.source` in `lib/schemas.ts`, which is a different field and is still spelled that way. Its values are `EJECT_SOURCE` (`"eject"`, the project's own copy) or a marketplace name; there is no `"local"` origin.

The precedence for wizard restoration lives in `buildSkillConfigForId` in `stores/wizard-store.ts` and is two steps, not three: `origin: saved?.origin ?? defaultOriginFor(matrix.skills[id])`. **The fallback is `defaultOriginFor`, never `primarySourceName` on its own** — it answers `EJECT_SOURCE` for a skill the matrix flags local-only and `primarySourceName(skill) ?? DEFAULT_PUBLIC_SOURCE_NAME` for everything else, and its docblock says why: a marketplace origin on a skill no marketplace carries names an install that cannot happen, which is what made a locally-written skill default to a plugin it could never be. A saved origin is the user's intent; computed defaults are only a floor.

`resolveEffectiveSource` in the same file is a different question and takes three candidates — `configEntry?.origin`, `skill.activeSource?.name`, `primarySourceName(skill)` — because it decides which SOURCE ROW is preselected on the Sources grid, not what a restored config entry records. One call site, `resolveSkillRowInputs`. Do not read either as the other's shorthand.

---

## 17. Repository Hygiene

**17.1 Never commit machine-specific absolute paths in tracked files.** Paths like `/home/vince/…` or `C:\Users\…` pollute diffs for other contributors and CI. Use `process.cwd()`, `os.homedir()`, `path.join(projectDir, …)`, or a test-local temp dir from `createTempDir()` instead. If a tool insists on an absolute path (e.g., `settings.json` hook commands), parameterize via an env var or scope the file to `.claude/settings.local.json` which is gitignored.

**17.2 Do not introduce git worktrees (`isolation: "worktree"`).** Worktrees fragment the repo state and break the single-working-tree assumption many workflows depend on. If you need isolated branches, use a separate clone.

**17.3 A generator whose output is committed defines its own ordering, byte-wise, at the emission site.** "The input happened to arrive sorted" is not an ordering and neither is the default locale. `mergeMatrixWithSkills` filled its skills record in input order and the generator handed it `readdirSync`'s array, so `BUILT_IN_MATRIX.skills` took its key order from the filesystem — near-sorted on a development machine, hash-scrambled on the runner's ext4. Every local check stayed green forever, because a machine always agrees with itself; the first cross-machine regeneration produced a 17,300-line pull request in which every changed line was a reordering of an identical multiset. `localeCompare` is the same defect a colleague's laptop later. Called with no locale argument it does not read the ICU build; it reads the process's default collation, which Node takes from `LC_ALL` / `LANG` — so the discriminator is whatever desktop language the contributor who regenerated the file happens to run, today, on the ICU everyone already has. Real locales disagree with code units over ordinary kebab-case names: `lt` and `lv` place `y` immediately after `i`, so both order the shipped categories `mobile-styling` before `mobile-storage`, and the built binary emitted a different `config-types.ts` under `LC_ALL=lt_LT.UTF-8` than under `en_US.UTF-8` — same version, same command, same machine. Use `bytewise` from `src/cli/utils/string.ts`, which compares code units.

The proof obligation is a spec that feeds the generator permuted inputs and requires byte-identical output, red-first against code that merely happened to pass — `generate-source-types.test.ts` carries one. **The input that reddens it must be one production can actually produce.** A capitalised category is the first discriminator to reach for and is unreachable: `categoryPathSchema` refuses anything outside `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`, so a spec resting on one is red before the fix and green after while asserting about an input the parser rejects. Find the discriminator in real data instead — here it was two categories the catalogue already ships. The check:

```
grep -rn '\.localeCompare(' scripts/ src/cli --include='*.ts' --include='*.tsx' \
  --exclude='*.test.ts' --exclude='*.test.tsx' --exclude-dir=__tests__
```

Display code is exempt and still answers that grep: `compareGroupLabels` in `src/cli/components/wizard/stack-selection.tsx` orders group headings on screen and writes nothing, so locale sensitivity is what it should have. The rule governs emission, not presentation — before reading a hit as a violation, ask whether its result reaches a file somebody commits. This rule sits beside 17.1 for the same reason: both are about output that encodes the machine that produced it.

**17.4 A rename is finished at the surfaces nothing executes, or it is not finished.** CLAUDE.md's
standing instruction — "ALWAYS grep for the old value when changing test data or renaming anything" —
is right and is one word short: it says to grep and does not say what counts as a hit, so a pass
greps, fixes everything a tool can fail on, and reports the rename complete. A field or a noun has
five surfaces and tooling covers two:

| Surface                                                                  | What catches it                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Typed positions                                                          | `tsc`                                                                                                          |
| Persisted-key positions                                                  | the Zod rename guard — `RENAMED_CONFIG_FIELDS` / `RENAMED_SKILL_ENTRY_FIELDS` in `lib/schemas.ts`              |
| Untyped assertion literals, fixture template strings, assertion messages | nothing; they fail when the suite that holds them is run, which may not be the suite the pass was asked to run |
| Prose, comments and helper OPTION names                                  | nothing, ever                                                                                                  |
| An identifier whose VALUE was corrected and whose NAME was not           | nothing, ever — and specifically not the old-value grep                                                        |

The last row is the one worth writing down, because **the detection strategy for it is the inverse of
the rule above: grep the NEW value and read what holds each hit.** A constant re-pointed to the
surviving wording and left under the withdrawn one is invisible to a grep of the withdrawn wording,
because the wording is the half that was fixed — `LOCAL_SOURCE_NOT_FOUND = "Local marketplace not
found:"` survived a rename pass and a green suite that way, and is now
`LOCAL_MARKETPLACE_NOT_FOUND` in both `e2e/interactive/refusal-lands-before-the-spinner.e2e.test.ts`
and `e2e/lifecycle/init-edit-error-guards.e2e.test.ts`, name and value together.

Rows three to five have one property in common and it is what makes the rule a rule: **none of them
can ever go red, so they are corrected in the same pass or they are not corrected at all.** A later
run cannot find them and a later reader has no reason to doubt them. Both specimens this section
carried are repaired as of 2026-08-21, and each taught a different half:

- `describe("stored source resolution")` in `e2e/commands/compile.e2e.test.ts` sat over specs whose
  own `it` names correctly said marketplace and whose assertions read `Marketplace:`. One heading,
  in the one position nothing reads.
- Three `it` names in `src/cli/lib/__tests__/user-journeys/config-precedence.test.ts` read
  `CC_SOURCE`, each over a body that sets `process.env[SOURCE_ENV_VAR]` — and `SOURCE_ENV_VAR` in
  `lib/configuration/config.ts` is `"CC_MARKETPLACE"`. This one is the sharper lesson, because the
  old-value grep **does** return it: the identifier was right there in the name. Grepping was never
  the gap. Accounting for the hits was, and a hit in an `it` name reads as prose to a pass looking
  for code.

**The second specimen's class is now held, and only that class.** `scripts/check-spec-name-vocabulary.ts`
reads the name every `it`, `describe` and `test` in the package gives itself, takes every
constant-shaped token out of it — one containing an underscore, which is how this codebase spells a
constant and an environment variable and is not how it writes prose — and requires each to be a
token some non-spec module holds **in code**. Resolving against comments is what the first draft did
and it made the scan vouch for itself: its own docblock named the withdrawn variable, so the run
reported clean. Across 431 specs and 299 modules the finished scan reported exactly the three names
above and nothing else.

What it does NOT cover is the rest of rows three to five: a heading whose stale word is an ordinary
one (`source`, as in the first specimen), a comment, a helper's option name, an assertion message.
Those still have nothing, ever. So: run both greps, and account for every hit rather than every
failure. A test name, a `describe`
heading, an assertion message and a helper's option name are all part of the rename — see
`e2e/README.md` under File Naming, which carries the same rule for the E2E tree. And where a rename
pass is scoped to one tree, it reports its scope in the same sentence as its result: "the unit suite
is green" is a statement about one tree, and it has been received as "the rename is verified".

---

## 18. Command Layer

`src/cli/base-command.ts` is where every cross-command posture already lives — `ensureConfigReadable`, `requireMarketplaceOrExit`, `handleError`, `refuseProjectScopedContentAtHome`, and the `report*` family. These rules govern what belongs there and what a command may keep to itself.

**18.1 A line more than one command prints belongs on `BaseCommand`.** If two commands narrate the same operation, the narration is a property of the operation, not of either command — so it moves the first time a second caller needs it, not the second time it drifts. `reportValidationErrors` was private on `Edit` while `init` computed the identical `SelectionValidation` and discarded it, so a conflicting pair or an unmet requirement was reported or not depending on which door the user came through. `reportPropagatedRecompile` went the other way: four commands each held a copy, two as private methods of the same name that agreed on everything a reader compares at a glance and disagreed on a plural (`N registered projects` versus `N registered project(s)`). The divergence had already become load-bearing — `PROPAGATED_RECOMPILE` in `e2e/pages/constants.ts` carried a comment telling specs to anchor on the command-agnostic prefix _because_ the two commands spelled the rest of the line differently. A constant whose doc comment documents a defect is the defect having outlived the chance to be noticed as one.

The general form covers any two surfaces, not only two commands: **if a string appears on screen from two code paths, one of them is a formatter and the other calls it.** E2E constants key off rendered text, so a second copy is a surface with no assertable identity. The wording lives in `src/cli/utils/messages.ts` and the base class calls it.

The tripwire is narrower and worth stating with the rule: **a field on `WizardResultV2` that only one of its consumers reads is a defect until proven otherwise.** The detection heuristic is one grep, and two private methods of the same name in two commands is the signature:

```
grep -rhoP '^\s+private (async )?[a-zA-Z]+\(' src/cli/commands/ | grep -oP '[a-zA-Z]+\($' | sort | uniq -d
```

It reports a candidate, not a verdict — `reportSuccess` in `init` and `uninstall` narrate different operations and are correctly separate, as is `printHeader` across five commands. The six that share one operation (`decodeSeedOrFail`, `registerExternalSkillsOrFail`, `selectionFromSharedConfig`, `selectionFromWizard`, `writeCarriedSkills`, `writeConfigAndCompile`, all in `init.tsx` and `edit.tsx`) are the `--from` pair, and 18.2 is the question to ask of them.

**18.2 A second producer of one apply sequence inherits the first's refusals, and a destructive one re-costs the first's harmless outcomes.** Wiring a new entry point into a sequence something else already drives owes two questions, and a green suite answers neither — the first producer's specs cover the first producer.

1. **Which refusals does the existing producer carry, and does each one hold here?** A refusal about the payload or the directory, rather than about that command's own preconditions, holds for every producer, and an invariant enforced on one is enforced nowhere. Put it where both reach it rather than copying it. `edit --from` was built hours after `init --from`'s refusals settled, reused its decode and its wording, and declared no home-scope refusal — so the same payload applied at `$HOME` wrote `scope: "project"` rows into the global config through the other door.
2. **Which of the existing producer's non-failures are non-failures HERE?** Skipping, defaulting and ignoring are free over a clean directory and are not free over an installation. A destructive command acts on intent and never on its own inability to place, resolve or understand something: where it cannot carry out an instruction it was given, the entry stays and the run says why.

**18.3 A delegated command receives the caller's intent explicitly.** When one command invokes another (`config.runCommand`, dashboard routing, a shared flow function), any behaviour that differs per caller is passed as an argument or an explicit flag. Do not re-derive it inside the callee from filesystem or config state — a state proxy is true for callers you did not have in mind, and it changes meaning when unrelated state changes. Three intentions collapsed onto one `cc edit` invocation because the intent was absent, and two E2E suites encoded contradictory expectations for what looked like the same scenario; both were green only because an unrelated stale-config bug kept the roster diff artificially non-empty. Two prior diagnoses each proposed a state-derived proxy (`installation.projectDir !== cwd`, the absence of a project `config.ts`) and neither works, because both are equally true for the bare inspection case. The difference is not in the state, it is in who asked.

The mechanism is a `hidden: true` oclif flag whose key is a shared exported constant, named for the INTENT (`--project-setup`) and never for the mechanism (`--write-config`, `--force-register`). Hidden keeps it off the documented CLI surface; the shared constant keeps the declaring command and the emitting caller from drifting. Forbidden alternatives: module-level mutable flags, environment variables, and "the callee can figure it out from `cwd` / `projectDir` / whether a file exists". When a fix proposes a predicate to distinguish two flows, enumerate every entry point that reaches the predicate and confirm it evaluates differently for each — if two entry points with opposite required behaviour produce the same value, the predicate is a proxy and the signal has to come from the caller.

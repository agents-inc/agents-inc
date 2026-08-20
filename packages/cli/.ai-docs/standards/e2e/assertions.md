---
last_validated: 2026-07-30
---

# Assertions

How to verify outcomes after a test runs.

---

## Matchers Are the Standard

All file-based assertions go through custom Vitest matchers. Tests never call `readFile`, `readdir`, or `fileExists` directly in `it()` blocks. The matcher encapsulates the file reading.

**Why:** If the config file format changes from `config.ts` to `config.yaml`, a matcher-based test needs zero changes -- only the matcher implementation updates. A test that calls `readFile(path.join(dir, ".claude-src", "config.ts"))` breaks everywhere.

---

## Registering Matchers

Every test file that uses project matchers must include this side-effect import:

```typescript
import "../matchers/setup.js";
```

This registers the matchers with Vitest's `expect.extend()` and augments the TypeScript types. Without it, `toHaveConfig` and friends are not available.

---

## Available Matchers

All matchers accept a `ProjectHandle` (`{ dir: string }`) as the first argument via `expect()`.

### `toHaveConfig(expectations?)`

Checks that `.claude-src/config.ts` exists. Optionally validates content.

```typescript
// DISCOURAGED: bare call only checks file exists, not content
// await expect(project).toHaveConfig();

// PREFERRED: always specify expected content
await expect(project).toHaveConfig({
  skillIds: ["web-framework-react"],
  marketplace: "agents-inc",
  agents: ["web-developer"],
});
```

### `toHaveCompiledAgents()`

Checks that `.claude/agents/` contains at least one `.md` file.

```typescript
await expect(project).toHaveCompiledAgents();
```

### `toHaveCompiledAgent(name)`

Checks that a specific agent file exists and starts with YAML frontmatter (`---`).

```typescript
await expect(project).toHaveCompiledAgent("web-developer");
```

### `toHaveCompiledAgentContent(name, { contains?, notContains? })`

Checks that a compiled agent's content includes or excludes specific strings.

```typescript
await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
  contains: ["web-framework-react", "name: web-developer"],
  notContains: ["api-framework-hono"],
});
```

### `toHaveSkillCopied(skillId)`

Checks that `SKILL.md` exists at `.claude/skills/<skillId>/SKILL.md`.

```typescript
await expect(result.project).toHaveSkillCopied("web-framework-react");
```

### `toHaveLocalSkills(ids?)`

Checks that `.claude/skills/` exists and optionally contains specific skill directories.

```typescript
// Any skills directory with entries
await expect(project).toHaveLocalSkills();

// Specific skill IDs present
await expect(project).toHaveLocalSkills(["web-framework-react", "api-framework-hono"]);
```

### `toHaveNoLocalSkills()`

Checks that `.claude/skills/` is empty or does not exist.

```typescript
await expect(project).toHaveNoLocalSkills();
```

### `toHavePlugin(key)`

Checks that a plugin is enabled in `.claude/settings.json`.

```typescript
await expect(project).toHavePlugin("plugin-key-here");
```

### `toHavePluginInRegistry(key, scope?)`

Checks that a plugin's installation record exists in `.claude/plugins/installed_plugins.json`. Optionally filters by scope (`"project"` or `"user"`).

```typescript
await expect({ dir: globalHome }).toHavePluginInRegistry("plugin-key", "user");
```

### `toHaveNoPlugins()`

Checks that no plugins are enabled in `settings.json`.

```typescript
await expect(project).toHaveNoPlugins();
```

### `toHaveEjectedTemplate()`

Checks that the ejected `agent.liquid` template exists at `.claude-src/agents/_templates/agent.liquid`.

```typescript
await expect(project).toHaveEjectedTemplate();
```

### `toHaveSettings(expectations?)`

Checks that `settings.json` exists. Optionally validates a nested key path and value.

```typescript
// Settings file exists
await expect(project).toHaveSettings();

// Specific nested key exists
await expect(project).toHaveSettings({
  hasKey: "permissions.allow",
});
```

**Note:** `keyValue` uses strict `!==` comparison, so it works for primitive values (strings, numbers, booleans) but not for arrays or objects (reference equality). Use `hasKey` alone to check existence, then read the file in a matcher if you need deep comparison.

---

## Assertion Utilities

Composite assertion helpers that combine multiple matchers. These are regular functions (not matchers) — call them directly, not through `expect()`.

### `expectPhaseSuccess(result, expectations)`

Verifies a wizard phase completed successfully: exit code, config content, compiled agents, copied skills.

```typescript
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";

await expectPhaseSuccess(result, {
  skillIds: ["web-framework-react"],
  agents: ["web-developer"],
  marketplace: "agents-inc",
  copiedSkills: ["web-framework-react"],
});
```

Use when a test has `EXIT_CODES.SUCCESS` + `toHaveConfig` + `toHaveCompiledAgent` together. **Cannot be used when:**

- Output assertions exist between exit code and config checks
- The config check targets `{ dir: fakeHome }` instead of `result.project`
- `CLI.run` results are used (already-resolved exitCode)

### `expectCleanUninstall(dir, options?)`

Verifies complete cleanup after uninstall.

```typescript
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";

await expectCleanUninstall(projectDir);
await expectCleanUninstall(projectDir, { removeConfig: true }); // --all flag
await expectCleanUninstall(projectDir, { preservedSkills: ["my-custom-skill"] });
```

### `expectDualScopeInstallation(globalHome, projectDir, expected)`

Verifies both scopes have correct config and compiled agents.

```typescript
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

await expectDualScopeInstallation(fakeHome, projectDir, {
  global: { skillIds: ["web-framework-react"], agents: ["web-developer"] },
  project: { skillIds: ["api-framework-hono"], agents: ["api-developer"] },
});
```

### `expectNoDuplicates(arr, label, context?)`

In `e2e/assertions/config-assertions.ts`, which holds this and nothing else. Asserts a string array holds no repeats, with `label`/`context` folded into the failure message — use it for skill-id and agent-name lists where a duplicate is the bug. Callers needing a composite invariant ("no duplicate (name, scope) pair") map their rows to a joined key first; the key string is what the failure reports.

### `normalizeConfigPreservingOrder(config)` and `normalizeGlobalConfig(config)`

**Not in `e2e/assertions/`.** Both live in `src/cli/lib/__tests__/helpers/config-comparison.ts` — one module, one implementation — and both reach specs through `e2e/helpers/test-utils.ts`. Each takes a serialized `config.ts`, drops the machine-specific `"projects"` line that holds absolute project paths, and returns a string to hand a `toStrictEqual`.

They differ in exactly one property, and it is load-bearing. `normalizeGlobalConfig` sorts the surviving lines, so a re-serialization that reorders entries compares equal and the assertion means "the same entries are present"; it is what the dual-scope integrity specs use to claim a project-scope edit left global MEMBERSHIP untouched. `normalizeConfigPreservingOrder` leaves every surviving line in place, so reordering still fails and the assertion means "byte for byte" — which is the regression class `e2e/lifecycle/scope-toggle-roundtrip.e2e.test.ts` exists to guard.

**Swapping one for the other under an existing assertion is an assertion change, not a refactor.** The two are one substitution apart and read identically at the call site, so deleting one and importing the other compiles, passes, and looks like a dedup while silently weakening "the passthrough edit rewrote the config byte for byte" into "it kept the same set of lines in any order". The strength is carried in the name rather than in a boolean a reader has to go and look up.

**The discrimination is pinned, not merely described.** One `it` in `config-comparison.test.ts` asserts, on the same reordered input, that `normalizeConfigPreservingOrder` does NOT compare equal and that `normalizeGlobalConfig` does. Neither half means anything alone — an order-sensitive normaliser that rejects a reordering proves nothing about the trap unless the sibling accepting it sits beside it — so both directions are asserted in a single `it`, which more than satisfies CLAUDE.md's requirement that a pinned negative and its permitted counterpart share one file. Nothing makes two assertions in separate files move together.

### A shared helper's signature is a claim about what it checks — in TYPE and in MECHANISM

An assertion helper is read at its call site and almost never opened. Whatever its signature says is
what sixty or a hundred specs believe, so a signature that overstates is a lie with a large blast
radius and no failure attached to it. Three properties have to be true, and the third is already
written down elsewhere.

**The parameter type is the narrowest union the value belongs to.** CLAUDE.md requires this of
factories — "ALWAYS type factory function parameters with the narrowest union type (`SkillId`, not
`string`)" — and an assertion helper is the same claim from the other end: a `readonly string[]`
named `skillIds` accepts a typo, a display name, a slug and a bare id from another marketplace, and
every one of them reaches `content.includes` or a `.map(...).sort()` and produces a message about a
skill nobody named. The live population is the expectation types on `toHaveConfig`
(`ConfigExpectations` in `e2e/matchers/project-matchers.ts`), `expectPhaseSuccess`
(`e2e/assertions/phase-assertions.ts`), `expectDualScopeInstallation`
(`e2e/assertions/scope-assertions.ts`) and `toHaveAgentDynamicSkills`
(`e2e/matchers/agent-matchers.ts`) — the four with call sites, in the hundreds between them.

```
grep -rnE 'skillIds\??: (readonly )?string\[\]' e2e src --include='*.ts' --include='*.tsx'
```

A worklist rather than a verdict, and the exemptions are real and named by CLAUDE.md's own cast
rule: an id at a boundary that genuinely accepts unvalidated input stays `string`, which is why
`skippedUnknownSkills` in `src/cli/utils/messages.ts` is correctly typed — its whole subject is ids
the catalogue could not place. The tell for a lie rather than a boundary is a NARROW SIBLING in the
same file: the module has the generated union imported already and declined to use it at the
position under suspicion, so no boundary explains the width. `PluginInstalledProjectOptions` in
`e2e/fixtures/plugin-install-state.ts` is the live specimen — `skillIds: string[]` sits directly
above `agents: AgentName[]`, `stack: Partial<Record<AgentName, FixtureStackAgentConfig>>` and
`domains?: Domain[]`, so one options type judges its agent names, its stack keys and its domains
against their generated unions and its skill ids against nothing. `EditableOptions` and
`PluginProjectOptions` in `e2e/fixtures/project-builder.ts` carry the same contrast three lines
wide.

**That specimen is a fixture because the assertion layer no longer holds one, and the absence is the
finding rather than an inconvenience.** It used to: `assertConfigIntegrity` took `SkillId[]` and
`AgentName[]` in the same module as `ExpectedConfig.skillIds: string[]`, and both went when
`config-assertions.ts` lost its zero-caller helpers on 2026-08-19. What remains is uniform — every
id-shaped field and parameter under `e2e/assertions/`, `e2e/matchers/`, `e2e/helpers/` and
`src/cli/lib/__tests__/assertions/` is `string[]` or `readonly string[]`. So this rule is **unmet across its whole subject**, not satisfied. The
exemplar and the defect it illustrated were deleted in one stroke, which is the failure to guard
against: a rule whose worked example is gone reads as discharged and quietly stops being applied.

**The mechanism is the one the name implies.** `toHaveConfig` checks `marketplace` and `origin` by
loading the config through `loadConfigOrFail` and reading the fields, and each of those two carries a
doc comment saying why — an unkeyed `includes` was answered by whichever occurrence came first,
because a marketplace name is also every plugin-installed skill's `origin` and frequently a path
segment besides. Its `skillIds` check, in the same matcher and a few statements above the structural
load, is `expectations.skillIds?.find((id) => !content.includes(id))`: a substring scan of the file's
text, satisfied by an id appearing in a comment, in a tombstone the expectation never mentioned, or
inside a longer id that contains it. Sixty-odd specs reach it and it proves considerably less than
its name. **Where a matcher already loads the artefact structurally for one field, every other field
it claims is checked structurally too** — the load is already paid for, and a mixed matcher is the
worst of the two, because the fields that are rigorous make the ones that are not look rigorous.

**The option NAME is the field it reads or writes**, which `clean-code-standards.md` 15.11 already
covers as a case of a name being a claim about contents. Not restated here; the point of listing it
beside the other two is that all three failed together on one rename, and a signature audit that
checks only names leaves the type and the mechanism exactly as wrong as it found them.

---

## Agent Matchers

Two matchers for compiled agent content, reading two different halves of the file. A compiled agent puts a **preloaded** skill's id in the YAML frontmatter `skills:` list and nowhere else, and a **dynamic** skill's id in the body under `<skill_activation_protocol>` → `## Available Skills (Require Loading)`. The split is made in `buildAgentTemplateContext` (`src/cli/lib/compiler.ts`), which partitions the agent's skills into `preloadedSkills` and `dynamicSkills` for `src/agents/_templates/agent.liquid` to render.

### `toHaveAgentFrontmatter(name, expectations?)`

Parses the frontmatter with the real YAML parser and checks the named fields.

```typescript
await expect(project).toHaveAgentFrontmatter("web-developer", {
  name: "web-developer",
  exactSkills: ["web-framework-react"], // the WHOLE preload list, in order
});
```

**`skills` is a subset check and `exactSkills` is the list.** `skills: [x]` passes on an agent that preloads x plus everything else it holds — which is the failure a preload-fidelity spec exists to catch, so it is the wrong field for that spec. Reach for `exactSkills` whenever the claim is "preloads these and nothing else", and for `noSkills: true` when the claim is "preloads nothing". The full expectation set is in `AgentFrontmatterExpectations` (`e2e/matchers/agent-matchers.ts`).

### `toHaveAgentDynamicSkills(name, expectations?)`

**Searches the whole body, not the activation-protocol section.** It strips the LEADING frontmatter block with a single non-global `replace` — anchored at string start, so the `---` section rules that recur throughout an agent body are untouched — and then runs `body.includes(id)` for every `skillIds` / `noSkillIds` entry over everything that remains.

```typescript
await expect(project).toHaveAgentDynamicSkills("web-developer", {
  skillIds: ["web-testing-vitest"], // present ANYWHERE in the body
  noSkillIds: ["api-framework-hono"], // absent from the whole body
});
```

What each expectation actually proves:

| Expectation             | Proves                                                                | Also satisfied by                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `skillIds: [x]`         | x's id appears somewhere below the frontmatter                        | any body prose naming x — `src/agents/meta/{agent-summoner,codex-keeper,skill-summoner}` name real skill ids in `playbook.md` / `output.md` |
| `noSkillIds: [x]`       | x's id appears nowhere below the frontmatter                          | a body that renders no skill section at all                                                                                                 |
| `hasActivationProtocol` | the body carries `<skill_activation_protocol>` **or** `<skills_note>` | an agent holding NO skills — the template emits `<skills_note>` for it                                                                      |
| `allPreloaded`          | the body carries no `<skill_activation_protocol>`                     | the same skill-less agent                                                                                                                   |

Two consequences. `hasActivationProtocol` is a weaker subject guard than its name suggests: it fires on the skills-note branch, so it proves the file has one of the two skill sections rather than that the dynamic list rendered. And because the id search is unscoped, a laziness claim is carried by the PAIR, never by `skillIds` alone — put `toHaveAgentFrontmatter({ exactSkills })` or `{ noSkills: true }` beside it so the preload list is pinned on the surface Claude Code actually reads.

**Preloaded vs dynamic in the fixture:** the stack decides. `createMockSkillAssignment(id, true)` in `e2e/helpers/create-e2e-source.ts` means preloaded, `createMockSkillAssignment(id)` means dynamic. Note that the `AGENT_TEMPLATE` in that same file is NOT what fixture agents compile from — `createLiquidEngine` (`src/cli/lib/compiler.ts`) resolves `agent.liquid` from the project's own `.claude-src/agents/_templates`, then `.claude/templates`, then the CLI's `src/agents/_templates`, and a marketplace source's template directory is never one of those roots.

---

## Expected Value Constants

Canonical expected values for E2E assertions. Import from `e2e/fixtures/expected-values.ts`.

```typescript
import { E2E_AGENTS } from "../fixtures/expected-values.js";

// Use in assertions:
await expectPhaseSuccess(result, { agents: E2E_AGENTS.WEB_AND_API });
```

Available constants:

- `E2E_AGENTS.WEB` — web-scope agent names
- `E2E_AGENTS.API` — api-scope agent names
- `E2E_AGENTS.WEB_AND_API` — both scopes combined (computed getter)
- `E2E_SKILL_IDS` — all 10 skill IDs from the E2E source. **Derived** from the fixture's own skill set and typed `readonly string[]`, not a hand-written tuple — and each id carries the fixture marketplace's namespace, so it is not a `SkillId`
- `E2E_MARKETPLACE_NAME` / `e2eSkillId(bare)` — the fixture marketplace's name and the builder that composes an id inside its namespace. Never spell either by hand
- `E2E_SKILL` — per-skill `id` <-> `slug` <-> `display` map
- `E2E_AGENT` — per-agent `name` <-> `display` map
- `E2E_AGENT_DISPLAY` — re-export of `E2E_AGENT_TITLES` from `create-e2e-source.ts`

`E2E_SKILL_TITLES` / `E2E_AGENT_TITLES` are written into each fixture's `metadata.yaml`, so they ARE the text the wizard renders. **Any assertion matching rendered skill or agent text must key off these rather than re-typing the string** — that includes the exact labels `BuildStep.focusSkill` / `selectSkill` take, which are matched with `===` after decoration stripping.

### An identity constant exposes every form the specs address it by, and call sites pick — they never normalise one form into another

A skill is addressed three ways and an agent two, and the forms are different strings: `E2E_SKILL.<slug>` carries `.id` (what `config.ts` records), `.slug` (what the source path uses) and `.display` (what the grid paints); `E2E_AGENT["web-developer"]` carries `.name` (what a compiled `<name>.md` is called and what `config.ts` records) and `.display` (the title `toggleAgent` / `navigateCursorToAgent` match).

**A constant that exposes only one of them does not get adopted — it gets worked around, and the workaround is invisible.** Agents shipped half-built for exactly that reason: `E2E_AGENT_DISPLAY` gave the title and `E2E_AGENTS.WEB` gave a `readonly` list, so the bare name had no home and four spec files re-declared it locally (`const WEB_DEVELOPER_AGENT_NAME = "web-developer"`, `const WEB_DEVELOPER: AgentName = "web-developer"`, and bare literals passed to `toHaveCompiledAgent` / `toContain`) in breach of the ban on file-local text constants. The two available dodges each made it worse: `E2E_AGENTS.WEB[0]` is less readable than the literal it replaces, and `E2E_AGENTS.WEB` cannot be passed to a builder option typed `agents?: AgentName[]` at all, because a `readonly` tuple is not assignable to a mutable array. **The measurable cost is that a sweep adopting `E2E_SKILL` everywhere it applies leaves every agent-name literal untouched, and the next sweep re-proposes the same adoption and reaches the same dead end.**

So: when a fixture's identity gains a second form, add it to the same object rather than beside it, read it from the one place that already owns it (`E2E_AGENT.display` reads `E2E_AGENT_TITLES` rather than re-typing the title, so a title change there cannot silently desync), and keep the object's `satisfies` on the object only while it has no accessor — `E2E_AGENTS.WEB_AND_API` is a getter and takes its clause on the member arrays instead, for the reason `typescript-types-bible.md` § 10 gives. Then let each call site choose: `.name` for config text, matcher arguments and factory inputs, `.display` for anything matched against rendered wizard text. Never convert one into the other at a call site, and never point a `.display` site at `.name`: no fixture title is a skill id, so a `.name` handed to a rendered-text site addresses a cell that is not painted.

---

## Exit Code Assertions

Always use named constants from `EXIT_CODES`. Never use bare numbers.

```typescript
expect(exitCode).toBe(EXIT_CODES.SUCCESS); // 0
expect(exitCode).toBe(EXIT_CODES.ERROR); // 1
expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS); // 2
```

**Why:** `expect(exitCode).toBe(0)` is opaque. Named constants document the intent and provide a single source of truth if values change.

---

## Object Equality

Use `toStrictEqual` for object and array comparisons. Never use `toEqual` for objects.

- `toStrictEqual` catches extra properties and class instance mismatches
- `toEqual` silently ignores these, masking bugs

```typescript
// Good
expect(result).toStrictEqual({ valid: true });
expect(parsed.skills).toStrictEqual([]);

// Bad -- extra properties pass silently
expect(result).toEqual({ valid: true });
```

`toBe` is fine for primitives (strings, numbers, booleans) where strict equality is the same.

---

## Writing Correct Assertion Values

When adding `toStrictEqual` assertions for config objects, verify these common pitfalls:

1. **Agent scope:** `preselectAgentsFromDomains` creates agents with `scope: "global"`, not `"project"`. Only scope-toggled agents get `"project"`.

2. **Skill ordering:** Skills are stored in domain iteration order (web → api → meta), NOT alphabetical. Use sorted comparisons or `expectConfigSkills`.

3. **Stack compaction:** When reading a config from disk, `{ id: "web-framework-react", preloaded: false }` is compacted to `"web-framework-react"` (bare string). Only `preloaded: true` entries keep the object form.

4. **undefined vs missing:** `toStrictEqual` distinguishes `{ excluded: undefined }` from `{}`. Production code omits `excluded` entirely for non-excluded entries — never include `excluded: undefined` in expected values.

5. **Preloaded vs dynamic skills:** In compiled agents, preloaded skills appear in YAML frontmatter `skills:` array. Dynamic skills appear in `<skill_activation_protocol>` body section. Check `createMockSkillAssignment(id, true)` to determine which is which.

**An expected value is derived, never observed.** Every expected value comes from a ruling, a definition file, or the test's own input fixture. If you cannot name where a value came from, you read it off the output — and the assertion then pins whatever the product happened to do that day, the defect included. Two `compile` specs are the worked example: one pinned a `Compiling global agents` banner over a config whose every entry is `scope: "project"`, the other matched `/Discovered \d+ local skills/`, a count that is green whichever way the question it exists to answer is settled. Neither expectation had a ruling behind it; both were read off a run. Where no ruling exists and one is needed, the spec is a question for the owner: record it as a finding and leave the spec alone rather than inventing an answer in an assertion. Derivation is also what a repair looks like — `contains: ["#"]` over a compiled agent became `toHaveAgentDynamicSkills` plus a body-after-terminator regex, and a whole-file `contains` became `toHaveAgentFrontmatter({ exactSkills })` in `compile.e2e.test.ts`, each expectation now coming from the writer that emits it.

**A spec whose name and whose body comment disagree is a defect report, not a test.** One of them is wrong, and until that is settled the spec cannot fail for the reason it claims. The first `compile` spec above is named for SKIPPING a skill with malformed `metadata.yaml`, over a comment saying the skill is still loaded from its `SKILL.md` frontmatter.

**A spec that pins a scope, ownership or propagation boundary cites where the boundary came from** — the decision that made the behaviour correct, in the file-level JSDoc. Not the ticket that added the spec: the ruling, the finding, or the standards section. Six E2E files and two unit cases once went red on a single change, and not one of them was testing a defect; each had been written FROM the behaviour and read as a deliberate contract, so the fix looked like the regression and the regression looked intentional. A boundary assertion with no provenance is indistinguishable from an accident of the implementation. `source-flag-is-init-only.e2e.test.ts` opens by naming its decision and its date ("Naming a marketplace is an INSTALL-time decision, so `--marketplace` is `init`'s flag and nobody else's (owner ruling 2026-08-09)"), and `compile-project-scope-containment.e2e.test.ts` names the containment ruling it pins in its first sentence. One sentence per file is the whole cost.

---

## Diff-Shape Assertions

For assertions over diff-shape collections (info-panel rows, config section diffs, scope-per-skill prefix maps), use `toStrictEqual` on a scope-anchored slice of the output — NEVER `expect.arrayContaining([<expected>])`. `arrayContaining` passes as long as the expected entries exist, so it silently tolerates extra wrong entries (e.g. a spurious `- React` row alongside the expected `• React`).

```typescript
// Bad -- passes even if a bogus "- React" row is also rendered
expect(rows).toEqual(expect.arrayContaining([{ prefix: "•", name: "React" }]));

// Good -- pins both the positive AND the absence of every other prefix
expect(rows).toStrictEqual([{ prefix: "•", name: "React" }]);
```

**When two rows share the same prefix, prove it by exhaustive negation.** Don't extract to a parsed struct — assert directly on `lastFrame()` / `getFullOutput()` with one `toContain("<prefix> <name>")` per expected row plus explicit `not.toContain("<bug-prefix> <name>")` for every diff prefix that must NOT appear:

```typescript
expect(frame).toContain("• React");
expect(frame).not.toContain("+ React");
expect(frame).not.toContain("- React");
expect(frame).not.toContain("~ React");
```

This is strictly stronger than `toStrictEqual({ project: "•", global: "•" })` on a parsed struct, because it pins the entire rendered frame rather than only the two slots a parser happened to look at. Parsed-struct assertions implicitly negate only at the scopes the helper inspects — they let bugs at other scopes ship silently.

**Never define parser/extractor helpers inside a test file** — loops, regex scans, and state-machine `currentScope` variables that pluck prefixes out of rendered output. An uninstrumented parser silently produces wrong answers when layout changes and obscures the rendered contract (the substring IS the contract). Assert directly on the frame with `toContain` + exhaustive negation. If genuinely reusable across tests, live it in `src/cli/lib/__tests__/helpers/` WITH its own tests — the only home a tested helper has, because no vitest project collects a `*.test.ts` under `e2e/helpers/`, so a test written there never runs while reading as coverage. Specs reach it through `e2e/helpers/test-utils.ts`. Full rule: [README.md § No parser/extractor helpers in test files](./README.md).

---

## Output Text Assertions

**Use `toContain` for substrings.** UI text evolves, so assert on distinctive fragments rather than exact strings:

```typescript
expect(output).toContain("Discovered 1 local skills");
```

**Use `toMatch` with regex for dynamic content:**

```typescript
expect(output).toMatch(/Recompiled \d+ global agents/);
```

**Use `STEP_TEXT` constants** for wizard step text, not raw strings:

```typescript
expect(output).toContain(STEP_TEXT.COMPILE_SUCCESS);
```

**Never assert on single characters or whitespace.** `toContain("+")` matches skill IDs, not change indicators. `toContain("G ")` matches any word starting with G. Use distinctive substrings.

---

## Anchor a Positive Assertion to Something Only Its Subject Carries

Distinctive is not the same as unique. `toContain` searches the whole capture, and both surfaces a spec reads — an append-only PTY stream, and a generated file — routinely carry the subject's name in more than one place for unrelated reasons. Where they do, the assertion pins whichever occurrence happens to match, which is not necessarily the one the test names.

### A fragment is not a line

When the captured stream carries more than one sentence about the same subject — a `warn()` on the way in and a summary row on the way out are the common pair — anchor the assertion to something only the intended line can carry: its marker, its scope tag, the punctuation the value sits inside.

`edit` prints both of these about one skill in one run, and `rawOutput` is append-only, so both are matchable:

```
Warning: Installed skill 'web-styling-tailwind' is not present in the loaded source — …
- web-styling-tailwind [P] (skill files no longer exist at /…)
```

`edit-wizard-local.e2e.test.ts` asserted `toContain("not present in")` for the removal REASON. It matched the store warning six steps earlier, and it stayed green when the reason on the removal row was changed outright — the exact string the assertion existed to pin. The anchored form is what ships now:

```typescript
expect(rawOutput, "the removal of an unresolvable skill must say why it went").toContain(
  `${REMOVED_MARKER} web-styling-tailwind [P] (${STEP_TEXT.REMOVED_REASON_FILES_GONE}`,
);
```

`- <id> [P] (` cannot appear in a `warn()` line, so only the Changes block can satisfy it. The three reason strings are `STEP_TEXT` members (`REMOVED_REASON_NOT_IN_SOURCE`, `REMOVED_REASON_FILES_GONE`, `REMOVED_REASON_NOT_INSTALLED`) so no spec can spell one a fourth way, and `edit-unresolvable-entry-removal-reasons.e2e.test.ts` anchors the NEGATIVE half the same way, by prefixing the forbidden reason with the row's own `[P] (`. An unanchored negative there would be answered by the warning too, and answered wrongly.

### A `toContain` over an enumerated refusal is answered by one line of it

A refusal that names every item it could not handle is a multi-line string, and `toContain` asks only whether one of those lines is somewhere in it. It cannot see how many others are, so the assertion reads identically over a run where the item under test was the only failure and over one where the fixture broke every item in the catalogue.

**Where a refusal enumerates per-item failures, assert the COUNT line as well as the item.** `copyFailureMessage` (`src/cli/lib/skills/skill-copier.ts`) opens with `Could not copy <failures> of <attempted> skills:` and follows it with one indented `  <id>: <problem>` per failure, so those two operands are the whole difference between the fault a spec names and a fixture that produced the rest of them.

Measured on `e2e/commands/eject-default-source-skill-absent.e2e.test.ts`, whose subject is one catalogue skill missing from a fetched checkout. `BUILT_IN_MATRIX` carries 238 skills, so the refusal that spec means to pin reads `Could not copy 1 of 238 skills`. Its first fixture wrote each carried skill's `SKILL.md` and no `metadata.yaml`; `injectForkedFromMetadata` reads that file to stamp provenance into the copy, so every other skill failed at the destination too and the refusal ran to a line per skill in the catalogue. The spec was **green** throughout, because the one line it asserts — `<id>: ENOENT` — was in there, surrounded by 237 lines of noise it could not distinguish itself from. `seedDefaultSourceCache` (`e2e/fixtures/default-source-cache.ts`) writes both files now and states the reason at the writer.

The count line is the only assertable form of "and nothing else went wrong", because the failure lines have no fixed cardinality to pin and no order to slice:

```
grep -rnE '\$\{[a-zA-Z_.]+\.length\} of \$\{' src/cli --include='*.ts' --include='*.tsx'
```

The second half is about the fixture rather than the assertion, and it extends [test-data.md § A Fixture Writes Content the Product Could Have Written](./test-data.md) in the other direction: **a fixture standing in for FETCHED content satisfies what the CLI READS from it, not merely what a copy needs to start.** A real checkout of a marketplace carries every file the install path opens. A fixture carrying only the files the first step needs manufactures failures no user can reach, and they land in whichever assertion is loose enough to admit them.

### Assert the declaration line of a generated artifact, never the bare identifier

The same rule against a file. `config-types.ts` emits several unions over the same names, so `expect(content).toContain("api-developer")` is satisfied by `AgentName` whatever `SelectedAgentName` narrowed to — a spec built on it cannot distinguish the behaviour it names from that behaviour's opposite, which is what `selected-agent-name-excluded.e2e.test.ts` could not do until the alias's derivation was re-sourced and the spec retargeted at it.

It now reads the declaration through `readGeneratedUnion(content, "SelectedAgentName")` — `src/cli/lib/__tests__/helpers/generated-types.ts`, a shared helper with its own tests — and asserts on the alias's right-hand side, including that it is not the bare `AgentName` fallback the emitter writes when nothing narrows it. A subject that appears in the artifact for several independent reasons has to be named by the one occurrence the spec means.

---

## A Sentinel Must Name the Substantive Claim, Not Its Lead-in

A `STEP_TEXT` member is the whole of what every spec using it holds the CLI to. Pick the fragment the **claim** lives in, never the fragment that introduces it: a preamble stays true whatever follows it, so a sentinel matching one is a sentinel that cannot fail. Three specs can assert it and none of them can see a false second half.

`DOCTOR_TIP_UNOWNED_INSTALL` is the worked example. The `orphans-unowned` tip in `src/cli/commands/doctor.ts` has two halves — a lead-in that names the situation, and a remedy that makes a claim about what another command does:

> Tip: Nothing declares the files above — `... init` writes a configuration that can own them again, or `... uninstall` **removes them, the compiled agents included**: each file listed carries this CLI's own provenance …

The sentinel used to be `"Nothing declares the files above"`. That is true of any wording of the remedy, so the two `doctor` specs and the lifecycle spec asserting it were all green while the remedy said the opposite of what `uninstall` does — the tip claimed identifying compiled agents needs the configuration that is gone, which `identifiableAgents`' fallback to the marker-carrying files had already made untrue. The constant is now `"removes them, the compiled agents included"`, and a remedy that changes takes it red.

**The test: name the wording that would have to change if the behaviour changed.** A row label, a step heading and a section title are legitimately short and legitimately invariant — they identify a screen rather than assert anything, and `DOCTOR_ROW_NO_ORPHANS` or `SCOPE_GLOBAL` are correct as they stand. The rule bites where a message makes a claim: a tip, a refusal, a reason line, a count's explanation. There, the sentinel goes in the clause a reader would dispute.

**This is not mechanically checkable, and the measurement is recorded so the conclusion can be re-derived rather than retried.** Two candidate checks were measured against all 172 members:

| Candidate check                                                       | Why it does not work                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locate each sentinel's message in `src/cli/`, flag lead-in positions  | 22 of the 172 appear nowhere in `src/cli/` verbatim, because the product COMPOSES them — `UNINSTALL_AGENTS_KEPT_ONE`, `PROPAGATED_RECOMPILE_ONE` and `DOCTOR_SKILLS_VALIDATED` are assembled around counts. A check that cannot find its subject 13% of the time either declines to judge those members silently or condemns them wrongly. |
| Flag a sentinel followed by a clause break in the message carrying it | Fires on 90 of the 150 that can be located, `DOCTOR_ROW_SKILLS_RESOLVED` ("Skills Resolved"), `DOCTOR_CONFIG_CHECK` ("Config Valid") and `SCOPE_GLOBAL` ("Global") among them. Every one of those is a label doing its job, and a check that condemns the good sentinels is worse than no check — it teaches the reader to suppress it.    |

A sentinel is therefore chosen by judgement and defended by a comment at its definition in `e2e/pages/constants.ts` saying **which** half of the message it is and why. `DOCTOR_TIP_UNOWNED_INSTALL` carries that comment; copy its shape.

Two further constraints follow from the same fact — a sentinel is a duplicate of something the product owns, and the spec using it cannot check the duplication. Each names the third party that can.

### A sentinel a page object WAITS on drifts by timing out, not by failing

A constant in `e2e/pages/constants.ts` that a step page object waits on is half a pair whose other half is product source, and **the two halves do not fail alike**. An assertion that drifts fails, naming the string. A wait has no assertion to fail — only a budget to exhaust — so it reports that the wizard did not load, which is not what happened.

The measurement: `STEP_TEXT.SOURCES` sat at `"Customize skill origins"` against a product rendering `"Customize skill sources"`. The unit suite stayed green throughout, because `wizard-layout.test.tsx` compares the product to a literal it carries itself and nothing in the unit suite reads `e2e/pages/constants.ts` at all — it is outside the unit `include` and behind its own tsconfig. Roughly a dozen wizard specs each burned the 45-second `TIMEOUTS.WIZARD_LOAD` budget before failing, and none of them said which string was wrong.

**The literal duplication is right and stays** — a spec importing the very constant under test would move both sides at once. What was missing is a third party comparing them, and `scripts/check-screen-sentinels.ts` is it: it reads both halves as SOURCE, so it crosses no tsconfig boundary and needs no build, and it names the pair and both spellings when they differ.

Four pairs are registered — `STEP_TEXT.STACK`, `.DOMAINS`, `.SOURCES` and `.AGENTS` against `STEP_DROPDOWN_LABEL` in `src/cli/components/wizard/wizard-layout.tsx`. **A pair is registerable when both halves are a literal string a symbol holds under a key**, which is what the other waited-on constants are not: `STEP_TEXT.BUILD` is a category label the fixture matrix supplies, and `CONFIRM`, `INIT_SUCCESS`, `BUILD_FOOTER` and `RESIZE_PROMPT` are fragments of messages the product composes at runtime — comparing a fragment against a template literal would be a false green. Adding a wait on a new screen means adding its pair, or accepting that its drift will arrive as a timeout.

### A message that hands the reader an invocation is checked by RUNNING it

Where the substantive claim IS a command, matching the wording cannot reach it. `compile`'s no-skills refusal named `agents-inc add <skill>` for as long as the message existed, and there has never been an `add` command. The specs asserting that wording were right about it, and `reference/commands/index.md` quoted it faithfully; the one instruction a stuck user was given still exited 127, because a quotation is a claim about the past and the command roster is a fact about the present. Only the binary can be asked for it.

So the sentinel goes on the **command**, not on the lead-in that introduces it, and the same constant is then both matched and invoked. `e2e/commands/compile-no-skills-refusal.e2e.test.ts` is the shape: `COMPILE_NO_SKILLS_ERROR` is `"No skills found. Run"` and `COMPILE_NO_SKILLS_REMEDY` is `"init"`, and the spec matches the refusal for `` `${CLI_INVOKE_COMMAND} ${STEP_TEXT.COMPILE_NO_SKILLS_REMEDY}` `` and then runs `CLI.run([STEP_TEXT.COMPILE_NO_SKILLS_REMEDY, "--help"])`. A probe of a hardcoded command name would prove nothing about what the user was told.

**The verdict is `EXIT_CODES.SUCCESS`, never "not 127", because the two ways to be absent differ and only success is one value.** Measured against the built binary: `init --help` exits 0, `add --help` exits 2 on oclif's help-topic refusal, and a bare `add react` exits 127 through `@oclif/plugin-not-found`. A negative verdict admits the middle one.

The suite-wide form of the same rule needs both halves and neither is worth anything alone: `src/cli/lib/__tests__/handed-out-invocations.test.ts` reads every message in `src/cli/` and refuses a `HANDED_OUT_INVOCATIONS` list that has stopped describing them, and `e2e/commands/handed-out-invocations.e2e.test.ts` runs every entry of that list against the real binary. A hand-written list of commands proves nothing about what the messages say; a scan nobody executes proves nothing about what the CLI answers.

---

## Assert the Departure, Not Only the Arrival

A spec that drives a transition between two states owes an assertion on what the **old** state left behind. "Nothing is left here" is a claim, and it needs evidence exactly as much as "the new thing arrived" does.

The vocabulary of a passing suite is arrival-shaped — `toContain`, `toHaveConfig`, `toBeVisible`, `toHaveURL` — so the gap is invisible from inside a spec: every assertion in it holds, and the thing that should have STOPPED was never named. Four defects reached a hand-run through this one blind spot, and the sequence is the same each time: a state change is driven, the surface the old state lives on is not revisited, and the stale value survives on it.

**Three surfaces hold old state after a transition, and each needs naming:**

| Surface                 | The departure to assert                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A notice or banner      | After any navigation that changes which address or scope is open, assert the notice — absent, or the exact text the new state owns |
| The stored selection    | After any change to the catalogue a selection is expressed in, assert the selection agrees with the new catalogue                  |
| The payload it produces | After any catalogue change, produce one payload and assert its catalogue reference and its contents name the same catalogue        |

Worked examples, all four found by hand against suites that were green:

- **A notice outlives its address.** The spec clicks the Configure nav item, asserts the URL and asserts the visitor's own selection is restored. It never asserts the notice, and the restore path has no clear-the-notice call — only two other paths do. "A shared configuration, not your own" stands on the visitor's own address until a full page load.
- **A configuration outlives its address.** Same walk, for a visitor whose slot has never been written. The store's `merge` answers an absent persisted value by returning the current one, which is right at startup where current is empty and wrong on a reattach where current is somebody else's configuration. **Only the populated branch was ever driven** — an empty-slot case is a different branch through the same merge and needs its own leg.
- **A selection outlives its catalogue.** One of the two doors that loads a marketplace prunes the selection to the new catalogue and the other does not, so the next payload names ids from two catalogues under one catalogue reference. No spec mints a payload after a catalogue change at all — every mint sits in a spec whose catalogue never moves, so the only surface the defect is visible on is never produced.
- **A name outlives its catalogue.** The marketplace specs assert the grid, the rail and the categories all swap. Nothing asserts that the catalogue's NAME and its REPOSITORY swapped with them, and both are hardcoded to the public marketplace — so a custom marketplace gets the public one's name in a dialog and 404 source links throughout.

**The rule is prose, not a checker, and deliberately.** "Drives a transition" has no syntactic signature: every mechanical proxy for it is a hand-maintained list of page-object methods, and a spec using a method nobody added to the list reads as having no transition to answer for. That silent decline is the same defect one level up. What IS mechanically detectable is the narrowest form — a spec file that changes a catalogue and never mints — and it is worth building only in the suite where those two calls have stable names.

The CLI half of this rule already exists as [README.md § State-change verification](./README.md), which requires config AND filesystem to be asserted after any operation that changes either, and a before/after snapshot where the operation should change nothing. Same demand, same words: absence is a claim.

---

## A Proof of Execution Names a Side Effect the Flow Is Supposed to Produce

[README.md § Prove the code path fired](./README.md) requires a proof-of-execution assertion — a file-content diff, an mtime change, a side-effect invariant — beside the contract assertions, so a regression that short-circuits before the contract code runs cannot produce a vacuous pass. Every proxy in that list is a **write**, and that is fine for a flow whose job is to write. For a flow whose correct behaviour is to write NOTHING, reaching for one anyway pins the opposite of the contract, and it passes for as long as the product is wrong.

**Split the two claims and assert them separately: that the run REACHED its decision, and that the decision was ACTED ON.** Only the first is the proof of execution, and for a no-op it can only be an observable the run emits on the way — a report, a heading, a count line.

`e2e/lifecycle/edit-noop-leaves-compiled-agents-untouched.e2e.test.ts` is the worked case. The edit wizard is walked end to end with no key that selects, deselects or rescopes anything, over an installation a real `init` wrote:

- **Reached the decision:** `STEP_TEXT.EDIT_UNCHANGED` in the run's output. Without it, a run that crashed before writing satisfies every unchanged-state assertion below for free.
- **Acted on it:** `readTreeSnapshot` equality over `.claude/agents/` and over `.claude-src/`, against snapshots taken after the install. **The mtime half is what separates "not rewritten" from "rewritten identically"** — a recompile of an unchanged config produces the same bytes, so content alone cannot see it, and the write is invisible in a diff while being plainly a write.

The counter-example is why the rule exists. Five specs used to assert `toHaveCompiledAgents()` and a substring of the emitted config after a passthrough edit, and all five held only because `edit` had a phantom write: it hydrated its agent roster from a field most configs did not carry, fell back to the wizard's default roster, and `detectConfigChanges` (`src/cli/commands/edit.tsx`) then found a diff nobody had made. `toHaveCompiledAgents()` is wrong here twice over — it reads presence (`readdir` for any `.md`), so the install alone satisfies it and it says nothing at all about the run; and read as a proof of execution it claims the run recompiled, which a correct passthrough must not do. Retargeting those five at their real subjects removed the last assertion touching this behaviour and left it stated nowhere, which is what the named spec now holds.

---

## Assert the Surface That Retains the Value

Three output surfaces exist, and they do not hold the same thing.

| Surface                                                                | What it holds                                                                           | Assert on it when                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `getScreen()`                                                          | **Scrollback + viewport** — NOT viewport-only, despite its name (see the warning below) | Asserting POSITIVELY on current content                  |
| `getOutput()` / `getFullOutput()`                                      | xterm's PROCESSED buffer: current screen + whatever genuinely scrolled off              | The value is on screen at capture time                   |
| `getRawOutput()` / `waitForRawText` / `waitForTextAfter` / `*Awaiting` | Every byte the process wrote — append-only                                              | The value may already have been overwritten by a repaint |

**`getOutput()` is not a frame log.** Ink redraws in place, so when a frame fits the viewport each repaint overwrites the previous one and nothing enters scrollback. A value that was rendered and then re-rendered differently is unrecoverable from it. Never assert "an earlier frame contained X" via `getOutput()`.

**`getScreen()` is not viewport-only, so NO surface here is safe for an absence assertion.** It reads absolute buffer lines `0 .. viewportY + rows` — scrollback plus viewport. The name is the only thing that suggests otherwise; the method's own JSDoc states the range. Consequence: see [§ Negative Assertions](#negative-assertions) below — none of the three surfaces can carry a `not.toContain` about text the session once legitimately drew. Mechanics: [reference/testing/e2e-infrastructure.md § `getScreen()` is not viewport-only](../../reference/testing/e2e-infrastructure.md).

**Toasts are always a raw-output assertion.** They render in an absolutely-positioned row Ink rewrites in place. Use the `*Awaiting` step methods (`toggleFocusedSkillAwaiting`, `selectSkillAwaiting`, `toggleFocusedAgentAwaiting`, `confirmAwaiting`), which snapshot a raw cursor before the press and wait on raw output after it. A non-anchored raw match would be satisfied by an earlier frame's residue.

**Colour is never assertable in E2E.** The harness runs with `NO_COLOR`, so every E2E spec asserts the marker (`+`, `-`, `~`, `•`), not the colour. In-grid selected state is likewise colour-only in the build grid — read it via `getExclusiveCategorySelectedCount(category)`, the sole text-observable signal. A "these two surfaces use the same colour" contract needs a component test with a forced chalk level; see [reference/testing/infrastructure.md § Asserting Colour in Ink Component Tests](../../reference/testing/infrastructure.md).

---

## Negative Assertions

Assert specific absence, not generic "no error."

```typescript
// Bad: too broad, matches skill IDs containing "error"
expect(output).not.toContain("error");

// Good: asserts a specific skill was not included
expect(configContent).not.toContain("web-styling-tailwind");

// Good: asserts no archive warnings
expect(output).not.toContain("Failed to archive");
expect(output).not.toContain("ENOENT");
```

### A negative assertion names the input that makes it true

Before asserting that a row, a line or a field is absent, state which of ITS inputs the fixture broke. If the answer is "none of them", the assertion is pinning a blanket rule rather than a behaviour — and it holds for exactly as long as that rule exists, including all the time the rule is wrong.

`doctor` runs a content layer and then an operational layer, and used to stand the whole operational layer down whenever any content row failed. Two specs pinned that: one seeded a broken MARKETPLACE and asserted `not.toContain("Config Valid")`, a row that reads `config.ts` and nothing the marketplace holds. The fixture had not touched a single input that row consults, so the assertion could only ever have been about the gating rule.

**Assert the row, not the rule.** An assertion message may say what the row could not have known; it may never restate the implementation's own justification. Both messages here did — "operational findings on broken content are downstream cascades and must not be printed" — which is a paraphrase of the branch under test, and a paraphrase passes for exactly as long as the branch exists. So the over-reach was not merely uncaught: removing it looked like a regression, in the two files a developer opens first. What ships now names the row's inputs, in a spec scoped to what the seeded error can actually reach:

```typescript
// doctor-content.test.ts — "should stand down only the row a broken primary source can mislead"
expect(stdout, "the config row reads config.ts and nothing the marketplace holds").toContain(
  ROW_CONFIG_VALID,
);
```

The product now carries the same distinction structurally, which is what a spec of this kind should be reading: each `GatedContentCheck` in `src/cli/commands/doctor.ts` declares `blocks` — the operational rows whose own verdict would be that pass's finding re-worded — and `Agents` declares none, because nothing downstream opens an agent `.md`. A negative that cannot name the edge it rides on is a negative about nothing.

### A negative over tool output quotes the tool's own string

Run the failing case once and copy what the tool actually prints. A negative built from a paraphrase — "unknown flag", "not found", "invalid" — is satisfied by every outcome, the one it was written to exclude included.

**oclif never prints "unknown flag".** Its parser refuses an undeclared flag with `Nonexistent flag: --refresh`, so `expect(output.toLowerCase()).not.toContain("unknown flag")` holds whether the flag was accepted, rejected, crashed on for an unrelated reason, or produced no error object at all. A spec named for accepting a flag its command has never declared was green on that assertion for as long as anyone can tell. That spelling is gone from the tree; three siblings of it are not — see the sweep-scoping rule below.

The refusal is the assertion that can fail, and it is what ships beside the withdrawn flags:

```typescript
expect(error?.message).toContain("Nonexistent flag: --refresh");
```

`source-flag-is-init-only.e2e.test.ts` names the refusal for four flag spellings in its own constants — long and short, current and withdrawn — alongside the different refusal a flag that exists and is missing its value produces. `e2e/pages/terminal-screen.ts` carries the same string as `PARSE_REFUSAL`, so the harness recognises a parse refusal rather than inferring one from an exit code.

**The mechanical test: make the assertion's subject true on purpose and confirm the spec goes red.** Pass a flag that really is undeclared; seed the error the message names; break the thing the negative forbids. Every case of this class would have been caught by that in one run.

**A paraphrase sweep is scoped by the CLASS, not by the string.** When a negative is found to paraphrase a tool's message, the sweep's subject is every negative in the same `expect` block and every other paraphrase of that tool's vocabulary — not the one spelling that was reported. The `unknown flag` sweep was scoped to its own spelling and repaired 31 sites; three sibling paraphrases of the same parser sat in the same `it()` blocks, several on the line directly beneath a repaired one, and each was vacuous for exactly the same reason:

| Assertion, as written                   | What oclif prints                                            |
| --------------------------------------- | ------------------------------------------------------------ |
| `not.toContain("missing required arg")` | `Missing 1 required arg:` — the count sits inside the phrase |
| `not.toContain("unexpected argument")`  | `Warning: <cmd> <arg> is not a agents-inc command.`          |
| `not.toContain("crash")`                | nothing; "crash" is a state, not a word any layer emits      |

`missing required arg` is the sharpest of the three, because it is one character group away from being real: a reader checking it against a remembered error message confirms it and moves on. **Run the failing case once and copy the whole message.**

**A string-scoped sweep leaves the file reading worse than it found it**, and that is the argument for the class scoping rather than tidiness. A repaired site asserts `not.toContain(parseRefusal("--output-dir"))` — the parser's own sentence, naming the exact flag the run passed. A vacuous negative then sits immediately below a discriminating one with nothing distinguishing them by shape, so the file reads as uniformly careful and the survivors are harder to find than they were before anything was repaired.

Where the message is asserted from both trees it needs a definition in each, because a unit spec may not import from `e2e/` any more than the reverse: `parseRefusal(flag)` in `src/cli/lib/__tests__/helpers/cli-runner.ts` sits beside the `run()` call that produces the message, and `PARSE_REFUSAL` in `e2e/pages/terminal-screen.ts` beside the PTY screen reader. Two definitions of one string is the cost of the tree boundary and is deliberate; a third is not.

### A negated word assertion must not run against text the harness contributed to

**Before writing `not.toMatch(/\bword\b/i)` over a message, establish which parts of that message the product COMPOSES and which parts it ECHOES back** — paths, ids, refs, marketplace names, query strings, user input. A negative over echoed text is a statement about the fixture, and the fixture usually wins.

The failure mode is worth naming because of its shape: the spec goes red for a reason that looks exactly like a product defect, and the obvious "fix" is to stop naming the path — which silently deletes a diagnostic a sibling spec exists to protect. `\b` matches on both sides of a hyphen, a slash and a quote, so a temp-dir prefix `cc-source-fetcher-test-` and a path segment `/tmp/…/source` each satisfy `/\bsources?\b/i` on their own.

**Two ways to keep the assertion honest, in order of preference, and two rules that keep them applied.**

**1. Name the fixture out of the WHOLE vocabulary under test, not merely out of the forbidden half.** A temp-dir prefix, path segment, skill id or marketplace name used by a spec that forbids a word must spell neither the word being withdrawn NOR the word replacing it. A rename has two halves and the harness can defeat either: naming the fixture after the SURVIVING noun satisfies the "the new word arrived" positives off the echoed value — the same defect with the sign flipped, and harder to spot because the spec is green.

Prefer a name that says what the value is to the **harness** over one that says what it is to the **product**, because a harness word cannot be renamed out from under the spec by a product decision:

```diff
- const sourceDir = path.join(tempDir, "source");       // the withdrawn noun
- const sourceDir = path.join(tempDir, "marketplace");  // the surviving noun — same trap, sign flipped
+ const sourceDir = path.join(tempDir, "fixture");      // outside both halves
```

`createE2ESource` names its root `fixture` and `E2E_MARKETPLACE_NAME` is `e2e-test-fixture` for exactly this reason — and the marketplace name is the sharper case, because a marketplace's name is the prefix on every skill id it ships and `search` prints ids in its `ID` column.

**2. Scope the negative to the composed half** when the echoed value genuinely cannot avoid the word (a real user path). Anchoring is the cheapest form:

```typescript
// An absolute path cannot start a line with the word, so this asserts the row heading alone
expect(output).not.toMatch(/^\s*Sources?(\s|$)/m);
```

`doctor-content.e2e.test.ts` carries that shape. Copy it.

**3. Record the constraint where the name is CHOSEN, and treat shared fixtures as the priority case.** A name in `e2e/helpers/` or `__tests__/fixtures/` has many callers and none of them can see why it is what it is, so the next person to tidy it has nothing to stop them. One comment at the naming site is the whole guard. **A fixture name is never private to the spec that chose it once any message echoes it.**

**4. A class check must NAME the trees it read.** The defect exists wherever a negated word meets text the harness contributed — `src/` unit specs, `e2e/`, and component tests alike. A sweep of one tree settles one tree; write down which, or the conclusion reads as a statement about the repository and closes the class prematurely.

---

Three further constraints apply to any negative assertion about **rendered output**. Each one, independently, produces an assertion that cannot fail.

### 1. Never assert absence of text the session once legitimately drew

Every terminal surface includes scrollback (see the corrected table above), so the assertion tests the emulator's memory rather than the process's current output. Text drawn on any earlier frame is still matchable.

The resize guard is the sharpest case: shrinking the terminal pushes the entire pre-shrink frame into scrollback, so `not.toContain(STEP_TEXT.BUILD)` fails against residue **whether or not the guard works**. A cursor-anchored raw wait does not rescue it either — a resize paints twice (Ink's own `resized()` re-render, then the app's reaction to the new dimensions), so the post-cursor slice holds both frames.

Prove the negative by **order** or by **behaviour**:

```typescript
// Bad: scrollback-sensitive; fails either way
expect(step.getScreen()).not.toContain(STEP_TEXT.BUILD);

// Good (order): the prompt is the LAST thing painted, so nothing was drawn after it.
// Discriminating — with the guard reverted the buffer ends with the wizard footer.
expect(step.getScreen()).toMatch(/Please resize\.$/);

// Good (behaviour): drive the session and assert the outcome the absent element would have changed.
```

### 2. Pair every negative rendering assertion with a positive subject guard

A `not.toContain("<bug shape>")` on a clipped viewport passes for free when the captured frame paints none of the rows the bug shape is made of. Assert, in the very frame you captured, that the subject IS on screen:

```typescript
await confirm.scrollSummaryToBottom();
const screen = confirm.getScreen();
expect(screen).toContain("+ web-developer"); // positive guard: the subject is painted
expect(screen).not.toContain("─+ "); // now a real claim about it
```

Clearing the minimum-size gate is not evidence the content is visible — at `TERMINAL_SIZE.SHORT` the confirm panel's five rows are entirely filled by its header, and the first summary row appears six presses into the scroll range.

### 3. A counter is not its content

Asserting that a scroll affordance's "N more above / below" numbers moved does not establish that anything scrolled. Assert a row the movement revealed. Disabling the scroll outright left both counter assertions green while the frame showed the unscrolled header.

**Where a message reports a PARTITION, a spec asking "how many did this reach" asserts every operand.** The fan-out line is the second worked example, and the trap here is not a counter standing in for content but a counter whose subject is **narrower than the question**. `propagatedRecompileSummary` (`src/cli/utils/messages.ts`) prints `Recompiled agents in <rewritten> registered projects, <unchanged> unchanged` plus ` (<failed> failed)` when any failed, and the leading number counts projects this pass actually **rewrote** — a project the fan-out visited and left byte-identical is in `unchanged`. Projects reached is the SUM, and no single operand answers it. Two rows a reach assertion has to separate are ordered backwards by the leading number:

| The run                               | The line                                     |
| ------------------------------------- | -------------------------------------------- |
| reached two projects, rewrote neither | `... in 0 registered projects, 2 unchanged`  |
| reached ONE project, rewrote it       | `... in 1 registered projects, 0 unchanged`  |
| reached no project at all             | nothing printed — the reporter returns early |

Measured: a first draft asserting `` `${STEP_TEXT.PROPAGATED_RECOMPILE} 2 registered projects` `` as proof that a global edit reached both registered projects went **red against a correct binary** — the run had reached both, and the real line read `0 registered projects, 2 unchanged`, because the removed global sub-agent shared no skill with either project's own one. The dangerous direction is the other one: a spec asserting the leading count alone is green on the day it is written, because the author picks whichever arm their fixture happens to produce, and only becomes misleading when a later change moves the population into the other arm.

**Instead:** assert the whole pair, and let the constant carry the distinction. `STEP_TEXT.PROPAGATED_RECOMPILE_ONE`'s comment in `e2e/pages/constants.ts` now states that its count is projects rewritten rather than reached; `edit-global-propagates-to-every-registered-project.e2e.test.ts` and `global-fan-out-re-emit-is-byte-stable.e2e.test.ts` both assert `N registered projects, M unchanged` whole, and the first was mutation-checked — a `break` in `propagateGlobalChangesToProjects`' loop turns the line into `1 unchanged` and takes that assertion red with three others. `recompileSummary` (`N <subject> rewritten, M unchanged`) is the same shape one level down, asserted whole by `recompile-summary-honesty.e2e.test.ts`.

The census, and each hit judged on whether its assertion MESSAGE claims reach while its sentinel proves a rewrite — `global-fan-out-re-emit-is-byte-stable` says "the fan-out must have reached the registered project" over `PROPAGATED_RECOMPILE_ONE`, which is the misreading in miniature even though the run does rewrite:

```
grep -rn 'PROPAGATED_RECOMPILE\|AGENTS_REWRITTEN' e2e --include='*.ts' | grep -v UNCHANGED
```

This section extends [§ Assert the Surface That Retains the Value](#assert-the-surface-that-retains-the-value), which distinguishes WHICH surface holds a value but not whether the value was ever painted onto any of them. Full rationale, mutation evidence and the fixture-cardinality trap: [anti-patterns.md § Weak Assertions](./anti-patterns.md).

---

## When to Add a New Matcher

If you find yourself calling `readFile` in a test to check a file's content, that is a sign a new matcher is needed. Add it to `e2e/matchers/project-matchers.ts`, register it in `e2e/matchers/setup.ts` (both the `expect.extend` call and the TypeScript type augmentation), and use it in your test.

A good matcher:

- Takes a `{ dir: string }` as the receiver
- Reads files internally (the test never sees `readFile`)
- Returns clear error messages that include what was expected and what was found
- Supports both positive and negative assertions (the `message` function)

---

## Related

- [test-structure.md](./test-structure.md) -- Three-phase pattern (setup, interaction, assertion)
- [anti-patterns.md](./anti-patterns.md) -- Weak assertion anti-patterns
- [patterns.md](./patterns.md) -- Complete examples showing assertions in context

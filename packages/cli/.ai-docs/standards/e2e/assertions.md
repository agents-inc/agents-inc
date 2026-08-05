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
  source: "agents-inc",
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
  source: "agents-inc",
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

### `expectFullInstallation(...)`

Also in `phase-assertions.ts`. The heavier sibling of `expectPhaseSuccess` for flows that must verify a complete install rather than one phase's outcome.

### `expectDualScopeInstallation(globalHome, projectDir, expected)`

Verifies both scopes have correct config and compiled agents.

```typescript
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

await expectDualScopeInstallation(fakeHome, projectDir, {
  global: { skillIds: ["web-framework-react"], agents: ["web-developer"] },
  project: { skillIds: ["api-framework-hono"], agents: ["api-developer"] },
});
```

### `expectNoDuplicates(arr, label, context?)` and `normalizeConfigPreservingOrder(config)`

In `e2e/assertions/config-assertions.ts`. `expectNoDuplicates` asserts a string array holds no repeats, with `label`/`context` folded into the failure message — use it for skill-id and agent-name lists where a duplicate is the bug. `normalizeConfigPreservingOrder` normalizes generated config text for comparison while KEEPING declaration order, so it can be diffed against an expected snapshot; the unit-side `normalizeGlobalConfig` is the order-INSENSITIVE counterpart.

---

## Agent Matchers

Specialized matchers for compiled agent content. These distinguish between **preloaded** skills (YAML frontmatter) and **dynamic** skills (body activation protocol).

### `toHaveAgentFrontmatter(name, expectations?)`

Checks parsed YAML frontmatter fields of a compiled agent.

```typescript
await expect(project).toHaveAgentFrontmatter("web-developer", {
  name: "web-developer",
  skills: ["web-framework-react"], // preloaded skills in frontmatter
});
```

### `toHaveAgentDynamicSkills(name, expectations?)`

Checks the `<skill_activation_protocol>` body section for dynamic skills.

```typescript
await expect(project).toHaveAgentDynamicSkills("web-developer", {
  skillIds: ["web-testing-vitest"], // dynamic skills in body
  noSkillIds: ["api-framework-hono"], // must NOT be in body
});
```

**Preloaded vs dynamic:** The E2E stack defines which skills are preloaded. Check `create-e2e-source.ts` — `createMockSkillAssignment(id, true)` means preloaded (frontmatter), `createMockSkillAssignment(id)` means dynamic (body). Use the correct matcher for each.

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
- `E2E_SKILL_IDS` — all 9 skill IDs from the E2E source, as a tuple
- `E2E_SKILL` — per-skill `id` <-> `slug` <-> `display` map
- `E2E_AGENT` — per-agent `name` <-> `display` map
- `E2E_AGENT_DISPLAY` — re-export of `E2E_AGENT_TITLES` from `create-e2e-source.ts`

`E2E_SKILL_TITLES` / `E2E_AGENT_TITLES` are written into each fixture's `metadata.yaml`, so they ARE the text the wizard renders. **Any assertion matching rendered skill or agent text must key off these rather than re-typing the string** — that includes the exact labels `BuildStep.focusSkill` / `selectSkill` take, which are matched with `===` after decoration stripping.

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

**Never define parser/extractor helpers inside a test file** — loops, regex scans, and state-machine `currentScope` variables that pluck prefixes out of rendered output. An uninstrumented parser silently produces wrong answers when layout changes and obscures the rendered contract (the substring IS the contract). Assert directly on the frame with `toContain` + exhaustive negation. If genuinely reusable across tests, live it in `e2e/helpers/` WITH its own tests.

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

## Assert the Surface That Retains the Value

Three output surfaces exist, and they do not hold the same thing.

| Surface                                                                | What it holds                                                                                               | Assert on it when                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `getScreen()`                                                          | **Scrollback + viewport** — NOT viewport-only, despite its name and its doc comment (see the warning below) | Asserting POSITIVELY on current content                  |
| `getOutput()` / `getFullOutput()`                                      | xterm's PROCESSED buffer: current screen + whatever genuinely scrolled off                                  | The value is on screen at capture time                   |
| `getRawOutput()` / `waitForRawText` / `waitForTextAfter` / `*Awaiting` | Every byte the process wrote — append-only                                                                  | The value may already have been overwritten by a repaint |

**`getOutput()` is not a frame log.** Ink redraws in place, so when a frame fits the viewport each repaint overwrites the previous one and nothing enters scrollback. A value that was rendered and then re-rendered differently is unrecoverable from it. Never assert "an earlier frame contained X" via `getOutput()`.

**`getScreen()` is not viewport-only, so NO surface here is safe for an absence assertion.** It reads absolute buffer lines `0 .. viewportY + rows` — scrollback plus viewport. Its doc comment says "viewport only, no scrollback" and is wrong; the comment is left in place deliberately because every page object depends on the method, so correcting it needs its own audit pass. Until then, [reference/testing/e2e-infrastructure.md § `getScreen()` is not viewport-only](../../reference/testing/e2e-infrastructure.md) is the authority. Consequence: see [§ Negative Assertions](#negative-assertions) below — none of the three surfaces can carry a `not.toContain` about text the session once legitimately drew.

**Toasts are always a raw-output assertion.** They render in an absolutely-positioned row Ink rewrites in place. Use the `*Awaiting` step methods (`toggleFocusedSkillAwaiting`, `selectSkillAwaiting`, `toggleFilterIncompatibleAwaiting`, `toggleFocusedAgentAwaiting`, `confirmAwaiting`), which snapshot a raw cursor before the press and wait on raw output after it. A non-anchored raw match would be satisfied by an earlier frame's residue.

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

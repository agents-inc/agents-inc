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
- `E2E_SKILL_IDS` — all 10 skill IDs from the E2E source. **Derived** from the fixture's own skill set and typed `readonly string[]`, not a hand-written tuple — and each id carries the fixture marketplace's namespace, so it is not a `SkillId`
- `E2E_MARKETPLACE_NAME` / `e2eSkillId(bare)` — the fixture marketplace's name and the builder that composes an id inside its namespace. Never spell either by hand
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

## Assert the Surface That Retains the Value

Three output surfaces exist, and they do not hold the same thing.

| Surface                                                                | What it holds                                                                                               | Assert on it when                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `getScreen()`                                                          | **Scrollback + viewport** — NOT viewport-only, despite its name and its doc comment (see the warning below) | Asserting POSITIVELY on current content                  |
| `getOutput()` / `getFullOutput()`                                      | xterm's PROCESSED buffer: current screen + whatever genuinely scrolled off                                  | The value is on screen at capture time                   |
| `getRawOutput()` / `waitForRawText` / `waitForTextAfter` / `*Awaiting` | Every byte the process wrote — append-only                                                                  | The value may already have been overwritten by a repaint |

**`getOutput()` is not a frame log.** Ink redraws in place, so when a frame fits the viewport each repaint overwrites the previous one and nothing enters scrollback. A value that was rendered and then re-rendered differently is unrecoverable from it. Never assert "an earlier frame contained X" via `getOutput()`.

**`getScreen()` is not viewport-only, so NO surface here is safe for an absence assertion.** It reads absolute buffer lines `0 .. viewportY + rows` — scrollback plus viewport. Its doc comment says "viewport only, no scrollback" and is wrong; the comment is left in place deliberately because every page object depends on the method, so correcting it needs its own audit pass. Until then, [reference/testing/e2e-infrastructure.md § `getScreen()` is not viewport-only](../../reference/testing/e2e-infrastructure.md) is the authority. Consequence: see [§ Negative Assertions](#negative-assertions) below — none of the three surfaces can carry a `not.toContain` about text the session once legitimately drew.

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

---
scope: reference
area: features
keywords:
  [
    model,
    effort,
    EffortLevel,
    ModelName,
    EFFORT_NAMES,
    MODEL_NAMES,
    effortLevelSchema,
    modelNameSchema,
    agent-tuning,
    BaseAgentFields,
    AgentScopeConfig,
    CompileAgentConfig,
    AgentFrontmatter,
    resolveAgents,
    buildCompileAgents,
    buildAgentCompileEntry,
    convertStackToCompileConfig,
    sanitizeCompiledAgentData,
    agent.liquid,
    frontmatter,
    inherit,
    config-types-writer,
    formatLiteralUnion,
    buildAgentConfigForName,
    agentKey,
    toHaveAgentFrontmatter,
    noEffort,
    generate-json-schemas,
  ]
related:
  - reference/features/agent-system.md
  - reference/features/compilation-pipeline.md
  - reference/features/seed-contract.md
  - reference/types/core-types.md
  - reference/types/zod-schemas.md
  - reference/config/config-merger.md
  - reference/store-map.md
last_validated: 2026-08-02
---

<!-- VALIDATED 2026-08-02 · FULL (product 0.147.1) — new file. Every claim below was derived
     this session from src/cli/types/matrix.ts, types/agents.ts, types/config.ts, types/index.ts,
     lib/schemas.ts, lib/resolver.ts, lib/compiler.ts, lib/configuration/config-types-writer.ts,
     lib/configuration/config-writer.ts, lib/configuration/config-merger.ts,
     lib/installation/local-installer.ts, lib/agents/agent-recompiler.ts, lib/seed/seed-schema.ts,
     commands/new/agent.tsx, src/agents/_templates/agent.liquid, scripts/generate-json-schemas.ts,
     and the four unit spec files named under "Test surface" (all 135 run green this session).
     The Liquid truthiness and property-lookup rows were verified by RENDERING the template
     fragment against liquidjs, not by reading the engine's docs. -->

# Model & Effort — the agent-tuning axis

**Last Updated:** 2026-08-02
**Last Validated:** 2026-08-02

`model` and `effort` are the two per-agent tuning settings. They are declared together, validated
together, resolved together and written together through ten modules, from an agent's
`metadata.yaml` to the YAML frontmatter of a compiled `.md`. This document is the resolution chain.

**Why it exists as its own doc.** `model` was previously documented only as one row in the
`metadata.yaml` field table in [`agent-system.md`](./agent-system.md), and `effort` was not
documented anywhere in `reference/` at all. Neither hop of the chain was written down, so
"why is `effort` missing from my compiled agent?" and "where do I add an effort picker?" both
required re-deriving all ten hops from source.

> **Scope.** This file owns the two unions, the declaration sites, the precedence rule, the
> emission rule and the traps. It does **not** own the seed/wire boundary — see
> [`seed-contract.md`](./seed-contract.md), which documents `seedModelSchema` / `seedEffortSchema`
> and their relationship to these unions. It does not restate the exported-schema count, which
> [`types/zod-schemas.md`](../types/zod-schemas.md) owns, nor the `AgentName` union size, which
> `type-system.md` owns.

## Why the axis is on the sub-agent and not the skill

The most frequently re-proposed change to this subsystem is a **per-skill** model or effort picker.
It was considered and rejected for a reason that is invisible from inside any one file, so it is
recorded here.

**The platform supports both levels.** Claude Code reads `model` and `effort` from sub-agent
frontmatter _and_ from skill frontmatter. The obstacle was never capability — it is **which file the
setting has to be written into.**

| Level         | File the setting lands in               | Who owns that file                                                                                                                                |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per skill     | that skill's own `SKILL.md` frontmatter | **Depends on install mode.** In `eject` the CLI generates it; in `plugin` it belongs to the marketplace and any edit is undone by the next update |
| Per sub-agent | the compiled agent `.md`'s frontmatter  | **Always the CLI.** Every agent file is generated, whatever install mode its skills used                                                          |

A per-skill picker would therefore have worked for ejected skills and **silently done nothing** for
plugin ones — and the UI offering it would have had to hide the control, disable it, or let it lie.
Putting the setting on the sub-agent removes the asymmetry outright, because the agent file is
generated unconditionally.

**This changed nothing about eject vs plugin.** They still decide where a skill's files live and how
it is installed. What went away is only the question of whether a _tuning_ setting can reach a file
the CLI does not own.

**And not on assignments either.** An assignment is per `(agent, skill)`; model and effort are per
**agent**. Storing them on assignments would duplicate one value across every skill an agent carries
and let two rows contradict each other about the same agent. This is why the wire contract carries a
top-level `agents` map beside `skills` rather than widening the assignment record — see
[`seed-contract.md`](./seed-contract.md).

### How Claude Code itself resolves a sub-agent's model

**Provenance: read from Claude Code's own documentation on 2026-08-01. It is not verifiable from
this repository and no test here pins it.** It is recorded because it is the reason `"inherit"` is a
meaningful union member rather than a synonym for a default.

- A sub-agent's model resolves in this order: `CLAUDE_CODE_SUBAGENT_MODEL`, then the per-invocation
  `model` parameter, then the sub-agent's own frontmatter, then **the main conversation's model**.
  So `inherit` on a sub-agent means the main conversation — never a calling agent.
- A skill that sets nothing keeps **the active** model, which inside a sub-agent is that sub-agent's.
  The two Claude Code documents word this differently ("the active model" versus "the main
  conversation's model") and the skill-inside-sub-agent link is never stated outright, so treat this
  bullet as read rather than quoted.
- **There is no per-sub-agent extended-thinking setting.** Sub-agents inherit the main
  conversation's.

### `ultra` is not an effort level

Checked against Claude Code's documentation: the levels are exactly `low` `medium` `high` `xhigh`
`max`, which is `EFFORT_NAMES`. `ultra` is not one of them. "ultracode" exists but is a Claude Code
**session** setting that sends `xhigh` and additionally orchestrates dynamic workflows — it is not a
model effort level and no config can name it. It was briefly carried in the wire contract and
removed on 2026-08-01 under a version bump on both sides. Do not re-add it.

## The two unions

Both live in `src/cli/types/matrix.ts` and are **const-array-derived** — the array is the source of
truth and the type is projected off it with `(typeof X)[number]`. Nothing declares the union
members a second time in TypeScript.

| Const          | Members                                           | Type          |
| -------------- | ------------------------------------------------- | ------------- |
| `MODEL_NAMES`  | `sonnet`, `opus`, `haiku`, **`fable`**, `inherit` | `ModelName`   |
| `EFFORT_NAMES` | `low`, `medium`, `high`, `xhigh`, `max`           | `EffortLevel` |

The arrays are `as const`, which is what makes them usable both as a Zod `z.enum(...)` argument and
as a runtime list to render into generated source. The derivation is the reason a member is added
in exactly one place — and the reason adding one has the six downstream effects listed under
[Adding a union member](#adding-a-union-member).

**Array order is observable output, not presentation.** `MODEL_NAMES` is
`["sonnet", "opus", "haiku", "fable", "inherit"]`, and that exact sequence is what
`src/schemas/agent.schema.json` publishes as its `model` enum and what `formatLiteralUnion` emits as
the `AgentScopeConfig["model"]` union in every generated `config-types.ts`. `"fable"` was placed
before `"inherit"` deliberately, to keep the real models contiguous and leave the `inherit` sentinel
last. Re-ordering the array is a visible change to two generated artefacts, not a tidy-up.

> **`MODEL_NAMES` has FIVE members. `fable` is one of them.** Three live reference docs still list
> four (`sonnet | opus | haiku | inherit`) — see [Known drift in other
> docs](#known-drift-in-other-docs). `fable` is not hypothetical: an E2E spec installs it and
> asserts it lands in compiled frontmatter.

**The types barrel is `export type *` only.** `src/cli/types/index.ts` re-exports six modules and
every line is `export type * from "./…"`, so the barrel carries **no values at all**.
`MODEL_NAMES` and `EFFORT_NAMES` cannot be imported from `../types` — both real consumers
(`lib/schemas.ts` and `lib/configuration/config-types-writer.ts`) import from `../types/matrix`
directly. Reaching for the barrel gives a confusing "has no exported member" error on a name that
plainly exists.

## Where the fields are declared

Five distinct types carry the pair. They are not interchangeable; each answers a different question.

| Type                 | File                              | Question it answers                         | Doc comment in source                                                                            |
| -------------------- | --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `BaseAgentFields`    | `src/cli/types/agents.ts`         | What does the agent's own metadata declare? | on `effort`: _"Emitted into compiled frontmatter only when set — there is no default"_           |
| `AgentScopeConfig`   | `src/cli/types/config.ts`         | What did the user choose, per project?      | _"Overrides the model from the agent's own metadata. Absent means 'keep the metadata default'."_ |
| `CompileAgentConfig` | `src/cli/types/config.ts`         | What is handed to the compile pipeline?     | _"Config-level effort override, preferred over the agent definition's own value."_               |
| `AgentFrontmatter`   | `src/cli/types/agents.ts`         | What shape is the compiled YAML block?      | on `model`: _"Use \"inherit\" to use parent model"_ — `effort` carries none                      |
| `SeedAgent`          | `src/cli/lib/seed/seed-schema.ts` | What can travel over a share link?          | see [`seed-contract.md`](./seed-contract.md)                                                     |

`BaseAgentFields` is the shared base for **three** agent types — `AgentDefinition`, `AgentConfig`
and `AgentYamlConfig` all extend it, so `model` and `effort` reach all three from one declaration.
Its own header comment explains the extraction: it exists to avoid duplicating these fields across
the three.

**Both fields are optional everywhere.** There is no type in the codebase on which `model` or
`effort` is required, including the frontmatter type. Absence is a meaningful, load-bearing state at
every hop, and the two fields resolve that absence differently — see the next section.

### The asymmetry, stated once

This is the single fact that explains most surprises on this axis:

> **`model` has a render-time default (`"inherit"`). `effort` has none, and an absent `effort`
> produces no frontmatter key at all.**

`model` is therefore always present in a compiled agent, even when nothing anywhere set it.
`effort` is present only when something set it. A test that asserts "the compiled agent has no
effort" is asserting a real, reachable outcome, not an error case — which is why the E2E matcher has
a dedicated `noEffort` expectation rather than comparing against `undefined`.

## The resolution chain

```
agent metadata.yaml ──► agentYamlConfigSchema ──► AgentDefinition (BaseAgentFields)
                                                            │
project config.ts ──► projectConfigLoaderSchema ──► AgentScopeConfig
                                                            │
                                          buildCompileAgents ──► CompileAgentConfig
                                                            │
                                                  resolveAgents  ◄── precedence decided HERE
                                                            │
                                                       AgentConfig
                                                            │
                                          sanitizeCompiledAgentData
                                                            │
                                                      agent.liquid
                                                            │
                                              compiled .md frontmatter
```

### Precedence — the invariant

In `resolveAgents` (`src/cli/lib/resolver.ts`):

```ts
model: agentConfig?.model ?? definition.model,
effort: agentConfig?.effort ?? definition.effort,
```

**Config wins over metadata, silently, for both fields, using `??` (not `||`).** The source records
the reasoning directly above those two lines: the project config carries the user's deliberate
choice while the agent's own metadata carries the default, and _"warning on every compile for a
setting someone made on purpose is noise."_ Do not add a divergence warning here — the silence is
the decision, not an oversight.

`??` rather than `||` matters in principle (an empty-string override would survive), though in
practice Zod narrows both fields to their unions before they reach this line, so no falsy-but-valid
value exists.

**`resolveAgents` returns an explicit field list, not a spread.** The `AgentConfig` it constructs
names ten fields: `name`, `title`, `description`, `model`, `effort`, `tools`, `skills`, `path`,
`sourceRoot`, `agentBaseDir`. `permissionMode`, `disallowedTools`, `hooks` and `outputFormat` are
declared on `BaseAgentFields` but are **not** carried through. Of the tunable metadata fields, only
`model` and `effort` survive resolution — which is exactly why they are the only two that a project
config can override, and why widening the axis to a third field is not a one-line change.

### Getting a config-level override into `CompileAgentConfig`

There are two functions that build `CompileConfig.agents`, and **only one of them carries the
tuning**:

| Builder                                             | File                                  | Carries model/effort?                       |
| --------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| `buildCompileAgents()` → `buildAgentCompileEntry()` | `lib/installation/local-installer.ts` | **Yes** — spread in when defined            |
| `convertStackToCompileConfig()`                     | `lib/resolver.ts`                     | **No** — maps every agent to a literal `{}` |

`buildAgentCompileEntry` builds the `tuning` object **before** the skill-less early-out, and the
source says why: _"Model/effort are the agent's own settings, not its skills' — a bare agent with no
stack entry still carries them."_ An agent with no `config.stack` entry returns `tuning` and stops;
an agent with one returns `{ ...tuning, skills }`. Reordering those two statements would silently
drop the override for every bare agent.

`convertStackToCompileConfig` discards it. Its body is
`stack.agents.map((a) => [a.name, {}])` — the `AgentScopeConfig` is reduced to its name. Its sole
production caller is `lib/stacks/stack-plugin-compiler.ts`, so **agents compiled through the
stack-plugin path always fall back to their metadata `model` and emit no `effort`**, regardless of
what the config says. This is a real behavioural fork, not a stale code path.

`lib/agents/agent-recompiler.ts` routes through `buildCompileAgents`, so overrides survive a
recompile. Agents present in `agentNames` but absent from the built config get `{}` — the same
metadata-default outcome, reached deliberately rather than by omission.

Both fields are spread conditionally (`...(x !== undefined && { x })`) at every construction site —
`buildAgentCompileEntry`, `buildAgentConfigForName`, `agentScopeConfig`, and the
`buildAgentConfigs` test factory. **An absent key is never materialised as an explicit
`undefined`**, which is what keeps `toStrictEqual` assertions and `JSON.stringify` serialization
honest.

## Emission into the compiled artefact

`src/agents/_templates/agent.liquid` — the frontmatter block, in emitted order:

| Line     | Template                                                     | Behaviour                               |
| -------- | ------------------------------------------------------------ | --------------------------------------- |
| `model`  | `model: {{ agent.model \| default: "inherit" }}`             | **Unconditional.** Always emitted       |
| `effort` | `{% if agent.effort %}effort: {{ agent.effort }}{% endif %}` | **Conditional.** Absent ⇒ no key at all |

Emitted key order is `name`, `description`, `tools`, `[disallowedTools]`, `model`, `[effort]`,
`permissionMode`, `[skills]`.

**Verified by rendering, this session** (`liquidjs`, `strictVariables: false`, matching
`createLiquidEngine`):

| Input                              | Output                                        |
| ---------------------------------- | --------------------------------------------- |
| `{ model: "opus", effort: "max" }` | `model: opus` **+** `effort: max`             |
| `{}` (neither set)                 | `model: inherit`, **no `effort` line**        |
| `{ model: "haiku", effort: "" }`   | `model: haiku` **+** `effort: ` (empty value) |

Two consequences worth holding onto:

- **`{% if %}` is Liquid truthiness, not `!== undefined`.** Liquid treats the empty string as
  **truthy** (unlike JavaScript), so an `effort` of `""` emits a broken `effort: ` line rather than
  being skipped. Nothing can produce that today — Zod narrows `effort` to `EFFORT_NAMES` at every
  parse boundary — but the guard is weaker than the type suggests, so a change that loosens the
  schema loses the skip.
- **`model` and `effort` are single-token property names**, so the template reads them straight off
  `AgentConfig`. Their neighbours in the same block (`agent.disallowed_tools`,
  `agent.permission_mode`) are spelled snake_case while the TypeScript fields are camelCase; with
  `strictVariables: false` those lookups resolve to `undefined` silently. This axis is unaffected by
  that, and a fix there must not "normalise" `model` / `effort` along with it.

### Sanitisation boundary

`sanitizeCompiledAgentData` in `src/cli/lib/compiler.ts` runs on every `CompiledAgentData` before
`engine.renderFile("agent", …)`, at both render call sites. Both fields go through the same helper:

```ts
model: sanitizeString(data.agent.model, "agent.model"),
effort: sanitizeString(data.agent.effort, "agent.effort"),
```

`sanitizeString` returns `undefined` unchanged and otherwise strips `{{`, `}}`, `{%`, `%}` via
`sanitizeLiquidSyntax`, warning when it fires. It is generically typed `<T extends string>` and
returns `T`, so **stripping is a boundary cast**: a value that lost characters would still be typed
`EffortLevel` while no longer being a member of `EFFORT_NAMES`. It cannot fire on these two fields
today because Zod validates them against the enum upstream; the uniform treatment exists because
`sanitizeCompiledAgentData` treats all agent metadata as untrusted rather than reasoning per field.

## Validation boundaries

### Zod

Both bridge schemas are in `src/cli/lib/schemas.ts` and are plain `z.enum` bridges over the const
arrays, cast to the branded union type:

```ts
export const modelNameSchema = z.enum(MODEL_NAMES) as z.ZodType<ModelName>;
export const effortLevelSchema = z.enum(EFFORT_NAMES) as z.ZodType<EffortLevel>;
```

`effortLevelSchema` has **four** consumers, all `.optional()`:

| Consumer                           | Validates                                       |
| ---------------------------------- | ----------------------------------------------- |
| `agentYamlConfigSchema`            | an agent's own `metadata.yaml`                  |
| `projectConfigLoaderSchema`        | the inline `agents[]` element in `config.ts`    |
| `agentYamlGenerationSchema`        | strict metadata.yaml output (`.strict()`)       |
| `agentFrontmatterValidationSchema` | strict compiled-agent frontmatter (`.strict()`) |

`modelNameSchema` covers the same four plus `commands/new/agent.tsx`'s local
`metaAgentFrontmatterSchema`.

> `types/zod-schemas.md`'s Bridge Schemas table lists four bridge schemas and omits
> `effortLevelSchema`, while declaring its inventory exhaustive. See [Known drift in other
> docs](#known-drift-in-other-docs).

### Generated JSON Schemas

`src/schemas/agent.schema.json` and `src/schemas/agent-frontmatter.schema.json` both carry a
five-member `model` enum and a five-member `effort` enum. **They are generated, not hand-written** —
`scripts/generate-json-schemas.ts` emits them from `agentYamlGenerationSchema` and
`agentFrontmatterValidationSchema` respectively, so they inherit the const arrays transitively.

`npm run generate:schemas:check` runs the generator and then `git diff --exit-code src/schemas/`. A
union edit that does not regenerate fails that gate.

### Generated `config-types.ts`

`src/cli/lib/configuration/config-types-writer.ts` renders **both arrays into every project's
generated `config-types.ts`**, inside the `PROJECT_CONFIG_TYPES_BEFORE` template literal:

```ts
export type AgentScopeConfig = {
  name: AgentName;
  scope: "project" | "global";
  model?: ${formatLiteralUnion(MODEL_NAMES)};
  effort?: ${formatLiteralUnion(EFFORT_NAMES)};
  excluded?: boolean;
};
```

`formatLiteralUnion` is deliberately **not** the module's `formatUnion`: that one breaks onto several
lines past a threshold, which would be invalid inside an emitted property. These lists are fixed and
short, so they stay on one line.

The consequence is the widest blast radius on this axis: **the union members are emitted content**.
Adding a member changes the generated output of every registered project, and those files only
change when something rewrites them. Until a project regenerates, its `config-types.ts` still
rejects the new member — the user sees a type error in their own hand-edited `config.ts` on a value
the CLI already accepts at runtime.

## Persistence

| Hop                   | Module                                                   | Behaviour                                                                               |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Wizard roster rebuild | `stores/wizard-store.ts` (`buildAgentConfigForName`)     | Both preserved from the saved config, spread in when defined                            |
| Config merge          | `lib/configuration/config-merger.ts`                     | Not part of the identity key; a changed value lands in place                            |
| Serialization         | `lib/configuration/config-writer.ts` (`renderEntryLine`) | `JSON.stringify(entry)` — the whole entry, verbatim                                     |
| Load from disk        | `lib/configuration/project-config.ts`                    | Preserved; `projectConfigLoaderSchema` declares both, so the loader does not strip them |
| Share link in / out   | `lib/seed/`                                              | See [`seed-contract.md`](./seed-contract.md)                                            |

**Wizard rebuild.** `preselectAgentsFromDomains` re-derives every rostered agent's config from
scratch. `buildAgentConfigForName` carries `model` and `effort` across that rebuild, on the same
terms as `scope`, and the source says why: _"Model and effort are the user's deliberate choice, not
something the roster re-derives."_

**Merge identity.** `agentKey` is `` `${name}:${scope}${excluded ? ":excluded" : ""}` `` — **model
and effort are not in it.** Two entries differing only in `model` collapse to one key, and on a key
match `mergeConfigs` returns the NEW entry wholesale. Two consequences: a model/effort edit lands in
place without duplicating the row (asserted directly, with the reason in the assertion message), and
because the replacement is whole-entry rather than field-level, a new entry that omits `model` for
an existing `(name, scope)` **drops** the previously-saved value. That is correct — the new entry is
the authoritative statement of the user's choice — but it is not a field merge, and writing a
partial entry loses the tuning.

## Where the axis is deliberately NOT wired

Each of these is verified absence, not an unchecked assumption. They are the fastest way to answer
"where do I hook in?".

| Surface                 | State                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Wizard UI               | **None.** No component or hook under `src/cli/components/` or `src/cli/hooks/` reads or writes either field             |
| CLI flags               | **None.** No command declares a `model` or `effort` flag or arg; `effort` does not appear in `src/cli/commands/` at all |
| Bundled agent `effort`  | **Zero.** Not one bundled `metadata.yaml` declares `effort`                                                             |
| Bundled agent `model`   | **Every one** declares it — 20 `opus`, 3 `sonnet`                                                                       |
| `new agent` meta bridge | Carries `model`, **drops `effort`**                                                                                     |

Two of these are worth spelling out.

**`effort` has no producer in the built-in vocabulary.** Since no bundled `metadata.yaml` sets it and
no wizard control or flag sets it, the only ways a compiled agent gets an `effort` line today are a
hand-edited project `config.ts` and a shared configuration installed with `init --from`. The
`?? definition.effort` half of the precedence rule is currently unreachable from bundled agents — it
is there for source repos that do declare it.

**`new agent` is the one place `model` travels without `effort`.** `commands/new/agent.tsx` parses
the compiled `agent-summoner.md` with a local `metaAgentFrontmatterSchema` that declares
`description`, `tools` and `model` only; `NewAgentInput` has no `effort` field; and the
`--agents <json>` payload spawned at the `claude` CLI carries `model` and `tools` and nothing else.
An `effort` on the summoner's frontmatter is silently dropped at that boundary.

## Test surface

All four unit files below ran green this session (135 tests).

| File                                                    | What it pins                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `lib/resolver.test.ts` — `describe("model and effort")` | Config beats metadata for both; an effort-only config leaves `model` at the metadata value |
| `lib/configuration/config-merger.test.ts`               | A changed model+effort lands on the existing `(name, scope)` row and does not duplicate it |
| `lib/configuration/project-config.test.ts`              | The loader round-trips both off disk without stripping them                                |
| `stores/wizard-store.test.ts`                           | Both survive `preselectAgentsFromDomains`'s roster rebuild                                 |
| `lib/seed/seed-to-wizard.test.ts`                       | Both are carried onto the named agent; an assignment-only agent stays bare                 |

The resolver suite's setup is the load-bearing part: `RESOLVE_AGENTS_DEFINITIONS` pins **both**
agents at `model: opus`, so a config value that survives resolution can only have come from the
config. A fixture whose metadata already matched the expected value would make the test pass on a
resolver that ignored the config entirely.

**E2E.** `e2e/commands/init-from-scenarios-tuning.e2e.test.ts` covers every model the wire contract
allows and every one of the five effort levels, plus model-only, effort-only, no-entry defaults and
re-tuning on a second install. `e2e/commands/init-from-shared-config.e2e.test.ts` asserts
model/effort reach both the compiled agent and the written config.

**Assert on parsed frontmatter, never on raw text.** `e2e/matchers/agent-matchers.ts`
(`toHaveAgentFrontmatter`) extracts the `---` block, parses it as YAML, and compares fields. Its
`noEffort` option exists specifically because absence is a distinct outcome, and its own doc comment
records the trap: **the word `effort` occurs in agent prose too**, so a `toContain("effort")` on the
compiled file is not an assertion about frontmatter. `E2E_BUILTIN_AGENT` in
`e2e/fixtures/expected-values.ts` supplies each bundled agent's real `defaultModel` so a
"no override, metadata default survives" spec has an authoritative expected value; `api-tester` is
used for those because its default is `sonnet`, not `opus` — an assertion of `opus` there would pass
against a hardcoded fallback.

## Traps

1. **`effort` missing from a compiled agent is usually correct.** No default exists. Check whether
   anything set it before treating it as a bug.
2. **The stack-plugin path drops both overrides.** `convertStackToCompileConfig` maps every agent to
   `{}`. If a config-level override is not landing, check which builder produced the `CompileConfig`
   before touching the resolver.
3. **`grep -r effort` is noisy.** `src/agents/**` prose, `claudePluginUninstallBestEffort`, and
   dozens of "best-effort" comments all match. Separately,
   `lib/permission-checker.test.tsx` has an `effortLevel: "high"` key — that is **Claude Code's own
   `settings.json` vocabulary**, deliberately not judged by the CLI, and has nothing to do with
   `EffortLevel`.
4. **Do not import `EFFORT_NAMES` / `MODEL_NAMES` from `../types`.** The barrel is `export type *`
   and carries no values. Import from `../types/matrix`.
5. **Do not add a "config overrides metadata" warning to the resolver.** The silence is a recorded
   decision.
6. **The merge is whole-entry, not field-level.** Writing an `AgentScopeConfig` for an existing
   `(name, scope)` without `model` drops the saved `model`.
7. **`{% if agent.effort %}` is not an `undefined` check.** Liquid empty-string truthiness differs
   from JavaScript's.
8. **`model` and `effort` are the only tunable metadata fields that survive `resolveAgents`.**
   `permissionMode`, `disallowedTools`, `hooks` and `outputFormat` are dropped from the
   `AgentConfig` it builds, so "add an override for X the way model does it" is a larger change than
   it looks.

## Adding a union member

Adding one value to `MODEL_NAMES` or `EFFORT_NAMES` is a one-line source edit with six consequences.
Walk all six.

1. **`src/cli/types/matrix.ts`** — the array. Both the type and every Zod bridge follow from it with
   no further edit.
2. **`npm run generate:schemas`** — `src/schemas/agent.schema.json` and
   `agent-frontmatter.schema.json` regenerate. `generate:schemas:check` fails until they do.
3. **Generated `config-types.ts`** — `formatLiteralUnion` emits the new member into every project's
   `AgentScopeConfig`. Existing projects keep the old union until something rewrites the pair.
4. **The seed wire contract does NOT widen.** `seedModelSchema` and `seedEffortSchema` in
   `lib/seed/seed-schema.ts` are **hand-written literal enums, not derived from these arrays** —
   `seedModelSchema` is a strict subset of `MODEL_NAMES` (no `"inherit"`) and `seedEffortSchema`
   happens to equal `EFFORT_NAMES` member for member today by maintenance, not by construction. The
   schema is vendored from the web monorepo and strips what it does not declare, so a new member
   also needs the web copy updated under a `SEED_VERSION` bump. See
   [`seed-contract.md`](./seed-contract.md).
5. **E2E fixtures** — the tuning spec enumerates every allowed value explicitly; a new one is not
   covered until it is added there.
6. **This doc and the four listed below** — the union members are restated in prose in several
   places, which is how the `fable` drift happened.

## Known drift in other docs

Found while writing this file, verified against source, and **not fixed here** — each belongs to its
owning document.

| Doc                        | Claim                                                                                                           | Source says                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `types/core-types.md`      | `MODEL_NAMES = ["sonnet", "opus", "haiku", "inherit"]`                                                          | five members; `"fable"` is missing                                                          |
| `types/core-types.md`      | _"Only `SkillSlug`, `ModelName`, and `PermissionMode` have `z.enum(...)` bridge schemas"_                       | `effortLevelSchema` is a fourth `z.enum` bridge                                             |
| `types/core-types.md`      | `AgentScopeConfig` is `{ name, scope, excluded? }` (twice — its own section and the `ProjectConfig` field list) | also `model?` and `effort?`                                                                 |
| `types/core-types.md`      | no `EffortLevel` section                                                                                        | `EffortLevel` is a const-array-derived union alongside `ModelName`                          |
| `types/zod-schemas.md`     | Bridge Schemas table has 4 rows; inventory declared exhaustive; total **35**                                    | `effortLevelSchema` is absent from the table; **36** `export const *Schema` in `schemas.ts` |
| `features/agent-system.md` | `ModelName` is `"sonnet" \| "opus" \| "haiku" \| "inherit"` (twice)                                             | five members                                                                                |
| `boundary-map.md`          | `modelNameSchema` validates `"sonnet" \| "opus" \| "haiku" \| "inherit"`                                        | five members                                                                                |
| `store-map.md`             | `agentConfigs` is `AgentScopeConfig[]`, _"Per-agent `{ name, scope, excluded? }`"_                              | also `model?` and `effort?`                                                                 |

The `35` → `36` correction is the one to handle carefully: `types/zod-schemas.md` **owns** that count
per the count-ownership registry, and its per-table breakdown sums to the total, so the Bridge row
moves 4 → 5 and the total 35 → 36 together. Do not restate either number outside that file.

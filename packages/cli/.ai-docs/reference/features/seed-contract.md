---
scope: reference
area: features
keywords:
  [
    seed,
    seed-contract,
    workspace-matrix-seed,
    noExternal,
    seedPayloadSchema,
    seedSkillSchema,
    seedAgentSchema,
    seedModelSchema,
    seedEffortSchema,
    seedLoadStateSchema,
    SEED_VERSION,
    SeedPayload,
    SeedSkill,
    SeedAgent,
    fetch-seed,
    fetchSeedConfig,
    FetchSeedResult,
    SEED_API_URL,
    SEED_USER_AGENT,
    AGENTS_INC_API_URL,
    seed-to-wizard,
    seedToWizardResult,
    SeedMapping,
    agentScopeConfig,
    DEFAULT_SELECTION_OPTIONS,
    assignedStack,
    readAgentMap,
    skippedSkillIds,
    skippedAgentNames,
    init-from,
    selectionFromSharedConfig,
    share-link,
    single-home-schema,
    discard-dont-migrate,
  ]
related:
  - reference/commands/index.md
  - reference/build-and-packaging.md
  - reference/features/wizard-flow.md
  - reference/features/plugin-system.md
  - reference/features/operations-layer.md
  - reference/concepts/scope-system.md
  - reference/config/config-writer.md
  - reference/types/core-types.md
  - reference/types/zod-schemas.md
  - reference/dependency-graph.md
last_validated: 2026-08-02
---

# Seed Contract (`init --from`)

> **What this document owns.** The wire contract for configurations shared from agentsinc.sh, its
> version policy, the payload -> `WizardResultV2` mapping, and the `init --from <id>` consumer path.
> It is the only doc that describes `src/cli/lib/seed/`.
>
> **What it deliberately does not own.** The schema module itself lives in another workspace —
> `packages/matrix/src/seed.ts`, imported as `@workspace/matrix/seed` — and this doc describes the
> contract it declares, not that package's other exports. `reference/types/zod-schemas.md` scopes
> itself to `src/cli/lib/schemas.ts` by its own first line, so its schema count covers neither this
> contract nor that package; do not fold this contract into it. The union sizes (`AgentName` and
> friends) are owned by `reference/type-system.md`; the install pipeline this path feeds is
> `reference/features/operations-layer.md` and `reference/config/config-writer.md`; how the package
> reaches `dist/` is `reference/build-and-packaging.md`.

## Module Map

**Directory:** `src/cli/lib/seed/` — two source files, no barrel. Consumers import the leaf modules
directly. **The schema is not one of them:** it is imported from `@workspace/matrix/seed`, and this
package holds no copy of it.

| Module                                                   | Exports                                                                                                                                                                                                                                           | Role                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@workspace/matrix/seed` (`packages/matrix/src/seed.ts`) | `SEED_VERSION`, `seedPayloadSchema`, `seedSkillSchema`, `seedAgentSchema`, `seedModelSchema`, `seedEffortSchema`, `seedLoadStateSchema`, + 6 inferred types (`SeedModel`, `SeedEffort`, `SeedLoadState`, `SeedSkill`, `SeedAgent`, `SeedPayload`) | The wire contract, in the single package every side of it reads   |
| `src/cli/lib/seed/fetch-seed.ts`                         | `SEED_API_URL`, `SEED_USER_AGENT`, `fetchSeedConfig`, `FetchSeedResult`                                                                                                                                                                           | Network boundary: fetch, decode, and turn every failure into text |
| `src/cli/lib/seed/seed-to-wizard.ts`                     | `seedToWizardResult`, `SeedMapping`                                                                                                                                                                                                               | Maps a decoded payload onto the shape the install pipeline eats   |

**`commands/init.tsx` is the sole consumer.** Verified by grep over `src/` and `e2e/`: the only
importers of `lib/seed/` outside that directory are `init.tsx`'s two entry points.
`dependency-graph.md` note 14b records the same edge.

```mermaid
graph TD
  Worker["api.agentsinc.sh<br/>GET /configs/:id"] --> Fetch
  Init["commands/init.tsx<br/>selectionFromSharedConfig"] --> Fetch["fetch-seed.ts<br/>fetchSeedConfig"]
  Fetch --> Schema["@workspace/matrix/seed<br/>seedPayloadSchema"]
  Worker -.->|"same module, same repo"| Schema
  Init --> Map["seed-to-wizard.ts<br/>seedToWizardResult"]
  Map --> Schema
  Map --> Matrix["lib/matrix/matrix-provider<br/>getCategoryDomain"]
  Map --> Order["lib/wizard/domain-order<br/>orderDomains"]
  Map --> Agents["types/agents<br/>AGENT_NAMES"]
  Map --> Scope["lib/configuration/config-generator<br/>isScopePairCompatible"]
  Init --> Detect["lib/installation<br/>detectProjectInstallation<br/>detectGlobalInstallation"]
  Init --> Spine["handleInstallation<br/>(shared with the wizard)"]
```

## One Schema, One Home

**`packages/matrix/src/seed.ts` is the only copy of this contract in the repository.** Every side of
the wire imports that one module:

| Importer                                            | Imports                                                 | Why it is on this list                                                   |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/cli/lib/seed/fetch-seed.ts`                    | `seedPayloadSchema`, `SeedPayload`                      | Decodes the fetched body                                                 |
| `src/cli/lib/seed/seed-to-wizard.ts`                | `SeedAgent`, `SeedLoadState`, `SeedPayload` (type-only) | Maps the decoded payload                                                 |
| `src/cli/lib/seed/seed-schema.test.ts`              | `seedPayloadSchema`                                     | The CLI's contract test — see Test Surface                               |
| `src/cli/lib/__tests__/factories/seed-factories.ts` | `SEED_VERSION`, `SeedPayload`, `SeedSkill`              | Builds payloads from the same constant the schema pins                   |
| `apps/server/src/index.ts`                          | `seedPayloadSchema`                                     | The worker validates on the way **in**, before content-addressing the id |

`packages/matrix` is chosen over the CLI because its consumers — `apps/editor` and `apps/server` —
run in a browser and a Worker, and cannot depend on a package that drags oclif, Ink and `node:fs`.
The dependency direction only goes one way: the CLI reaches into the matrix package, never the
reverse.

> **Trap: `packages/matrix/src/seed.ts`'s own header comment still describes the CLI as vendoring
> it** and names a future shared package as the eventual home. It is that home. Read the imports,
> not the comment.

### How the schema reaches a published CLI

`@workspace/matrix` is **private, unpublished and ships TypeScript**, so nothing it exports can be
resolved at runtime from an installed tarball. Two settings make that safe, and they are a pair:

| Setting                                                   | Where                       | Effect                                                       |
| --------------------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| `"@workspace/matrix": "workspace:*"` in `devDependencies` | `packages/cli/package.json` | Never installed alongside the published package              |
| `noExternal: ["@workspace/matrix"]`                       | `tsup.config.ts`            | Bundles its source into `dist/` instead of leaving an import |

Verified against a built tree: `dist/chunk-*.js` carries the schema's Zod calls inline, its
sourcemap names `../../matrix/src/seed.ts` among its sources, and **no emitted `.js` contains the
specifier `@workspace/matrix`**.

**Promoting it to `dependencies` silently externalises it** — tsup bundles devDependencies by default
and leaves `dependencies` alone — and `init --from` then fails at import time in the published CLI
while every local gate stays green. `tsup.config.ts` carries the same warning inline. Packaging
detail: [`reference/build-and-packaging.md`](../build-and-packaging.md).

### The version rule, and what enforces it

> **Every shape change bumps `SEED_VERSION`.**
>
> With one copy there is no second file to strip a field the first declares, but the two ends of the
> wire still run different builds: a published CLI carries the schema **inlined at build time**, so
> a field added to the package reaches an installed CLI only when a new version is published. In the
> meantime `z.object` strips what that build does not declare. A field surviving a round trip is
> therefore still not evidence the two ends agree — only the version literal is.
>
> That is why v3 exists at all: `seedAgentSchema.scope` is additive-optional and would not normally
> need a version, but the version is what tells a sharing app the field survives the trip.

**What enforces it, and what does not.** `seed-schema.test.ts` hardcodes `v: 3` in its payload and
asserts `v: 2` is refused, so **changing `SEED_VERSION` without editing that spec fails the suite** —
the bump cannot happen silently. A shape change _without_ a bump still passes; nothing detects that,
and it is listed under Known Limitations.

`packages/matrix/src/seed.ts` imports only `zod`. Keep it that way: the browser and Worker builds
that read it can carry no CLI runtime.

## Version Policy: Discard, Do Not Migrate

| Rule                                                                                                | Where it lives                         |
| --------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `v` is `z.literal(SEED_VERSION)` — **exactly one** accepted version, never a range                  | `packages/matrix/src/seed.ts`          |
| A stale id fails to decode **loudly**; there is no migration path, and none is wanted pre-1.0       | `packages/matrix/src/seed.ts` header   |
| A rejected version surfaces as the same message as a malformed body                                 | `src/cli/lib/seed/fetch-seed.ts`       |
| The policy is pinned by a spec that refuses `v: 2` and asserts `["v"]` is the **only** failing path | `src/cli/lib/seed/seed-schema.test.ts` |

**Why one version is safe here, and why it would not be elsewhere.** The worker content-addresses an
id (SHA-256 of the re-serialized validated body, base64url, truncated) and serves it
`cache-control: immutable`. A stored payload therefore can never change shape under its id — so
"re-share it" is always a complete remedy, and there is no half-migrated state a guess would have to
resolve.

**Version history, from the schema's own comments:**

| Version | Change                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| v1      | Model and effort lived on the **skill**; agents could only be inferred from assignments, so a skill-less agent was unshareable |
| v2      | Moved model and effort off the skill and onto the **sub-agent**; added `on` so a bare agent can travel                         |
| v3      | Gave the sub-agent its own `scope`. Before it, `--from` wrote `project` for every agent                                        |

## The Wire Contract

### `seedPayloadSchema` — the envelope

| Field           | Type                        | Sparseness / semantics                                                                                                                                                                                                                |
| --------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v`             | `z.literal(3)`              | Required. The whole of the version gate                                                                                                                                                                                               |
| `matrixVersion` | `string`                    | Required on the wire, **diagnostics only**. Grep confirms **no CLI code reads it** — not the mapper, not the command, not a test assertion. It exists so a skip can one day be explained; a mismatch must never fail or gate a decode |
| `stackId`       | `string \| null`            | Metadata, not data. The web app always sends the full per-agent expansion alongside it — see [Stack ids](#stack-ids-are-the-one-fatal-unknown)                                                                                        |
| `skills`        | `Record<string, SeedSkill>` | **Sparse — presence is selection.** Keys are full catalog slugs, never positional indices. The web store's `remembered` (deselected) set never leaves the browser                                                                     |
| `agents`        | `Record<string, SeedAgent>` | **Sparse — an agent with nothing to say has no entry.** Presence is a statement, not an install                                                                                                                                       |

### `seedSkillSchema` — one skill row

| Field         | Type                                    | Notes                                                                            |
| ------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `install`     | `"plugin" \| "eject"`                   | Required. Maps to `SkillConfig.source` — see the mapping table                   |
| `scope`       | `"project" \| "global"`                 | Required. The **skill's** scope; independent of any agent's scope                |
| `assignments` | `Record<string, "lazy" \| "preloaded">` | Sub-agent id -> load state. **Presence is assignment.** Per `(skill, sub-agent)` |

### `seedAgentSchema` — one sub-agent row

**Every field is optional, and each says something different on its own.** This is the only place a
configuration can speak about an agent that no skill mentions.

| Field    | Type                                              | Absent means                                                                                                                                           |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `on`     | `boolean`                                         | "whatever the assignments imply". `true` is the **only** way a skill-less agent travels; `false` removes the agent _and_ the assignment rows naming it |
| `model`  | `"opus" \| "fable" \| "sonnet" \| "haiku"`        | "keep whatever the agent's own metadata says"                                                                                                          |
| `effort` | `"low" \| "medium" \| "high" \| "xhigh" \| "max"` | Same                                                                                                                                                   |
| `scope`  | `"project" \| "global"`                           | The shared selection default — `DEFAULT_SELECTION_OPTIONS.scope` in `@workspace/matrix`, currently `global` — so a resting choice never has to travel  |

**An entry naming only a model does NOT switch the agent on.** `readAgentMap` files such an entry
under `known`, and the bare-agent loop admits only `entry.on === true`. Pinned by
`seed-to-wizard.test.ts` ("carries model and effort onto the named agent and leaves an
assignment-only agent bare").

### Enum alignment with the CLI's own unions

| Seed enum             | CLI counterpart                                   | Relationship                                                                                                                                                |
| --------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seedModelSchema`     | `ModelName` (`MODEL_NAMES`, `types/matrix.ts`)    | **Strict subset.** `MODEL_NAMES` also carries `"inherit"`; the wire has no such member because absence of the key already means "keep the metadata default" |
| `seedEffortSchema`    | `EffortLevel` (`EFFORT_NAMES`, `types/matrix.ts`) | **Exactly equal**, member for member                                                                                                                        |
| `seedLoadStateSchema` | `SkillAssignment.preloaded` (`types/skills.ts`)   | `"preloaded"` -> `true`, `"lazy"` -> `false`. The wire spells as an enum what the stack spells as a boolean                                                 |

Because the model enum is a strict subset, `SeedAgent.model` assigns to `AgentScopeConfig.model`
without a cast. **Adding a member to `MODEL_NAMES` does not widen the wire** — the enums in
`packages/matrix/src/seed.ts` are hand-written literals, not derived from the CLI's arrays, so they
have to be widened there too, under a version bump.

## `fetch-seed.ts` — the network boundary

```
GET ${SEED_API_URL}/configs/${encodeURIComponent(id)}
headers: { accept: "application/json", "user-agent": "agents-inc-cli" }
```

| Export            | Value / signature                                              | Notes                                                                     |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `SEED_API_URL`    | `process.env.AGENTS_INC_API_URL ?? "https://api.agentsinc.sh"` | **Read once at module load.** See the gotcha below                        |
| `SEED_USER_AGENT` | `"agents-inc-cli"`                                             | The conversion signal — see below                                         |
| `fetchSeedConfig` | `(id: string) => Promise<FetchSeedResult>`                     | `FetchSeedResult = { ok: true; payload } \| { ok: false; error: string }` |

> **`AGENTS_INC_API_URL` is captured at module-load time, not per call.** It is a module-level
> `const`, so mutating `process.env` after the module has been imported has no effect. This is why
> the E2E harness passes the variable into a **spawned process** (`CLI.run` -> `execa("node", [BIN_RUN, ...], { env: { AGENTS_INC_API_URL: store.url } })`,
> `e2e/fixtures/seed-config-store.ts` + `e2e/fixtures/cli.ts`) and why the in-process command test
> stubs global `fetch` instead (`init-from-plugin-install.test.ts`). A unit test that sets the env
> var and then calls `fetchSeedConfig` would silently hit production.

### The user-agent is the conversion signal

`GET /configs/:id` is the **only** point at which either side can observe a config being _installed_
rather than merely built, and the worker cannot separate that from someone opening a share link in a
browser unless the CLI says so. The header is the whole of that discriminator.

Two facts worth keeping straight, both verified against source:

- The CLI **always** sends it; `e2e/commands/init-from-shared-config.e2e.test.ts` pins the exact
  string and the exact path (`/configs/UAcheck1`) against the stub store, which records
  `{ url, userAgent }` per request.
- The worker's `getConfigRoute` handler (`apps/server/src/index.ts`, the sibling workspace) **does
  not read it**. The header is available to Cloudflare's request logging; nothing in
  the handler computes a metric from it. Do not describe the signal as "measured" — describe it as
  "emitted, and available".

### Failure is a message, never a throw

**Invariant: `fetchSeedConfig` never throws and never rejects.** Every failure is
`{ ok: false, error }` carrying user-facing prose. The reason is positional — this runs _before
anything has been written_, so there is nothing to roll back and the caller's only job is to explain.

| Condition                 | Detected by                    | `error` text                                                                                              |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Network unreachable / DNS | `try` around `fetch`           | `Could not reach ${SEED_API_URL} — check your connection.`                                                |
| Unknown id                | `response.status === 404`      | `No configuration found for id '${id}'.`                                                                  |
| Any other non-2xx         | `!response.ok`                 | `Fetching configuration failed (HTTP ${status}).`                                                         |
| Body is not JSON          | `try` around `response.json()` | `The configuration store returned something that is not JSON.`                                            |
| Fails `seedPayloadSchema` | `safeParse`                    | `Configuration '${id}' does not match the expected format — it may have been created by a newer version.` |

**The schema-failure message is deliberately specific about the cause.** The payload was validated by
the worker on the way _in_ (`createConfigRoute` parses with the same schema before hashing), so a
stored payload that no longer parses means the contract moved underneath it — worth saying plainly
rather than reporting a generic failure. **A wrong `v` lands in this same row**: a v1 or v2 id and a
structurally broken body produce the identical sentence, and the version-refusal E2E asserts exactly
that.

## `seed-to-wizard.ts` — the mapping

```typescript
seedToWizardResult(payload: SeedPayload, matrix: MergedSkillsMatrix): SeedMapping
// SeedMapping = { result: WizardResultV2; skippedSkillIds: string[]; skippedAgentNames: string[] }
```

The output is a `WizardResultV2` — the **same** type the wizard produces — so `init --from` reuses
`writeProjectConfig` -> skill install -> `compileAgentsAllScopes` unchanged rather than growing a
second install path that can drift.

### Payload field -> `WizardResultV2` field

| `WizardResultV2` field | Derived from                                                                   | Rule                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills`               | `payload.skills` (surviving entries)                                           | `{ id, scope: entry.scope, source }`. `source` = `"eject"` when `install === "eject"`, else the skill's **primary** `availableSources` entry, else `DEFAULT_PUBLIC_SOURCE_NAME` (`sourceForSkill`, mirroring the wizard's own resolution)                              |
| `selectedAgents`       | assignment names on surviving skills **∪** map entries with `on === true`      | De-duplicated via a `Set`; order is insertion order (assignment order first, then bare agents). **Order is not part of the contract** — the specs that care sort                                                                                                       |
| `agentConfigs`         | `selectedAgents.map(name => agentScopeConfig(name, agentMap.known.get(name)))` | One row per selected agent. `scope` defaults to `DEFAULT_SELECTION_OPTIONS.scope`; `model` / `effort` are spread in **only when defined**, so an absent key never becomes an explicit `undefined`                                                                      |
| `assignedStack`        | `entry.assignments` per surviving skill                                        | `Partial<Record<AgentName, StackAgentConfig>>`, category-keyed, appended in payload order. `"preloaded"` -> `{ preloaded: true }`. See [assignedStack](#why-assignedstack-exists)                                                                                      |
| `selectedStackId`      | `payload.stackId`                                                              | Passed through verbatim, including `null`                                                                                                                                                                                                                              |
| `domainSelections`     | surviving skills, grouped `domain -> category -> SkillId[]`                    | Domain resolved by `getCategoryDomain(skill.category)`; duplicates suppressed by an `includes` check                                                                                                                                                                   |
| `selectedDomains`      | `orderDomains(Object.keys(domainSelections))`                                  | Canonical display order (custom domains alphabetically, then `@workspace/matrix`'s `DOMAIN_ORDER`) — the same helper the wizard uses                                                                                                                                   |
| `unresolvableSkillIds` | — always `[]`                                                                  | **Deliberate.** That field carries the ids of entries in a _saved config_ the wizard could not represent, so `edit` can name them as it removes them. Nothing here came from a saved config — the skipped ids came off the wire and are reported to the user directly. |
| `cancelled`            | — always `false`                                                               | There is no interactive step to cancel                                                                                                                                                                                                                                 |
| `validation`           | — always `{ valid: true, errors: [], warnings: [] }`                           | **Deliberate.** The sharing app already validated the selection, and this path has no interactive step in which a warning could be acted on                                                                                                                            |
| `matrixVersion`        | — **not mapped**                                                               | Decoded and discarded. No reader anywhere in `src/`                                                                                                                                                                                                                    |

### Skip, do not fail — and the one thing that does fail

**Invariant: an id the catalog does not know is skipped and reported; it never fails the decode.**
Payloads carry catalog slugs precisely so they survive catalog churn — a config shared before a skill
was renamed should still install everything else, and failing the whole decode would make every
rename retroactively break every shared id.

| Input                                                                  | Outcome                                                                                                                                                                                                                                            | Recorded in                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Skill id absent from `matrix.skills`                                   | Skipped whole, with its assignment rows                                                                                                                                                                                                            | `skippedSkillIds`                                |
| Skill whose category has no domain (incl. the `local` pseudo-category) | Skipped — `getCategoryDomain` reads `matrix.categories[category]?.domain`, and `local` is never registered there: `source-loader.ts` explicitly excludes it when synthesizing categories for local skills, and it is not a `Category` union member | `skippedSkillIds`                                |
| Agent name in `payload.agents` not in `AGENT_NAMES`                    | Dropped                                                                                                                                                                                                                                            | `skippedAgentNames`                              |
| Agent name in an `assignments` key not in `AGENT_NAMES`                | Assignment row dropped                                                                                                                                                                                                                             | `skippedAgentNames`                              |
| Agent with `on: false`                                                 | Dropped, **and every assignment row naming it is ignored too**                                                                                                                                                                                     | Neither — it is not a skip, it is an instruction |

`skippedAgentNames` is accumulated in a `Set` (seeded from `readAgentMap`'s `unknown` list) and
spread to an array at the end, so a name unknown in both the map and an assignment is reported once.
`skippedSkillIds` is a plain array — a skill id can only appear once, since `payload.skills` is keyed
by it.

> **The two "unknown" checks read different registries, and this asymmetry is intentional but easy to
> misread.** Unknown **skills** are decided against the **runtime** matrix (`matrix.skills`, the
> merged matrix for the loaded source), so the same payload can skip different ids against different
> sources. Unknown **agents** are decided against `AGENT_NAMES`, which is re-exported from
> `types/generated/source-types.ts` — a **build-time** generated union (`bun run generate:types`).
> A custom agent that exists only in a runtime source is therefore not "known" to this mapper.

#### An unwritable `(skill, sub-agent)` pair throws

**`seedToWizardResult` throws when a surviving assignment pairs a project-scoped skill with a
sub-agent that rests at global scope** — explicitly global, or global by taking the shared selection
default. The message names **every** such pair as `<skillId> -> <agentName>`, not just the first.

The rule is the config model's own, read from its single definition: `isScopePairCompatible` in
`lib/configuration/config-generator.ts` — _"Project skills never reach global agents; global skills
reach any agent."_ The scope a bare sub-agent rests at comes from `seedAgentScope`, the same helper
`agentScopeConfig` uses, so the pair is judged against the scope that will actually be written.

**Why this one fails when unknown ids skip.** They are opposite failures. An unknown id is content
this catalog does not have — skipping it costs the user nothing they could have had. An unwritable
pair is content the catalog _has_ and cannot place, and because `assignedStack`
[replaces the derived stack wholesale](#why-assignedstack-exists), **no scope filter runs on those
rows anywhere downstream.** `splitConfigByScope` routes a global agent's non-global assignments to
`projectStack`; the project writer's `filteredStack` step then drops them because the agent is not
project-scoped; and the global half never had them because their skill ids are not in
`globalSkillIds`. The user was told nothing, exit 0, `stack` key simply absent.

Rows the decode was going to ignore anyway cannot trip it: the switched-off and unknown-agent guards
run first, so an `on: false` agent's assignment and an assignment naming an agent this CLI does not
know are gone before a pair exists. Pinned by `seed-to-wizard.test.ts`, "does not refuse over
assignment rows it was going to ignore anyway".

#### Stack ids are the other fatal unknown

`selectedStackId` is passed through untouched, and downstream `buildEjectConfig`
(`lib/installation/local-installer.ts`) resolves it with `loadStackById`, which falls back to the
CLI's built-in defaults **only under the default public marketplace** (CLI-455) and returns `null`
otherwise — at which point **`buildEjectConfig` throws** `stackNotOfferedMessage(stackId, source)`,
naming the id the payload asked for and the source it was asked of.

**So an unresolvable `stackId` is fatal, while an unresolvable skill id or agent name is not.**
Unlike the unwritable-pair refusal above, this one is not designed: it lives outside `lib/seed/`, it
throws from a different module for a different reason, and **no spec in the seed family covers it**
(the curation E2E publishes a `stackId` the E2E source does have). Treat it as a known gap.

What a resolvable stack id actually does is narrow: it supplies `description` to the written config
and overlays the stack YAML's `preloaded` flags as `existingStack` — and its own expansion is then
**discarded** by `resolveStackProperty`, because overlaying it would add back the skills and agents
the payload's assignments deliberately left out. The curation E2E asserts the written `config.stack`
in full for exactly this reason, and its inline comment warns against simplifying the spec down to
the frontmatter half — the frontmatter assertions pass even when every sub-agent holds every skill.

### `agentScopeConfig` — the shared selection default

```typescript
function agentScopeConfig(name: AgentName, entry: SeedAgent | undefined): AgentScopeConfig {
  return {
    name,
    scope: entry?.scope ?? DEFAULT_SELECTION_OPTIONS.scope,
    ...(entry?.model !== undefined && { model: entry.model }),
    ...(entry?.effort !== undefined && { effort: entry.effort }),
  };
}
```

**The default is not this module's to name.** `DEFAULT_SELECTION_OPTIONS`
(`packages/matrix/src/read-model/selection-defaults.ts`, `{ install: "plugin", scope: "global" }`) is
the one spelling of what an untouched pick does, and the editor's fresh skill entry and resting agent
scope read the same object. A decode that spelled a word of its own could disagree with the app that
built the payload, which is exactly what it used to do.

Three properties, all pinned by `seed-to-wizard.test.ts` ("scopes each sub-agent by its own entry"):

1. **Where a sub-agent's front-matter is written is the payload's to say, per agent, independently of
   any skill's scope.** A globally-scoped agent moves the agent, never the skills around it — the
   agent-scope E2E asserts the global config holds the agent and `skills: []`.
2. **"Has an entry" is not what decides the scope — naming one is.** An entry carrying only
   `{ model: "haiku" }` still resolves to the shared default, not to whatever the model implies.
3. **An absent optional key is omitted, not set to `undefined`.** The conditional spread is what makes
   `toStrictEqual` against a factory-built `AgentScopeConfig` meaningful; a `{ model: undefined }` row
   would compare unequal and, worse, would write an explicit override into the config.

> **A payload that wants a sub-agent in the project has to say so.** With the default global, an
> `agents` map entry is the only thing that can keep a sub-agent's compiled `.md` — and the stack
> rows that ride with it — inside the project. The scenario E2Es pin `scope: "project"` on the wire
> for exactly this reason, and `init-from-agent-scope.e2e.test.ts` is where the explicit and the
> defaulted case are held apart.

### Why assignedStack exists

`WizardResultV2.assignedStack` is **optional and the wizard never sets it.** It exists for this
producer alone.

The `assignments` map is per `(skill, sub-agent)` and carries a load state, so it decides three
things the wizard cannot express separately:

- which sub-agents are selected,
- which skills land in each one's stack entry,
- which of those preload.

Without it, the install pipeline's ownership rules would broadcast **every scope-compatible skill to
every selected agent** — handing a bare sub-agent someone else's skills and destroying exactly the
curation a shared configuration exists to carry. Ownership rules also take `preloaded` from a prior
or stack-YAML entry, else the shared preload mapping's default — either way silent about what the
sharer chose.

**Consumption point:** `resolveStackProperty(generated, assigned)` in
`lib/installation/local-installer.ts` — `generated && assigned ? assigned : generated`. The assigned
stack **replaces** the ownership-derived one rather than merging with it. The `generated &&` half is
load-bearing: with no agents selected there is nothing to own, and the **absent** key is what tells
the merger to leave the stack already on disk alone.

`buildEjectConfig` is reached for every install mode (`buildAndMergeConfig` calls it unconditionally,
despite the name), so plugin, eject and mixed payloads all route through `resolveStackProperty`.

## The `init --from` Consumer Path

**Flag:** `--from <id>` on `init` (`src/cli/commands/init.tsx`), described as
_"Install a configuration shared from agentsinc.sh by its id, without the wizard"_, `helpValue: "<id>"`.
`--source` still applies — `init` is the one command that carries it, and both of its producers
take the same `SourceFlags` (declared in `init.tsx` beside the flag).

### One spine, two producers

`Init.run` chooses a producer and then runs a single shared install sequence. The two producers
differ only in _where the selection comes from_.

| Step                     | `selectionFromWizard`                                           | `selectionFromSharedConfig`                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard diversion      | Applies                                                         | **Bypassed** — `if (!flags.from && ...)`. An id is an explicit instruction, not a request to be shown around; an existing installation gets the greenfield refusal below instead of a dashboard |
| Existing installation    | Diverted to the dashboard                                       | **Refused** — see [Greenfield only](#greenfield-only)                                                                                                                                           |
| Order of operations      | source load ∥ global config load, then wizard                   | **project refusal first**, then fetch, then `loadSourceOrFail`, then decode, then the global refusal                                                                                            |
| Return type              | `Promise<Selection \| null>` (`null` -> `EXIT_CODES.CANCELLED`) | `Promise<Selection>` — there is nothing to cancel; a fetch failure exits `EXIT_CODES.ERROR` at the point of failure                                                                             |
| `Selection.interactive`  | `true`                                                          | `false`                                                                                                                                                                                         |
| `Selection.emptyMessage` | `"No skills selected"`                                          | `` `Configuration '${id}' contains no skills this catalog can install.` ``                                                                                                                      |

**The fetch precedes the source load on purpose.** An unknown id must fail before anything is loaded
or written; the E2E asserts `.claude-src` does not exist after a 404.

`Selection` carries `interactive` and `emptyMessage` as **values rather than a downstream flag
branch** — that is what stops the two paths growing separate copies of the install sequence.

### Greenfield only

**`init --from` installs into a clean setup or it does not install.** A shared configuration is
installed WHOLE — its `assignments` map replaces the ownership-derived stack rather than merging
with it — so there is no coherent answer to what should happen when it meets a setup that is already
there. The command refuses and names `uninstall`, which is the whole of the way through.

Two refusals, both `EXIT_CODES.ERROR`, both worded by `utils/messages.ts`:

| Refusal                     | Condition                                                                                                                                 | Where                                               | Message builder               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------- |
| This project is installed   | `detectProjectInstallation(projectDir)` returns an installation                                                                           | `refuseInstalledProject`, **before the fetch**      | `sharedConfigExistingInstall` |
| A global install is blocked | The decoded selection has a global-scoped skill **or** sub-agent (`writesGlobalContent`) **and** `detectGlobalInstallation()` returns one | `refuseBlockingGlobalInstall`, **after the decode** | `sharedConfigGlobalInstall`   |

**The project check is deliberately `detectProjectInstallation`, not `detectInstallation`.** The
latter falls back to global, which would refuse every clean project on a machine that has a global
install — including for a payload that never goes near it. Whether a global install is in the way is
a question about the PAYLOAD, and that is the second refusal's job. Getting this wrong makes the
second refusal unreachable, which is the tell that the two rules have collapsed into one.

**The project check runs before the fetch**, so a directory that is already spoken for costs no
network round-trip; its output carries no `Fetching configuration` line at all. The global check
cannot run that early — it needs the decoded payload to know whether anything global is in it.

**Nothing is written by either refusal**, and nothing is written by the decode's own
[unwritable-pair throw](#an-unwritable-skill-sub-agent-pair-throws) either: all three fire before
`handleInstallation`, so no skill is copied, no plugin is registered and no `config.ts` is emitted.
`init-from-greenfield.e2e.test.ts` asserts the blocked install is byte-identical afterwards, on both
the config and the filesystem.

**What replaces the old merge behaviour.** Re-tuning or re-sharing over an install is now
`uninstall` then `init --from`. `mergeGlobalConfigs`' additive, never-overwrite behaviour is
unchanged and still correct for the edit and propagation paths that keep using it — it is simply no
longer reachable from this one.

### What the shared spine does with `interactive: false`

The post-install permission notice is an Ink app with no exit of its own, so `waitUntilExit()` only
ever resolves because a person is there to end it. `handleInstallation` therefore renders one frame
and calls `unmount()` immediately when `interactive` is false. **`init --from` must complete over a
pipe and in CI; awaiting that notice would hang it.**

### Reporting

| Condition                      | Output                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Project already installed      | `this.error(sharedConfigExistingInstall(configPath), { exit: EXIT_CODES.ERROR })` — before the fetch, so no `Fetching` line precedes it |
| Always, first (past that)      | `Fetching configuration ${id}...` (`this.log`)                                                                                          |
| Unwritable `(skill, agent)`    | `this.handleError` on the decode's throw -> `EXIT_CODES.ERROR`, naming every pair                                                       |
| Global install in the way      | `this.error(sharedConfigGlobalInstall(configPath), { exit: EXIT_CODES.ERROR })`                                                         |
| `skippedSkillIds.length > 0`   | `this.warn`: `Skipped N skill(s) this catalog does not know: <ids joined>`                                                              |
| `skippedAgentNames.length > 0` | `this.warn`: `Skipped N unknown sub-agent(s): <names joined>`                                                                           |
| `result.skills.length > 0`     | `Installing N skill(s) across M sub-agent(s)`                                                                                           |
| Fetch failed                   | `this.error(fetched.error, { exit: EXIT_CODES.ERROR })`                                                                                 |
| Nothing installable            | `this.error(selection.emptyMessage, { exit: EXIT_CODES.ERROR })`                                                                        |

**The refusals precede the reporting on purpose.** A run that is about to be refused must not first
warn about skipped ids or announce `Installing N skill(s)` — an install line followed by an error is
a message about work that never started.

**Skips are named, not counted.** "3 skills were skipped" cannot be acted on; the ids can, and this
is the one moment the user can tell whether what they shared is what they are getting. The E2E
asserts the _name_ appears in output, and `e2e/fixtures/seed-config-store.ts` exports
`flattenCliOutput` because oclif wraps warning text at terminal width with a `›` continuation
prefix — asserting on a short fragment instead would pass on a truncated message.

**The empty guard is `skills.length === 0 && selectedAgents.length === 0`.** A sub-agent is
installable on its own — it has front-matter, a prompt and a compiled file without owning a single
skill — so only a selection with neither is nothing to install.

## Test Surface

### Unit / command tests

Verified by running them: `vitest run src/cli/lib/seed/ src/cli/lib/__tests__/commands/init-from-plugin-install.test.ts`
-> **18 passed**, 3 files. **This document owns these numbers.**

| Spec file                                                         | Specs | Covers                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/seed/seed-schema.test.ts`                            | 4     | The wire contract as the CLI imports it, pinned against **literals** rather than the factories                                                                                                            |
| `src/cli/lib/seed/seed-to-wizard.test.ts`                         | 11    | The four ways an agent reaches (or fails to reach) the result — named by the map, named only by an assignment, switched off, not real — plus the unwritable-pair refusal and the rows it must not trip on |
| `src/cli/lib/__tests__/commands/init-from-plugin-install.test.ts` | 3     | The shared install spine: ref + scope per plugin skill, and install-before-config-write ordering                                                                                                          |

> **Every payload in `seed-to-wizard.test.ts` whose sub-agents rest at the shared selection default
> carries its skills at `scope: "global"`.** That is not incidental: a project-scoped skill on a
> resting sub-agent is now the refusal's own subject, so a spec about model, effort or roster
> membership that left the skill at the factory default would be testing the refusal instead of
> itself. `init-from-plugin-install.test.ts` takes the other route and pins its sub-agent to the
> project, because the scope its two skills carry _is_ that spec's subject.
>
> **That spec also stubs `HOME`**, because the greenfield check reads `os.homedir()`. Without it,
> the global-scoped skill in its payload would consult the developer's own `~/.claude-src` and the
> spec would pass or fail by what happens to be installed on the machine running it.

> **`seed-schema.test.ts` is the CLI's stake in a contract it does not own the source of.** It
> imports `seedPayloadSchema` from `@workspace/matrix/seed` and asserts on that object directly, so
> it fails here if the package changes the shape `init --from` decodes. There is no second copy to
> compare against and no comparison test; this spec is the whole of the CLI-side guard.
>
> **It pins literals on purpose.** A version test that builds its payload from
> `SEED_VERSION` follows the constant wherever it goes and **can never fail** — the canonical shape of
> findings Pattern V (the artefact that looks like verification and cannot fail). The same reasoning
> is why `init-from-shared-config.e2e.test.ts` hardcodes `v: 3` in its own `seedPayload` helper while
> the _scenario_ specs, which are not testing the contract, use `buildSeedPayload`.
>
> Its `toStrictEqual` on the whole agent entry (rather than a key-existence check) is the second half
> of the same idea: `z.object` strips undeclared keys, so a schema that merely _tolerated_ `scope`
> would pass an existence check while dropping the value.

**Factories:** `src/cli/lib/__tests__/factories/seed-factories.ts` — `buildSeedPayload(overrides?)`
and `buildSeedSkill(overrides?)`. Both default to the sparse/empty shape (`skills: {}`, `agents: {}`,
`assignments: {}`, `stackId: null`) because sparse is the contract's resting state.
`buildSeedSkill` defaults `install: "eject"` — a test source is local and has no marketplace, so
plugin mode legitimately refuses it, and that is a different error path.

**Seam choice in `init-from-plugin-install.test.ts`, worth preserving:** the only mock below the spine
is `claudePluginInstall` in `utils/exec.js`. `installPluginSkills` and `pluginInstallFailureError` are
deliberately **not** overridden — they are the spine. `fetch` is stubbed via `vi.stubGlobal` rather
than mocking `fetch-seed`, which keeps the schema decode and the seed -> wizard mapping real.

### E2E family

**Fixture:** `e2e/fixtures/seed-config-store.ts` — `startSeedConfigStore()` runs a **real** loopback
HTTP server on an ephemeral port that mirrors the worker (`GET /configs/<id>`, 404 for an unpublished
id) and records `{ url, userAgent }` per request. A string payload is served **verbatim** so a spec
can pin a body the schema must refuse. It is a real server rather than a module mock because these
specs exist to cover the whole path; a mocked fetch would skip the two seams most likely to break —
the flag reaching the command, and the payload surviving the wire. `runInitFrom(store, id, project, sourceDir)`
is the runner; it injects `AGENTS_INC_API_URL` into the spawned process's environment.

| Spec file (`e2e/commands/`)                | Specs | Covers                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init-from-shared-config.e2e.test.ts`      | 11    | **Wire contract and command plumbing.** Install without the wizard; the user-agent + exact request path; skip-by-name; 404 with nothing written; malformed body; v1 refusal; model/effort onto compiled agent _and_ config; a bare switched-on agent; nothing-installable error; refusal rather than dashboard over an existing install |
| `init-from-scenarios-install.e2e.test.ts`  | 5     | Per-skill scope routing, skipped skills **and** agents together, `on: false` dropping its assignment rows, mixed plugin+eject from one payload, a global plugin skill at `user` scope when run in `$HOME`                                                                                                                               |
| `init-from-scenarios-curation.e2e.test.ts` | 5     | Per-sub-agent curation: stack payload as its own expansion, per-agent assignment + load state, a switched-on agent holding nothing, a skills-free payload, exclusive vs non-exclusive category emission                                                                                                                                 |
| `init-from-scenarios-tuning.e2e.test.ts`   | 5     | Every model the contract allows, every effort, an unnamed field left alone, no-entry defaults, and the refusal a second id gets over an installed first                                                                                                                                                                                 |
| `init-from-agent-scope.e2e.test.ts`        | 1     | A globally-scoped sub-agent compiles into `$HOME` and a project-scoped one into the project; **exhaustive** directory listings, not `contains`                                                                                                                                                                                          |
| `init-from-greenfield.e2e.test.ts`         | 3     | The greenfield rule: a global install blocking a global payload from a clean project, a project-only payload installing past that same global install, and the unwritable-pair refusal naming both halves                                                                                                                               |

**30 executable specs across the 6 files. This document owns that number and the per-file column.**
Counting by `it(` is safe _here_ specifically because grep confirms **no `it.each` or `describe.each`
anywhere in the family** — the trap that made the config-gate guard-test count wrong does not apply.
The `e2e/commands/` directory **file** count is owned by `reference/testing/e2e-infrastructure.md`;
do not restate it here.

**The division of labour between these files is deliberate and stated in the shared-config spec's own
header:** wire contract and command plumbing live in `init-from-shared-config`; what a _decoded_
payload turns into on disk lives in the `init-from-scenarios-*` specs; and what the command refuses
to install at all lives in `init-from-greenfield`. A new contract-level assertion belongs in the
first.

**The `e2e/commands/` refusal specs are split across three files on purpose, not by accident.** The
shared-config and tuning files each pin the refusal that replaced a behaviour they used to assert —
the dashboard override and the second-id re-tune — and both keep the setup that made the old
assertion meaningful, so a regression that reinstates merging fails where it used to pass.
`init-from-greenfield` is where the rule itself is held, including the case neither of the others can
reach: a project that is clean while HOME is not.

## Plugin install under `init --from`

`toHavePluginInRegistry` requires the install path to exist and hold `skills/<id>/SKILL.md`; the
scenario E2Es assert content, `enabledPlugins` and output; and
`src/cli/lib/__tests__/commands/init-from-plugin-install.test.ts` drift-locks that every plugin skill
reaches `claudePluginInstall` at its mapped scope and that the config write never precedes a
successful install.

The two invariants that test pins are worth stating on their own, because neither is observable
from outside:

- **Scope mapping.** A payload `scope: "global"` reaches the Claude CLI as `"user"`; `"project"`
  stays `"project"`. The ref and scope decide which registry key a later `uninstall` owns, so a skill
  installed at the wrong scope uninstalls from the wrong place.
- **Install gates the config write.** A failed plugin install hard-errors _before_ `writeProjectConfig`
  runs, so no `config.ts` is left claiming a skill is installed that is not. Asserted both by call
  ordering (`invocationCallOrder`) and by the absence of the file on disk.

## Known Limitations

| Limitation                                                                           | Consequence                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nothing enforces the `SEED_VERSION` **bump** on a shape change                       | A field added without a new version reaches installed CLIs only on their next upgrade, and no version literal says so                                                          |
| An unresolvable `stackId` throws from `buildEjectConfig`, unlike every other unknown | Untested, and the throw is outside `lib/seed/` — unlike the unwritable-pair refusal, which is designed and specced                                                             |
| `init --from` cannot update, only install                                            | Re-sharing over an installed setup is `uninstall` + `init --from`. There is no partial or additive form, by ruling — the payload's `assignedStack` replaces rather than merges |
| `matrixVersion` has no reader                                                        | The field cannot currently explain a skip, which is the reason it is on the wire                                                                                               |
| `SEED_API_URL` is captured at module load                                            | Any in-process test that sets `AGENTS_INC_API_URL` after import hits production                                                                                                |
| The CLI validates nothing about the id's shape                                       | Any string is URL-encoded and sent; the worker's 8-char content-addressed form is not enforced client-side (`encodeURIComponent` is the injection guard, not a format check)   |

## Related Documentation

- [`reference/commands/index.md`](../commands/index.md) — the `init` command, its flow and its other flags
- [`reference/features/wizard-flow.md`](./wizard-flow.md) — the other producer of `WizardResultV2`
- [`reference/features/plugin-system.md`](./plugin-system.md) — what `installPluginSkills` does with the mapped scope
- [`reference/features/operations-layer.md`](./operations-layer.md) — `writeProjectConfig`, `compileAgentsAllScopes`
- [`reference/config/config-writer.md`](../config/config-writer.md) — where the mapped config is written, and the gate
- [`reference/concepts/scope-system.md`](../concepts/scope-system.md) — project vs global, the CLI-side model
- [`reference/types/core-types.md`](../types/core-types.md) — `SkillConfig`, `AgentScopeConfig`, `SkillAssignment`, `StackAgentConfig`
- [`reference/types/zod-schemas.md`](../types/zod-schemas.md) — the CLI's _other_ Zod schemas; scoped to `lib/schemas.ts` and does **not** cover this contract
- [`reference/build-and-packaging.md`](../build-and-packaging.md) — `noExternal`, and why the schema is inlined rather than installed
- [`reference/boundary-map.md`](../boundary-map.md) — §6.5, the seed fetch as a trust boundary
- [`reference/dependency-graph.md`](../dependency-graph.md) — note 14b, the `init` -> `lib/seed/` edge

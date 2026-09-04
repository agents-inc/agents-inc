---
scope: reference
area: features
keywords:
  [
    compiler,
    templates,
    liquid,
    validation,
    output,
    plugin-ref,
    source,
    prune,
    propagation,
    config-types,
    matrixOnly,
    provenance,
    isolation,
    hooks,
    completion-gate,
    prompt-cache,
  ]
related:
  - reference/features/agent-system.md
  - reference/features/operations-layer.md
  - reference/features/plugin-system.md
  - reference/config/config-writer.md
  - reference/commands/index.md
last_validated: 2026-09-03
---

# Compilation Pipeline

## Overview

**Purpose:** Compile agent prompt files from partials (identity, playbook, output, etc.) + skill assignments using Liquid templates.

**Entry Points:**

| Entry Point                          | File                                                          | When Called                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileAgents()`                    | `src/cli/lib/operations/project/compile-agents.ts`            | Operations-layer wrapper (scope-filtering + delegation to `recompileAgents()`). Called directly by the `compile` command; `init`/`edit` reach it via `compileAgentsAllScopes()`                                                                                                                                       |
| `compileAgentsAllScopes()`           | `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Runs a global pass + project pass (or a single home pass), merges results. Called by `init` and `edit`                                                                                                                                                                                                                |
| `recompilePropagatedProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Loops `recompileRegisteredProjectAgents()` over the project dirs propagation rewrote, isolating per-project failures. **Its one production caller is `recompilePropagated` in `src/cli/lib/config-gate/recompile.ts`** — the gate runs it inside the write; commands only render the resulting `GateReport.recompile` |
| `recompileRegisteredProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Single registered project, `scopeFilter: "project"` only. Discovers that project's skills itself and loads agent partials from the CLI                                                                                                                                                                                |
| `recompileAgents()`                  | `src/cli/lib/agents/agent-recompiler.ts`                      | Core recompile: config load → resolve → per-agent render + scope-routed write. Called by `compileAgents()`                                                                                                                                                                                                            |

## Pipeline Flow

This is the live `compile` / `init` / `edit` path. It recompiles and writes
**agents only** — skill copying happens in the install/eject and plugin-build flows,
not here.

```
1. Installation Detection
   -> detectBothInstallations() (src/cli/lib/operations/project/detect-both-installations.ts)
   -> Returns BothInstallations { global, project, hasBoth } (global/project are
      `Installation | null`, always present — never optional)
   -> `compile` builds separate passes per scope (global, project); when hasBoth,
      each pass carries a scopeFilter so a project pass cannot overwrite global agents

2. Agent Definitions Discovery
   -> loadAgentDefs() (src/cli/lib/operations/project/load-agent-defs.ts) -- takes no arguments
   -> getAgentDefinitions() (src/cli/lib/agents/agent-fetcher.ts), local branch
   -> Returns AgentSourcePaths { agentsDir, sourcePath }, sourcePath = PROJECT_ROOT
   -> loadMergedAgents(sourcePath) merges loadAllAgents(PROJECT_ROOT) with
      loadAllAgents(sourcePath) -- both sides read the same directory here, so the
      merge is real and degenerate. No marketplace sub-agent enters the roster.

3. Skill Discovery (4-way merge)
   -> discoverInstalledSkills() (src/cli/lib/operations/skills/discover-skills.ts)
   -> 4-way merge via mergeSkills() (later sources win):
      a. Global plugins (from ~/.claude/plugins/)
      b. Global local skills (from ~/.claude/skills/, via globalInstallRoot())
      c. Project plugins (from <projectDir>/.claude/plugins/)
      d. Project local skills (from <projectDir>/.claude/skills/, via LOCAL_SKILLS_PATH)
   -> Project wins on conflict (global-project pairs are skipped when projectDir is home)
   -> Returns DiscoveredSkills { allSkills, totalSkillCount, pluginSkillCount,
      localSkillCount, globalPluginSkillCount, globalLocalSkillCount,
      unusableMetadata } -- the last is every installed skill whose metadata.yaml
      exists but describes no skill, from either scope

4. Agent Resolution — recompileAgents() (agent-recompiler.ts)
   -> loadProjectConfig() reads project config (.claude-src/config.ts); a corrupt
      config throws ConfigLoadError rather than reading as absent
   -> filterExcludedEntries() drops excluded skills/agents and excluded stack refs
   -> loadAllAgents() (built-in) + loadProjectAgents() (project overrides) merged
   -> resolveAgentNames() determines which agents to compile — a PRESENT config is
      authoritative over its roster even when empty (`agents: []` compiles
      zero agents; only a config-LESS load falls through to the all-agents branch)
   -> buildCompileAgents() maps config entries into CompileAgentConfig per agent
      (attaches each skill's `source` via the id-keyed sourceById map)
   -> CompileConfig is constructed inline from the agents map + name/description
   -> resolveAgents() (src/cli/lib/resolver.ts) materializes skill references
   -> For each agent: resolveAgentSkillRefs() -> resolveSkillReferences() -> Skill[]

5. Liquid Engine Setup
   -> createLiquidEngine() (src/cli/lib/compiler.ts)
   -> Template root hierarchy (first match wins):
      a. {projectDir}/.claude-src/agents/_templates/
      b. {projectDir}/.claude/templates/ (legacy)
      c. {PROJECT_ROOT}/src/agents/_templates/ (built-in, via DIRS.templates)
   -> Config: extname=".liquid", strictVariables=false, strictFilters=true

6. Per-Agent Compile + Scope-Routed Write
   -> writeCompiledAgentsByScope() (src/cli/lib/agents/write-compiled-agents.ts)
   -> For each resolved agent, calls compileAgentForPlugin() (src/cli/lib/compiler.ts):
      - readAgentFiles(): identity.md, playbook.md, output.md,
        critical-requirements.md, critical-reminders.md (STANDARD_FILES from consts.ts)
      - buildAgentTemplateContext() appends "Skill" to agent.tools via withSkillTool()
        (idempotent, order-stable), and takes a per-skill mapSkill that attaches pluginRef
        via pluginRefFor(skill); splits skills into preloaded vs dynamic. The flag
        it splits on was decided at config-write time by toStackAssignment()
        (packages/compile/src/seed-to-config.ts): the prior save's word for the
        triple (priorLoadState()) wins, and a triple new to the save takes the shared
        preload mapping's default (mappedLoadState() -> resolveLoadState from
        @workspace/matrix) — absent from the mapping means lazy
      - renderAgent(engine, data, await cliVersion()) (packages/compile/src/agent-source.ts)
        is the single render primitive. In order it:
          . sanitizeCompiledAgentData(): strips Liquid syntax from metadata + skill fields +
            preloaded IDs (content fields pass through unchanged)
          . engine.renderFile("agent", ...) with two context keys no caller supplies —
            `generatorVersion` (this CLI's version, itself run through sanitizeLiquidSyntax)
            and `completionGateCommand` (the module-private COMPLETION_GATE_COMMAND)
          . stampProvenanceMarker(): the version-less marker on the first body line
   -> Writes each agent to its scope dir: global agents -> ~/.claude/agents/,
      project agents -> outputDir (per agentScopeMap; default "project")
   -> Per-agent failures are collected as AgentWriteOutcome[] (recompile reports &
      continues; install hard-errors on the first failure)

7. Stale-Agent Pruning — pruneStaleAgentsForPass() in compile-agents.ts
   -> Runs only on an AUTHORITATIVE pass: `outputDir` set AND no `scopeFilter`
   -> pruneCompiledAgents({ agentsDir, keep })
      (src/cli/lib/operations/project/remove-compiled-agents.ts) -> pruneStaleCompiledAgents(
      agentsDir, keep) (src/cli/lib/agents/list-compiled-agents.ts) deletes every `*.md`
      whose basename `isAgentName()` and is NOT in `keep` = compiled ∪ failed for that pass
   -> Hand-authored agents are PRESERVED: a basename outside the AgentName union
      never matches the predicate (the built-in-name check is a guard, not the
      removal criterion)
```

### Compiled Output Is Not Validated

`writeCompiledAgentsByScope()` writes each rendered agent straight to disk with no structural
check — no XML tag-balance pass, no template-artifact scan, no frontmatter validation. Nothing in
the CLI inspects what it writes, and there is no module to call: the validators that once did this
for no caller were reaped, so `grep -rn 'validateCompiledAgent' src` is the check and it returns
nothing.

## Key Files

| File                                                         | Purpose                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/compiler.ts`                                    | The disk half of a compile: Liquid engine, template roots, agent partial reads. Re-exports the renderers from `@workspace/compile/agent-source`, which is where the template context, the sanitizer and `renderAgent` are declared                                                                                |
| `src/cli/lib/compile-seat.ts`                                | Side-effect module handing `@workspace/compile` this CLI's console (`seatDiagnostics({ warn, verbose })`). Imported by `compiler.ts` and `configuration/config-generator.ts` — the two modules owning the seated functions. The package's default sink discards, which is the honest answer for a browser preview |
| `src/cli/lib/agents/agent-recompiler.ts`                     | Orchestrates recompilation flow                                                                                                                                                                                                                                                                                   |
| `src/cli/lib/agents/write-compiled-agents.ts`                | Per-agent render + scope-routed write (live path)                                                                                                                                                                                                                                                                 |
| `src/cli/lib/agents/agent-provenance.ts`                     | `cliVersion` — this CLI's own manifest version, which a browser has no equivalent of. The three marker functions (`provenanceMarker`, `hasProvenanceMarker`, `stampProvenanceMarker`) are declared in `@workspace/compile/agent-source` and re-exported here                                                      |
| `src/cli/lib/agents/list-compiled-agents.ts`                 | `listAgentMdFiles` / `listCompiledAgentNames` / `splitAgentsByProvenance` / `pruneStaleCompiledAgents`                                                                                                                                                                                                            |
| `src/cli/lib/agents/agent-fetcher.ts`                        | Fetches agent definitions (local or remote)                                                                                                                                                                                                                                                                       |
| `src/cli/lib/agents/agent-plugin-compiler.ts`                | Plugin-mode agent compilation (individual agent plugins)                                                                                                                                                                                                                                                          |
| `src/cli/lib/resolver.ts`                                    | Resolves skill references and agent configs                                                                                                                                                                                                                                                                       |
| `src/cli/lib/operations/project/compile-agents.ts`           | Operations layer wrapper for compilation + stale-agent prune                                                                                                                                                                                                                                                      |
| `src/cli/lib/operations/project/recompile-project-agents.ts` | Registered-project recompile + per-project failure isolation                                                                                                                                                                                                                                                      |
| `src/cli/lib/operations/project/load-agent-defs.ts`          | Operations layer for agent definition loading                                                                                                                                                                                                                                                                     |
| `src/cli/lib/operations/skills/discover-skills.ts`           | 4-way skill discovery and merge                                                                                                                                                                                                                                                                                   |

## The Provenance Marker

**Every compiled agent carries an HTML comment on the first line after its frontmatter**, naming the
generator and the fact that the file is rewritten rather than edited. **The line carries no version**
— its bytes are the same in every release:

```markdown
---
name: web-developer
---

<!-- Generated by agents-inc — do not edit; compile rewrites this file -->
```

`MARKER_OPEN` interpolates `DEFAULT_PLUGIN_NAME` (`"agents-inc"`, `packages/compile/src/paths.ts`);
`MARKER_NOTICE` and `MARKER_CLOSE` supply the rest. All three are module-private.

`src/cli/lib/agents/agent-provenance.ts` is the one address a CLI caller reads it at, and it is a
facade over two halves. The three marker functions are declared in
`packages/compile/src/agent-source.ts`, beside `renderAgent`, which stamps the line — so the
editor's output preview draws the same first body line rather than computing it a second way. What
`agent-provenance.ts` itself declares is the half a browser has no equivalent of: `cliVersion()`.

| Export                           | Declared in                       | Contract                                                                                                                                                                                           |
| -------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenanceMarker()`             | `@workspace/compile/agent-source` | Composes the line. **Takes no arguments** — the marker names no version                                                                                                                            |
| `hasProvenanceMarker(content)`   | `@workspace/compile/agent-source` | Whether this CLI compiled the file the content came from. **Position is part of the claim** — only the first body line counts                                                                      |
| `stampProvenanceMarker(content)` | `@workspace/compile/agent-source` | The same content carrying exactly ONE marker, by REPLACEMENT rather than insertion                                                                                                                 |
| `cliVersion()`                   | `lib/agents/agent-provenance.ts`  | This CLI's own published version, read once per process from `package.json` beside the code (`PROJECT_ROOT`) and memoised in a module-level promise. It reaches the template as `generatorVersion` |

**A body comment, deliberately NOT a frontmatter field.** Claude Code documents a fixed set of
supported frontmatter keys and says nothing about how it treats an unknown one, so a stricter release
could reject every agent this CLI has ever written. The body is free-form by contract, which makes a
marker there safe, greppable, and the do-not-edit notice at the same time.

**The marker is version-less because it is the first cacheable byte of a prompt.** A compiled agent
IS a sub-agent's system prompt, so this line and everything under it form the cacheable prefix of
every invocation of that agent. A version in the line moves on every release, which rewrites that
byte in every compiled agent and invalidates the whole prefix beneath it — for a string no production
code reads back. The version travels instead as `generatorVersion` inside the trailing
`<system-reminder>` block, where a change to it costs nothing because everything below it is volatile
anyway.

**De-versioned rather than relocated, and the distinction is load-bearing.** Moving the line further
down solves the same cache problem and breaks recognition: `hasProvenanceMarker` treats POSITION as
part of its claim, and `uninstall`'s orphan sweep is built on that claim. Taking the version out of
the line leaves both the position and the recognition rule untouched.

**Recognition matches on SHAPE, not on exact text.** `isProvenanceMarker` asks only that the line
starts with `MARKER_OPEN` and ends with `MARKER_CLOSE`, so an agent compiled by any release is
recognised by any other — including one still on disk from a release that spelled a version into the
line. Matching the exact string would sweep only the agents the running version happened to write,
which is the opposite of what a sweep is for.

**Position is load-bearing.** `bodyStartIndex` returns the index past the closing frontmatter fence,
or `0` when there is no fence to find — a template override may render no frontmatter and the marker
still needs a defined home. An agent that merely QUOTES the line further down (a prompt about this
very feature, say) is the user's, and a sweep reading that as provenance would delete a file nothing
here wrote.

**Stamping is idempotent by replacement.** `stampProvenanceMarker` rewrites an existing marker line
rather than inserting beside it, so stamping twice is a fixed point. Now that the text is constant,
that replacement is a no-op on anything the current release wrote — what it still does is upgrade an
agent stamped by a release that spelled the version into the line.

**One render path, so there is no unmarked output.** Both compile entry points render through
`renderAgent` in `packages/compile/src/agent-source.ts`, whose last statement is the stamp. A
template that emits the marker itself still produces exactly one. The renderer moved out of
`src/cli/lib/compiler.ts` with the extraction and is not re-exported by it; `compiler.ts` imports
it, and so does the editor's output preview, which is what puts both behind the same stamp.

**Who reads it back.** `splitAgentsByProvenance(agentsDir)`
(`src/cli/lib/agents/list-compiled-agents.ts`) partitions a directory's `*.md` into `marked` and
`unmarked`; a file that cannot be read yields no marker and lands in `unmarked`, because "cannot prove
it is ours" and "is not ours" call for the same answer. Two production consumers, and they are the
same claim read for two purposes:

```
grep -rn 'splitAgentsByProvenance(' src --include='*.ts' --include='*.tsx' --exclude='*.test.ts'
```

| Consumer                                                                | Reads it to                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/commands/uninstall.tsx`                                        | Identify this CLI's own output once the configuration naming the agents is gone — see [`reference/commands/index.md`](../commands/index.md)        |
| `listAgentFilesWithOurProvenance` in `src/cli/lib/content-validator.ts` | List, for `doctor`, the agent files `uninstall` would actually remove — a listing built any other way could offer a file the remover then declines |

## Agent File Structure

Each agent has a directory with these files:

```
src/agents/{category}/{agent-name}/
  identity.md                 # Required: agent identity/role
  playbook.md                 # Required: agent workflow/process
  output.md                   # Optional: examples and output format
  critical-requirements.md    # Optional: top-of-prompt requirements
  critical-reminders.md       # Optional: bottom-of-prompt reminders
  metadata.yaml               # Agent configuration (tools, model, permissions)
```

Output format resolution falls back from agent-specific dir to parent category dir.

Agent directories are organized by category:

```
src/agents/
  _templates/                 # Liquid templates
    agent.liquid              # Main agent template
    methodologies/            # Shared methodology partials
      operating-principles.liquid
  developer/
    web-developer/
    api-developer/
    cli-developer/
    ai-developer/
  reviewer/
  tester/
  planning/
  meta/
  researcher/
```

## Agent Template Structure

**Main template:** `src/agents/_templates/agent.liquid`

**Only partial it renders:** `src/agents/_templates/methodologies/operating-principles.liquid`

### Rendered Body Order

Rows are in rendered order, top of file to bottom.

| Block                     | Source                                              | Emitted when                                  |
| ------------------------- | --------------------------------------------------- | --------------------------------------------- |
| YAML frontmatter          | `metadata.yaml` + compile-time grants (below)       | always                                        |
| Provenance marker         | `stampProvenanceMarker()` after the render          | always                                        |
| `# {{ agent.title }}`     | `metadata.yaml`                                     | always                                        |
| `<role>`                  | `identity.md`                                       | always                                        |
| `<operating_principles>`  | `{% render "methodologies/operating-principles" %}` | always                                        |
| `<critical_requirements>` | `critical-requirements.md`                          | `criticalRequirementsTop != ""`               |
| playbook (no wrapper)     | `playbook.md`                                       | always                                        |
| `<critical_reminders>`    | `critical-reminders.md`                             | `criticalReminders != ""`                     |
| output (no wrapper)       | `output.md`                                         | `output != ""`                                |
| `<system-reminder>`       | the template, plus `generatorVersion` and skills    | always — and it is the LAST block in the file |

The partial's own tag pair is `<operating_principles>`, so the template contributes no wrapper of
its own around it. **The table is the whole of the template's own structure** — it emits no block
the table does not name, and nothing follows `</system-reminder>`. Compiled agents written by releases
still on disk may carry blocks this template does not emit; the template itself is the answer:

```
grep -oE '<[a-z][a-z_-]*>|^# \{\{[^}]*\}\}|\{% render "[^"]*" %\}' src/agents/_templates/agent.liquid \
  | grep -v '^</'
```

That lists every opening tag, heading and render tag the template writes, including the three
mutually exclusive branches nested inside `<system-reminder>`.

**What binds this order:** `SHIPPED_TEMPLATE_SECTIONS` in `src/cli/lib/compiler.test.ts`, asserted
with `toStrictEqual` against `parseCompiledAgentSections(...).sectionOrder`
(`src/cli/lib/__tests__/helpers/compiled-agent-sections.ts`). **What binds the partial roster:**
`RENDERED_METHODOLOGY_PARTIALS` / `UNRENDERED_METHODOLOGY_PARTIALS` in
`src/cli/lib/__tests__/agent-template-renders-its-partials.test.ts`, which holds the `{% render %}`
tags the template writes against the files the directory holds — nothing else can catch a partial
going unrendered, because `tsc` does not open a `.liquid` file, ESLint does not lint one, the engine
runs `strictVariables: false`, and a vanished `{% render %}` leaves no residue in the output.

### The Trailing `<system-reminder>` Block, and Why It Is Last

The block carries `Compiled by {{ generatorVersion }}` and then exactly one of three branches:

| Branch                        | Condition                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `<skill_activation_protocol>` | `dynamicSkills.size > 0` — one `### {{ skill.id }}` entry per dynamic skill, each with a Description / Invoke / Use-when line |
| `<skills_note>` (preloaded)   | no dynamic skills but `preloadedSkillIds.size > 0`                                                                            |
| `<skills_note>` (none)        | neither                                                                                                                       |

**The ordering is a prompt-cache decision before it is an editorial one.** A compiled agent IS a
sub-agent's system prompt, so the file's leading bytes are the cacheable prefix of every invocation
of that agent. Everything volatile therefore sits below everything static: the skill list is the one
block that moves without the agent's role moving — it is rewritten whenever a user edits their stack
— and the generator version moves on every release. While either sat mid-body, an ordinary stack
edit or a patch bump invalidated the playbook and the output format beneath it.

The same reasoning de-versioned the provenance marker rather than moving it; see
[The Provenance Marker](#the-provenance-marker) for why relocation was not available.

`<skill_activation_protocol>` renders NESTED inside `<system-reminder>`, so a reader scanning
top-level blocks will not find it beside `<role>`.

### Frontmatter Keys

Emitted in this order, with `withSkillTool` and the completion gate applied at compile time rather
than declared in any `metadata.yaml`:

| Key               | Emitted when                                        | Note                                                                                                                                                                     |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`            | always                                              |                                                                                                                                                                          |
| `description`     | always                                              |                                                                                                                                                                          |
| `tools`           | always                                              | An ALLOWLIST that always carries `Skill`: `withSkillTool` appends it to whatever `metadata.yaml` declared — see [agent-system.md](./agent-system.md#metadatayaml-schema) |
| `disallowedTools` | `agent.disallowedTools.size > 0`                    |                                                                                                                                                                          |
| `model`           | always                                              | Unconditional, with a `default: "inherit"` filter — see [model-and-effort.md](./model-and-effort.md)                                                                     |
| `effort`          | `agent.effort` is set                               | Wrapped in `{% if %}`; no key at all when unset                                                                                                                          |
| `permissionMode`  | always                                              | `default: "default"` filter                                                                                                                                              |
| `isolation`       | `agent.isolation` is set                            | Type `AgentIsolation`, declared in `src/cli/types/matrix.ts` and re-exported by `agents.ts` — a union of the single literal `"worktree"`                                 |
| `experimental`    | `agent.experimental` is set                         | Rendered through the `json` filter as a map, matching Claude Code's own frontmatter shape; `cacheTtl` (`CacheTtl` = `"5m"` \| `"1h"`) is its only member today           |
| `hooks`           | the agent declares them, OR it holds `Write`/`Edit` | See the completion gate below. The emitted entry is keyed `Stop`                                                                                                         |
| `skills`          | `preloadedSkillIds.size > 0`                        | The preload list, each entry `pluginRef ?? id`                                                                                                                           |

**`isolation` is a union of one rather than a bare string**, so the day a second mode is documented
the compiler names every site that has to decide about it. The absent case is not a member: an agent
with no `isolation` shares the session's working tree. No bundled agent declares it — `grep -n '^isolation:' src/agents/*/*/metadata.yaml` returns nothing.
The key is supported for a consuming project that wants it.

**The completion gate is emitted, not authored — and composed in the data path, not branched on in
the template.** The template holds one unconditional emission,
`{% if agent.hooks %}hooks: {{ agent.hooks | json }}{% endif %}`. Everything else is
`withCompletionGate` in `packages/compile/src/agent-source.ts`, module-private and applied to
`data.agent` by `prepareForRender`, which composes and then sanitises in one nested expression:

- An agent whose `tools` contain neither `Write` nor `Edit` is returned unchanged, so it emits
  exactly what it declared and no `hooks:` key at all when it declared nothing.
- An agent that already states a completion gate of its own — a `Stop` **or** a `SubagentStop`
  entry; see the spelling note below for why both count — is also returned unchanged, because a
  project's gate is its own to state.
- Otherwise the gate's own record — a `Stop` entry with one command action carrying
  `COMPLETION_GATE_COMMAND` — is spread over the agent's declared record, so the merge is **per
  event**: everything the agent declared is kept and the gate is added beside it. A `PostToolUse`
  formatter no longer costs the agent its gate. The gate is spread LAST deliberately: the only key
  it can overwrite is a `Stop` the previous bullet has already established is not a stated gate, and
  spreading the other way round would let the degenerate `Stop: []` clobber the gate with an empty
  array.

`completionGateHooks()` is a factory rather than a shared const because its record is spread into
each agent's own hooks and a const's arrays would be held by identity across every compile in the
process.

**The gate reaches `sanitizeHooks` on the same terms as an authored hook**, because the composition
happens before the sanitiser rather than in the template. That is the point of doing it in the data
path: `hooks` is the one field on an agent that renders as an EXECUTABLE, and it has one boundary
regardless of where a given entry came from.

**What the ordering decides is narrower than it looks, and no test can hold it.** An author's own
hooks are sanitised either way, because `sanitizeCompiledAgentData` walks `data.agent.hooks`
whether or not the gate has been composed yet. Reversing the two changes exactly one value:
`COMPLETION_GATE_COMMAND`, which this product authors, stops being sanitised. So no fixture can
distinguish the orderings — the only value that depends on the sequence is a constant no test can
poison. `prepareForRender` is why that no longer matters: the composition is written as an argument
to the sanitiser, so reversing it is a rewrite of the expression rather than a move of a statement.

The composition is per event rather than a branch on presence, which is what keeps a declared
`PostToolUse` formatter from costing an agent its gate: an exclusive `{% if hooks %}` /
`{% elsif %}` pair would let any declared hook silently delete it, with nothing reporting the
loss. The command exits 0 unless there is both an `npm` and a `package.json`, then runs
`npm run --if-present --silent typecheck`, exiting 2 with
the captured output on stderr when either fails. Exit 2 is how a stop hook BLOCKS the stop, and
stderr is what Claude Code returns to the sub-agent — so a failing typecheck comes back as the
errors themselves. `--if-present` plus the npm/manifest guard is what keeps the gate inert in a
project that declares no such scripts, rather than making every sub-agent unstoppable.

#### The emitted event is `Stop`, and the log will say `SubagentStop`

Observed in the shipped Claude Code binary at version **2.1.259** on **2026-09-03**, by reading it —
not from published documentation, and this is the kind of fact that changes underneath us.

Registering a sub-agent's frontmatter hooks walks the full event vocabulary and rewrites exactly one
key: `Stop` becomes `SubagentStop`, logged as `Converting Stop hook to SubagentStop for agent X
(subagents trigger SubagentStop)`. The vocabulary contains `SubagentStop` verbatim, so **either
spelling works when the agent is invoked as a sub-agent** — which is why the `SubagentStop` this
product emitted before 2026-09-03 was never broken, and why compiled agents carrying it still work.

They diverge on the other path. An agent run as the MAIN session through `--agent` has its
frontmatter hooks stored raw, with no rewrite, and each dispatch looks the record up by the event's
own name. A `SubagentStop` key is therefore consulted only for an event a main session never fires,
while `Stop` fires natively. **`Stop` is correct in both modes and `SubagentStop` in one**, which is
why the compile emits `Stop`.

The same conversion is why `withCompletionGate` treats a declared `SubagentStop` as a stated gate:
on the sub-agent path the two ARE one event, so emitting a `Stop` gate beside a project's
`SubagentStop` would run both.

#### A project-scope compiled agent's hooks are skipped in an untrusted project

Same source, same caveat: observed in the shipped Claude Code binary at version **2.1.259** on
**2026-09-03**, by reading it rather than from published documentation.

**Frontmatter hooks are gated on the trust dialog, and the compile has no way to know.** Before
registering an agent's frontmatter hooks, Claude Code asks whether the folder the definition file
came from is trusted. The answer depends entirely on which SCOPE the agent was installed at:

| Where the compiled agent lives | Trusted?                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `~/.claude/agents/` (global)   | **Always.** The loader tags user-directory agents `source: "userSettings"`, which the check short-circuits to `true` |
| `<project>/.claude/agents/`    | **Only if that project's trust dialog was accepted.** Tagged `source: "projectSettings"`, which falls through        |

The project-scope check walks `<project>/.claude/agents` up to `<project>` — the walk is literally
"if this directory is named `agents` and its parent is named `.claude`, use the grandparent" — and
then reads `projects[<project>].hasTrustDialogAccepted` from `~/.claude.json`. A `false` or absent
entry means the agent loads, its prompt loads, its tools load, and **its hooks are dropped**.

**The skip is silent from this CLI's side.** Claude Code logs it to its own diagnostics
(`Skipping frontmatter hooks for agent '<name>': the folder its definition file came from is not
trusted`) and offers the remedy — run Claude Code in that folder once and accept the trust dialog,
or set `projects[<path>].hasTrustDialogAccepted: true`. Nothing reaches `agents-inc`: `compile`
reports the agent written, the `hooks:` key is in the file, and the gate never runs. There is no
check here that can detect it, because the condition lives in the consumer's state rather than in
anything the compile can read.

**So the completion gate is a guarantee at global scope and a best-effort at project scope.** That
is worth knowing before leaning on it: the gate is the mechanism that stands in place of asking an
agent to check its own work, and in a project-scope install into a folder whose trust dialog was
never accepted it does nothing at all, indistinguishably from doing its job.

Two further conditions apply at every scope, both read from the same binary. `disableAllHooks` in
Claude Code's settings (and its org-policy form `allowManagedHooksOnly`) turns every hook off,
the gate included. And a stop hook may block at most `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` consecutive
times — default 8 — before Claude Code overrides it and ends the turn; the gate reads no stdin and
so never sees the `stop_hook_active` flag the binary passes on repeat invocations, which means a
typecheck that stays broken releases the agent after eight blocks with the "iterates rather than
reporting done" promise unmet. A third: command hooks time out — 600 s by default, lowerable per hook — and a gate that
times out has its output discarded and the turn proceeds, which is why the gate runs typecheck alone and not the project's lint or tests: a suite longer than the timeout would make the gate fail open rather than block. None of the three is something this CLI can see or set.

The same gate governs frontmatter `mcpServers`, which this product does not emit.

Which bundled agents currently take the emitted gate:

```
grep -lE '^\s*-\s*(Write|Edit)\s*$' src/agents/*/*/metadata.yaml       # candidates
grep -lE '^\s*(Stop|SubagentStop):' src/agents/*/*/metadata.yaml         # stating a gate of their own instead
```

Declaring some OTHER event no longer takes an agent off that list, which is what the second grep
narrowing from `^hooks:` to the two stop spellings records.

**Both keys survive the load path only because both loaders spread them explicitly.**
`loadAgentsFromDir` (`src/cli/lib/loading/loader.ts`) builds an `AgentDefinition` from a named field
list, and `resolveAgents` (`src/cli/lib/resolver.ts`) builds the `AgentConfig` the template sees from
another — so a frontmatter key absent from either list is dropped between `metadata.yaml` and the
render. Both spread `effort`, `disallowedTools`, `permissionMode`, `isolation`, `hooks` and `experimental`
**conditionally**, because an explicit `undefined` renders as an empty frontmatter key on the ones
the template emits unconditionally.

`hooks` is no longer among those it can hurt: the gate is composed rather than branched on, so an
explicit `hooks: undefined` spreads as nothing into `withCompletionGate`'s merge and a writing agent
keeps its gate either way.

## Skill Types in Compilation

| Type      | In Compiled Agent                                                                                                       | Loaded How                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Preloaded | Content embedded directly in .md file                                                                                   | Listed in frontmatter `skills:`  |
| Dynamic   | Metadata only (id, description, usage), listed in `<skill_activation_protocol>` INSIDE the trailing `<system-reminder>` | Loaded via Skill tool at runtime |

**A skill's `usage` line is the catalogue's own words, not a generated sentence.**
`resolveAgentConfigToSkills` (`src/cli/lib/stacks/stacks-loader.ts`) fills each `SkillReference.usage`
through `statedUsageFor`, which reads `usageGuidance` off the matrix entry
(`matrix.skills[skillId]?.usageGuidance`) and falls back to `defaultUsageGuidance(category)` —
`Use when working with <category>.` — when that value is absent, empty, or whitespace only
(`stated !== undefined && stated.trim() !== ""` is the test). A blank sentence counts as none: a
catalogue may state `""` because `usageGuidance` is `z.string().exactOptional()`, and an empty
bullet is a row of the activation protocol saying nothing. The placeholder is
what remains when there is nothing to read: an id the matrix does not carry (local, marketplace,
withdrawn) or one it carries that states no guidance, which is ordinary rather than malformed since
`usageGuidance` is optional on `SkillCore` and on `matrixRawMetadataSchema`. It is a whole sentence
because `agent.liquid` renders it verbatim as a bullet of its own. `defaultUsageGuidance` is
exported from `src/cli/lib/stacks/stacks-loader.ts` for exactly one reason — `externalSkillMetadata`
(`src/cli/lib/seed/external-skills.ts`) CALLS it for a carried skill's default rather than spelling
the sentence a second time, so the two routes to one skill's cue cannot disagree. **Which
matrix is seated therefore decides the bytes** — see the `seatMatrixForPass` note under
[`compile` Regenerates `config-types.ts`](#compile-regenerates-config-typests).

**The `skills:` key and the `Skill` tool are independent.** `skills:` preloads content into the
agent's startup context and grants no tool; the `Skill` tool in the `tools:` allowlist is what lets
the agent load one at runtime, and a dynamic skill has nothing but that route. `withSkillTool`
(`packages/compile/src/agent-source.ts`) grants it to every compiled agent — see
[agent-system.md](./agent-system.md#metadatayaml-schema).

Split logic in `buildAgentTemplateContext()` in `packages/compile/src/agent-source.ts`, re-exported
by `src/cli/lib/compiler.ts`. Which side a skill lands on is the stack assignment's `preloaded`
flag, resolved when the config was written by `toStackAssignment()` in
`packages/compile/src/seed-to-config.ts` — module-private there: an explicit prior entry
beats the mapping, the mapping beats lazy. `priorLoadState()` reads the prior stack entry — a bare
`{ id }` read back off disk is curated lazy, not silence — and a triple with no prior entry takes
`mappedLoadState()`, which resolves catalog skill ids on roster agents through `resolveLoadState`
(`@workspace/matrix`, the same `PRELOAD_DEFAULTS` table the editor's default assignments read);
local skills, marketplace skills and hand-written agents have no entry to match and are lazy by
rule.

## Output Structure

```
.claude/
  agents/
    web-developer.md        # Compiled agent prompt
    api-developer.md
    ...
  skills/
    web-framework-react/
      SKILL.md              # Skill content
      reference.md          # Optional reference
      examples/             # Optional examples dir
      scripts/              # Optional scripts dir
    ...
```

The live `compile` command writes only `agents/` (agents-only recompile). `skills/` is
produced by the install/eject flow and the skill/agent plugin-build flows
(`compileSkillPlugin()`, `compileAgentPlugin()`), not by `compile`. Nothing in the CLI
writes a `commands/` directory or a stack `CLAUDE.md` into the output.

## Security: Liquid Injection Prevention

File: `packages/compile/src/agent-source.ts`, re-exported by `src/cli/lib/compiler.ts` so no CLI
call site moved. The editor renders through the same sanitiser.

Pattern constant: `LIQUID_SYNTAX_PATTERN` — module-private there.

`sanitizeLiquidSyntax()` strips individual strings of Liquid delimiters, and reports each strip
through the seated diagnostics sink (`diagnostics().warn`), which is why a CLI run says what it
removed and a browser preview silently discards.

`sanitizeCompiledAgentData()` strips Liquid template syntax (`{{`, `}}`, `{%`, `%}`) from:

- Agent metadata, in the order the sanitiser names them: `name`, `title`, `description` and `tools` unconditionally, then `disallowedTools`, `model`, `effort`, `permissionMode`, `isolation`, `experimental` and `hooks` conditionally spread, so an absent field is not written back as `undefined`. `hooks` goes through `sanitizeHooks()` and `experimental` through `sanitizeExperimental()`; the rest take `sanitizeLiquidSyntax()` or `sanitizeStringArray()` directly
- Skill metadata: id, description, usage, pluginRef — via `sanitizeSkills()`, applied to `skills`, `preloadedSkills`, and `dynamicSkills`
- Preloaded skill IDs (`preloadedSkillIds`)

`renderAgent()` additionally runs the `generatorVersion` argument through `sanitizeLiquidSyntax()`
before handing it to the engine; `completionGateCommand` is a module-private constant and is not
user-controlled, so it is passed as-is.

**Hooks get their own sanitiser.** `sanitizeHooks()` — module-private in
`packages/compile/src/agent-source.ts` — walks the `Record<string, AgentHookDefinition[]>` and strips
the event key, each definition's `matcher`, and each action's `command`, `script` and `prompt`. These
are the only fields on an agent that render as an EXECUTABLE: a `SubagentStop` hook's `command` is a
shell line Claude Code runs when the sub-agent finishes, and an agent definition can arrive from a
marketplace, so those strings are as author-controlled as `agent.name` beside them. Sanitising is not
a substitute for trusting the source — a marketplace whose agents you compile can name any command it
likes, which is a property of installing an agent rather than of this function.

**Content fields are NOT sanitized** — identity, playbook, output, criticalRequirementsTop, and criticalReminders pass through unchanged. LiquidJS does not re-evaluate template syntax inside variable values, so double-curlies in content (e.g. a GitHub Actions `${{ secrets.X }}` snippet) are safe.

This prevents user-controlled metadata (from YAML/TS config files) from executing as Liquid template code.

## Exported Functions Reference

### compiler.ts

| Function                      | Signature                                                                                                      | Purpose                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sanitizeLiquidSyntax()`      | `<T extends string>(value: T, fieldName: string): T`                                                           | Strip Liquid syntax from a string                                                                                                        |
| `sanitizeCompiledAgentData()` | `(data: CompiledAgentData): CompiledAgentData`                                                                 | Sanitize all fields before template render                                                                                               |
| `buildAgentTemplateContext()` | `(name: string, agent: AgentConfig, files: AgentFiles, mapSkill?: (skill: Skill) => Skill): CompiledAgentData` | Build template data; appends `Skill` to `agent.tools` via `withSkillTool`; `mapSkill` transforms each skill (used to attach `pluginRef`) |
| `compileAgentForPlugin()`     | `(name: AgentName, agent: AgentConfig, fallbackRoot: string, engine: Liquid): Promise<string>`                 | Per-skill-`pluginRef` agent render used by the live recompile + plugin paths                                                             |
| `createLiquidEngine()`        | `(projectDir?: string): Promise<Liquid>`                                                                       | Create Liquid engine with layered roots                                                                                                  |

### agent-source.ts (imported by `compiler.ts`, NOT re-exported by it)

| Function                  | Signature                                                                     | Purpose                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderAgent()`           | `(engine: Liquid, data: CompiledAgentData, version: string): Promise<string>` | Sanitize -> render the `"agent"` template with `generatorVersion` and `completionGateCommand` added to the context -> stamp the provenance marker. Every compile entry point goes through it |
| `pluginRefFor()`          | `(skill: Skill): { pluginRef?: PluginSkillRef }`                              | Spreadable partial deciding the per-skill reference format                                                                                                                                   |
| `provenanceMarker()`      | `(): string`                                                                  | See [The Provenance Marker](#the-provenance-marker)                                                                                                                                          |
| `hasProvenanceMarker()`   | `(content: string): boolean`                                                  | Same                                                                                                                                                                                         |
| `stampProvenanceMarker()` | `(content: string): string`                                                   | Same                                                                                                                                                                                         |

`version` is an argument because the CLI reads it from its own `package.json` and a browser has no
manifest to read: the CLI passes `await cliVersion()`, the editor's output preview passes
`CORPUS_CLI_VERSION` — the release its vendored corpus was generated at.

## Plugin-Mode Compilation

For native Claude Code plugin distribution:

| Compiler                   | File                                          | Output                                                                                                                                       |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileSkillPlugin()`     | `src/cli/lib/skills/skill-plugin-compiler.ts` | One skill plugin dir (singular)                                                                                                              |
| `compileAllSkillPlugins()` | `src/cli/lib/skills/skill-plugin-compiler.ts` | Batch: every `SKILL.md` under a dir; returns `SkillCompilationRun { compiled, failed }`                                                      |
| `compileAgentPlugin()`     | `src/cli/lib/agents/agent-plugin-compiler.ts` | One agent plugin dir (singular). `AgentPluginOptions` shape and its single internal construction site: [leaf-exports.md](../leaf-exports.md) |
| `compileAllAgentPlugins()` | `src/cli/lib/agents/agent-plugin-compiler.ts` | Batch: every agent `.md` under a dir; returns `CompiledAgentPlugin[]`                                                                        |
| `compileAgentForPlugin()`  | `src/cli/lib/compiler.ts`                     | Single agent render with per-skill `pluginRef`; the live recompile path's single-agent primitive                                             |

### Batch Skill-Plugin Compilation & Command Drivers

`compileAllSkillPlugins(skillsDir, outputDir)` (`src/cli/lib/skills/skill-plugin-compiler.ts`) is the batch wrapper over the singular `compileSkillPlugin()`. It globs every `**/SKILL.md` under `skillsDir`, compiles each, and returns `SkillCompilationRun { compiled: CompiledSkillPlugin[]; failed: string[] }`. A per-skill try/catch collects failures (by directory basename) and emits a `warn()` instead of aborting the whole run — contrast the install path, which hard-errors on the first failure. `printCompilationSummary()` prints the compiled list. `compileAllAgentPlugins()` is the agent counterpart but returns a bare `CompiledAgentPlugin[]` (no `failed` list).

| Command / caller | File                                | Drives                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build plugins`  | `src/cli/commands/build/plugins.ts` | `compileSkillPlugin()` (with `--skill`) or `compileAllSkillPlugins()` (default), plus `compileAllAgentPlugins()` (with `--agents-dir`). Prunes stale skill-plugin dirs after a clean full run; skips pruning when any skill fails. |

`build marketplace` (`src/cli/commands/build/marketplace.ts`) does NOT compile — it scans already-built plugin dirs and generates `marketplace.json` via `generateMarketplace()` (identity read from `package.json`).

**`compileAgentForPlugin()` (`src/cli/lib/compiler.ts`) is the only single-agent render**, shared by the live recompile path and the plugin-build path. There is no second agent-render entry point — do not look for a plain `compileAgent()`.

- It decides `pluginRef` **per-skill** via `pluginRefFor(skill)` based on each skill's own `source` field. No agent-wide `installMode` parameter.
- Preloaded skill IDs render with `pluginRef` when attached, otherwise bare skill IDs (`buildAgentTemplateContext()`: `preloadedSkillIds = preloadedSkills.map((s) => s.pluginRef ?? s.id)`).
- It reads agent partials through the module-private `readAgentFiles()` helper.

### Per-Skill `pluginRef` Format

Helper: `pluginRefFor(skill: Skill): { pluginRef?: PluginSkillRef }` in `packages/compile/src/agent-source.ts` — exported there, imported by `src/cli/lib/compiler.ts` and by the editor's `output-preview.ts`, and not re-exported by either. It returns a **spreadable partial**, not the ref itself, so the caller writes `{ ...skill, ...pluginRefFor(skill) }` and an ejected skill contributes no key at all. There is no `derivePluginRef` — do not look for one.
Constant: `EJECT_SOURCE = "eject"` in `src/cli/consts.ts`.

Rule (mirrors the helper body):

| `skill.source`                 | Compiled reference | Frontmatter entry |
| ------------------------------ | ------------------ | ----------------- |
| `undefined`                    | bare `${id}`       | `${id}`           |
| `"eject"` (via `EJECT_SOURCE`) | bare `${id}`       | `${id}`           |
| any other string (marketplace) | `${id}:${id}`      | `${id}:${id}`     |

`undefined` covers user-authored local skills that have no `SkillConfig` entry -- intentional fall-through, not a silent fallback. Mixed-mode agents (some skills eject, some marketplace) produce a mix of bare and qualified refs in the same frontmatter.

**Per-skill resolution at runtime:** bare refs resolve against the user's `.claude/skills/` directory; qualified `${id}:${id}` refs resolve against the Claude Code plugin registry.

### `source` Plumbing Through the Compile Path

- `SkillReference.source?: string` (`src/cli/types/skills.ts`) -- carried alongside `id`, `usage`, `preloaded`.
- `Skill.source?: string` (same file) -- propagated from `SkillReference.source` by `resolveSkillReference()` in `resolver.ts`.
- `buildCompileAgents()` in `src/cli/lib/installation/local-installer.ts` attaches each skill's `source` to its `SkillReference` from a `Map<SkillId, string>` (`sourceById`) built from `config.skills`, so downstream `resolveSkillReference` can propagate it onto the fully-resolved `Skill` consumed by `compileAgentForPlugin`.
- `compileAgentForPlugin` (in `src/cli/lib/compiler.ts`) reads `skill.source` via `pluginRefFor(skill)` -- no `installMode` parameter.

### `installMode` Is Not An Input To The Compile Path

Aggregate `installMode` never reaches agent compilation — per-skill `source` decides the reference format, so no wrapper on the way in carries the mode:

- `RecompileAgentsOptions` (`src/cli/lib/agents/agent-recompiler.ts`) has no `installMode` field; there is no `CompileAndWriteParams` type.

Per-skill `source` (via `sourceById` -> `pluginRefFor`) is the sole authority for the plugin-vs-eject reference format. `InstallMode` / `deriveInstallMode()` still exist elsewhere (install-plan logging in `init.tsx`, `wizard-store.ts`) but no longer flow into agent compilation.

### Dual-Scope `sourceById` Collapse -- Verified Unreachable in Production

The `sourceById` map in `buildCompileAgents` keys by `SkillId` alone, so a dual-scope skill (same id under `"project"` and `"global"` with different `origin` values) is last-write-wins. The collapse is **not reachable through any production command**:

- `recompileAgents()` (`src/cli/lib/agents/agent-recompiler.ts`) is the **only production caller** of `buildCompileAgents`, and it calls `filterExcludedEntries()` first, dropping the excluded (tombstone) entry so `sourceById` never sees two entries for one id. `init`, `edit` and `compile` all route through it.
- Even unfiltered, `generateProjectConfigWithInlinedGlobal()` (module-private in `packages/compile/src/config-source.ts`) emits global entries before project entries, so the active project entry (serialized last) wins -- correct in both mixed-source directions.

Covered by the regression test `e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts`. Keying by `(id, scope)` remains a robustness follow-up.

## Operations Layer Integration

The compilation pipeline is wrapped by the operations layer for use by commands:

| Operation                            | File                                                          | Purpose                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileAgents()`                    | `src/cli/lib/operations/project/compile-agents.ts`            | Scope-filtering orchestrator delegating to `recompileAgents()`, then pruning stale agents on an authoritative pass                                                                                                  |
| `compileAgentsAllScopes()`           | `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Home single-pass / project two-pass driver for `init` and `edit`                                                                                                                                                    |
| `recompileRegisteredProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Recompile ONE registered project at project scope                                                                                                                                                                   |
| `recompilePropagatedProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Loop the above over `GateReport.propagated.updated`, driven by the gate's `recompilePropagated`. There is no `ConfigWriteResult.propagatedProjects` field — the operations result carries `propagation: GateReport` |
| `loadAgentDefs()`                    | `src/cli/lib/operations/project/load-agent-defs.ts`           | Load + merge CLI/source agent definitions                                                                                                                                                                           |
| `discoverInstalledSkills()`          | `src/cli/lib/operations/skills/discover-skills.ts`            | 4-way skill discovery and merge                                                                                                                                                                                     |
| `detectBothInstallations()`          | `src/cli/lib/operations/project/detect-both-installations.ts` | Find global + project installations                                                                                                                                                                                 |

The `compile` command (`src/cli/commands/compile.ts`) uses these operations to:

1. `detectInstallations()` — `detectBothInstallations()` wrapped in a `ConfigLoadError`
   catch. A config file that exists but cannot be parsed hard-errors with
   `EXIT_CODES.ERROR` naming the path, BEFORE any compilation or write.
   Zero installations is also a hard error (`ERROR_MESSAGES.NO_INSTALLATION`).
2. `resolveAndLogSource()` then `loadAgentDefsOrFail()`
3. `buildCompilePasses()` — the ONE pass this invocation owns. A project
   installation at `cwd` makes the run project-scope: the project pass alone,
   writing nothing outside that project. Only where no project installation is in
   play — the home directory, or a directory with no config of its own — is the
   global pass reached. `scopeFilter: "project"` is set on the project pass when
   `hasBoth` (the project config inlines the global entries, so an unfiltered pass
   would write global-scoped agents into the project); a lone global pass is
   scope-UNfiltered and therefore authoritative over its `outputDir` (see the
   pruning stage above).
4. For each pass (`runCompilePass`): seat the matrix singleton for the pass's own
   `projectDir` and hold the catalogue it returns (`seatMatrixForPass()`, first,
   before anything reads it; `null` when the load failed) ->
   discover skills (`discoverAllSkills()`, which
   REFUSES the run via `refuseUnusableSkillMetadata()` when `unusableMetadata` is
   non-empty — before a count is printed, an agent is written or the unions are
   regenerated) -> warn about configured-but-missing stack skills
   (`warnUnresolvedStackSkills()`) and scope-dropped stack pairs
   (`warnScopeDroppedStackPairs()`) -> compile agents via `compileAgents()` ->
   `refreshConfigTypes(pass, cwd, seatedMatrix)`
5. Zero passes with skills is a hard error (`ERROR_MESSAGES.NO_SKILLS_TO_COMPILE`).
   The pass list itself comes from the module-private `buildCompilePasses()`.

A stack-referenced skill absent from disk is dropped from the recompiled agent.
`warnUnresolvedStackSkills()` surfaces each dropped skill as a `this.warn()`, so the default output
cannot report a clean recompile of an agent that silently lost a skill.

### `compile` Regenerates `config-types.ts`

**Function:** `refreshConfigTypes(pass, cwd, seatedMatrix)` (private on the `Compile` command) ->
`reconcileTypesFromDisk(projectDir, config, { matrix: seatedMatrix, agents }, { currentProjectDir: cwd })`
(`src/cli/lib/config-gate/index.ts`).

The documented workflow is "hand-edit `config.ts`, then run `compile`", but the unions in
`config-types.ts` are derived from `config.ts`, so a pass that left them untouched stranded
stale unions. Every pass now regenerates them for the scope it compiled, matching the wizard
write path exactly (writer selection):

| Scope                           | Writer selected by `reconcileTypesFromDisk`                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| global (`isHomeDirectory(dir)`) | `config-gate/pair-writer.ts::writeGlobalTypesHalf` — standalone unions narrowed to the config's entries                              |
| project                         | `regenerateConfigTypes` — import-and-extend from the global types (falls back to standalone when no global `config-types.ts` exists) |

**A global pass also propagates — and only a global pass can.** `config.ts` on disk is the input and is never rewritten, so there is no prior state to diff and nothing to classify — the only safe assumption is that every registered project's inlined copy of the global config is stale. The global pass therefore fans the config out to every registered project unconditionally and recompiles their agents, printing `propagatedRecompileSummary` — `Recompiled agents in N registered projects, M unchanged`; skipped projects are warned via `registeredProjectUpdateSkipped`. A project pass reaches none of it: `reconcileTypesFromDisk` returns before the fan-out for any non-home `projectDir`, and a project-scope run has no global pass beside it — propagation is a global operation's consequence, and a compile inside a project is not one. `currentProjectDir: cwd` excludes whatever directory the command was run from, which is its own subject. That rendering (`reportPropagation`) sits deliberately outside the refresh's `catch`: an unreachable project must not be reported as a failure to refresh the unions, which did succeed.

Contract details:

- Runs on the **early-return path too**: a pass whose scope has zero discovered skills still
  refreshes, because the persisted config — not the installed skill set — drives the unions.
- No config at the pass's `projectDir` -> `verbose()` skip, no write.
- Failure is a `this.warn(configTypesRefreshFailed(reason))`, never a hard error: the compiled
  agents are already on disk and remain valid; only the unions may still be stale.
- The `matrix` it hands `reconcileTypesFromDisk` is the VALUE `seatMatrixForPass()` returned,
  passed down as the third parameter — not a read of the singleton that call also seated. A
  refresh reading the singleton cannot say which seat it got, and the point of threading the
  value is that this one cannot run against a seat other than the one this pass asked for.
  `seatMatrixForPass()` produced it earlier in the same pass with
  `loadSkillsMatrixFromSource({ projectDir, skipExtraSources: true, matrixOnly: true })`
  (`src/cli/lib/loading/source-loader.ts`), scoped to the pass's `projectDir` rather than the
  invoking `cwd` so a global pass seats the global installation's own local skills. `matrixOnly`
  skips the `fetchFromSource` clone for the default source (the matrix is the pre-computed
  `BUILT_IN_MATRIX` anyway) so `compile` stays offline on a cold cache; `sourcePath` comes back
  as `""`. `skipExtraSources` only drops the wizard's `availableSources`/`activeSource` UI
  tagging, which neither the render path nor the config-types writer reads — a parity test in
  `src/cli/lib/installation/local-installer.test.ts` pins the emitted output byte-identical to
  the wizard's fully tagged load.
- **A failed seat is `null`, and the two readers take opposite postures on it.** The RENDER
  DEGRADES and the type refresh ABORTS. `refreshConfigTypes` returns immediately on `null`,
  warning `configTypesRefreshFailed("no skills catalogue could be loaded for <projectDir>")`,
  and writes no `config-types.ts` at all — it does not fall back to `BUILT_IN_MATRIX`, and at
  global scope it therefore fans nothing out either. Every union here is DERIVED from the
  catalogue, so writing them without one is a wrong answer rather than a degraded one: the
  unions would narrow to whatever the built-in catalogue happens to carry, dropping every
  marketplace-only and local category, while the `config.ts` beside them still keys its `stack`
  under the ones that just vanished — so the pair stops type-checking, and at global scope that
  is propagated into every registered project.
- **The seat is what makes the RENDER correct too, which is why it precedes discovery rather
  than sitting inside this refresh.** `resolveAgentConfigToSkills` reads the module-level
  singleton (`src/cli/lib/matrix/matrix-provider.ts`) that the same load seated, through
  `statedUsageFor` and `liveCategoryOf` (`src/cli/lib/stacks/stacks-loader.ts`), so no argument
  reaches it. Left at its process-start `BUILT_IN_MATRIX` default, which carries no local skill,
  a locally-installed skill's `usageGuidance` falls back to the generic per-category sentence —
  different bytes from what `install` last wrote, so the following `compile` rewrites every
  agent carrying one. On a failed seat the render degrades to exactly that placeholder behaviour
  rather than aborting, which is the posture the types half deliberately does not share.

### Global-Scoped Agents Hint

When the **Project** pass resolves zero agents, `hintGlobalScopedAgents()` reloads the project
config, counts `agents.filter(a => !a.excluded && a.scope === "global")`, and — when non-zero —
prints `globalScopedAgentsHint(count)` (`src/cli/utils/messages.ts`) after
`INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE`, naming the count and pointing at the home directory.
Without it, a project whose agents are all global-scoped printed only "No agents to recompile",
which reads as a silent no-op after a global stack change.

### All-Scopes Merge (compile-agents-all-scopes.ts)

`compileAgentsAllScopes()` (`src/cli/lib/operations/project/compile-agents-all-scopes.ts`) is the entry `init` (`init.tsx`) and `edit` (`edit.tsx`) call — it wraps `compileAgents()` and branches on context:

- **Home context** (`isHomeDirectory(projectDir)`): a single `compileAgents()` pass writing to the home agents dir — no scope filter.
- **Project context**: a global pass (`projectDir: os.homedir()`, `scopeFilter: "global"`) followed by a project pass (`scopeFilter: "project"`), each writing only its own scope so the project pass cannot overwrite global agents with zero-skill versions.

The two project-context passes are combined by the private `mergeCompilationResults(...results)` helper, which `flatMap`s all four `CompilationResult` fields — `compiled`, `rewritten`, `failed`, `warnings` — across results **in pass order** (global then project). The home branch returns its single `CompilationResult` directly.

**Pruning consequence:** only the home branch is scope-UNfiltered, so only the home branch prunes stale compiled agents from its `outputDir`. Both project-context passes carry a `scopeFilter` and therefore skip pruning — see `pruneStaleAgentsForPass()` in `src/cli/lib/operations/project/compile-agents.ts`.

## Recompilation Flow (agent-recompiler.ts)

`recompileAgents()` in `agent-recompiler.ts` orchestrates the full recompilation:

1. Load project config via `loadProjectConfig()` (from `.claude-src/config.ts`), then `filterExcludedEntries()` drops excluded skills/agents and excluded stack refs
2. Load agent definitions: `loadAllAgents()` for built-in + `loadProjectAgents()` for project overrides
3. Merge: project agents override built-in agents
4. Resolve agent names via `resolveAgentNames()` — priority: explicit `options.agents` -> a PRESENT config's `agents[]` -> all source agents when `outputDir` is set -> existing compiled agents on disk. The config branch keys on **presence, not length**, so `agents: []` compiles zero agents instead of falling through to the all-agents branch
5. Discover skills if not provided: `discoverAllPluginSkills()`
6. Build compile config: `buildCompileAgents()` maps config entries to `CompileAgentConfig` per agent (partitioning known vs missing agents), then `CompileConfig` is constructed inline
7. Create Liquid engine: `createLiquidEngine()` with project template overrides
8. Resolve agents: `resolveAgents()` materializes skill references into full `AgentConfig` objects
9. Compile and write: `writeCompiledAgentsByScope()` (in `src/cli/lib/agents/write-compiled-agents.ts`) renders each agent through `compileAgentForPlugin()` and routes output by agent scope -- global agents to `~/.claude/agents/`, project agents to `outputDir`

## Propagated-Project Recompile

`propagateGlobalChangesToProjects()` (`src/cli/lib/config-gate/propagate.ts`) rewrites each
registered project's `config.ts` / `config-types.ts` when a global-scope config change lands, but
it does not itself re-render those projects' compiled `.claude/agents/<name>.md` files. **Its caller
inside the gate does** — this is part of the write, not a stage the command drives:

```
writeScopedFromWizard(...) | mutateGlobal(...) | reconcileTypesFromDisk(~) | propagateGlobalRemoval(...)
  -> applyConsequences(...)                    (config-gate/index.ts)
       -> propagateGlobalChangesToProjects(...)
       -> recompilePropagated(updated)         (config-gate/recompile.ts, T1 only)
  -> returns GateReport { globalWritten, changes, propagated, recompile }
       |
writeProjectConfig(...)                       (operations/project/write-project-config.ts)
  -> ConfigWriteResult.propagation
       |
init.tsx / edit.tsx / compile.ts / uninstall.tsx  (RENDER GateReport.recompile — they call nothing)

... and the loop the gate already ran, expanded:
recompilePropagated(updated)                  (config-gate/recompile.ts, lazy import)
  -> recompilePropagatedProjectAgents(dirs)   (operations/project/recompile-project-agents.ts)
       for each dir (sequential):
         recompileRegisteredProjectAgents(dir)
           -> discoverInstalledSkills(dir)    // explicit: without it recompileAgents falls back
           -> loadAgentDefs()                 //   to discoverAllPluginSkills and strips every
           -> compileAgents({                 //   global-local and project-local skill
                projectDir: dir,
                sourcePath,
                skills: allSkills,
                scopeFilter: "project",
                outputDir: resolveInstallPaths(dir, "project").agentsDir,
              })
```

Contract points:

- **Project scope only.** The global agents were already recompiled by the triggering operation's
  own pass; repeating a global pass per registered project would rewrite `~/.claude/agents` once
  per project for no gain.
- **`scopeFilter: "project"` therefore also disables pruning** (see the pruning stage above) — this
  pass sees only one scope's roster and must not delete another scope's files.
- **Per-project failure isolation.** `recompilePropagatedProjectAgents` wraps each project in
  try/catch, counts it into `failedCount`, pushes `Could not recompile agents in <dir>: <reason>`
  into `warnings`, and continues. A non-empty `result.failed` from the compile also counts as a
  failed project and forwards that result's warnings. Projects are processed **sequentially** so
  the collected warnings keep a deterministic per-project order.
- **Three counters, not two.** It returns
  `PropagatedRecompileSummary = { rewrittenCount, unchangedCount, failedCount, warnings }`. A
  project that neither failed nor produced a non-empty `result.rewritten` counts as
  `unchangedCount` — it was visited and left alone, which is a different fact from being
  recompiled and the one a single count could not tell apart. There is no `recompiledCount`.
- **The commands do not drive this loop.** Its only production caller is `recompilePropagated` in
  `src/cli/lib/config-gate/recompile.ts`, which the gate runs inside `applyConsequences` on a T1
  tier. `init`, `edit`, `compile` and `uninstall` render the summary the gate hands back; the
  earlier contract, where the write returned directories for the caller to recompile, is what
  left `edit`'s source migration and the global `uninstall` behind.
- **Agent partials always come from the CLI** (`getLocalAgentDefinitions()` returns
  `sourcePath: PROJECT_ROOT`), so no per-project marketplace source resolution is needed.
- All four fan-out commands (`init`, `edit`, `compile`, `uninstall`) surface each warning via
  `this.warn()` and then log `Recompiled agents in N registered projects, M unchanged` with a
  ` (K failed)` suffix when `failedCount > 0` — one `BaseCommand.reportPropagatedRecompile`, not a
  copy per command.

Without this fan-out a registered project's compiled `.claude/agents/<name>.md` keeps the roster it
was last compiled with until someone runs a command inside that project — including a stale
`name:name` plugin reference after a global plugin→eject switch, whose `config.ts` is already
correct while the compiled agent is not. The same stage is documented from the config-write angle
in `reference/config/config-writer.md` and the agent-recompile angle in
`reference/features/agent-system.md`.

# Agents Inc. CLI - Task Tracking

## Conventions

- **Table entries are one-liners.** Each row is a short headline (≤ ~110 characters) plus an optional `[Plan](<path-to-plan>)` link (e.g. `./D-NNN-plan.md`). Long descriptions break the table — wide rows wrap unpredictably and destroy the scan-readability that's the whole point of the table.
- **Detailed context lives below the table**, under `## Active Tasks` → category sub-heading → `#### D-NNN: <headline>` — repro, root cause, fix direction, file list, etc. If a task needs more than a headline, put the detail there.
- **If a task needs its own file** (large plan, multi-phase, lots of investigation), create `todo/D-NNN-<slug>.md` and link it from the table. Otherwise inline under `## Active Tasks` is fine.
- **Never add a long description directly to the table row.** It's the single most common convention violation in this file and it makes the table unusable.

| ID    | Task                                                                                                                                                                                                | Status        | Type     | Complexity |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| D-276 | Exclusive category: allow selecting a skill that conflicts with a global one, defaulting it to project scope.                                                                                       | Ready for Dev | feature  | complex    |
| D-266 | Shared scroll gates (`useRowScroll`/`useSectionScroll`) disable clipping below `MIN_VIEWPORT_ROWS`, so agents/domains/build/sources bleed at short terminal heights.                                | Ready for Dev | bug      | complex    |
| D-239 | Web UI: extract shared matrix/config-types package for a new browser skill-picker repo. [Plan](./D-239-web-ui-shared-matrix-package.md)                                                             | Investigate   | feature  | complex    |
| D-237 | Create a GIF demo for the README                                                                                                                                                                    | Ready for Dev | feature  | complex    |
| D-235 | E2E gap: `buildProjectTypesExtras` new-domain/category path is uncovered.                                                                                                                           | Ready for Dev | refactor | easy       |
| D-234 | E2E config inspection via `loadProjectConfig` instead of regex-on-config.ts.                                                                                                                        | Ready for Dev | refactor | complex    |
| D-219 | E2E fixture-default ergonomics (globalSetup shared plugin fixture, auto source, collapse ~172 boilerplate sites). Launcher sugar DONE via D-226. [Plan](./D-219-wizard-launcher-default-fixture.md) | Ready for Dev | refactor | complex    |
| D-215 | Config shape simplification — singular-for-exclusive, drop redundant fields                                                                                                                         | Ready for Dev | refactor | complex    |
| D-214 | Matrix composition hardening — prereq to re-enabling `new marketplace`                                                                                                                              | Ready for Dev | bug      | complex    |
| D-213 | Custom agent lifecycle — `new agent` depends on agent-summoner + wiring gaps                                                                                                                        | Ready for Dev | feature  | complex    |
| D-212 | Custom skill lifecycle — install pipeline bug + UX gaps around `custom: true`                                                                                                                       | Ready for Dev | bug      | complex    |
| D-211 | Reorder stack-selection render: scratch → React → other frameworks → CLI                                                                                                                            | Ready for Dev | feature  | complex    |
| D-210 | Merge `validate` into `doctor` — single command, layered output                                                                                                                                     | Investigate   | refactor | complex    |
| D-181 | Add YOLO mode toggle to build step. [Plan](./D-181-yolo-mode-toggle.md)                                                                                                                             | Ready for Dev | feature  | complex    |
| D-180 | Write "Bring your own skills" guide                                                                                                                                                                 | Investigate   | feature  | easy       |
| D-179 | Extract shared post-wizard pipeline into ProjectLifecycle orchestrator                                                                                                                              | Investigate   | refactor | complex    |
| D-170 | Add PostHog anonymous telemetry                                                                                                                                                                     | Investigate   | feature  | complex    |
| D-168 | Audit E2E tests — replace manual file construction with CLI commands                                                                                                                                | Ready for Dev | refactor | complex    |
| D-138 | Iterate on sub-agents — review and improve all agent definitions                                                                                                                                    | Ready for Dev | refactor | complex    |
| D-162 | Skill Olympics — benchmark expressive-typescript skill                                                                                                                                              | Investigate   | refactor | complex    |
| D-118 | Investigate renaming "project/global" scope to "project/user"                                                                                                                                       | Investigate   | refactor | complex    |
| D-111 | Replace E2E text anchors with stable test identifiers                                                                                                                                               | Investigate   | refactor | complex    |
| D-90  | Add Sentry tracking for unresolved matrix references                                                                                                                                                | Ready for Dev | feature  | complex    |
| D-69  | Config migration strategy for outdated config shapes                                                                                                                                                | Investigate   | feature  | complex    |
| D-66  | AI-assisted PR review: categorize diffs by type                                                                                                                                                     | Investigate   | feature  | complex    |
| D-64  | Create CLI E2E testing skill + update `cli-framework-oclif-ink`                                                                                                                                     | Ready for Dev | feature  | complex    |
| D-62  | Review default stacks: add reviewing/research skills                                                                                                                                                | Ready for Dev | feature  | complex    |
| D-52  | Expand `new agent` command. [Plan](./D-52-expand-new-agent.md)                                                                                                                                      | Ready for Dev | feature  | complex    |
| D-41  | Create `agents-inc` configuration skill. [Plan](./D-41-config-sub-agent.md)                                                                                                                         | Ready for Dev | feature  | complex    |

---

For completed tasks, see [TODO-completed.md](./TODO-completed.md).
For refactoring tasks, see [TODO-refactor.md](./TODO-refactor.md).
For deferred tasks, see [TODO-deferred.md](./TODO-deferred.md).

---

## Reminders for Agents

See [docs/guides/agent-reminders.md](../docs/guides/agent-reminders.md) for the full list of rules (use specialized agents, handle uncertainties, blockers, commit policy, archiving, status updates, context compaction, cross-repo changes).

---

## Active Tasks

### Bugs

**Key files**: `src/cli/stores/wizard-store.ts` (`toggleTechnology`'s exclusive-swap guard,
`reconcileSkillConfigs`/`applySkillRemoval`), `e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts`.

---

#### D-266: Scroll gates stop clipping below `MIN_VIEWPORT_ROWS`

**Still open.** Two symptoms were removed in the 2026-07-31 wizard-UI pass without touching the cause,
so the cliff is intact — it is simply harder to walk off.

**Cause.** `useRowScroll` / `useSectionScroll` disable clipping entirely when the computed viewport
falls below `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS` (5). Content then overflows and paints through
whatever sits below it — hotkey row, footer, box borders.

**What already changed (do not re-do):**

- `MIN_TERMINAL_SIZE` (`COLS: 80`, `ROWS: 20`) is now one constant read by both
  `BaseCommand.ensureTerminalSize()` and a `WizardLayout` guard, so shrinking mid-session shows the
  resize prompt instead of a shredded frame. Previously the check ran once before render and a dead
  `MIN_TERMINAL_HEIGHT` constant with zero importers sat alongside it.
- `LOGO_MIN_TERMINAL_ROWS = 26` hides the ASCII logo on the stack step below that height. The logo's
  6 rows were what starved that step's viewport past the cliff at 20 and 24 rows.

**Measured on the real binary (100 cols), pre-fix:** build step corrupt at 16/17, first clean at 18;
stack step corrupt at 20 and 24 with the logo, clean at 26+.

**Accepted, not a defect:** the Skills grid discards `hiddenAbove`/`hiddenBelow` and Domains / Agents /
Stack use `useRowScroll`, which never computes them — so those steps clip silently with no
`N more below`. Owner's call: on a grid that dense it is self-evident. Recorded at each call site.

**The remaining fix** is to make the shared hooks clip-and-signal instead of bailing out, so no
combination of chrome and terminal height can bleed. Detail in
`.ai-docs/agent-findings/2026-07-31-a-precondition-checked-once-before-render-is-not-a-gate.md`
and the sibling findings dated 2026-07-31.

---

### Wizard UX

---

#### D-276: Exclusive category — allow a project skill to override a global one

**Today:** in an exclusive (radio) category, selecting a different skill is refused outright when the current selection is a globally-installed skill. `toggleTechnology`'s exclusive-swap guard in `src/cli/stores/wizard-store.ts` computes `wouldDropLockedSkill` from `isGloballyLockedSkill` and returns `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`; the conflicting skill is never added. A project with a global React therefore cannot choose Angular from the wizard at all.

**Wanted:** allow the selection. The newly chosen skill is added at **project** scope, and the global skill is masked in that project — exactly the derived conflict mask `maskCollidingGlobalSkills` / `reconcileProjectSplitAgainstGlobal` in `src/cli/lib/installation/local-installer.ts` already produces. That machinery works today but is only reachable from the opposite ordering (the project already owned the conflicting skill and a global install landed on top of it), so the wizard cannot currently express the intent.

**Toast:** confirm the override instead of leaving it implicit — owner's wording: "added project X skill to override global Y". Needs a new `TOAST_MESSAGES` entry that names both skills.

**Constraints**

- The new entry must default to `scope: "project"`. The global-first default used for ordinary additions is wrong here; the point of the action is a project-local override.
- `s` stays the only way to change an existing global skill's own scope. This ticket changes only what SPACE does when selecting a _different_ skill in an exclusive category.
- The global install is never touched: no edit to the global config, no uninstall. The mask exists only in the project's config.
- Self-heal must still apply — removing the project skill later has to unmask the global one, per the mask lifetime rule in `reconcileProjectSplitAgainstGlobal`.
- A required exclusive category must never end up with nothing active.
- This is **not** an exception to the rule that a global skill is immutable from project scope: the global entry is masked, never removed. The docs must state that explicitly or the two rules will read as contradictory.

**Tests:** the swap is allowed and lands at project scope; the toast names both skills; the written project config holds the active project entry plus the global mask; the global config is byte-identical afterwards; removing the project skill unmasks the global one; and the Sources tab renders the resulting pair correctly.

**Docs:** `.ai-docs/reference/concepts/scope-system.md`, `concepts/guard-pattern.md` (the exclusive-swap guard entry), `concepts/tombstone-pattern.md` (a third route to a derived mask), `wizard/state-transitions.md`, plus the user-facing scope guidance under `docs/`.

---

#### D-215: Config shape simplification — singular-for-exclusive, drop redundant fields

Tighten the emitted `.claude-src/config.ts` so the common case is terse. The loader schema already accepts all target shapes (`z.union([element, z.array(element)])` + `skillAssignmentElementSchema = z.union([z.string(), skillAssignmentSchema])`) so this is a writer-side + type-generator change. No runtime fallback / dual-format shim needed — `edit` rewrites the full config on every run, so existing configs auto-upgrade implicitly.

Investigated via a 10-agent parallel sweep. Dropping the domain prefix from category keys was **rejected** (5-way collision on `framework`; `tooling` collides under `web-developer` which references both `web-tooling` and `shared-tooling`; `populateFromStack` does a direct `matrix.categories[key]` lookup and would silently skip entries).

### Emission rules

For each category assignment under an agent:

| Category kind  | No flags (`preloaded` falsy, no `local`/`path`) | Any flag set                                      |
| -------------- | ----------------------------------------------- | ------------------------------------------------- |
| Exclusive (15) | `"web-framework": "web-framework-react"`        | `"web-framework": { id: "...", preloaded: true }` |
| Multi (33)     | `"web-styling": ["web-styling-tailwind"]`       | `"web-styling": [{ id: "...", preloaded: true }]` |

Per-category exclusivity is already available via matrix metadata — drives the writer branch.

### Field cleanup

- **Drop `ProjectConfig.selectedAgents: AgentName[]`.** Redundant with `agents: AgentScopeConfig[]` which already carries `{ name, scope, excluded? }`. Hydrate the wizard's in-memory `selectedAgents` from `agents.map(a => a.name)` at load time. The in-memory store split (for tombstone behavior on globally-installed agents) stays unchanged.
- **Rename `ProjectConfig.domains` → `selectedDomains`** to match the wizard store field name. Pure rename.
- **Drop `preloaded: false` emission.** It's the default — `{ id }` round-trips identically. When collapsed with the rules above, most exclusive entries become bare strings and most multi entries become bare-string arrays.

### Consumers to update

- `config-types-writer.ts` — per-category branch: emit `SkillAssignment<...> | SkillId` for exclusive, `(SkillAssignment<...> | SkillId)[]` for multi. Category exclusivity pulled from matrix metadata.
- `config-generator.ts` — emit new shape; collapse bare-string defaults.
- `config-writer.ts` / `generateConfigSource` — pretty-print the mixed shape cleanly.
- `default-stacks.ts` — hand-rewrite to new shape (single source, readable diff).
- Hydration — `edit.tsx` and `init.tsx` pass `agents.map(a => a.name)` as `initialAgents` instead of `selectedAgents`.
- `ProjectConfig` type in `types/config.ts` and `projectSourceConfigSchema` in `schemas.ts` — remove `selectedAgents`, rename `domains`.

### Tests to update

Writer-layer assertions that spell literal config shape:

- `config-round-trip.test.ts` — stack-shape tests (exclusive categories become singular).
- `config-generator.test.ts` — several `toStrictEqual` on full stack objects.
- `define-config.test.ts` — any literal shape assertions.
- `user-journeys.integration.test.ts` — a few inner category-key literals.
- `config-types-writer.test.ts` — emitted union shape changes.

Reader-layer is shape-tolerant (schema union already there; every consumer iterates `Object.values` and reads `SkillAssignment.id`), so no read-path tests break.

### Non-goals

- Dropping domain prefix from category keys — rejected.
- Skill slugs instead of IDs — rejected (slugs are not structurally unique).
- Dual-format support / migration shim — unnecessary.

#### D-214: Matrix composition hardening — prereq to re-enabling `new marketplace`

`cc new marketplace` scaffolds a marketplace repo, creates a starter skill, and runs `build marketplace` at the end. The output is a working tree that users can then consume via `cc init --source <their-marketplace>`. But the runtime matrix composition pipeline on the consumer side has ~20 hardening gaps surfaced by a 10-agent investigation (see session logs). Scaffolding a marketplace today produces infrastructure built on a shaky foundation. **`new marketplace` is currently disabled behind `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND`** until the gaps below are addressed.

**The scaffold itself works.** Files get written correctly. The problem is what happens when someone consumes the scaffolded marketplace.

### Must-fix before flipping the flag

High-impact correctness bugs where broken output happens silently:

1. **Duplicate skill IDs silently overwrite** in `mergeMatrixWithSkills` (`src/cli/lib/matrix/skill-resolution.ts`). Order depends on glob. Add a dedup warn matching the existing one for duplicate slugs.
2. **Invalid YAML in a single `metadata.yaml` crashes the whole matrix load** (`extractAllSkills` in `matrix-loader.ts` wraps `parseYaml` with no try/catch). Mirror `loadAllAgents` which warns-and-continues per-file.
3. **Custom skill slugs are never added to `slugMap`.** `mergeLocalSkillsIntoMatrix` skips `buildSlugMap`. `getSkillBySlug("my-custom-slug")` throws. Users can't reference their own skills by slug from stacks or relationship rules.
4. **Partial `requires` resolution pretends to be complete.** `resolveRelationships` filters out unresolved slugs then proceeds with the remaining subset — `needsAny: false` (AND) silently narrows to "AND of whatever resolved". Should fail the rule.
5. **`"imported" as CategoryPath`** in `commands/search.ts:142` — illegal union widening (`CategoryPath = Category | "local"`). Either widen the type or change the display model.
6. **Extras can't participate in the relationship graph.** Extra sources' `skill-rules.ts` is never read. A skill shipped in an extra with `requires: [...]` has no effect. Either compose extras' rules too or document loudly that extras are skills-only tagging.
7. **Unresolved slugs drop before `checkMatrixHealth`** — there's no way for `validate` to surface a slug typo in a marketplace's `skill-rules.ts`. Return `unresolvedSlugs[]` from `mergeMatrixWithSkills` and have `checkMatrixHealth` flag them as errors.

### Should-fix before flipping the flag

Quality-of-life and architectural cleanup:

8. Scope category auto-synthesis to `custom: true` only. Today a built-in skill referencing an unknown category silently gets a `order: 999` stub instead of failing loudly — masks marketplace drift.
9. Eliminate the **double `initializeMatrix` write** in `source-loader.ts` (intermediate write at `:278` before the real one at `:146`). Footgun for any consumer reading between those two points.
10. Extract a non-mutating **`computeMatrix()`** for `source-validator.ts` and `config-types-writer.ts` — they currently mutate the global singleton as a side effect.
11. **Deduplicate the `metadata.yaml` loader schemas.** Inline `rawMetadataSchema` in `matrix-loader.ts` is ~70% overlap with `localRawMetadataSchema` but omits the `validateCategoryField` superRefine. Two parse paths for the same file.
12. **Alternatives dedup** — same `(skillId, purpose)` can appear multiple times if declared twice.
13. **Duplicate slug reverse map** — `buildSlugMap` only writes `idToSlug` when `slugToId` was free, so the loser's reverse entry is missing entirely. Every consumer using `idToSlug` gets `undefined` for the loser.
14. **Delete dead `MergedSkillsMatrix.version`** and `agentDefinedDomains?` fields.
15. **Shared `publishMetadataBase`** and extend for strict + custom variants (kills the 90% duplication between `metadataValidationSchema` and `customMetadataValidationSchema`).
16. **Synthesized-category domain consistency** — warn if two skills trigger synthesis on the same category with different domains.

### Nice-to-have

17. **Cycle detection** in `requires` graph.
18. **Stack reference validation** against the matrix (currently warn-only in `stacks-loader.ts:117`).
19. **Shared `jiti` instance** with `moduleCache: true` (config-loader.ts). ~300–900ms win per custom-source load.
20. **JSON Schema generation** alongside Zod — so marketplaces can self-validate against the CLI version they target.
21. **`ForeignSkillId` brand** for multi-source IDs to eliminate `as SkillId` casts at the multi-source boundary.
22. **Order-stable matrix serialization** (sort `resolvedSkills` and `synthesizedCategories` keys).

### Edge cases that would break today

- Marketplace author's `metadata.yaml` has a typo → whole matrix load fails with no file path in the error
- Custom skill has slug `react` (collides with built-in) → built-in loses, every rule referencing `react` silently routes to the custom skill
- Extra source ships a novel skill with its own category → skill drops from wizard, no warning
- Marketplace `skill-rules.ts` has a typo slug → dropped silently, users never learn their stack is missing a dep
- Two skills in the same source declare the same ID → second silently wins
- Custom skill with `domain: "my-domain"` (not in closed `DOMAINS` union) → invisible in every domain tab

### Related tasks

- **D-212** (custom skill lifecycle) — overlapping concerns with items 3, 13 here. Fix together.
- **D-213** (custom agent lifecycle) — overlapping concerns with the "scaffolded but not wired" pattern.
- **R-01** in `todo/TODO-refactor.md` — adds env-var override for feature flags, so these three gated commands can have tests re-enabled without flipping source.

### Re-enabling

Once items 1–7 (must-fix) and 8–10 (should-fix minimum) are resolved and tests confirm multi-source marketplaces compose correctly:

1. Flip `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND` to `true`
2. Un-skip `new/marketplace.test.ts` and `new-marketplace.e2e.test.ts` (cli-tester handles)
3. Add E2E test: `new marketplace` → consumer `init --source <new-mkt>` → skill works end-to-end
4. Close D-212, D-213, D-214 together

---

#### D-213: Custom agent lifecycle — `new agent` depends on compiled agent-summoner + wiring gaps

Running `cc new agent dummy-agent` after a fresh install fails immediately:

```
Create New Agent
What should this agent do?
> doing stuff

Agent name: dummy-agent
Purpose: doing stuff
Output: /home/vince/dev/agents-inc/test-consume-marketplace/.claude/agents/_custom

Fetching agent-summoner from source...
 ›   Error: Agent 'agent-summoner' not found.
 ›
 ›   Run 'compile' first to generate agents.
```

Currently **disabled behind `FEATURE_FLAGS.NEW_AGENT_COMMAND`** (default `false`). Resolve the gaps below before flipping back on.

**Root problem:** `new agent` drives Claude via the `agent-summoner` meta-agent, then post-processes the output. The meta-agent has to be resolvable at runtime, but the command currently looks for it in only two places:

1. `<projectDir>/.claude/agents/agent-summoner.md` (already compiled into the install)
2. `getAgentDefinitions(source).sourcePath/.claude/agents/agent-summoner.md` (fetched from the source)

If the user's install doesn't include `agent-summoner` in their `config.agents` array, step 1 fails. If their registered source doesn't ship a compiled `agent-summoner.md` under `.claude/agents/`, step 2 fails too. The error message then points at `cc compile` — which won't help, because compile only rebuilds against `config.agents`. The user has no clear path forward.

**Required fixes:**

1. **Bundle a known-good `agent-summoner` template with the CLI.** The meta-agent shouldn't be a runtime discovery problem — it's infrastructure for the scaffolding command. Store the compiled meta-agent under `src/agents/agent-summoner.md` (or similar) and have `loadMetaAgent` fall back to it when the user's install + source both miss. This removes the "install it via wizard first" prerequisite entirely.
2. **Fix the error message** when the fallback is also missing (shouldn't happen after fix 1, but defensive). Current text says `"Run 'compile' first to generate agents."` which is wrong. New text should reference the actual remediation or the D-213 follow-up.
3. **Output path.** The command writes to `<projectDir>/.claude/agents/_custom/` (non-standard `_custom` subdir). Regular agents land in `<projectDir>/.claude/agents/*.md` (flat). Decide:
   - Keep `_custom/` as a quarantine dir for user-created agents and update the install pipeline to recognize it, OR
   - Flatten to `<projectDir>/.claude/agents/<name>.md` matching the regular layout, and add `custom: true` to frontmatter (same discriminator pattern as skills).
4. **No installation wiring.** Like `new skill`, `new agent` scaffolds to disk but doesn't update the user's `config.agents` array. They'd have to re-run `edit` to pick up the new agent. Same options as D-212:
   - Interactive post-scaffold prompt: "Add to current installation? [y/N]"
   - `--install` flag for non-interactive
   - Or accept the two-step flow but fix the completion message to tell users `cc edit`, not `cc compile`.
5. **Config-types regression** — verify the same shape-regression bug from D-212's last item (the project `config-types.ts` collapsing from `GlobalAgentName | "custom-agent"` into a flat enumeration) doesn't also happen when a custom agent is added. If it does, fix in the same `config-types-writer.ts` pass.

**Related to D-212.** Both custom-skill and custom-agent flows share the "scaffolded but not installed" and "project config-types regression" patterns. Consider fixing them together so the scaffolding commands have a consistent lifecycle contract.

**Re-enabling:** once gaps 1–5 are resolved, flip `FEATURE_FLAGS.NEW_AGENT_COMMAND` to `true` and un-skip the tests (cli-tester will handle when requested).

---

#### D-212: Custom skill lifecycle — install-pipeline bug + sources-step UX + scaffold messaging

A user creates a custom skill via `new skill my-skill`, opens `cc edit`, toggles it on, and gets a warning at install time:

```
Changes:
  + Custom Skill2 [P]
  ~ Tailwind CSS ([P] → [G])

 ›   Warning: Failed to install plugin custom-skill2: Plugin installation failed:
 ›   ✘ Failed to install plugin "custom-skill2@agents-inc": Plugin "custom-skill2"
 ›     not found in marketplace "agents-inc"
Recompiled 9 agents

✓ Done
```

The pipeline tries to install the custom skill as a marketplace plugin, the marketplace doesn't have it (because the user just created it locally), and the install fails. Agents recompile fine — they pick up the skill content from disk — so the end state is _usable_, but the user sees a scary warning and the skill is technically in a confused state (config says marketplace source, install failed, content found via local fallback).

**Root cause:** the sources step allows selecting "plugin (marketplace)" as the source for a `custom: true` skill. A custom skill by definition does not exist in any registered marketplace — the only valid source is local/eject. The install pipeline then honors the user's selection and attempts marketplace install.

**Required fixes (two places, both thin):**

1. **Sources step UI (`step-sources.tsx` / `source-grid.tsx`)** — for any skill with `custom: true`, restrict the source options to `eject` only. Grey out / skip rendering of the `agents-inc` (or any marketplace) column for that row. Same mechanism that currently disables source switching for non-installable skills.
2. **Install pipeline (`claudePluginInstall` / `compileAllScopes` / wherever the marketplace dispatch happens)** — defensively check `skill.custom === true` before attempting marketplace install. If custom, skip the plugin install entirely and treat as local-only, regardless of what the SkillConfig says. Belt-and-suspenders for cases where config was hand-edited or the UI guard was bypassed.

**Key files to look at:**

- `src/cli/components/wizard/step-sources.tsx` — the step rendering source selection
- `src/cli/components/wizard/source-grid.tsx` — row-level rendering
- `src/cli/stores/wizard-store.ts` — source-selection state
- `src/cli/lib/installation/` — install pipeline entry
- `src/cli/lib/plugins/` — marketplace plugin install

**Related UX gaps from the `new skill` investigation** (file these as part of the same task or separate, developer's choice):

- **Misleading completion message.** `src/cli/commands/new/skill.ts` ends with `"Run 'cc compile' to include it in your agents."` This is wrong — `compile` alone won't include a newly scaffolded skill because `compile` only recompiles against `config.skills` and scaffolding doesn't update that array. Correct message: `"Run 'cc edit' to add this skill to your installation, or hand-edit .claude-src/config.ts."`
- **No single-step path from `new skill` to installed.** The user has to re-enter the wizard every time. Consider either:
  - An interactive prompt at the end of `new skill`: "Add to current installation? [y/N]" → if yes, append SkillConfig with `source: "eject"` + run `compileAgents`. Uses existing helpers.
  - A `--install` flag on `new skill` that does the same non-interactively.
- **`cc list` doesn't show scaffolded-but-unconfigured skills.** A user who forgets they created a skill has no way to surface it via `list`. Consider adding a "Scaffolded (not configured)" section that reads from `discoverLocalSkills()` and subtracts the ones already in `config.skills`.
- **`config-types.ts` regresses to flat listing after a custom-skill install.** Before installing the custom skill, the project's `config-types.ts` uses the extend-global shape:

  ```ts
  import type {
    SkillId as GlobalSkillId,
    AgentName as GlobalAgentName,
    Domain as GlobalDomain,
    Category as GlobalCategory,
  } from "../../../../.claude-src/config-types";

  export type SkillId = GlobalSkillId | "custom-skill2";
  export type AgentName = GlobalAgentName;
  ```

  After installing the custom skill via `cc edit`, it rewrites to a flat enumeration instead:

  ```ts
  export type SkillId =
    // Custom
    | "custom-skill2"
    // Marketplace
    | "cli-framework-oclif-ink"
    | "cli-prompts-clack"
    | "meta-design-expressive-typescript"
    | ...
  export type AgentName =
    | "cli-developer"
    | "cli-reviewer"
    | ...
  ```

  Losing the `GlobalSkillId` import means the project's types are no longer coupled to the global `config-types.ts` — any global-only change (new marketplace skills) won't flow into the project's union. The post-install regeneration code path appears to be falling into a "full listing" branch in `config-types-writer.ts` instead of the "extend global" branch that `new skill` originally used.

  **Where to look:** `src/cli/lib/configuration/config-types-writer.ts` — two codegen paths (probably `formatMaybeSectionedUnion` / `generateProjectConfigTypes` / similar). Figure out what flag or context trigger the shape change and force the extend-global shape for project-scope regenerations.

**Out of scope for this task but related** (D-213 candidate?): the deeper question of "what does `source: 'eject'` mean for a skill that was created locally and was never in any marketplace?" The `source` field's discriminator (`"eject"` vs. marketplace name) is doing two jobs — "install mode" (locally managed vs. managed-by-plugin) and "origin" (forked from marketplace vs. created locally). Custom skills confuse this because they have no marketplace origin at all.

---

#### D-211: Reorder stack-selection render — scratch → React → other frameworks → CLI

The stack-selection step currently presents every available stack in a flat (presumably alphabetical or definition-order) list. Reorder so the visual hierarchy matches user intent and expected preselection frequency:

1. **Start from scratch** at the top — visually separated from the rest (blank line / divider below it)
2. **React stacks** — the most common starting point, rendered immediately after the scratch option
3. **Other frameworks** — Vue, Angular, Svelte, SolidJS, Next.js, Remix, Nuxt, SvelteKit, Astro, Qwik, etc. grouped together
4. **CLI stacks** — at the bottom, after the frameworks section

**Key files to look at:**

- `src/cli/components/wizard/step-stack.tsx` — rendering logic
- `src/stacks/` (in the skills marketplace repo) — stack definitions and any category/ordering metadata
- Check whether stacks already have a `category` or `domain` field that can drive the sort, or whether the ordering needs to be declared explicitly (stack ID prefix, ordinal, group name)

**Open questions for the implementer:**

- Do stacks self-declare a section (`group: "react" | "framework" | "cli"`) or is the grouping inferred from ID prefix / domain?
- Is the "scratch" option a real stack entry or a synthetic row? If synthetic, where does it currently render — could be a simple reorder in the same component. If it's a real entry, it needs a reserved ID to sort first.
- Should "other frameworks" be alphabetical within the group, or manually ordered by popularity?
- Any visual treatment — divider row, heading row (e.g. grey "Frameworks" text), or just a blank line?

---

### CLI UX

#### D-210: Merge `validate` into `doctor` — single command, layered output

`validate` and `doctor` answer the same question from different layers: "is everything OK?" Content bugs `validate` catches (schema errors in installed metadata.yaml, broken frontmatter) cascade directly into operational failures `doctor` surfaces (unresolved skills, agents not compiled). Two commands for one question — users guess which to run.

**Proposed shape:** drop `validate`, extend `doctor` with validate's six sub-passes. One command, layered output:

1. **Content validation first** (validate's passes): schema errors with `file:line`. If any fail, print these and skip the operational layer — operational errors are downstream cascades, reporting them adds noise.
2. **Operational checks second** (current doctor checks, only if content is clean): source reachable, agents compiled, orphans, config parse. Tips via `formatTips()` keyed to `CheckKind`.
3. **One aggregated exit code.** Non-zero on any failure, warnings non-fatal.

**Marketplace-author UX:** running `doctor` from a source-repo dir sees only the content-validation section (operational checks no-op because there's no installed state). Same command, different contexts — one cognitive slot.

**Migration:**

- Fold `validateSource`, installed-skills pass, installed-agents pass, plugins pass into `doctor` as additional `CheckKind` variants (or a structural layer above the existing checks)
- Delete `src/cli/commands/validate.ts` and `validate.test.ts` / `validate.e2e.test.ts`
- Preserve `validateSource`, `validatePlugin`, `validateAllPlugins`, etc. as library functions — `doctor` calls them
- Update README / `docs/reference/commands.md` to drop `validate`

**Open questions:**

- Name: keep `doctor` (user-facing, intuitive) or rename to something more neutral like `check`?
- CI-focused strict-schema-only mode: is there a real need for a fast-path that skips operational checks? If so, how is it surfaced — a subcommand (`doctor schemas`) or kept implicit (operational checks are already fast)?
- Should `validate`'s table-style output be preserved under `doctor`, or fully switched to doctor's tip-driven style? Authors may prefer structured output for CI parsing.

---

### Wizard UX

#### D-181: Add YOLO mode toggle to build step

Disables all skill relationship constraints (single-select categories, requires, conflicts, discourages) so users can select any combination freely. Surface in footer hotkeys. **See [./D-181-yolo-mode-toggle.md](./D-181-yolo-mode-toggle.md) for the full plan and open questions.**

---

### Docs

#### D-180: Write "Bring your own skills" guide

Test custom source path E2E, document `metadata.yaml` schema, `--source` flag usage, multi-source setup, and add guide link to README.

---

### Refactor

#### D-179: Extract shared post-wizard pipeline into ProjectLifecycle orchestrator

Dual-pass compile, copy locals, install plugins, write config are duplicated verbatim across `init` and `edit` commands.

---

### Telemetry

#### D-170: Add PostHog anonymous telemetry

Skill installs, wizard funnel, command errors, platform.

---

### Bugs

### Code Quality

#### D-168: Audit E2E tests — replace manual file construction with CLI commands

**Priority:** Medium

E2E tests must only use CLI commands to create state. Manual file system construction (writing config files, skill dirs, agent files directly via `fs`) bypasses the CLI and creates fragile, divergence-prone setups that break silently when the CLI's internal format changes.

**What to look for:**

- `writeProjectConfig()` calls inside `it()` bodies or local helper functions — replace with `cc init` via `InitWizard` or `EditWizard`
- `writeFile()` / `mkdir()` calls constructing `.claude/skills/`, `.claude/agents/`, or config files manually
- Local helper functions like `createDualScopeInstallation()`, `createLocalSkillWithForkedFrom()` that build internal state by hand
- Any test that imports `writeFile`, `mkdir`, `fs-extra` directly and uses them to set up preconditions

**Exceptions (acceptable):**

- `beforeAll` source fixture setup (`createE2ESource`, `createE2EPluginSource`) — these create a skill _source_, not CLI state
- `createPermissionsFile()` — sets up `.claude/settings.json` which has no CLI command equivalent
- `ProjectBuilder` fixture methods — these are acceptable scaffolding for non-wizard lifecycle tests

**Process:** Go file by file through `e2e/lifecycle/`, `e2e/interactive/`, and `e2e/commands/`. For each manual construction found, either replace with wizard-based setup or document why it cannot be replaced and what CLI gap it represents.

---

### Bugs

### Framework Features

#### D-41: Create `agents-inc` configuration skill

**Priority:** Medium

Create a configuration **skill** (not a sub-agent) that gives Claude deep expertise in the Agents Inc CLI's YAML config system. The skill loads into the main conversation on demand, enabling interactive config work — Claude can ask clarifying questions, propose changes, and iterate with the user.

**Why a skill instead of an agent:** Sub-agents (Task tool) are not interactive — they run autonomously and return a single result. Config tasks frequently need clarification ("Which category?", "Replace or add alongside?"). A skill in the main conversation preserves full interactivity.

**What it teaches Claude:**

- Creates and updates `metadata.yaml` files for skills (with correct domain-prefixed `category` values, author, displayName, etc.)
- Creates and updates `stacks.yaml` entries (agent definitions, skill assignments, preloaded flags)
- Updates `skills-matrix.yaml` (adding/modifying categories, skill entries, dependency rules)
- Updates `.claude-src/config.yaml` mappings (source paths, plugin settings, skill assignments)
- Knows the valid `Category` enum values (38) and enforces them
- Understands skill relationships (`requires`, `compatibleWith`, `conflictsWith`, `requiresSetup`, `providesSetupFor`)
- Validates configs against embedded schema knowledge

**User invocation:** "Use Agents Inc to register my skill" / "Use Agents Inc to add a stack" / "Use Agents Inc to validate my config"

**Implementation:**

- Create `meta-config-agents-inc` skill in the skills repo (SKILL.md + metadata.yaml)
- Category: `shared-tooling`, display name: "Agents Inc"
- SKILL.md embeds the full config knowledge base (~500-600 lines)
- No TypeScript changes required (unlike the agent design which needed schema/type updates)
- Register in `.claude-src/config.yaml` and assign to relevant agents via stacks

**Acceptance criteria:**

- [ ] Can create a valid `metadata.yaml` from a skill name and category
- [ ] Can register an existing skill interactively: read SKILL.md, ask clarifying questions, generate metadata.yaml, wire into config.yaml (replaces D-40)
- [ ] Can add a new stack to `stacks.yaml` with correct agent/category/skill structure
- [ ] Can add a new category to `skills-matrix.yaml` with proper schema
- [ ] Validates all output against schema rules (embedded knowledge)
- [ ] Refuses to use bare category names (enforces domain-prefix)
- [ ] Loads correctly via Skill tool for both users and other agents

---

#### D-138: Iterate on sub-agents — systematic improvement pass

**Priority:** Medium

All agent definitions in `src/agents/` should be reviewed and improved using the agent-summoner's Improve Mode. Each agent was written at a point in time and may not reflect current project conventions, CLAUDE.md rules, or lessons learned from the convention-keeper's findings.

**Scope:**

| Category  | Agents                                                          |
| --------- | --------------------------------------------------------------- |
| Meta      | agent-summoner, skill-summoner, codex-keeper, convention-keeper |
| Reviewer  | cli-reviewer, web-reviewer, api-reviewer                        |
| Developer | cli-developer, web-developer                                    |
| Tester    | cli-tester, web-tester                                          |
| Pattern   | web-pattern-critique, pattern-scout                             |
| Planning  | web-pm                                                          |
| Research  | web-researcher                                                  |

**For each agent:**

1. Read the current source files (`metadata.yaml`, `intro.md`, `workflow.md`, `critical-requirements.md`, `output-format.md`, `critical-reminders.md`, `examples.md`)
2. Cross-reference against CLAUDE.md NEVER/ALWAYS rules — does the agent enforce them?
3. Check `.ai-docs/agent-findings/` for findings where `reporting_agent` matches — does the agent's instructions prevent recurrence?
4. Ensure the agent includes the findings capture instruction (write to `.ai-docs/agent-findings/` when anti-patterns are discovered)
5. Use agent-summoner Improve Mode to propose and apply improvements
6. Recompile and verify

**Key improvements to look for:**

- Missing CLAUDE.md rules (e.g., git safety, type cast restrictions)
- Missing findings capture instruction
- Outdated file paths or function references
- Weak or missing self-correction triggers
- Output format gaps
- Missing domain knowledge that would prevent common mistakes

**Approach:** Do 2-3 agents per session. Start with the most-used agents (cli-developer, cli-tester, cli-reviewer).

---

### Wizard UX

#### D-62: Review default stacks: include meta/methodology/reviewing skills

Go through all default stacks and ensure they include the shared meta skills (methodology, reviewing, research, etc.) that should be part of every reasonable setup. Currently stacks only include domain-specific skills and miss the cross-cutting concerns.

**Skills to consider adding to stacks:**

- `meta-methodology-*` — investigation-requirements, anti-over-engineering, success-criteria, write-verification, improvement-protocol, context-management
- `meta-reviewing-*` — reviewing, cli-reviewing
- `meta-research-*` — research-methodology
- `security-auth-security` — where auth skills are selected

**Key files:**

- `stacks.yaml` in the skills repo (`/home/vince/dev/skills`)
- Stack definitions that feed into the wizard's stack selection step

---

#### D-64: Create CLI E2E testing skill + update `cli-framework-oclif-ink` skill

The project's E2E test infrastructure uses several CLI-specific testing libraries that have no corresponding skill. The existing `cli-framework-oclif-ink` skill also needs updating to reflect current patterns.

**New skill: CLI E2E testing with node-pty + xterm**

Consider creating a `cli-testing-node-pty` or `cli-testing-e2e` skill covering:

- **`@lydell/node-pty`** — PTY process spawning for interactive CLI tests. Allocates a pseudo-terminal so the CLI under test behaves exactly as it would in a real terminal (ANSI escape sequences, cursor movement, line editing).
- **`@xterm/headless`** — Headless terminal emulator used as a screen buffer. PTY output is piped into xterm, which processes all ANSI sequences and maintains proper screen state. `getScreen()` returns what the user would see.
- **`tree-kill`** — Kills entire process trees (not just the parent PID). Essential for cleaning up PTY processes that spawn child processes.
- **`TerminalSession` pattern** — The project's wrapper class (`e2e/helpers/terminal-session.ts`) that combines node-pty + xterm into an assertion-friendly API: `waitForText()`, `sendKey()`, `getScreen()`, `sendLine()`.
- **Non-interactive E2E pattern** — Using `execa` with `runCLI()` helper for commands that don't need interactive input. Pattern: spawn process, capture stdout/stderr, strip ANSI, assert on exit code and output.
- **E2E test structure** — `createTempDir()`/`cleanupTempDir()` lifecycle, `ensureBinaryExists()` guard, separate vitest config for E2E (`e2e/vitest.config.ts`).

**Update existing skill: `cli-framework-oclif-ink`**

The current skill covers oclif command structure and Ink component patterns but is missing:

- Testing patterns for oclif commands (unit tests with `@oclif/test`, integration tests with `runCliCommand()`)
- Ink component testing with `ink-testing-library` (render, lastFrame, stdin)
- The project's `BaseCommand` pattern (custom error handling, logging helpers, `handleError()`)
- Current conventions: `displayName` in metadata, `METADATA_KEYS` constants, `EXIT_CODES` usage

**Reference files:**

- `e2e/helpers/terminal-session.ts` — TerminalSession class
- `e2e/helpers/test-utils.ts` — runCLI, createTempDir, etc.
- `e2e/vitest.config.ts` — E2E test runner config
- `src/cli/base-command.ts` — BaseCommand pattern

---

### Testing

#### D-235: E2E gap: `buildProjectTypesExtras` new-domain/category path

When a project-scoped skill introduces a domain or category not present in global, the writer extends the `Domain` / `Category` unions in the project's `config-types.ts` accordingly. The unit tests for `buildProjectTypesExtras` silently no-op through this branch (the mock matrix doesn't include the relevant skills). No E2E asserts the behavior end-to-end.

**Scenario to drive**:

1. Global init with web-domain skills only.
2. Project edit, select an api-domain skill at project scope.
3. Assert project `.claude-src/config-types.ts` contains `export type Domain = GlobalDomain | "api"` and matching `Category` extension.

Surfaced by the 0.141.0 E2E-gap audit (2026-04-21).

---

#### D-234: E2E config inspection via `loadProjectConfig` instead of regex

Five E2E lifecycle tests hand-roll near-duplicate parsers that regex-scan / brace-match raw `config.ts` text. All target the same writer output (`generateConfigSource`) and break silently when its shape changes (e.g. D-215 reshape, Prettier on `config.ts`):

- `e2e/lifecycle/preloaded-preservation.e2e.test.ts` — `extractStack` (brace-match + `JSON.parse`)
- `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` — `extractStack` + `findAssignment` (replicated from above)
- `e2e/lifecycle/re-edit-cycles.e2e.test.ts` — `parseConfigArrays` (two-strategy regex fallback over `skills[]` / `agents[]` / `domains[]`)
- `e2e/lifecycle/dual-scope-edit-integrity.e2e.test.ts` — `extractAgentKeys` (inline regex)
- `e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts` — `parseSkillEntries` (`\{[^{}]*"id":"<skillId>"[^{}]*\}`, relies on compact `JSON.stringify` shape)

**Fix direction**: land a shared `e2e/helpers/config-reader.ts` that wraps `loadProjectConfig` (jiti-based TS eval) and exposes typed accessors — `readProjectSkills`, `readProjectStack`, `readProjectAgents`, `readProjectDomains`, or a single `readProjectConfig`. Migrate all five tests off their local parsers and delete the helpers.

Background: the CLI's jiti load already handles Prettier-formatted `config.ts` transparently at the product level; the fragility is purely test-side.

**Cross-ref**: [`.ai-docs/agent-findings/2026-04-17-shared-config-stack-parser.md`](../.ai-docs/agent-findings/2026-04-17-shared-config-stack-parser.md) — full audit + proposed standard text for `.ai-docs/standards/e2e/test-data.md`.

---

#### D-111: Stable test identifiers for active state detection

**Priority:** Medium

E2E tests currently use `STEP_TEXT` display strings (e.g., `"Choose a stack"`, `"Framework"`) to identify wizard steps. These break when labels change. More critically, there's no way to assert which tab or domain is _active_ vs merely present — tests can only check that text exists on screen.

**Goal:** Tests should be able to assert that a specific tab/domain is in the active state (e.g., "Shared domain is active" not just "Shared text is visible").

**Ruled out approaches:**

- Zero-width Unicode characters (`\u200B`) — Yoga counts them as layout characters, breaking box border alignment
- Transparent/hidden text color — terminals have no concept of transparent; `getScreen()` strips color info

**Direction to investigate:**

- Parse raw ANSI escape sequences from the PTY buffer instead of using `getScreen()`. Active items already emit distinct ANSI codes (bold + warning color). A `TerminalSession` method like `hasStyledText("Shared", { bold: true })` could check the raw stream without any UI changes.
- Alternative: xterm's buffer API may expose cell-level style attributes that survive processing.

---

---

### Bugs

#### D-90: Add Sentry tracking for unresolved matrix references

**Priority:** Medium

In `src/cli/lib/matrix/matrix-resolver.ts`, `getDiscourageReason()` (lines 213-227) and `validateSelection()` (lines 315, 342, 381, 444) use `findSkill(id)` with fallback to the raw ID when a skill referenced in `requires`, `conflictsWith`, or `providesSetupFor` doesn't exist in the matrix. This is intentionally graceful — crashing the wizard on bad matrix data is worse than degraded labels. But we need visibility into how often this happens.

Add Sentry `captureMessage` (or `captureException`) calls on every fallback path so we can track unresolved matrix references in production. Include the referencing skill ID, the missing referenced ID, and the relationship type (`requires`, `conflictsWith`, `providesSetupFor`) in the Sentry context.

**Key file:** `src/cli/lib/matrix/matrix-resolver.ts`

---

### Skill Quality

#### D-162: Skill Olympics — benchmark and optimize expressive-typescript skill

**Priority:** Medium | **Plan:** [D-162-skill-olympics/plan.md](./D-162-skill-olympics/plan.md) | **Catalog:** [D-162-skill-olympics/test-catalog.md](./D-162-skill-olympics/test-catalog.md)

Competitive arena: 100 contestants catalogued, 10 selected for proof of concept × 5 test cases from codebase anti-patterns. Score on 10-axis rubric, Frankenstein winners, then chain skills (run A→B to test post-processing combos). Phases 1-4 done (harvest, test case extraction, constraints, contestant prompts). Next: Phase 3 (arena runs).

---

## Testing Tasks

Testing guidance (coverage gaps, automated test tasks, manual procedures, quick-pass checklist) lives alongside the relevant systems — see `docs/guides/` and `.ai-docs/standards/e2e/README.md` for E2E conventions, and `todo/unit-test-tracker.md` for the unit-test gap tracker.

---

## Notes

- Test target directory: `/home/vince/dev/cv-launch`
- Source marketplace: `/home/vince/dev/skills`
- CLI under test: `/home/vince/dev/cli`

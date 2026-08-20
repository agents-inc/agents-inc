# CLI flow verification — fifth pass (2026-08-10)

The first pass driven against **published artifacts on both sides**: `agents-inc@0.153.0` installed
from npm, and the marketplace as `github:agents-inc/skills` serves it after the 2026-08-09 publish.
Every journey in
[`user-journeys.md`](../../packages/cli/.ai-docs/standards/e2e/user-journeys.md) that has a testable
subject was driven by hand.

**Nothing was fixed during this pass, by instruction.** Findings are compiled here for the owner to
work through. No git command that writes was run, and no source file in either repository was
edited.

## How the pass was run

| Element         | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Binary          | `agents-inc@0.153.0` **installed from npm**, not a local build — `agents-inc/0.153.0 wsl-x64` |
| Skills source   | the **published** `github:agents-inc/skills` — 238 skills, real network                       |
| Fixture sources | hand-built equivalents of `create-e2e-source.ts` for journeys 18/21/22 only                   |
| Claude CLI      | present, 2.1.226 — every plugin leg is a real `claude plugin install`                         |
| Config store    | loopback stand-in for `api.agentsinc.sh`, pointed at with `AGENTS_INC_API_URL`                |
| Scratch HOMEs   | ~20 under the session scratchpad; real `~/.claude` verified untouched by mtime afterwards     |
| Drivers         | one shared PTY driver (node-pty + headless xterm) so frames read as a user sees them          |
| Git             | **none** — not even read-only, beyond what the agents needed to read source for context       |

Seven agents drove disjoint journey sets in parallel, each in its own scratch HOME, each asserting
the four surfaces (compiled agents / rendered output / `config.ts` / `config-types.ts`) and, where a
journey claims a scope must not move, proving byte-identity rather than skipping it.

## Results

| #      | Journey                                              | Result                                                  |
| ------ | ---------------------------------------------------- | ------------------------------------------------------- |
| 1      | Global install from nothing, eject                   | **PASS** (4 surfaces)                                   |
| 2      | A stack installs exactly its roster                  | **PASS** on the roster — see M-2 for the distribution   |
| 3      | Project over a global install, fresh pick            | **PASS**                                                |
| 4 / 15 | Skill scope toggle, both directions, both scopes     | **PASS**, round trip byte-identical                     |
| 5      | Install-mode toggle eject↔plugin, bulk and per-skill | **PASS** (real plugin installs both ways)               |
| 6      | A second project inherits the global install         | **PASS**                                                |
| 8      | Project edit removes the `[P]` half, stays contained | **PASS**                                                |
| 9      | A stack's picks are editable                         | **PASS**                                                |
| 10     | `update` — eject-only no-op                          | **PASS**; the refresh branch also **PASSED by hand**    |
| 11     | Generated-file integrity, `doctor` clean             | **PASS** — `doctor` exits 0, 12/0/0                     |
| 12     | A different stack generates a valid config           | **PASS**                                                |
| 13     | `init --from <id>` installs a shared configuration   | **PASS**                                                |
| 13a    | `init --from` refuses on an existing install         | **PASS**, both refusal forms, nothing moved             |
| 13b    | `init --from` with global-scoped content             | **PASS**, per-scope split correct                       |
| 14     | Config deleted under a live install                  | **PASS** at both scopes                                 |
| 16     | Sub-agent scope toggle, both directions              | **PASS on scope mechanics — FAILS on the roster (M-1)** |
| 17     | Install mode at both scopes in one install           | **PASS**                                                |
| 18     | The custom-marketplace arc, stacked and stackless    | **PASS**, incl. the discriminating `search` negative    |
| 19     | Uninstall from scratch, every form                   | **PASS**                                                |
| 20     | `eject <type>` customisation survives compile        | **PASS**, templates and agent-partials, composing       |
| 21     | The marketplace-author arc                           | **PASS**; the **plugin leg also PASSED by hand**        |
| 22     | Revalidation, all four arms                          | **PASS** — unchanged arm is exactly one HEAD, no GET    |

23 journey rows driven, 23 PASS at the journey level. One journey (16) passes its stated subject but
carries a defect underneath it — M-1.

## Everything the fourth pass left open is now closed

- **F-1 (published categories the CLI's enum rejected) — FIXED.** Verified independently by four
  agents, including with the original repro (stack 1, the stack that pulls the offending skills).
  All **102** distinct `category:` values across the 238 published `metadata.yaml` files are now in
  the CLI's table; `api-database` → `api-orm` and `api-framework` → `api-api` are gone from the
  published taxonomy. `doctor` after a default install exits **0**, `12 passed, 0 warnings, 0 errors`.
- **F-2 (one unknown category silenced every operational check) — FIXED.** The operational block
  renders in full on every install shape driven. On a config-deleted install the orphan row now
  names all 23 stranded skills and all 12 stranded agents individually, `6 passed, 0 warnings,
2 errors`, exit 1 — which is journey 14's whole subject.
- **CLI-472 (`eject skills --force` from the default source, ENOENT) — FIXED.** 238 skills ejected,
  exit 0. Journey 20 no longer needs a fixture source to avoid it.
- **The `marketplace`-key observation — CONFIRMED, and now reproduced precisely.** See L-2.
- **Journey 10's blocked refresh branch and journey 21's uncovered plugin leg both succeeded by
  hand** against a real registered marketplace. They remain uncovered by E2E for the same reason as
  before (a spec needs a registered marketplace plus the Claude CLI), but the behaviour is verified.

---

# Findings

Ordered by severity. Nothing here was fixed; each entry carries a reproduction.

## ADJUDICATION — FINAL (2026-08-10, second pass, supersedes the first)

The first adjudication was itself found faulty in places, so the entire set was re-derived a
second time under a stricter method: blind inputs (raw observations only — no prior causes,
fixes or verdicts, and the earlier conclusions explicitly off-limits), mandatory doc reading in
CLAUDE.md's order before any source tracing, per-subsystem derivation, then an independent
adversarial verifier per cluster that first derived its own answers, then attacked the first
derivation and re-located every cited quote verbatim. Verdicts below are the verified finals.
Where this table contradicts anything above or in earlier revisions of this file, THIS table wins.

### Final verdicts

| ID      | Verdict                                          | Substance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1     | CONFIRMED BUG                                    | `buildEjectConfig` builds D-220's `existingStack` from the project config alone; a global agent's curation lives only in the global config's `stack` (the project emission filters to project agents), so a G→P toggle hits the seed branch and relevance rebuilds 7→4. Fix: widen the carrier — `{ ...globalConfig.stack, ...projectConfig.stack }` (project wins) before the overlay; read-only on the global config. Evidence correction: post-toggle the project config DOES carry the rebuilt stack; the stack-less file was the pre-toggle snapshot.                                                                                                      |
| M-2     | DOC CONTRADICTS CODE                             | Per-agent membership = stack-declared ∪ resolver-relevant, deliberately (owner's relevance ruling has one spelling, in `@workspace/matrix`; editor parity depends on it). Three doc sites move: `built-in-catalogue.md` invariant 2, `scope-split.md`'s legacy sentence (false — the relevance gate applies unconditionally), `agent-system.md` D-220. No code change. `cli-tester` gets 4 skills because `buildStackProperty` drops its `{}` declaration → seed branch.                                                                                                                                                                                        |
| M-3     | CONFIRMED BUG (ruled: hotkeys removed)           | The docs' own Known Gap. Execute the ruling AND gate the surviving `setInstallMode` — slot-keyed, not id-keyed, or the editable project half of a `[P][G]` pair breaks. `recordGlobalSourceMigrations` does NOT become unreachable (residual path: same-session project-half mode change + P→G collapse) — keep it, re-word its "supported flow" docstring. 33 e2e spec files drive modes through `setAllLocal()`/`setAllPlugin()` page objects and must be re-driven; `install-mode-bulk`, `project-edit-global-source-switch-divergence`, `scope-aware-local-copy` retire or re-scope.                                                                        |
| M-4     | NOT A BUG (assignment); signal is owner-optional | The scope filter is documented and spec-pinned; refusing would outlaw a documented state. Observation correction: at global scope the control skill reached ALL FIVE agents (3 preloaded + 2 lazy on pm/reviewer), not 3 — the pass counted only preloaded rows. Optional warning belongs in init/edit after `buildStackForSelection`, in `warnUnresolvedStackSkills`' reporting class.                                                                                                                                                                                                                                                                         |
| M-8     | NOT A BUG — enforced at four layers              | Generator scope filter, split+writer filter, compile-time D7 net, and the seed decode THROW (loud, names every pair). No path compiles a project skill into a global agent. Silent-drop residue: a hand-edited illegal `config.ts` row persists unreported (compile never rewrites config) — optional compile-time warning beside `warnUnresolvedStackSkills`.                                                                                                                                                                                                                                                                                                  |
| M-5     | CONFIRMED BUG                                    | `countInstalledSkills`' plugin branch discards the `scopes` list it receives; `getEnabledPluginKeys` reads one settings.json. Fix in lib: merge `discoverAllPluginSkills(installBaseDir(projectDir, scope))` maps across the existing scopes list — map-merge, not numeric sum (dual-scope dedupe) — then update `plugin-system.md`'s count row.                                                                                                                                                                                                                                                                                                                |
| M-6     | CONFIRMED BUG (ruled: CLI-470 leg 1)             | Preview emits the agents item on `hasLocalAgents` (bare directory existence) while the executor keys on `configuredAgents`. Fix: gate the item on `target.configuredAgents.length > 0` — agents then drop out of the plan exactly as plugins already do; update the removal-plan table in `commands/index.md`.                                                                                                                                                                                                                                                                                                                                                  |
| M-7     | CONFIRMED BUG                                    | `reportSuccess` hardcodes the project config path and a project-cwd `compile` step; for a global install the named file carries no `stack` and that compile pass recompiles nothing global. Fix: scope-aware closing block keyed off the `agentScopeMap` it already receives, reusing `globalScopedAgentsHint`'s phrasing; keep the pinned `Configuration:` label.                                                                                                                                                                                                                                                                                              |
| L-1     | CONFIRMED BUG (wider than first found)           | Field order is object-insertion order with three disagreeing producers (wizard literal, Zod-canonicalized load, tail-appending merges). TWO writers churn: `generateStandaloneConfig` (Object.entries) AND `generateProjectConfigWithInlinedGlobal` (two sequential scalar blocks; keys migrate between blocks across load/re-emit). The project half bypasses `writeIfChanged` entirely (`propagate.ts` writes unconditionally — the doc overstates). Fix: canonicalize in `cleanForEmission` (loader-schema order) AND emit the inlined writer's merged scalar union as one canonical sequence. One-time rewrite per file, then a fixed point.                |
| L-2     | NOT A BUG                                        | Fill-only source identity; the fill is load-bearing (it feeds `resolveEffectiveGlobalConfig`'s `changed`) and uninstall's `<id>@<marketplace>` registry keys depend on it. Never removed, by contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| L-3     | NOT A BUG                                        | Always-verbose is documented and the zero-flag surface is pinned. Extraction runs twice by construction (matrix membership vs on-disk presence — different questions). Residue worth a wording pass: `loadProjectConfigFromDir` announces the GLOBAL config as "project config"; make its two verbose lines scope-aware like `loadSourceConfig`'s.                                                                                                                                                                                                                                                                                                              |
| L-4     | NOT A BUG                                        | `absent → fail`, exit 1, is documented AND pinned; a clean uninstall is deliberately indistinguishable from never-installed; the "Nothing is configured yet" tip belongs to the declares-nothing state (config exists, loads, empty — exit 0), also pinned. No residual question.                                                                                                                                                                                                                                                                                                                                                                               |
| L-5     | NOT A BUG                                        | Two documented populations, both correct: content row counts files on disk (10 — the tombstoned agent's global file legitimately stays), operational row counts active config rows (9/9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L-6     | CONFIRMED BUG (message only)                     | The resolution is documented (a stored caller may pass `flag`); the sentence is false. Reword the flag-branch verbose in `resolveSource` to origin-neutral ("Source named by this run"); also the hardcoded "--source" label in `assertNamedSourceUsable`. Wording must stay true for init, where it IS the flag.                                                                                                                                                                                                                                                                                                                                               |
| L-7     | CONFIRMED BUG (wider)                            | THREE throw paths inside `Edit.loadContext` fire under the mounted spinner (detectProject null; loadSource catch; discoverAllPluginSkills catch), and `Init.selectionFromWizard` has the identical structure. Fix: try/finally around the awaited load in BOTH commands — a `finally`, not a catch, so oclif's error rendering and pinned exit codes are untouched.                                                                                                                                                                                                                                                                                             |
| L-8     | NOT A BUG                                        | Both sides documented AND both pinned — the dashboard Ctrl-C spec asserts SUCCESS plus a byte-identical tree. The dashboard's `null` also carries the non-TTY path. Recommendation: keep; at most state the contrast in `commands/index.md`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L-10    | CONFIRMED BUG                                    | The →Eject arm consumes nothing of `MigrationResult.ejectedSkills` (returned, never read). Minimal fix: log the count in `Edit.applyMigrations` reusing the file's own `Copied N local skill(s)` wording — count-only or scope-split; a destination-bearing line hardcoding `.claude/skills/` misnames the global direction.                                                                                                                                                                                                                                                                                                                                    |
| L-12    | NOT A BUG                                        | Blank pair + `never` unions documented (three cites). The empty `~/.claude/agents/`: produced by `writeCompiledAgentsByScope`'s unconditional `ensureDir(globalAgentsDir)` reached by the PROJECT pass — the recompiler's own ensureDir sits below its zero-agent early return and never fires (first adjudication's mechanism disproven). Optional lazy-ensureDir folds into L-21's ruling.                                                                                                                                                                                                                                                                    |
| L-13    | CONFIRMED BUG                                    | `ID` column renders displayName; `Source` prints the hardcoded constant for every row including local skills; the Better Auth hits are documented description matching; `commands/index.md`'s "primary + extras" line is stale. Fix in `search.ts` + one doc line.                                                                                                                                                                                                                                                                                                                                                                                              |
| L-14    | NOT A BUG (ruled: remove `I` on Stack)           | Implementation: flip `isInfoPanelAvailable` (hotkeys.ts) to exclude `"stack"` — both call sites follow by construction; leave the CLOSE path ungated (documented); flip the `["stack", true]` row in `hotkeys.test.ts`; re-word four doc statements.                                                                                                                                                                                                                                                                                                                                                                                                            |
| L-15    | CONFIRMED BUG                                    | `loadEffectiveSourceConfig` labels the home config's origin `"project"` (it never checks `isHomeDirectory`). Fix there: home root → global leg, origin `"global"`. Do NOT key on installation scope — a compile e2e pins `Source: project` for a project cwd.                                                                                                                                                                                                                                                                                                                                                                                                   |
| L-16    | CONFIRMED BUG (same root as L-17)                | The announcement fires per `fetchFromSource` call while the verdict is memoised per run — two loads (matrix + marketplace label) print the line twice. Fixed by L-17's seed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| L-17    | CONFIRMED BUG                                    | Cold (5 requests), unchanged (1 HEAD), unreachable (0) all COMPLY with the documented contract. Only the changed arm violates it: the memoised stale `superseded` verdict makes load 2 discard and re-download what load 1 just fetched — for `github:` sources a full duplicate tarball download (`clearGigetCache` deletes the fresh tarball). Fix: after `recordFetchedCopy`, seed `askedThisRun` to `current` — the copy is current by construction; thread the unreachable warn into the memoised classification. Changed arm 8→5 requests, cold 5→4. The suite exercises only the `current` arm twice — add a two-call superseded spec.                   |
| L-18    | NOT A BUG                                        | `DEFAULT_SCRATCH_DOMAINS` scratch preparation, documented and unit-pinned; intersecting with the source's domains is an owner decision (and could preselect nothing).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L-19    | CONFIRMED BUG — fix goes THROUGH the manifest    | The intended behaviour is already recorded as `it.fails("carries a category on every plugin entry")` ("metadata.yaml DOES carry a category; it is simply dropped on the way through"). Fix: add optional `category` to `pluginManifestObjectSchema` (one change covers the lenient loader AND the `.strict()` validator derived from it) → thread through `generateSkillPluginManifest` → copy in `convertManifestToMarketplacePlugin`. Flips the it.fails green; update the all-uncategorized pin and `plugin-system.md`. (The first adjudication's "never plugin.json" was wrong — extending the schema is exactly how the strict validator stays satisfied.) |
| L-20    | NOT A BUG                                        | The "Loaded agent … from …" verbose belongs to the matrix's `agentDefinedDomains` pass, not compile input; compiled agents deliberately use CLI definitions/partials. The wrong text is `load-agent-defs.ts`'s own JSDoc ("source overrides CLI" — it hardcodes `undefined`). `config.ts` receives source agent NAMES only; the real residue is an init-vs-edit asymmetry in which agent definitions feed config-types (init's write + background loader see CLI∪source; edit's write + compile's refresh see CLI-only) — owner call whether to align.                                                                                                          |
| L-21    | NEEDS OWNER RULING                               | Docs are silent on edit-path directory lifecycle; uninstall already prunes empty dirs (`removeDirIfEmpty` over skills, agents, `.claude-src/`, `.claude/` — only the `.claude-src/` half documented). No surface misreads the empty dirs. If pruning is wanted: reuse uninstall's helper at the two edit-path removal sites, testing true filesystem emptiness (never roster emptiness — hand-authored agents live there).                                                                                                                                                                                                                                      |
| L-22    | NEEDS OWNER RULING                               | (a) the write is documented; (b) the silence folds into M-7's reporting fix; (c) `name: "agents-inc"` is seeded by `buildEjectConfig` via `DEFAULT_PLUGIN_NAME` on EVERY wizard path — while eject passes `path.basename(projectDir)` and the loader repairs missing names the same way. `local-installer.test.ts` PINS the current name (the earlier "no spec pins it" was wrong). If the project's name is intended: change the seed, update those pins, don't touch `CompileConfig.name` or `resolveProjectName`.                                                                                                                                            |
| L-23    | NEEDS OWNER RULING (was: confirmed bug)          | No ordering contract exists in any doc: stack category-key order is the wizard session's selection order; the `1 agents rewritten` is the documented honest byte-compare doing its job on genuinely moved bytes. If determinism is ruled in: canonical category order inside `buildAgentStack`/`buildStackForSelection` (matrix declaration order), leaving the propagation path order-preserving — with a one-time rewrite of every installed config and compiled agent.                                                                                                                                                                                       |
| L-24    | NOT A BUG                                        | The two-row `+`/`•` rendering is the documented dual-scope diff shape (slot-occupancy contract); within-section order is unspecified and falls out of a concatenation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| L-25    | NOT A BUG                                        | Both styles documented, the divergence itself explicitly called out in `component-patterns.md`; both pinned by specs. Doc nit: `scope-system.md` calls the grid badge `[G]`/`[P]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Info ×4 | NOT A BUG                                        | `update`'s delegate command (journeys doc text moves); plugin cache survival (registry is truth; do not prune another tool's tree); client-side ETag compare (documented symmetry with giget; a 304-without-ETag would hit the wrong branch); oclif article.                                                                                                                                                                                                                                                                                                                                                                                                    |

### What changed against the FIRST adjudication (the honest diff)

1. **L-23 downgraded** confirmed-bug → owner ruling: no determinism contract exists; the rewrite is honest byte-comparison.
2. **L-8 downgraded** needs-ruling → documented intent: the dashboard Ctrl-C exit 0 is directly spec-pinned (byte-identical tree asserted), which the first round missed.
3. **L-19's fix reversed**: category goes THROUGH `plugin.json` by extending the schema — the first round's "never plugin.json" missed both that the strict validator derives from the extendable object schema and the `it.fails` spec already recording the intended behaviour.
4. **L-1's fix was incomplete**: a second writer (the inlined-global one, via its two scalar blocks) also churns, and the project half never goes through `writeIfChanged` at all.
5. **M-3's dead-code claim was wrong**: `recordGlobalSourceMigrations` keeps a residual reachable path; and the `setInstallMode` gate must be slot-keyed. The 33-spec e2e re-drive burden was previously missed.
6. **L-20 rewritten**: the wrong doc is `load-agent-defs.ts`'s JSDoc (not `agent-system.md`'s diagram), and "source agents reach the writers but not the compiler" narrows to an init-vs-edit config-types asymmetry; `config.ts` gets names only.
7. **L-21 upgraded** not-a-bug → owner ruling: the docs are silent, and uninstall's own empty-dir pruning is precedent FOR the cleanup the first round rejected.
8. **M-4's control observation corrected**: the global-scope control assigned the skill to all five agents (3 preloaded + 2 lazy), not three — the pass under-counted.
9. **M-1's evidence corrected**: the post-toggle project config DOES carry a (rebuilt) `stack` const; plus `L-12`'s empty-dir mechanism was disproven and reattributed, and `L-22`'s "no spec pins the name" was false.

### Claims from the first adjudication carried but NOT re-verified this round

- `eject` writing project configs through the standalone writer (byte-identity implications) — plausible, unadjudicated.
- `isEjectOutput`'s second disjunct being unreachable dead code — plausible, unadjudicated.
- The hardcoded scope-toggle toast string bypassing the constants rule — trivially checkable when touched.

### Owner rulings — 2026-08-10, second batch (after the final adjudication)

- **L-23 — RULED: make the ordering deterministic, always.** Canonical category order lands in
  `buildAgentStack`/`buildStackForSelection`; the one-time rewrite of every installed config and
  compiled agent is accepted. Filed with L-1 as **CLI-478** (one determinism task, two layers).
- **L-1 — RULED: fix as adjudicated.** Both writers canonicalized; part of **CLI-478**.
- **L-8 — CLOSED.** Documented intent, both sides spec-pinned; no change.
- **M-3 — RULED: proceed as adjudicated, bulk hotkeys removed** (re-confirmed) plus the
  slot-keyed `setInstallMode` gate. Filed as **CLI-479**.
- **L-21 — RULED: prune the emptied directories.** When `.claude/skills/` or `.claude/agents/`
  holds no skills/sub-agents after removal, the folder goes — filesystem emptiness, never roster
  emptiness (hand-authored agents keep the directory alive). L-12's lazy-`ensureDir` folds in.
  Filed as **CLI-480**.
- **L-22(a) — RULED (owner, 2026-08-10): keep the project-pair write on global-only installs.**
  Owner's reasoning, recorded: a user who installs from a project and sets everything global might
  not know to look at the home directory — the project pair is the breadcrumb, linking to the
  global install through its imported global config and types. Closed; only the M-7 reporting fix
  (naming the right file in init's closing block) remains in this area. L-22(c) — RULED (owner, 2026-08-10): use the
  project's own name. Seed `path.basename(projectDir)` in `buildEjectConfig`, aligning all three
  naming paths. Filed as **CLI-482** (with the HOME-leg caveat recorded in the row).
- **L-19/CLI-481 — RULED (owner, 2026-08-10): implement through plugin.json and verify live.**
- **L-19 — owner question answered, fix filed as CLI-481.** `plugin.json` is NOT generated by
  Claude: our own `build plugins` writes it into the marketplace repo's committed `dist/plugins/**`,
  and Claude only clones/consumes it on install and update — nothing on the user's machine ever
  regenerates it, so the change persists. The one genuine risk is the inverse: whether Claude's
  loader tolerates the extra key in `plugin.json`. The task carries a mandatory hand-run (real
  `claude plugin install` of a category-carrying plugin) and a fallback (category into
  `marketplace.json` entries only, read from source metadata at `build marketplace` time).

### What actually needs code (final)

M-1 (stack carrier merge), M-3 (hotkey removal + slot-keyed gate + e2e re-drive), M-5 (per-scope
plugin count), M-6 leg 1 (preview predicate), M-7 (scope-aware closing block), L-1 (two-writer
canonical emission), L-6 (two message rewords), L-7 (try/finally in edit AND init), L-10 (eject
outcome line), L-13 (search columns + doc line), L-15 (home-root origin leg), L-17 (+L-16, memo
seed + warn placement + new spec), L-19 (category through the manifest). Doc-only: M-2 (three
sites), L-3 residue, L-20 (JSDoc), L-25 nit, journeys-doc update text. Owner rulings open: L-21,
L-22(c) and (a), L-23, M-4/M-8's optional warnings, L-20's config-types asymmetry.

## Medium — behaviour worth deciding on

### M-1 — Toggling a sub-agent to project scope silently truncates its skill catalogue

Moving an agent global→project recompiles it from the **project** `config.ts`, which is written
**without the `stack` curation record**. The project build falls back to default category assignment
and the agent loses catalogue skills it had at global scope. `web-researcher` went from 7 available
skills to 4 — losing `cli-framework-oclif-ink`, `meta-design-expressive-typescript`,
`meta-reviewing-reviewing`. The preloaded `skills:` frontmatter is identical either side, so nothing
on screen hints at it; `doctor` stays 12/0/0; `compile` at either scope does not heal it. Because
project agents take precedence over global ones, the project's effective agent can no longer reach
three skills it could reach before the toggle.

Contributing cause (observed): the global `config.ts` carries a `stack` const with the
per-agent/per-category assignment; the project `config.ts` written by `edit` has no `stack` const at
all.

### M-2 — A stack's per-agent assignment is re-derived rather than honoured

Roster **totals** are exact — journey 2 passes, the installed set equals the stack's declaration in
both directions — but the distribution across agents is not what the stack declares. Stack 1:
`cli-tester` declares `{}` and receives 4 skills; `web-tester` declares 3 and receives 13; `reviewer`
14 → 23; `pm` 16 → 21. Five of twelve agents match exactly. The same shape appears on the T3 stack.
Divergence is purely additive and the compiled files match the written config, so the install is
self-consistent — the mismatch is against the stack's own declaration. `default-stacks.ts` says
"A stack declares WHICH skills each sub-agent gets", while `config-generator.ts`'s
`shouldIncludeTriple` short-circuits on `newlyAddedSkillIds.has(skillId)` — on a from-scratch install
every skill is newly added, so the relevance derivation wins and the stack overlay contributes only
`preloaded` flags. Either the sentence or the seeding rule is wrong.

**M-1 and M-2 are the same area** — who owns the per-agent assignment, the stack record or the
derivation — and are probably one decision.

### M-3 — The Sources bulk hotkeys override the lock on inherited global rows

In a project edit, global skills render as 🔒, dimmed, non-focusable rows; focus provably never
lands on them, so the per-row toggle cannot reach them by design. The bulk hotkeys `P` / `L` ignore
that: pressing `p` flipped a locked global row to Plugin, ran a real `claude plugin install`, wrote
`"source": "agents-inc"` into the **global** `config.ts` and added `enabledPlugins` to the scratch
`~/.claude/settings.json`. Either the bulk keys should skip inert rows or the lock is not a lock.
Note the tension: this is currently the only route by which journey 17 (both scopes in one install)
is reachable, so tightening it redefines that journey.

### M-4 — A project-scoped skill picked alongside only global agents is assigned to nothing

It copies to `<project>/.claude/skills/` correctly, but appears in no `stack` block in either config
and in no agent's frontmatter — `0 agents rewritten`. `doctor` reports `Skills Resolved 2/2`,
`12 passed`. The same skill at global scope alongside global agents is assigned to three of them.
Either the assignment should happen or something should say the skill will never be loaded.

### M-5 — `list` reports `Skills: 0` for a plugin install run from a project directory

Same install, run from the home directory, reports `Skills: 7`; `doctor` in the project cwd says
`Plugins Installed ✓ 7/7`; `config.ts` lists seven.

**Cause (corrected 2026-08-10 after owner review — the first reading was wrong).** Plugins are not
user-scoped; Claude installs them at either `user` or `project` scope, and this pass observed both
(a global skill lands `scope: "user"` in `~/.claude/settings.json`, a project skill lands
`scope: "project"` with a `projectPath` in `<project>/.claude/settings.json`). The defect is that
`getEnabledPluginKeys(projectDir)` reads exactly ONE settings file — the one under the directory it
is given — so `countPluginSkills(installation.projectDir)` sees only the scope the cwd happens to
match. From a project it misses user-scoped installs; from home it would miss project-scoped ones.

The correct rule is scope inheritance, and it is already implemented twice elsewhere:
`multi-source-loader.ts` calls `discoverAllPluginSkills` for the project and again for `homeDir` and
merges, and `discover-skills.ts` merges the global set in unless `isGlobalProject`. `list` is the
one consumer that does not. Because the loader and compile paths already merge, the skills always
resolved correctly — this is a display defect, not a resolution one.

### M-6 — The uninstall preview promises to remove compiled agents it then leaves

With an unparseable `config.ts`, the plan prints `…/.claude/agents/ (CLI-compiled)` under "The
following will be removed:", then leaves all twelve files byte-identical. The summary afterwards is
honest about the degradation; the plan — the thing the user reads before pressing `y` — is not.

### M-7 — `init`'s closing line points at the wrong `config.ts`

On a global install run from a project directory, the summary ends `Configuration:
<project>/.claude-src/config.ts` and `To customize agent-skill assignments: 1. Edit
.claude-src/config.ts`. The project config has no `stack` key at all — assignments live only in the
global config. `list` names the global config for the same install, so two commands disagree.

## Low — drift, churn and honesty gaps

- **L-1 — `config.ts` is not byte-stable across writers.** Found independently by four agents.
  `init`, `edit`, the project-registration writer and `compile` serialise `export default` keys in
  different orders, so an unrelated later command rewrites a file the user is invited to hand-edit —
  including a `compile` that reports `0 rewritten`. Values never change; it is pure key order. It
  defeats byte-identity assertions and produces spurious VCS diffs on a checked-in config.
- **L-2 — a project-scope plugin switch writes `"marketplace"` into the global `config.ts`, and no
  reverse switch removes it.** Now reproduced exactly: toggling only the _project_-scoped skill to
  Plugin appended `"marketplace": "agents-inc"` to the global config; returning both skills to eject
  left the key in place. Behaviourally harmless today (`list` still prints `Mode: Eject`, `doctor`
  12/12) — drift in a user-editable file rather than a misreport.
- **L-3 — `doctor` prints its full verbose trace unconditionally.** Reported by three agents.
  `setVerbose(true)` is called with no flag guard, so ~90 lines of `Extracted local skill:` /
  `Added local skill:` separate the section headers from the twelve check rows. The extraction pass
  also appears to run twice, and the global config is announced as `Loaded project config from …`.
- **L-4 — `doctor` calls a cleanly uninstalled directory a failure.** Straight after a successful
  `uninstall --yes`: exit 1, `Config Valid ✗ .claude-src/config.ts not found`.
  `STEP_TEXT.DOCTOR_TIP_NOTHING_CONFIGURED` exists and looks like the intended verdict for this
  shape, but is not what this state produces.
- **L-5 — `doctor` counts excluded tombstones as validated agents:** `Agents ✓ 10 agents validated`
  beside `Agents Compiled ✓ 9/9`. Nine agents exist.
- **L-6 — `doctor` prints `Source from --source flag: <path>`** though `doctor` has no `--source`
  flag; an internal caller re-passes the resolved source as `flag` into `resolveSource`.
- **L-7 — `edit` renders a wizard frame and leaves a frozen spinner under its own error.** Exit 1 is
  right, but the final frame is `Error: No installation found.` followed by `⠋ Loading skills...`,
  contrary to "the refusal lands before the wizard mounts".
- **L-8 — Ctrl-C on the `init` dashboard exits 0; Ctrl-C in the `init` wizard exits 4.** Abandoning
  the dashboard is indistinguishable from success to anything reading the exit code.
- **L-9 — WITHDRAWN (owner, 2026-08-10: "this is fine").** A skill added during an edit defaults to
  Plugin even in an all-eject install. Plugin is the product default and the row is visible on the
  Sources step — it is the one row without the `⏏` glyph — so the user sees the default and can
  change it before confirming. Not a defect; no change.
- **L-10 — the eject direction of a mode switch narrates nothing about disk.** `→ Plugin` prints
  installs per skill; `→ Eject` prints only the switch line, though copies and uninstalls happen.
- **L-11 — WITHDRAWN as written (owner, 2026-08-10).** The claim "never reports where the ejected
  copies landed" overstated it: `config.ts` records every ejected skill with `source: "eject"` and
  its `scope`, and the scope determines the directory, which `list` also prints outright. Nothing is
  lost. What remains is a consistency nit, not an information gap — an eject-only install ends with
  a `Skills copied to: <path>` block and a mixed one does not, because `reportSuccess`'s
  `isEjectOutput` excludes a mixed install whose plugin half succeeded. No action unless the
  asymmetry itself is worth closing.
- **L-12 — a wholly project-scoped `init --from` still materialises a global installation**:
  `~/.claude-src/config.ts` with empty arrays, an empty `~/.claude/agents/`, and a full
  `config-types.ts` whose unions are all `never`. The `projects` registry write is intended; the
  empty directory and the `never`-union types file are the questionable parts.
- **L-13 — `search`'s `ID` column renders the display name.** Two agents. `search visual` prints
  `Visual Regression` under `ID`; rows show an id or a title depending on whether `displayName`
  happens to equal the id. Related: `search drizzle` and `search hono` both return `Better Auth`,
  which reads as a false positive unless you know the match runs over requirements too.
- **L-14 — RULED (owner, 2026-08-10): drop the `I` hotkey from the Stack step entirely.** The
  overlay renders `Marketplace Agents Inc` / `Stack none` and ~24 blank lines because at that point
  nothing is installed yet — there is no state for it to describe, so the panel is empty by
  construction rather than by defect. Fix: do not offer `I` on the Stack step — remove the footer
  hint and make the key inert there, rather than populating the panel. Check whether
  `reference/features/wizard-flow.md` documents the info overlay as available on every step; if so
  that line moves with the change.
- **L-15 — scope wording contradicts itself in the global context.** `edit` at `cwd = $HOME` prints
  `Loaded 238 skills (project)` while `s` on the same screen answers `Scope toggle unavailable in
global context`; `compile` from HOME opens `Source: project` then `Compiling global agents...`.
- **L-16 — duplicated user-facing lines on remote loads:** `Marketplace has newer content — fetching
the update...` and `Could not reach <url> — using the cached copy…` each printed twice.
- **L-17 — a cold or changed remote load revalidates repeatedly within one command** (5 requests
  cold, 8 after the source moved). Steady state is correct — the unchanged arm is exactly one HEAD
  and no GET — so the redundancy only costs on paths that already pay for a download.
- **L-18 — a stackless custom source preselects domains it ships nothing for**, leaving tabs that
  render `No categories to display.`
- **L-19 — `build marketplace` reports every plugin as `uncategorized`** though every source
  `metadata.yaml` names a category.
- **L-20 — a custom source's own agent definitions never reach the compiled agent.** `compile
--verbose` reports loading them; the compiled file carries the CLI's own. `loadMergedAgents` says
  "source definitions take precedence on name collisions"; `eject --help` says partials always come
  from the CLI. Behaviour follows the second — the docs contradict each other.
- **L-21 — collapsing the last project-scoped item leaves empty `.claude/skills/` and
  `.claude/agents/` directories**, so a fully collapsed project still looks like it owns content.
- **L-22 — a purely global install writes a project `config.ts` / `config-types.ts` into the cwd**
  (restating the global content with `scope: "global"` and no `stack`), which the wizard never
  mentions — and which is what makes M-7 reachable. Its `name` is the hardcoded `"agents-inc"`.
- **L-23 — collapsing a `[P][G]` pair rewrites an agent whose roster did not change** (`1 agents
rewritten`), because the surviving skill's key moves inside the project's `stack` map. The
  addition of the same skill rewrote nothing.
- **L-24 — the confirm summary lists a dual-scope agent in both columns**, appended after the sorted
  global list, so "still under Global" reads as "unchanged globally" when the project has masked it.
- **L-25 — scope markers render in two styles** — bare `│ P G React │` in the skills grid,
  bracketed `[P][G]` in the agents list, in adjacent steps of one wizard.

## Informational — no action implied

- `update` delegates to **`claude plugin marketplace update <name>`** (once per distinct marketplace,
  after a `claude --version` availability probe), not `claude plugin update`. The journey text says
  the latter; the doc should follow the binary.
- `init --from` into a second project rewrites the first project's generated pair — inspection shows
  correct propagation with correct tombstoning, and the compiled agent is unchanged. Recorded because
  a byte-identity check on a _bystander_ project would fail here by design.
- `~/.claude/plugins/cache/<marketplace>/<skill-id>/` survives an uninstall while
  `installed_plugins.json` and `enabledPlugins` are cleaned correctly — Claude CLI cache behaviour,
  not a CLI write.
- The revalidation HEAD does not send `If-None-Match`; the CLI compares the returned ETag
  client-side, so a server's 304 branch never fires. The contract the journey names still holds.
- `agents-inc update <arg>` → `is not a agents-inc command` ("a" → "an"), from oclif's not-found
  handler rather than the CLI's own messages.

## Suggested order for working through these

1. **One decision covering M-1 + M-2** — does the stack record own per-agent assignment, or does the
   derivation? Everything else in that area follows from it, including whether a project config
   should carry a `stack` const.
2. **M-3** — the lock, because it lets a project run mutate the global install.
3. **M-5, M-6, M-7** — three honesty defects in what commands report; each is small and independent.
4. **M-4** — decide whether it installs, assigns or refuses.
5. **L-1** — a canonical key order in one serializer; it would retire four agents' worth of noise
   and make byte-identity assertions meaningful again.
6. **L-3, L-4, L-5, L-6** — `doctor`'s output, as one pass.
7. The rest as cosmetic cleanup.

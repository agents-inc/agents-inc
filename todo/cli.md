# CLI — outstanding work

Everything still to do in `packages/cli`. Consolidated 2026-08-04 from `packages/cli/todo/TODO.md`,
`TODO-deferred.md`, `TODO-refactor.md`, `refactor-expressive-ts.md`, `active-bug-investigation.md`,
`packages/cli/e2e/TODO-E2E.md`, `docs/web/subagents-todo.md` and the CLI half of
`docs/web/cli-integration.md`, plus gaps recorded in `packages/cli/.ai-docs/DOCUMENTATION_MAP.md`
and three unreferenced `agent-findings`.

## Conventions

- **Table entries are one-liners.** Each row is a short headline (≤ ~110 characters) plus an optional
  `[Plan](./plans/<file>.md)` link. Long descriptions break the table — wide rows wrap unpredictably
  and destroy the scan-readability that is the whole point of the table.
- **Detailed context lives below the table**, under `## Active Tasks` → theme sub-heading →
  `#### <ID>: <headline>` — repro, root cause, fix direction, file list. If a task needs more than a
  headline, put the detail there.
- **If a task needs its own file** (large plan, multi-phase, lots of investigation), create
  `todo/plans/<ID>-<slug>.md` and link it from the table. Otherwise inline detail is fine.
- **Never add a long description directly to the table row.** It is the single most common convention
  violation and it makes the table unusable.
- **Delete on land, do not tick off.** An item is removed from this file when it ships. A checked box
  is not a record; the changelog and git history are.

## IDs

- **Existing `D-NNN` items keep their IDs unchanged.** They are referenced in 223 changelog files,
  throughout `.ai-docs`, in 160 agent findings, in commit messages and in test comments. Renaming
  breaks all of that.
- **New items get `CLI-NNN`, continuing the same sequence.** The highest `D-NNN` was D-310, so new
  numbering starts at CLI-311. One sequence, two prefixes, no collisions.
- Items that arrived here from a retired scheme (`UX-NN`, `P4-NN`, `R-NN`, `#N`, `Bug N`) record their
  old identifier in the row, so existing references still resolve.

---

## Bugs

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Status        | Type     | Complexity |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| D-307   | Wizard root `useInput` steals `s` from the add-source text input — overlay gated off behind a flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Ready for Dev | bug      | easy       |
| D-266   | Shared scroll gates disable clipping below `MIN_VIEWPORT_ROWS`, so steps bleed at short terminal heights.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev | bug      | complex    |
| D-214   | RESCOPED 2026-08-16 by a verification pass — the FRAMING is dead, the engineering content mostly is not. `new marketplace` was DELETED in `95738763`, not flag-gated: the command, its 14 e2e specs, its 401-line unit spec and `feature-flags.ts` are all gone, so the row's whole "Re-enabling" section is inoperable and CLI-454 is a from-scratch re-add. Of 22 items: 15 LIVE, 3 fixed (5, 12, 15), 2 moot (6 — the extras axis was withdrawn with CLI-450; 8 — superseded by CLI-412), 1 a TRAP (11 — `schemas.ts` carries an explicit "do not add the superRefine without an explicit decision" tripwire, so the obvious dedup reverses a recorded ruling) and 1 FACTUALLY WRONG (14b — `agentDefinedDomains` is NOT dead; `step-agents.tsx` reads it, and deleting it typechecks but breaks the agent domain tab at runtime). D-214 never gated the scaffold — its own text says the scaffold works and the concern is the consumer — so it was a CONFIDENCE prereq, and that confidence now has coverage it lacked: `marketplace-author-arc` and `custom-marketplace-arc` both walk author→consumer. **SPLIT: items 2, 3, 4, 7 are the genuine CLI-454 prerequisite (~1 day, leg 1); the remaining ~14 are general matrix hygiene and move to Track B.** Items 1 and 2 taken in hand 2026-08-16. Item 4 needs a ruling reconciled with CLI-471's deliberate asymmetry (a source's OWN rules are never narrowed); item 7 changes `mergeMatrixWithSkills`'s signature; item 3's local-slug shadowing overlaps CLI-498's namespace ruling and must be decided with it. SLEEPER: item 10 — `config-types-writer` loads with `skipExtraSources: true`, skipping the tagging pass, so the singleton it leaves has skills with no `activeSource`, which `search.ts` THROWS on; reordering the two `initializeMatrix` calls can surface that as a crash in an unrelated command. | Ready for Dev | bug      | medium     |
| D-212   | INSTALL-PIPELINE HALF LANDED 2026-08-17 with CLI-407/408/409 — the journey works end to end: a hand-written custom skill installs through `edit` in 3.6s where it previously hung 68s and aborted with marketplace advice impossible for a locally-created skill. WHAT REMAINS IS MOOT AS WRITTEN and needs re-scoping, not carrying: every leftover item — the misleading closing message, the `--install` flag, `cc list`'s "scaffolded but unconfigured" section — names `src/cli/commands/new/skill.ts`, deleted in `95738763`. Re-scope onto the editor intake (leg 2's EDITOR rows) or retire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | bug      | complex    |
| CLI-534 | **Two commands print text that is wrong, one of them naming a command that does not exist** (found 2026-08-18 by the commands doc re-derivation, which re-derived from source rather than reading the page). (1) `compile`'s no-skills refusal reads `No skills found. Add skills with '<bin> add <skill>' or create in .claude/skills/.` — **there is no `add` command**; `agents-inc add react` prints _"add react is not a agents-inc command"_. A refusal that tells the user to run something that exits 127 is worse than one that just says no. (2) `eject`'s `--output` flag `description` says `"Output directory (default: .claude/ in current directory)"` but `resolveOutputBase` returns `.claude-src/`, and `eject skills` ignores that base entirely unless `--output` is given, writing `LOCAL_SKILLS_PATH` (`.claude/skills`) — three eject types, three destinations, and `.claude/` is not the default of any of them. The doc had faithfully reproduced the flag's own stale description, which is how it spread                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | bug      | easy       |
| CLI-535 | **`declarationOf` walks only top-level statements, so a `static` class member is unreachable and NO command's flag list is registerable.** This is the last of the five gaps the row originally carried; the other four landed 2026-08-19 and are recorded in `archive.md`. **Reproduced 2026-08-19** by probing the checker directly: a registry row of `{ file: "src/cli/commands/eject.ts", symbol: "flags" }` throws `names a symbol its source file does not export — flags`, and the same for `symbol: "args"`; `declarationOf` iterates `file.statements` and matches only `ts.isTypeAliasDeclaration` and `ts.isVariableStatement`, and the whole script contains no `isClassDeclaration`, `isPropertyDeclaration` or `StaticKeyword`. Two halves are needed and only one is code: a class-member path in `declarationOf` (or a new source shape), **and a document table for it to bind to** — no command's flags are enumerated anywhere in `.ai-docs/` today, so building the reader alone would land a mechanism with no customer. `edit`'s computed flag key is a separate complication and is not the blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ready for Dev | feature  | small      |
| CLI-536 | Twelve exported types under `src/cli/types/` appear in none of the three type documents: `AgentHookAction`, `AgentFrontmatter`, `RelationshipDefinitions`, `SkillRulesConfig`, `SkillRelation`, `SkillRequirement`, `SkillAlternative`, `PluginAuthor`, `MarketplaceRemoteSource`, `MarketplaceOwner`, `MarketplaceMetadata`, `MarketplaceFetchResult`. Deliberately left uncorrected by the pass that found them (2026-08-18): which of `core-types.md`, `operations-types.md` and `zod-schemas.md` each belongs in is an owner's judgement about how the three partition, not twelve rows appended to whichever table is nearest. Register the resulting lists once placed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | chore    | medium     |
| CLI-537 | **A reader following a `related:` chain lands on a redirect stub.** The three architecture pages pair a real body with a short pointer, and the discipline holds in one direction only — the stubs redirect correctly, but the BODIES' `related:` chains name the stubs: `architecture-overview.md` points at `reference/architecture/dependency-graph.md` and `reference/architecture/boundary-map.md`, and `boundary-map.md` points at `reference/type-system.md`, itself a pointer. Also here: `architecture/overview.md` carries two cross-reference bullets where `DOCUMENTATION_MAP.md` states a pointer holds _"a redirect table and no content"_ (both found 2026-08-18). Check the same two shapes across the wizard and testing stub pairs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | chore    | easy       |
| CLI-538 | **Owner ruling wanted: is the comment wrong, or is the code?** (raised 2026-08-18 by the config doc re-derivation, which found it and did not guess.) `splitConfigByScope`'s own doc comment says the project half clears `selectedDomains`. **It does not** — `projectConfig = { ...config, name, agents, skills, stack }` overrides four keys and the spread's `selectedDomains` survives; the global literal's conditional re-set is a no-op after its own spread. So either the comment is stale and should be corrected, or the clearing was intended and never implemented. **It is not observable in any emitted config today**, because both project writers recompute the field — which is exactly why it could rot unnoticed and why it needs a decision rather than a patch. One sentence settles it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Needs Ruling  | chore    | trivial    |
| CLI-540 | **Three code-side defects the wizard doc pass found and did not fix** (2026-08-18). (1) **`e2e/pages/steps/search-modal.ts` is a page object for a feature the wizard does not have** — verified: no spec imports `SearchModal`, and nothing in `src/cli/` binds `/` in a `useInput` handler, so `BuildStep.openSearch()` presses a key no handler reads. It survives because nothing imports it and nothing type-checks it against the UI, which makes it the test-infrastructure twin of a documented-but-absent feature. (2) `wizard-store.ts`'s JSDoc on `resolveSkillRowInputs` names **`withSelectedSource`**; the helper is `withSelectedMode`. (3) `scope-diff.ts`'s JSDoc on `agentSlotKey` cites `D-278`, which `todo/cli.md` records as renumbered after an ID collision — so one ID names two rows and the dangling reference has already escaped `.ai-docs/` into source. (4) `.ai-docs/reference/config/configuration.md` carries "the D-220 delta pipeline" in a redirect row. **Rule 3 of `documentation-bible.md` was tightened 2026-08-18 to ban task IDs live or dead**, so (3) and (4) are violations rather than judgement calls — and **the ESLint guard for this class reaches test names and `expect` messages only, never prose or JSDoc**, so nothing catches either. **This row names four instances and that understates the class by about an order of magnitude** (re-measured 2026-08-19 by running rule 3's own two inventory greps): **192 hits under `src/`, `e2e/` and `scripts/`**, and **53 across 22 files** under `.ai-docs/` once `agent-findings/` and the bible itself are excluded. Take the greps as the worklist rather than these four — the bible warns about exactly this failure, that a sweep scoped to one named site re-greps for that ID, finds it clean, and reports the class closed                                       | Ready for Dev | chore    | easy       |
| CLI-541 | **`TEMPLATE.md` defines a lifecycle-field pairing rule and nothing enforces it.** `check-findings-frontmatter.ts` only proves the YAML _parses_; it never checks that `status: resolved` carries a `resolved_by:` or that `status: partial` carries a `partial_note:`. Four instances found in one read-only sweep (2026-08-18): two `resolved` with no `resolved_by`, one `open` sitting beside a `resolved_by`, and one more `resolved` unpaired. The check is cheap — the parse already yields the object — and it belongs beside the existing one rather than in a new script. **Do NOT enforce it by rewriting the offending files first**: the pairing failures are evidence about how findings get closed, so land the check, let it go red, and fix the four deliberately                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ready for Dev | feature  | easy       |
| CLI-542 | **Seven findings prescribe an action current source contradicts, and each is an approved-looking justification for making the repository worse** (found 2026-08-18 by a re-audit whose every call was adversarially verified). Four would overwrite a correct document with its INVERSE: the two dual-scope `s`-toggle findings would rewrite `tombstone-pattern.md` to say `s` is a guarded no-op when `toggleSkillScope`/`toggleAgentScope` make it the sole collapse; `a-destructive-apply-must-be-told-what-it-does-not-own` documents an invariant CLI-519 reversed, and following it is **why `edit.md` and `scope-system.md` still carry an "Inherited global" kept-reason whose predicate exists nowhere in `src/` and contradicts the same file 80 lines up**; `a-skills-category-never-reaches-dist` asks a reference doc to state plainly something false since 2026-08-10. Three would reverse a deliberate decision: `design-tokens-fail-wcag-aa-contrast` (refused in three places including `todo/www.md` § _Constraints already settled — do not undo these_), `shared-fixture-const-vs-file-local-const-adoption-boundary` (its rule mandates a hand-built id that `test-data.md` forbids and that `e2eSkillId` namespacing makes wrong). **The docs the fourth one already damaged are the actionable half; the rest is marking the findings.** Full evidence per finding in `.ai-docs/agent-findings/INDEX.md` § Re-audit                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | bug      | medium     |
| CLI-544 | **A finding's citation carries the fact, and nothing checks it resolves — now mostly mechanised.** The 2026-08-18 deletion of 66 findings left **64 dangling citation sites across 39 surviving files**, and the mandated link-integrity scan would have caught **one** — the single `supersedes:` key. The rest were body prose (51), `affected_files:` (11) and `partial_note:` prose (2), which is why widening the scan to more frontmatter KEYS was the wrong fix: a key-scoped rule reaches 13 of 64. **Landed 2026-08-19**: `check-findings-frontmatter.ts` gained an `unresolved` scan stated over the VALUE rather than a key list — every member of a YAML sequence is a path, and a scalar is a path only when it is one token carrying a separator or an extension, so a `partial_note` paragraph that merely quotes a path is not judged. It found **21 dangling references across 14 findings**. `check-finding-citations.ts` is new and covers `todo/`, where nothing had ever looked: **12 dangling across 6 documents**, all since repaired. `changelogs/` is modelled as a row that refuses links only, which is the INDEX ruling written out rather than an exclusion. The deletion protocol is written. **What was deliberately NOT built, and why**: a prose scan over `.ai-docs/` would report **292 sites, 264 of them in `INDEX.md`** — which names deleted findings on purpose, because a row naming an absent file IS the record. That check has no route to zero and would red the gate on the corpus's own archive. Remaining work is that judgement, not more scanning                                                                                                                                                                                                                                                                               | Ready for Dev | chore    | small      |
| CLI-590 | **Ruling wanted: does the task-ID ban exempt `agent-suggestions/`?** (raised 2026-08-18 by the pass correcting the bible's own scope claim.) Rule 3 of `documentation-bible.md` exempts `agent-findings/` — _"whose filenames and frontmatter are dated evidence by design"_ — and **never mentions `agent-suggestions/`**; the string appears nowhere in the document. That directory holds four task-ID citations of exactly the same dated-evidence kind, all in one proposal that argues its case BY naming the defects behind it. So the census reads it as in scope **by omission rather than by decision**. The pass deliberately did NOT add `--exclude-dir=agent-suggestions` to the rule's grep, on the grounds that extending an exemption through a command instead of a ruling is worse than leaving the question visible — which is correct, and is why this is a row rather than an edit. One sentence settles it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Needs Ruling  | chore    | trivial    |
| CLI-547 | **The task-ID backlog: 265 sites, and a sweep scoped to any one sentence will report the class closed.** Census re-derived 2026-08-18 with path-based exclusions (a `grep -v` pipe filters the TEXT as though it filtered the PATH, and produced a false clean earlier the same day): **210 citing lines across 85 files** under `src/`, `e2e/`, `scripts/`, and **55 lines across 21 documents**. Note `[A-Z]{1,4}-[0-9]{2,4}` also matches **`SHA-256`** — five lines in four files are that, not IDs. **Four of the document hits are section HEADINGS** (`agent-system.md`, `scope-split.md`, and `tombstone-pattern.md` twice, one nested under the other), so replacing them moves anchors and every inbound link must move with them — that is the half needing a decision, and it is CLI-546's neighbour rather than the same question. The bible now carries the two greps rather than a count, so the rule no longer claims a scope it does not have                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev | chore    | complex    |
| CLI-549 | **The share round trip loses the applied stack's description, because `config.ts` records the description and not the id.** Found 2026-08-19 by hand-running journey 29, and the only difference left in the whole round trip once the key-ordering defect was fixed: the origin carries `"description": "Minimal stack for E2E testing"` and the rebuild does not. The payload's `stackId` is `null` because **`share` has nothing to encode** — the installed config never recorded which stack was applied, only its prose description. Affects no compiled output and no installed file today, which is why it is filed rather than fixed: closing it is a **payload-contract change** (record the id, or teach the payload to carry the description), not the ordering fix that shipped alongside it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev | bug      | medium     |
| CLI-551 | `src/cli/stores/d227-same-scope-tombstone-duplicate.test.ts` **carries a task ID in its filename**, which the convention bans for test names — and unlike a name inside a `describe`, no lint selector reaches a filename. Rename for the behaviour it pins: a preselection rebuild must not mint an active entry and a tombstone in the same `(id, scope)` slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ready for Dev | chore    | trivial    |
| CLI-552 | `AgentSourcePaths.templatesDir` is **diagnostic-only** — one reader, a `verbose()` in `compile.ts`, plus a `directoryExists` check in `agent-fetcher`. Cutting it is defensible but deletes a `--verbose` line and touches five spec files (four under `src/cli/lib/__tests__/`), so it was left rather than swept during a pass that held none of them. Decide whether the diagnostic earns the field                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev | chore    | easy       |
| CLI-553 | `SkillRequirement.needsAny` is declared **non-optional** (`needsAny: boolean`) and carries `@default false` — the same defect as the two `CategoryDefinition` tags removed 2026-08-19, and the last of the five `@default` tags under `src/cli/types/`. The other three are on genuinely optional fields and are correct. **Rewording rather than deleting is the fix**: the value is real, but it resolves an optional field UPSTREAM (`skill-resolution.ts` does `needsAny: rule.needsAny ?? false`) rather than defaulting this one, so the tag should say where the resolution happens. Reported rather than swept because that is a judgement the pass was not scoped for. **Note the vendored-copy coupling**: `src/cli/types/**` is copied byte-for-byte into `packages/matrix`, so a comment-only edit needs `bun scripts/run-generate-matrix-package.ts` in the same turn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ready for Dev | chore    | trivial    |
| CLI-554 | **Three genuinely new capabilities**, detailed in [`plans/parked-features-2026-08-19.md`](./plans/parked-features-2026-08-19.md). (1) The seed contract cannot carry half of what a config holds — `model: "inherit"` has no spelling and `agentsSource` has no field; closing either means new schema fields and a `SEED_VERSION` bump the editor and the worker share. (2) The wizard save path discards the whole `GateReport`, so a project skipped during an init/edit fan-out is invisible — surfacing it is a new signal, and auto-deregistering is a new capability. (3) `registerProjectPath`'s sweep is silent; every remedy its finding offers is a new user-visible signal. A fourth item is recorded there and gated by its own author on "if anyone acts on this". **This row was 51 items until the owner ruled that a guard is not a feature** — the other 48 went back into the fixes round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | feature  | medium     |
| CLI-555 | **Twelve open rulings from the accuracy-programme triage**, detailed in [`plans/open-rulings-2026-08-19.md`](./plans/open-rulings-2026-08-19.md). Each is a question only the owner can settle — the mechanical half has landed in all fifteen. Several say outright that the change cannot be taken unilaterally: tightening `marketplaceSchema.name` changes what third-party marketplaces LOAD rather than only what this CLI emits, and the edit-mode scope audit's central proposal overturns a deliberate design comment in `edit.tsx`. Two more are live contradictions between a finding and a later ruling, where the finding is the half that is now wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Needs Ruling  | chore    | medium     |
| CLI-556 | **No E2E spec can assert that a plugin DEPARTED**, because `ProjectBuilder.pluginProject` writes a config claiming plugin origin and never writes `enabledPlugins`. Found 2026-08-19 by the test-hardening pass, which added a `not.toHavePlugin` to the plugin→eject migration spec, mutated away the `claudePluginUninstall` call, watched it stay green, and **removed its own assertion rather than ship a vacuous one**. Every migration spec built on this fixture therefore checks the install direction and cannot check the uninstall direction on its external effect. 13 callers, several of them failure-path specs, so widening the fixture is not a same-pass change. `e2e/fixtures/plugin-install-state.ts` already produces the correct state and is the likely route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Ready for Dev | bug      | medium     |
| CLI-557 | **`e2e/lifecycle/config-scope-integrity.e2e.test.ts` does not cover what it is named for.** Its `marketplace` assertions pin the writer's emission rather than `splitConfigByScope`'s spread — removing that spread leaves the spec green; deleting `marketplace` in `cleanForEmission` is what reddens it. So the scope-split behaviour the filename claims still has no E2E guard. The finding is recorded in the spec's own JSDoc, which is where the next author will look. Pairs with the `splitConfigByScope` doc-comment ruling already filed as CLI-538 — same function, one asking whether the comment or the code is right, this one asking what actually holds it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | bug      | medium     |
| CLI-574 | **Migrate the 35 live `D-NNN` tracker rows to their workspace prefix.** Owner ruling 2026-08-19: tracker ids carry a shortened workspace word — `CLI`, `EDITOR`, `WWW`, `SERVER`, `REPO`, `SKILLS`. **`D-` predates that scheme and is still live**: 35 rows across the trackers, plus **166 `D-NNN` references in `src`, `e2e` and `scripts`**. While both exist, a task-id grep cannot tell a live ticket from anything else shaped like one — which is what made the 59 `D-<single digit>` E2E phase labels look like ids (closed separately; they need no rename). Migrating the rows frees the namespace, lets a detector match `^(CLI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | EDITOR        | WWW      | SERVER     | REPO | SKILLS)-[0-9]+`exactly, and converts the 166 source references from possibly-live to unambiguously-dead — turning the CLI-540 / CLI-560 sweeps from a judgement call into a mechanical one. **Sequence: migrate the rows first, then sweep.** **The tree records three prior renumberings** —`D-278`→`D-306`after a collision in the completed rows,`CLI-367`assigned twice,`CLI-368`renumbered the day it landed — so this is a recurrence, not a one-off. **Every renumbering breaks citations**: grep`todo/`, `.ai-docs/`and`changelogs/` for each old id and repair or absorb, the way a deleted finding's citations are handled | Ready for Dev | chore | medium |
| CLI-575 | **`needsGlobalWrite` is named in a comment in `src/cli/lib/config-gate/propagate.ts` and in `src/cli/lib/installation/local-installer.test.ts`, and no such symbol exists.** The live reader is `resolveEffectiveGlobalConfig`'s `changed`. Found 2026-08-19 while verifying a rule about exactly this class — a lifecycle note naming a symbol nothing declares — which had until then only been demonstrated in findings prose. **This is the same defect in product code**, where no findings checker reaches it: `check-findings-frontmatter.ts` scans `.ai-docs/agent-findings/` only. Worth asking, when fixing, whether the symbol-existence scan should reach comments in `src/` at all, or whether that is the permanently-red shape a prior pass rejected for `src/` citations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev | chore    | trivial    |
| CLI-576 | **Four assertion helpers have zero callers, and two of them are the ones a finding named as the shared surface to fix.** `expectFullInstallation` (`e2e/assertions/phase-assertions.ts`) has none; `expectFullConfig`, `expectConfigOnDisk` and `assertConfigIntegrity` (`src/cli/lib/__tests__/assertions/config-assertions.ts`) have none outside their own module. Found 2026-08-19 while re-deriving the call-site counts for the assertion-helper-honesty rule — the live surfaces are `toHaveConfig` (79 sites), `expectPhaseSuccess` (40) and `expectDualScopeInstallation` (9). **The finding that proposed tightening these named the wrong two**, so a pass following it would have changed signatures nothing calls and left 128 real call sites alone. Delete them, or find why they were written and left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev | chore    | small      |
| CLI-578 | **`splitConfigByScope`'s empty partition is untested, and only one direction can prove it.** Row 16 of `user-journeys.md` names the case where a scope keeps no sub-agent at all, so the partition emits `{}` rather than an absent key and nothing downstream distinguishes the two. **It must be the GLOBAL partition that empties.** The 2026-08-19 departure spec reaches the mirror state — after its toggle the project owns no sub-agent — and it is **unreadable there**, because `generateProjectConfigWithInlinedGlobal` inlines the global partition into the project file and `partitionInlinedConfigEntries` filters the project stack to project-scoped agent names. So a spec proving this drives every sub-agent to PROJECT scope and reads the global `config.ts`. Pairs with CLI-538, which asks whether `splitConfigByScope`'s doc comment or its body is right about `selectedDomains` — same function, both unobserved in any emitted config, which is why they rot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev | chore    | small      |
| CLI-579 | **Documentation owed by the 2026-08-19 product pass.** (1) `reference/leaf-exports.md` § 4 is titled after `AgentDefinitionOptions` and is **entirely about a type that no longer exists** — delete the section and its table row. (2) `reference/features/agent-system.md` and `reference/features/compilation-pipeline.md` carry the old `getAgentDefinitions` / `loadAgentDefs` signatures. (3) `reference/concepts/guard-pattern.md` quotes the unassigned-skill warning in full and is now a **partial** quote, since the warning gained a remedy. (4) **`clean-code-standards.md` cites that exact warning as its live example of _"the warning names no remedy either"_ — fixing the warning retired the standard's specimen.** Replace it or note it as closed; a rule whose worked example has been fixed reads as satisfied and stops being applied                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Ready for Dev | chore    | small      |
| CLI-580 | **A third spawning door clears no environment at all, and the gate that exists to catch this names only two.** `e2e-runner-environment.test.ts`'s `RUNNERS` roster is hand-written and comments itself as _"the two ways this suite starts the compiled binary"_ — `runCLI` in `e2e/helpers/test-utils.ts` is the third and is absent. It clears none of `VITEST`, `AGENTS_INC_API_URL`, `XDG_CACHE_HOME`, `GIGET_AUTH`, `CC_MARKETPLACE`, and `execa` sets `extendEnv: false` nowhere, so all of them inherit. **`VITEST` therefore reaches every binary spawned through it — 54 calls across 19 spec files — and `warn(msg, { suppressInTest: true })` returns silently in all of them**, so any spec asserting one of those five product warnings passes by not looking. Fix: add the five as `undefined` ahead of `...options?.env`, matching `CLI.run`; add `NO_BACKGROUND_VERSION_CHECK` too. **Then derive the roster instead of stating it** — assert it equals the doors `scripts/check-spawn-doors.ts` finds, so a fourth door lands in both gates at once. Found 2026-08-19 while building that checker; it is the defect the checker was commissioned to predict, already realised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev | bug      | small      |
| CLI-581 | **Make `{@link}` the checkable citation and leave backticks alone — the convention is already being followed informally.** A scan for comment-cited symbols that no code declares was built and measured 2026-08-19: across `src/cli` it reports 13 candidates and **all 13 are false positives**, in three groups — a real symbol outside the TS corpus (`RequestInit`, oclif's `baseFlags`, tsconfig flags, a `package.json` script), a **deliberate absence**, and a placeholder that is not a symbol. The middle group is why a backtick scan can never work here: **this codebase's house style is to explain what was REMOVED** — _"it used to have a `DOMAIN` beside it"_, _"this class declares no `baseFlags`"_ — so by construction its best comments name symbols nothing declares, and a permanently-red check gets answered by deleting the sentence rather than the citation. **`{@link X}` already means "resolve this"**: `src/cli` carries **159 across 66 of 398 files, and the `{@link}`-only scan reports zero unresolvable**. Formalise the split and gate it with existing tooling — `eslint-plugin-jsdoc`'s `no-undefined-types`, TypeDoc's `--validation.invalidLink`, or tsc quick-info — **not a bespoke scanner**. **The honest cost, stated by the agent that proposed it**: the defect that prompted this (`needsGlobalWrite`, now fixed) was backticked at both sites, so this gate would not have caught it; coverage is the 159, not the whole comment corpus. Immediate worklist: `needsGlobalWrite` still survives in `reference/config/config-merger.md` and one finding                                                                                                                                                                                                                                                                       | Ready for Dev | chore    | small      |
| CLI-582 | **Two source comments cite a rule that does not exist.** `config-writer.ts` says its exclusivity throw applies _"the same rule local-installer applies"_ and `config-types-writer.ts` says _"same rule the installer applies"_ — **`local-installer.ts` contains no reference to `exclusive` at all.** Found 2026-08-19 while completing the § 15.14 enforcement list. This is worse than a stale symbol: it points a reader at a file to learn the rule, and the file teaches them nothing, so the natural conclusion is that they have misread the code rather than the comment. Name the real sibling — the write-path guards are `compactCategoryAssignments` (`config-writer.ts`) and `buildProjectCollisionTest` (`config-gate/propagate.ts`), with `config-types-writer.ts` reading the same flag for the emitted union's `[]` suffix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | chore    | trivial    |
| CLI-583 | **`agent-system.md` states the wrong shape for `PropagatedRecompileSummary`** — it documents `{ recompiledCount, failedCount, warnings }`; source is `{ rewrittenCount, unchangedCount, failedCount, warnings }`. So a field is renamed and a whole field is missing, and `unchangedCount` is the one that distinguishes _"nothing needed rewriting"_ from _"nothing was reached"_ — the exact distinction a fan-out summary exists to make. Pre-existing and unrelated to the 2026-08-19 documentation wave that found it; reported rather than patched because it sat outside that pass's six items                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Ready for Dev | chore    | trivial    |
| CLI-584 | **Two config-writer invariants now have no live assertion anywhere.** Deleting the zero-caller `assertConfigIntegrity` retired four invariants; two are live elsewhere — exact skill ids in `expectConfigSkills` at 8 sites, and default-agents-absent-from-stack at the producer in `config-generator.test.ts` — but two are not: **(1) `config.agents` is written in alphabetical order**, and **(2) every agent key in `config.stack` also appears in `config.agents`**. Neither is covered by the live helpers, and the reason is structural rather than accidental: **every one of them sorts before comparing, so they are order-blind by construction** and an alphabetical-order claim is unassertable through any of them. Both want a spec at the writer, not at a helper. Reported by the pass that did the deletion rather than invented by it — per CLAUDE.md's rule that an unused binding in a test is a signal and the intended assertion is reported rather than guessed at                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | chore    | small      |
| CLI-587 | **`toThrow(<constant that does not exist yet>)` accepts any throw, so a red-first test for a new refusal passes vacuously before the code is written.** Found 2026-08-19 while adding refusals to `check-enumeration-drift.ts`: four of thirteen new tests asserted `toThrow(UNREADABLE_VALUE)` against a constant that was imported but not yet exported, which evaluates to `toThrow(undefined)` — matching **any** error. The tests looked red-first and were not; their only honest pre-build failure was `tsc` (`TS2305: Module has no exported member`). **This is a harness hole, not a code defect, and it applies to every `scripts/check-*.ts` suite** — each one asserts refusals by imported message constant, which is exactly the shape that misfires. Two candidate fixes: assert `toThrow(new RegExp(CONSTANT))` so an undefined constant is a TypeError rather than a wildcard, or make the red-first step `tsc` rather than vitest for any test naming a symbol that does not exist yet. **The general rule underneath is the valuable half**: a red-first run is only evidence if the red comes from the assertion, and an assertion referencing a not-yet-existing symbol cannot supply one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev | chore    | small      |
| CLI-588 | **Six more key→value tables surveyed for pair-binding, each blocked by a named reason** (measured 2026-08-19 by driving the finished reader against the real repository, not inferred). **`STANDARD_DIRS` in `reference/utilities.md` AGREES over 6 pairs today** — registerable with no doc edit, and the cheapest next customer. **`CLI_COLORS` in `component-patterns.md` drifts on punctuation alone**: the document writes `"#99FFFF"` where the source holds `#99FFFF`, so it is one character per row from binding — **do not register it first or the row lands with 11 false drifts**. Refused with reasons: `STANDARD_FILES` and `DIRS` hold identifiers rather than string literals; `SCHEMA_PATHS` holds templates with substitution **and** its document column states a suffix rather than the value, so resolving the templates still would not agree; `EXIT_CODES` is numeric and needs a deliberate widening; `UI_SYMBOLS`' value column is prose (`checkmark`, `unicode chevron`) and is correctly unbindable. Converting any of these is a scope call, not a mechanical sweep                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ready for Dev | chore    | small      |
| CLI-589 | **Prompt-improvement and agentic-accuracy task — investigate the orchestration accuracy problem properly** — detail in [`plans/orchestration-accuracy-investigation.md`](./plans/orchestration-accuracy-investigation.md). The architectural half of CLI-566, which holds the measurement: **every agent that checked a figure in its own brief found at least one wrong**, across ~20 dispatches in one session, none caught by review. The plan carries the five-category failure taxonomy with its evidence, what the external research says (cascading error is the known primary bottleneck; the handoff needs a contract rather than a prose brief; "harness engineering" is the distinction — structure around the TRANSFER rather than the prompt), and five ranked candidate mechanisms. **Its first instruction is to verify its own measurement**, since that is assembled from agent reports — the exact second-hand sourcing the finding is about. **The trap it must avoid is named in the plan**: defence in depth absorbs its own evidence, so any mechanism adopted must make the error rate MORE visible, not less — a fix that prevents errors without counting them leaves us as blind as we started and feeling better about it **Three principles are already ruled and recorded in the plan** (2026-08-19): the verifier is never the fixer; a verdict carries a reproduction rather than a judgement; and prefer DELETING a claim to rewriting it, because every rewrite is a new claim that can rot. Plus one running condition — **freeze the tree**: the circling was caused by documents being rewritten about code other agents were changing in the same hour                                                                                                                                                                                       | Ready for Dev | chore    | complex    |
| CLI-591 | **Ruling wanted: two info lines outrank every warning in the startup band, and in a cramped terminal they take the only slot.** Measured 2026-08-19 immediately after the CLI-586 fix landed, by hand-running `edit` over an install naming two absent skills. `wizard-layout.tsx` paints `MAX_PAINTED_STARTUP_MESSAGES = 3` and counts the rest as `... and N more`, but `edit` unconditionally pushes `Loaded N skills` and `Found N installed skills` **first**, so exactly **one** warning is ever readable and the second collapses to `... and 1 more`. Below `LOGO_MIN_TERMINAL_ROWS` the budget is `MAX_PAINTED_STARTUP_MESSAGES_CRAMPED = 1`, so the single painted slot goes to `Loaded N skills` and **no warning is visible at all**. Not a regression — before CLI-586 zero were readable — but the budget was sized when only the load could fill the band, and hydration is now a second producer. Two candidate shapes, and the choice is a product call: sort `warn`/`error` ahead of `info` before truncating, or merge `edit`'s two info lines into one. The `... and N more` counter is honest either way, so nothing is silently dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Ruling wanted | chore    | small      |
| CLI-592 | **A warning raised after the wizard mounts is still lost, and it is the half the CLI-586 fix deliberately did not cover.** `populateFromSkillIds` is called post-mount from `stack-selection.tsx` (`applyStack`, at the `globalPreselections` merge) and from `wizard-store.ts`'s `startFromScratch`, both inside a keypress handler while Ink owns the terminal. Global preselections come from the global config, which can name a skill the loaded source does not carry, so `absentFromSourceWarning` can be raised there and go to stderr under a painted frame exactly as the hydration case did. **The startup band is the wrong home for it** — a message raised mid-session is not a startup message — so this is a product decision between the toast (`setToastMessage`) and the info panel rather than a repeat of the same fix. Nothing currently drives that path with an unresolvable global preselection, so it needs an e2e guard as well as a channel. Related but distinct from CLI-559, which is about what those two warnings SAY rather than whether they are seen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ruling wanted | chore    | medium     |
| CLI-593 | **`init-wizard-unreachable-source.e2e.test.ts` has one `it` whose entire body is a negative, and the band's paint budget can satisfy both its negatives while the condition exists.** **This row was filed on a premise that was then refuted, and the refutation is the useful half.** It was opened believing the three `not.toContain` assertions were unsound because `getScreen()` reads scrollback plus viewport. **They are sound**, and for a reason the spec does not state: both screens are captured straight out of `waitForReady()` → `waitForWizardFooter()` → `assertWizardScreenIsWhollyVisible()`, which has just proved `viewportY === 0`, so the string each assertion reads is one painted frame rather than accumulated history; the two screens also come from separate PTYs. **What is actually worth closing, measured 2026-08-19**: (1) the `not.toContain(STEP_TEXT.UNRESOLVED_SLUG)` on the warming screen is an `it` with **no positive assertion at all** — its only anchor is a positive on the same variable in a SIBLING `it`, and what saves it is that `waitForReady` throws in `beforeAll`, i.e. a control living outside the test, which is the shape CLAUDE.md warns about. (2) Both negatives are statements about the PAINTED BAND rather than about the load: `StartupMessages` paints `MAX_PAINTED_STARTUP_MESSAGES` and counts the rest, so an unresolved-slug warning queued fourth satisfies both assertions while existing. These launches pass no `TERMINAL_SIZE` override and run at `DEFAULT_ROWS = 40`, so the budget is 3 today — but if the harness default ever drops below `LOGO_MIN_TERMINAL_ROWS` the budget becomes 1 and the assertion at risk is the POSITIVE, not either negative. Related: CLI-591, which is the same budget seen from the product side                                                               | Ready for Dev | chore    | small      |
| CLI-594 | **`getScreen()` and `getFullOutput()` read the SAME range in this harness, so every comment and every spec drawing a contrast between them is describing a protection that is not there.** Measured 2026-08-19 directly against `@xterm/headless` at 6 rows with 20 lines written: `length: 21, viewportY: 15, baseY: 15`, and `viewportY + rows === length` → **true**. `getFullOutput` reads `0 .. buffer.length`; `getScreen` reads `0 .. viewportY + rows`; for xterm's normal buffer `length === baseY + rows`, and `viewportY === baseY` whenever nothing has scrolled the emulator's own viewport — which **nothing in `e2e/` ever does** (no `scrollLines` or `scrollToBottom` call exists anywhere in the tree). Two spec headers were found asserting `getScreen()` "rather than `getOutput()` because the earlier frame is still in scrollback" and were corrected in place; **the sweep for others was deliberately not run**, because the two were found incidentally rather than by looking. The correct justification, where one is needed, is that `waitForWizardFooter()` has just proved `viewportY === 0`, so the range IS the viewport on a wizard screen — a property the assertion establishes rather than one the reader has to trust. **Do not close this by adding a viewport-only reader** without first deciding whether one is wanted: the suite has lived without it, and a second reader that differs from `getScreen()` only in sessions that never occur is a distinction the next author will get wrong the same way                                                                                                                                                                                                                                                                                                                             | Ready for Dev | chore    | small      |
| CLI-559 | **Two warnings in `wizard-store.ts` tell the user nothing they can act on.** `resolveSkillForPopulation` raises _"Installed skill 'X' is not present in the loaded source — it may have been removed or renamed"_ and _"Installed skill 'X' has unknown category 'Y' — skipping"_. Neither names a remedy. The first is also the string `assertions.md` already records as the one a removal-reason assertion matched by accident — the removal **row** downstream carries a real reason (`REMOVED_REASON_*`), the warning does not, so the two surfaces describe the same event at different qualities                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ready for Dev | chore    | small      |
| CLI-560 | **Task IDs still sit in test bodies in five files outside the 2026-08-19 sweep's trees**: `lib/resolver.test.ts` (3×), `lib/installation/local-installer.test.ts` (2 lines), `lib/configuration/config-merger.test.ts` (2×), `lib/config-gate/__tests__/write-project-partial.test.ts`, `stores/wizard-store.test.ts` (2×). That sweep removed 22 across 8 files and preserved the meaning in every case — do the same here. **Its own headline is stale and should not be trusted as a count**: the finding claims "151 across 30 files", the measured total is roughly 31 across 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Ready for Dev | chore    | small      |
| CLI-561 | **A fourth CLI-spawning door would silently reintroduce the detached-child race.** The 2026-08-19 fix spreads `NO_BACKGROUND_VERSION_CHECK` at the three doors that spawn the binary — `runCLI` (`e2e/helpers/test-utils.ts`), `CLI.run` (`e2e/fixtures/cli.ts`) and `TerminalSession` (`e2e/helpers/terminal-session.ts`). There is **no shared seam beneath them**, so nothing makes a fourth door inherit it, and its only detector is a flaky red in one spec. `e2e/vitest.config.ts`'s `test.env` was considered and rejected: it would cover all three by inheritance but misses `e2e/handrun-journeys.ts`, which runs outside vitest. Proposed: a gate in `src/cli/lib/__tests__/spec-gates.test.ts` asserting every site that spawns `BIN_RUN` carries the constant — the reasoning that made that file exist applies here almost verbatim. **Parked as new work rather than swept in**, per the fix-and-refactor-only scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | chore    | small      |
| CLI-562 | **`spec-gates.test.ts`'s escape-shape test is load-sensitive and times out under a full-suite run.** It drives ESLint in-process across four zones × five shapes × two forms against the default 10s `testTimeout`, so it passes in isolation and on a quiet re-run but fails when the machine is busy — observed once during the 2026-08-19 wave with six agents live. A test that fails only under load reads as a regression to whoever meets it and teaches the next reader to re-run rather than investigate. Give that one `it` an explicit per-test timeout sized to its real work, rather than raising the suite default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ready for Dev | bug      | trivial    |
| CLI-563 | **`toHaveCompiledAgents()` asserts only that a directory exists and holds at least one `.md`** — it is a `readdir` plus a `length === 0` check, so it cannot detect a wrong roster, a swap, or stale content, and on any flow that runs after an install the install alone satisfies it. **16 call sites inherit that.** It is a direct instance of the repo's own rule — _never assert a directory listing, roster or generated union by count alone; a count cannot detect a swap_ — living inside the matcher that makes the rule easy to break. Two stronger tools already exist beside it: `toHaveCompiledAgent(name)` for a single named agent, and `readCompiledAgents(dir)` for a whole-map `toStrictEqual`. Triage the 16 sites: where the spec's subject IS the roster, move to a named-constant comparison; where it genuinely means "an install happened here", keep it and say so on site. Found 2026-08-19 while writing the proof-of-execution rule, which needed to explain why the matcher is not proof of anything                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | bug      | medium     |
| CLI-564 | **Four numbers in `built-in-catalogue.md` are held by nothing, and one more is held in a way that guarantees drift** (re-derived 2026-08-19 by evaluating the modules; every figure below is correct today). Unheld: the **35 distinct categories** and **53 distinct skill ids** of invariant 4, the which-agents-appear-in-how-many-stacks sentence, and `defaultRules`' **61 `needsAny`** and **176 distinct slugs**. The subtler one: `default-rules.test.ts` does pin the four rule figures — but with **its own literals and no reference to this document**, which is the opposite arrangement to the `defaultStacks` suite, so **repairing that suite is exactly the change that leaves this table wrong**. Also fixed in passing: the `cli-ink-oclif` table note said 10 agents and the stack has 9, and the "Test surface" gap claiming _nothing_ cross-checks either file against the generated matrix is now false — `default-stacks.test.ts` asserts every assignment sits under its skill's real category, though its lookup filters out an id the matrix does not hold, so a **stale id passes that spec rather than failing it**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ready for Dev | chore    | small      |
| CLI-566 | **Every agent that checked a figure in its own brief found at least one wrong — turn that into a rule set.** Detail and the full evidence in [`plans/brief-accuracy-rules.md`](./plans/brief-accuracy-rules.md). Across ~20 dispatches in one session the hit rate was **every single one**, and none of it was caught by review — all of it by agents re-deriving from source rather than trusting the sentence handed to them. Six error classes, and the countermeasures differ per class: a count true when written (unfixable by care — the tree moves, and one table's drift grew 3→7 **while an agent worked on it**), a symbol that moved, a framing that was wrong rather than stale (the expensive kind — the sentence reads fine and the work built on it is wrong), an over-claim true of three of four members (**one such gap was a shipped defect**), an error structurally unfindable by the one check anyone would run, and the orchestrator's own process failures. **The strongest candidate rule came out unprompted: a brief may not carry a number — it carries the command that produces one.** Also owed: decide where such rules live, since a brief is not a document under `.ai-docs/` and the agent prompts may be the only place an agent reliably reads. **Verify the evidence before acting on it** — it is assembled from agent reports, which is the second-hand sourcing the finding is about                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev | chore    | medium     |
| CLI-567 | **`MigrationResult`'s field names are stale in four documentation sites.** Source returns `{ ejectedSkills, pluginInstalls: PluginInstallResult, warnings }`; the docs say `pluginizedSkills` and `failedPluginInstalls` — three sites in `reference/features/plugin-system.md` (including its Types list) and one in `reference/features/configuration.md`. Found 2026-08-19 by a citation-repair pass, which **deliberately did not fix the one it was already rewriting**: correcting one of four would have left an internal contradiction three lines apart, and it is a separate claim from the citations. Fix all four in one pass. Also unconfirmed and worth settling in the same read: `src/cli/lib/__tests__/factories/config-factories.ts` uses `source: EJECT_SOURCE` where CLAUDE.md says the field is `origin` — it may be a raw config-file shape where `source` is still correct, so **establish which before changing anything**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ready for Dev | chore    | small      |
| CLI-568 | **`clean-code-standards.md` § 15.14 names one of the two write-path guards and omits the other.** It says exclusivity is enforced by `reconcileProjectSplitAgainstGlobal` and does not mention the writer-side throw in `compactCategoryAssignments` (`lib/configuration/config-writer.ts`), which refuses to emit an inexpressible category. Not false, just incomplete — and incompleteness in a rule that enumerates its enforcement points is what lets the next reader believe a single site is the whole guard. Worth stating the deliberate asymmetry alongside it: both write-path guards read `exclusive` from the matrix and treat an **undeclared** category as non-exclusive, while `use-build-step-props.ts` defaults it to exclusive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ready for Dev | chore    | trivial    |
| CLI-569 | **Deleting `AgentSourcePaths.templatesDir` left `projectDir` dead all the way up, and the sweep stopped at a boundary.** `getLocalAgentDefinitions` used its `options` for nothing else, so its parameter went — but `AgentDefinitionOptions.projectDir` now has **no reader at all**, and neither does `loadAgentDefs`'s entire `options` parameter, since `loadAgentDefs` always calls `getAgentDefinitions(undefined, options)` and that is always the local branch. **Six production sites pass `{ projectDir }` for nothing**: `config-gate/index.ts`, `recompile-project-agents.ts`, `compile.ts`, `uninstall.tsx`, and `commands/edit.tsx` **twice**. Found 2026-08-19 by the pass that removed the field; it stopped rather than cascade into a file another developer was mid-edit in. Same defect class as the one it just removed — CLAUDE.md's _"a field with no reader has no shape to get right"_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev | refactor | small      |
| CLI-570 | **Any edit to `src/cli/types/*` obliges a matrix regeneration, and nothing says so at the type files.** `scripts/generate-matrix-package.ts` vendors `VENDORED_TYPE_FILES` **byte-for-byte** into `packages/matrix/src/vendor/`, so a one-line field deletion in `types/agents.ts` drifted the generated copy and reddened three `generate-matrix-package` tests — the same trap hit twice in one day, once for `types/agents.ts` and once for `types/matrix.ts`/`types/skills.ts`. The obligation is discoverable only by reading the generator or by tripping its gate. **A comment-only edit counts**, which is the half people miss, and it is already recorded once as a finding about a CLI comment being a write into another workspace. Put the obligation where the hazard is: a header on each vendored type file naming the regeneration command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ready for Dev | chore    | trivial    |
| CLI-571 | **Two stale comments in `e2e/interactive/edit-plugin-hard-error.e2e.test.ts` and `e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts`.** (1) The `WITHDRAWN_NOUN` docblock reads _"The word CLI-463 withdraws from the user-facing surface, as a whole word"_ — the regex beneath it is `/\bsources?\b/i`, so **the word is `source` and a task ID is standing where the noun belongs**. It is a task ID in a comment AND a false sentence, and it arrived that way rather than drifting. One-word fix. (2) Both docblocks name `installPluginsStep`, which **no longer exists** — zero hits in `src/cli`; the live path is `requireMarketplaceOrExit` on `BaseCommand` plus `installPluginSkillsReported`. Found 2026-08-19 by the pass that repaired those files' finding citations, which deliberately phrased its own additions to avoid naming the dead symbol rather than widening its brief                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | chore    | trivial    |
| CLI-572 | **Record the 2026-08-19 agent-scope ruling where a reader will meet it.** `applyAgentToggle` in `stores/wizard-store.ts` ends `return [...configs, { name: agent, scope: "global" as const }]` with **nothing saying that is deliberate** — and a finding was filed against it, graded WRONG on the ruling, and deleted. Without an on-site record the next sweep re-derives the same reading and "fixes" it, which is the failure this corpus hits most: a deliberate design with no local statement. Put the ruling at the site — global is the default, an empty stack in a project-scoped install is the correct outcome, and `isScopePairCompatible` is why. Two documents also still describe the old reading: `reference/wizard/state-transitions.md` names the deleted finding, and `changelogs/0.137.0.md` mentions it (a dated record — leave that one)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ready for Dev | chore    | trivial    |
| CLI-573 | **A checker that reads a directory another process is writing into is fragile by construction.** `scripts/check-findings-frontmatter.ts` scans `.ai-docs/agent-findings/` on every run; during the 2026-08-19 session it reddened once because a finding file was being written **at that instant** and parsed half-formed, contributing a phantom undeclared symbol. Green again the moment the write completed. Nothing was wrong and nothing needed fixing, which is the problem — a red that means "someone is typing" is indistinguishable from a red that means "a finding is malformed", and the documented response to the second is to re-derive and edit a pin. This is a real hazard for any multi-agent session, which is the only mode this repository is worked in. Options: read each file once and tolerate a parse failure as unknown rather than as a defect, or skip files whose mtime is within a few seconds, or state in the checker that a solo red is not evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Ready for Dev | chore    | small      |
| CLI-331 | (was Bug 4) `edit` warns but keeps recompiling when the config write fails — silent three-way drift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | bug      | complex    |
| CLI-359 | `agent.liquid` reads `permission_mode`/`disallowed_tools`; `AgentConfig` carries camelCase — never emits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev | bug      | easy       |
| CLI-363 | (was 2026-04-22 finding) Edit-mode scope awareness — `cwd` and the detected install diverge across layers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Investigate   | bug      | complex    |
| CLI-367 | `validateBuildStep` has no production caller — required categories never block wizard advancement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Investigate   | bug      | easy       |
| CLI-385 | (was briefly CLI-368) The 2026-08-05 agent restructure sits uncommitted — all work done and green; land as one commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev | refactor | easy       |

## Wizard & CLI UX

| ID      | Task                                                                                                                    | Status           | Type     | Complexity |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| D-276   | Exclusive category: allow selecting a skill that conflicts with a global one, defaulting it to project scope.           | Ready for Dev    | feature  | complex    |
| D-280   | Prune built-in stacks — DEFERRED (owner 2026-08-07: will decide later; simpler now that stacks carry no preload flags). | Deferred         | refactor | easy       |
| D-211   | Reorder stack-selection render: scratch → React → other frameworks → CLI.                                               | Ready for Dev    | feature  | complex    |
| D-181   | Add YOLO mode toggle to build step. [Plan](./plans/D-181-yolo-mode-toggle.md)                                           | Ready for Dev    | feature  | complex    |
| CLI-311 | (was UX-04) Interactive skill search polish — manual testing plus tests for the search component.                       | Needs Assistance | feature  | complex    |
| CLI-312 | (was UX-05) Refine step — surface skills.sh community alternatives.                                                     | Needs Assistance | feature  | complex    |
| CLI-313 | (was UX-06) Search with colour highlighting — needs more UX thought.                                                    | Needs Assistance | feature  | easy       |
| CLI-314 | (was UX-07) Incompatibility tooltips — show the reason when a disabled option is focused.                               | Needs Assistance | feature  | easy       |
| CLI-315 | (was UX-08) Keyboard shortcuts help overlay — in-wizard help for keybindings.                                           | Needs Assistance | feature  | easy       |
| CLI-316 | (was UX-09) Animations / transitions — polish pass for step transitions.                                                | Needs Assistance | feature  | easy       |
| CLI-329 | (was expressive-ts decision 7) Glyph and label inconsistencies across steps, doctor and the source vocabulary.          | Investigate      | refactor | easy       |

## Matrix, config & scope

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status      | Type     | Complexity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ---------- |
| D-306   | Deeper incompatibility rules — richer semantics beyond conflicts/requires; scope TBD with Vincent.                                                                                                                                                                                                                                                                                                                                                                                                                               | Investigate | feature  | complex    |
| D-118   | Rename project/global scope to project/user — DEFERRED to the very end with CLI-425 (owner 2026-08-07: easy, but last, after everything is committed). **REAFFIRMED 2026-08-17 (owner): still deferred to the very end, and MAY NEVER BE IMPLEMENTED AT ALL.** Not "deferred until convenient" — an open question about whether the rename is worth doing, to be answered after everything else is committed. Do not schedule it, do not fold it into an adjacent pass, and do not treat a file it would touch as blocked on it. | Deferred    | refactor | complex    |
| CLI-324 | (was expressive-ts decision 2) Config-load leniency vs what `ProjectConfig` promises about agents and domains.                                                                                                                                                                                                                                                                                                                                                                                                                   | Investigate | refactor | complex    |

## Commands & lifecycle

| ID      | Task                                                                                              | Status                  | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ---------- |
| D-179   | Extract shared post-wizard pipeline into a ProjectLifecycle orchestrator.                         | Investigate             | refactor | complex    |
| D-26    | Marketplace-specific uninstall. [Plan](./plans/D-26-marketplace-uninstall.md)                     | Ready for Dev           | feature  | complex    |
| D-25    | Auto-version check + source staleness. [Plan](./plans/D-25-auto-version-check.md)                 | Ready for Dev           | feature  | complex    |
| D-13    | Eject skills by domain/category. [Plan](./plans/D-13-eject-skills-filtered.md)                    | Refined                 | feature  | complex    |
| D-47    | Eject standalone compile function. [Plan](./plans/D-47-eject-compile-function.md)                 | Deferred — low priority | refactor | complex    |
| D-19    | Improve template error messages. [Plan](./plans/D-19-template-error-messages.md)                  | Deferred — nice to have | feature  | complex    |
| D-08    | User-defined stacks in consumer projects. [Plan](./plans/D-08-user-defined-stacks.md)             | Deferred                | feature  | complex    |
| CLI-318 | (was #5) Agents command for skill assignment, with per-skill preload control.                     | Needs Assistance        | feature  | complex    |
| CLI-320 | (was P4-17) `agents-inc new` supports multiple items. [Plan](./plans/P4-17-new-multiple-items.md) | Refined                 | feature  | complex    |
| CLI-323 | (was R-01) `FEATURE_FLAGS` readable from env, so flag-gated commands can be tested.               | Done                    | refactor | easy       |

## Web ↔ CLI integration

| ID      | Task                                                                                                                                                                                                                                               | Status        | Type     | Complexity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| CLI-352 | Drift guard on the vendored seed contract — nothing checks the CLI copy still matches `packages/matrix`.                                                                                                                                           | Done          | refactor | easy       |
| CLI-388 | Machine-readable product data: `search --json` / `catalog --json` — now also the stacks and the preload mapping, so stack-detect's intent mode and load deference can read them (SKILLS-10 found no run-time route exists).                        | Ready for Dev | feature  | complex    |
| CLI-405 | Derive `requires`/`needsAny` from framework-support surfaces — CONDITIONAL derivation only (B11 proved the mechanical rule breaks on setup-env: adapters of a self-sufficient neutral core must not derive a fence). Blocked on SKILLS-01 phase 2. | Ready for Dev | feature  | complex    |

## Testing & E2E coverage

| ID      | Task                                                                                                                        | Status        | Type     | Complexity |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| D-235   | E2E gap: `buildProjectTypesExtras` new-domain/category path is uncovered.                                                   | Ready for Dev | refactor | easy       |
| D-234   | E2E config inspection via `loadProjectConfig` instead of regex-on-`config.ts`.                                              | Done          | refactor | complex    |
| D-219   | E2E fixture-default ergonomics. [Plan](./plans/D-219-wizard-launcher-default-fixture.md)                                    | Ready for Dev | refactor | complex    |
| D-168   | Audit E2E tests — replace manual file construction with CLI commands.                                                       | Ready for Dev | refactor | complex    |
| D-111   | Replace E2E text anchors with stable test identifiers.                                                                      | Investigate   | refactor | complex    |
| D-64    | Create CLI E2E testing skill + update `cli-framework-oclif-ink`.                                                            | Ready for Dev | feature  | complex    |
| CLI-321 | (was P4-18) Test multiple skill/agent creation — depends on CLI-320.                                                        | Deferred      | refactor | complex    |
| CLI-328 | (was expressive-ts decision 6) `e2e/pages/constants.ts` re-declares production constants inconsistently.                    | Investigate   | refactor | easy       |
| CLI-335 | `e2e/interactive/init-wizard-filter-incompatible.e2e.test.ts` — 1 test, gated on `FILTER_INCOMPATIBLE`.                     | Ready for Dev | refactor | easy       |
| CLI-336 | `e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts` — 1 test, same flag.                                     | Ready for Dev | refactor | easy       |
| CLI-337 | `e2e/interactive/init-wizard-sources-cancel-persists.e2e.test.ts` — 1 test, gated on the settings overlay.                  | Ready for Dev | refactor | easy       |
| CLI-338 | E2E: `build plugins` on the E2E source → initial compile produces `plugin.json` at version `1.0.0`.                         | Done          | refactor | easy       |
| CLI-339 | E2E: `build plugins` after editing a skill's SKILL.md → version bumps to `2.0.0` for that skill only.                       | Done          | refactor | easy       |
| CLI-340 | E2E: `build plugins` with no change → version stays at `2.0.0` (idempotent).                                                | Done          | refactor | easy       |
| CLI-341 | E2E: `build plugins` with multiple skills → only the modified skill's version increments.                                   | Done          | refactor | easy       |
| CLI-342 | E2E: `build plugins` then `build marketplace` → `marketplace.json` lists all skills at correct versions.                    | Done          | refactor | easy       |
| CLI-343 | E2E: `build marketplace` after a bump → `marketplace.json` reflects the updated version.                                    | Done          | refactor | easy       |
| CLI-344 | E2E: `build marketplace` output structure — each entry has `name`, `version`, `source`, `category`.                         | Done          | refactor | easy       |
| CLI-346 | E2E: `update` distinguishes globally-scoped skills from project-scoped ones — `globalResults` is never asserted.            | Done          | refactor | complex    |
| CLI-546 | `e2e/handrun-journeys.ts` hardcodes `/home/vince/dev/skills`, so journey 28a skips for everyone else.                       | Ready for Dev | refactor | easy       |
| CLI-595 | Ruling wanted: write the focus-walk finding's two page-object rules into `standards/e2e/page-objects.md`.                   | Ruling wanted | docs     | small      |
| CLI-596 | All ten E2E fixture skill slugs are already claimed by the default catalogue; inert today, armed for the first slug lookup. | Ready for Dev | fix      | small      |

## Tooling, gates & code generation

| ID      | Task                                                                                                                                                        | Status           | Type     | Complexity |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| CLI-355 | Enable ESLint `reportUnusedDisableDirectives` — unblocked now the baseline is zero.                                                                         | Done             | refactor | easy       |
| CLI-403 | Pre-commit routes matrix-only commits to the web side, so the CLI suite (which bundles matrix) never runs for them. Hook fix landed on owner go 2026-08-06. | Done             | bug      | easy       |
| CLI-356 | Adopt `eslint-plugin-react-hooks` for the CLI — an Ink codebase with no hooks linting at all.                                                               | Done             | refactor | easy       |
| CLI-357 | Add a lint guard against task IDs in test names.                                                                                                            | Done             | refactor | easy       |
| CLI-358 | Neither code generator runs in any gate, and `typecheck:scripts` is in no composite gate.                                                                   | Done             | refactor | complex    |
| D-11    | Development hooks for type checking.                                                                                                                        | Needs Assistance | feature  | complex    |

## Types & code quality

| ID      | Task                                                                                              | Status                  | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ---------- |
| D-153   | Standardize operation result types — consistent list/single-action return patterns.               | Deferred                | refactor | complex    |
| CLI-322 | (was R-06) Slim down `ResolvedSkill` — separate resolved relationship data from skill identity.   | Deferred — low priority | refactor | complex    |
| CLI-325 | (was expressive-ts decision 3) `readonly` on read-model types — `types/` has essentially none.    | Investigate             | refactor | complex    |
| CLI-326 | (was expressive-ts decision 4) wizard-store tombstone helper family — generic-isation. HIGH RISK. | Investigate             | refactor | complex    |
| CLI-327 | (was expressive-ts decision 5) `validateSelection` / `validateBuildStep` hardcode `valid: true`.  | Investigate             | refactor | easy       |
| CLI-330 | (was expressive-ts decision 8) `mock-matrices.ts` double cast hides a real key-shape mismatch.    | Investigate             | refactor | easy       |

## Telemetry

| ID    | Task                                                  | Status        | Type    | Complexity |
| ----- | ----------------------------------------------------- | ------------- | ------- | ---------- |
| D-170 | Add PostHog anonymous telemetry.                      | Investigate   | feature | complex    |
| D-90  | Add Sentry tracking for unresolved matrix references. | Ready for Dev | feature | complex    |

## Docs, agents & skills

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status                         | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------- | ---------- |
| D-237   | Create a GIF demo for the README.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev                  | feature  | complex    |
| CLI-499 | Split out of CLI-463 (2026-08-16): the internal identifier rename that follows the surface — 263 distinct identifiers containing `source`/`Source` across src and e2e, 20 exported types, 37 exported functions (5 of which mean SOURCE CODE and are excluded), 53 files with `source` in the filename including one directory and one generated file, and 384 test names. Mechanical, uncoupled to CLI-498, and deliberately NOT in Track A. Respect CLI-463's MUST NOT RENAME list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Deferred                       | refactor | complex    |
| CLI-500 | Split out of CLI-463 (2026-08-16): the documentation pass for the marketplace vocabulary — 241 files under `.ai-docs/` carrying 3,680 occurrences, plus the www content files. Runs AFTER the surface and field renames so it documents the end state once. Note the audit's separate finding that committed `apps/www/dist/` build output still documents `--source` as a `BaseCommand` flag inherited by every command, which stopped being true when the flag narrowed to init — it is tracked, so it pollutes any repo-wide grep during this work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Deferred                       | refactor | medium     |
| CLI-472 | Resolves on the owner's next marketplace publish: the missing `meta-reviewing-infra-reviewing` ships and the catalog↔marketplace drift closes. RESIDUAL RULED 2026-08-09: eject KEEPS dying on an unreachable/missing catalog skill — no skip-with-warning; the hard failure is the intended behavior. Remaining action: verify `eject skills` succeeds after the publish, then close.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Waiting on marketplace publish | bug      | easy       |
| CLI-473 | The init hook resolves a source for a reader that does not exist: `BaseCommand.sourceConfig` has no readers anywhere (finding 2026-08-09). Delete the stash + the hook's dead half, caller-checked. Owner 2026-08-09: DO IT, in a separate session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev — next session   | refactor | easy       |
| CLI-474 | The PUBLISHED marketplace ships 17 skills whose `category` the CLI's enum rejects (`api-database` ×16 incl. drizzle/prisma — pulled in by the first two default stacks — and `api-framework` ×1), so a default install's doctor exits 1 (fourth pass, causal control proven). Almost certainly the taxonomy split awaiting the owner's publish — verify green after publishing, else reconcile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Waiting on marketplace publish | bug      | medium     |
| CLI-477 | Nothing enforces that every slug in `defaultRules` exists in the default catalog (built-in-catalogue.md invariant 4) — the old warning spam was never a staleness signal, and after CLI-471's narrowing a stale built-in slug vanishes silently for custom sources. One cheap test: every defaultRules slug ∈ the vendored catalog's slugs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev                  | test     | easy       |
| CLI-492 | Which agent definitions feed config-types differs by entry point (pass-5 L-20 residue, adjudicated): init's write + the background loader see CLI∪source definitions, edit's write + compile's refresh see CLI-only — so a source-defined agent name can enter the generated unions from one path and never compile. Align all three on CLI-only (matches compile reality and agent-system.md's partials contract). Same change fixes `load-agent-defs.ts`'s false JSDoc ("source overrides CLI" — the wiring hardcodes `undefined`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev                  | bug      | medium     |
| CLI-493 | Pass-5 doc corrections, one batch (adjudicated, no code): (a) M-2's three sites — `built-in-catalogue.md` invariant 2 rescoped to the roster, the relevance gate added to `scope-split.md`'s decision table (its legacy sentence is false) and `agent-system.md`'s D-220 section; (b) `scope-system.md`'s CategoryGrid badge notation nit (L-25); (c) user-journeys.md journey 10: `update` delegates to `claude plugin marketplace update <name>`, not `claude plugin update`; (d) convention-keeper re-status of the two findings CLI-481 obsoleted (2026-08-06 category-dropped → resolved/partial; 2026-08-07 never-reaches-dist → its central claim is now false). **UPDATED 2026-08-17: leg (c) is DONE** — the journey-10 `plugin marketplace update <name>` correction now sits in the row on `user-journeys.md` rather than as a trailing paragraph. **And this row's STEP_TEXT figure is itself stale twice over**: it records `139 -> 149`; the count was 165 after the morning's pass and is **167** now, the two new members being `SHARED_CONFIG_KEPT_UNPLACEABLE` and `SHARED_CONFIG_KEPT_UNPLACEABLE_REMEDY`. So `standards/e2e/README.md`'s `edit --from` apply group lists 8 where there are 10 — and that row carries its own warning that an exhaustive list which is short is worse than a glob, which now describes itself. `reference/testing/e2e-infrastructure.md` needs the same re-derivation; do it by running `Object.keys(STEP_TEXT).length`, never by adjusting a printed number.                                                                                                                                                                                                                                                               | Ready for Dev                  | docs     | easy       |
| CLI-496 | The global source-migration propagation defect is still live on a narrower path (found while landing CLI-479). `recordGlobalSourceMigrations` writes the global config raw, outside the fan-out, and the sequence "mode change committed on the project half of a `[P][G]` pair, then a P→G collapse in the same session" still reaches it — so other registered projects do not see the migration. The old route (the bulk hotkey) is gone, which CLOSED the only spec that covered this BY CONSTRUCTION rather than fixing it: `e2e/lifecycle/edit-project-source-migration-propagates.e2e.test.ts` is now `describe.skip` and its header carries the reproduction for the narrower path. Nothing tests this today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev                  | bug      | medium     |
| CLI-497 | `SOURCE_ROW_WALK_LENGTH` in `e2e/pages/steps/sources-step.ts` is a fixture-sized constant (12), safe only while `setAllLocal()`/`setAllPlugin()` are reached exclusively from `createE2ESource`-derived sources. A spec driving a source with more than twelve skills would silently UNDER-walk and pass vacuously. Fix: a closed-loop walk — the focused cell paints `UI_SYMBOLS.CHEVRON`, so focus is readable under NO_COLOR — walking until focus returns to the first row. Deferred deliberately when CLI-479 landed: new page-object machinery, outside that ruling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Ready for Dev                  | test     | easy       |
| CLI-502 | DOWNGRADED 2026-08-16 (owner: custom marketplaces do NOT need relationship rules for now; eventually AI generates them on the fly, which fits leg 2's intake where AI already suggests a category). NOT a leg-1 blocker. `relationships` is `exactOptional()` on `skillRulesFileSchema`, so a marketplace shipping `{ version: "1.0.0" }` and nothing else loads fine — the marketplace works. What remains is a BAD FAILURE, not a missing capability: `skillRefInRules = skillSlugSchema = z.enum(SKILL_SLUGS)` is the CLI's own generated union, so an author who names their OWN skill in `config/skill-rules.ts` gets a Zod error enumerating all ~250 catalogue slugs and `checkCrossReferences` silently degrades to "Cross-reference validation skipped". Two small fixes: (1) the refusal must say WHY — relationship rules may only name skills the public catalogue carries, and this marketplace's own skills cannot be named there yet — instead of dumping the union; (2) `creating-a-marketplace.md` — DONE 2026-08-17: it now states the constraint, shows the no-relationships file and says what is lost. **A second defect was found and fixed in the same text**: it first showed `export const skillRules = …`, and `loadConfig` calls `jiti.import(path, { default: true })`, so a named export loads as NO CONFIG and `doctor` blames a missing `version` in a file that has one — the author is sent hunting in the wrong place. The guide now shows `export default`, and `new marketplace` scaffolds all three config files as default exports with an e2e spec pinning it. When AI generation lands, revisit: it will need slugs to leave the closed union, which is the CLI-498 sub-question nobody has ruled (ids are namespaced, slugs are not). | Ready for Dev                  | bug      | easy       |
| CLI-467 | DEFERRED (owner 2026-08-09: "we will get to knip later") — the knip deletion rounds: rule the baseline's categories (197 barrel lines, 53 export keywords, 35 zero-ref symbols, 11 devDeps, 3 duplicates, remaining unlisted deps incl. test-side ansis) and execute per class. Baseline: todo/plans/CLI-464-dead-code-baseline-2026-08-09.md. chalk fixed separately 2026-08-09.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Deferred                       | refactor | medium     |
| CLI-453 | DEFERRED — re-add `new skill`, NOT part of the go-live home stretch (owner 2026-08-09: go live without it, consider later). When built, it mimics the editor's intake flow — which is why it waits for that flow to settle, not the other way round.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Deferred                       | feature  | medium     |
| D-180   | Write a "Bring your own skills" guide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Investigate                    | feature  | easy       |
| D-162   | Skill Olympics — benchmark the expressive-typescript skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Investigate                    | refactor | complex    |
| D-138   | Iterate on sub-agents — review and improve all agent definitions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev                  | refactor | complex    |
| D-66    | AI-assisted PR review: categorize diffs by type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Investigate                    | feature  | complex    |
| D-62    | Review default stacks: add reviewing / research / methodology skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev                  | feature  | complex    |
| D-41    | Create the `agents-inc` configuration skill. [Plan](./plans/D-41-config-sub-agent.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev                  | feature  | complex    |
| D-01    | Update skill documentation conventions — folder structure instead of `examples-*.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Needs Assistance               | refactor | complex    |
| CLI-317 | (was UX-13) Add readable schemas on sub-agents and skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Needs Assistance               | feature  | complex    |
| CLI-319 | (was #19) Sub-agent learning capture system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Needs Assistance               | feature  | complex    |
| CLI-380 | Complete the infra domain roster (developer, pm, researcher, tester) — deferred at CLI-351's landing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Deferred                       | feature  | complex    |
| CLI-382 | Bind wizard roster constants and test expected-values to `AGENT_NAMES` — additions caught by nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Investigate                    | refactor | easy       |
| CLI-383 | No stack assigns any ai-domain agent — curate AI stacks now five ai agents exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Needs Assistance               | feature  | complex    |
| CLI-384 | Six shipped agents bake repo-internal paths (`.ai-docs/…`, CLAUDE.md) into product prompts — decide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Investigate                    | refactor | easy       |
| CLI-360 | Document `lib/skills/source-switcher.ts` and `generators.ts` — the two undocumented `lib/skills` modules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev                  | refactor | easy       |
| CLI-425 | Invariant (owner 2026-08-07): a skill id always includes its category. 33 violations audited; ALL renames parked until the very end. [List](./plans/CLI-425-id-category-violations.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Deferred                       | refactor | complex    |
| CLI-361 | `scripts/generate-json-schemas.ts` cannot be tested — `generate()` runs at module scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ready for Dev                  | refactor | easy       |
| CLI-366 | Snapshot discipline — rule 6.17a's two required snapshots were regenerated to agree with a wrong change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Investigate                    | refactor | easy       |

---

## Reminders for agents

See [docs/cli/guides/agent-reminders.md](../docs/cli/guides/agent-reminders.md) for the full list of
rules (use specialized agents, handle uncertainties, blockers, commit policy, archiving, status
updates, context compaction).

---

## Active Tasks

### Bugs

#### D-307: Wizard root `useInput` steals `s` from the add-source text input

**Flag status (owner decision, 2026-08-02): surface hidden, defect intact.** The settings overlay and
its `s` hotkey are gated behind `FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY` (default `false`,
`feature-flags.ts`), and the 7 e2e specs that drive the overlay are `skipIf`-gated on the same flag.
Nothing below is fixed — the flag only makes the broken path unreachable. The work is: fix the input
handling, then flip the flag on, then un-gate the 7 specs.

Found 2026-08-02 by an e2e author and verified empirically against the source.

**Cause.** The root `useInput` in `src/cli/components/wizard/wizard.tsx` opens with a
`store.showSettings` branch (lines 133-138) that claims `HOTKEY_SETTINGS` unconditionally. Ink fires
every mounted `useInput` for the same keystroke, so that branch also runs while the settings overlay's
add-source TEXT INPUT is open — the one place an `s` is data rather than a command.

**Consequence.** `toggleSettings()` closes the overlay mid-word and unmounts `StepSettings` along with
its input handler. The characters after the `s` fall through to the sources grid, where
`HOTKEY_SET_ALL_LOCAL` (`l`) and `HOTKEY_SET_ALL_PLUGIN` (`p`) are hotkeys and Enter advances the
step. No source URL containing an `s` can be entered interactively at all — `https` alone is enough to
disqualify nearly every real URL.

**Workaround already in tree.** `e2e/interactive/init-wizard-sources-cancel-persists.e2e.test.ts`
reaches its marketplace through a deliberately `s`-free relative symlink path. Its JSDoc documents this
defect and records that a spec for the defect itself belongs with the sources step's input handling —
so that file is the reference repro, not a second place to fix.

**Fix direction.** Text-input focus must suppress the root hotkey handler: scope the root `useInput` on
whether a text input owns the keyboard. The parts are nearly there already — `StepSettings` holds the
add-source modal in local `useModalState` and correctly scopes its own `useKeyboardNavigation` with
`active: !addModal.isOpen` — but nothing above the step can read that flag. Lift it to one source of
truth (a field beside `showSettings` in `wizard-store.ts`, or Ink's `isActive` option on the root hook)
so both handlers answer the same question. `step-settings.tsx` is the only `useTextInput` consumer
today, so the blast radius is that hook's owner plus the root branch.

**Tests.** Type a URL containing `s` into the add-source input: the overlay stays open, the value
accumulates whole, Enter registers the source, and the sources grid never sees the characters. With the
input shut, ESC and the `s`-to-close binding must both still work.

---

#### D-266: Scroll gates stop clipping below `MIN_VIEWPORT_ROWS`

**Still open.** Two symptoms were removed in the 2026-07-31 wizard-UI pass without touching the cause,
so the cliff is intact — it is simply harder to walk off.

**Cause.** `useRowScroll` / `useSectionScroll` disable clipping entirely when the computed viewport
falls below `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS` (5). Content then overflows and paints through whatever
sits below it — hotkey row, footer, box borders.

**What already changed (do not re-do):**

- `MIN_TERMINAL_SIZE` (`COLS: 80`, `ROWS: 20`) is now one constant read by both
  `BaseCommand.ensureTerminalSize()` and a `WizardLayout` guard, so shrinking mid-session shows the
  resize prompt instead of a shredded frame. Previously the check ran once before render and a dead
  `MIN_TERMINAL_HEIGHT` constant with zero importers sat alongside it.
- `LOGO_MIN_TERMINAL_ROWS = 26` hides the ASCII logo on the stack step below that height. The logo's 6
  rows were what starved that step's viewport past the cliff at 20 and 24 rows.

**Measured on the real binary (100 cols), pre-fix:** build step corrupt at 16/17, first clean at 18;
stack step corrupt at 20 and 24 with the logo, clean at 26+.

**Accepted, not a defect:** the Skills grid discards `hiddenAbove`/`hiddenBelow` and Domains / Agents /
Stack use `useRowScroll`, which never computes them — so those steps clip silently with no
`N more below`. Owner's call: on a grid that dense it is self-evident. Recorded at each call site.

**The remaining fix** is to make the shared hooks clip-and-signal instead of bailing out, so no
combination of chrome and terminal height can bleed. The mechanism, recorded when the class was first traced: a precondition read once before render is
not a gate — the viewport it measured can change under it, and the hook that bailed out on a bad
measurement leaves no signal behind, so the clip is indistinguishable from there being nothing more
to show.

---

#### D-214: Matrix composition hardening — prereq to re-enabling `new marketplace`

`cc new marketplace` scaffolds a marketplace repo, creates a starter skill, and runs `build marketplace`
at the end. The output is a working tree that users can then consume via `cc init --source <their-marketplace>`.
But the runtime matrix composition pipeline on the consumer side has ~20 hardening gaps surfaced by a
10-agent investigation. Scaffolding a marketplace today produces infrastructure built on a shaky
foundation. **`new marketplace` is currently disabled behind `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND`**
until the gaps below are addressed.

**The scaffold itself works.** Files get written correctly. The problem is what happens when someone
consumes the scaffolded marketplace.

##### Must-fix before flipping the flag

High-impact correctness bugs where broken output happens silently:

1. **Duplicate skill IDs silently overwrite** in `mergeMatrixWithSkills` (`src/cli/lib/matrix/skill-resolution.ts`).
   Order depends on glob. Add a dedup warn matching the existing one for duplicate slugs.
2. **Invalid YAML in a single `metadata.yaml` crashes the whole matrix load** (`extractAllSkills` in
   `matrix-loader.ts` wraps `parseYaml` with no try/catch). Mirror `loadAllAgents`, which
   warns-and-continues per-file.
3. **Custom skill slugs are never added to `slugMap`.** `mergeLocalSkillsIntoMatrix` skips
   `buildSlugMap`. `getSkillBySlug("my-custom-slug")` throws. Users cannot reference their own skills by
   slug from stacks or relationship rules.
4. **Partial `requires` resolution pretends to be complete.** `resolveRelationships` filters out
   unresolved slugs then proceeds with the remaining subset — `needsAny: false` (AND) silently narrows
   to "AND of whatever resolved". Should fail the rule.
5. **`"imported" as CategoryPath`** in `commands/search.ts:142` — illegal union widening
   (`CategoryPath = Category | "local"`). Either widen the type or change the display model.
6. **Extras cannot participate in the relationship graph.** Extra sources' `skill-rules.ts` is never
   read. A skill shipped in an extra with `requires: [...]` has no effect. Either compose extras' rules
   too or document loudly that extras are skills-only tagging.
7. **Unresolved slugs drop before `checkMatrixHealth`** — there is no way for `validate` to surface a
   slug typo in a marketplace's `skill-rules.ts`. Return `unresolvedSlugs[]` from `mergeMatrixWithSkills`
   and have `checkMatrixHealth` flag them as errors.

##### Should-fix before flipping the flag

8. Scope category auto-synthesis to `custom: true` only. Today a built-in skill referencing an unknown
   category silently gets an `order: 999` stub instead of failing loudly — masks marketplace drift.
9. Eliminate the **double `initializeMatrix` write** in `source-loader.ts` (intermediate write at `:278`
   before the real one at `:146`). Footgun for any consumer reading between those two points.
10. Extract a non-mutating **`computeMatrix()`** for `source-validator.ts` and `config-types-writer.ts`
    — they currently mutate the global singleton as a side effect.
11. **Deduplicate the `metadata.yaml` loader schemas.** Inline `rawMetadataSchema` in `matrix-loader.ts`
    is ~70% overlap with `localRawMetadataSchema` but omits the `validateCategoryField` superRefine.
12. **Alternatives dedup** — the same `(skillId, purpose)` can appear multiple times if declared twice.
13. **Duplicate slug reverse map** — `buildSlugMap` only writes `idToSlug` when `slugToId` was free, so
    the loser's reverse entry is missing entirely.
14. **Delete dead `MergedSkillsMatrix.version`** and `agentDefinedDomains?` fields.
15. **Shared `publishMetadataBase`** extended for strict + custom variants (kills the 90% duplication
    between `metadataValidationSchema` and `customMetadataValidationSchema`).
16. **Synthesized-category domain consistency** — warn if two skills trigger synthesis on the same
    category with different domains.

##### Nice-to-have

17. **Cycle detection** in the `requires` graph.
18. **Stack reference validation** against the matrix (currently warn-only in `stacks-loader.ts:117`).
19. **Shared `jiti` instance** with `moduleCache: true` (`config-loader.ts`). ~300–900 ms win per
    custom-source load.
20. **JSON Schema generation** alongside Zod — so marketplaces can self-validate against the CLI version
    they target.
21. **`ForeignSkillId` brand** for multi-source IDs to eliminate `as SkillId` casts at the multi-source
    boundary.
22. **Order-stable matrix serialization** (sort `resolvedSkills` and `synthesizedCategories` keys).

##### Edge cases that would break today

- Marketplace author's `metadata.yaml` has a typo → whole matrix load fails with no file path in the error
- Custom skill has slug `react` (collides with built-in) → built-in loses, every rule referencing `react`
  silently routes to the custom skill
- Extra source ships a novel skill with its own category → skill drops from the wizard, no warning
- Marketplace `skill-rules.ts` has a typo slug → dropped silently
- Two skills in the same source declare the same ID → second silently wins
- Custom skill with `domain: "my-domain"` (not in the closed `DOMAINS` union) → invisible in every domain tab

##### Related

- **D-212** (custom skill lifecycle) — overlapping concerns with items 3 and 13. Fix together.
- **D-213** (custom agent lifecycle) — overlapping concerns with the "scaffolded but not wired" pattern.
- **CLI-323** — env-var override for feature flags, so these gated commands can have tests re-enabled
  without flipping source.

##### Re-enabling

Once items 1–7 and 8–10 are resolved and tests confirm multi-source marketplaces compose correctly:

1. Flip `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND` to `true`
2. Un-skip `new/marketplace.test.ts` and `new-marketplace.e2e.test.ts` (CLI-334)
3. Add an E2E test: `new marketplace` → consumer `init --source <new-mkt>` → skill works end-to-end
4. Close D-212, D-213, D-214 together

---

#### D-212: Custom skill lifecycle — install-pipeline bug + sources-step UX + scaffold messaging

A user creates a custom skill via `new skill my-skill`, opens `cc edit`, toggles it on, and gets a
warning at install time:

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

The pipeline tries to install the custom skill as a marketplace plugin, the marketplace does not have it
(because the user just created it locally), and the install fails. Agents recompile fine — they pick up
the skill content from disk — so the end state is _usable_, but the user sees a scary warning and the
skill is in a confused state (config says marketplace source, install failed, content found via local
fallback).

**Root cause:** the sources step allows selecting "plugin (marketplace)" as the source for a
`custom: true` skill. A custom skill by definition does not exist in any registered marketplace — the
only valid source is local/eject. The install pipeline then honours the user's selection.

**Required fixes (two places, both thin):**

1. **Sources step UI (`step-sources.tsx` / `source-grid.tsx`)** — for any skill with `custom: true`,
   restrict the source options to `eject` only. Grey out / skip rendering of the marketplace column for
   that row. Same mechanism that currently disables source switching for non-installable skills.
2. **Install pipeline (`claudePluginInstall` / `compileAllScopes` / wherever the marketplace dispatch
   happens)** — defensively check `skill.custom === true` before attempting marketplace install. If
   custom, skip the plugin install entirely and treat as local-only, regardless of what the SkillConfig
   says.

**Key files:** `src/cli/components/wizard/step-sources.tsx`, `source-grid.tsx`,
`src/cli/stores/wizard-store.ts`, `src/cli/lib/installation/`, `src/cli/lib/plugins/`.

**Related UX gaps from the `new skill` investigation:**

- **Misleading completion message.** `src/cli/commands/new/skill.ts` ends with
  `"Run 'cc compile' to include it in your agents."` This is wrong — `compile` only recompiles against
  `config.skills` and scaffolding does not update that array. Correct message:
  `"Run 'cc edit' to add this skill to your installation, or hand-edit .claude-src/config.ts."`
- **No single-step path from `new skill` to installed.** Either an interactive prompt at the end of
  `new skill` ("Add to current installation? [y/N]" → append SkillConfig with `source: "eject"` + run
  `compileAgents`) or an `--install` flag doing the same non-interactively.
- **`cc list` does not show scaffolded-but-unconfigured skills.** Consider a "Scaffolded (not
  configured)" section reading from `discoverLocalSkills()` minus the ones already in `config.skills`.
- **[FIXED by D-228, v0.141.0 — verified 2026-08-06; kept for context only]** **`config-types.ts` regresses to a flat listing after a custom-skill install.** Before installing, the
  project's `config-types.ts` uses the extend-global shape:

  ```ts
  import type {
    SkillId as GlobalSkillId,
    AgentName as GlobalAgentName,
    Domain as GlobalDomain,
    Category as GlobalCategory,
  } from "../../../../.claude-src/config-types"

  export type SkillId = GlobalSkillId | "custom-skill2"
  export type AgentName = GlobalAgentName
  ```

  After installing the custom skill via `cc edit`, it rewrites to a flat enumeration instead. Losing the
  `GlobalSkillId` import means the project's types are no longer coupled to the global
  `config-types.ts` — any global-only change will not flow into the project's union. **Where to look:**
  `src/cli/lib/configuration/config-types-writer.ts` — two codegen paths. Find the flag or context that
  triggers the shape change and force the extend-global shape for project-scope regenerations.

**Out of scope but related:** what does `source: 'eject'` mean for a skill that was created locally and
was never in any marketplace? The `source` field's discriminator is doing two jobs — "install mode" and
"origin".

---

#### CLI-331 (was Bug 4): `edit` warns but keeps recompiling when the config write fails

`src/cli/commands/edit.tsx:713-715` wraps `writeProjectConfig` in a try/catch whose handler is
`this.warn(\`Could not update config: ...\`)`. The command then continues into `compileAgentsAllScopes`and exits 0.`config.ts`was not updated, but the plugin registry and`.claude/agents/` were written
earlier — three-way drift, invisible to the user, and it compounds subsequent test failures by obscuring
root causes.

Full error-swallowing audit (finding I-08, 2026-04-22). Nine disk-write / registry sites classified —
2 KEEP, 5 PROMOTE, 2 RESTRUCTURE:

| Location                      | Swallowed failure                                | Recommended action                                                       |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `edit.tsx` config write       | `writeProjectConfig` failure                     | **PROMOTE**: warn → error with `EXIT_CODES.ERROR`                        |
| `edit.tsx` agent compile      | Agent compilation failure                        | **KEEP**: diagnostic-only; user can rerun `compile`                      |
| `edit.tsx` old-agent cleanup  | Stale `.md` left after a P→G scope migration     | **KEEP**: cosmetic                                                       |
| `edit.tsx` scope migration    | Per-skill plugin scope migration failure         | **RESTRUCTURE**: return the `{ failed }` result; caller decides          |
| `edit.tsx` plugin install     | Hard-errors before the config write              | **KEEP**: correct per CLAUDE.md                                          |
| `edit.tsx` plugin uninstall   | Warns and continues                              | **KEEP**: uninstall failures are diagnostic-only per spec                |
| `mode-migrator.ts` eject copy | Local skills not copied, config claims installed | **PROMOTE**: return `{ failed: [...] }`; caller hard-errors before write |
| `mode-migrator.ts` plugin     | Per-skill plugin install failure                 | **PROMOTE**: same                                                        |
| `local-installer.ts`          | `propagateGlobalChangesToProjects` per-project   | **RESTRUCTURE**: returns `{ updated, skipped }`; decide warn vs error    |

**Key finding.** The systemic gap is the eject-mode migration path in `mode-migrator.ts`. Failures are
swallowed into a warnings array, and the `edit.tsx` caller only logs those warnings — it does not
hard-error, so `writeProjectConfig` writes stale config entries for skills that never migrated.

**Dependency note.** The predecessor bug (`claudePluginUninstall` called with a bare skill ID instead of
`${id}@${marketplace}`) is done, so promoting warn → error will not fail legitimate source switches.
Fixing this may also unmask the true cause of the two tombstone-cleanup lifecycle failures it was
blocking.

---

#### CLI-359: `agent.liquid` reads snake_case frontmatter fields the model never carries

A rendering probe run during the 2026-08-02 documentation pass proved that `agent.permission_mode` and
`agent.disallowed_tools` in `agent.liquid` never resolve the camelCase `permissionMode` /
`disallowedTools` on `AgentConfig`, and no conversion exists anywhere. So `permissionMode` always emits
`default` and `disallowedTools` never emits at all.

It is latent only because no agent metadata declares either field yet. Recorded as a contrast in
`.ai-docs/reference/features/model-and-effort.md` (which establishes that the single-token
`model` / `effort` fields are unaffected) but **never traced to its callers**.

**Warning attached to it:** do not "normalise" `model` / `effort` into the same shape while fixing this.
They work precisely because they are single-token.

---

#### CLI-363 (was the 2026-04-22 edit-mode scope-awareness audit)

`edit.tsx` threads TWO different directories through the pipeline — `installation.projectDir` for reads
and `cwd` for writes — and the criterion for "am I in global scope?" is inconsistent across layers.
With `cwd` a random directory holding only a global install:

| Layer                     | Criterion                                | Result                                                    |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| `runEditWizard`           | `cwd === GLOBAL_INSTALL_ROOT`            | `false` → scope toggle enabled in the UI                  |
| `writeConfigAndCompile`   | `realpath(cwd) !== realpath(homedir())`  | `true` → dual-pass compile, creates a stray `.claude-src` |
| `writeProjectConfig`      | same as above                            | same                                                      |
| `discoverAllPluginSkills` | uses `installation.projectDir` (correct) | reads `~/.claude/settings.json`                           |
| `discoverInstalledSkills` | uses `cwd`                               | misses global plugins                                     |
| plugin install/uninstall  | passes `cwd`                             | registers against the wrong working dir                   |

Three gaps surface in one session: `isEditingFromGlobalScope` uses cwd rather than the detected
installation; `isProjectContext` fabricates a project install from cwd; plugin uninstall is ambiguous at
the home directory (filed separately and since fixed). Severity high, status open, no fix applied — the
finding is investigation only and carries a prioritized file:line list.

---

#### CLI-364 (was `2026-07-29-qa-sweep-working-tree-v0144`): residuals from the live-CLI sweep

A 23-agent sweep drove the real built binary through every common use case in sandboxed environments.
Most of what it found was fixed in two same-day rounds (`list` "vplugin" header, the
`extraKnownMarketplaces` settings warning, global uninstall propagation, `compile` regenerating
`config-types.ts` at every scope, `validate` exiting 0 on healthy installs, the 38 missing
`defaultCategories` entries and their exclusivity corrections, plus several e2e page-object fixes).

**What was deliberately left open and still is:**

- ~~Two wrong `exclusive: true` entries~~ — resolved 2026-08-06 under CLI-389 decision 3 (owner
  ruling): `shared-monorepo` and `api-email` are non-exclusive; tests-first, all gates green.
- Duplicate header: `api-api` and `api-framework` both render "API Framework" in the API grid — Elysia
  sits alone in `api-framework` while its siblings are in `api-api`. Predates the 38 additions.
- The requires-enforcement model is advisory-only by design; the choice between strict-block,
  warn-but-allow-with-visible-labels, and a fixed F-filter is still pending. Related: `init.tsx`
  silently drops `result.validation` errors that `edit.tsx` surfaces as warnings — the one real
  init/edit asymmetry.
- `api-search-getxapi` / `api-search-xquik` are confirmed zero-file local test artifacts; delete manually.
- Optional marketplace content tidy-up: 45 skills carry a >60-char `cliDescription` and now warn.
  Shortening them and adding schema checks to the skills repo CI would silence the warnings at source.
- Marketplace-CI enforcement of the metadata schema was explicitly not done (the skills repo was untouched).

Also recorded there: the 38 derived `defaultCategories` displayName/description strings are product
content worth a human skim — the assumed source of truth `config/skill-categories.ts` does not exist in
the marketplace repo, verified including git history.

---

#### CLI-367: `validateBuildStep` has no production caller

`src/cli/lib/wizard/build-step-logic.ts` exports `validateBuildStep`, which computes a validation
message for required categories with no selection. It is exported from `lib/wizard/index.ts` and
exercised by two test files (`build-step-logic.test.ts`, `step-build.test.tsx`) — and called from
nowhere in production. `StepBuild`'s `useInput` calls `onContinue()` unconditionally.

Documentation claimed required categories block wizard advancement. **They do not.** Decide which is
true: wire the validator into `StepBuild` and make the claim real, or delete the function, its barrel
export and its tests and correct the docs.

Related: CLI-327, which covers the `valid: true` field on the same function's return.

---

### Wizard & CLI UX

#### D-276: Exclusive category — allow a project skill to override a global one

**Today:** in an exclusive (radio) category, selecting a different skill is refused outright when the
current selection is a globally-installed skill. `toggleTechnology`'s exclusive-swap guard in
`src/cli/stores/wizard-store.ts` computes `wouldDropLockedSkill` from `isGloballyLockedSkill` and
returns `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`; the conflicting skill is never added. A project with a
global React therefore cannot choose Angular from the wizard at all.

**Wanted:** allow the selection. The newly chosen skill is added at **project** scope, and the global
skill is masked in that project — exactly the derived conflict mask `maskCollidingGlobalSkills` /
`reconcileProjectSplitAgainstGlobal` in `src/cli/lib/installation/local-installer.ts` already produces.
That machinery works today but is only reachable from the opposite ordering, so the wizard cannot
currently express the intent.

**Toast:** confirm the override instead of leaving it implicit — owner's wording: "added project X skill
to override global Y". Needs a new `TOAST_MESSAGES` entry naming both skills.

**Constraints**

- The new entry must default to `scope: "project"`. The global-first default used for ordinary additions
  is wrong here; the point of the action is a project-local override.
- `s` stays the only way to change an existing global skill's own scope. This changes only what SPACE
  does when selecting a _different_ skill in an exclusive category.
- The global install is never touched: no edit to the global config, no uninstall. The mask exists only
  in the project's config.
- Self-heal must still apply — removing the project skill later has to unmask the global one, per the
  mask lifetime rule in `reconcileProjectSplitAgainstGlobal`.
- A required exclusive category must never end up with nothing active.
- This is **not** an exception to the rule that a global skill is immutable from project scope: the
  global entry is masked, never removed. The docs must state that explicitly or the two rules will read
  as contradictory.

**Tests:** the swap is allowed and lands at project scope; the toast names both skills; the written
project config holds the active project entry plus the global mask; the global config is byte-identical
afterwards; removing the project skill unmasks the global one; the Sources tab renders the pair correctly.

**Docs:** `.ai-docs/reference/concepts/scope-system.md`, `concepts/guard-pattern.md` (the exclusive-swap
guard entry), `concepts/tombstone-pattern.md` (a third route to a derived mask),
`wizard/state-transitions.md`, plus the user-facing scope guidance under `docs/`.

---

#### D-280: Prune the built-in stack list

Vincent's guidance (2026-08-01): the list has grown past useful — 17 today, 6 of them Next.js variants
(`nextjs-fullstack`, `nextjs-t3-stack`, `nextjs-supabase-fullstack`, `nextjs-turborepo-fullstack`,
`nextjs-ai-saas`, `nextjs-saas-starter`). Target: **~2 Next.js, ~2 React, and one each for the other
front-end frameworks worth keeping (Solid, Svelte, Astro)**. Explicitly undecided:
`vue-modern-fullstack`, `nuxt-fullstack`, `angular-modern-fullstack`, `expo-mobile-fullstack`,
`cli-ink-oclif` — confirm keep/drop with him before cutting.

Consequences to handle: the editor's vendored catalog regenerates (its stack grid and `pruneUnknownIds`
cope with dropped ids by design); a shared payload naming a dropped `stackId` degrades gracefully —
since the `assignedStack` fidelity fix, a stack id only contributes a description on the `--from` path.

---

#### D-211: Reorder stack-selection render — scratch → React → other frameworks → CLI

The stack-selection step currently presents every available stack in a flat list. Reorder so the visual
hierarchy matches user intent and expected preselection frequency:

1. **Start from scratch** at the top — visually separated from the rest (blank line / divider below it)
2. **React stacks** — the most common starting point, rendered immediately after
3. **Other frameworks** — Vue, Angular, Svelte, SolidJS, Next.js, Remix, Nuxt, SvelteKit, Astro, Qwik
4. **CLI stacks** — at the bottom

**Key files:** `src/cli/components/wizard/step-stack.tsx`; the stack definitions in the skills source.
Check whether stacks already have a `category` or `domain` field that can drive the sort, or whether the
ordering needs to be declared explicitly (ID prefix, ordinal, group name).

**Open questions:** do stacks self-declare a section (`group: "react" | "framework" | "cli"`) or is
grouping inferred? Is the "scratch" option a real stack entry or a synthetic row? Should "other
frameworks" be alphabetical or manually ordered by popularity? Any visual treatment — divider row,
heading row, or just a blank line?

---

#### D-181: Add YOLO mode toggle to build step

Disables all skill relationship constraints (single-select categories, requires, conflicts, discourages)
so users can select any combination freely. Surface in the footer hotkeys. Full plan and open questions
in [./plans/D-181-yolo-mode-toggle.md](./plans/D-181-yolo-mode-toggle.md).

---

#### CLI-311 to CLI-316: the CLI UX backlog (was UX-04 … UX-09)

Carried from the old deferred backlog; each was sized S or M and none is blocked.

- **CLI-311 (UX-04)** Interactive skill search polish — manual testing plus tests for the interactive
  search component.
- **CLI-312 (UX-05)** Refine step, skills.sh integration — community skill alternatives in the Refine step.
- **CLI-313 (UX-06)** Search with colour highlighting — needs more UX thought before implementation.
- **CLI-314 (UX-07)** Incompatibility tooltips — show the reason when a disabled option is focused. Part
  of D-306's "surfacing" half.
- **CLI-315 (UX-08)** Keyboard shortcuts help overlay — in-wizard help for keybindings.
- **CLI-316 (UX-09)** Animations / transitions — polish pass for step transitions.

---

#### CLI-329 (was expressive-ts decision 7): glyph and label inconsistencies

All small but user-facing:

- `step-settings` renders a raw `>` where every other list uses `UI_SYMBOLS.CHEVRON` `❯` (likely
  unintended).
- doctor's "skip" glyph is a hyphen `-` versus the `UI_SYMBOLS` en-dash `–`.
- `UI_SYMBOLS.CHECKBOX_CHECKED` is a stale `[x]` while the UI actually renders `[✓]`.

**Separate naming decision in the same area:** `SOURCE_HEADER_NAMES` ("Local" / "Plugin") versus
`SOURCE_DISPLAY_NAMES` ("Eject" / "Agents Inc") describe the same sources with different words.
Co-locating them is safe either way; agreeing the vocabulary is the actual decision.

---

### Matrix, config & scope

#### D-306: Deeper incompatibility rules

(was D-278; renumbered after an ID collision was found in the completed rows on 2026-04-21. The
completed D-278 row is the unrelated Sources-tab diff task.)

Vincent's ask (2026-08-01): "more in-depth incompatibility rules." Scope needs pinning with him — the
two plausible readings are already tracked elsewhere, so this item is the umbrella:

- **Coverage (data)** — `docs/web/editor-todo.md` §7: 123 of 222 skills state no relationships at all,
  invisible to the incompatibility rule; also asks the schema to distinguish "audited, no conflicts"
  from "not audited yet" (today both read as two empty arrays).
- **Surfacing (UX)** — CLI-314, incompatibility tooltips.
- **Adjacent**: D-276 (exclusive/global scope conflict), D-181 (YOLO mode disables constraints), D-90
  (Sentry on unresolved matrix references).

What is NOT tracked anywhere — and is probably the ask — is richer rule **semantics**. Today's
vocabulary: `conflictsWith` (in-category, symmetric), `requires` (+ `needsAny` groups), `discourages`,
`compatibleWith` (noisy; the web rule deliberately ignores it), and per-category exclusivity. The web
derives every cross-category incompatibility purely through `requires` reachability. Candidate depth
directions to discuss before any code: authored cross-category conflicts, conditional rules (conflicts
only under a co-selection), machine-readable reasons carried in the data rather than derived, and
severity tiers (block vs discourage vs warn).

**Inherited residue (2026-08-07, from CLI-389's completion):** the accumulated `deferredToD306`
lines in `skill-audit.ts` (30 rows), and the one semantic the surviving vocabulary cannot
express — **"needs its host CHOSEN, not merely available"** (presence vs possibility), recorded
in `skills-and-matrix.md`. Any future re-add of positive-guidance or presence semantics starts
from that record.

---

#### CLI-324 (was expressive-ts decision 2): config-load leniency vs what the types promise

`projectConfigLoaderSchema` parses `agents[].name` and `selectedDomains` as plain strings — correct,
because custom agents and domains are legal at runtime — then casts to `ProjectConfig`, which promises
`AgentName` / `Domain[]`. So the types claim a narrowness the loader never checks. (The list shrank
with D-215: the flat `selectedAgents` field no longer exists.)

_Options:_ (i) honest unions on the config types (`AgentName | (string & {})`); (ii) validate built-ins
via the currently-dead bridge schemas, with an explicit branch for custom values.

_Blast radius:_ wide and semantic — this changes what every consumer of `ProjectConfig` can assume.

---

### Commands & lifecycle

#### D-213: Custom agent lifecycle — `new agent` depends on a compiled agent-summoner

Running `cc new agent dummy-agent` after a fresh install fails immediately:

```
Fetching agent-summoner from source...
 ›   Error: Agent 'agent-summoner' not found.
 ›
 ›   Run 'compile' first to generate agents.
```

Currently **disabled behind `FEATURE_FLAGS.NEW_AGENT_COMMAND`** (default `false`).

**Root problem:** `new agent` drives Claude via the `agent-summoner` meta-agent. The meta-agent has to
be resolvable at runtime, but the command looks in only two places:
`<projectDir>/.claude/agents/agent-summoner.md`, and
`getAgentDefinitions(source).sourcePath/.claude/agents/agent-summoner.md`. If the user's install does
not include `agent-summoner` in `config.agents`, the first fails; if their registered source does not
ship a compiled `agent-summoner.md`, the second fails too. The error then points at `cc compile`, which
will not help, because compile only rebuilds against `config.agents`.

**Required fixes:**

1. **Bundle a known-good `agent-summoner` template with the CLI.** Store the compiled meta-agent under
   `src/agents/agent-summoner.md` (or similar) and have `loadMetaAgent` fall back to it when the user's
   install and source both miss. This removes the "install it via wizard first" prerequisite entirely.
2. **Fix the error message** when the fallback is also missing. Current text says
   `"Run 'compile' first to generate agents."`, which is wrong.
3. **Output path.** The command writes to `<projectDir>/.claude/agents/_custom/` (non-standard). Regular
   agents land flat in `<projectDir>/.claude/agents/*.md`. Decide: keep `_custom/` as a quarantine dir
   and teach the install pipeline about it, OR flatten and add `custom: true` to frontmatter (the same
   discriminator pattern as skills).
4. **No installation wiring.** Like `new skill`, `new agent` scaffolds to disk but does not update
   `config.agents`. Same options as D-212: an interactive post-scaffold prompt, an `--install` flag, or
   accept the two-step flow but fix the completion message to say `cc edit`, not `cc compile`.
5. **Config-types regression** — verify the same shape regression from D-212 (the project
   `config-types.ts` collapsing from `GlobalAgentName | "custom-agent"` into a flat enumeration) does not
   also happen when a custom agent is added. If it does, fix in the same `config-types-writer.ts` pass.

**Re-enabling:** once gaps 1–5 are resolved, flip `FEATURE_FLAGS.NEW_AGENT_COMMAND` to `true` and
un-skip the tests (CLI-333).

---

#### D-179: Extract shared post-wizard pipeline into a ProjectLifecycle orchestrator

Dual-pass compile, copy locals, install plugins and write config are duplicated verbatim across the
`init` and `edit` commands.

---

#### D-14: Consume third-party marketplace skills

Create a command to download skills from external marketplaces and integrate them into the local skill
library using an AI agent (skill summoner).

```bash
agentsinc import skill https://example.com/marketplace/my-skill
agentsinc import skill github:someuser/their-skills --skill react-patterns
```

**Workflow:** download (fetch from the third-party source) → analyse (run the skill-summoner agent to
understand purpose and patterns) → adapt (to local conventions and format) → integrate (place in
`.claude/skills/` or the source marketplace) → validate.

**Implementation notes:** reuse `source-fetcher.ts` for git sources; create a `skill-summoner` /
`skill-importer` agent whose prompt covers the local skill format, how to extract key patterns from an
external skill, and how to handle conflicts with existing skills; consider licensing and attribution.

---

#### D-19: Improve template error messages

When template compilation fails, show which variables are missing and suggest which source files should
be created. [Plan](./plans/D-19-template-error-messages.md)

---

#### D-11: Development hooks for type checking

Add configurable development hooks that can run commands like `tsc --noEmit` after file changes:

1. **Opt-in / configurable** — users choose which commands run and can disable them.
2. **Works in this repo by default** — the CLI repo itself ships with hooks pre-configured.
3. **Multiple hook types** — post-edit (after file modifications), pre-commit, on-demand validation.

Implementation ideas: use the existing Claude Code hooks system if available; add `.claude/hooks.yaml`
or similar.

```yaml
hooks:
  post_edit:
    - command: "bun tsc --noEmit"
      enabled: true
      on_failure: warn # or "block"
  pre_commit:
    - command: "bun run format:check"
      enabled: true
```

Acceptance: hooks configurable per project; this repo has the tsc hook enabled by default; failures can
warn or block; easy to disable temporarily via env var or flag.

---

#### CLI-318 (was #5): Agents command for skill assignment

Implement an agents command that lets users assign specific skills to agents and configure whether those
skills are preloaded or loaded on demand. Gives fine-grained control over agent capabilities and
performance characteristics.

---

#### CLI-323 (was R-01): `FEATURE_FLAGS` gates in command `run()` bodies are unmockable from tests

Surfaced during D-212 while adding `NEW_SKILL_COMMAND: false` to gate `cc new skill`. When a test
invokes a command via `runCliCommand` (which calls `oclif.run({ root: CLI_ROOT })` → loads from
`./dist/commands/`), the feature-flag constants are **inlined by tsup during the bundle step**. There is
no live `import` of `feature-flags.js` in the compiled chunk. Consequence:

- `vi.mock("../../../feature-flags.js", ...)` cannot intercept a constant that no longer exists in the
  execution graph
- Every test exercising a `run()`-gated code path has to be `describe.skip`ed until the flag flips in source
- Coverage for the gated logic drops to zero while the flag is off — regressions can slip in

##### The fix — env-var override

Make `feature-flags.ts` read from `process.env` at call time so tests (and local dev) can enable
features without editing source:

```ts
// src/cli/lib/feature-flags.ts
const envFlag = (name: string, defaultValue: boolean): boolean => {
  const v = process.env[`AGENTSINC_FLAG_${name}`]
  if (v === "1" || v === "true") return true
  if (v === "0" || v === "false") return false
  return defaultValue
}

export const FEATURE_FLAGS = {
  SOURCE_SEARCH: envFlag("SOURCE_SEARCH", false),
  SOURCE_CHOICE: envFlag("SOURCE_CHOICE", false),
  INFO_PANEL: envFlag("INFO_PANEL", true),
  NEW_SKILL_COMMAND: envFlag("NEW_SKILL_COMMAND", false),
  NEW_AGENT_COMMAND: envFlag("NEW_AGENT_COMMAND", false),
  NEW_MARKETPLACE_COMMAND: envFlag("NEW_MARKETPLACE_COMMAND", false),
} as const
```

Tests set the env var in `beforeAll` / `beforeEach` and delete it in `afterAll`. Since
`feature-flags.ts` is re-evaluated on every process spawn (or every module load in Vitest workers), this
works for both unit tests (same process, careful of module cache) and E2E tests (child process via
`execa`, inherits env).

##### Migration

1. Update `src/cli/lib/feature-flags.ts` with the `envFlag` helper
2. Un-skip the `describe.skip` blocks in `src/cli/lib/__tests__/commands/new/skill.test.ts` (18 tests)
   and `e2e/commands/new-skill.e2e.test.ts` (14 tests)
3. Add `beforeAll` hooks setting `AGENTSINC_FLAG_NEW_SKILL_COMMAND=1`
4. For E2E, update the harness (`e2e/fixtures/cli.ts` or `runCLI`) to pass through `AGENTSINC_FLAG_*`
   env vars so individual tests do not have to
5. Verify all 32 previously-skipped tests pass

##### Consequences

- **Pro:** any future `FEATURE_FLAGS` gate gets free test coverage.
- **Pro:** local dev can enable experimental features without editing source
  (`AGENTSINC_FLAG_SOURCE_SEARCH=1 cc init`).
- **Con:** flags are now process-env-coupled; CI must not leak env vars between suites (explicit
  `afterAll` cleanup).
- **Con:** tsup can no longer dead-code-eliminate the disabled branches. Bundle size barely changes —
  single boolean reads.

**Priority:** low on its own, but it unblocks CLI-332 through CLI-334 and the 32 skipped unit/E2E tests.
If another flag-gated command is added before D-212 resolves, bump to blocker.

---

### Web ↔ CLI integration

#### CLI-352: A drift guard on the vendored seed contract

`packages/cli/src/cli/lib/seed/seed-schema.ts` is a hand-kept copy of `packages/matrix/src/seed.ts` and
nothing checks that the two still agree — divergence would surface at decode time, on a user's machine,
rather than in CI. Add a check comparing them.

The reason for copying rather than depending has expired, and the vendored file says so itself: the two
repositories merged, so `@workspace/matrix` is a workspace sibling that could be depended on directly.
What keeps the copy is that `@agents-inc/cli` ships to npm while `@workspace/matrix` is private, so a
dependency would have to be bundled. De-duplicating properly is D-239's job.

---

#### CLI-353: Decide what `init --from <id>` overriding an existing install means

The easy half is done: with an id, `init` no longer returns early on an already-initialised project
(`init.tsx:247`), so a shared config overrides one at the root. A bare `init` keeps today's dashboard
behaviour untouched — the divergence is the id, not the command.

**What "override" means is still open, and the two readings differ materially.** Today the CLI writes the
config and installs what the payload names, which leaves behind any skill the _previous_ config
installed and this one omits — so the project ends up as the union of both. That is not the
configuration that was shared, and the difference is invisible until somebody wonders why an agent has a
skill nobody picked. Making the project actually match the payload means removing those, which is
destructive and wants either a confirmation or an explicit flag. `uninstall` already exists, so the
machinery is probably there.

Non-interactive runs are the wrinkle: there is nobody to confirm to, and the whole point of the id path
is that it works headless. Prompting when a TTY exists and requiring a flag when it does not is the usual
shape.

---

#### CLI-354: `agents-inc share`

Map an installed `ProjectConfig` to a `SeedPayload` and POST it to `api.agentsinc.sh/configs`, so the
CLI can mint ids too. Until then only the web creates them — an accepted pre-release limitation; the
endpoint itself is client-agnostic.

The `edit --ui` round trip (seeding the web UI from an existing project) is no longer separate work —
everything else it needs already exists. The editor consumes shared ids, and the CLI's `lib/seed/`
already fetches, validates and maps them for `init --from`. Once this item lands, `edit --ui` is a flag
that composes it: map, POST, open the browser on the returned id. The install dialog no longer
advertises the flag — EDITOR-04 removed the premature line (landed 2026-08-06, see `archive.md`).

---

### Testing & E2E coverage

> **Read before writing any test.** This codebase contains known bugs; all tests passing is a red flag,
> not a goal. Assert exactly what the CLI _should_ do, not what it currently does. A failing test is a
> FINDING — never weaken the assertion to make it pass. Use `it.fails()` for known bugs. Never accept
> multiple outcomes in one assertion. The authoritative text lives in `.ai-docs/standards/e2e/README.md`
> and `.ai-docs/standards/e2e/patterns.md`.

#### D-235: E2E gap — `buildProjectTypesExtras` new-domain/category path

When a project-scoped skill introduces a domain or category not present in global, the writer extends the
`Domain` / `Category` unions in the project's `config-types.ts` accordingly. The unit tests for
`buildProjectTypesExtras` silently no-op through this branch (the mock matrix does not include the
relevant skills). No E2E asserts the behaviour end-to-end.

**Scenario to drive:** global init with web-domain skills only → project edit selecting an api-domain
skill at project scope → assert the project `.claude-src/config-types.ts` contains
`export type Domain = GlobalDomain | "api"` and the matching `Category` extension.

Surfaced by the 0.141.0 E2E-gap audit (2026-04-21).

---

#### D-234: E2E config inspection via `loadProjectConfig` instead of regex

Five E2E lifecycle tests hand-roll near-duplicate parsers that regex-scan or brace-match raw `config.ts`
text. All target the same writer output (`generateConfigSource`) and break silently when its shape
changes (for example the D-215 reshape, or Prettier on `config.ts`):

- `e2e/lifecycle/preloaded-preservation.e2e.test.ts` — `extractStack` (brace-match + `JSON.parse`)
- `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts` — `extractStack` + `findAssignment` (replicated)
- `e2e/lifecycle/re-edit-cycles.e2e.test.ts` — `parseConfigArrays` (two-strategy regex fallback)
- `e2e/lifecycle/dual-scope-edit-integrity.e2e.test.ts` — `extractAgentKeys` (inline regex)
- `e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts` — `parseSkillEntries` (relies on the
  compact `JSON.stringify` shape)

**Fix direction:** land a shared `e2e/helpers/config-reader.ts` wrapping `loadProjectConfig` (jiti-based
TS eval) exposing typed accessors — `readProjectSkills`, `readProjectStack`, `readProjectAgents`,
`readProjectDomains`, or a single `readProjectConfig`. Migrate all five tests off their local parsers and
delete the helpers.

The CLI's jiti load already handles Prettier-formatted `config.ts` transparently at the product level;
the fragility is purely test-side.

---

#### D-168: Audit E2E tests — replace manual file construction with CLI commands

E2E tests must only use CLI commands to create state. Manual file system construction (writing config
files, skill dirs, agent files directly via `fs`) bypasses the CLI and creates fragile, divergence-prone
setups that break silently when the CLI's internal format changes.

**What to look for:** `writeProjectConfig()` calls inside `it()` bodies or local helpers (replace with
`cc init` via `InitWizard` or `EditWizard`); `writeFile()` / `mkdir()` constructing `.claude/skills/`,
`.claude/agents/` or config files by hand; local helpers such as `createDualScopeInstallation()` or
`createLocalSkillWithForkedFrom()`; any test importing `writeFile` / `mkdir` / `fs-extra` directly to set
up preconditions.

**Acceptable exceptions:** `beforeAll` source fixture setup (`createE2ESource`, `createE2EPluginSource`)
— these create a skill _source_, not CLI state; `createPermissionsFile()` — sets up
`.claude/settings.json`, which has no CLI equivalent; `ProjectBuilder` fixture methods.

**Process:** go file by file through `e2e/lifecycle/`, `e2e/interactive/` and `e2e/commands/`. For each
manual construction, either replace it with wizard-based setup or document why it cannot be replaced and
what CLI gap it represents.

---

#### D-111: Stable test identifiers for active-state detection

E2E tests currently use `STEP_TEXT` display strings (for example `"Choose a stack"`, `"Framework"`) to
identify wizard steps. These break when labels change. More critically, there is no way to assert which
tab or domain is _active_ versus merely present — tests can only check that text exists on screen.

**Goal:** tests should assert that a specific tab/domain is in the active state ("Shared domain is
active", not just "Shared text is visible").

**Ruled out:** zero-width Unicode characters (`​`) — Yoga counts them as layout characters, breaking
box border alignment; transparent or hidden text colour — terminals have no concept of transparent, and
`getScreen()` strips colour information.

**Direction to investigate:** parse raw ANSI escape sequences from the PTY buffer instead of using
`getScreen()`. Active items already emit distinct ANSI codes (bold + warning colour). A `TerminalSession`
method like `hasStyledText("Shared", { bold: true })` could check the raw stream without any UI changes.
Alternative: xterm's buffer API may expose cell-level style attributes that survive processing.

---

#### D-64: Create a CLI E2E testing skill + update `cli-framework-oclif-ink`

The project's E2E infrastructure uses several CLI-specific testing libraries that have no corresponding
skill.

**New skill — CLI E2E testing with node-pty + xterm:**

- **`@lydell/node-pty`** — PTY process spawning for interactive CLI tests, so the CLI under test behaves
  exactly as in a real terminal (ANSI escape sequences, cursor movement, line editing).
- **`@xterm/headless`** — headless terminal emulator used as a screen buffer; PTY output is piped in,
  xterm processes all ANSI sequences and maintains screen state, and `getScreen()` returns what the user
  would see.
- **`tree-kill`** — kills entire process trees, essential for cleaning up PTY processes that spawn children.
- **`TerminalSession` pattern** — the project's wrapper (`e2e/helpers/terminal-session.ts`) combining
  node-pty + xterm into an assertion-friendly API: `waitForText()`, `sendKey()`, `getScreen()`, `sendLine()`.
- **Non-interactive E2E pattern** — `execa` with the `runCLI()` helper: spawn, capture stdout/stderr,
  strip ANSI, assert on exit code and output.
- **E2E test structure** — `createTempDir()` / `cleanupTempDir()` lifecycle, `ensureBinaryExists()` guard,
  separate vitest config (`e2e/vitest.config.ts`).

**Update `cli-framework-oclif-ink`,** which currently misses: testing patterns for oclif commands (unit
with `@oclif/test`, integration with `runCliCommand()`); Ink component testing with `ink-testing-library`;
the project's `BaseCommand` pattern (custom error handling, logging helpers, `handleError()`); current
conventions (`displayName` in metadata, `METADATA_KEYS` constants, `EXIT_CODES` usage).

**Reference files:** `e2e/helpers/terminal-session.ts`, `e2e/helpers/test-utils.ts`,
`e2e/vitest.config.ts`, `src/cli/base-command.ts`.

---

#### CLI-332 to CLI-337: written but not running — 46 tests skipped at file level

These specs exist and are complete. They do not execute, so the behaviour they cover is unverified.
Nothing here is a writing task; each is blocked on a flag or a harness gap.

- **CLI-332** `e2e/commands/new-skill.e2e.test.ts` — 14 tests, whole file `describe.skip`.
  `FEATURE_FLAGS.NEW_SKILL_COMMAND` is `false` and E2E spawns the binary, so `vi.mock` cannot reach it.
  Blocked on D-212, or on the env-var flag override (CLI-323).
- **CLI-333** `e2e/commands/new-agent.e2e.test.ts` — 15 tests, same cause. Blocked on D-213 / CLI-323.
- **CLI-334** — OBSOLETE 2026-08-16. `e2e/commands/new-marketplace.e2e.test.ts` was DELETED in `95738763` (255 lines), not skipped, along with its 401-line unit sibling and `feature-flags.ts`. Nothing in the tree is unconditionally skipped — all 59 `.skip` hits are environment guards (`skipIf(!claudeAvailable)`). There is nothing to un-skip and CLI-323 is moot, since the flag module it existed to make testable no longer exists. The deleted text is recoverable via `git show 95738763^:packages/cli/e2e/commands/new-marketplace.e2e.test.ts` and is worth mining as a REQUIREMENTS LIST for CLI-454 — but it is not a resumable spec, and would have to be rewritten against CLI-498's prefixed id shape anyway.
- **CLI-335** `e2e/interactive/init-wizard-filter-incompatible.e2e.test.ts` — 1 test.
  `FEATURE_FLAGS.FILTER_INCOMPATIBLE` is `false`.
- **CLI-336** `e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts` — 1 test, same flag.
- **CLI-337** `e2e/interactive/init-wizard-sources-cancel-persists.e2e.test.ts` — 1 test.
  `FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY` is `false` since the overlay was withdrawn (D-307).

---

#### CLI-338 to CLI-344: build pipeline — no E2E coverage of version bumping

`e2e/commands/plugin-build.e2e.test.ts` runs `build plugins` then `build marketplace` and asserts a
manifest exists with a `version` of type string. It never asserts a version _value_ or that a version
_changes_. The bump primitives (`determinePluginVersion`, `bumpMajorVersion`, `computeSkillFolderHash`)
have unit coverage in `src/cli/lib/versioning.test.ts` and
`src/cli/lib/skills/skill-plugin-compiler.test.ts`; the chain through the real binary has none.

**`build plugins` version bumping:**

- **CLI-338** `build plugins` on the E2E source → initial compile produces `plugin.json` with version `1.0.0`
- **CLI-339** `build plugins` after modifying a skill's SKILL.md → version bumps to `2.0.0` for that skill only
- **CLI-340** `build plugins` after a no-change rebuild → version stays at `2.0.0` (idempotent)
- **CLI-341** `build plugins` with multiple skills → only the modified skill's version increments

**`build marketplace` from compiled plugins:**

- **CLI-342** `build plugins` then `build marketplace` → `marketplace.json` contains all compiled skills
  with correct versions
- **CLI-343** `build marketplace` after a version bump → `marketplace.json` reflects the updated version
- **CLI-344** `build marketplace` output structure → each plugin entry has `name`, `version`, `source`,
  `category`

#### CLI-346: `update` — global vs project scope is never asserted

`update.tsx` builds a separate `comparison.globalResults` keyed to `homeDir`, and `globalResults` appears
in no test in either suite. `e2e/commands/update-refreshes-registered-projects.e2e.test.ts` covers the
fan-out direction (a global update rewriting a registered project's compiled agents) but never asserts
which scope a given skill was updated in.

Carried over from `todo/D-136-test-coverage-gaps.md` (deleted 2026-08-04; this was the only item of its
38 that survived the audit).

---

**Decisions record — integration tests deliberately kept.** Not a task list; do not re-litigate without
new evidence.

_Keep — tests internals E2E only touches on the happy path:_
`integration/compilation-pipeline.test.ts` (skill/stack/marketplace compilation logic);
`user-journeys/edit-recompile.test.ts` (recompile mechanics — change detection, determinism);
`user-journeys/install-compile.test.ts` (stack plugin compilation — manifest, versioning).

_Keep — no E2E equivalent exists:_ `integration/consumer-stacks-matrix.integration.test.ts` (stack
loading, precedence, matrix merging, skill relationships); `integration/import-skill.integration.test.ts`
(the only comprehensive test of the import workflow); `integration/installation.test.ts` (installation
detection — eject/plugin mode, legacy fallback, precedence);
`integration/source-switching.integration.test.ts` (archive/restore mechanics);
`user-journeys/config-precedence.test.ts` (config resolution precedence — flag → env → project → default).

---

#### CLI-328 (was expressive-ts decision 6): `e2e/pages/constants.ts` duplicates production constants

It re-declares `EXIT_CODES` / `SOURCE_PATHS` / `DIRS` / `FILES` under an explicit "NO imports from
src/cli" header — while `e2e/helpers/` and `e2e/fixtures/` already import from `src` freely. So the
stated rule is not applied consistently.

_Open question:_ consolidating reverses an explicit, documented design decision. Either honour it
everywhere or drop it.

---

#### CLI-595: two proposed page-object rules live only in a finding

`.ai-docs/agent-findings/2026-08-20-focus-walk-presses-before-it-looks.md` proposes two rules for
`.ai-docs/standards/e2e/page-objects.md`. The code half has landed; these are proposals and want a
ruling before they become rules.

1. **A navigation helper observes before it acts, and confirms each move before the next one.** A
   helper that presses and then reads cannot tell "the key did not land" from "the repaint has not
   arrived", and it silently walks past what it was sent to find. This extends CLAUDE.md's existing
   "NEVER add a key-press method to an E2E step page object without calling `waitForWizardFooter()`
   first" from _a frame is painted_ to _the frame says the press took effect_, and conflicts with
   nothing there.
2. **A press budget is not a search bound.** A `for (attempt = 0; attempt < N; attempt++)` walk
   reports the number it gave up at, which says nothing about what it looked at. Terminate on the
   structure being walked — a lap, a repeat, an exhausted list — and raise an error naming what was
   observed. `MAX_FOCUS_ATTEMPTS` is the cautionary case: raised 30 → 50 when the taxonomy reached
   33 web categories, and still too thin, because one missed observation costs a second lap.

Both came out of CI run 32338714325, where `focusSkill` pressed Tab before looking at the screen and
paid a 33-category lap to return to the category it opened on. The re-run of the same commit passed
with the test still losing its first attempt, so `retry: 1` had been absorbing roughly a 3-in-4
failure rate on the runner. Not reproducible locally under any condition tried, including the full
suite pinned to the runner's 4 cores and `e2e/interactive` pinned to 2.

---

#### CLI-596: every E2E fixture slug collides with the default catalogue

`createE2ESource` namespaces its skill IDS (`e2e-test-fixture-web-framework-react`) but writes the
BARE slug into each `metadata.yaml` (`slug: react`). Against the default catalogue all ten collide —
a census, read out of `slugToId` in `src/cli/types/generated/matrix.ts` with whole-key matching:
`react`/`web-framework-react`, `vitest`/`web-testing-vitest`, `zustand`/`web-state-zustand`,
`hono`/`api-framework-hono`, `research-methodology`, `reviewing`/`meta-reviewing-reviewing`,
`cli-reviewing`, `vue-composition-api`, `pinia`, `visual-regression`. Each collides with its
NAMESAKE — the fixture borrowed the catalogue's slugs, it does not shadow unrelated skills.

`claimSlug` is first-claim-wins and refuses BOTH directions on a collision, so in the mixed
configuration the fixture skill ends up with `slugToId[slug]` pointing at the catalogue's skill and
**no `idToSlug` entry at all**. The skill object itself is unaffected: `mergeLocalSkillsIntoMatrix`
writes `matrix.skills[id]` before and independently of the claim, so the grid cell still paints and
the wizard — which works by id throughout — is unaffected.

**Why nothing fails today, which is also why this is worth filing rather than fixing in passing.**
Of the 43 specs using `ProjectBuilder.editable`, 29 also load an E2E source as the marketplace, and
`copyOfBuiltInMatrix()` is only reached on the default-source path — a custom source builds its slug
map from scratch, so there is no catalogue in the matrix to collide with. That leaves ~14 specs
where the collision fires, and in those nothing reads the losing side: `getSkillBySlug` has **zero
product call sites** (three test call sites and the barrel re-export), `idToSlug` has **zero readers
anywhere**, and the one live consumer of `slugToId` is rule resolution
(`resolveToCanonicalId`/`collectUnresolvedSlugs`), which resolves the LOADED source's own
`skill-rules` — in the mixed configuration those rules are the catalogue's, so mapping `react` to
`web-framework-react` is correct there.

**The two costs.** Real today: three lines of output above the grid (`Duplicate slug …`,
`Loaded 239 skills (default)`, `Found 2 installed skills`) in exactly the configuration where the
frame is tightest — that block is in the CLI-595 CI failure dump. It does not overflow at
`rows: 40`, since `assertWizardScreenIsWhollyVisible` would have thrown instead. Latent: the trap is
armed. `getSkillBySlug` is an ASSERTING lookup, so the first product caller to resolve a skill by
slug makes those ~14 specs a configuration where a fixture skill is invisible to slug lookups and
the catalogue's skill answers in its place — silently, because both are real skills with plausible
names.

Fix direction: namespace the slug the way the id already is (`e2e-test-fixture-react`), which is one
edit in `E2E_SKILLS` plus `E2E_SKILL_TITLES`' key type. Check `E2E_SKILL.*.slug` call sites first —
the titles map is keyed by slug, and `e2e/fixtures/project-builder.ts`'s `SKILL_IDENTITY_FIELDS`
reads through it.

---

### Tooling, gates & code generation

> Context: ESLint is a **normal gate**, not a gap. The baseline was burned down to zero in 0.147.1 with
> no rule disabled, verified by running the tool. `npx eslint .` produces no output and exits `0`. Four
> inline suppressions remain and each is justified in place — do not remove them and do not add a fifth
> without the same standard of justification. The items below are what is genuinely still missing.

#### CLI-355: Enable `reportUnusedDisableDirectives`

It was blocked on a clean baseline and is now actionable. It would have caught both 2026-07-30
dead-directive defects by itself.

---

#### CLI-356: Adopt `eslint-plugin-react-hooks` for the CLI

This is an Ink/React codebase with **no hooks linting at all**. Now cheap —
`packages/eslint-config/react-library.js` already declares the plugin, so this is wiring rather than
adoption. Two effects in `src/cli/components/hooks/use-measured-height.ts` would be flagged once it is
on; the correct response there is `useCallback` on `measure`, not widening dependency arrays.

---

#### CLI-357: Add a lint guard against task IDs in test names

A `no-restricted-syntax` rule now exists and reaches test names and `expect` messages. **It does not
reach prose or JSDoc**, which is where the class actually lives — see CLI-540, whose own greps return
192 hits under `src/`, `e2e/` and `scripts/` and 53 across 22 documents.

---

#### CLI-358: Neither code generator runs in any gate

`generate:types`, `generate:schemas` and `generate:schemas:check` appear in `prepublishOnly`,
`.husky/pre-commit` and the workflows **zero** times. `.github/workflows/ci.yml` is the repository's only
workflow and its `check-cli` job runs `typecheck`, `lint`, `test` and `test:e2e` for this package — CI
exists; it simply never invokes either generator. (`check-web`'s `bun run generate` is
`packages/matrix`'s vendored-catalog generator, a different script.)

`typecheck:scripts` is likewise in no composite gate, which is how `scripts/` stayed untypechecked long
enough to hide a phantom field and two fabricated `SkillId`s.

Consequence: checked-in generated output in `src/cli/types/generated/` and `src/schemas/` can drift from
its source silently. See `.ai-docs/reference/features/code-generation.md`.

---

### Types & code quality

#### CLI-325 (was expressive-ts decision 3): `readonly` on read-model types

`MergedSkillsMatrix`, `ResolvedSkill`, `ResolvedStack` in `types/`. There is essentially no `readonly` in
`types/`, while CLAUDE.md mandates spread-isolation (`{ ...SKILLS.react }`) precisely because these
objects get mutated in place.

_Blast radius:_ high-churn, best done as a staged pass. Needs an appetite call before starting.

---

#### CLI-326 (was expressive-ts decision 4): wizard-store tombstone helper family — generic-isation

`hasProjectActive`/… (skills, keyed by id) versus `agentHas…`/… (agents, keyed by name), plus
`toggleSkillScope` / `toggleAgentScope` (~70 lines each). These are line-for-line symmetric — there are
six "mirrors the skill path" comments saying so. A keyed predicate factory would halve ~150 lines.

_Blast radius:_ **HIGH RISK.** This is D-223/224/227/233-critical dual-scope logic. Requires a full unit +
E2E gate, and should land as its own isolated commit if approved.

---

#### CLI-327 (was expressive-ts decision 5): `validateSelection` / `validateBuildStep` hardcode `valid: true`

`matrix-resolver` and the build-step validator both compute an `errors` array and then unconditionally
return `valid: true`. The field is therefore dead or misleading.

_Open question:_ deriving `valid: errors.length === 0` may change wizard flow if any consumer branches on
it. The advisory-only semantics may be deliberate. _Needs:_ a consumer trace plus a product call. See
also CLI-367, which found that `validateBuildStep` has no production consumer at all.

---

#### CLI-330 (was expressive-ts decision 8): `mock-matrices.ts` double cast hides a key-shape mismatch

`TEST_CATEGORIES as unknown as Record<Category, CategoryDefinition>`. The keys are `framework` /
`clientState` / …, not `Category` ids, and tests rely on that shape. The cast is what makes it compile.

_Blast radius:_ a behaviour-reviewed follow-up, not a mechanical fix — removing the cast means reshaping
the fixture and whatever depends on it.

---

#### CLI-322 (was R-06): Slim down `ResolvedSkill`

Separate resolved relationship data from skill identity.

---

#### D-153: Standardize operation result types

Consistent list / single-action return patterns across the operations layer.

---

### Telemetry

#### D-170: Add PostHog anonymous telemetry

Skill installs, wizard funnel, command errors, platform.

---

#### D-90: Add Sentry tracking for unresolved matrix references

In `src/cli/lib/matrix/matrix-resolver.ts`, `getDiscourageReason()` and `validateSelection()` use
`findSkill(id)` with a fallback to the raw ID when a skill referenced in `requires`, `conflictsWith` or
`providesSetupFor` does not exist in the matrix. This is intentionally graceful — crashing the wizard on
bad matrix data is worse than degraded labels. But we need visibility into how often it happens.

Add Sentry `captureMessage` (or `captureException`) on every fallback path, including the referencing
skill ID, the missing referenced ID, and the relationship type in the Sentry context.

---

### Docs, agents & skills

#### D-180: Write a "Bring your own skills" guide

Test the custom source path end-to-end, document the `metadata.yaml` schema, `--source` flag usage and
multi-source setup, and add a guide link to the README.

---

#### D-162: Skill Olympics — benchmark and optimize the expressive-typescript skill

Competitive arena: 100 contestants catalogued, 10 selected for proof of concept × 5 test cases drawn from
codebase anti-patterns. Score on a 10-axis rubric, Frankenstein the winners, then chain skills (run A→B
to test post-processing combinations). Phases 1-4 done (harvest, test case extraction, constraints,
contestant prompts). Next: the arena runs.

**Plan:** `todo/plans/D-162-skill-olympics/plan.md` · **Catalog:** `test-catalog.md` beside it.

Paths rather than links, deliberately: **the whole directory is gitignored and exists only on the
maintainer's machine**, so a fresh clone will not have it and neither will anyone reading this on
GitHub. It holds 879 files — `contestants/` is third-party skill text copied verbatim from other
authors, and `arena/` and `test-cases/` are the outputs those skills produced, the artefacts the
rubric scores. The root `.prettierignore` names those same three subdirectories, so reformatting
cannot rewrite the evidence being measured either. Nothing here is missing or rotted.

---

#### D-138: Iterate on sub-agents — systematic improvement pass

All agent definitions in `src/agents/` should be reviewed and improved using the agent-summoner's Improve
Mode. Each agent was written at a point in time and may not reflect current project conventions,
CLAUDE.md rules, or lessons learned from the convention-keeper's findings.

| Category  | Agents                                                                |
| --------- | --------------------------------------------------------------------- |
| Meta      | agent-summoner, skill-summoner, codex-keeper, convention-keeper       |
| Reviewer  | web-reviewer, api-reviewer, ai-reviewer, cli-reviewer, infra-reviewer |
| Developer | web-developer, api-developer, ai-developer, cli-developer             |
| Tester    | web-tester, api-tester, ai-tester, cli-tester                         |
| Planning  | web-pm, api-pm, ai-pm, cli-pm                                         |
| Research  | web-researcher, api-researcher, ai-researcher, cli-researcher         |

**For each agent:** read the current source files (`metadata.yaml`, `intro.md`, `workflow.md`,
`critical-requirements.md`, `output-format.md`, `critical-reminders.md`, `examples.md`); cross-reference
against CLAUDE.md NEVER/ALWAYS rules; check `.ai-docs/agent-findings/` for findings where
`reporting_agent` matches and confirm the agent's instructions prevent recurrence; ensure the findings
capture instruction is present; use agent-summoner Improve Mode to propose and apply improvements;
recompile and verify.

**Key improvements to look for:** missing CLAUDE.md rules (git safety, type cast restrictions), missing
findings capture instruction, outdated file paths or function references, weak or missing self-correction
triggers, output format gaps, missing domain knowledge that would prevent common mistakes.

**Approach:** 2-3 agents per session. Start with the most-used (cli-developer, cli-tester, cli-reviewer).

The roster was unified 2026-08-05 (CLI-351 in `archive.md`): 25 agents, five roles ×
web/api/ai/cli, plus Meta and `infra-reviewer`. The five agents created that day already reflect
current conventions, as do the same-day fixes to `api-researcher` (handoffs,
`<post_action_reflection>`) and `skill-summoner` (double-wrap, misplaced self-correction block) —
this item now covers the systematic pass over the older definitions.

---

#### D-62: Review default stacks — include meta/methodology/reviewing skills

Go through all default stacks and ensure they include the shared meta skills (methodology, reviewing,
research) that should be part of every reasonable setup. Currently stacks only include domain-specific
skills and miss the cross-cutting concerns.

**Skills to consider adding:** `meta-methodology-*` (investigation-requirements,
anti-over-engineering, success-criteria, write-verification, improvement-protocol, context-management);
`meta-reviewing-*` (reviewing, cli-reviewing); `meta-research-*` (research-methodology);
`security-auth-security` where auth skills are selected.

**Key files:** the stack definitions in the skills source that feed the wizard's stack selection step.

---

#### D-41: Create the `agents-inc` configuration skill

Create a configuration **skill** (not a sub-agent) giving Claude deep expertise in the CLI's config
system. The skill loads into the main conversation on demand, enabling interactive config work — Claude
can ask clarifying questions, propose changes, and iterate with the user.

**Why a skill instead of an agent:** sub-agents (Task tool) are not interactive — they run autonomously
and return a single result. Config tasks frequently need clarification ("Which category?", "Replace or
add alongside?"). A skill in the main conversation preserves full interactivity.

**What it teaches Claude:** creating and updating `metadata.yaml` files (with correct domain-prefixed
`category` values, author, displayName); creating and updating stack entries (agent definitions, skill
assignments, preloaded flags); updating the skills matrix (categories, skill entries, dependency rules);
updating `.claude-src/config.yaml` mappings; the valid `Category` enum values and how to enforce them;
skill relationships (`requires`, `compatibleWith`, `conflictsWith`, `requiresSetup`, `providesSetupFor`);
validating configs against embedded schema knowledge.

**Implementation:** create the `meta-config-agents-inc` skill in the skills repo (SKILL.md +
metadata.yaml); category `shared-tooling`, display name "Agents Inc"; SKILL.md embeds the full config
knowledge base (~500-600 lines); no TypeScript changes required; register in `.claude-src/config.yaml`
and assign to relevant agents via stacks.

**Acceptance criteria:** creates a valid `metadata.yaml` from a skill name and category; registers an
existing skill interactively (read SKILL.md, ask clarifying questions, generate metadata.yaml, wire into
config); adds a new stack with correct agent/category/skill structure; adds a new category with proper
schema; validates all output against schema rules; refuses bare category names (enforces domain prefix);
loads correctly via the Skill tool for both users and other agents.

Full plan: [./plans/D-41-config-sub-agent.md](./plans/D-41-config-sub-agent.md)

---

#### D-01: Update skill documentation conventions

Replace `examples-*.md` files with a folder structure. Split examples from patterns. Namespace files (for
example `examples/core.md`, `patterns/testing.md`). Update Section 8 of
`.ai-docs/standards/skill-atomicity-bible.md` accordingly.

---

#### CLI-317 (was UX-13): Add readable schemas on sub-agents and skills

---

#### CLI-319 (was #19): Sub-agent learning capture system

---

#### CLI-380: Complete the infra domain roster

Deferred when the roster was unified (2026-08-05 — CLI-351 in [`archive.md`](./archive.md)): the
five-role grid is uniform across web/api/ai/cli; infra kept only `infra-reviewer`. Completing it
means `infra-developer`, `infra-pm`, `infra-researcher`, `infra-tester` via the same process
(agent-summoner Create Mode + current platform docs + prompt-bible + role siblings as models),
plus the same wiring surfaces: union regen, a `DOMAIN_AGENTS` `infra` key, a grid group, stack
curation, docs.

---

#### CLI-382: Bind the roster surfaces to `AGENT_NAMES`

Four surfaces must agree — the
generated union, `DOMAIN_AGENTS`, `BUILT_IN_AGENT_GROUPS`, and the shared test expected-values —
but only deletions self-check via `tsc`; **additions are caught by nothing**, which is how four
valid agents (`ai-developer`, `ai-reviewer`, `api-pm`, `api-tester`) shipped unreachable in the
wizard until 2026-08-05. The two wizard constants are file-local, so no test can bind them today;
exporting them collides with the no-export-without-a-second-caller rule unless the identity-key
exception is read to cover roster constants two surfaces must agree on. That reading is the
decision.

---

#### CLI-383: No stack assigns any ai-domain agent

Observed during the roster wiring: `ai-developer` and `ai-reviewer` appear in zero stacks — even
`nextjs-ai-saas` routes its AI skills through `api-developer`/`api-researcher` — and the three new
ai agents inherited that emptiness. Selecting the AI domain therefore preselects five agents that
no stack seeds with skills. Needs owner curation (which stacks, which of the 20+ `ai-*` marketplace
skills, per role). Related: D-62 (meta skills in stacks), D-280 (stack pruning).

---

#### CLI-384: Repo-internal paths in shipped agent prompts

**Closed 2026-08-19.** Shipped agent partials instructed a user's compiled agents to write into
`.ai-docs/agent-findings/` and to cite CLAUDE.md — paths that exist only in this repository, not in
an installing project. The original count was itself stale: eleven partials across six agents was
really **six across two** (`api-tester`, `ai-developer`), plus a seventh hit in `reviewer/playbook.md`
— **the file cited as the exemplar of the fix**, whose softened sentence still carried a
"for this repository" parenthetical that reads, in an installing project, as pointing at theirs.
All rewritten project-agnostically, and `prompt-bible.md` § 8.6 now carries the rule with its grep.
The five agents created 2026-08-05 deliberately omit them, so the roster is split on policy;
`/specs/_active/current.md` was judged a product convention and kept everywhere. Decide: strip the
references from the six older agents, or make the paths a real, documented product convention.

---

#### CLI-360: Document `lib/skills/source-switcher.ts` and `generators.ts`

The two remaining `lib/skills` modules. They exist today only as prose inside
`.ai-docs/reference/features/skills-and-matrix.md`; `skills/skill-primitives.md` deliberately scoped them
out and is the directory they belong in. `source-switcher.ts` has 8 unit specs (derived by subtraction
from the 118 in that directory); `generators.ts` emits `skill-categories.ts` / `skill-rules.ts` content
for a source repo.

---

#### CLI-361: `scripts/generate-json-schemas.ts` has zero tests and cannot have one as written

`generate()` is invoked unconditionally at module scope with a hardcoded output directory, so importing
the module runs it. Its sibling generator has 34 tests. Recorded in
`.ai-docs/reference/features/code-generation.md` § Known gaps. The fix is to export `generate()` and
guard the module-scope invocation, or to parameterise the output directory.

---

#### CLI-366: Snapshot discipline — rule 6.17a is adopted but does not enforce

Rule 6.17a (`.ai-docs/standards/clean-code-standards.md` § 6, from the adopted proposal
`.ai-docs/agent-suggestions/2026-07-30-column-geometry-snapshot-rule-6-17a.md`) requires at least one
`toMatchInlineSnapshot()` per layout branch for any component laying content out in fixed-width columns.

It was adopted, its two required snapshots were written — and both were then regenerated with `vitest -u`
to agree with a wrong change. An adopted rule is not an enforcing one. Decide what makes it enforce:
a review rule against bare `-u` runs, a CI check, or snapshot files that are harder to regenerate blindly.

---

## Notes

- Test target directory: `/home/vince/dev/cv-launch`
- Source marketplace: `/home/vince/dev/skills`
- CLI under test: `packages/cli`

#### CLI-386: `category` is dropped on the way into `marketplace.json`

(Was CLI-367; renumbered 2026-08-05 — that ID was accidentally assigned twice and the
`validateBuildStep` row keeps it.) Found while writing CLI-344's spec. The skill's own `metadata.yaml` carries a category, but
`compileSkillPlugin` reads that file only for `author`, `PluginManifest` has no category field, and
`convertManifestToMarketplacePlugin` (`src/cli/lib/marketplace-generator.ts`) never sets one. The
command's own summary shows the consequence: `getMarketplaceStats` groups by `p.category ??
"uncategorized"`, so every generated marketplace prints `Category breakdown: uncategorized: <all>`.
An `it.fails` spec in `e2e/commands/plugin-build-versioning.e2e.test.ts` pins the gap and flips
green the moment a category reaches the entry.

---

#### CLI-385: Commit the agent restructure

(Was briefly filed as CLI-368; renumbered — that ID landed the same day and is in `archive.md`.)

The 2026-08-05 roster unification (CLI-351, CLI-368…373 in [`archive.md`](./archive.md)) is
**complete in the working tree and green, but none of it is committed.** The snapshot this item
originally recorded is resolved: `packages/matrix` is regenerated at 25 definitions (so
`check-web`'s catalog diff is clean), the removed agents are purged from every prompt and every
test (`config-generator.test.ts` included), the editor's stale comment is fixed, and the gates
pass — `tsc` clean on all three configs, 4854 unit tests, targeted e2e green.

**What remains is exactly one thing: land it as one commit**, including the untracked
`agent-findings` files created alongside the work. The five new agents are unpublished until a
release carries them — `src/agents/` ships in the package, so this is user-visible, not internal.

---

### Rulings and audits, 2026-08-06

#### CLI-392 to CLI-396: TypeScript-strictness audit findings

From the 2026-08-06 repo-wide audit (zero `any` in production — the looseness is structural).
Full detail in the session transcript; headlines:

- **CLI-392** — sparse maps declared total: `loadAgentsFromDir`, `resolveAgents`,
  `write-compiled-agents`, `config-gate/deps.ts` (`NO_AGENTS = Promise.resolve({} as Record<…>)`,
  a verbatim CLAUDE.md NEVER violation) and ~16 more declare `Record<AgentName, …>` for maps
  built from directory scans and subsets. The code already guards for absent keys the type says
  cannot exist. Fix: `Partial<Record<…>>` per typescript-types-bible §4.
- **CLI-393** — enable `tseslint.configs.recommendedTypeChecked` (start with packages/cli, which
  already configures `projectService`). Known catch: `apps/server` serves
  `c.json(JSON.parse(stored))` on a route whose OpenAPI contract declares `seedPayloadSchema` —
  unvalidated `any` to a typed response. Needs owner decision on rollout order.
- **CLI-394** — `packages/cli/tsconfig.json` is the only workspace not extending
  `@workspace/typescript-config`; with no `lib` set, DOM globals (`name`, `status`, `open`…) are
  in scope in a Node CLI. `node.json` exists and is the right base. No recorded reason (checked
  the moving commits).
- **CLI-395** — `packages/matrix/src/schema.ts` types every id as `z.string()`; thirteen
  uncommented casts in the read models restore the unions. The generated `SKILL_IDS` /
  `CATEGORIES` / `AGENT_NAMES` tuples exist for exactly this (`z.enum` needs readonly tuples) and
  are vendored into the package unused. Includes the `STACK_PRELOADS` type-laundering round trip
  in `expandStack`.
- **CLI-396** — the standards prescribed `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
  until a docs-consolidation commit deleted the file carrying them; no decision recorded.
  Evidence the codebase expects the former: `step-agents.tsx` writes `focusableIds[0]!`
  (currently a no-op), and eight editor call sites `?.`-guard lookups whose types claim they
  cannot miss. Needs owner decision — enabling repo-wide is a large mechanical diff.

Smaller siblings recorded in the audit for whoever picks these up: `SubAgent` re-widens
`model`/`flavor` to `string` (matrix read-model); `Catalog.skillsById` should be
`Partial<Record<SkillId, …>>`; three hand-maintained copies of the model union (CLI, editor,
seed schema) with no cross-check; two production `as unknown as` in `base-command.ts`/`hooks/init.ts`
fixable as single assertions; the editor types agent ids as `string` in ~20 signatures though the
roster is closed and `AgentName` is importable.

#### CLI-397 / CLI-398 / CLI-399: the reviewer/PM audit outcomes

From the 2026-08-06 reviewer audit (full report in the session transcript). CLI-397 repairs the
over-engineering pressure in place: an APPROVE-with-zero-issues worked example, a cost gate before
"Should Fix", the inverse failure named in critical-reminders ("a speculative refactor suggestion
is as much a review failure as a missed bug"), cli-reviewer's "Don't Mention" / "APPROVE when"
blocks ported to all five, the React.memo and "not in spec, but recommended" exemplars deleted,
and a cost gate added to `meta-reviewing-reviewing` itself. Applies whether or not CLI-398 lands.

CLI-398 (LANDED 2026-08-06 — see archive) consolidated the five domain reviewers into one
`reviewer` agent.
**Loading design (owner discussion, 2026-08-06):** the process skill
(`meta-reviewing-reviewing`) stays PRELOADED on the reviewer; the domain skills
(`meta-reviewing-web/api/ai/infra` — to be written from the current checklists; the cli one
exists) are LAZY, listed in the activation protocol and loaded per-diff by what the change
touches. Context stays base + relevant domains regardless of the project's domain count, and no
irrelevant checklist is resident — the audit's over-engineering fuel. The sparse preload mapping
already expresses this per-skill; no new machinery. Consolidation touches the roster surfaces
enumerated in the audit (AGENT_NAMES regeneration, DOMAIN_AGENTS, BUILT_IN_AGENT_GROUPS,
`domainOf()` placement for a prefixless name, default-stacks merge, editor coreAgentIds, test
expected-values); PRELOAD_DEFAULTS needs no change (flavor-keyed).

CLI-399 (deferred) stages the same question for the four PMs after CLI-398 proves the pattern —
their domain playbooks are genuine content (a migration into `meta-planning-*` skills, not a
deletion); their bloat mandates ("comprehensive and thorough", "at least 3 similar
implementations", fixed 28KB templates) get softened under CLI-397's repair pass meanwhile.

#### CLI-403: the pre-commit dependency hole (corrected 2026-08-06)

The original row text was wrong: all three vitest projects (unit, integration, commands) run in
every gate — pre-commit, CI and prepublish all execute unfiltered `vitest run` (142 files,
verified green). The 5 invisible-red integration specs were a delegation-brief artifact, not a
repo-gate gap.

The REAL hole: `.husky/pre-commit` classifies staged paths at package granularity — only
`^packages/cli/` sets `run_cli=yes`, and everything else under `packages/` runs as
`--filter='!agents-inc'`, which excludes the CLI. But `packages/cli` devDepends on
`@workspace/matrix` and tsup bundles it, so a matrix-only commit (exactly the preload-mapping
case) changes the CLI without ever running its suite. CI does not share the hole. Fix drafted
(additive, never narrows): matrix-staged paths also set `run_cli=yes`, with a comment naming the
bundling dependency. The hook is owner-curated, so the edit waits for an explicit go.

Also done under this row: the stale "CURRENTLY RED, deliberately" JSDoc in
`init-end-to-end.integration.test.ts` rewritten to describe today's behavior (propagation +
recompile now happen inside the gated write; `propagatedProjects` no longer exists).

#### CLI-412: no custom category — real taxonomy membership (owner ruling, 2026-08-06)

**Parked by the owner the same day: "I will tackle this another time as it needs good testing."
CLI-407 to CLI-413 are all Deferred; the design below is settled and waiting.**

The fork is closed by rejecting both branches: **there is no `custom` category.** "These are the
reasons the feature was parked — if you're going to do this you should do it right."

The design:

- **Adding a skill ends with a category assignment.** After scaffolding (`new skill`) or import,
  the flow asks for the skill's domain and category. AI may SUGGEST both (from the skill's
  name/body); the user must CONFIRM. The skill then appears alongside its related skills in the
  ordinary grid — no orphan section, no pseudo-category, no `dummy-*` placeholder ever written.
- **Typing tightens, not loosens.** Because every custom skill carries a real `Domain` and
  `Category`, the `validateCategoryField` leniency for `custom: true` (any kebab-case string) is
  DELETED — category validates against the union for custom skills exactly as for built-ins.
  Category auto-synthesis for custom skills dies with it (supersedes the D-214 item-8 scoping:
  instead of scoping synthesis TO custom skills, there is nothing left to synthesize).
- **Provenance is a filter, not a place:** `custom: true` powers a "custom skills only" filter in
  the editor (deferred row EDITOR-22) and can drive a badge — it never affects placement.
- **Install mode:** eject is the default and the only option for LOCAL custom skills (nothing
  backs them — the CLI-408 hard error). But a custom skill that a registered marketplace actually
  backs keeps the ordinary plugin/eject choice — the restriction follows from what exists, not
  from the `custom` flag itself. (Third-party marketplace import is D-14's territory; this rule
  is what it plugs into.)
- The `local` pseudo-category remains what it is today (a trapdoor for uncategorized discoveries)
  but custom skills never land there — CLI-409's fix makes the scaffold/import flows incapable of
  producing a `local`-categorized custom skill.

#### CLI-399 / CLI-416 / CLI-417: state at the 2026-08-06 API-limit interruption

The CLI-399 agent reported its implementation complete (four `meta-planning-*` skills authored in
the skills repo, PM playbooks slimmed to process + JIT loading, mapping/category regeneration)
and was cut mid-verification by the weekly API limit. Outstanding when it died: the final full
e2e re-run, the real-binary scratch-HOME check (a web+cli project compiles web-pm/cli-pm with
their planning skills lazy in the activation protocol), and the planning-column thinning
PROPOSAL table — now delivered at
[`plans/CLI-399-planning-thinning-proposal.md`](./plans/CLI-399-planning-thinning-proposal.md)
(keep 35 breadth rows, demote 72 depth rows; owner reviews before any demotion executes).
Post-interruption verification by the orchestrator: full CLI vitest 6330 green, matrix 179,
editor 193, tsc ×3 + eslint clean; the one e2e failure traced to the stack additions referencing
UNPUBLISHED skills (the default-source flow plugin-installs from the published marketplace) —
stack membership for `meta-planning-*` reverts until the skills repo publishes them; the lazy
reach rule already delivers them to PMs. Rule recorded: built-in stacks may only reference
published marketplace skills.

Open rulings gathered in one place:

- **CLI-416** — meta-design reach: for meta-domain skills a mapping row is both eagerness AND
  targeting, so the thinning pass didn't just make `meta-design-expressive-typescript` /
  `meta-design-composable-components` lazy for the reviewer — the reviewer no longer receives
  them at all. Finding:
  `2026-08-06-demoting-a-meta-rows-reviewer-flavor-removes-its-reach-not-just-its-eagerness.md`.
- **CLI-417** — sources-step wording ("Use all recommended skills (verified)") survived CLI-404
  as a separate feature; rename needs a ruling.
- Still pending from earlier today, listed here for one-stop review: CLI-400 (stack preload flags
  migrate into the mapping or stay the override tier), CLI-413 (custom flag never reaches
  config.ts — investigate), EDITOR-03's three-way fork and the deferred custom-skill stages
  (CLI-407..413, EDITOR-15..22), EDITOR-11's exclusive-downgrade narrowing (the incompatibility
  half), and the CLI-389 fan-out's owner checkpoints.

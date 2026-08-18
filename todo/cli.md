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

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status        | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| D-307   | Wizard root `useInput` steals `s` from the add-source text input — overlay gated off behind a flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ready for Dev | bug      | easy       |
| D-266   | Shared scroll gates disable clipping below `MIN_VIEWPORT_ROWS`, so steps bleed at short terminal heights.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ready for Dev | bug      | complex    |
| D-214   | RESCOPED 2026-08-16 by a verification pass — the FRAMING is dead, the engineering content mostly is not. `new marketplace` was DELETED in `95738763`, not flag-gated: the command, its 14 e2e specs, its 401-line unit spec and `feature-flags.ts` are all gone, so the row's whole "Re-enabling" section is inoperable and CLI-454 is a from-scratch re-add. Of 22 items: 15 LIVE, 3 fixed (5, 12, 15), 2 moot (6 — the extras axis was withdrawn with CLI-450; 8 — superseded by CLI-412), 1 a TRAP (11 — `schemas.ts` carries an explicit "do not add the superRefine without an explicit decision" tripwire, so the obvious dedup reverses a recorded ruling) and 1 FACTUALLY WRONG (14b — `agentDefinedDomains` is NOT dead; `step-agents.tsx` reads it, and deleting it typechecks but breaks the agent domain tab at runtime). D-214 never gated the scaffold — its own text says the scaffold works and the concern is the consumer — so it was a CONFIDENCE prereq, and that confidence now has coverage it lacked: `marketplace-author-arc` and `custom-marketplace-arc` both walk author→consumer. **SPLIT: items 2, 3, 4, 7 are the genuine CLI-454 prerequisite (~1 day, leg 1); the remaining ~14 are general matrix hygiene and move to Track B.** Items 1 and 2 taken in hand 2026-08-16. Item 4 needs a ruling reconciled with CLI-471's deliberate asymmetry (a source's OWN rules are never narrowed); item 7 changes `mergeMatrixWithSkills`'s signature; item 3's local-slug shadowing overlaps CLI-498's namespace ruling and must be decided with it. SLEEPER: item 10 — `config-types-writer` loads with `skipExtraSources: true`, skipping the tagging pass, so the singleton it leaves has skills with no `activeSource`, which `search.ts` THROWS on; reordering the two `initializeMatrix` calls can surface that as a crash in an unrelated command.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev | bug      | medium     |
| D-212   | INSTALL-PIPELINE HALF LANDED 2026-08-17 with CLI-407/408/409 — the journey works end to end: a hand-written custom skill installs through `edit` in 3.6s where it previously hung 68s and aborted with marketplace advice impossible for a locally-created skill. WHAT REMAINS IS MOOT AS WRITTEN and needs re-scoping, not carrying: every leftover item — the misleading closing message, the `--install` flag, `cc list`'s "scaffolded but unconfigured" section — names `src/cli/commands/new/skill.ts`, deleted in `95738763`. Re-scope onto the editor intake (leg 2's EDITOR rows) or retire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | bug      | complex    |
| CLI-534 | **Two commands print text that is wrong, one of them naming a command that does not exist** (found 2026-08-18 by the commands doc re-derivation, which re-derived from source rather than reading the page). (1) `compile`'s no-skills refusal reads `No skills found. Add skills with '<bin> add <skill>' or create in .claude/skills/.` — **there is no `add` command**; `agents-inc add react` prints _"add react is not a agents-inc command"_. A refusal that tells the user to run something that exits 127 is worse than one that just says no. (2) `eject`'s `--output` flag `description` says `"Output directory (default: .claude/ in current directory)"` but `resolveOutputBase` returns `.claude-src/`, and `eject skills` ignores that base entirely unless `--output` is given, writing `LOCAL_SKILLS_PATH` (`.claude/skills`) — three eject types, three destinations, and `.claude/` is not the default of any of them. The doc had faithfully reproduced the flag's own stale description, which is how it spread                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | bug      | easy       |
| CLI-535 | **Five things `check-enumeration-drift.ts` cannot bind, each blocking a real list** (found 2026-08-18 while the registry grew from 6 rows to 39). (1) **The command roster itself — the highest-value list there is, and the one that actually went wrong.** `SourceEnumeration` names `(file, symbol)`; a roster is the membership of a DIRECTORY (`src/cli/commands/**`, via oclif's `pattern` strategy), and no row can express a filesystem walk. This is precisely the gap that let a LIVE command be documented as deleted, and it means a command added tomorrow is undocumented and silently so. (2) **`unwrap()` does not read through `satisfies`** — `SKILL_IDS` / `SKILL_SLUGS` are `as const satisfies readonly SkillSlug[]`, so the declaration enumerates nothing and any row is a hard failure by design. One line (`ts.isSatisfiesExpression`) fixes it. (3) **`tableRowKeysIn` stops at the first non-table line**, so an export list split across several tables under several headings cannot be bound at all — `zod-schemas.md`'s 34-schema partition is correct today and will rot exactly like the others did. (4) **`declarationOf` walks only top-level statements**, so a `static` class member is unreachable and NO command's flag list is registerable, independent of `edit`'s computed key. (5) **`exportedNames` does not follow `export … from`**, so a BARREL enumerates nothing and hits `SOURCE_ENUMERATES_NOTHING` — blocking `factories/index.ts`, `helpers/index.ts` and `assertions/index.ts`, which are exactly the three directory tables found drifted at 42-against-45 and 33-against-39, one of them still naming a deleted factory. Same for any table whose rows come from several sibling modules rather than one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev | feature  | medium     |
| CLI-536 | Twelve exported types under `src/cli/types/` appear in none of the three type documents: `AgentHookAction`, `AgentFrontmatter`, `RelationshipDefinitions`, `SkillRulesConfig`, `SkillRelation`, `SkillRequirement`, `SkillAlternative`, `PluginAuthor`, `MarketplaceRemoteSource`, `MarketplaceOwner`, `MarketplaceMetadata`, `MarketplaceFetchResult`. Deliberately left uncorrected by the pass that found them (2026-08-18): which of `core-types.md`, `operations-types.md` and `zod-schemas.md` each belongs in is an owner's judgement about how the three partition, not twelve rows appended to whichever table is nearest. Register the resulting lists once placed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | chore    | medium     |
| CLI-537 | **A reader following a `related:` chain lands on a redirect stub.** The three architecture pages pair a real body with a short pointer, and the discipline holds in one direction only — the stubs redirect correctly, but the BODIES' `related:` chains name the stubs: `architecture-overview.md` points at `reference/architecture/dependency-graph.md` and `reference/architecture/boundary-map.md`, and `boundary-map.md` points at `reference/type-system.md`, itself a pointer. Also here: `architecture/overview.md` carries two cross-reference bullets where `DOCUMENTATION_MAP.md` states a pointer holds _"a redirect table and no content"_ (both found 2026-08-18). Check the same two shapes across the wizard and testing stub pairs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | chore    | easy       |
| CLI-538 | **Owner ruling wanted: is the comment wrong, or is the code?** (raised 2026-08-18 by the config doc re-derivation, which found it and did not guess.) `splitConfigByScope`'s own doc comment says the project half clears `selectedDomains`. **It does not** — `projectConfig = { ...config, name, agents, skills, stack }` overrides four keys and the spread's `selectedDomains` survives; the global literal's conditional re-set is a no-op after its own spread. So either the comment is stale and should be corrected, or the clearing was intended and never implemented. **It is not observable in any emitted config today**, because both project writers recompute the field — which is exactly why it could rot unnoticed and why it needs a decision rather than a patch. One sentence settles it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Needs Ruling  | chore    | trivial    |
| CLI-539 | **Ten findings sit at `status: partial` for one reason only: the standard they propose for `documentation-bible.md` was never written** (enumerated 2026-08-18 while writing the absence rule). This is the backlog behind _"a finding is a note, not a check"_ — five symbol names on the config pages stayed wrong for a day after a 2026-08-17 finding named that exact document, because filing it discharged nothing. The ten: `2026-07-30-negative-exhaustiveness-claims-…` and `2026-07-30-docs-recorded-a-deletion-that-was-later-reverted` (**same family as the absence rule just written — read these first, they may already be discharged**), `2026-07-30-doc-hook-table-has-no-row-for-the-installer`, `2026-07-30-findings-rollup-has-no-snapshot-rule-…`, `2026-08-01-import-graph-docs-validate-rows-instead-of-diffing-edges` (extend the Heading Diff rule to table ROWS), `2026-08-01-reference-docs-name-identifiers-that-no-longer-exist` (a dangling-identifier rule — this is the class the config pass hit nine times), `2026-08-06-seed-contract-doc-describes-the-deleted-vendored-copy` (grep `.ai-docs/` before deleting a module), `2026-08-18-the-skill-index-drops-the-sizes-…`, `2026-08-18-a-finding-quoting-editor-code-is-reformatted-…`, and `2026-08-01-count-ownership-registry-names-a-doc-that-does-not-carry-the-count`. **Three are candidates for closing rather than writing** — the last one above was verified satisfied (`skills-and-matrix.md` now carries `defaultCategories \| 102`), as were `2026-07-30-known-limitations-not-revisited-…` and `2026-08-01-exhaustive-enumeration-extended-not-rederived-stayed-short`. Decide each: write it, or resolve it. **Two of the ten no longer exist — deleted in the 2026-08-18 prune — so this is eight.** **+1 since filing:** `2026-08-18-a-renamed-config-field-drifted-through-seven-documents-unseen` proposes two more — a rule for a field rename whose OLD name survives as a genuinely-live symbol one layer away (`SkillConfig.source` → `origin` hid behind `SkillReference.source` and `Skill.source`, so a grep returned live and dead hits together and the rename went unseen through SEVEN documents), and extending the no-line-**numbers** rule to line **counts**, all five of which were found stale | Ready for Dev | chore    | medium     |
| CLI-540 | **Three code-side defects the wizard doc pass found and did not fix** (2026-08-18). (1) **`e2e/pages/steps/search-modal.ts` is a page object for a feature the wizard does not have** — verified: no spec imports `SearchModal`, and nothing in `src/cli/` binds `/` in a `useInput` handler, so `BuildStep.openSearch()` presses a key no handler reads. It survives because nothing imports it and nothing type-checks it against the UI, which makes it the test-infrastructure twin of a documented-but-absent feature. (2) `wizard-store.ts`'s JSDoc on `resolveSkillRowInputs` names **`withSelectedSource`**; the helper is `withSelectedMode`. (3) `scope-diff.ts`'s JSDoc on `agentSlotKey` cites `D-278`, which `todo/cli.md` records as renumbered after an ID collision — so one ID names two rows and the dangling reference has already escaped `.ai-docs/` into source. (4) `.ai-docs/reference/config/configuration.md` carries "the D-220 delta pipeline" in a redirect row. **Rule 3 of `documentation-bible.md` was tightened 2026-08-18 to ban task IDs live or dead**, so (3) and (4) are violations rather than judgement calls — and **the ESLint guard for this class reaches test names and `expect` messages only, never prose or JSDoc**, so nothing catches either                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev | chore    | easy       |
| CLI-541 | **`TEMPLATE.md` defines a lifecycle-field pairing rule and nothing enforces it.** `check-findings-frontmatter.ts` only proves the YAML _parses_; it never checks that `status: resolved` carries a `resolved_by:` or that `status: partial` carries a `partial_note:`. Four instances found in one read-only sweep (2026-08-18): two `resolved` with no `resolved_by`, one `open` sitting beside a `resolved_by`, and one more `resolved` unpaired. The check is cheap — the parse already yields the object — and it belongs beside the existing one rather than in a new script. **Do NOT enforce it by rewriting the offending files first**: the pairing failures are evidence about how findings get closed, so land the check, let it go red, and fix the four deliberately                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ready for Dev | feature  | easy       |
| CLI-542 | **Seven findings prescribe an action current source contradicts, and each is an approved-looking justification for making the repository worse** (found 2026-08-18 by a re-audit whose every call was adversarially verified). Four would overwrite a correct document with its INVERSE: the two dual-scope `s`-toggle findings would rewrite `tombstone-pattern.md` to say `s` is a guarded no-op when `toggleSkillScope`/`toggleAgentScope` make it the sole collapse; `a-destructive-apply-must-be-told-what-it-does-not-own` documents an invariant CLI-519 reversed, and following it is **why `edit.md` and `scope-system.md` still carry an "Inherited global" kept-reason whose predicate exists nowhere in `src/` and contradicts the same file 80 lines up**; `a-skills-category-never-reaches-dist` asks a reference doc to state plainly something false since 2026-08-10. Three would reverse a deliberate decision: `design-tokens-fail-wcag-aa-contrast` (refused in three places including `todo/www.md` § _Constraints already settled — do not undo these_), `shared-fixture-const-vs-file-local-const-adoption-boundary` (its rule mandates a hand-built id that `test-data.md` forbids and that `e2eSkillId` namespacing makes wrong). **The docs the fourth one already damaged are the actionable half; the rest is marking the findings.** Full evidence per finding in `.ai-docs/agent-findings/INDEX.md` § Re-audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ready for Dev | bug      | medium     |
| CLI-544 | **A finding's citation carries the fact, and nothing checks it resolves.** Deleting 66 findings on 2026-08-18 left **64 dangling citation sites across 39 surviving files**, and the mandated link-integrity scan would have caught **one** of them — the single `supersedes:` key. The rest were body prose (51), `affected_files:` (11) and `partial_note:` prose (2). **So widening the scan to more frontmatter keys is the wrong fix**: a key-scoped rule reaches 13 of 64. Assert instead that every `YYYY-MM-DD-*.md` token ANYWHERE under `.ai-docs/`, `src/`, `e2e/` and `scripts/` resolves to a file on disk, stated over whole files rather than an enumerated key list. **This already happened once and nobody noticed** — 21 names from an earlier batch deletion are still dangling in `2026-04-21-agent-findings-frontmatter-drift-iter45`, `2026-07-17-e2e-helper-tests-have-no-runnable-home` and the two `2026-07-24-d226-*` findings. Land the check, let it go red on those 21, and repair them. Also write the deletion protocol the repair pass derived: **grep the basename before deleting, because every hit is either a fact to relocate into the citing sentence or a sentence that is now itself false** — three were, in that batch alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Ready for Dev | feature  | easy       |
| CLI-545 | **The accuracy programme — start here.** [`plans/accuracy-worklist.md`](./plans/accuracy-worklist.md) is the ordered worklist derived from all 316 surviving findings on 2026-08-18: 8 documentation groups (**D1–D8**, docs that are wrong RIGHT NOW, each verified against source and adversarially re-checked) and 20 mechanical ones (**M1–M20**). It carries its own sequence, dependencies and effort — 30–43 hours total, steps 1–8 are 8–10 hours and carry most of the value. **D1 first: following the docs produces a REJECTED config**, because `SkillConfig.source` → `origin` never reached five reference pages and `schemas.ts` refuses the documented field by name. **M16 is the largest lever on agent output quality** — fifteen `identity.md` files still open "be comprehensive and thorough", a mandate removed from both its sources while `prompt-bible.md` now says the opposite. **Rows already filed that the worklist absorbs, do not do twice:** CLI-534 = D2, CLI-535 item 2 = M1, CLI-540 = D1's JSDoc half + D5's dead page object, CLI-541 + CLI-544 = M14's findings-format half, CLI-542 = the doc damage in D1/D6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev | feature  | complex    |
| CLI-331 | (was Bug 4) `edit` warns but keeps recompiling when the config write fails — silent three-way drift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | bug      | complex    |
| CLI-359 | `agent.liquid` reads `permission_mode`/`disallowed_tools`; `AgentConfig` carries camelCase — never emits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Ready for Dev | bug      | easy       |
| CLI-362 | (was 2026-04-20 finding) Newly-toggled agents hard-code global scope, starving a project-scoped stack.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev | bug      | complex    |
| CLI-363 | (was 2026-04-22 finding) Edit-mode scope awareness — `cwd` and the detected install diverge across layers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Investigate   | bug      | complex    |
| CLI-367 | `validateBuildStep` has no production caller — required categories never block wizard advancement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Investigate   | bug      | easy       |
| CLI-385 | (was briefly CLI-368) The 2026-08-05 agent restructure sits uncommitted — all work done and green; land as one commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev | refactor | easy       |

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

| ID      | Task                                                                                                             | Status        | Type     | Complexity |
| ------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| D-235   | E2E gap: `buildProjectTypesExtras` new-domain/category path is uncovered.                                        | Ready for Dev | refactor | easy       |
| D-234   | E2E config inspection via `loadProjectConfig` instead of regex-on-`config.ts`.                                   | Done          | refactor | complex    |
| D-219   | E2E fixture-default ergonomics. [Plan](./plans/D-219-wizard-launcher-default-fixture.md)                         | Ready for Dev | refactor | complex    |
| D-168   | Audit E2E tests — replace manual file construction with CLI commands.                                            | Ready for Dev | refactor | complex    |
| D-111   | Replace E2E text anchors with stable test identifiers.                                                           | Investigate   | refactor | complex    |
| D-64    | Create CLI E2E testing skill + update `cli-framework-oclif-ink`.                                                 | Ready for Dev | feature  | complex    |
| CLI-321 | (was P4-18) Test multiple skill/agent creation — depends on CLI-320.                                             | Deferred      | refactor | complex    |
| CLI-328 | (was expressive-ts decision 6) `e2e/pages/constants.ts` re-declares production constants inconsistently.         | Investigate   | refactor | easy       |
| CLI-335 | `e2e/interactive/init-wizard-filter-incompatible.e2e.test.ts` — 1 test, gated on `FILTER_INCOMPATIBLE`.          | Ready for Dev | refactor | easy       |
| CLI-336 | `e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts` — 1 test, same flag.                          | Ready for Dev | refactor | easy       |
| CLI-337 | `e2e/interactive/init-wizard-sources-cancel-persists.e2e.test.ts` — 1 test, gated on the settings overlay.       | Ready for Dev | refactor | easy       |
| CLI-338 | E2E: `build plugins` on the E2E source → initial compile produces `plugin.json` at version `1.0.0`.              | Done          | refactor | easy       |
| CLI-339 | E2E: `build plugins` after editing a skill's SKILL.md → version bumps to `2.0.0` for that skill only.            | Done          | refactor | easy       |
| CLI-340 | E2E: `build plugins` with no change → version stays at `2.0.0` (idempotent).                                     | Done          | refactor | easy       |
| CLI-341 | E2E: `build plugins` with multiple skills → only the modified skill's version increments.                        | Done          | refactor | easy       |
| CLI-342 | E2E: `build plugins` then `build marketplace` → `marketplace.json` lists all skills at correct versions.         | Done          | refactor | easy       |
| CLI-343 | E2E: `build marketplace` after a bump → `marketplace.json` reflects the updated version.                         | Done          | refactor | easy       |
| CLI-344 | E2E: `build marketplace` output structure — each entry has `name`, `version`, `source`, `category`.              | Done          | refactor | easy       |
| CLI-346 | E2E: `update` distinguishes globally-scoped skills from project-scoped ones — `globalResults` is never asserted. | Done          | refactor | complex    |
| CLI-546 | `e2e/handrun-journeys.ts` hardcodes `/home/vince/dev/skills`, so journey 28a skips for everyone else.            | Ready for Dev | refactor | easy       |

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
combination of chrome and terminal height can bleed. Detail in
`.ai-docs/agent-findings/2026-07-31-a-precondition-checked-once-before-render-is-not-a-gate.md` and the
sibling findings dated 2026-07-31.

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

#### CLI-362 (was `2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack`)

`toggleAgent` in `wizard-store.ts` hard-codes `scope: "global"` for every newly-added agent
(`applyAgentToggle`, else-branch), with no consideration of the surrounding project's scope convention.
In an edit flow where the project is entirely project-scoped, toggling on a NEW agent produces a
global-scoped agent in a project-scoped world.

Downstream, `config-generator.ts::isScopeCompatible` enforces "project skills never reach global
agents". The newly-selected agent therefore receives ZERO stack assignments, `buildAgentStack` returns
undefined, and `stack[newAgent]` is never emitted — breaking the explicit D-220 contract that a
newly-selected agent seeds from ownership defaults (`stack-per-agent-curation.e2e.test.ts`).

**Proposed rules** (for a "Wizard scope defaults" section in the CLI standards):

1. Newly-toggled agents inherit scope from the dominant scope of existing non-excluded `agentConfigs`.
   If every existing active entry is `project`, new agents default to `project`; otherwise `global`. A
   fresh init with zero agents keeps defaulting to `global`.
2. Equivalent expressed against skills: when skill configs are entirely project-scoped in edit mode, new
   agents must not be global-scoped.

**Tests missing entirely:** wizard-store units covering (a) `toggleAgent` ON in edit mode with existing
project-scoped `agentConfigs`, (b) the same with only project-scoped `installedSkillConfigs`. Assertion
target: the new agent's `scope` in `agentConfigs`.

`config-generator` should also emit a `verbose` log when `buildAgentStack` returns undefined due to
100% scope-incompatible filtering — that would have flagged this during development.

---

#### CLI-363 (was `2026-04-22-edit-mode-scope-awareness-systemic-audit`)

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

(was D-278; renumbered per the 2026-04-21 ID-collision finding —
`.ai-docs/agent-findings/2026-04-21-todo-id-collisions-in-completed.md`. The completed D-278 row is the
unrelated Sources-tab diff task.)

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
in `skills-and-matrix.md` and the finding
`2026-08-07-requires-closure-cannot-carry-the-whitelist-verdicts.md`. Any future re-add of
positive-guidance or presence semantics starts from those records.

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
the fragility is purely test-side. Cross-ref:
`.ai-docs/agent-findings/2026-04-17-shared-config-stack-parser.md`.

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

No `no-restricted-syntax` rule exists for this. It was deliberately left out to keep the initial rule set
stock, which is why `agent-findings/2026-07-17-d167-task-id-recurrence-no-lint-guard.md` remains unclosed.

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

Findings `2026-08-05-builtin-agent-rosters-unbound-to-generated-agent-names.md` and
`2026-08-05-roster-expectations-pinned-by-count-not-by-name.md`. Four surfaces must agree — the
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

Finding `2026-08-05-built-in-agent-partials-instruct-users-to-write-into-repo-internal-paths.md`:
eleven partials across six pre-existing shipped agents instruct compiled agents to write to
`.ai-docs/agent-findings/` or cite CLAUDE.md — paths that do not exist in an installing project.
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

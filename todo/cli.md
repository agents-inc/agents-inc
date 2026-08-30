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

- **Existing `D-NNN` items keep their IDs unchanged.** They are referenced across the changelog
  files, throughout `.ai-docs`, across the agent findings, in commit messages and in test
  comments. Renaming breaks all of that. (Both figures this bullet used to carry had gone stale
  by 2026-08-25 — they are the kind of count that is correct when written and wrong within days,
  and neither was load-bearing to the point being made.)
- **New items get `CLI-NNN`, continuing the same sequence.** The highest `D-NNN` was D-310, so new
  numbering starts at CLI-311. One sequence, two prefixes, no collisions.
- Items that arrived here from a retired scheme (`UX-NN`, `P4-NN`, `R-NN`, `#N`, `Bug N`) record their
  old identifier in the row, so existing references still resolve.

---

## Bugs

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status        | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------- | ---------- |
| CLI-825 | **`.ai-docs/reference/testing/e2e-infrastructure.md`'s E2E directory tree lags the suite by 27 files, and two of the gaps are structural rather than missing rows.** Measured 2026-08-25 by parsing the fenced tree into full relative paths and diffing BOTH directions against `find e2e -type f`: **zero named-but-absent, 27 present-but-unnamed** — so the listing is maintained on deletions and renames and lags only on additions. The two worth reading before adding rows: (1) **`e2e/pages/` now holds two of its own specs** (`list-row-toggle.e2e.test.ts`, `retry-space.e2e.test.ts`) beside the page objects, which contradicts that document's own section arguing which directories may carry tests (`e2e/assertions/ Carries No Tests, and a Test Put There Would Not Run`) — decide whether the tree or the claim is wrong before documenting it; (2) **`e2e/setup.ts` exists and is unnamed** while the block above the tree states `e2e/vitest.config.ts` has no `setupFiles` — possibly consistent, but the document gives a reader no way to tell. The remaining 25 are ordinary missing rows across `commands/` (8), `interactive/` (8), `lifecycle/` (5), `pages/` (4), `integration/` (1) and the root (1). This breaches an EXISTING standard rather than needing a new one — `documentation-bible.md`'s _A Name in a Document Is a Claim About Source_, check 4, which names `comm -3` and states why a one-direction pass is not a validation. Re-derive before working: `ls packages/cli/e2e/pages/*.e2e.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ready for Dev | docs     | medium     |
| CLI-835 | **`expectPhaseSuccess` and `expectDualScopeInstallation` can narrow their AGENT fields today, and it type-checks clean.** Proved 2026-08-25 while establishing why the matcher signatures could NOT narrow (CLI-830): narrowing only `agents` / `compiledAgents` to `readonly AgentName[]` passes both TypeScript projects with zero errors. **Their `skillIds` fields cannot** — those hit the same fixture-marketplace namespacing wall that refuted CLI-827, because `e2eSkillId` produces ids the `SkillId` union deliberately cannot contain. So this row is the agent half only, and splitting it that way is the point: the two fields of one helper have different answers. This belongs to the census the assertion-helper rule in `packages/cli/CLAUDE.md` already carries ("NEVER let a shared assertion helper's signature overstate what it checks", which names both helpers), not to the matcher signatures — it was reported rather than folded in to keep CLI-830 a clean refusal. Re-derive before acting; measure BOTH projects: `npx tsc --noEmit && npx tsc -p e2e/tsconfig.json --noEmit`. Census: `grep -rn 'expectPhaseSuccess\|expectDualScopeInstallation' packages/cli/e2e packages/cli/src --include='*.ts'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ready for Dev | refactor | easy       |
| CLI-836 | **`agent-partials.test.ts`'s assertion message claims twice what its assertion checks.** The message reads _"`${requires}` belongs in `${file}` and in no sibling partial"_, while the assertion behind it is `toStrictEqual([])` over the copies **missing** the tag — a presence check only. Nothing verifies the "and in no sibling" half, so the no-duplication contract that message advertises **is editorial, not enforced** — established 2026-08-25 when a brief asserted it as a gate and it turned out not to be one. This is `packages/cli/CLAUDE.md`'s own rule ("NEVER let a shared assertion helper's signature overstate what it checks") arriving at an assertion MESSAGE rather than a helper signature, and the same reasoning applies: nobody opens the assertion, so the message is what every reader believes. Two honest fixes — drop the "and in no sibling" half, or add the assertion behind it. **Prefer dropping it unless the duplication check is genuinely wanted**, since inventing a cross-partial content check to justify a message is the tail wagging the dog. Census: `grep -n 'belongs in' packages/cli/src/cli/lib/__tests__/agent-partials.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Ready for Dev | test     | easy       |
| CLI-838 | **This repository's own agents compile from Aug-21 templates, because ejected copies shadow `src/`.** `packages/cli/.claude-src/agents/_templates/methodologies/` holds ejected `.liquid` copies dated 2026-08-21, and `createLiquidEngine` **prefers them over `src/agents/_templates/`**. Measured 2026-08-25: `anti-over-engineering` ejected 3423 bytes vs source 4702, `success-criteria` 3225 vs 4140, `context-management` 3911 vs 1205 — so all three of that day's template changes are invisible to the agents this repo installs. **The dangerous half is the verification trap**: a hand-compile run from this project directory silently renders the STALE text and exits 0, which is exactly how an agent verifying its own template edit came to paste back the pre-edit section as proof. Anyone verifying template work here must compile against a project directory with **no** ejected templates, or refresh these first. Decide whether the ejected copies are still wanted at all — if they are, they need a freshness check; if not, deleting them removes the shadow. Census: `for f in packages/cli/src/agents/_templates/methodologies/*.liquid; do n=$(basename $f); echo "$n src=$(wc -c <$f) ejected=$(wc -c <packages/cli/.claude-src/agents/_templates/methodologies/$n 2>/dev/null)"; done`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ready for Dev | bug      | medium     |
| CLI-839 | **Four playbooks still instruct the session-file protocol that was cut from the shared partial.** `context-management.liquid` stopped teaching `progress.md` / `decisions.md` / `insights.md` on 2026-08-25, but `developer/api-developer/playbook.md`, `developer/cli-developer/playbook.md`, `developer/web-developer/playbook.md` and `planning/pm/playbook.md` carry their own copies, and **three survive into a compiled agent** — so the trim is partial until they go. Worth reading `meta/agent-summoner/playbook.md` and `meta/skill-summoner/playbook.md` first: both already carry the BETTER shape — _"If session is interrupted, state what was completed / Note next steps clearly"_, i.e. reporting rather than file-writing — which is corroborating evidence that the five-file scheme was the outlier rather than the convention. Match those two rather than inventing a third form. Census: `grep -rn 'progress\.md\|decisions\.md\|insights\.md' packages/cli/src/agents/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ready for Dev | refactor | easy       |
| CLI-833 | **Three more comments assert the removed required-category gate, and one of them is page-object infrastructure.** CLI-824 fixed the site it named; a census run while fixing it found the same false claim in files that row did not cover. `e2e/interactive/init-wizard-stack.e2e.test.ts` says "Select required skill in Web domain and advance" **four lines above the `(0 of 1)` assertion that disproves it**. Worse, `e2e/pages/steps/build-step.ts` carries it twice — a docblock claiming "Web needs a skill selected (Space)" asserts the gate, and "API's required skill is auto-selected" **contradicts the function's own body**, which presses Space via `toggleFocusedSkill()`. That file is infrastructure, so a wrong docblock there misleads every future spec author rather than one reader. All three predate CLI-822 and were false before it too. Verified at source: `StepBuild` handles Enter as `if (key.return) { onContinue(); }` — unconditional, no selection count in scope. **Leave alone**: `init-wizard-scratch.e2e.test.ts` and `init-wizard-ui.e2e.test.ts` each carry a TRUE sibling describing what `passThroughScratchDomains()` does, and the `matrix-resolver.test.ts` hits are skill DEPENDENCIES (`getUnmetRequiredBy`), a live concept. Census: `grep -rn 'required framework skill\|required skill\|required Framework' packages/cli/e2e packages/cli/src`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Ready for Dev | docs     | easy       |
| CLI-834 | **`generateMatrix` no longer generates a matrix.** CLI-826 deleted its `testMatrix` return member, so it now returns only the two disk config shapes (`diskCategories`, `diskRules`) — the name states something the function stopped doing, which is the same defect class CLI-833 covers in comments. It is unexported with exactly one call site in `src/cli/lib/__tests__/fixtures/create-test-source.ts`, so the rename is two lines and entirely local. Reported rather than taken by the agent that created the condition, because it fell outside that row's enumerated scope. Census: `grep -rn 'generateMatrix' packages/cli/src packages/cli/e2e packages/cli/scripts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev | refactor | easy       |
| CLI-837 | **Dynamic skills have never worked on any compiled agent — the emitter instructs a tool it does not grant.** Every agent body renders a `<skill_activation_protocol>` saying _"For EVERY skill you marked YES, you MUST invoke the Skill tool IMMEDIATELY"_ plus an `## Available Skills (Require Loading)` list, while `agent.liquid` emits `tools: {{ agent.tools \| join: ", " }}` and **no agent's tool list contains `Skill`**. Measured 2026-08-25 on the 11 installed agents: **0 of 11 grant it, 11 of 11 list dynamic skills — 90 entries in total.** So a user picks dynamic skills in the wizard, the CLI writes them to `config.ts` and compiles them into the agent, and the agent cannot load one. **Verified empirically against Claude Code 2.1.245, not inferred**: a subagent with `tools: Read, Skill` dispatched `tool=Skill` successfully, and one with this repo's exact emitted list returned `tool unavailable` with no dispatch. The docs state it inversely — _"To prevent a subagent from invoking skills entirely, omit `Skill` from the `tools` list"_. **Fix**: emit `Skill` in `tools:` whenever the body lists dynamic skills. **Two traps established in the same investigation**: never emit `tools: []` or a blank `tools:` — an omitted key inherits (Skill included) but an EMPTY one does not, and the agent spawns without it; and unrecognised tool names are dropped silently, with only a total wipeout reported (`would be spawned with zero tools — refusing`). **Note the cost direction**: fixing this makes dynamic skills load, which SPENDS context rather than saving it — the current state is the worst of both, paying ~992 tokens/agent for the protocol and getting none of the capability. Preloaded skills are unaffected: `skills:` injects full content at startup and needs no tool. Census: `grep -L 'Skill' ~/.claude/agents/*.md \| xargs -r grep -lc 'Invoke: `skill:'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev | bug      | medium     |
| CLI-840 | **The instruction token budget — measured, with two proposals and a sequencing argument.** Standing cost is ~13,150 tokens before any work (root `CLAUDE.md` ~2,180 + `packages/cli/CLAUDE.md` ~10,970, the latter carrying 82 NEVER/ALWAYS rules at up to 248 words each), plus ~10,750–19,980 per sub-agent dispatch. **In a compiled `cli-developer` the `<role>` block is 4% of the agent**; the rest is scaffolding every sibling shares. **The premise that rules get skipped because too much is loaded is NOT supported by the corpus** — `rule-not-visible` is 7 of 167 findings (4%) against enforcement-gap at 39% — though that field is self-assigned and biased in exactly that direction, so treat 4% as a floor. Two ideas assessed: a mechanical compression pass (argued **against** — it targets the 4%, pushes against the 23% `rule-not-specific-enough` cluster, and would have shortened the narrowest-union rule the day before it was found wrong; the defensible version is **deduplication**, moving incident narrative to the `archive.md`/finding that already holds it while keeping the imperative and census verbatim), and an end-of-lifecycle **repeater skill** (argued **for**, with three changes: fresh context rather than self-check, a mechanical stop condition rather than "nothing missed", and build the rules-only variant first). **Sequencing is the strongest recommendation: build the repeater first, because it reports which rules actually fire and that is the evidence that makes any cut informed rather than blind.** Nothing here is ruled on. [Plan](./plans/CLI-840-instruction-token-budget-2026-08-25.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not Started   | refactor | large      |
| CLI-841 | **`generateBlankGlobalConfigSource()` disagrees with the canonical writer about FIELD ORDER — `skills` before `agents`.** Narrowed 2026-08-26: the quoting and trailing-comma halves closed when the emitter was formatted; two swapped lines remain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CLI-842 | **One integration spec breaks the refactor-survival rule; three unit tests are misfiled as e2e.** Owner ruling 2026-08-26, scoped to integration/e2e — see `.ai-docs/standards/e2e/test-structure.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| CLI-843 | **`e2e/helpers/handrun.gen.mjs` is a committed bundle that no script regenerates and no gate compares.** It carries a two-refactors-old signature and is clean in git                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| CLI-844 | **Put `export default` at the TOP of the emitted `config.ts`.** Owner request, long-standing. Cannot be done by reordering — TDZ — but inlining reaches it and shrinks the import to one name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CLI-845 | **Four emitted shapes are fixed points only by hand-verification, and three test helpers now parse the emitted config by convention.** Follow-ups from the 2026-08-26 formatting ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CLI-831 | **Nothing gates the CONTENT of any methodology partial, and that prose ships to every user.** `src/agents/_templates/methodologies/*.liquid` renders into every sub-agent the CLI compiles, so a partial silently emptied or half-edited reaches every install — and it is invisible to `tsc`, to ESLint and to `strictVariables: false`, which is stated in `agent-template-renders-its-partials.test.ts`'s own docblock. **The gap is precisely bounded:** `agent-partials.test.ts` covers only the per-agent `.md` partials (`identity.md`, `critical-requirements.md`, `critical-reminders.md`) — verified 2026-08-25 while a methodology partial was edited — and `agent-template-renders-its-partials.test.ts` covers the ROSTER of files and their render order, never their text. **Do not copy `PARTIAL_CONTRACTS`' shape**: its `everyCopyOf` globs `*/*/<file>` with no `ignore`, so it reaches into `_templates/` and would yield a phantom agent named `methodologies` that `agentNamesOnDisk()` (which does ignore `_templates/**`) never returns. Proposed shape, from the agent that hit this: a separate `it` in `agent-template-renders-its-partials.test.ts`, which already owns `METHODOLOGIES_DIR` and the rendered roster, asserting a per-partial required marker keyed off `RENDERED_METHODOLOGY_PARTIALS`. **A marker-per-partial roster is a design decision, not an accommodation** — decide the shape before writing it. Census: `grep -rn 'RENDERED_METHODOLOGY_PARTIALS\|METHODOLOGIES_DIR' packages/cli/src --include='*.ts'` **The cheapest useful version, run by hand on 2026-08-25 and worth keeping as the first cut:** assert on a COMPILED agent that each expected `<wrapper>` appears exactly once and that no `{%` or `{{` survives rendering. That catches wrapper duplication and Liquid syntax errors — not prose quality, but those are the two failures that would ship a visibly broken agent. Note `agent.liquid` supplies a `<methodologies>` group wrapper around the set while each partial owns its own inner tag, so the assertion counts both levels.                                                                                                                                                                                                                                                                                                                                | Ready for Dev | test     | medium     |
| CLI-832 | **`.ai-docs/reference/features/agent-system.md` summarises `investigation-requirements.liquid` as `"Never speculate" protocol: list files, read, verify`, which no longer covers half of it.** That partial gained a second section on 2026-08-25 — the specification is a claim, re-derive it, and corrections are a required report field — and **no checker gates that row**: `check-enumeration-drift.ts` and the other `scripts/check-*` do not read it, which is why this needs a row rather than a red test. Re-derive the partial's current sections before rewriting the summary, and check whether `compilation-pipeline.md` and `prompt-bible.md`, which also name the partials, restate the same thing. Census: `grep -rn 'investigation-requirements' packages/cli/.ai-docs` **Second stale cell in the same table:** the row for `context-management.liquid` describes it as "`.claude/` session files for cross-session continuity", which became false on 2026-08-25 when that partial was cut from a five-file session protocol to a report-contents rule. The XML Tag column stays correct; it is the Purpose cell in both rows. **EVIDENCE FOR THIS ROW'S CENTRAL CLAIM, added 2026-08-27: two more stale rows were found in the same file and FIXED the same day — they are recorded here as proof the gap is real, not as outstanding work.** Both were table cells, both false, and both were found only by diffing this tree against the documentation site by hand. (1) `preloadedSkills` was described as _"Skills embedded in prompt"_; nothing embeds it — `agent.liquid` renders `preloadedSkillIds` and `dynamicSkills` and never `preloadedSkills`, which has no production reader at all. **The identical false claim sat on two documentation-site pages until the same day**, so this file was the last place it survived. (2) The pruning table said `compile` with `hasBoth` runs _two passes_; `buildCompilePasses` returns a single-element array on both branches. `reference/commands/index.md`, four weeks newer, already said "the single pass this invocation owns" — so **this document set contradicted itself and no gate could see it**. The `compileAgentsAllScopes` rows were checked and left alone: that function really does run both passes. `last_validated` was deliberately NOT bumped, per `documentation-bible.md` — a pass that checks part of a document leaves the date alone. | Ready for Dev | docs     | easy       |
| CLI-821 | **Five `UI_SYMBOLS` members have no reader anywhere in `src` or `e2e`** — `DISABLED`, `SCROLL_UP`, `SCROLL_DOWN`, `CURRENT`, `UNSELECTED`. Found 2026-08-24 while landing CLI-329, which deleted the two the row NAMED (`CHECKBOX_CHECKED`, `CHECKBOX_UNCHECKED`) on the same evidence and stopped there rather than widening its own scope. Each is exported and each looks live: `SCROLL_UP`/`SCROLL_DOWN` read as the scroll-overflow affordance, which the product actually paints as TEXT through `STEP_TEXT.SCROLL_MORE_ABOVE`/`_BELOW`. `DISABLED` is a second name for the same en-dash as `SKIPPED`, so deleting it needs a look at whether the two states were meant to diverge. Re-derive before deleting — the census is one command: `for m in DISABLED SCROLL_UP SCROLL_DOWN CURRENT UNSELECTED; do grep -rc "UI_SYMBOLS.$m" src e2e --include='*.ts' --include='*.tsx'; done`. Two documents enumerate the symbol exhaustively (`reference/utilities.md`, `reference/component-patterns.md`) and `check-enumeration-drift` reds on both if they are not updated with it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Ready for Dev | refactor | easy       |
| CLI-535 | **`declarationOf` walks only top-level statements, so a `static` class member is unreachable and NO command's flag list is registerable.** This is the last of the five gaps the row originally carried; the other four landed 2026-08-19 and are recorded in `archive.md`. **Reproduced 2026-08-19** by probing the checker directly: a registry row of `{ file: "src/cli/commands/eject.ts", symbol: "flags" }` throws `names a symbol its source file does not export — flags`, and the same for `symbol: "args"`; `declarationOf` iterates `file.statements` and matches only `ts.isTypeAliasDeclaration` and `ts.isVariableStatement`, and the whole script contains no `isClassDeclaration`, `isPropertyDeclaration` or `StaticKeyword`. Two halves are needed and only one is code: a class-member path in `declarationOf` (or a new source shape), **and a document table for it to bind to** — no command's flags are enumerated anywhere in `.ai-docs/` today, so building the reader alone would land a mechanism with no customer. `edit`'s computed flag key is a separate complication and is not the blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ready for Dev | feature  | small      |
| CLI-541 | **`TEMPLATE.md` defines a lifecycle-field pairing rule and nothing enforces it.** `check-findings-frontmatter.ts` only proves the YAML _parses_; it never checks that `status: resolved` carries a `resolved_by:` or that `status: partial` carries a `partial_note:`. Four instances found in one read-only sweep (2026-08-18): two `resolved` with no `resolved_by`, one `open` sitting beside a `resolved_by`, and one more `resolved` unpaired. The check is cheap — the parse already yields the object — and it belongs beside the existing one rather than in a new script. **Do NOT enforce it by rewriting the offending files first**: the pairing failures are evidence about how findings get closed, so land the check, let it go red, and fix the four deliberately                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev | feature  | easy       |
| CLI-554 | **Three genuinely new capabilities**, detailed in [`plans/parked-features-2026-08-19.md`](./plans/parked-features-2026-08-19.md). (1) The seed contract cannot carry half of what a config holds — `model: "inherit"` has no spelling and `agentsSource` has no field; closing either means new schema fields and a `SEED_VERSION` bump the editor and the worker share. (2) The wizard save path discards the whole `GateReport`, so a project skipped during an init/edit fan-out is invisible — surfacing it is a new signal, and auto-deregistering is a new capability. (3) `registerProjectPath`'s sweep is silent; every remedy its finding offers is a new user-visible signal. A fourth item is recorded there and gated by its own author on "if anyone acts on this". **This row was 51 items until the owner ruled that a guard is not a feature** — the other 48 went back into the fixes round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Ready for Dev | feature  | medium     |
| CLI-635 | **PARKED by owner 2026-08-22 — recorded with the option, not dropped.** The universal resolver over every backticked identifier was refuted by measurement: 2707 names, 2634 resolve, and it **misses the founding defect** (three of CLI-610's five symbols DO resolve, as file-local non-exported consts in a sibling workspace) while its only two hits on that class are FALSE POSITIVES — the sentence saying those symbols do not exist. 45 of 88 pairs are absence-prose. The real predicate is existence **at the named location**. **The option to build when this is unparked:** a subset verdict on `check-enumeration-drift.ts` — `table-pairs` over a symbol column and a file column, reporting `namedButAbsent` ONLY and never `presentButUnnamed`, because these inventory tables are deliberately partial where every existing reader binds exhaustively both ways. Immune to both failure families by construction; population already shaped at **67 tables, 518 rows**. **Its limit, stated rather than sold:** it reads tables, so it would have caught one of CLI-610's three instances and neither of the two that were prose. Related and now permitted: CLI-629's compiler-API walk, ruled yes the same day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Deferred      | chore    | medium     |
| CLI-678 | **A loading spinner survives into the wizard frame and fails a whole-screen visibility assertion, intermittently.** `e2e/lifecycle/dual-scope-edit-scope-changes.e2e.test.ts` → _"Toggle a global agent's scope to project"_ failed `assertWizardScreenIsWhollyVisible` with one line above the viewport: the `⠸ Loading skills...` line still present in the frame. Observed once 2026-08-22; passed on re-run and in two consecutive full green E2E suites, so it is **timing-dependent rather than a fixture problem**. Worth chasing because the assertion is a real one — a frame that still holds the spinner is a frame the wizard has not finished painting, so widening or retrying the assertion would hide the thing it exists to catch. Look at whether the wizard-ready sentinel can outrun the spinner's clear.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Investigate   | bug      | small      |
| CLI-697 | **Two `architecture` documents, one a 19-line stub, both carrying identical frontmatter.** `.ai-docs/reference/architecture-overview.md` (531 lines) and `.ai-docs/reference/architecture/overview.md` (19 lines) both declare `scope: reference` / `area: architecture`, and both were modified on 2026-08-22. Either a split in progress or an unfinished move — **establish which before touching either**, because a reader arriving at the stub has no way to know the 531-line document exists. If it is an abandoned move, delete the stub; if a split, the stub needs to say what it owns and point at the other.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Investigate   | docs     | trivial    |
| CLI-750 | **A PTY abort flake: one run in three, exit 0 where CANCELLED was required.** `e2e/lifecycle/edit-outside-an-install-edits-the-global-one.e2e.test.ts` failed once in three consecutive full E2E runs — _"the edit wizard's Ctrl+C abort must exit CANCELLED (4), got 0"_, raised by `abortAndDestroy` during teardown. Passes alone (8/8) and passed in the other two runs. **The dist-replacement guard did NOT fire in that run**, so it is not the shared-build race and needs its own diagnosis — which is precisely why that guard was built: a flake that survives it is now a real signal rather than one of a dozen indistinguishable ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Investigate   | bug      | small      |

## Wizard & CLI UX

| ID      | Task                                                                                                                                | Status           | Type     | Complexity |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| CLI-738 | (was D-276) Exclusive category: allow selecting a skill that conflicts with a global one, defaulting it to project scope.           | Ready for Dev    | feature  | complex    |
| CLI-739 | (was D-280) Prune built-in stacks — DEFERRED (owner 2026-08-07: will decide later; simpler now that stacks carry no preload flags). | Deferred         | refactor | easy       |
| CLI-735 | (was D-211) Reorder stack-selection render: scratch → React → other frameworks → CLI.                                               | Ready for Dev    | feature  | complex    |
| CLI-734 | (was D-181) Add YOLO mode toggle to build step. [Plan](./plans/CLI-734-yolo-mode-toggle.md)                                         | Ready for Dev    | feature  | complex    |
| CLI-311 | (was UX-04) Interactive skill search polish — manual testing plus tests for the search component.                                   | Needs Assistance | feature  | complex    |
| CLI-312 | (was UX-05) Refine step — surface skills.sh community alternatives.                                                                 | Needs Assistance | feature  | complex    |
| CLI-313 | (was UX-06) Search with colour highlighting — needs more UX thought.                                                                | Needs Assistance | feature  | easy       |
| CLI-314 | (was UX-07) Incompatibility tooltips — show the reason when a disabled option is focused.                                           | Needs Assistance | feature  | easy       |
| CLI-315 | (was UX-08) Keyboard shortcuts help overlay — in-wizard help for keybindings.                                                       | Needs Assistance | feature  | easy       |
| CLI-316 | (was UX-09) Animations / transitions — polish pass for step transitions.                                                            | Needs Assistance | feature  | easy       |

## Matrix, config & scope

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status      | Type     | Complexity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ---------- |
| CLI-740 | (was D-306) Deeper incompatibility rules — richer semantics beyond conflicts/requires; scope TBD with Vincent.                                                                                                                                                                                                                                                                                                                                                                                                                               | Investigate | feature  | complex    |
| CLI-727 | (was D-118) Rename project/global scope to project/user — DEFERRED to the very end with CLI-425 (owner 2026-08-07: easy, but last, after everything is committed). **REAFFIRMED 2026-08-17 (owner): still deferred to the very end, and MAY NEVER BE IMPLEMENTED AT ALL.** Not "deferred until convenient" — an open question about whether the rename is worth doing, to be answered after everything else is committed. Do not schedule it, do not fold it into an adjacent pass, and do not treat a file it would touch as blocked on it. | Deferred    | refactor | complex    |
| CLI-324 | (was expressive-ts decision 2) Config-load leniency vs what `ProjectConfig` promises about agents and domains.                                                                                                                                                                                                                                                                                                                                                                                                                               | Investigate | refactor | complex    |

## Commands & lifecycle

| ID      | Task                                                                                                | Status                  | Type     | Complexity |
| ------- | --------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ---------- |
| CLI-732 | (was D-179) Extract shared post-wizard pipeline into a ProjectLifecycle orchestrator.               | Investigate             | refactor | complex    |
| CLI-719 | (was D-26) Marketplace-specific uninstall. [Plan](./plans/CLI-719-marketplace-uninstall.md)         | Ready for Dev           | feature  | complex    |
| CLI-718 | (was D-25) Auto-version check + source staleness. [Plan](./plans/CLI-718-auto-version-check.md)     | Ready for Dev           | feature  | complex    |
| CLI-716 | (was D-13) Eject skills by domain/category. [Plan](./plans/CLI-716-eject-skills-filtered.md)        | Refined                 | feature  | complex    |
| CLI-721 | (was D-47) Eject standalone compile function. [Plan](./plans/CLI-721-eject-compile-function.md)     | Deferred — low priority | refactor | complex    |
| CLI-717 | (was D-19) Improve template error messages. [Plan](./plans/CLI-717-template-error-messages.md)      | Deferred — nice to have | feature  | complex    |
| CLI-714 | (was D-08) User-defined stacks in consumer projects. [Plan](./plans/CLI-714-user-defined-stacks.md) | Deferred                | feature  | complex    |
| CLI-318 | (was #5) Agents command for skill assignment, with per-skill preload control.                       | Needs Assistance        | feature  | complex    |
| CLI-320 | (was P4-17) `agents-inc new` supports multiple items. [Plan](./plans/P4-17-new-multiple-items.md)   | Refined                 | feature  | complex    |

## Web ↔ CLI integration

| ID      | Task                                                                                                                                                                                                                                               | Status        | Type    | Complexity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ---------- |
| CLI-388 | Machine-readable product data: `search --json` / `catalog --json` — now also the stacks and the preload mapping, so stack-detect's intent mode and load deference can read them (SKILLS-10 found no run-time route exists).                        | Ready for Dev | feature | complex    |
| CLI-405 | Derive `requires`/`needsAny` from framework-support surfaces — CONDITIONAL derivation only (B11 proved the mechanical rule breaks on setup-env: adapters of a self-sufficient neutral core must not derive a fence). Blocked on SKILLS-01 phase 2. | Ready for Dev | feature | complex    |

## Testing & E2E coverage

| ID      | Task                                                                        | Status        | Type     | Complexity |
| ------- | --------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| CLI-726 | (was D-111) Replace E2E text anchors with stable test identifiers.          | Investigate   | refactor | complex    |
| CLI-723 | (was D-64) Create CLI E2E testing skill + update `cli-framework-oclif-ink`. | Ready for Dev | feature  | complex    |

## Tooling, gates & code generation

| ID      | Task                                            | Status           | Type    | Complexity |
| ------- | ----------------------------------------------- | ---------------- | ------- | ---------- |
| CLI-715 | (was D-11) Development hooks for type checking. | Needs Assistance | feature | complex    |

## Types & code quality

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status                  | Type     | Complexity |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ---------- |
| CLI-728 | (was D-153) Standardize operation result types — consistent list/single-action return patterns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Deferred                | refactor | complex    |
| CLI-322 | (was R-06) Slim down `ResolvedSkill` — separate resolved relationship data from skill identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Deferred — low priority | refactor | complex    |
| CLI-325 | (was expressive-ts decision 3) `readonly` on read-model types — `types/` has essentially none.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Investigate             | refactor | complex    |
| CLI-326 | **DECLINED 2026-08-21 after measurement, not after a failed attempt — and the precondition PASSED.** The tombstone helper family, proposed for generic-isation and marked HIGH RISK. The lane proved the tests discriminate BEFORE deciding, with three mutations each restored: widening `isGloballyLockedSkill` to fire on the PAIR — the exact historical bug that once made "remove a skill from this project" unreachable — reddens **2**, and those two are the ALLOWED/REFUSED pair CLAUDE.md prescribes; mis-keying the agent-side predicate reddens **3**; collapsing `toggleTechnology`'s per-direction predicates reddens **1**. So the refactor COULD have been done safely. **It was declined because the row's justification does not survive re-derivation:** _"~70 lines each"_ measured **50 and 34**; _"a keyed predicate factory would halve ~150 lines"_ — the family is **47 lines including JSDoc**, its only duplicate is four one-line predicates, and a generic factory carrying both entry type and key type costs ~20–25 lines to replace 19, so **net saving ≈ zero**; _"six mirrors-the-skill-path comments"_ are **nine**. And the cost is specific and load-bearing: `blocksExclusiveSwap` exists only on the skill side, the agent side inlines its lock and splits the pair check into an earlier arm with a different outcome, and `toggleTechnology` picks a different predicate per DIRECTION — an asymmetry held by exactly ONE assertion. A factory would present the two sides as one family at precisely the layer where they differ. **Kept as the record of a measured no.** | Deferred                | refactor | complex    |

## Telemetry

| ID      | Task                                                             | Status        | Type    | Complexity |
| ------- | ---------------------------------------------------------------- | ------------- | ------- | ---------- |
| CLI-731 | (was D-170) Add PostHog anonymous telemetry.                     | Investigate   | feature | complex    |
| CLI-725 | (was D-90) Add Sentry tracking for unresolved matrix references. | Ready for Dev | feature | complex    |

## Docs, agents & skills

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status           | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------- | ---------- |
| CLI-737 | (was D-237) Create a GIF demo for the README.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev    | feature  | complex    |
| CLI-499 | Split out of CLI-463 (2026-08-16): the internal identifier rename that follows the surface — 263 distinct identifiers containing `source`/`Source` across src and e2e, 20 exported types, 37 exported functions (5 of which mean SOURCE CODE and are excluded), 53 files with `source` in the filename including one directory and one generated file, and 384 test names. Mechanical, uncoupled to CLI-498, and deliberately NOT in Track A. Respect CLI-463's MUST NOT RENAME list.                                                                  | Deferred         | refactor | complex    |
| CLI-500 | Split out of CLI-463 (2026-08-16): the documentation pass for the marketplace vocabulary — 241 files under `.ai-docs/` carrying 3,680 occurrences, plus the www content files. Runs AFTER the surface and field renames so it documents the end state once. Note the audit's separate finding that committed `apps/www/dist/` build output still documents `--source` as a `BaseCommand` flag inherited by every command, which stopped being true when the flag narrowed to init — it is tracked, so it pollutes any repo-wide grep during this work. | Deferred         | refactor | medium     |
| CLI-467 | DEFERRED (owner 2026-08-09: "we will get to knip later") — the knip deletion rounds: rule the baseline's categories (197 barrel lines, 53 export keywords, 35 zero-ref symbols, 11 devDeps, 3 duplicates, remaining unlisted deps incl. test-side ansis) and execute per class. Baseline: todo/plans/CLI-464-dead-code-baseline-2026-08-09.md. chalk fixed separately 2026-08-09.                                                                                                                                                                      | Deferred         | refactor | medium     |
| CLI-453 | DEFERRED — re-add `new skill`, NOT part of the go-live home stretch (owner 2026-08-09: go live without it, consider later). When built, it mimics the editor's intake flow — which is why it waits for that flow to settle, not the other way round.                                                                                                                                                                                                                                                                                                   | Deferred         | feature  | medium     |
| CLI-733 | (was D-180) Write a "Bring your own skills" guide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Investigate      | feature  | easy       |
| CLI-729 | (was D-162) Skill Olympics — benchmark the expressive-typescript skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Investigate      | refactor | complex    |
| CLI-724 | (was D-66) AI-assisted PR review: categorize diffs by type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Investigate      | feature  | complex    |
| CLI-722 | (was D-62) Review default stacks: add reviewing / research / methodology skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Ready for Dev    | feature  | complex    |
| CLI-720 | (was D-41) Create the `agents-inc` configuration skill. [Plan](./plans/CLI-720-config-sub-agent.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ready for Dev    | feature  | complex    |
| CLI-317 | (was UX-13) Add readable schemas on sub-agents and skills.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Needs Assistance | feature  | complex    |
| CLI-319 | (was #19) Sub-agent learning capture system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Needs Assistance | feature  | complex    |
| CLI-380 | Complete the infra domain roster (developer, pm, researcher, tester) — deferred at CLI-351's landing.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Deferred         | feature  | complex    |
| CLI-383 | No stack assigns any ai-domain agent — curate AI stacks now five ai agents exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Needs Assistance | feature  | complex    |
| CLI-425 | Invariant (owner 2026-08-07): a skill id always includes its category. 33 violations audited; ALL renames parked until the very end. [List](./plans/CLI-425-id-category-violations.md)                                                                                                                                                                                                                                                                                                                                                                 | Deferred         | refactor | complex    |

---

## Reminders for agents

See [docs/cli/guides/agent-reminders.md](../docs/cli/guides/agent-reminders.md) for the full list of
rules (use specialized agents, handle uncertainties, blockers, commit policy, archiving, status
updates, context compaction).

---

## Active Tasks

### Bugs

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

#### CLI-738 (was D-276): Exclusive category — allow a project skill to override a global one

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

#### CLI-739 (was D-280): Prune the built-in stack list

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

#### CLI-735 (was D-211): Reorder stack-selection render — scratch → React → other frameworks → CLI

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

#### CLI-734 (was D-181): Add YOLO mode toggle to build step

Disables all skill relationship constraints (single-select categories, requires, conflicts, discourages)
so users can select any combination freely. Surface in the footer hotkeys. Full plan and open questions
in [./plans/CLI-734-yolo-mode-toggle.md](./plans/CLI-734-yolo-mode-toggle.md).

---

#### CLI-311 to CLI-316: the CLI UX backlog (was UX-04 … UX-09)

Carried from the old deferred backlog; each was sized S or M and none is blocked.

- **CLI-311 (UX-04)** Interactive skill search polish — manual testing plus tests for the interactive
  search component.
- **CLI-312 (UX-05)** Refine step, skills.sh integration — community skill alternatives in the Refine step.
- **CLI-313 (UX-06)** Search with colour highlighting — needs more UX thought before implementation.
- **CLI-314 (UX-07)** Incompatibility tooltips — show the reason when a disabled option is focused. Part
  of CLI-740's "surfacing" half.
- **CLI-315 (UX-08)** Keyboard shortcuts help overlay — in-wizard help for keybindings.
- **CLI-316 (UX-09)** Animations / transitions — polish pass for step transitions.

---

#### CLI-740 (was D-306): Deeper incompatibility rules

(was D-278; renumbered after an ID collision was found in the completed rows on 2026-04-21. The
completed D-278 row is the unrelated Sources-tab diff task.)

Vincent's ask (2026-08-01): "more in-depth incompatibility rules." Scope needs pinning with him — the
two plausible readings are already tracked elsewhere, so this item is the umbrella:

- **Coverage (data)** — `docs/web/editor-todo.md` §7: 123 of 222 skills state no relationships at all,
  invisible to the incompatibility rule; also asks the schema to distinguish "audited, no conflicts"
  from "not audited yet" (today both read as two empty arrays).
- **Surfacing (UX)** — CLI-314, incompatibility tooltips.
- **Adjacent**: CLI-738 (exclusive/global scope conflict), CLI-734 (YOLO mode disables constraints), CLI-725
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

#### CLI-732 (was D-179): Extract shared post-wizard pipeline into a ProjectLifecycle orchestrator

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

#### CLI-717 (was D-19): Improve template error messages

When template compilation fails, show which variables are missing and suggest which source files should
be created. [Plan](./plans/CLI-717-template-error-messages.md)

---

#### CLI-715 (was D-11): Development hooks for type checking

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

### Web ↔ CLI integration

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

#### CLI-842: One integration spec breaks the layer's rule, and three unit tests are misfiled as e2e

**Owner ruling, 2026-08-26.** _"If we were to refactor the way we did everything and the test were to
fail, that means it's an implementation test and we shouldn't do it like that. If the whole codebase
were refactored, but the functionality stayed the same and the test still passed, that's what we
wanted."_ **Scoped the same day, and the scope is what makes this row small:** the principle governs
INTEGRATION and END-TO-END tests. Unit tests of pure functions are wanted and unaffected — a pure
function's name and signature ARE its behaviour, so binding to them pins nothing. Both halves are
written into `.ai-docs/standards/e2e/test-structure.md`, which now leads with them.

The ruling replaced a "harness self-test" exemption written into that standard the same day by an
agent that never reported — a category invented to hold four files rather than derived from anything.

**Two unrelated fixes, and they should not be done as one change.**

**(a) One real violation.** `integration/fixture-configs-round-trip` sits in `integration/`, so it
claims a layer the principle governs, and it imports `generateConfigSource`, `loadProjectConfigFromDir`
and `matrix` by name while spawning nothing — `ProjectBuilder.dualScope()` writes fixture files
directly. **Its question is worth keeping**: it caught four fixtures filing a skill under a category
the catalogue contradicts (`web-testing` for a skill declared `web-e2e`), invisible because
`normalizeStackRecord` relocates the assignment on load, and one collision meant a spec asserted a
compiled sub-agent body no CLI-written configuration can produce. The behavioural route is to let the
CLI itself judge the fixture rather than to re-render it in-process.

**(b) Three misfiled unit tests.** `pages/retry-space`, `pages/list-row-toggle` and
`matchers/project-matchers` are unit tests of HARNESS code — a retry loop, a row reader, an assertion
matcher. Under the layer split their mechanism assertions are legitimate: the loop is the subject, so
`world.pressed === 2` binds to what is under test. They are wrong only in claiming to be e2e specs.
`retry-space` in particular documents that its race is **not reproducible on a real PTY**, so it could
never have been an e2e spec.

**Do not start by renaming files.** `vitest.config.ts`'s unit project reads `src/**` and `scripts/**`;
the e2e project reads `e2e/**/*.e2e.test.ts`. A spec renamed off that suffix while still under `e2e/`
is collected by NOTHING and vanishes silently — a worse failure than the misfiling. Decide the
destination first; a third vitest project, or a move out of `e2e/`, are both real changes with a
census to re-derive.

**One deliberate exception stands and is not in scope here.** `lifecycle/preview-matches-install`
imports the shared renderers on purpose and would redden on a behaviour-preserving refactor of them,
because "the editor's preview and the CLI's writers render from one source" is a product requirement
rather than an implementation detail. The standard records the bar for adding another.

**Also owed, and not started:** the ruling's third clause — **every feature must have end-to-end
coverage behind it**, and a feature with only unit tests has been shown to have working parts and
never shown to work. Nothing measures this today. Establishing the gap is its own census and probably
its own row.

---

#### CLI-843: The hand-run bundle is committed, stale, and gated by nothing

`packages/cli/scripts/handrun.mjs` bundles `e2e/handrun-journeys.ts` into
`e2e/helpers/handrun.gen.mjs`. The output is **committed and clean in git**, and nothing regenerates
or verifies it: no `handrun` entry exists in `package.json`'s scripts and no CI step names it. Every
other generated artefact in this package has a `:check` variant that byte-compares — this one has no
generator script at all, only a file someone runs by hand.

Measured 2026-08-26, and the drift is two refactors deep:

| Where                                        | `setupDualScopeWithEject` signature                        |
| -------------------------------------------- | ---------------------------------------------------------- |
| `e2e/fixtures/dual-scope-helpers.ts` (live)  | `(source: E2ESource, fakeHome, projectDir)` — 3 arguments  |
| `e2e/handrun-journeys.ts` (the bundle INPUT) | calls the 3-argument form                                  |
| `e2e/helpers/handrun.gen.mjs` (committed)    | **declares and calls the 4-argument** pre-`E2ESource` form |

**Why it is worth a row rather than a regeneration.** Regenerating fixes today's drift and leaves the
mechanism that produced it: a bundle whose staleness is invisible to `tsc`, `eslint`, prettier and
every suite, because it is generated output nothing reads during a test run. `check-spawn-doors.ts`
deliberately skips it — its docblock says judging a generated bundle "reports each of them twice, and
a STALE bundle would red for a defect no edit fixes". That reasoning is right for THAT check and is
also the reason nothing else looks.

Fix direction: give it the shape the other four generators already have — a `handrun` /
`handrun:check` script pair where `check` byte-compares in memory, and a CI step. The precedent is
`generate:compile:check`. Re-derive before starting: confirm the bundle is still committed and still
clean, since regenerating it by hand at any point closes the symptom and hides the row's subject.

**Found on the way past** by the lane closing the `setupDualScope` documentation drift; the bare
`setupDualScope` deletion reached this file, the argument refactor did not.

---

#### CLI-844: The emitted `config.ts` should lead with its `export default`

**Owner request, 2026-08-26** — long-standing, never got around to. The emitted file should read
export-first, so the thing a reader wants is not below the data that feeds it.

**Reordering alone CANNOT do it, and this is measured rather than argued.** `export default <expr>`
evaluates its expression during module evaluation, so `const` declarations below it are in the
temporal dead zone. The config is genuinely executed — `lib/configuration/config-loader.ts` loads it
through `jiti` — so the failure is real rather than theoretical:

```
$ cat > tdz.mjs <<'EOF'
export default { name: 'agents-inc', agents, skills }
const skills = [{ id: 'web-framework-react' }]
const agents = [{ name: 'web-developer' }]
EOF
$ node -e "import('./tdz.mjs').then(...).catch(e => console.log(e.constructor.name, e.message))"
ReferenceError: Cannot access 'agents' before initialization
```

**Do not reach for `var` to dodge this.** `var` hoists as `undefined` rather than throwing, so the
export would load and carry `undefined` arrays — a silent wrong answer where the `const` gives a loud
one. That is a worse outcome than the current order.

**Inlining reaches the goal and pays for itself.** Putting the arrays directly inside the exported
object literal puts the export at the top, loads correctly (verified the same way), and **collapses
the import block to a single name**: the six-name `import type { Domain, ProjectConfig,
ProjectAgentName, AgentScopeConfig, SkillConfig, StackAgentConfig }` exists ONLY because the extracted
consts need annotations. Inline them and `satisfies ProjectConfig` type-checks the whole literal on
its own.

**What has to be established before doing it**, none of which is settled here:

- **Three writer variants, not one.** `generateStandaloneConfig`, `generateProjectConfigWithGlobalImport`
  and `generateProjectConfigWithInlinedGlobal` in `packages/compile/src/config-source.ts` all emit this
  file, and the project variants INLINE a global config — check what "inline the arrays" means for a
  file that is already inlining another config's entries before assuming the shapes converge.
- **Whether anything reads the named consts.** Census: `grep -rn "config-types" packages/cli/src apps/editor/src`
  and check whether the emitted `config-types.ts` declares names only the extracted consts consume.
- **Diff quality.** The consts give one line per skill; confirm inlining keeps that rather than
  producing one long literal, since a config's git diff is a thing users read.

**Sequencing:** this is the same emitter as the formatting work the owner ruled the same day, and both
rewrite every `expected` byte in `packages/compile/src/contract/emission-scenarios.ts`. Doing them as
one change is cheaper than doing them twice; doing them as one change also makes the fixed-point test
and the reordering indistinguishable in review, which is the argument for two. **Prefer second, after
formatting lands and is green** — the fixed-point test is then already in place to judge the reorder.

---

#### CLI-845: What the formatting ruling left unpinned, and three helpers that now parse by convention

Follow-ups from the 2026-08-26 emission-format ruling, all reported by the lanes that did the work
rather than found afterwards. None is a regression; every gate is green. Re-derive each before acting.

**(a) Four emitted shapes are fixed points only because someone checked by hand.** The seven scenarios
in `packages/compile/src/contract/emission-scenarios.ts` do not reach them: the sectioned
`// Custom` / `// Marketplace` union, the stacked plain union, the stacked type argument, and
`generateProjectConfigWithGlobalImport`. The last cannot have a scenario — its import specifier is a
`path.relative()` against the visitor's `$HOME`, so the bytes are machine-specific — and the sectioned
case needs a custom skill the catalogue does not declare, which the contract file's own docblock rules
out. **This is an owner decision rather than obvious work**: either the contract gains a way to express
a seat the built-in catalogue cannot provide, or these four stay verified-once and the fact is written
down where the next reader meets it.

**(b) Three test helpers read the emitted config by string convention, and all three broke silently
when the format moved.** They were repaired, but the coupling is unchanged and the next format change
will break them the same way. `helpers/config-source-sections.ts` keyed section ends on `];` / `};`,
which `semi: false` deleted; `helpers/compacted-stack.ts` ran `JSON.parse` on a stack literal that had
stopped being JSON; `helpers/generated-types.ts` matched double-quoted literals only — **that one would
have returned `[]` for every union and passed vacuously**, which is the failure worth fixing properly
rather than re-keying. The honest fix is a parser or an exported reader, not a better regex.

**(c) Two stale claims in files the doc lane did not own.**
`src/cli/lib/configuration/__tests__/config-round-trip.test.ts` carries a comment saying
"`renderEntryLine` is `JSON.stringify(entry)`" — both halves false now; the only `renderEntryLine` left
is module-private in `packages/compile/src/installed-format.ts` and does not stringify. And the
`hyphenated-keys` scenario's `title` says "quotes every emitted object key", which its own `why` field
contradicts and its own `expected` bytes refute — **a title is what a test run prints**, so it is the
visible half of the staleness.

**(d) Two places still carrying the old shape, neither breaking anything.**
`packages/cli/e2e/fixtures/project-builder.ts` hand-writes fixture configs in the pre-ruling shape —
they still LOAD, so nothing is red, but they no longer resemble what the CLI writes, which is the
divergence `e2e/helpers/test-utils.ts` already warns about and the subject of the round-trip spec in
CLI-842. And `packages/cli/.claude-src/config.ts` is this repository's own install, still old-shape and
prettier-ignored; harmless until someone re-runs the CLI here.

**No gate exists for the documentation half and one should not be invented.** The doc lane's verdict,
recorded because it is the useful part: a scanner extracting fenced code blocks would need a marker
convention nobody has, would check format rather than whether the sample is what that config would
actually emit, and — since the accurate blocks now sit behind `<!-- prettier-ignore -->` — would have to
look exactly where every formatter has been told not to. What was done instead is the cheap honest
half: each corrected document now names `emission-scenarios.ts` as the one place the bytes are written
down.

---

#### CLI-726 (was D-111): Stable test identifiers for active-state detection

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

#### CLI-723 (was D-64): Create a CLI E2E testing skill + update `cli-framework-oclif-ink`

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

#### CLI-322 (was R-06): Slim down `ResolvedSkill`

Separate resolved relationship data from skill identity.

---

#### CLI-728 (was D-153): Standardize operation result types

Consistent list / single-action return patterns across the operations layer.

---

### Telemetry

#### CLI-731 (was D-170): Add PostHog anonymous telemetry

Skill installs, wizard funnel, command errors, platform.

---

#### CLI-725 (was D-90): Add Sentry tracking for unresolved matrix references

In `src/cli/lib/matrix/matrix-resolver.ts`, `getDiscourageReason()` and `validateSelection()` use
`findSkill(id)` with a fallback to the raw ID when a skill referenced in `requires`, `conflictsWith` or
`providesSetupFor` does not exist in the matrix. This is intentionally graceful — crashing the wizard on
bad matrix data is worse than degraded labels. But we need visibility into how often it happens.

Add Sentry `captureMessage` (or `captureException`) on every fallback path, including the referencing
skill ID, the missing referenced ID, and the relationship type in the Sentry context.

---

### Docs, agents & skills

#### CLI-733 (was D-180): Write a "Bring your own skills" guide

Test the custom source path end-to-end, document the `metadata.yaml` schema, `--source` flag usage and
multi-source setup, and add a guide link to the README.

---

#### CLI-729 (was D-162): Skill Olympics — benchmark and optimize the expressive-typescript skill

Competitive arena: 100 contestants catalogued, 10 selected for proof of concept × 5 test cases drawn from
codebase anti-patterns. Score on a 10-axis rubric, Frankenstein the winners, then chain skills (run A→B
to test post-processing combinations). Phases 1-4 done (harvest, test case extraction, constraints,
contestant prompts). Next: the arena runs.

**Plan:** `todo/plans/CLI-729-skill-olympics/plan.md` · **Catalog:** `test-catalog.md` beside it.

Paths rather than links, deliberately: **the whole directory is gitignored and exists only on the
maintainer's machine**, so a fresh clone will not have it and neither will anyone reading this on
GitHub. It holds 879 files — `contestants/` is third-party skill text copied verbatim from other
authors, and `arena/` and `test-cases/` are the outputs those skills produced, the artefacts the
rubric scores. The root `.prettierignore` names those same three subdirectories, so reformatting
cannot rewrite the evidence being measured either. Nothing here is missing or rotted.

---

#### CLI-722 (was D-62): Review default stacks — include meta/methodology/reviewing skills

Go through all default stacks and ensure they include the shared meta skills (methodology, reviewing,
research) that should be part of every reasonable setup. Currently stacks only include domain-specific
skills and miss the cross-cutting concerns.

**Skills to consider adding:** `meta-methodology-*` (investigation-requirements,
anti-over-engineering, success-criteria, write-verification, improvement-protocol, context-management);
`meta-reviewing-*` (reviewing, cli-reviewing); `meta-research-*` (research-methodology);
`security-auth-security` where auth skills are selected.

**Key files:** the stack definitions in the skills source that feed the wizard's stack selection step.

---

#### CLI-720 (was D-41): Create the `agents-inc` configuration skill

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

Full plan: [./plans/CLI-720-config-sub-agent.md](./plans/CLI-720-config-sub-agent.md)

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

#### CLI-383: No stack assigns any ai-domain agent

Observed during the roster wiring: `ai-developer` and `ai-reviewer` appear in zero stacks — even
`nextjs-ai-saas` routes its AI skills through `api-developer`/`api-researcher` — and the three new
ai agents inherited that emptiness. Selecting the AI domain therefore preselects five agents that
no stack seeds with skills. Needs owner curation (which stacks, which of the 20+ `ai-*` marketplace
skills, per role). Related: CLI-722 (meta skills in stacks), CLI-739 (stack pruning).

---

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

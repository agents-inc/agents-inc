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

| ID                                                                                      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status           | Type     | Complexity |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------- | ---------- |
| CLI-920                                                                                 | (journey run, parked with Codex) `uninstall` without `--provider`, in a folder holding a Claude and a Codex install, still stops and asks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Deferred         | fix      | small      |
| CLI-970 | (journey run 2026-10-01 D1, parked with Codex; never filed until CLI-969's tester found it 2026-10-24) `list` says `Agents: 0` and no agents folder for a Codex installation whose `.codex/agents/` holds the sub-agents; the same payload on Claude says `Agents: 18`. `todo/plans/2026-10-01-manual-journey-run/codex.md`, D1. | Parked | bug | small |
| CLI-914                                                                                 | (audit 97) With CLAUDE_CONFIG_DIR set, a global install still writes sub-agents and skills to `~/.claude/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Deferred         | fix      | medium     |
| CLI-998 (new, 2026-10-30, CLI-911-912 developer) | `edit --from` says nothing when a payload's skill id names no marketplace and the installation uses a custom one: `sayWhenItNamesAnotherMarketplace` (`commands/edit.tsx`) treats an id naming no marketplace as naming nothing, while the payload contract says it names `github:agents-inc/skills`. Which marketplace `edit` uses is not in dispute, only whether the user is told. Source: `r44/resume-1029/CLI-911-912/role-reports.md` (session r44), "Known gaps" item 2. Reproduced 2026-10-30 (`r44/resume-1029/cli/CLI-998-999/researcher/`, session r44): a link with no `marketplace` field applied under a custom marketplace prints only "Skipped 1 skill(s) this catalog does not know"; the payload contract (`packages/matrix/src/seed.ts`) reads a missing field as the public catalogue. Owner 2026-10-30, card q-cli-916-no-marketplace-line: "Say it here too" (every public-catalogue id applied to a private-marketplace installation prints the same one line, naming the public catalogue). Built inside CLI-1005, which makes the line print by construction (the researcher's test 5). | Deferred — under CLI-1006, after everything else (owner 2026-10-30: bugs from mixing marketplaces are not fixed before it) | bug | small |
| CLI-1005 (new, 2026-10-30, CLI-916-917 researcher) | (owner 2026-10-30 on card q-cli-916: "how can it name no marketplace? this is a category of bug that shouldn't be possible") A shared link may leave its marketplace out, and each reader resolves that differently: `init --from` tries `CC_MARKETPLACE` first, `edit --from` ignores it, the editor reads it as the public catalogue. Real bug: in a project under a global from a custom marketplace, `share` writes a link naming no marketplace that carries only that marketplace's skills; installing it gives the sub-agents and none of the skills (exit 0, one "Skipped" warning). Fix: `marketplace` required and non-blank in `seedPayloadSchema` (`packages/matrix/src/seed.ts`, `SEED_VERSION` bumped), every writer names one (the public catalogue as `github:agents-inc/skills`), an older link refused with a message to share it again instead of the store's HTTP 500. Carries CLI-998. Files, tests and payload grep: the researcher's hand-off, `r44/resume-1029/cli/CLI-916-917/` (session r44). | Deferred — under CLI-1006, after everything else (owner 2026-10-30: bugs from mixing marketplaces are not fixed before it); card q-cli-cc-marketplace-redirect closed with it | bug | medium |
| CLI-1006 (new, 2026-10-30, owner) | (owner 2026-10-30, "we will not do this now") Until it runs, bugs from mixing marketplaces, logged or newly found (skills dropped or skipped among them), are filed under this row and not fixed, since this overhaul replaces that code; CLI-997's fix was already in the tree when this was ruled and lands; CLI-995 is not something this overhaul fixes (sweep) and continues. The bugs it fixes, the rulings it would undo and what is not yet looked at: `plans/CLI-1006-several-marketplaces.md`. Several marketplaces in one configuration. Every skill, plugin or ejected, keeps a record of the marketplace it came from. `edit` sends every skill where it runs, with each skill's marketplace: from a project, the project's and the global install's skills, from however many marketplaces; from the home folder, only the global install's, as today. The editor loads every marketplace named, shows which marketplace each skill comes from, and highlights a skill offered by more than one. Two marketplaces can ship a skill or a stack under the same name: the editor has the user pick which marketplace's one to install. Covers CLI-999 (closed 2026-10-30 on the owner's "treated as an ejected skill" note; the project records a global ejected skill as `origin: 'eject'` where a plugin records `origin: 'acme'`, so only the plugin keeps its marketplace) and replaces CLI-1005's one-marketplace-per-link design. Measured 2026-10-30 (`q-edit-ui` in the r44 session scratchpad): bare `edit` sends one payload naming no marketplace that carries a private skill beside public ones; the editor seats one catalogue (`seatCatalog`) and drops the private skill (`fromSeedPayload`). | Deferred — after everything else (owner 2026-10-30: "it will be done after everything else") | feature | large |
| CLI-1015 (new, 2026-10-31, CLI-1001 developer) | The "Copied N skills" line `init --from` prints (and `edit --from`'s "Copied N local skills") also counts the skills the configuration carried, which get their own "Wrote N skill(s) this configuration carries" line: React plus one carried skill prints "Copied 2 skills to <project>/.claude/skills/". Since CLI-1001 a refused save counts the two apart, so "copied" means two things in two lines; every line is still true. Cause: `copyLocalSkills` lists a carried skill among its copies. Repro: `r44/resume-1029/cli/CLI-1001/quick-fix/handrun-scripts/handrun.mjs` (session r44); finding `2026-10-31-a-copy-result-lists-carried-skills-recorded-in-place-so-a-count-of-copies-counts-them`. | Waiting on owner — card q-cli-1015-copied-line-counts-carried | fix | easy |
| CLI-1016 (new, 2026-10-31, CLI-1008 reviewer) | Since CLI-1008, `init --from` and `edit --from` on Codex exit 1 when everything landed but a plugin the user had switched off is left on (the owner's "Same as update"). The docs give 1 to "it refused or aborted; nothing landed, and the run can be repeated" and 5 to "the run landed and part of it did not"; a repeat is refused ("An installation already exists … Run 'npx agents-inc uninstall' first"). `update` has no 5, and its exit 1 since CLI-1002 already contradicts that line. Docs: `apps/www/src/content/docs/docs/recipes/compile-in-ci.md` exit-code table, `troubleshooting/index.md`. Code if 5: `requireMarketplaceOrExit` / `exitIfWorkIncomplete` in `base-command.ts`. Repro: `r44/resume-1029/cli/CLI-1008/reviewer/scripts/hand-run-rerun.sh single` (session r44). | Waiting on owner — card q-cli-1016-exit-code | fix | easy |
| CLI-1018 (new, 2026-10-31, CLI-1014, CLI-1017 and CLI-FOLLOWUPS-4 reviews) | Leftovers of the temp-folder work: (a) CLI-1017's new e2e helper `compactedWithoutTempFolder` has no test any suite runs; move it beside `compactCliOutput` in `src/cli/lib/__tests__/helpers/flatten-cli-output.ts` with its cases (exact change in `r44/resume-1029/cli/next-13-results.md`, session r44); (b) CI's e2e-cli job has no symlinked temp folder (needs `--env-mode=loose` or a `passThroughEnv` entry, as REPO-54 found); (c) the two temp-folder findings' frontmatter and INDEX lines disagree with their fixes (CLI-1014's `resolved_by` says four specs, three were; CLI-1017's proposed standard forbids what its two Codex specs now rightly do). | Ready for Dev — paused (owner, 31 Oct 12:41: nothing new starts) | chore | low |
| CLI-835                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **`expectPhaseSuccess` and `expectDualScopeInstallation` can narrow their AGENT fields today, and it type-checks clean.** Proved 2026-08-25 while establishing why the matcher signatures could NOT narrow (CLI-830): narrowing only `agents` / `compiledAgents` to `readonly AgentName[]` passes both TypeScript projects with zero errors. **Their `skillIds` fields cannot** — those hit the same fixture-marketplace namespacing wall that refuted CLI-827, because `e2eSkillId` produces ids the `SkillId` union deliberately cannot contain. So this row is the agent half only, and splitting it that way is the point: the two fields of one helper have different answers. This belongs to the census the assertion-helper rule in `packages/cli/CLAUDE.md` already carries ("NEVER let a shared assertion helper's signature overstate what it checks", which names both helpers), not to the matcher signatures — it was reported rather than folded in to keep CLI-830 a clean refusal. Re-derive before acting; measure BOTH projects: `npx tsc --noEmit && npx tsc -p e2e/tsconfig.json --noEmit`. Census: `grep -rn 'expectPhaseSuccess\ |expectDualScopeInstallation' packages/cli/e2e packages/cli/src --include='*.ts'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Parked | refactor | easy       |
| CLI-836                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **`agent-partials.test.ts`'s assertion message claims twice what its assertion checks.** The message reads _"`${requires}` belongs in `${file}` and in no sibling partial"_, while the assertion behind it is `toStrictEqual([])` over the copies **missing** the tag — a presence check only. Nothing verifies the "and in no sibling" half, so the no-duplication contract that message advertises **is editorial, not enforced** — established 2026-08-25 when a brief asserted it as a gate and it turned out not to be one. This is `packages/cli/CLAUDE.md`'s own rule ("NEVER let a shared assertion helper's signature overstate what it checks") arriving at an assertion MESSAGE rather than a helper signature, and the same reasoning applies: nobody opens the assertion, so the message is what every reader believes. Two honest fixes — drop the "and in no sibling" half, or add the assertion behind it. **Prefer dropping it unless the duplication check is genuinely wanted**, since inventing a cross-partial content check to justify a message is the tail wagging the dog. Census: `grep -n 'belongs in' packages/cli/src/cli/lib/__tests__/agent-partials.test.ts` | Parked | test     | easy       |
| CLI-839                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **Four playbooks still instruct the session-file protocol that was cut from the shared partial.** `context-management.liquid` stopped teaching `progress.md` / `decisions.md` / `insights.md` on 2026-08-25, but `developer/api-developer/playbook.md`, `developer/cli-developer/playbook.md`, `developer/web-developer/playbook.md` and `planning/pm/playbook.md` carry their own copies, and **three survive into a compiled agent** — so the trim is partial until they go. Worth reading `meta/agent-summoner/playbook.md` and `meta/skill-summoner/playbook.md` first: both already carry the BETTER shape — _"If session is interrupted, state what was completed / Note next steps clearly"_, i.e. reporting rather than file-writing — which is corroborating evidence that the five-file scheme was the outlier rather than the convention. Match those two rather than inventing a third form. Census: `grep -rn 'progress\.md\ |decisions\.md\|insights\.md' packages/cli/src/agents/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Parked | refactor | easy       |
| CLI-834                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **`generateMatrix` no longer generates a matrix.** CLI-826 deleted its `testMatrix` return member, so it now returns only the two disk config shapes (`diskCategories`, `diskRules`) — the name states something the function stopped doing, which is the same defect class CLI-833 covers in comments. It is unexported with exactly one call site in `src/cli/lib/__tests__/fixtures/create-test-source.ts`, so the rename is two lines and entirely local. Reported rather than taken by the agent that created the condition, because it fell outside that row's enumerated scope. Census: `grep -rn 'generateMatrix' packages/cli/src packages/cli/e2e packages/cli/scripts` | Parked | refactor | easy       |
| CLI-840                                                                                 | **The instruction token budget — measured, with two proposals and a sequencing argument.** Standing cost is ~13,150 tokens before any work (root `CLAUDE.md` ~2,180 + `packages/cli/CLAUDE.md` ~10,970, the latter carrying 82 NEVER/ALWAYS rules at up to 248 words each), plus ~10,750–19,980 per sub-agent dispatch. **In a compiled `cli-developer` the `<role>` block is 4% of the agent**; the rest is scaffolding every sibling shares. **The premise that rules get skipped because too much is loaded is NOT supported by the corpus** — `rule-not-visible` is 7 of 167 findings (4%) against enforcement-gap at 39% — though that field is self-assigned and biased in exactly that direction, so treat 4% as a floor. Two ideas assessed: a mechanical compression pass (argued **against** — it targets the 4%, pushes against the 23% `rule-not-specific-enough` cluster, and would have shortened the narrowest-union rule the day before it was found wrong; the defensible version is **deduplication**, moving incident narrative to the `archive.md`/finding that already holds it while keeping the imperative and census verbatim), and an end-of-lifecycle **repeater skill** (argued **for**, with three changes: fresh context rather than self-check, a mechanical stop condition rather than "nothing missed", and build the rules-only variant first). **Sequencing is the strongest recommendation: build the repeater first, because it reports which rules actually fire and that is the evidence that makes any cut informed rather than blind.** Nothing here is ruled on. [Plan](./plans/CLI-840-instruction-token-budget-2026-08-25.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Not Started      | refactor | large      |
| CLI-841                                                                                 | **Parked** (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **`generateBlankGlobalConfigSource()` disagrees with the canonical writer about FIELD ORDER — `skills` before `agents`.** Narrowed 2026-08-26: the quoting and trailing-comma halves closed when the emitter was formatted; two swapped lines remain |
| CLI-842                                                                                 | **Parked** (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **One integration spec breaks the refactor-survival rule; three unit tests are misfiled as e2e.** Owner ruling 2026-08-26, scoped to integration/e2e — see `.ai-docs/standards/e2e/test-structure.md` |
| CLI-844                                                                                 | **Parked** (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **Put `export default` at the TOP of the emitted `config.ts`.** Owner request, long-standing. Cannot be done by reordering — TDZ — but inlining reaches it and shrinks the import to one name |
| CLI-831                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **Nothing gates the CONTENT of any methodology partial, and that prose ships to every user.** `src/agents/_templates/methodologies/*.liquid` renders into every sub-agent the CLI compiles, so a partial silently emptied or half-edited reaches every install — and it is invisible to `tsc`, to ESLint and to `strictVariables: false`, which is stated in `agent-template-renders-its-partials.test.ts`'s own docblock. **The gap is precisely bounded:** `agent-partials.test.ts` covers only the per-agent `.md` partials (`identity.md`, `critical-requirements.md`, `critical-reminders.md`) — verified 2026-08-25 while a methodology partial was edited — and `agent-template-renders-its-partials.test.ts` covers the ROSTER of files and their render order, never their text. **Do not copy `PARTIAL_CONTRACTS`' shape**: its `everyCopyOf` globs `*/*/<file>` with no `ignore`, so it reaches into `_templates/` and would yield a phantom agent named `methodologies` that `agentNamesOnDisk()` (which does ignore `_templates/**`) never returns. Proposed shape, from the agent that hit this: a separate `it` in `agent-template-renders-its-partials.test.ts`, which already owns `METHODOLOGIES_DIR` and the rendered roster, asserting a per-partial required marker keyed off `RENDERED_METHODOLOGY_PARTIALS`. **A marker-per-partial roster is a design decision, not an accommodation** — decide the shape before writing it. Census: `grep -rn 'RENDERED_METHODOLOGY_PARTIALS\ |METHODOLOGIES_DIR' packages/cli/src --include='*.ts'` **The cheapest useful version, run by hand on 2026-08-25 and worth keeping as the first cut:** assert on a COMPILED agent that each expected `<wrapper>` appears exactly once and that no `{%` or `{{` survives rendering. That catches wrapper duplication and Liquid syntax errors — not prose quality, but those are the two failures that would ship a visibly broken agent. Note `agent.liquid` supplies a `<methodologies>` group wrapper around the set while each partial owns its own inner tag, so the assertion counts both levels.                                                                                                                                                                                                                                                                                                                                | Parked | test     | medium     |
| CLI-821                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **Five `UI_SYMBOLS` members have no reader anywhere in `src` or `e2e`** — `DISABLED`, `SCROLL_UP`, `SCROLL_DOWN`, `CURRENT`, `UNSELECTED`. Found 2026-08-24 while landing CLI-329, which deleted the two the row NAMED (`CHECKBOX_CHECKED`, `CHECKBOX_UNCHECKED`) on the same evidence and stopped there rather than widening its own scope. Each is exported and each looks live: `SCROLL_UP`/`SCROLL_DOWN` read as the scroll-overflow affordance, which the product actually paints as TEXT through `STEP_TEXT.SCROLL_MORE_ABOVE`/`_BELOW`. `DISABLED` is a second name for the same en-dash as `SKIPPED`, so deleting it needs a look at whether the two states were meant to diverge. Re-derive before deleting — the census is one command: `for m in DISABLED SCROLL_UP SCROLL_DOWN CURRENT UNSELECTED; do grep -rc "UI_SYMBOLS.$m" src e2e --include='*.ts' --include='*.tsx'; done`. Two documents enumerate the symbol exhaustively (`reference/utilities.md`, `reference/component-patterns.md`) and `check-enumeration-drift` reds on both if they are not updated with it | Parked | refactor | easy       |
| CLI-541                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **`TEMPLATE.md` defines a lifecycle-field pairing rule and nothing enforces it.** `check-findings-frontmatter.ts` only proves the YAML _parses_; it never checks that `status: resolved` carries a `resolved_by:` or that `status: partial` carries a `partial_note:`. Four instances found in one read-only sweep (2026-08-18): two `resolved` with no `resolved_by`, one `open` sitting beside a `resolved_by`, and one more `resolved` unpaired. The check is cheap — the parse already yields the object — and it belongs beside the existing one rather than in a new script. **Do NOT enforce it by rewriting the offending files first**: the pairing failures are evidence about how findings get closed, so land the check, let it go red, and fix the four deliberately | Parked | feature  | easy       |
| CLI-554                                                                                 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") **Three genuinely new capabilities**, detailed in [`plans/parked-features-2026-08-19.md`](./plans/parked-features-2026-08-19.md). (1) The seed contract cannot carry half of what a config holds — `model: "inherit"` has no spelling and `agentsSource` has no field; closing either means new schema fields and a `SEED_VERSION` bump the editor and the worker share. (2) The wizard save path discards the whole `GateReport`, so a project skipped during an init/edit fan-out is invisible — surfacing it is a new signal, and auto-deregistering is a new capability. (3) `registerProjectPath`'s sweep is silent; every remedy its finding offers is a new user-visible signal. A fourth item is recorded there and gated by its own author on "if anyone acts on this". **This row was 51 items until the owner ruled that a guard is not a feature** — the other 48 went back into the fixes round | Parked | feature  | medium     |
| CLI-635                                                                                 | **PARKED by owner 2026-08-22 — recorded with the option, not dropped.** The universal resolver over every backticked identifier was refuted by measurement: 2707 names, 2634 resolve, and it **misses the founding defect** (three of CLI-610's five symbols DO resolve, as file-local non-exported consts in a sibling workspace) while its only two hits on that class are FALSE POSITIVES — the sentence saying those symbols do not exist. 45 of 88 pairs are absence-prose. The real predicate is existence **at the named location**. **The option to build when this is unparked:** a subset verdict on `check-enumeration-drift.ts` — `table-pairs` over a symbol column and a file column, reporting `namedButAbsent` ONLY and never `presentButUnnamed`, because these inventory tables are deliberately partial where every existing reader binds exhaustively both ways. Immune to both failure families by construction; population already shaped at **67 tables, 518 rows**. **Its limit, stated rather than sold:** it reads tables, so it would have caught one of CLI-610's three instances and neither of the two that were prose. Related and now permitted: CLI-629's compiler-API walk, ruled yes the same day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Deferred         | chore    | medium     |
| CLI-697                                                                                 | **Two `architecture` documents, one a 19-line stub, both carrying identical frontmatter.** `.ai-docs/reference/architecture-overview.md` (531 lines) and `.ai-docs/reference/architecture/overview.md` (19 lines) both declare `scope: reference` / `area: architecture`, and both were modified on 2026-08-22. Either a split in progress or an unfinished move — **establish which before touching either**, because a reader arriving at the stub has no way to know the 531-line document exists. If it is an abandoned move, delete the stub; if a split, the stub needs to say what it owns and point at the other.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Investigate      | docs     | trivial    |

## Wizard & CLI UX

| ID      | Task                                                                                                                                                                                                                   | Status           | Type     | Complexity |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| CLI-739 | (was D-280) Prune built-in stacks — DEFERRED (owner 2026-08-07: will decide later; simpler now that stacks carry no preload flags).                                                                                    | Deferred         | refactor | easy       |

## Matrix, config & scope

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status      | Type     | Complexity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ---------- |
| CLI-906 | `config.ts` records several marketplaces: `marketplace` becomes an array of `{ name, url }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Deferred    | feature  | complex    |
| CLI-740 | (owner 2026-10-26, card q-gap-skill-rules: "Leave this as is for now and don't queue it") (was D-306) Deeper incompatibility rules — richer semantics beyond conflicts/requires; scope TBD with Vincent. | Parked | feature  | complex    |
| CLI-727 | (was D-118) Rename project/global scope to project/user — DEFERRED to the very end with CLI-425 (owner 2026-08-07: easy, but last, after everything is committed). **REAFFIRMED 2026-08-17 (owner): still deferred to the very end, and MAY NEVER BE IMPLEMENTED AT ALL.** Not "deferred until convenient" — an open question about whether the rename is worth doing, to be answered after everything else is committed. Do not schedule it, do not fold it into an adjacent pass, and do not treat a file it would touch as blocked on it. | Deferred    | refactor | complex    |
| CLI-324 | (was expressive-ts decision 2) Config-load leniency vs what `ProjectConfig` promises about agents and domains.                                                                                                                                                                                                                                                                                                                                                                                                                               | Investigate | refactor | complex    |

## Commands & lifecycle

| ID      | Task                                                                                                | Status                  | Type     | Complexity |
| ------- | --------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ---------- |
| CLI-904 | Custom marketplaces beyond today's rules: stacks naming outside skills, ids without the prefix.     | Deferred                | feature  | complex    |
| CLI-719 | (was D-26) Marketplace-specific uninstall. [Plan](./plans/CLI-719-marketplace-uninstall.md)         | Ready for Dev           | feature  | complex    |
| CLI-718 | (was D-25) Auto-version check + source staleness. [Plan](./plans/CLI-718-auto-version-check.md)     | Ready for Dev           | feature  | complex    |
| CLI-716 | (was D-13) Eject skills by domain/category. [Plan](./plans/CLI-716-eject-skills-filtered.md)        | Refined                 | feature  | complex    |
| CLI-721 | (owner 2026-10-26, card q-gap-deferred-rows: "Keep the six deferred, retire the three") (was D-47) Eject standalone compile function. [Plan](./plans/CLI-721-eject-compile-function.md) | Deferred | refactor | complex    |
| CLI-717 | (owner 2026-10-26, card q-gap-deferred-rows: "Keep the six deferred, retire the three") (was D-19) Improve template error messages. [Plan](./plans/CLI-717-template-error-messages.md) | Deferred | feature  | complex    |
| CLI-320 | (was P4-17) `agents-inc new` supports multiple items. [Plan](./plans/P4-17-new-multiple-items.md)   | Refined                 | feature  | complex    |

## Web ↔ CLI integration

| ID      | Task                                                                                                                                                                                                                                               | Status        | Type    | Complexity |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- | ---------- |
| CLI-905 | `init --ui --marketplace Y` opens the editor on marketplace Y; for now the pair refuses.                                                                                                                                                           | Deferred      | feature | medium     |
| CLI-903 | A share names one marketplace, so a setup drawn from two installs only half of it elsewhere.                                                                                                                                                       | Deferred      | feature | complex    |
| CLI-388 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") Machine-readable product data: `search --json` / `catalog --json` — now also the stacks and the preload mapping, so stack-detect's intent mode and load deference can read them (SKILLS-10 found no run-time route exists). | Parked | feature | complex    |
| CLI-405 | Derive `requires`/`needsAny` from framework-support surfaces — CONDITIONAL derivation only (B11 proved the mechanical rule breaks on setup-env: adapters of a self-sufficient neutral core must not derive a fence). Blocked on SKILLS-01 phase 2. | Ready for Dev | feature | complex    |

## Testing & E2E coverage

| ID      | Task                                                                        | Status        | Type     | Complexity |
| ------- | --------------------------------------------------------------------------- | ------------- | -------- | ---------- |
| CLI-723 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (was D-64) Create CLI E2E testing skill + update `cli-framework-oclif-ink`. | Parked | feature  | complex    |

## Tooling, gates & code generation

| ID      | Task                                                                                     | Status           | Type  | Complexity |
| ------- | ---------------------------------------------------------------------------------------- | ---------------- | ----- | ---------- |
| CLI-891 | Codex hand-check: owner confirms the Codex setup against a real subscription.            | Needs Assistance | chore | small      |
| CLI-894 | Run the 44 Claude-binary-gated specs on Codex too; skip only when neither host is there. | Parked           | chore | complex    |

## Types & code quality

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status                  | Type     | Complexity |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- | ---------- |
| CLI-890 | Owner's full review of the uncommitted tree — written by generic agents, not the registered roles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Needs Assistance        | refactor | complex    |
| CLI-728 | (owner 2026-10-26, card q-gap-deferred-rows: "Keep the six deferred, retire the three") (was D-153) Standardize operation result types — consistent list/single-action return patterns. | Deferred | refactor | complex    |
| CLI-322 | (owner 2026-10-26, card q-gap-deferred-rows: "Keep the six deferred, retire the three") (was R-06) Slim down `ResolvedSkill` — separate resolved relationship data from skill identity. | Deferred | refactor | complex    |

## Telemetry

| ID      | Task                                                             | Status        | Type    | Complexity |
| ------- | ---------------------------------------------------------------- | ------------- | ------- | ---------- |
| CLI-731 | (was D-170) Add PostHog anonymous telemetry.                     | Investigate   | feature | complex    |
| CLI-725 | (was D-90) Add Sentry tracking for unresolved matrix references. | Ready for Dev | feature | complex    |

## Docs, agents & skills

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status           | Type     | Complexity |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------- | ---------- |
| CLI-872 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (new, 2026-09-03) **Every skill states a real trigger sentence and neither surface that needs one reads it.** `usageGuidance` is required by `metadata.schema.json` and all 238 marketplace skills carry a specific one (`meta-design-expressive-typescript`: "Use when writing or refactoring TypeScript functions, data transformations, store actions, or any code that mixes logic levels"). Two consumers throw it away. **(a)** `resolveAgentConfigToSkills` in `src/cli/lib/stacks/stacks-loader.ts` sets `usage: \`when working with ${category}\`` — derived from the category rather than read from the field — so every compiled agent's `<skill_activation_protocol>` says "Use when: when working with meta-design" where the skill said something specific. This is the inverse of the standing rule against deriving stated metadata from an id or path, and it is verifiable by eye: `node bin/run.js compile` from `packages/cli`, then read the tail of `~/.claude/agents/skill-summoner.md`. **(b)** The emitted `SKILL.md` frontmatter `description` — the only text loaded at startup and the sole basis on which a skill fires — carries `cliDescription`-grade text with no conditions; 95 of 238 `SKILL.md` files mention a "when" anywhere in the file, against 238 of 238 `metadata.yaml`. Fix (a) here; (b) needs scoping first, since the `SKILL.md` files live in `agents-inc/skills`. Census: `grep -lie "use when\ |when you\|when building" $M/*/SKILL.md \| wc -l`against`ls $M/*/SKILL.md \| wc -l`, where `$M`is that repository's`src/skills`. Raised by the owner's Claude-5 context-engineering brief, 2026-09-03 — the one item in it not already at HEAD, though its diagnosis (that the interpolation "never worked") is wrong: it works and is fed a placeholder.                                                                                                                                                                                                                                                                                                                                                                                 | Parked | bug      | medium     |
| CLI-873 | (new, 2026-09-03) **Add "enumerate before committing" to `prompt-bible.md` §1.** Where several implementations compile but only one is idiomatic, an agent should name two or three shapes a developer familiar with the codebase would consider, pick one, and say why. Targets the search failure where the model writes the first working shape rather than the right one. Nothing in the doctrine states it today — `grep -rn "enumerate" packages/cli/.ai-docs/standards/` is the check. Raised by the owner's Claude-5 context-engineering brief, 2026-09-03. [Plan](./plans/summoner-context-engineering-2026-09-03.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Ready for Dev    | refactor | easy       |
| CLI-879 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (new, 2026-09-03) **The poison guard checks named-to-planted and never planted-to-named, and has no nested analogue at all.** `packages/compile/src/agent-source.test.ts` holds `POISONED_AGENT` as `Required<AgentConfig>` and pins its string-valued TOP-LEVEL keys against `POISONED_AGENT_KEYS`, so a new top-level field carrying author text reddens. There is no equivalent for the nested hook types. A field added to `AgentHookAction` or `AgentHookDefinition` makes `Required<...>` fail `tsc` until it is filled — but filling it with a plain string satisfies the compiler, plants no marker, and no assertion notices, because `plants every marker it names` walks the roster and never walks the fixture. **That is the exact shape that let `hooks[].hooks[].type` ride the `...action` spread unsanitised**, caught on the guard's first run only because someone thought to look for it. Every field is covered today (`AgentHookDefinition` declares `matcher`/`hooks`; `AgentHookAction` declares `type`/`command`/`script`/`prompt`; all six plus the event key are enumerated in `sanitizeHooks`), so this is a gap in the guard rather than a live defect — which is why it wants fixing before the next nested field, not after. The fix is a planted-to-named direction on the nested rosters, or a structural equivalent of the top-level `Required<>` pin that a plain string cannot satisfy. Raised by the lane that pinned the gate composition; verified against the types rather than remembered. | Parked | refactor | medium     |
| CLI-880 | (new, 2026-09-03) **Four standards carry `last_validated: 2026-04-21` over text rewritten today.** `prompt-bible.md` (1983→1179 lines), `skill-atomicity-bible.md` (1428→1226), `skill-atomicity-primer.md` and `loop-prompts-bible.md` were substantially rewritten for voice and structure without a whole-document re-derivation against source, and the documentation bible's staleness rule 1 says the date means exactly that. Leaving April is right after a partial pass; the defect is that nothing records which areas were left unverified — rule 5 asks for an `agent-findings/` entry naming them, and none exists. Either finish the pass per document and stamp it, or file the entry naming the sections rewritten without re-derivation (`prompt-bible.md` §7 Troubleshooting and §8.3–8.5 are the candidates the diff shows lightly touched). All four are also past the quarterly threshold on their own. Census: `grep -l 'last_validated: 2026-04-21' packages/cli/.ai-docs/standards/*.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ready for Dev    | docs     | medium     |
| CLI-882 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (new, 2026-09-03) **The editor's preview cannot forward a custom agent's `hooks`, because the type it reads never carries the field.** `GeneratedAgentDefinition` in `packages/matrix/src/generated/agents.ts` is produced by a `Pick<AgentYamlConfig, …>` in `packages/cli/scripts/generate-matrix-package.ts` that names `disallowedTools`, `permissionMode`, `isolation`, `experimental` and `outputFormat` — not `hooks`. So `compileAgents` in `apps/editor/src/features/configure/lib/output-preview.ts` now mirrors four of the CLI's five frontmatter spreads and structurally cannot mirror the fifth. Inert today — `grep -rl '^hooks:' packages/cli/src/agents/*/*/metadata.yaml` returns nothing — but a consuming project's agent declaring its own `PostToolUse` or `Stop` hook previews without it while `install` writes it, which is the editor/CLI divergence the two surfaces are meant never to have. The completion gate is unaffected (composed from `tools` inside `renderAgent`). Fix is one field in the `Pick` plus `bun run generate:matrix`, then the fifth spread in the editor. Found by the lane landing the other four; the earlier lane that added `isolation`/`experimental` to that type stopped short of `hooks`. | Parked | bug      | easy       |
| CLI-883 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (new, 2026-09-03) **The editor and the CLI build a compiled agent's `AgentConfig` by two hand-aligned functions, and nothing compares their outputs.** `compileAgents` in `apps/editor/src/features/configure/lib/output-preview.ts` and `resolveAgents` in `packages/cli/src/cli/lib/resolver.ts` each construct the definition `renderAgent` consumes; `renderAgent`'s byte-identity for the SAME input is pinned (`scripts/generate-compile-package.test.ts`), but no test feeds one configuration through both constructors and asserts the two `AgentConfig`s agree. So every field is aligned by a person reading both files — five conditional spreads were mirrored by hand this week, `model`/`path` are deliberately unconditional on one side, and `hooks` cannot be mirrored at all (CLI-882). The divergence class is the one the two surfaces are meant never to have, and it is currently guarded by nothing. The comparator belongs beside `preview-matches-install.e2e.test.ts`, whose docblock now records this as a KNOWN GAP; the shape is a contract test in `packages/compile` that both front doors import, or an e2e that installs and previews one config and `toStrictEqual`s the two constructed definitions before rendering. Found by the lane that fixed that spec's own vacuous version check. | Parked | test     | medium     |
| CLI-499 | (owner 2026-10-26, card q-gap-deferred-rows: "Keep the six deferred, retire the three") Split out of CLI-463 (2026-08-16): the internal identifier rename that follows the surface — 263 distinct identifiers containing `source`/`Source` across src and e2e, 20 exported types, 37 exported functions (5 of which mean SOURCE CODE and are excluded), 53 files with `source` in the filename including one directory and one generated file, and 384 test names. Mechanical, uncoupled to CLI-498, and deliberately NOT in Track A. Respect CLI-463's MUST NOT RENAME list. | Deferred | refactor | complex    |
| CLI-467 | DEFERRED (owner 2026-08-09: "we will get to knip later") — the knip deletion rounds: rule the baseline's categories (197 barrel lines, 53 export keywords, 35 zero-ref symbols, 11 devDeps, 3 duplicates, remaining unlisted deps incl. test-side ansis) and execute per class. Baseline: todo/plans/CLI-464-dead-code-baseline-2026-08-09.md. chalk fixed separately 2026-08-09.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Deferred         | refactor | medium     |
| CLI-453 | DEFERRED — re-add `new skill`, NOT part of the go-live home stretch (owner 2026-08-09: go live without it, consider later). When built, it mimics the editor's intake flow — which is why it waits for that flow to settle, not the other way round.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Deferred         | feature  | medium     |
| CLI-733 | (was D-180) Write a "Bring your own skills" guide.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Investigate      | feature  | easy       |
| CLI-729 | (was D-162) Skill Olympics — benchmark the expressive-typescript skill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Investigate      | refactor | complex    |
| CLI-724 | (was D-66) AI-assisted PR review: categorize diffs by type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Investigate      | feature  | complex    |
| CLI-722 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (was D-62) Review default stacks: add reviewing / research / methodology skills. | Parked | feature  | complex    |
| CLI-720 | (owner 2026-10-26, card q-gap-backlog: "Queue the 11 bugs, park the rest") (was D-41) Create the `agents-inc` configuration skill. [Plan](./plans/CLI-720-config-sub-agent.md) | Parked | feature  | complex    |
| CLI-319 | (owner 2026-10-26, card q-gap-learning-capture: ; note: "This already partly happens in agent findings see if that can be expanded") Research, read-only: how the agent-findings habit could be expanded to capture what sub-agents struggled with; report options, build nothing. (was #19) Sub-agent learning capture system. | Parked by owner 2026-10-30 ("a good idea but we will do this at the very end. dont queue it i will answer when ready") | feature  | complex    |
| CLI-380 | (owner 2026-10-26, card q-gap-deferred-rows: "Keep the six deferred, retire the three") Complete the infra domain roster (developer, pm, researcher, tester) — deferred at CLI-351's landing. | Deferred | feature  | complex    |
| CLI-425 | Invariant (owner 2026-08-07): a skill id always includes its category. 33 violations audited; ALL renames parked until the very end. [List](./plans/CLI-425-id-category-violations.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Deferred         | refactor | complex    |
| CLI-943 | (new, 2026-10-23, E2-market and E2b lanes) `.ai-docs/standards/editor-and-worker.md` has four sentences those lanes made false. A standard, so it changes when a gate fails on it. | Deferred | docs | trivial |
| CLI-944 | (new, 2026-10-23, F5 rate-limit fix) `user-journeys.md` journey 50 says `compose.test.ts` proves "ten calls a minute per USER"; the spec now stubs the limiter. A standard, so it changes when a gate fails on it. | Deferred | docs | trivial |

---

## Reminders for agents

See [docs/cli/guides/agent-reminders.md](../docs/cli/guides/agent-reminders.md) for the full list of
rules (use specialized agents, handle uncertainties, blockers, commit policy, archiving, status
updates, context compaction).

---

## Active Tasks

### Bugs

#### CLI-920: `uninstall` asks which installation to remove (parked with Codex)

In a folder holding both a Claude and a Codex installation, `uninstall` without `--provider` stops and asks which one to
remove. The owner's ruling on `uninstall` is "I just want it gone". Parked because the owner tests Codex himself. Found
by the 2026-10-01 manual journey run.

#### CLI-914: CLAUDE_CONFIG_DIR is honoured for trust only (audit 97)

Since audit 87 the CLI reads Claude Code's state file from `$CLAUDE_CONFIG_DIR/.claude.json`. But a global install
still writes its sub-agents and skills to `~/.claude/agents` and `~/.claude/skills`, while Claude Code with that
variable set reads them from `$CLAUDE_CONFIG_DIR/`. Honour it for the global install paths too.

Owner ruling 2026-10-04: deferred as an edge case. Not mechanical: the global `.claude` path is composed in several
modules and the home-directory checks would need the same split.

#### CLI-917: the unshipped-stack refusal offers no way forward (audit 100)

The refusal added by audit 81 (`stackNotOfferedMessage`, `stacks-loader.ts`) says the stack isn't shipped but not what to
do next. Older wording.

#### CLI-364: residuals from the live-CLI sweep

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

---

---

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

#### CLI-904: Custom marketplaces beyond today's rules — stacks naming outside skills, ids without the prefix

The owner wants users to build their own marketplaces, stacks and skills, including skills that don't follow the
catalogue's naming. Owner, 2026-10-02: "this might be larger than this simple back and forth". Checked on 0.165.0,
2026-10-02:

- A custom stack can name its own marketplace's skills. A public skill named in it, such as `web-framework-react`,
  is dropped at install: "Left out of the stack — selecting it would install nothing".
- A custom skill id must start with its marketplace's name, and `build marketplace` refuses any other. That is the
  CLI-498 ruling (journey 26): the prefix is what stops two marketplaces naming the same skill, so relaxing it
  reopens that ruling.
- `config/skill-rules.ts` can name only public skills. Custom categories already work.
- `build marketplace` warns about a stack naming a skill the marketplace doesn't ship, and publishes anyway.
  **Owner ruling, 2026-10-02:** keep publishing.

Related: CLI-714 (user-defined stacks in consumer projects). Needs a design pass with the owner before any code.

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

---

### Web ↔ CLI integration

#### CLI-905: `init --ui --marketplace Y` should open the editor on marketplace Y

Today `--ui` drops `--marketplace` without a word (`Init.install` calls `openEditor(flags.from)` only). The editor's
URL schema (`apps/editor/src/routes/search.ts`) carries `domain`, `q`, `sel` and `fromId`, and no marketplace, so
the CLI has nothing to hand it. Under CLI-902 the pair refuses.

**Owner ruling, 2026-10-02:** "For now, this can refuse; add a to-do item to allow this." Allowing it takes an
editor URL parameter that loads a marketplace, plus the CLI passing it. A marketplace that is a local folder cannot
be loaded by the editor, so that case keeps refusing.

#### CLI-906: `config.ts` records several marketplaces — `marketplace` becomes an array of `{ name, url }`

Today an installation's `config.ts` records one marketplace (`projectConfigSchema` in
`packages/cli/src/cli/lib/schemas.ts`):

- `marketplace`: a single string, the path or URL its catalogue is read from;
- `marketplaceName`: that marketplace's own name.

A skill from a second marketplace is linked only per skill:

- **a plugin** records that marketplace's name in its entry's `origin`;
- **a local copy** records `origin: "eject"`. Its link survives only as the id's prefix and as its `metadata.yaml`'s
  `forkedFrom.source`.

So editing that installation offers only the first marketplace's catalogue.

**Owner, 2026-10-02:** "add a task that we will do later on to allow marketplace to be an array. Maybe marketplace
will be an array of objects and then the name will be a property and URL another property."

Related: CLI-903 (a share carrying more than one marketplace) and CLI-904 (custom marketplaces beyond today's
rules). A schema change to `config.ts` also reaches the generated `config-types.ts`, the editor's seed payload
(`packages/matrix/src/seed.ts`), and every reader of `marketplace` / `marketplaceName`.

#### CLI-903: A share names one marketplace, so a setup drawn from two installs only half of it elsewhere

A share payload (`packages/matrix/src/seed.ts`) carries one top-level `marketplace` ref for every skill. Journey
26's ruling (CLI-498) allows a global install from one marketplace and a project from another. Shared from that
project, the id names one marketplace, so the other side's skills don't install on the receiving machine.

**Owner ruling, 2026-10-02:** a share should carry more than one marketplace, but not now. Planned stopgap, in
CLI-902: `share` warns which skills its id won't install.

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

- **Two writer variants, not one.** `generateStandaloneConfig` and `generateProjectConfigWithInlinedGlobal`
  in `packages/compile/src/config-source.ts` both emit this file, and the project variant INLINES a global config — check what "inline the arrays" means for a
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

**(b) Three test helpers read the emitted config by string convention, and all three broke silently
when the format moved.** They were repaired, but the coupling is unchanged and the next format change
will break them the same way. `helpers/config-source-sections.ts` keyed section ends on `];` / `};`,
which `semi: false` deleted; `helpers/compacted-stack.ts` ran `JSON.parse` on a stack literal that had
stopped being JSON; `helpers/generated-types.ts` matched double-quoted literals only — **that one would
have returned `[]` for every union and passed vacuously**, which is the failure worth fixing properly
rather than re-keying. Owner 2026-10-29: a parser is overkill; keep the unique markers, and make a helper that finds no names throw instead of returning `[]`.

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

#### CLI-891: Codex hand-check against a real subscription

Everything Codex was verified against a pinned `@openai/codex` binary, never a real account. The owner runs
[`packages/cli/.ai-docs/reference/codex-hand-check.md`](../packages/cli/.ai-docs/reference/codex-hand-check.md)
once he has a subscription; some of its checks can be done without one.

**Run 2026-09-26 by Codex itself (codex-cli 0.157.1). Found a KNOWN BUG: every Codex role is written
with the Claude alias `model = "opus"`, which Codex registers but refuses to spawn, so no agents-inc
sub-agent runs on Codex.** Fixed the same day — a Codex role carries no `model` line — and Codex's re-run
passed. Full results are in [`plans/CLI-codex-provider-progress.md`](./plans/CLI-codex-provider-progress.md)
→ "KNOWN BUG".

#### CLI-894: The specs that skip without a Claude binary test nothing on Codex

Owner, 2026-09-26: _"it should be skipped when no claude and no codex is installed otherwise we dont test
this at all for codex. actually there are many tests that are skipped when no claude is installed"_.

**44 spec files** carry `describe.skipIf(!claudeAvailable)` (or `it.skipIf`): 39 e2e specs across `commands/`,
`interactive/` and `lifecycle/`, plus 5 under `smoke/`. CI's runner has no `claude`
(`ci.yml` says so beside the probes), so **on CI every one of them skips**, and none has a Codex leg. The
e2e suite can always reach a Codex binary: `e2e/fixtures/codex-on-path.ts` runs the pinned `@openai/codex`
package. So the Codex half could run everywhere, CI included.

The shape, per spec: parameterise over the hosts whose binary is available (`claude` found, and the pinned
Codex always), and skip only when neither is. Many are plugin-mode flows (install, migrate, uninstall a
plugin), which Codex offers only as plugin + global. Each spec needs a decision: run on Codex as-is,
adapt it to Codex's placements, or record why it is Claude-only. Start with `commands/plugin-uninstall-core`,
the one the owner named, as the pattern. Re-derive the list with
`grep -rln 'skipIf(!claudeAvailable)' packages/cli/e2e packages/cli/src`.

**Progress 2026-09-26.** The deciding fact: `init` refuses `--provider` without `--from`, so the INIT WIZARD cannot
install onto Codex at all — every init-wizard spec is Claude-only by construction, and its Codex behaviour is
reached through `init --from` instead. The EDIT wizard does run over a Codex installation.

- **Done:** `e2e/interactive/codex-edit-wizard-plugin-operations.e2e.test.ts` (never skips; drives the pinned
  codex): remove and add a plugin skill through the wizard, each observed in Codex's own `plugin list`, with a
  no-change control; both install-mode switches; ejected-skill removal. Two cases pinned `it.fails` — CLI-895.
  `e2e/helpers/terminal-session.ts` now puts the pinned codex on the wizard's PATH, as `CLI.run` already did.
- **Already covered on Codex by an existing spec (no new work):** plugin install (`smoke/plugin-install`,
  `plugin-chain-poc` → `lifecycle/codex-offered-placements`); plugin uninstall (`commands/plugin-uninstall-core`
  → `lifecycle/codex-uninstall-reports-what-it-observed`, which observes a REAL removal); host contract and home
  isolation (`smoke/plugin-host-contract`, `home-isolation` → `smoke/codex-install-surfaces`, `codex-lane`, and
  each Codex spec's `~/.codex moved` guard); `init --from` routing (`commands/init-from-scenarios-install` →
  `codex-offered-placements`, `codex-install-narrates-its-own-host`); byte identity (`claude-install-byte-identity`
  is Claude's own tree; its Codex counterpart is `codex-install-leaves-claude-untouched`).
- **Claude-only by construction (init wizard):** `init-wizard-*` (6), `init-plugin-config-marketplace-source`,
  `init-global-preselection-confirm`, `init-dashboard-edit-plugin-install`, `relationships`,
  `smoke/pom-framework`, and the lifecycle specs whose subject is an init-wizard install
  (`config-scope-integrity`, `cross-scope-lifecycle`, `preloaded-preservation`, `selected-agent-name-excluded`,
  `scope-aware-local-copy`, `plugin-lifecycle`, `plugin-scope-lifecycle`, `project-init-global-config-marketplace`,
  `project-tracking-propagation`, `mixed-mode-skill-ref-format`, `plugin-install-failure-hard-error`).
- **PARKED by the owner, 2026-09-26:** _"disregard edit for Codex for now"_. Not ported — the dual-scope edit specs (`dual-scope-edit-*`,
  `project-edit-*`, `edit-add-local-skills`, `edit-plugin-banner-parity`, `edit-unresolvable-entry-removal-reasons`,
  `edit-plugin-hard-error`, `edit-migration-eject-to-plugin-no-marketplace`, `install-mode-per-skill`,
  `install-mode-full-cycle`). Each needs a Codex install via `init --from`, and plugin legs are global-only there.

### Types & code quality

#### CLI-890: Owner's full review of the uncommitted tree

Queued by the owner on 2026-09-25: _"Once everything is done, then I will have you go over the code that was
written ... and review everything as none of it was written by the correct sub-agents. But tests pass, so it
should be functional."_ **Triggered 2026-09-25. Status 2026-09-26: source and tests reviews DONE, every
suite green; doc round 3 ON HOLD by the owner; cross-lane leftovers and owner questions listed under
"Outstanding after CLI-890" in the progress file.** The review is for convention and quality drift that
tests cannot see. The worklist found along the way is in
[`plans/CLI-codex-provider-progress.md`](./plans/CLI-codex-provider-progress.md). Read `git status --short` for the size
of the tree; it is not written here because it moves.

---

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
  them at all.
- **CLI-417** — sources-step wording ("Use all recommended skills (verified)") survived CLI-404
  as a separate feature; rename needs a ruling.
- Still pending from earlier today, listed here for one-stop review: CLI-400 (stack preload flags
  migrate into the mapping or stay the override tier), CLI-413 (custom flag never reaches
  config.ts — investigate), EDITOR-03's three-way fork and the deferred custom-skill stages
  (CLI-407..413, EDITOR-15..22), EDITOR-11's exclusive-downgrade narrowing (the incompatibility
  half), and the CLI-389 fan-out's owner checkpoints.


#### CLI-943: four sentences in editor-and-worker.md that E2-market and E2b made false

- "Does the visitor's own data survive this?" says `storedConfig()` reads the one key `agents-inc:config:v1`. `storedConfig(marketplace)` now reads `agents-inc:config:v1` for the public catalogue or `agents-inc:config:v1@<marketplace>` for a marketplace (`configStorageKey` in `apps/editor/e2e/pages/configure-page.ts`).
- "Under `persist`, `set` IS the write", the corollary paragraph: "neither covers a write arriving from the visitor's own address while a restore is parked" no longer holds. `useConfigStore` starts on `UNWRITTEN_SLOT` and only `readSavedConfig` switches writes on.
- "Which stores owe this", the `marketplace-store` row: "`remember` is called only from the dialog" no longer holds (`grep -rn 'remember(' apps/editor/src`).
- "An act reachable through two controls is a module, not a component" names `switchConsequence`/`dropsSelection` as where each door decides and says the header counts two doors. The decision is now `landingOf`/`loadCost`, the header counts none (already so at HEAD), and `use-marketplace-load.ts` names three doors.

#### CLI-944: journey 50 claims a limit the compose spec no longer checks

Journey 50 in `packages/cli/.ai-docs/standards/e2e/user-journeys.md` lists, among `apps/server/src/compose.test.ts`'s boundaries, "ten calls a minute per USER rather than per address". Since the rate-limit flake fix, the spec stubs `COMPOSE_CALLS.limit` with a count per key and no window (`stubAllowance`). Its new spec proves the count is per person across sessions, and kept apart from another person at the same address. "Ten" and "a minute" now live only in `apps/server/wrangler.jsonc` and the stub. The F5 lane's replacement text: "an allowance per USER rather than per address, counted across their sessions". Deferred under the owner's rule that `.ai-docs` standards change when a gate fails on them. Board: stale doc `d-cli-user-journeys-row-50`.

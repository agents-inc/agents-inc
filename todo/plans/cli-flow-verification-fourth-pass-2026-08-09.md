# CLI flow verification, fourth pass — 2026-08-09

A fourth hand-driven pass over the real `agents-inc` binary, scored against
[`.ai-docs/standards/e2e/user-journeys.md`](../../packages/cli/.ai-docs/standards/e2e/user-journeys.md)
as it stands after this week's second wave — revalidation replacing `--refresh`, `--source` on
`init` only, the startup warnings band, `doctor`'s orphan fail-row, the honest removal reasons,
stackless-source behaviour, and the command deletions. Every journey the canonical page marks
testable was run: **1–16, 18–21, and journey 22's testable half**, plus journey 17 as an extra.
Journeys 23–28 are TO COME or unruled and were not touched.

**Bottom line: 24 journeys run, 24 PASS / 0 FAIL. Two new issues found, both compiled rather than
fixed, both rooted in one cause: the published marketplace ships skill categories the CLI's own
`Category` enum does not know, which makes `doctor` exit 1 and silence its entire operational
layer on a default from-scratch install.**

The four assertion surfaces were asserted at every mutating step, at every scope the step could
touch: **21 full four-surface batteries, all clean**, plus ~20 negative-form (byte-identity)
checks for the scopes a journey must not touch.

## How the pass was run

| Element         | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Binary          | `packages/cli/bin/run.js`, built once at the start (`bun run build` in `packages/cli`, 0.152.1) |
| Skills source   | the **default public marketplace** `github:agents-inc/skills` for journeys 1–17 — real network  |
| Fixture sources | `createE2ESource()` variants (with stacks / stackless / one skill dropped) for journeys 18–22   |
| Stacks pinned   | `nextjs-fullstack` (journeys 1–11), `nextjs-t3-stack` (journey 12), `e2e-test-stack` (18, 21)   |
| Scratch HOMEs   | 16 scratch HOMEs under the session scratchpad — never the real `~`                              |
| Claude CLI      | present (2.1.224); every plugin leg is a real `claude plugin install`                           |
| Config store    | a loopback stand-in for agentsinc.sh, mirroring `e2e/fixtures/seed-config-store.ts`             |
| Git             | read-only only (`git status`, `log`), per the 2026-08-09 clarification; nothing was written     |
| Deploys         | none                                                                                            |

**Why the default source this time.** The third pass drove `--source <skills-clone>`. Since
CLI-451/455 a custom source gets no built-in stack stand-in, so a local clone now offers **no
stack step at all** — the correct new behaviour, and the reason journeys 1–12 had to run against
the real marketplace to have a stack step to drive. That change is what surfaced both new issues:
they live in the published content, which the third pass never loaded.

### How the four surfaces were asserted

Every mutating step was followed by the same battery, at every scope:

| Surface | What was asserted                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `.claude/agents/*.md` — file list, per-file content hash, the skill ids each agent names; a re-compile must leave every file byte-identical                                                                                                                                                                 |
| 2       | the wizard frames and command stdout/stderr the user actually saw, captured through a real PTY into a headless xterm                                                                                                                                                                                        |
| 3       | `config.ts` — structurally parsed entries (id, scope, source, excluded; agent name, scope, excluded) plus a byte hash, and it must re-load through the CLI's own loader (`doctor` / `compile` / `list`)                                                                                                     |
| 4       | `config-types.ts` — **(a)** byte-identical after `compile` regenerates it, **(b)** `config.ts` type-checks against it, **(c)** `SkillId` / `AgentName` / `Domain` / `Category` each still REJECT an impossible literal (`TS2322`), **(d)** every id `config.ts` declares is a member of the `SkillId` union |

Surface 4(c) keys on the diagnostic's **line number**, not the alias name — `tsc` prints the
resolved literal when a union narrows to one member, and keying on the name under-reports a
_harder_ narrowing as a failure. All four aliases narrowed in all 21 batteries.

---

## Results

| #   | Journey                                                                         | Steps driven                                                                                                                                                                 | Surfaces | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Global install from nothing, eject mode                                         | `init` at `HOME`=cwd → stack 1 → domains → 6 build tabs → Sources `l` → agents → confirm                                                                                     | 1,2,3,4  | PASS   | exit 0; 12 agents; 23 skill dirs; all 23 entries `source:"eject"`, `scope:"global"`; `SkillId` union 23/23; config type-checks; all four aliases narrow; `Refreshed config-types.ts` and byte-identical after re-compile                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | Stack installs exactly its declared roster                                      | set-diff the install against `defaultStacks[0]` read off the built `dist/config-exports.js`                                                                                  | 1,2,3,4  | PASS   | `{missing:[],extra:[]}` on **seven** derived sets: config.skills, skill dirs, agent files, config.agents, the stack record's agent keys, `SkillId` and `AgentName`. 163 skill-id mentions across the 12 compiled agents                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | Project over an existing global install                                         | `init` in proj-a → dashboard → Edit → focus Zod → Space → `s` → Sources → confirm                                                                                            | 1,2,3,4  | PASS   | Space paints `G  Zod`, `s` repaints `P` (the CLI-442 ruling: fresh pick defaults global, `s` overrides); written `scope:"project"`; dir in proj-a only; project union gains the id, global does not; the **only** global write is the registry line                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | Scope toggle for a skill, G→P and P→G                                           | proj-a edit `s` on the inherited `G  React`; second edit `s` on the resulting `P  G` pair                                                                                    | 1,2,3,4  | PASS   | G→P: config gains a project entry **plus** an excluded global tombstone, dir copied, global tree byte-identical. P→G: `- React [P]`, project copy deleted, config collapses to one global entry, global byte-identical again                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | Install-mode toggle eject↔plugin                                                | proj-a edit → Sources → `→` `Space` on the project row; then a second edit with `l`                                                                                          | 1,2,3,4  | PASS   | `~ Zod (Eject → Agents Inc)`, `Switching 1 skill(s) to Plugin (native install)`, `Installing skill plugins...`, `Installed 1 skill plugins`; entry → `source:"agents-inc"`; local dir removed; `enabledPlugins` written. Reverse restores the files, prints the Eject line and **no** plugin banner                                                                                                                                                                                                                                                                                                                                                                            |
| 6   | A second project inherits the global install                                    | `init` in proj-b → dashboard → Edit → pass through → Sources `l` → confirm                                                                                                   | 1,2,3,4  | PASS   | `No changes made.`; proj-b carries 23 global-scoped skills / 12 global agents, **0** project-scoped, and does **not** inherit proj-a's project-scoped Zod — absent from `config.ts` and from the `SkillId` union; global diff is the registry line alone                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | A global edit propagates to every project                                       | edit at `HOME` → select React Router → Sources `l` → confirm                                                                                                                 | 1,2,3,4  | PASS   | `5 agents rewritten, 7 unchanged` — exactly the 5 compiled files that name the id; `Recompiled agents in 0 registered projects, 2 unchanged`; both projects' `config.ts` **and** `config-types.ts` gained the id; all three unions type-check                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8   | Project edit removes the `[P]` half                                             | proj-a edit → `s` to build the pair → second edit → Space on the `[P][G]` row → confirm                                                                                      | 1,2,3,4  | PASS   | `- React [P]`, no toast; project copy deleted, global copy kept; `home-global` **and** `proj-b` byte-identical across the whole tree. Both guard probes still refuse — see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 9   | A stack's picks are editable                                                    | edit at `HOME` → deselect Zustand (stack skill) → select tRPC (non-stack) → Sources `l` → confirm                                                                            | 1,2,3,4  | PASS   | `+ tRPC [G]` / `- Zustand [G]`; `8 agents rewritten, 4 unchanged` matches the 8 changed files exactly; zustand dir deleted (4 files), trpc dir created (9); roster unchanged at 12; the union loses one id and gains the other at all three scopes                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 10  | `update`                                                                        | `update` at `HOME` and in proj-a, eject-only; then again with a plugin skill at each scope                                                                                   | 1,2,3,4⁻ | PASS   | eject: `Ejected skills are yours to own…` + `No plugin marketplaces are configured — nothing to refresh.`, exit 0 at both scopes. marketplace: `Refreshing marketplace agents-inc...`, `Updated marketplace agents-inc`, `✓ Update complete! 1 marketplace refreshed.` Nothing outside Claude's own plugin dir changed at either scope                                                                                                                                                                                                                                                                                                                                         |
| 11  | Generated-file integrity after every step                                       | the battery above, after every mutating step in the pass                                                                                                                     | 1,2,3,4  | PASS\* | **21 four-surface batteries, 21 clean.** `Refreshed config-types.ts` 21/21, byte-identical 21/21, `config.ts` type-checks 21/21, all four aliases narrow 21/21, zero agent drift on re-compile, zero compile warnings. \*`doctor` is clean on 13 of the 21 — the other 8 are the default-marketplace installs of **finding 1**                                                                                                                                                                                                                                                                                                                                                 |
| 12  | Stack selection yields a valid config                                           | `init` in a fresh HOME → **`↓` onto the second stack** → domains → build tabs → Sources `l` → agents → confirm                                                               | 1,2,3,4  | PASS   | cursor proven on `Next.js T3 Stack`; 10 agents / 13 skills land, `{missing:[],extra:[]}` on all six derived sets; stack 0's `cli-developer` and `cli-tester` correctly **absent**; the generated pair type-checks and all four aliases narrow                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13  | `init --from <id>` installs a shared config                                     | loopback store publishes a v3 payload; `init --from plain01` into a greenfield project                                                                                       | 1,2,3,4  | PASS   | exit 0; `Fetching configuration plain01...`, `Installing 2 skill(s) across 1 sub-agent(s)`; one request, `/configs/plain01`, `user-agent: agents-inc-cli`; both skills global, `web-developer.md` in HOME; pair written at both scopes, both type-check, `doctor 12 passed, 0 warnings, 0 errors`                                                                                                                                                                                                                                                                                                                                                                              |
| 13a | `init --from` refuses on an existing install                                    | the same command twice over the same dirs — the first is the control                                                                                                         | 1,2,3,4⁻ | PASS   | control exit 0, second exit 1: `An installation already exists at …/config.ts. Run 'npx agents-inc uninstall' first — installing a shared configuration is a fresh setup, not a merge.` **Both** trees byte-identical: nothing added, removed or changed                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 13b | `init --from` with global-scoped content                                        | payload mixing a global skill on an unpinned agent with a project skill on a project-pinned agent                                                                            | 1,2,3,4  | PASS   | global gets `web-framework-react` + `web-developer.md`; project gets `web-testing-vitest` + `web-tester.md` and records `web-developer` as `scope:"global"`; project union carries both ids, global union only the global one; both pairs type-check                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 14  | Deleting a config under a live install                                          | delete `.claude-src/config.ts` under a real install, then `doctor` / `compile` / `edit` / `list` / `init`                                                                    | 1,2,3,4  | PASS   | **the orphan fail-row lands**: `No Orphans ✗ 2 skills and 1 agent installed here, and no configuration declares them`, each artifact named, plus its own tip; `Summary: 6 passed, 0 warnings, 2 errors`, exit 1. `compile`/`edit` exit 1 `No installation found`; `list` exits 0 and says the same; `init` falls back to the stack step. **Nothing was written** — the tree is byte-identical and `config.ts` was not recreated                                                                                                                                                                                                                                                |
| 15  | Skill scope, both directions, both scopes                                       | journey 4's two legs, plus a third leg at the global scope                                                                                                                   | 1,2,3,4  | PASS   | both directions proved in journey 4. At global scope the affordance is correctly absent — the footer reads `D Labels  I Info` with **no** `S Scope`, and `s` now answers `Scope toggle unavailable in global context` rather than being silently inert; `config.ts` byte-identical after the attempt                                                                                                                                                                                                                                                                                                                                                                           |
| 16  | Sub-agent scope, both directions                                                | proj-a edit → agents step → `s` on Web Researcher; then a second edit toggling it back                                                                                       | 1,2,3,4  | PASS   | `[G]` → `[P][G]`, `+ web-researcher [P] (agent)`, `web-researcher.md` written into the project, config gains a project entry + excluded global tombstone, `1 agents rewritten, 12 unchanged`; the reverse prints `- web-researcher [P] (agent)`, removes the file and collapses the pair; global and proj-b byte-identical on both legs                                                                                                                                                                                                                                                                                                                                        |
| 17  | Install mode at **both** scopes _(extra — the page marks this blocked for E2E)_ | global edit switches MSW (global) to plugin; project edit switches Zod (project) to plugin                                                                                   | 1,2,3,4  | PASS   | both land as `source:"agents-inc"` at their own scope; `8 agents rewritten, 4 unchanged` matches the 8 changed files. **No contamination:** the project leg left `home-global`'s config, skills and agents untouched and `proj-b` byte-identical; only Claude's own global plugin registry moved                                                                                                                                                                                                                                                                                                                                                                               |
| 18  | The custom-marketplace arc                                                      | `init --source <fixture>` in a fresh HOME (stack-shipping **and** stackless variants), then `list` / `search` / `compile` / `doctor` / `edit` / `uninstall` with **no** flag | 1,2,3,4  | PASS   | source stored in `config.ts`; every later command resolves it. **Discriminating negative:** `search react` returns 1 result (this source's) not the public marketplace's 35, and `search nextjs` — which the public marketplace ships — returns `No skills found matching "nextjs"`. Stackless variant: **no stack step and no `Stack` tab** in the header; `uninstall` on it removes `.claude/` and `.claude-src/` whole                                                                                                                                                                                                                                                      |
| 19  | Uninstall from scratch                                                          | project uninstall (interactive, with preview); project `--yes`; global `--yes`; and over a config that stopped loading                                                       | 1,2,3,4  | PASS   | preview names Plugins / CLI-managed files / Config; project run removes `.claude-src/` and the project skill, leaves `.claude/` (user content), and the **only** global write is deregistering that project from `projects[]` — proj-b byte-identical. Global run uninstalls the plugin, removes 23 skills, `.claude/agents/` and `.claude-src/`, keeps `settings.json`. Over an unreadable config it warns `Could not read the project config — plugins and compiled agents it lists may be left behind`, still removes the 23 skills it can identify and `.claude-src/`, and the compiled agents survive exactly as the warning promised                                     |
| 20  | `eject <type>` customisation                                                    | from the fixture-source install: `eject agent-partials`, edit `developer/web-developer/identity.md`, `compile`                                                               | 1,2,3,4  | PASS   | partials ejected to `.claude-src/agents/`; after the edit `compile` reports `1 global agents rewritten, 1 unchanged` and the marker appears in `.claude/agents/web-developer.md`; **`config.ts` byte-identical** — a customisation is not a configuration change. `eject skills --force` from the fixture source also succeeds (3 skills)                                                                                                                                                                                                                                                                                                                                      |
| 21  | The marketplace-author arc                                                      | `doctor` at the repo cwd → `build plugins --agents-dir src/agents` → `build marketplace` → `doctor` again → `init --source <repo>` → `doctor` over the installation          | 1,2,3,4  | PASS   | at the repo cwd, both before and after the build: `Skipped — no installation here (skills source repository)`, `5 passed, 0 warnings, 0 errors`. 10 plugins built, `marketplace.json` written with the identity read from `package.json`. The install from the built repo lands 7 skills / 2 agents and `doctor` answers `12 passed, 0 warnings, 0 errors` — the cwd-dependent answer the journey demands. **The leg the page records as blocked now works by hand:** switching a skill to plugin mode installed `web-framework-react@pass4-author-marketplace` from the freshly built local marketplace                                                                       |
| 22  | Revalidation (testable half)                                                    | four arms on `search` against the default marketplace in a fresh HOME                                                                                                        | 2        | PASS   | cold 4753ms, downloads, writes the `.etag.json` record, silent. **current** 1100ms, silent, cache byte-identical, record unchanged. **superseded** (ETag poked) 4499ms, prints `Marketplace has newer content — fetching the update...`, and an orphan file planted in the cache does **not** survive — the copy is replaced, not merged — with the record re-recorded to the live ETag. **unreachable** (tarball URL poked to a closed port) 858ms, warns `Could not reach github:agents-inc/skills — using the cached copy, which may be out of date.`, cache served byte-identical. Surfaces 1/3/4 have no subject: the run wrote no config, no types, no agents, no skills |

`4⁻` marks surface 4 asserted in its negative form — the journey must leave `config-types.ts`
untouched, and byte-identity is the assertion.

**Not run, by the page's own markers:** journeys 23–28 (TO COME, or the unruled journey 26), and
the four withdrawn features, whose absence was confirmed instead (below).

---

## The second wave, each behaviour asserted first-class

**`--refresh` is gone everywhere.** Refused with `Error: Nonexistent flag: --refresh` and **exit 2**
on `init`, `update`, `list`, `search`, `compile` and `doctor`. The string "refresh" survives in
`update`'s help only as prose about what the command does — there is no `--refresh` flag in any
command's help.

**`--source` is `init`'s alone.** `init --help` lists `-s, --source=<value>`. On `edit`, `compile`,
`list`, `search`, `uninstall`, `update` and `doctor` it is refused with `Nonexistent flag: --source`
and **exit 2** — seven commands, seven refusals.

**Stored-source resolution.** A `config.ts` written by `init --source <fixture>` drives every later
command with no flag: `list` reports that installation, `search` answers from inside the custom
catalogue (and refuses to find a skill only the public marketplace ships), `compile` resolves and
recompiles against it, `doctor` reports `Connected to local: <fixture>`, `edit` opens its grid from
it, and `uninstall` matches skills by it.

**The revalidation verdicts.** All three, on both a plain command and inside the wizard:

- **current** — silent, **1100 ms** (cold is 4753 ms), cache and record byte-identical.
- **superseded** — `Marketplace has newer content — fetching the update...`, simulated by poking the
  recorded ETag exactly as the landing did. In the wizard the line is printed to stdout **above**
  the frame rather than carried into the band (see observation 4).
- **unreachable** — the warning appears **inside the wizard frame, in the band**, as message one:
  `Could not reach github:agents-inc/skills — using the cached copy, which may be out of date.`

**The warnings band.** Against a fixture source that emits 2 386 unresolved-slug warnings, the band
paints **3 messages then `... and 2383 more`** at 60 rows, and **1 message then `... and 2385 more`**
at 24 rows — both budgets, exactly as `MAX_PAINTED_STARTUP_MESSAGES` / `_CRAMPED` declare.

**`doctor`'s orphan fail-row.** On a content-clean install with `config.ts` deleted:
`No Orphans ✗ 2 skills and 1 agent installed here, and no configuration declares them`, every
artifact named on its own line, its own tip printed beside the config tip, `6 passed, 0 warnings,
2 errors`, exit 1. With nothing installed at all the row keeps its skip, as documented.

**The honest removal reasons.** Two of the four, each verbatim and each reached from a real install:

- `- web-framework-react [G] (not present in pass4-author-marketplace)` — the reason names the
  **source label**, not a generic sentence.
- `- web-state-zustand [G] (skill files no longer exist at …/.claude/skills/web-state-zustand)`.

The other two (`no skill named 'X' is installed at …`, `installed at …, but its category …`) need a
source that _also_ lacks the id — deleting `SKILL.md` alone leaves the entry resolvable from the
catalogue, which is correct and is why no reason was printed.

**Stackless sources.** `init --source <stackless fixture>` opens on **Select domains**; the header
reads `Domains  Skills  Sources  Agents  Confirm` with **no `Stack` tab**, and the confirm panel
reads `Stack none`. The install, `doctor` and the four surfaces are all clean.

**The deletions.** `import skill`, `new skill`, `new agent` and `new marketplace` each warn
`… is not a agents-inc command` and exit **127** (`UNKNOWN_COMMAND`); `--help` lists neither family.
The filter-incompatible `F` hotkey is absent from the build footer (`D Labels  I Info`) and pressing
`F` leaves the frame byte-identical.

**The narrowed `[P][G]` guard, with the exclusive-swap probe.** Both refusals still stand, in an
aborted session that left `config.ts` byte-identical:

- **Inherited-global deselect** — Space on `G  React` raises
  `Global skills cannot be changed from project scope` and leaves the cell unchanged.
- **Exclusive swap** — selecting `Vue` in the exclusive, required Framework category raises the same
  toast; `G  React` and `Vue` are both unchanged.

---

## New issues

Compiled, not fixed, per the standing ruling.

### Finding 1 — the published marketplace ships categories the CLI's `Category` enum rejects, and a default install's `doctor` exits 1

**Symptom.** A from-scratch global install of the **first default stack** from the **default public
marketplace** — the most ordinary path there is — produces a `doctor` that exits 1:

```
Skills   ✗  23 skills: 1 error, 0 warnings
         - [ERROR] ~/.claude/skills/api-database-drizzle: metadata.yaml: category:
           Invalid option: expected one of "ai-infrastructure"|…|"api-orm"|…
Operational checks
  Skipped — fix the content errors above first
Summary: 4 passed, 0 warnings, 1 error
```

**Reproduction.** In a scratch HOME: `agents-inc init`, take stack 1, accept the domains, `l` on
Sources, confirm; then `agents-inc doctor`. Journey 12 reproduces it on the second stack through
`api-database-prisma` instead.

**Suspected mechanism.** `github:agents-inc/skills@main` ships **17 skills** whose `metadata.yaml`
`category` is outside the CLI's `Category` enum — `api-database` (16 skills, including
`api-database-drizzle` and `api-database-prisma`, which the first two default stacks both pull in)
and `api-framework` (1 skill, `api-framework-elysia`). The CLI's vendored matrix calls the same
skill `api-orm`, so the generated `config-types.ts` `Category` union is _correct_ and the ejected
copy of the file is not. The eject copies the marketplace's own `metadata.yaml` verbatim; `doctor`'s
content layer validates it against the CLI's Zod enum; the two disagree. The local dev clone at
`/home/vince/dev/skills` already says `api-orm` — the **published** repository is the side that has
drifted.

**Causal control.** A byte-copy of the failing install with that one value changed from
`api-database` to `api-orm`, and nothing else touched, answers
`Summary: 12 passed, 0 warnings, 0 errors` with every operational row green. One field is the whole
cause.

**Impact.** Surfaces 1, 3 and 4 are unaffected — the install itself is coherent and all 21
batteries were clean. What breaks is journey 11's "`doctor` is clean" clause on every default-source
install, and everything that depends on it (finding 2). It is a content/publishing defect rather
than a code one, but the CLI is where the user meets it.

### Finding 2 — one unknown category silences every operational check, including the orphan row a user in trouble needs

**Symptom.** `doctor` on the journey-14 scenario — a real default-stack install whose `config.ts`
has been deleted — never prints the orphan fail-row, or `Config Valid`, or any other operational
row. It prints `Operational checks / Skipped — fix the content errors above first` and stops, on
the strength of the single category error from finding 1.

**Reproduction.** Install stack 2 from the default marketplace, delete `~/.claude-src/config.ts`,
run `agents-inc doctor`. Compare with the same scenario on a content-clean install (an
`init --from` install of two skills), where the fail-row lands in full.

**Suspected mechanism.** The layering rule in `runAllChecks` — "operational failures on broken
content are downstream cascades, not findings" — is unconditional on _any_ content error. An
unrecognised `category` on one skill is not a cascade cause for `No Orphans`, `Config Valid` or
`Source Reachable`: none of those rows reads that field. The rule is right for a config that cannot
be parsed and too broad for a metadata field that no operational row consults.

**Impact.** The diagnostics are withheld from exactly the installations most likely to need them.
A user whose configuration has gone missing gets a message about a YAML category instead of the row
naming their unowned files. This is a consequence of finding 1 and would stop reproducing if
finding 1 were published away — but the underlying breadth of the skip is its own decision.

---

## Observations, not defects

**3. A project-scope edit writes `marketplace` into the global `config.ts`.** Switching a
_project_-scoped skill to plugin mode adds `"marketplace": "agents-inc"` to the **global**
`config.ts` (and reorders that file's export keys). Defensible — Claude marketplaces are registered
globally, and the plugin cache does land in the global HOME — but it is a global-config write from a
project-scope run beyond the registry line the containment journeys allow for, and it is sticky: the
reverse switch back to eject leaves the field in place. Recorded so a future containment assertion
does not read it as a regression. Every non-plugin project edit in this pass left the global
`config.ts` byte-identical.

**4. The superseded line is not band material.** `Marketplace has newer content — fetching the
update...` is a `log()` to stdout, so in a wizard run it prints above the frame rather than in the
startup band, unlike the unreachable warning, which is a `warn()` and is buffered into the band. Both
were visible in a 60-row terminal. The band's own JSDoc names only the unreachable warning, so this
matches the design as written; noted because the two verdicts are otherwise a pair.

**5. `bun run build` at `packages/cli` is clean.** Built once at the start, 0.152.1, no rebuild
during the pass.

## Known open rows re-confirmed, not re-discovered

- **CLI-472 — `eject skills` from the default source.** Reproduced exactly as filed:
  `eject skills --force` in a default-source install exits 1 with
  `ENOENT: no such file or directory, open '…/src/skills/meta-reviewing-infra-reviewing/SKILL.md'`.
  Journey 20 was therefore driven with the fixture source as its spec prescribes, where
  `eject skills --force` succeeds. Filed already; not a finding of this pass.
- **Journey 18's two uncovered legs** (`update` refreshing a custom marketplace; `GIGET_AUTH`) were
  not driven — the first is journey 10's success branch, exercised here against the default
  marketplace instead, and the second still needs a private remote and a token.

---

## Delta vs the third pass

| Item                            | Third pass (2026-08-08)                      | This fourth pass                                                                                    |
| ------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Journeys run                    | 17                                           | **24** — 1–16, 17 as an extra, 18–21, and 22's testable half                                        |
| Score                           | 17 PASS / 0 FAIL                             | **24 PASS / 0 FAIL**                                                                                |
| Skills source                   | a local clone via `--source`                 | the **default public marketplace** for 1–17; purpose-built fixtures for 18–22                       |
| Four-surface batteries          | 27                                           | 21, plus ~20 negative-form byte-identity checks                                                     |
| `--refresh`                     | still existed                                | **gone** — refused with exit 2 on all six commands, absent from every help page                     |
| `--source` scope                | accepted on several commands                 | **`init` only** — refused with exit 2 on seven other commands                                       |
| Revalidation                    | did not exist                                | all four arms driven, with timings and a cache-replacement proof                                    |
| Startup warnings band           | did not exist                                | both budgets driven (3 at 60 rows, 1 at 24), and the unreachable warning proved to reach the frame  |
| `doctor` orphan fail-row        | the row named stranded files                 | driven as a **fail** with its own tip, and its unreachability under finding 1 recorded              |
| Honest removal reasons          | not exercised                                | two of four proved verbatim from real installs                                                      |
| Stackless sources               | a local source still got the built-in stacks | **no stack step, no `Stack` tab** — and this is why journeys 1–12 had to move to the default source |
| `s` at global scope             | "inert"                                      | now answers `Scope toggle unavailable in global context` — an improvement, and a delta              |
| Journey 21's plugin-install leg | not run                                      | **works by hand** — installed from a marketplace built in the same session                          |
| Journeys 18–22                  | did not exist                                | all five driven                                                                                     |
| New issues                      | none                                         | **two**, both from published-content drift the third pass never loaded                              |

Counts that moved for a benign reason: journey 9 rewrites 8 agents rather than the third pass's 5
because its subject changed — Zustand is carried by 8 agents where Playwright was carried by 5.

## Methodology notes

Recorded because they affected intermediate readings and could otherwise look like findings:

1. `agents-inc build plugins --help` appeared to fail with `Command build plugins not found`. That
   was zsh not word-splitting an unquoted variable in the probe loop, so the whole string arrived as
   one argument. Run properly it exits 0. **No CLI defect.**
2. `build marketplace` refused the fixture repository with
   `Missing package.json at … build marketplace reads marketplace identity from package.json` —
   correct, and the fixture was given a `package.json`. **No CLI defect.**
3. The fixture source's `skill-rules.ts` names skills it does not ship, producing 2 386
   unresolved-slug warnings per load. That is a fixture limitation, and it is what made the band's
   overflow budgets drivable.

## Findings filed

The two findings above are recorded in this report and appended to
[`user-journeys.md`](../../packages/cli/.ai-docs/standards/e2e/user-journeys.md) as a dated findings
subsection, per the owner's instruction. No tracker rows were edited.

## Cleanup

Every scratch HOME and scratch project this pass created was removed — `home-global`, `proj-a`,
`proj-b`, `home-stack12`, `from-home`/`from-proj`, `refuse-home`/`refuse-proj`,
`mixed-home`/`mixed-proj`, `j14-home`, `j14b-home`, `j472-home`, `ctrl-home`, `mkt-home`,
`mkt2-home`, `mkt3-home`, `reval-home`, `author-home`, `author-repo`, `un-broken`, `rm-home`,
`rm2-home`, `smoke`, and the fixture sources. Nothing was written to the user's `~/.claude` or
`~/.claude-src` at any point, no deploy was run, and no git command that writes was executed.

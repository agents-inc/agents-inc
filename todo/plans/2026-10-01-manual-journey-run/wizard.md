# Lane `wizard`: manual journey results (2026-10-01)

I drove the real built CLI (`agents-inc` 0.165.0, `packages/cli/bin/run.js`) by hand in tmux, against the default
public marketplace `github:agents-inc/skills` (238 skills, 17 suggested stacks, fetched live into each scratch
HOME's `.cache`). I ran no test suites.

The lane directory is `$J/lanes/wizard`. Every journey ran under its own scratch HOME in that directory: `j1/home`,
`j2/home`, `j12/home`, `j16/home` and `j41/home` were fresh. `j3`, `j6`, `j9` and `j40` start from a `cp -a` of J1's
global install, because those journeys build on one. J4 and J15 continue in the `j3` tree.

**How each surface was read:**

- **`config.ts`:** loaded with `node --experimental-strip-types` by `inspect.mjs` and `roster.mjs`, and diffed as
  text before and after each run.
- **Compiled agents (surface 1):** `inspect.mjs` reads every `.claude/agents/*.md`. It parses the frontmatter `name`,
  the preloaded `skills:` and the `### <skill>` entries under `<skill_activation_protocol>`, and compares them with
  the config's `stack` entry for that agent.
- **Scopes a journey must not touch:** `snap.sh` takes a sha256 of every file in the tree, before and after.
- **Type check (surface 4):** `tc.sh` runs `tsc --noEmit --strict` (TypeScript 6.0.3) on `config.ts` where it sits.
  It then makes two probes in the lane directory, both importing that same `config-types.ts` by absolute path.
  - The first assigns `'bogus-*'` literals to `SkillId`, `AgentName`, `Category` and `Domain`.
  - The second is a copy of `config.ts` with an extra `{ id: 'bogus-skill-id' }` row.
  - Nothing is written into an installation.
- **Expected rosters:** taken from the fetched `.claude-plugin/catalog.json` → `suggestedStacks` (copied to
  `catalog.json`).

## Results

| journey | verdict | what you did                                                                                                                                                                                                                                                                                                                                                                                               | evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | PASS    | Fresh HOME, `cd $HOME; agents-inc init`. Picked **Next.js Full-Stack**, accepted the domains, Enter through the 6 domain grids. On Sources, Space+Down on all 23 rows (Local). Accepted the agents, confirmed.                                                                                                                                                                                             | Printed: `Install mode: Eject (local copy)`, `Copied 23 skills to .claude/skills/`, `Compiled 12 agents`, `EXIT=0`. **Surface 3:** 23 skills `{scope:'global', origin:'eject'}` and 12 agents in `j1/home/.agents-inc/claude/config.ts`. `roster.mjs nextjs-fullstack` → `agents==stack: true skills==stack: true`. **Surface 1:** 12 `.md` files, all `MATCH` (name plus preloaded/dynamic skills equal the config's stack). **Surface 4:** `tsc exit=0`; the probe gives 4× TS2322; the bogus row gives TS2322 (`Type '"bogus-skill-id"' is not assignable to type 'SkillId'`). Nothing was written outside HOME: `$LANE/work` and `j1/` hold only `home/`.                                                                                                                                                                                                |
| 2       | PASS    | Fresh HOME, `init` inside `j2/proj`. Picked **CLI Tool** (16×Down), defaults, all 10 sources Local. The agents step pre-ticked exactly 9. Confirmed.                                                                                                                                                                                                                                                       | `roster.mjs cli-ink-oclif` → true/true for the global AND the project `config.ts`. Exactly 10 skill dirs and 9 compiled agents in `j2/home/.claude`, all `MATCH`. The global config registers `projects: ['…/j2/proj']`. Both pairs type-check and reject the bogus literals. Per-agent assignments differ from the stack definition; see Observation O1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3       | PASS    | `j3/home` is a copy of J1's global. `init` in empty `j3/proj` opened the dashboard; picked Edit. On the Validation grid, Down×8 to **Zod**, Space (badge `G`, the default for a fresh pick), then `s` (badge `P`). Enter×6. On Sources the project Zod row is the only editable row (the globals show 🔒); Space. On Agents, `s` on Web Developer gave `[P][G]`. Confirmed.                                | Printed `+ Zod [P]`, `+ web-developer [P] (agent)`, `Copied 1 local skill(s)`, `1 agents rewritten, 12 unchanged`, `EXIT=0`. **Project:** `{ id: 'web-forms-zod-validation', scope: 'project', origin: 'eject' }`, `.claude/skills/web-forms-zod-validation/`, and `.claude/agents/web-developer.md` with `- web-forms-zod-validation` in its frontmatter. **Global:** sha diff shows only `config.ts` changed, and that change is the one added `projects:` line. `config-types.ts`, agents and skills are byte-identical. Both pairs type-check and reject.                                                                                                                                                                                                                                                                                                |
| 4       | PASS    | On the J3 tree: `edit` in the project, Right to **React**, `s` → `P G`. Sources: project React row Local. Confirmed. Second `edit`: Right to React, `s` → `G`. Confirmed.                                                                                                                                                                                                                                  | **G→P** printed `+ React [P]`, `EXIT=0`. The project config gained `{…react, scope:'global', excluded:true}` and `{…react, scope:'project'}`, plus `.claude/skills/web-framework-react` (`diff -r` against the global copy is identical). The global sha set is unchanged. **P→G** printed `- React [P]`, `EXIT=0`. The project config and project tree are byte-identical to the pre-J4 state (`diff` against the saved copy is empty), and the global sha set is still unchanged. Type-check passes at both scopes. The collapse session left the global React row editable on Sources; see Defect D1.                                                                                                                                                                                                                                                     |
| 6       | PASS    | `j6/home` is a copy of J1. Project A (via the `init` dashboard Edit): Zod `s`→P plus web-developer `s`→P. Project B (via the `init` dashboard Edit): Enter through everything with no changes. Then a global `edit` from `$HOME`: CLI Prompts → **Clack** Space, set its Sources row to Local, confirmed. Then `agents-inc compile` in project B.                                                          | **Project B:** printed `No changes made.`, `EXIT=0`. `projB/.agents-inc/claude/config.ts` lists all 23 global skills and 12 global agents, with no Zod and no project agents. `projB/.claude` does not exist. The global only gained the `projB` path in `projects`, and project A's sha set is unchanged. **Global edit:** printed `+ Clack [G]`, `Recompiled agents in 0 registered projects, 2 unchanged`. Both projects' `config.ts` gained `{ id: 'cli-prompts-clack', scope: 'global' }`, and both `config-types.ts` gained `'cli-prompts-clack'` and `'cli-prompts'`. All three pairs type-check and reject. **Compile in B:** `EXIT=0`; the home, A and B sha sets are all unchanged.                                                                                                                                                                |
| 9       | PASS    | `j9/home` is a copy of J1 (the stack picked by a real `init`). `edit` from `$HOME`, Testing category: Right×2 to the stack's **Vitest**, Space (deselect), Left×2 to **React Testing Library** (not in the stack), Space. Sources: RTL Local. Confirmed.                                                                                                                                                   | Printed `+ React Testing Library [G]`, `- Vitest [G]`, `Copied 1 local skill(s)`, `8 agents rewritten, 4 unchanged`, `EXIT=0`. `config.ts`: the vitest row and all 8 of its stack entries are gone; RTL is added and assigned to pm, reviewer, web-developer, web-researcher and web-tester (preloaded on web-tester, the slot vitest held). `config-types.ts`: `'web-testing-vitest'` became `'web-testing-react-testing-library'`. The `web-testing-vitest/` skill dir is removed. No compiled agent mentions vitest. All 12 agents `MATCH`. Type-check passes.                                                                                                                                                                                                                                                                                            |
| 12      | PASS    | Fresh HOME, `init` in `j12/proj`. Picked **Next.js AI SaaS** (13×Down), defaults (7 domains), all 26 sources Local, the 12 pre-ticked agents. Confirmed.                                                                                                                                                                                                                                                   | `roster.mjs nextjs-ai-saas` → true/true for both the global and the project config. 26 skill dirs and 12 compiled agents, all `MATCH`. `tc.sh` on `j12/home/.agents-inc/claude` and on `j12/proj/.agents-inc/claude`: `tsc exit=0`. The probe gives `TS2322` for SkillId, AgentName, Category and Domain, and the bogus config row gives `TS2322`, at both scopes. The project `config-types.ts` imports the global aliases from `'../../../home/.agents-inc/claude/config-types'` and extends them.                                                                                                                                                                                                                                                                                                                                                         |
| 15      | PASS    | On the J3/J4 tree, **project-only** Zod: `edit`, Down×8 to `P Zod`, `s` → `G Zod`. Sources showed `+ Zod` (Global, Local) and `- Zod` (Project). Confirmed. Then a second `edit`: `s` on `G Zod` → `P G Zod`, Local, confirmed.                                                                                                                                                                            | **P→G** printed `~ Zod ([P] → [G])`, `4 agents rewritten, 9 unchanged`, `EXIT=0`. The global config gained the Zod row plus `web-forms` stack entries on pm, reviewer, web-researcher and web-tester. Global `config-types.ts` gained `'web-forms-zod-validation'` and `'web-forms'`. The skill dir moved from project to global. The project's row became `scope:'global'`. Both sides type-check. **G→P** printed `+ Zod [P]`, `0 agents rewritten`. The project gained the `excluded:true` global row plus a project row, and the copy is back in `proj/.claude/skills`. The global sha set is unchanged. One gap is recorded as Observation O2.                                                                                                                                                                                                          |
| 16      | PASS    | Fresh HOME, `init` in `j16/proj` with **CLI Tool**: Zod `s`→P, all Local, then `s` on every one of the 9 ticked agents (each became `[P]`). Confirmed. Next `edit`: `s` on Web Researcher `[P]`→`[G]`, confirmed. Next `edit`: `s` on Web Researcher `[G]`→`[P][G]`, confirmed.                                                                                                                            | **Every agent at P (the row's "TO TEST" endpoint):** the standalone global `config.ts` is `agents: []` with **no `stack` key**, and `home/.claude/agents` does not exist. 9 agents are compiled under the project. **P→G** printed `~ web-researcher ([P] → [G])`, `EXIT=0`. The global gained `{ name:'web-researcher', scope:'global' }` and a stack WITHOUT `web-forms`. `home/.claude/agents/web-researcher.md` has no zod skill, the project copy is removed, and Zod stays assigned to the 8 project agents (so the warning correctly does not fire). **G→P** (additive) printed `+ web-researcher [P] (agent)`. The project gained the `excluded:true` global row and a project row; the project `web-researcher.md` frontmatter lists `web-forms-zod-validation`. The global sha set is unchanged. Type-check passes at both scopes after each step. |
| 40      | PASS    | `j40/home` is a copy of J1. A sibling dir `j40/bare` holds only `.claude/settings.json` and `README.md`. `cd bare; agents-inc edit`: the footer reads `D Labels   I Info` (no `S Scope`) and the frame says `Loaded 238 skills (global)`. Selected **Visual Regression**; `s` did nothing. Local, confirmed. Control: `init` in `bare` (dashboard Edit, no changes), then `agents-inc edit` again, Ctrl-C. | Printed `+ Visual Regression [G]`, `Copied 1 local skill(s)`, `5 agents rewritten, 7 unchanged`, `EXIT=0`. `bare` is byte-identical: the sha set and the `find` listing are both unchanged. The global `config.ts` gained the row plus 5 stack entries, `config-types.ts` gained `'web-testing-visual-regression'`, and `home/.claude/skills/web-testing-visual-regression/` exists. Nothing was added to `projects`. Type-check passes. In the control run the footer reads `D Labels   S Scope   I Info`, the frame says `Loaded 238 skills (project)`, and `bare/.agents-inc/claude/{config.ts,config-types.ts}` exist.                                                                                                                                                                                                                                   |
| 41      | PASS    | Fresh HOME, `init` → **Start from scratch** → default domains (Web, API, Mobile). Inspected the headers with `capture-pane -e`. Selected Elysia under API Framework. Pressed Enter on Web, API and Mobile while sampling 12 frames each. Ctrl-C.                                                                                                                                                           | The raw header is `ESC[38;2;255;255;255mESC[48;2;56;56;56m Framework (0 of 1) ESC[39mESC[49m`: the name and counter are adjacent with nothing between them. After Space it reads `API Framework (1 of 1)`. An unfocused header is `SQL Engine` + dim ` (0 of 1)`. Categories that are not pick-one show the name only (`Styling`, `Observability`). The sampled frames after each Enter contained no toast or warning text; Mobile went straight to `Customize skill sources`. `EXIT=4` (cancel), and `j41/home` holds only `.cache` and `.codex`.                                                                                                                                                                                                                                                                                                           |

**Counts:** 11 PASS, 0 FAIL, 0 PARTIAL, 0 BLOCKED, 0 N/A. Journeys 4 and 15 pass as written; D1 is a defect next to
their flow that the rows do not name.

## Defects

### D1: after `s` collapses a `[P][G]` skill, a project edit can change the GLOBAL install's mode

After the collapse, the Sources step paints the skill's **global** row without the 🔒 lock and puts the cursor on it.
Committing `Plugin` there makes the project edit rewrite the global install. The run then ends with exit 5.

The page object's own contract (`e2e/pages/steps/sources-step.ts`) says the opposite: a locked global install is
"skipped by ↓ and refused by SPACE, so a project edit's driver can no longer reach the global rows".

**Reproduction** (lane tree `j3`, saved as `j3-probe-before.tar`):

1. Create a global eject install, e.g. `init` from `$HOME` with Next.js Full-Stack and every source Local.
2. Create a project over it where a skill is a persisted `[P][G]` pair. Here, Zod was moved P→G and then G→P with `s`
   (journey 15). React G→P via `s` (journey 4) gives the same shape.
3. `cd <project>; agents-inc edit`.
4. Down×8 to `P  G  Zod`, then press `s`. The cell becomes `G  Zod`.
5. Press Enter 6 times. The Sources step shows the other global rows locked, but this one is not:
   ```
    Global     🔒 React                    Local             Plugin
               …
                 Zod                     ❯ Local             Plugin      <- no 🔒, focused
    Project    - Zod                       Local             Plugin
   ```
   In journey 4 the same thing happened with `  React   ❯ Local   Plugin` in the Global section.
6. Press Right, then Space. The row commits `Plugin`.
7. Press Enter. Confirm reads `Marketplace Agents Inc`, and Zod is listed under Global with no ⏏.
8. Press Enter. Output:
   ```
   Changes:
     ~ Zod (Eject → Agents Inc)
     - Zod [P]
   Switching 1 skill(s) to Plugin (native install)
     Installed web-forms-zod-validation@agents-inc
    ›   Warning: Failed to migrate plugin scope for web-forms-zod-validation: Plugin uninstall failed: ✘ Failed to uninstall plugin "web-forms-zod-validation@agents-inc": Plugin "web-forms-zod-validation@agents-inc" is installed in user scope, not project. Use --scope user to uninstall.
   5 agents rewritten, 8 unchanged
   Completed with 1 failure(s) — the changes above landed, these did not:
   EXIT=5
   ```

**What the global scope holds afterwards:**

- `~/.agents-inc/claude/config.ts`: `{ id: 'web-forms-zod-validation', scope: 'global', origin: 'agents-inc' }` (was
  `'eject'`) and `marketplaceName: 'agents-inc'`.
- `~/.claude/settings.json`: `enabledPlugins: { "web-forms-zod-validation@agents-inc": true }`.
- `~/.claude/plugins/installed_plugins.json`: `"scope": "user"`.
- 4 global agents rewritten.
- The old eject copy `~/.claude/skills/web-forms-zod-validation/` is **left on disk**.
- `agents-inc doctor` then reports `15 passed, 0 warnings, 0 errors`, including `No Orphans ✓`. It does not notice the
  stale eject directory.

**Expected:** a project edit must not be able to change a global install's mode. The global row should stay locked
after the collapse, as it was before the `s` press, so the run cannot end in a half-applied failure.

**Untested:** if the row is left on `Local` (as in journey 4), the collapse is clean.

## Observations (not counted against any row; for the owner to rule)

- **O1: on a first `init`, each sub-agent's stack is wider than the stack definition says.**
  - Seen in J1, J2 and J12. For `nextjs-fullstack` (`perAgent.mjs`):
    - `web-tester` is declared with 3 skills (vitest, playwright-e2e, msw) but gets 13. The extras are react, nextjs,
      scss-modules, zustand, react-query, vite, a11y, eslint-prettier, typescript-config and git-hooks.
    - `cli-tester` is declared `{}` and gets 4.
    - `reviewer` gets +9, `pm` +5, `web-researcher` +5, and `agent-summoner`, `codex-keeper` and `skill-summoner` +3
      each.
  - `nextjs-ai-saas` behaves the same way. `cli-ink-oclif` matches exactly, but only because every agent there
    declares all 10 skills.
  - The roster (which skills and which agents) is exact, so J2 and J12 hold.
  - The docblock in `src/cli/lib/configuration/default-stacks.ts` says "A stack declares WHICH skills each sub-agent
    gets", and the roster spec says the stack's keys state "what each of them carries".
  - Likely mechanism: on a first init `newlyAddedSkillIds` is every skill, so `shouldIncludeTriple` in
    `packages/compile/src/seed-to-config.ts` appends every skill the resolver targets to every stack agent.
- **O2: a skill moved P→G misses the global copy of an agent the project has also moved to project scope.**
  - Seen in J15. The project has web-developer as `[P][G]`; moving its project-only Zod to global (P→G) gives
    `web-forms` to global pm, reviewer, web-researcher and web-tester.
  - The **global web-developer** does not get it (`grep -c zod home/.claude/agents/web-developer.md` → 0), although
    web-developer is the natural owner of `web-forms` and the project's copy of web-developer has it preloaded.
  - Every other project that inherits the global web-developer therefore never sees the now-global skill.
- **O3: the product ignores `NO_COLOR`.**
  - With `NO_COLOR=1` (set by `env.sh`), every wizard frame and `agents-inc list` still emit 24-bit colour
    (`ESC[38;2;230;168;23mMode…`).
  - The e2e harness also sets `FORCE_COLOR=0` (`.ai-docs/standards/e2e/anti-patterns.md`), and that is what actually
    strips colour there.
  - A real `NO_COLOR` user also gets no text signal for which source mode (Local or Plugin) is committed; only bold
    versus dim shows it.
- **O4: a scope-change copy prints no copy line.**
  - A G→P skill move via `s` copies the skill into the project but prints no `Copied N local skill(s)` line.
  - J4 printed only `+ React [P]`. J3's fresh project pick did print the line.
  - `localSkillsCopied` is only called from the add and mode-switch paths, not from `applyScopeChanges` /
    `migrateLocalSkillScope`. This is cosmetic.

## Corrections

- **Journey 16's "TO TEST" endpoint:** the row says to read the standalone global `config.ts` for
  `splitConfigByScope`'s `{}` partition. The on-disk file can never show `{}`, because `generateConfigSource` omits an
  empty stack (the comment in `seed-to-config.ts` says so). With every sub-agent at project scope, the global file
  reads `agents: []` and has no `stack` key. That absence is the only observable form.
- **Journey 3's wording:** "a fresh pick during a project edit stays project-scoped" is easy to misread. The product
  (and the CLI-442 ruling in the spec) defaults a fresh pick to `G`, and it becomes project-scoped only after `s`.
- **The brief's rig:** `NO_COLOR=1` does not remove colour from the CLI (see O3). Plain `capture-pane -p` strips it
  anyway, so this blocked nothing. The suggested `-y 60` is too short to show the whole Web grid of a full stack; I
  used `-y 80` for J9 and J40.
- Nothing else in the brief or these eleven rows proved false.

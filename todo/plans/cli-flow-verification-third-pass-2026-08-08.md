# CLI flow verification, third pass — 2026-08-08

A third hand-driven pass over the real `agents-inc` binary, scored against
[`.ai-docs/standards/e2e/user-journeys.md`](../../packages/cli/.ai-docs/standards/e2e/user-journeys.md)
rather than against the eleven flows of the
[first pass](./cli-flow-verification-2026-08-08.md) and its
[re-run](./cli-flow-verification-rerun-2026-08-08.md). Every journey the canonical page marks
testable was executed — the eleven established flows **plus the six owner-named additions that had
never been hand-run** (12, 13/13a/13b, 14, 15, 16, 17). Only the parked journeys were skipped.

**Bottom line: 17 PASS / 0 FAIL / 4 skipped by ruling. No new issue found.**

The headline this pass exists to fix is closed: **`config-types.ts` — surface 4 — was asserted at
every mutating step**, at every scope, three different ways. It was clean in all 27 samples.

## How the pass was run

| Element         | Value                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| Binary          | `packages/cli/bin/run.js`, built once at 23:10 and not rebuilt (`bun run build`, 0.152.1) |
| Skills source   | `--source <skills-clone>` — the local clone; no network, no `dist/` staleness             |
| Stacks pinned   | `nextjs-fullstack` (journeys 1–11), `nextjs-t3-stack` (journey 12)                        |
| Scratch global  | `<scratchpad>/verify3/home-global` and five further scratch HOMEs — never the real `~`    |
| Scratch project | `<scratchpad>/verify3/proj-a`, `proj-b`, and four `--from` project dirs                   |
| Claude CLI      | present (2.1.224) — no journey was skipped for its absence; plugin legs are real installs |
| Config store    | a loopback stand-in for agentsinc.sh, mirroring `e2e/fixtures/seed-config-store.ts`       |
| Git             | no git command of any kind was run, read-only included                                    |

The pinned stack declares **23 distinct skill ids across 12 sub-agents**; the journey-12 stack
declares **13 skills across 10 sub-agents**, and that difference is what makes the selection
provable rather than assumed.

### How the four surfaces were asserted

Every mutating step was followed by the same battery at every scope it could have touched:

| Surface | What was asserted                                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `.claude/agents/*.md` — file list, per-file content hash, and the skill ids each agent names; a re-compile must leave every file byte-identical                                                                                                                      |
| 2       | the wizard frames and command stdout/stderr the user actually saw, captured through a real PTY                                                                                                                                                                       |
| 3       | `config.ts` — parsed entries (id, scope, source, excluded) plus a byte hash, and it must re-load through the CLI's own loader                                                                                                                                        |
| 4       | `config-types.ts` — **(a)** loads clean and is byte-identical after `compile` regenerates it, **(b)** `config.ts` type-checks against it, **(c)** the aliases still REJECT a bogus literal, **(d)** every id `config.ts` declares is a member of the `SkillId` union |

Surface 4(c) is the one that matters and the one text assertions miss: `SkillId`, `AgentName`,
`Domain` and `Category` were each assigned an impossible literal and `tsc` had to answer `TS2322`
on all four. A union that had degraded to `string` would pass every other check silently. For a
scope a journey must NOT touch, all four surfaces were asserted byte-identical instead of skipped.

---

## Results

| #   | Journey                                        | Steps                                                                                                          | Surfaces | Result | Evidence                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Global install from nothing, eject mode        | `init` at `HOME`=cwd → first stack → domains → 6 build tabs → Sources `l` → agents → confirm                   | 1,2,3,4  | PASS   | exit 0; 12 agents; 23 skill dirs; all 23 entries `source:"eject"`, `scope:"global"`; `SkillId` union = 23/23; config type-checks; all four aliases narrow; doctor `12 passed, 0 warnings, 0 errors`                                      |
| 2   | Stack installs exactly its declared roster     | set-diff the install against `defaultStacks[0]` itself                                                         | 1,2,3,4  | PASS   | `{missing:[],extra:[]}` on **all four** surfaces — agent files on disk, `config.agents`, `config.stack`, and the `AgentName`/`SkillId` unions in `config-types.ts` (12/12 agents, 23/23 skills)                                          |
| 3   | Project over an existing global install        | `init` in proj-a → dashboard → Edit → focus React Hook Form → Space → `s` → Sources `l` → confirm              | 1,2,3,4  | PASS   | Space paints `G  React Hook Form`, `s` repaints `P`; written `scope:"project"`; files in proj-a only; global tree/config-types byte-identical; project union gains the id, global union does not; only global write is the registry line |
| 4   | Scope toggle for a skill, G→P and P→G          | proj-a edit `s` on Vitest + React Query; second edit `s` on React Query                                        | 1,2,3,4  | PASS   | `G  Vitest` → `P  G  Vitest`, config gains a project entry + excluded global tombstone; P→G deletes the project copy and collapses to one global entry; global byte-identical both legs                                                  |
| 5   | Install-mode toggle eject↔plugin               | proj-a edit → Sources → `↓` `→` Space on the Vitest project row; second edit → Sources `l`                     | 1,2,3,4  | PASS   | `Switching 1 skill(s) to Plugin (native install)`, `Installing skill plugins...`, `Installed 1 skill plugins`; entry → `source:"agents-inc"`; local dir removed; `enabledPlugins` written; reverse restores files and prints no banner   |
| 6   | A second project inherits the global install   | `init` in proj-b → dashboard → Edit → pass through → Sources `l` → confirm                                     | 1,2,3,4  | PASS   | proj-b carries 23 global-scoped skills / 12 global agents, zero project-scoped; does **not** inherit proj-a's project-scoped skill — absent from both `config.ts` and the `SkillId` union; registry lists both projects                  |
| 7   | A global edit propagates to every project      | edit at `HOME` → select Zod → Sources `l` → confirm                                                            | 1,2,3,4  | PASS   | `5 agents rewritten, 7 unchanged`, matching exactly the 5 files naming Zod; each project gained one line; each project's own declarations byte-identical; **all three** `config-types.ts` unions gained Zod and still type-check         |
| 8   | Project edit removes the `[P]` half, contained | proj-a edit → Space on the project half of the Vitest pair → confirm                                           | 1,2,3,4  | PASS   | no toast; `P  G  Vitest` → `G  Vitest`; project copy deleted, global copy kept; global config, tree and `config-types.ts` byte-identical. Both guard probes still refuse — see below                                                     |
| 9   | A stack's picks are editable                   | edit at `HOME` → deselect Playwright (stack skill), select Storybook (non-stack) → Sources `l` → confirm       | 1,2,3,4  | PASS   | stack mentions 6→0 and 0→6; dir deleted / created; `5 agents rewritten, 7 unchanged`; roster unchanged at 12; the `SkillId` union loses one id and gains the other                                                                       |
| 10  | `update`                                       | `update` at `HOME` (eject); `update` in proj-a (marketplace-sourced skills present)                            | 1,2,3,4⁻ | PASS   | eject: `Ejected skills are yours to own…`, `No plugin marketplaces are configured`. marketplace: `Update complete! 1 marketplace refreshed.` Surface 4 in negative form — `config-types.ts` byte-identical in **both** scopes            |
| 11  | Generated-file integrity after every step      | the battery above, after every mutating step in the pass                                                       | 1,2,3,4  | PASS   | **27 four-surface samples, 27 clean.** `Refreshed config-types.ts` 27/27, byte-identical 27/27, `config.ts` re-loads 27/27, zero compile warnings, zero agent drift, doctor `12 passed, 0 warnings, 0 errors` in all 27                  |
| 12  | Stack selection yields a valid config          | `init` in a fresh HOME → **`↓` onto the second stack** → domains → build tabs → Sources `l` → agents → confirm | 1,2,3,4  | PASS   | cursor proven on `Next.js T3 Stack`; 10 agents / 13 skills land, exact on all four surfaces, and 2 of stack 0's agents are correctly absent; the generated pair type-checks and all four aliases narrow                                  |
| 13  | `init --from <id>` installs a shared config    | loopback store publishes a v3 payload; `init --from plain01` into a greenfield project                         | 1,2,3,4  | PASS   | exit 0; request `GET /configs/plain01` with `user-agent: agents-inc-cli`; both skills installed global-scoped, both agents written; `config-types.ts` written at both scopes, type-checks, all four aliases narrow                       |
| 13a | `init --from` refuses on an existing install   | the same command twice over the same dirs — the first is the control                                           | 1,2,3,4⁻ | PASS   | control exit 0, second exit 1: `An installation already exists at …/config.ts. Run 'npx agents-inc uninstall' first`. All four surfaces byte-identical at both scopes — nothing added, removed or changed                                |
| 13b | `init --from` including global-scoped content  | payload mixing a global skill on a global agent with a project skill on a project-pinned agent                 | 1,2,3,4  | PASS   | global gets `web-framework-react` + `web-developer.md` (model `opus`); project gets `web-testing-vitest` + `web-tester.md`; the project union carries both ids, the global union only the global one; both pairs type-check              |
| 14  | Deleting a global config                       | delete `~/.claude-src/config.ts` under a real install, then `doctor`, `compile`, `edit`, `init`                | 1,2,3,4  | PASS   | recovers rather than misreports — see below. `doctor` exit 1 `6 passed, 0 warnings, 1 error`; `compile`/`edit` exit 1 `No installation found`; `init` falls back to the wizard; **nothing on disk was written by any of them**           |
| 15  | Skill scope, both directions, both scopes      | journey 4's two legs, plus a third leg at the global scope                                                     | 1,2,3,4  | PASS   | both directions proved in journey 4. At global scope the affordance is correctly absent: no `Scope` hotkey in the footer, `s` is inert, and the global tree, `config.ts` and `config-types.ts` are byte-identical after the attempt      |
| 16  | Sub-agent scope, both directions               | proj-a edit → agents step → `s` on Web Researcher; then a second edit toggling it back                         | 1,2,3,4  | PASS   | `[G]` → `[P][G]`, `web-researcher.md` written into the project, config gains a project entry + excluded global tombstone, `1 agents rewritten, 12 unchanged`; the reverse removes the file and collapses the pair; global untouched      |
| 17  | Install mode at **both** scopes                | global edit switches MSW (global) to plugin; project edit switches React Hook Form (project) to plugin         | 1,2,3,4  | PASS   | both land as `source:"agents-inc"` at their own scope. **No contamination:** no other global skill changed, no project-scoped skill changed on the global leg, and the global scope was byte-identical across the project leg            |

`4⁻` marks surface 4 asserted in its negative form — the journey must leave `config-types.ts`
untouched, and byte-identity is the assertion.

### Skipped, by owner ruling

`import skill`, `new agent` / `new skill` / `new marketplace`, the filter-incompatible `F` hotkey,
and the marketplace-sources overlay. The canonical page marks all four PARKED; nothing was driven
and nothing is claimed about them.

---

## The freshly ruled behaviours, each re-checked

**The stack's declared roster, exactly.** Journeys 2 and 12. Two different stacks, each installing
its own declared list and nothing else, on all four surfaces. Journey 12 is the stronger of the
two because the roster it produced (10 agents) could not have come from the default.

**Honest `rewritten` / `unchanged` summaries.** Every summary in the pass was cross-checked against
the filesystem diff and matched exactly: `0 agents rewritten, 12 unchanged` on scope toggles that
genuinely write nothing, `1 rewritten, 12 unchanged` when one project agent file appears,
`5 rewritten, 7 unchanged` on the Zod and Storybook edits (5 files named the skill both times),
`8 rewritten, 4 unchanged` when MSW moved to plugin. The propagated form reads
`Recompiled agents in 0 registered projects, 2 unchanged`.

**Banner parity.** The eject→plugin flip prints `Switching 1 skill(s) to Plugin (native install)`,
`Installing skill plugins...` and `Installed 1 skill plugins` from `edit`, at both scopes
(journeys 5 and 17). The reverse direction correctly prints the Eject line and no plugin banner.

**Contained project compile.** A `compile` from proj-a printed only `Compiling project agents...`
and `✓ Project compile complete!` — no global pass, no propagation line. A snapshot of the scratch
HOME **and** proj-b, taken before and after and including `.claude-src/`, came back with zero files
added, removed or changed. It also prints the hint naming where the 12 global agents are compiled.

**The narrowed `[P][G]` guard, with the exclusive-swap probe.** Journey 8's main leg removes the
project half cleanly. Both refusals still stand:

- **Inherited-global deselect** — Space on Vitest once it is back to a plain inherited global entry
  raises `Global skills cannot be changed from project scope`, leaves the cell `G  Vitest`, and
  leaves `config.ts` byte-identical.
- **Exclusive swap** — in the exclusive, required Framework category, selecting `Vue` (which would
  implicitly drop the globally installed `React`) raises the same toast, leaves `G  React` and
  `Vue` both unchanged, and leaves `config.ts` byte-identical.

**Malformed metadata is a hard error under `compile`.** A skill's `metadata.yaml` was replaced with
unparseable YAML. `compile` exited 1, named the skill, named the full path, quoted the parser's own
reason (`Nested mappings are not allowed in compact mappings at line 1, column 25`), explained why
it refuses rather than skipping, and did **not** print a completion line. The agents directory and
`.claude-src/` were byte-identical across the refused run. Restoring the file returned `compile` to
exit 0.

## Journey 14 in full — the CLI recovers rather than misreports

With 24 skill directories and 12 compiled agents still on disk and only `config.ts` removed:

- **`doctor`** exits 1 and says `Global config not found at …/config.ts`, marks the five
  config-dependent checks `Skipped (config invalid)` rather than passing or failing them silently,
  summarises `6 passed, 0 warnings, 1 error`, and tips `Run 'npx agents-inc init' to create or fix
configuration`.
- **`compile`** and **`edit`** both exit 1 with
  `No installation found. Run 'npx agents-inc init' first to set up Agents Inc.`
- **`init`** falls back to the from-scratch wizard (stack step) rather than showing a dashboard for
  an installation whose config no longer exists.
- **Nothing was written.** `.claude/` and `.claude-src/` were byte-identical after all five
  commands, and `config.ts` was not silently recreated.

**Observation, not a failure.** The registered project still reports `12 passed, 0 warnings, 0
errors`. Its own `config.ts` mirrors the inherited entries and every skill and agent file it needs
is still on disk at `HOME`, so nothing it checks is actually broken — this is the presence-based
design the agent-free-skills ruling already endorsed, and the scope where the deletion happened is
the one that reports the error.

---

## Delta summary vs the re-run

| Item                           | Re-run (2026-08-08)            | This third pass                                                                                         |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Scope of the pass              | 11 flows                       | **17 journeys** — the canonical list, minus the 4 parked                                                |
| Score                          | 11 PASS / 0 FAIL               | **17 PASS / 0 FAIL**                                                                                    |
| Surface 4 (`config-types.ts`)  | byte-identity after regen only | **byte-identity + config type-checks + aliases still reject + union coherence**, at every mutating step |
| Surface 4 samples              | 13 (regen diff only)           | **27 full batteries, all clean**                                                                        |
| Journeys never hand-run before | —                              | **12, 13, 13a, 13b, 14, 16, 17** — all PASS on first run                                                |
| Stack selection proved by      | the default stack only         | a **non-default** stack (10 agents / 13 skills), cursor proven on it                                    |
| `init --from`                  | not run                        | 3 variants: greenfield, refusal-with-control, mixed-scope payload                                       |
| Deleting a global config       | not run                        | run; refuses and explains on 3 commands, writes nothing                                                 |
| Sub-agent scope toggle         | not run                        | run, both directions, with the project agent file appearing/disappearing                                |
| Install mode at both scopes    | not run                        | run; no cross-scope contamination in either direction                                                   |
| `doctor` invocations           | 19, all clean                  | **31** — 29 clean, 2 in the deliberately broken state of journey 14                                     |
| Type-checked config pairs      | 0                              | **10 distinct scopes**, every one exit 0 with all four aliases narrowing                                |
| New issues found               | none                           | **none**                                                                                                |

Counts that moved for a benign reason: journey 9 rewrites 5 agents rather than the re-run's 8
because its subject changed — MSW is plugin-sourced in this pass after journey 17, so Playwright
(still eject, equally stack-declared) was the equivalent subject, and it is carried by 5 agents.

## Methodology corrections made during the pass

Recorded because they affected intermediate readings and could otherwise look like findings:

1. The first journey-1 run imported `ROOT` from the pass-2 library and therefore ran in the pass-2
   scratch directory. The install itself was a genuine from-scratch one, but it was re-run in the
   pass-3 root before anything was scored.
2. The narrowing probe initially matched `tsc` diagnostics by variable name, then by alias name.
   Both under-reported: `tsc` names the _type_, and when an alias narrows to a single member it
   prints the resolved literal (`not assignable to type '"web"'`) instead of the alias. That is a
   _harder_ narrowing being scored as a failure. The probe now keys on the diagnostic's line
   number, and every scope was re-verified afterwards — all four aliases narrow at all 10 scopes.

No CLI behaviour was involved in either; both were defects in this pass's own instrumentation.

## New issues

**None.** Every journey passed on every surface it owes, and no behaviour diverged from the
rulings. Nothing was fixed during this pass, in line with the standing instruction that a new
issue is compiled rather than repaired.

One environment observation, outside the journeys: the mandated `bun run build` at the repository
root exits 1 because `apps/editor` fails to load its Vite config without `VITE_API_URL`
(`Invalid environment: VITE_API_URL … See apps/editor/.env.example`). `packages/cli` builds
successfully within the same run, which is what this pass drove. Symptom: `turbo build` reports
`Failed: editor#build`. Reproduction: `bun run build` at the root with no editor `.env`. Suspected
mechanism: the editor's config-time env validation has no default and no `.env` is present in a
bare checkout. Not a CLI defect and not filed as a finding.

## Findings filed

None.

## Cleanup

Every scratch HOME and every scratch project directory created by this pass was removed —
`home-global`, `home-stack12`, `from-home`, `from-refuse-home`, `from-mixed-home`, `proj-a`,
`proj-b`, `from-proj`, `from-refuse-proj`, `from-mixed-proj` — along with the pass-2 scratch tree.
Nothing was written to the user's `~/.claude` or `~/.claude-src` at any point, no deploy was run,
and no git command of any kind was executed.

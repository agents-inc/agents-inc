# CLI flow verification, re-run — 2026-08-08

A second hand-driven pass over the real `agents-inc` binary, run against the **fixed** build and
scored against the owner rulings that close
[`cli-flow-verification-2026-08-08.md`](./cli-flow-verification-2026-08-08.md). Same eleven flows,
same method: `packages/cli/bin/run.js` built once at the start, driven through a real PTY the way a
user drives it, with `HOME` pointed at a throwaway directory for every spawn. The user's own
`~/.claude` was never read or written, and no git command of any kind was run.

**Bottom line: 11 PASS / 0 FAIL / 0 SKIPPED.** All three failures from the first pass are closed,
and all four downgraded anomalies now behave the way the rulings specify. No new issue was found.

## How the pass was run

| Element         | Value                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| Binary          | `packages/cli/bin/run.js`, built once at 15:11, not rebuilt mid-pass (0.152.1)        |
| Skills source   | `--source <skills-clone>` — the local clone; no network, no `dist/` staleness         |
| Stack pinned    | `nextjs-fullstack` — the first entry of `defaultStacks` in `default-stacks.ts`        |
| Scratch global  | `<scratchpad>/verify/home-global` — `HOME` for every spawn                            |
| Scratch project | `<scratchpad>/verify/proj-a`, `<scratchpad>/verify/proj-b`                            |
| Claude CLI      | present (2.1.224) — no flow was skipped for its absence                               |
| Grid navigation | closed-loop, ported from `e2e/pages/steps/build-step.ts` (Tab-walk, then arrow-right) |

The pinned stack declares **23 distinct skill ids** across **12 sub-agents** (`web-developer`,
`api-developer`, `cli-developer`, `reviewer`, `web-tester`, `pm`, `web-researcher`, `api-researcher`,
`agent-summoner`, `skill-summoner`, `codex-keeper`, `cli-tester`).

What the rulings changed about how a flow is scored is noted per row. Two flows are driven
differently from the first pass because a ruling redefined the behaviour under test — flow 3 now
presses `s` after the fresh pick, and flow 8's Space on the `[P]` half is now expected to succeed.
Flow 10's marketplace half needed a plugin-sourced skill re-established first, because flow 5's
revert leaves proj-a all-eject.

Every mutating step was followed by `doctor` in the affected scope and by a generated-file re-check:
load `config.ts` through the CLI's own loader, run `compile` (the only writer of `config-types.ts`),
and compare byte-for-byte against what the files held before.

---

## Results

| #   | Flow                            | Steps (one line)                                                                                               | Was → now       | Result | Evidence                                                                                                                                                                                                                                                                                                             | Generated files (flow 11)                                             | Notes                                                                                                                                                              |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Global init, eject mode         | `init` at `HOME`=cwd → first stack → all domains → Enter through 6 build tabs → Sources `l` → agents → confirm | PASS → **PASS** | PASS   | exit 0; **12** agents in `~/.claude/agents/`; 23 dirs in `~/.claude/skills/`; `config.ts` + `config-types.ts` written; all 23 entries `source: "eject"`, `scope: "global"`; doctor exit 0                                                                                                                            | loads clean; `config-types.ts` byte-identical after regen; 0 warnings | `Summary: 12 passed, 0 warnings, 0 errors`. Agent count is 12, not the first pass's 11 — see row 2                                                                 |
| 2   | Stack correctness               | list-diff installed skills + sub-agents against `defaultStacks[0]`                                             | FAIL → **PASS** | PASS   | agents **12/12 exact**, `{missing: [], extra: []}` in all three surfaces — `config.agents`, `config.stack` and `~/.claude/agents/`; skills 23/23 exact in `config.skills` and on disk                                                                                                                                | n/a (read-only step)                                                  | the three stack-only agents (`agent-summoner`, `codex-keeper`, `skill-summoner`) are present; the two domain-only extras (`api-tester`, `cli-researcher`) are gone |
| 3   | Project init over global        | `init` in proj-a → dashboard → Edit → focus "React Hook Form" → Space → **`s`** → Sources `l` → confirm        | FAIL → **PASS** | PASS   | Space paints `G  React Hook Form`, `s` repaints `P  React Hook Form`; written `scope: "project"`; files land in `proj-a/.claude/skills/`; **absent** from `~/.claude/skills/`; global `.claude` tree byte-identical; proj-a = 23 global + 1 project                                                                  | loads clean; byte-identical after regen; 0 warnings                   | real dual scope; the only global `config.ts` change is the `projects` registry gaining proj-a                                                                      |
| 4   | Scope toggle under dual scope   | proj-a edit: `s` on Vitest and React Query (G→P); a second edit `s` on React Query (P→G)                       | PASS → **PASS** | PASS   | G→P: `P  G  Vitest`, both copied into `proj-a/.claude/skills/`, config gains a `project` entry + an excluded `global` tombstone, global untouched. P→G: project copy deleted, pair collapses to one `global` entry                                                                                                   | loads clean both sides; byte-identical after regen; 0 warnings        | ran on Vitest/React Query because flow 3's React Hook Form is now genuinely project-owned, not a `[P][G]` pair                                                     |
| 5   | Install-mode toggle             | proj-a edit → Sources → `↓` `→` Space on the Vitest project row (eject→plugin); second edit → Sources `l`      | PASS → **PASS** | PASS   | `Switching 1 skill(s) to Plugin (native install)`, **`Installing skill plugins...`** and **`Installed 1 skill plugins`** all printed; local dir removed; proj-a `settings.json` gains `enabledPlugins`, scratch-HOME gains `extraKnownMarketplaces: agents-inc`; reverse restores files and empties `enabledPlugins` | loads clean; byte-identical after regen                               | banner parity now holds — anomaly D closed; real `claude plugin install` against the scratch HOME                                                                  |
| 6   | Second project inherits global  | `init` in proj-b → dashboard → Edit → pass through → Sources `l` → confirm                                     | PASS → **PASS** | PASS   | proj-b carries **23** global-scoped skills / **12** global agents; zero project-scoped entries; global `projects` registry lists proj-a **and** proj-b                                                                                                                                                               | loads clean; byte-identical after regen                               | proj-b correctly does **not** inherit proj-a's project-scoped React Hook Form; its own `agents/` and `skills/` are absent — every agent is global                  |
| 7   | Global edit propagates          | edit at `HOME` → select "Zod" → Sources `l` → confirm                                                          | PASS → **PASS** | PASS   | `5 agents rewritten, 7 unchanged`; all 5 rewritten files name `web-forms-zod-validation`; each project `config.ts` gained exactly one line (delta = 1 each); each project's own declarations byte-identical; project agent dirs untouched                                                                            | loads clean in all three scopes; byte-identical after regen           | scope hotkey correctly hidden in a global edit; propagation line reads `Recompiled agents in 0 registered projects, 2 unchanged`                                   |
| 8   | Project edit removes `[P]` half | proj-a edit → Space on Vitest (the project half of a `[P][G]` pair) → confirm                                  | FAIL → **PASS** | PASS   | no toast; cell goes `P  G  Vitest` → `G  Vitest`; pair collapses to a single active inherited `global` entry; `proj-a/.claude/skills/web-testing-vitest/` deleted, the global copy kept; global tree and global `config.ts` byte-identical                                                                           | loads clean; byte-identical after regen                               | clean round trip back to the pre-flow-4 state. Both guard probes still refuse — see below                                                                          |
| 9   | Stack editability               | edit at `HOME` → deselect "MSW" (stack skill), select "Storybook" (non-stack) → Sources `l` → confirm          | PASS → **PASS** | PASS   | config loses `web-mocks-msw`, gains `web-tooling-storybook`; `~/.claude/skills/web-mocks-msw/` deleted, storybook copied in; `config.stack` MSW mentions 9→0, Storybook 0→6; `8 agents rewritten, 4 unchanged`                                                                                                       | loads clean; byte-identical after regen                               | exactly the requested delta — no agent added or removed. 8 rewritten (not the first pass's 5) because the roster is now the full 12                                |
| 10  | `update` semantics              | `update` at `HOME` (eject install); `update` in proj-a with a marketplace-sourced skill                        | PASS → **PASS** | PASS   | eject: `Ejected skills are yours to own…`, `No plugin marketplaces are configured`, every file byte-identical. marketplace: `Updated marketplace agents-inc`, `Update complete! 1 marketplace refreshed.`, skills/agents/config byte-identical in **both** proj-a and global                                         | n/a (`update` writes no generated file)                               | proj-a's marketplace skill had to be re-established first: flow 5's revert had left it all-eject                                                                   |

Flow 11 has no row of its own by design. It was sampled after **every** mutating step above — **13
scopes in total** — and passed each time: `config.ts` loaded through the CLI's own loader without
error, `compile` reported `Refreshed config-types.ts` in 13/13 samples and left the file
byte-identical, `config.ts` itself came back byte-identical, no compiled agent changed under a
re-compile, and `compile` emitted no warning. `doctor` reported
`Summary: 12 passed, 0 warnings, 0 errors` with exit 0 in **all 19** invocations across the pass.

---

## The three failures, re-checked

Each first-pass failure was re-run by its own minimal reproduction, adjusted only where a ruling
redefined the expected behaviour.

### Failure 1 (flow 2) — stack roster — CLOSED

The stack's declared list now wins outright. `init` on `nextjs-fullstack` installs all 12 declared
sub-agents; `agent-summoner`, `codex-keeper` and `skill-summoner` are present in `config.agents`, in
the rewritten `config.stack` and as files in `~/.claude/agents/`, and the two domain-derived extras
(`api-tester`, `cli-researcher`) are absent from all three. The set diff against
`Object.keys(defaultStacks[0].agents)` is `{missing: [], extra: []}` on every surface.

The mechanism named in the first pass is the one that moved: `preselectAgentsFromDomains` in
`src/cli/stores/wizard-store.ts` now returns state untouched when `selectedStackId` is set, so the
Sources step's unconditional call can no longer overwrite the stack's roster. Domain derivation
serves the from-scratch path only, exactly as the ruling specifies. Skills were never affected and
still match 23/23.

### Failure 2 (flow 3) — fresh pick in a project edit — CLOSED

A newly-selected skill in a project-scope edit still **defaults** to global — Space paints
`G  React Hook Form` — and the scope toggle now overrides it: one press of `s` repaints the cell
`P  React Hook Form`, and the skill is written `{ id, scope: "project", source: "eject" }`. Its
files land in `proj-a/.claude/skills/` and nowhere else; `~/.claude/skills/web-forms-react-hook-form`
does not exist; the global `.claude` tree is byte-identical across the whole session. That is the
"defaults to global but overridable" the ruling asked for, and it produces real dual scope: proj-a
ends the session declaring 23 global-scoped skills and 1 project-scoped one, and the confirm screen
groups them under separate `Project` / `Global` headings.

The only global write is the `projects` registry line gaining proj-a — correct project registration,
not a content mutation.

### Failure 3 (flow 8) — the `[P]` half of a `[P][G]` pair — CLOSED

Space on the project half of a persisted `[P][G]` pair now works. No toast fires, the cell repaints
`P  G  Vitest` → `G  Vitest`, the project copy is deleted from `proj-a/.claude/skills/`, the global
copy is kept, and the pair collapses to a single active inherited `global` entry — a clean round trip
back to the state before flow 4 created the pair. Global config and global tree are byte-identical.

The guard narrowed rather than disappeared, and both halves of that were probed:

- **Inherited-global deselect still refused.** Space on Vitest once it is back to a plain inherited
  global entry raises `Global skills cannot be changed from project scope`, leaves the cell at
  `G  Vitest`, and leaves proj-a's `config.ts` byte-identical. The by-design rule stands.
- **Exclusive-swap refusal still correct.** In the exclusive, required Framework category, selecting
  `Vue` — which would implicitly drop the globally-installed `React` — raises the same toast, leaves
  both cells unchanged (`G  React` stays, `Vue` stays unselected), and leaves `config.ts`
  byte-identical. A radio swap still cannot tombstone a global install by the back door.

---

## The four downgraded anomalies, re-checked

**A. Project compile is now fully contained.** A `compile` issued from proj-a prints only
`Compiling project agents...` and `✓ Project compile complete!` — no _Global_ pass, no
`Recompiled 11 global agents`, no propagation line. A dedicated probe snapshotted `.claude/` and
`.claude-src/` for the scratch HOME **and** proj-b before and after: both came back with zero files
added, removed or changed, so `config-types.ts` outside the project was not rewritten either. The
command instead prints a hint that the 12 agents are global-scoped and names where to recompile them.
Containment is the contract now, as the ruling requires.

**B. The recompile summary is a real signal.** Every summary observed this pass distinguishes files
written from files left alone, computed from an actual before/after comparison:
`0 agents rewritten, 12 unchanged` on the no-op scope toggle that used to print `Recompiled 11
agents`; `5 agents rewritten, 7 unchanged` on flow 7's global Zod edit; `8 agents rewritten, 4
unchanged` on flow 9's MSW→Storybook swap. Each count was cross-checked against the filesystem diff
and matched exactly. The propagated form carries the same shape —
`Recompiled agents in 0 registered projects, 2 unchanged`.

**C. Agent-free skills are valid, and doctor stays silent.** proj-a ends the pass with a
project-scoped skill that no agent can reach, because every agent in this installation is
global-scoped. `doctor` reports `12 passed, 0 warnings, 0 errors`, which is the intended behaviour
per the ruling: an installed skill is loadable by Claude Code directly, so no agent assignment is
required for it to be valid. Nothing here is stranded unintentionally now that Failure 1 is closed —
the full 12-agent roster is offered.

**D. Plugin banners reach the edit path.** The eject→plugin flip in flow 5 printed
`Switching 1 skill(s) to Plugin (native install)`, `Installing skill plugins...` and
`Installed 1 skill plugins`. Both strings the first pass found missing from `edit` are present, so a
spec anchoring on them is no longer asserting an `init`-only contract. The reverse direction
correctly prints `Switching 1 skill(s) to Eject (copy to .claude/skills/)` and no plugin banner,
since no plugin is installed on that leg.

---

## Delta summary

| Item                                 | First pass (2026-08-08)                                | This re-run                                                   |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------- |
| Score                                | 7 PASS / 3 FAIL                                        | **11 PASS / 0 FAIL**                                          |
| Flow 2 — stack roster                | FAIL: 11 agents, 3 missing / 2 extra                   | PASS: 12/12 exact on all three surfaces                       |
| Flow 3 — fresh pick in project edit  | FAIL: written `scope: "global"`, landed in `~/.claude` | PASS: defaults `[G]`, `s` overrides to `[P]`, real dual scope |
| Flow 8 — `[P]` half of `[P][G]`      | FAIL: refused, nothing removable                       | PASS: removed cleanly; both guard probes still refuse         |
| Anomaly A — compile blast radius     | project compile wrote global + other projects          | contained: zero files touched outside the project             |
| Anomaly B — recompile summary        | `Recompiled 11 agents` on a no-op                      | `N rewritten, M unchanged`, verified against the diff         |
| Anomaly C — agent-free skills        | flagged as a gap                                       | valid by ruling; doctor silent by design                      |
| Anomaly D — plugin banners on edit   | both strings missing                                   | both printed                                                  |
| Agents installed by the pinned stack | 11                                                     | 12                                                            |
| `doctor` invocations                 | 16, all clean                                          | **19, all clean** (`12 passed, 0 warnings, 0 errors`)         |
| Flow 11 generated-file samples       | 11, all clean                                          | **13, all clean** (13/13 `Refreshed config-types.ts`)         |
| New issues found                     | —                                                      | **none**                                                      |

Counts that changed for a benign reason: flow 9 rewrites 8 agents rather than 5, and flow 6 sees 23
inherited skills rather than 24, because the roster is now the full 12 and because flow 3's skill is
correctly project-scoped instead of leaking into the global install. Both follow from the fixes.

## Findings filed

None. Every first-pass failure is closed and no new issue surfaced, so there is nothing to file. The
three open findings from the first pass are the ones this run clears:

- `2026-08-08-a-project-edit-cannot-remove-a-skill-it-owns-when-a-global-install-backs-it.md`

## Cleanup

All scratch `HOME` directories and both scratch project directories were removed at the end of the
pass. Nothing was written to the user's `~/.claude` or `~/.claude-src` at any point — its mtime was
unchanged across the run — and no git command of any kind was run.

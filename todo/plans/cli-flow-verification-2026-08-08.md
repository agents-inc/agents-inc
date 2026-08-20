# CLI flow verification — 2026-08-08

A hand-driven pass over the real `agents-inc` binary, not a test-suite run. Every step below was
executed against `packages/cli/bin/run.js` built once at the start of the pass (`bun run build`,
0.152.1), driven through a real PTY the way a user drives it, with `HOME` pointed at a throwaway
directory for every spawn. The user's own `~/.claude` was never read or written.

**Bottom line: 7 PASS / 3 FAIL / 0 SKIPPED.** The generated-file column (flow 11) passed in every
one of the 11 states it was sampled in.

## How the pass was run

| Element         | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Binary          | `packages/cli/bin/run.js`, built once at 11:01, not rebuilt mid-pass              |
| Skills source   | `--source /home/vince/dev/skills` (local clone; no network, no `dist/` staleness) |
| Stack pinned    | `nextjs-fullstack` — the first entry of `defaultStacks` in `default-stacks.ts`    |
| Scratch global  | `<scratchpad>/verify/home-global` — `HOME` for every spawn                        |
| Scratch project | `<scratchpad>/verify/proj-a`, `<scratchpad>/verify/proj-b`                        |
| Claude CLI      | present (2.1.224) — no flow was skipped for its absence                           |
| Repeat runs     | three full passes; the three failures reproduced identically in all three         |

The pinned stack declares **23 distinct skill ids** across **12 sub-agents**
(`web-developer`, `api-developer`, `cli-developer`, `reviewer`, `web-tester`, `pm`,
`web-researcher`, `api-researcher`, `agent-summoner`, `skill-summoner`, `codex-keeper`,
`cli-tester`).

Every mutating step was followed by `doctor` in the affected scope, and by a generated-file
re-check: load `config.ts` through the CLI's own loader, then run `compile` (the only writer of
`config-types.ts`) and compare the file byte-for-byte against what it held before.

---

## Results

| #   | Flow                           | Steps (one line)                                                                                                | Result | Evidence                                                                                                                                                                                                                                                                | Generated files (flow 11)                                             | Notes                                                                                                            |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Global init, eject mode        | `init` at `HOME`=cwd → first stack → all domains → Sources `l` (all eject) → agents defaults → confirm          | PASS   | exit 0; 11 agents in `~/.claude/agents/`; 23 dirs in `~/.claude/skills/`; `config.ts` + `config-types.ts` written; all 23 entries `source: "eject"`, `scope: "global"`; doctor exit 0                                                                                   | loads clean; `config-types.ts` byte-identical after regen; 0 warnings | doctor: `Summary: 12 passed, 0 warnings, 0 errors`                                                               |
| 2   | Stack correctness              | list-diff installed skills + sub-agents against `defaultStacks[0]`                                              | FAIL   | skills 23/23 exact match (config **and** `~/.claude/skills/`); agents differ: missing `agent-summoner`, `codex-keeper`, `skill-summoner`; extra `api-tester`, `cli-researcher`                                                                                          | n/a (read-only step)                                                  | the same 3-missing/2-extra delta appears in `config.agents`, in `config.stack`, and on disk                      |
| 3   | Project init over global       | `init` in proj-a → dashboard → Edit → select "React Hook Form" → Sources `l` → confirm                          | FAIL   | skill written `scope: "global"`; files landed in `~/.claude/skills/`; proj-a `.claude/skills/` and `.claude/agents/` stayed **empty**; global `config.ts` rewritten; 5 global agents rewritten                                                                          | loads clean; byte-identical after regen; 0 warnings                   | dual scope never came into being — a project-directory edit mutated the global install                           |
| 4   | Scope toggle under dual scope  | proj-a edit: `s` on React Hook Form and on Vitest (G→P); then a second edit `s` on React Hook Form (P→G)        | PASS   | G→P: both skills copied into `proj-a/.claude/skills/`, config gains `project` entry + excluded `global` tombstone, global untouched. P→G: project copy deleted, pair collapses to one `global` entry                                                                    | loads clean both sides; byte-identical after regen; 0 warnings        | the P→G leg needed its own session — after flow 3 nothing was project-scoped to move (see FAIL 3)                |
| 5   | Install-mode toggle            | proj-a edit → Sources → `→` + Space on the project row (eject→plugin); second edit → Sources `l` (plugin→eject) | PASS   | `~ Vitest (Eject → Agents Inc)`, local dir removed, `proj-a/.claude/settings.json` gains `enabledPlugins`, scratch-HOME `settings.json` gains `extraKnownMarketplaces: agents-inc`; reverse restores files and empties `enabledPlugins`                                 | loads clean; byte-identical after regen                               | real `claude plugin install` against the scratch HOME; no orphan dirs or registry entries in either direction    |
| 6   | Second project inherits global | `init` in proj-b → dashboard → Edit → pass through → Sources `l` → confirm                                      | PASS   | proj-b config carries 24 global-scoped skills / 11 global agents; global `projects` registry lists proj-a **and** proj-b; the agents that serve proj-b (the global ones) name the global skills                                                                         | loads clean; byte-identical after regen                               | proj-b has zero files in its own `agents/` — correct: every agent is global-scoped                               |
| 7   | Global edit propagates         | edit at `HOME` → select "Zod" → Sources `l` → confirm                                                           | PASS   | `Recompiled agents in 2 registered project(s)`; 5 global agents rewritten and all 5 now name `web-forms-zod-validation`; each project `config.ts` gained exactly one line — the inherited global mirror entry                                                           | loads clean in all three scopes; byte-identical after regen           | the projects' own declarations were not touched; only the inlined global view moved                              |
| 8   | Project edit stays local       | proj-a edit → Space on Vitest (the project-scoped half of a `[P][G]` pair) → confirm                            | FAIL   | toast `Global skills cannot be changed from project scope`; wizard exits `No changes made.`; proj-a config, proj-a agents, global and proj-b all byte-identical                                                                                                         | loads clean; byte-identical after regen                               | the negative half held; the positive half is unreachable — nothing in this install can be removed from a project |
| 9   | Stack editability              | edit at `HOME` → deselect "MSW" (stack skill), select "Storybook" (non-stack) → Sources `l` → confirm           | PASS   | config loses `web-mocks-msw`, gains `web-tooling-storybook`; `~/.claude/skills/web-mocks-msw/` deleted, storybook copied in; `config.stack` surgically updated on the same 5 agents; 5 agent files rewritten                                                            | loads clean; byte-identical after regen                               | exactly the requested delta, nothing else                                                                        |
| 10  | `update` semantics             | `update` at `HOME` (eject install); `update` in proj-a (marketplace configured, claude present)                 | PASS   | eject: `Ejected skills are yours to own…`, `No plugin marketplaces are configured`, every skill file byte-identical, `config.ts` unchanged. marketplace: `Updated marketplace agents-inc`, `Update complete! 1 marketplace refreshed`, skills and agents byte-identical | n/a (`update` writes no generated file)                               | both halves exercised; nothing was faked                                                                         |

Flow 11 has no row of its own by design. It was sampled after **every** mutating step above — 11
scopes in total — and passed each time: `config.ts` loaded through `loadProjectConfigFromDir`
without error, `compile` reported `Refreshed config-types.ts` and left the file byte-identical,
`config.ts` itself came back byte-identical, no compiled agent changed under a re-compile, `compile`
emitted no warning, and `doctor` reported `Summary: 12 passed, 0 warnings, 0 errors` in all 16
invocations.

---

## Failures

Each section below is written for a later root-cause session: what was seen, the shortest way to
see it again, the code that is in the path, and one line naming the suspected mechanism. No fix is
proposed and none was applied.

### FAIL 2 — the stack's sub-agent roster is discarded and replaced by the domain roster

**Symptom.** Choosing the `nextjs-fullstack` stack and accepting every default installs 11
sub-agents, not the 12 the stack declares. `agent-summoner`, `codex-keeper` and `skill-summoner`
— all three named by the stack, each with a curated skill list — are absent from `config.agents`,
absent from the rewritten `config.stack`, and have no file in `~/.claude/agents/`. `api-tester` and
`cli-researcher`, which the stack never mentions, are present in all three. The installed set is
exactly the deduped union of the selected domains' rosters (web ∪ api ∪ cli), which is 11 names.

**Minimal reproduction.** In an empty scratch `HOME`:

```
HOME=<scratch> agents-inc init --source /home/vince/dev/skills
```

Enter on the first stack → Enter on the domain step → Enter through the build grid → Enter on
Sources → Enter on Agents → Enter on Confirm. Then `ls $HOME/.claude/agents`. Compare against
`Object.keys(defaultStacks[0].agents)`.

**In the path.** `preselectAgentsFromStack` in `src/cli/stores/wizard-store.ts` (called from
`stack-selection.tsx` when the stack is chosen); `preselectAgentsFromDomains` in the same store;
`DOMAIN_AGENTS` in the same store; the Sources step's `onContinue` handler in
`src/cli/components/wizard/wizard.tsx`, which calls `preselectAgentsFromDomains()` whenever
`initialAgents` is empty; `default-stacks.ts` as the declaration being overwritten.

**Suspected underlying cause.** `preselectAgentsFromDomains` assigns `selectedAgents` outright
rather than merging, and the Sources step calls it unconditionally on a fresh install, so it runs
_after_ the stack step and overwrites the roster the stack chose — the two preselect paths write the
same field and the domain one always runs last.

**Skills are unaffected.** The 23 stack skill ids matched exactly, in `config.skills`, in
`config.stack` and on disk. The divergence is confined to the agent roster.

### FAIL 3 — a skill selected during a project-scope edit is written into the global installation

**Symptom.** With a global install already in place, running `init` inside a project directory
opens the dashboard; choosing Edit opens a genuine project-scope session (the `s` scope hotkey works
there, as flow 4 confirms). Selecting a new skill in that session writes it as
`{ id, scope: "global", source: "eject" }`. Its files are copied into `$HOME/.claude/skills/`, the
**global** `config.ts` is rewritten, and five global agent files are rewritten. The project
directory ends the session with an empty `.claude/skills/` and an empty `.claude/agents/`. No guard
fires and no warning is printed; the confirm screen discloses the destination only as the badge
`+ React Hook Form [G]`.

**Minimal reproduction.** After the flow 1 install:

```
cd <project>; HOME=<scratch> agents-inc init --source /home/vince/dev/skills
```

Enter on the dashboard's Edit → focus "React Hook Form" in the Web grid → Space → Enter through to
Confirm → Enter. Then read `<project>/.claude-src/config.ts` (the entry is `scope: "global"`) and
`ls $HOME/.claude/skills/web-forms-react-hook-form` (present) against
`ls <project>/.claude/skills` (empty).

**In the path.** `createDefaultSkillConfig` in `src/cli/stores/wizard-store.ts`, which returns a
hard-coded `scope: "global"`; `buildSkillConfigForId`, which degrades to it for a genuinely-new
selection; `reconcileSkillConfigs`, which calls it from the `added` branch; `toggleTechnology`,
whose global-lock arms cover deselects and already-installed globals but not a fresh add.

**Suspected underlying cause.** The default scope for a newly-selected skill is a module constant
rather than a function of the session's scope, so `isEditingFromGlobalScope === false` has no
influence on where a new selection lands.

**Downstream consequence.** Because no new skill can be created project-only in a global-first
install, the only way to get a project-scoped skill is the `s` toggle on an already-global one —
which produces a `[P][G]` pair, not a project-owned entry. That is what makes FAIL 8 unreachable
rather than merely refused.

### FAIL 8 — a project edit cannot remove any skill once a global install backs it

**Symptom.** In proj-a, Vitest is a persisted `[P][G]` pair (project-active plus an excluded global
tombstone) created by flow 4. Pressing Space on it in a project edit raises the toast
`Global skills cannot be changed from project scope` and the session ends `No changes made.`
Afterwards proj-a's `config.ts`, proj-a's agents, the global config and proj-b are all byte-identical
to before. The refusal is correct in isolation; the problem is that in this install shape there is
no skill for which it does _not_ fire, so "remove a skill from a project" has no reachable subject.

**Minimal reproduction.** After flows 1–4:

```
cd <project>; HOME=<scratch> agents-inc edit --source /home/vince/dev/skills
```

Focus "Vitest" → Space → observe the toast → Enter through to Confirm → Enter → `No changes made.`

**In the path.** `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED` and the `isGloballyLockedSkill` /
`hasGlobalActive` guard at the head of `toggleTechnology` in `src/cli/stores/wizard-store.ts`; the
same guard repeated in the filter-incompatible removal path; `applySkillRemoval` / `isProjectOwned`
in the same file, which is the notion of ownership the guard is protecting.

**Suspected underlying cause.** The guard keys on "is there an active global install of this id"
rather than on "does the project own this entry", so the project half of a `[P][G]` pair — which the
project does own — is refused along with the inherited global half it is paired with.

---

## Anomalies observed that did not fail a flow

Recorded here because they are the kind of thing a root-cause session wants alongside the
failures, not because any listed flow depended on them.

**A. `compile` run inside a project writes into the global installation and into other projects.**
Every project-scope `compile` in this pass printed a _Global_ pass before its _Project_ pass:
`Recompiled 11 global agents`, `Refreshed config-types.ts`, and — once a second project was
registered — `Recompiled agents in 1 registered projects`. So a command issued from proj-a rewrote
`$HOME/.claude/agents/*.md`, `$HOME/.claude-src/config-types.ts` and proj-b's generated file. Every
write was byte-identical here (which is why nothing failed), so the blast radius is only visible in
the log, not in the diff. In the path:
`src/cli/lib/operations/project/compile-agents-all-scopes.ts` and the propagation step in
`src/cli/lib/config-gate/propagate.ts` / `recompile.ts`. Suspected mechanism: the all-scopes compile
does not narrow its scope set by the directory it was invoked from.

**B. "Recompiled 11 agents" is printed by edits that rewrite no agent file.** Flow 4's scope toggle
printed `Recompiled 11 agents` while the project agents directory, the global agents directory and
the global skills directory were all byte-identical before and after. The 11 agents are global, so a
project-scoped skill cannot appear in any of them; the count is the roster size, not a count of
files that changed. In the path: the recompile summary line in `src/cli/commands/edit.tsx` and the
`CompilationResult` it reads. Suspected mechanism: the summary reports agents _considered_ rather
than agents _written_, so a no-op recompile is indistinguishable from a real one in the output.

**C. A skill moved to project scope has nowhere to be consumed.** Following on from B: after flow 4
moved two skills to project scope in proj-a, both skills' files were on disk under
`proj-a/.claude/skills/` and both were declared in proj-a's config, but no compiled agent anywhere
referenced them, because every agent in this install is global-scoped and a global agent cannot
carry a project skill. `doctor` reports this state as `12 passed, 0 warnings, 0 errors` — there is no
check for "a declared skill that no agent can reach". In the path: `checkSkillsInstalled` and
`checkSkillsResolved` in `src/cli/commands/doctor.ts`, both of which verify presence rather than
reachability.

**D. `init`'s plugin-install banner strings do not appear on the `edit` path.** The eject→plugin
flip in flow 5 printed `Switching 1 skill(s) to plugin` and completed a real `claude plugin install`
(the registry entry and the marketplace registration are both on disk), but neither
`Installing skill plugins...` nor `Plugin (native install)` — the two strings `init` prints for the
same operation — was in the session output. Cosmetic, and noted only because a spec anchoring on
those strings would be asserting an `init`-only contract.

---

## Findings filed

Three, one per failure. **Two have since been fixed and their findings deleted:** the stack roster
now wins over the domain roster (`preselectAgentsFromDomains` returns early when a stack is selected,
and `default-stacks.ts` states that its `agents` keys are binding), and a fresh pick in a project edit
respects the scope override. The third is still open, in `packages/cli/.ai-docs/agent-findings/`:

- `2026-08-08-a-project-edit-cannot-remove-a-skill-it-owns-when-a-global-install-backs-it.md`

## Cleanup

All scratch `HOME` directories and both scratch project directories were removed at the end of the
pass. Nothing was written to the user's `~/.claude` or `~/.claude-src` at any point, and no git
command of any kind was run.

## Owner rulings (2026-08-08, incremental)

- **Anomaly: unreachable project skills** — downgraded by owner ruling: "a skill no agent uses
  can still be valid." Correct — installed skills are loadable by Claude Code directly, without
  any sub-agent assignment, so agent-free skills are a legitimate state. This anomaly is
  symptomatic only when the state arises _unintentionally_ — i.e. as fallout of Failure 2
  stranding skills where no agent was ever offered. Treat it as part of Failure 2's cause
  cluster, not as its own defect. Doctor stays silent on agent-free skills by design.
- **Anomaly: project compile writes outside the project** — owner ruling: "a compile in project
  shouldn't affect anything outside of the project." Containment is the intended contract:
  project-scope compile touches only that project's `.claude/`; propagation belongs to global
  operations only. Fix follows the cause analysis with the other scope items.
- **Anomaly: plugin banners missing on edit** — owner ruling: "the banner should be the same."
  Edit prints the same informational lines init prints for identical plugin operations. Same
  principle as the validation-surfacing parity already landed (CLI-364): one shared surface,
  not two narrations.
- **Anomaly: "Recompiled 11 agents" on a no-op** — owner ruling: adopt the proposed phrasing —
  the summary distinguishes rewritten from unchanged ("N agents rewritten, M unchanged"),
  computed from actual before/after comparison, so the line becomes a real signal.
- **Failure 1 (stack roster)** — owner ruling: "Agents declared in the stack need to be the ones
  installed." The stack's declared list wins outright; domain derivation serves from-scratch
  flows only.
- **Failure 2 (fresh pick in project edit)** — owner ruling: defaults to global but overridable,
  "like it used to work." The scope toggle returns; choosing project creates real dual scope.
- **Failure 3 ([P] half of [P][G])** — owner ruling: toggleable from project, "like it always
  used to work." The guard narrows to global-owned halves only (that by-design rule stands).

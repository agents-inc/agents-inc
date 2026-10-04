# Lane `lifecycle`: manual journey results (2026-10-01)

Everything here was driven by hand against the built CLI (`agents-inc` 0.165.0). The wizard ran in tmux and the
non-interactive commands ran directly. No test suite was run. Each journey got a fresh fake HOME under
`$J/lanes/lifecycle/` (`h7`, `h8`, `h10`, …). `base-eject` is a pristine global eject install made through the
wizard (CLI Tool stack, every Sources row set to Local: 10 skills, 9 sub-agents), copied with `cp -a` for the
journeys that need a live install. "Snapshot" means sha256 plus mtime for every file under the scope, compared
before and after with `diff`.

`L=$J/lanes/lifecycle`. `run.sh <home> <cwd> <cmd…>` sources the env, pins HOME and runs the command.

| journey           | verdict  | what you did                                                                                                                                                                                                                                                                                                                                                                 | evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7                 | PASS     | `init` at HOME through the wizard (CLI Tool, plugin mode), then `init` → dashboard → Edit in two empty projects `p1` and `p2`, each pressing `s` on CLI Developer (`[P][G]`) and saving. Snapshotted both projects, ran `edit` at HOME, pressed SPACE on Web Researcher and confirmed.                                                                                       | Edit printed `- web-researcher (agent)` / `Recompiled agents in 0 registered projects, 2 unchanged` / `EXIT=0`. Global `projects[]` held both paths. `web-researcher` is gone from the global agents dir and config, and from BOTH projects' `agents[]` and `SelectedAgentName`. Both projects' `config.ts` and `config-types.ts` were rewritten to the same `config-types.ts` sha (`d2b8bdc8…`). Each project's compiled `cli-developer.md` stayed byte-identical. `doctor` in p1: `15 passed, 0 warnings, 0 errors`.                                                                                                                                                                                                                                      |
| 8                 | **FAIL** | `base-eject` copy, project `p`: `init` → Edit, `→` then `s` on React (creates the `[P][G]` pair), save. Appended a line to the PROJECT copy's `SKILL.md`, snapshotted the global scope, then `edit` with `→` and SPACE on React, and saved.                                                                                                                                  | The project half went (`- React [P]`, the project copy was deleted, the entry collapsed to `{ id: 'web-framework-react', scope: 'global', origin: 'eject' }`). Global `config.ts`, `config-types.ts` and the agents were byte-identical. **But all six files of the global `~/.claude/skills/web-framework-react/` were rewritten, and the global `SKILL.md` now carries the project's edit** (sha `be58c6e9…` became `59b071c6…`, equal to the project copy's). See D1.                                                                                                                                                                                                                                                                                    |
| 10 (eject branch) | PASS     | `update` on a `base-eject` copy (`h10`), run at HOME and from an empty project dir under it. Also tried by hand on the plugin install in `h7`.                                                                                                                                                                                                                               | `Ejected skills are yours to own — 'npx agents-inc update' does not change them.` / `No plugin marketplaces are configured — nothing to refresh.` / `EXIT=0`, and the tree snapshot was identical. On the plugin install: `Refreshing marketplace agents-inc...` / `Updated marketplace agents-inc` / `✓ Update complete! 1 marketplace refreshed.` That is the success branch the row calls blocked, working by hand with the real `claude`.                                                                                                                                                                                                                                                                                                               |
| 11                | PASS     | On `h10`: (a) `compile` on the fresh install; (b) a no-op `edit` (Enter through every step, confirm); (c) an `edit` adding Clack (Local), then `compile`; (d) `doctor`; (e) `tsc --strict` on the generated pair, plus a probe with a bogus id.                                                                                                                              | (a) `0 global agents rewritten, 9 unchanged`, snapshot identical (sha AND mtime). (b) `No changes made.`, snapshot identical, so nothing was written. (c) After the edit, `compile` left the snapshot identical (`config-types.ts` untouched, no agent rewritten). (d) `14 passed, 0 warnings, 0 errors`. (e) tsc exit 0, and the probe gave `Type '"cli-prompts-bogus"' is not assignable to type 'SkillId'`.                                                                                                                                                                                                                                                                                                                                              |
| 14                | PARTIAL  | Global leg: `rm ~/.agents-inc/claude/config.ts` on a `base-eject` copy, then `doctor`, `compile`, `edit`, `list` and `init` (cancelled with Ctrl-C), then `init` completed. Project leg: a project with React `[P]` and PM `[P]` under the live global install; `rm proj/.agents-inc/claude/config.ts`, then `doctor`, `compile`, `list`, `edit`, `init` → dashboard → Edit. | Global leg PASS: doctor gave `No Orphans ✗ 10 skills and 9 agents installed here, and no configuration declares them` and named all 19 entries. `compile` and `edit` gave `Error: No installation found…` (exit 1). `list` gave `No installation found.` (exit 0). `init` opened the stack step and cancelled with exit 4. The tree was unchanged throughout, and completing `init` recovered (doctor clean). Project leg: commands fall back to the global install and the dashboard Edit recovers. **But doctor in the project names only `pm.md` (as a warning) and never the stranded `proj/.claude/skills/web-framework-react`. It also reports `Config Valid ✓ .agents-inc/claude/config.ts is valid` for a file the project no longer has.** See D2. |
| 19                | PASS     | `base-eject` copy plus `proj` (React `[P]`, PM `[P]`) and `proj2` (PM `[P]`). Ran `uninstall --yes` in `proj`, then interactive `uninstall` at HOME (answered `y`), then `uninstall --yes` in `proj2`. Separately: global install, a hand-written `my-own-agent.md`, `config.ts` replaced by a syntax error, then `uninstall --yes`.                                         | Project uninstall: `proj` is left empty (no `.agents-inc`, no `.claude`). The global diff was exactly one line, `proj`'s path removed from `projects[]`. `proj2` was byte-identical. Global uninstall: global gone, `Kept .claude/ (contains user content)`, `✓ Updated 1 registered project`, and `proj2` was rewritten into a standalone config that doctor reports clean. Corrupt config: printed the `Could not read the project config…` warning, removed all 10 skills and 9 agents plus `.agents-inc/`, `Kept 1 agent … no agents-inc marker`, exit 0.                                                                                                                                                                                               |
| 36                | PASS     | Two `base-eject` copies, each with a foreign `skills/my-own-skill` (metadata, no `forkedFrom`), `skills/no-meta-skill` (no metadata) and a hand-written `agents/my-own-agent.md`. In one: `doctor`, then `uninstall --yes` with the config present. In the other: config deleted, then `doctor` and `uninstall --yes`.                                                       | Doctor names both foreign dirs as `not installed by this CLI and named by no configuration here: not validated`. With no config, its offer lists exactly the 10 marked skills and 9 marked agents. Uninstall printed `Skipping 'my-own-skill'` / `Skipping 'no-meta-skill'` / `Kept 1 agent … no agents-inc marker`, and on both paths exactly the three foreign entries survive. (O5 covers a wording issue on the config-present path.)                                                                                                                                                                                                                                                                                                                   |
| 37                | PASS     | Init leg: `share` of `base-eject` gave id `TtcFBJG3`. In a fresh HOME, created `.claude/agents/cli-developer.md/` as a DIRECTORY, then ran `init --from TtcFBJG3`. Clean control in another fresh HOME. Edit leg: `chmod 444 h10/.claude/agents/cli-tester.md`, then `edit` deselecting Clack.                                                                               | Init: `Compiled 8 agents (1 failed)`, `Completed with 1 failure(s) — the changes above landed, these did not:` / `1 sub-agent(s) did not compile: cli-developer` / remedy line / `EXIT=5`. No `initialized successfully!`. `config.ts` was identical to the control's apart from the registered path, and `config-types.ts` lists all 9. Control: `Compiled 9 agents`, exit 0. Edit: `4 agents rewritten, 4 unchanged (1 failed)`, the same ending, `EXIT=5`. The old `cli-tester.md` body was byte-identical (sha check OK) while the config no longer named clack. After `chmod 644` and `compile`, all agents match the baseline. (D6 covers a stray line in the init report.)                                                                           |
| 38                | PARTIAL  | `base-eject` copy with the global `config.ts` broken three ways: syntax error, empty file (no default export), and `skills: 'not-an-array'`. Ran `doctor`, `compile`, `list`, `edit`, `init` (TTY), `search react`, and `eject templates` from an empty project dir under HOME.                                                                                              | Full-config reader PASS for all three shapes: `compile`, `edit`, `init` and `list` exit 1, doctor gives `[ERROR] … exists but could not be loaded`, and the whole tree is byte-identical, `config-types.ts` included. Settings reader, syntax error: `search` exits 1 with the remedy; `eject templates` ejects, gives `Could not create .agents-inc/claude/config.ts`, `EXIT=5`, no `Eject complete!`, and the global is identical. **Empty file: `search` answers `Found 35 skills matching "react"` (exit 0), and `eject templates` prints `✓ Created .agents-inc/claude/config.ts` / `✓ Eject complete!` (exit 0) with `marketplace: 'github:agents-inc/skills'`. Schema-violating file: eject also invents a project config and exits 0.** See D3.     |
| 39                | PARTIAL  | Hand-built marketplaces, each with 4 namespaced skills (`mk-…`) and `config/stacks.ts`. `mk39`: the stack names `frontend-dev`. `mk39c`: control without it. `mk39t`: the stack names `mk-web-state-pinia`, which the catalogue does not carry. Ran `init -m <dir>` at 200x60 and at 120x20, and selected the stack.                                                         | Band leg PASS: `Stack 'band-stack' names 1 sub-agent(s) this CLI does not define: 'frontend-dev'. Left out of the stack…` above `❯ Band Stack`, and the control never prints `frontend` (count 0). Toast half: the missing-skill stack is reported on the startup band before mount, and **no toast appeared after selecting the stack** (raw pane log via `pipe-pane`). The band also contradicts itself, and at a short terminal it keeps the wrong line (D5).                                                                                                                                                                                                                                                                                            |
| 42                | PARTIAL  | `branding: { name: 'Northwind' }` added to `h10`'s global config. Ran `doctor`, `uninstall --yes` from an empty dir under HOME, `eject templates`, the dashboard (piped and TTY), and `init --from` under a project config with and without branding. Then a wizard `edit` of the branded global.                                                                            | Configured: `Northwind Doctor`, `Northwind Uninstall` / `Northwind is not installed in this project.` / `No changes made.`, `Northwind Eject`, a dashboard titled `Northwind` with no logo (TTY and piped), and `Northwind initialized successfully!`. Default: `Agents Inc. Uninstall`, `Agents Inc. Eject`, `Agents Inc.` dashboard, `Agents Inc. initialized successfully!`. **Every rewrite drops the key: `init --from` and a wizard `edit` both write a config with no `branding`, and the next `doctor` prints `Agents Inc. Doctor`.** See D4.                                                                                                                                                                                                       |
| 43                | PASS     | Fresh HOME, empty cwd: `doctor`.                                                                                                                                                                                                                                                                                                                                             | `Content checks` holds its 5 rows with nothing spliced in between. `Operational checks` is followed directly by `Config Valid ✗ .agents-inc/claude/config.ts not found`. The provenance line reads `Fetched github:agents-inc/skills over the network — nothing here names one, so this is the default`. The cwd stayed empty and HOME gained only `.cache`. Exit 1. (O3: the row still leads with the cache path, and one row passes vacuously.)                                                                                                                                                                                                                                                                                                           |
| 52                | PARTIAL  | `base-eject` copy with `cp -a .agents-inc/claude .claude-src`, so both folders exist. Ran `compile`, `update`, `eject skills`, `list`, `edit` and `init` (TTY), `doctor`, and `uninstall --yes`. Control: a legacy-only scope, where `compile` works.                                                                                                                        | `compile`, `update`, `eject skills`, `edit` and `init` each print the both-folders warning plus `Error: Refusing to write while two source folders are on disk.` (exit 1), and the tree is byte-identical. Doctor reports `Layout ✗ … both .claude-src/ and .agents-inc/claude/ are on disk — .agents-inc/claude/ is the one being read`. **`uninstall --yes` is not refused: it deletes `.agents-inc/claude/` and every skill and agent, prints `has been uninstalled`, and leaves `.claude-src/config.ts`. `list` then reports `Installation: agents-inc … Agents: 0`.** See D7.                                                                                                                                                                          |
| 53                | PASS     | `base-eject` copy plus registered projects `pa` and `pb`. Moved `pb` to `.claude-src/` by hand. Ran `doctor` at HOME, in `pa` and in `pb`, then `compile` in `pb`. Separately: global moved to `.claude-src/` with agents compiled under the new layout, then `doctor`, `compile`, `doctor`.                                                                                 | Control: `Layout ✓ The global installation is on .agents-inc/claude/`. HOME: `Layout ! … Registered projects still on the old folder — this list is the registry, not an inventory of this machine:` followed by `pb` only. `pb`: `This project is on .claude-src/, which this CLI goes on reading and writing — move its contents … by hand`. `pa`: both rows `✓`. `compile` in `pb` works and prints no nag. Stale agent: `Layout ✗ … agent-summoner.md names a source folder this installation does not use (.agents-inc/claude/) — recompile it`, and after `compile` it drops to the plain legacy `!`.                                                                                                                                                 |

Counts: **PASS 8** (7, 10, 11, 19, 36, 37, 43, 53) · **PARTIAL 5** (14, 38, 39, 42, 52) · **FAIL 1** (8) ·
BLOCKED 0 · N/A 0.

## Defects

### D1 — A project edit that drops the project half of a `[P][G]` skill pair rewrites the GLOBAL ejected skill with the project's copy (journey 8)

```
L=$J/lanes/lifecycle; cp -a $L/base-eject $L/h8r; H=$L/h8r; mkdir -p $H/p
# 1. in $H/p: agents-inc init → dashboard Enter (Edit) → → (focus React) → s → Enter×4 → Enter → Enter (confirm)
#    prints "+ React [P]"; project gets .claude/skills/web-framework-react (copied from the global one)
echo "<!-- PROJECT-ONLY EDIT -->" >> $H/p/.claude/skills/web-framework-react/SKILL.md
sha256sum $H/.claude/skills/web-framework-react/SKILL.md   # be58c6e9… (global, untouched)
# 2. in $H/p: agents-inc edit → → → SPACE on React (badge goes to "G React") → Enter×4 → Enter → Enter (confirm)
#    prints only "Changes:\n  - React [P]\n0 agents rewritten, 9 unchanged\n✓ Done", EXIT=0
sha256sum $H/.claude/skills/web-framework-react/SKILL.md   # 59b071c6… == the project copy's sha
tail -1 $H/.claude/skills/web-framework-react/SKILL.md     # <!-- PROJECT-ONLY EDIT -->
```

Expected (row 8, "stays contained"): the global scope is untouched. Observed: global `config.ts`, `config-types.ts` and the
agents are byte-identical, but all six files of `~/.claude/skills/web-framework-react/` get new mtimes, and
`SKILL.md` takes the project's content. Nothing is printed about it. A user who customised the global copy loses those
changes to the project's version. The first sign shows up during the drop: on the Sources step the global
React row is unlocked (`  React   ❯ Local`, no 🔒), while every other global row stays locked. The spec
`project-edit-removes-project-half-of-pair` compares only `listFiles(skillsPath(fakeHome))` (names), so it cannot see this.

### D2 — Under a live global install, doctor misreports a project whose `config.ts` was deleted (journey 14, project leg)

```
cp -a $L/base-eject $L/h14; H=$L/h14
# in $H/proj: init → Edit → (→, s on React) → Enter×4 → Enter → Down×12, s on PM → Enter → confirm
rm $H/proj/.agents-inc/claude/config.ts
run.sh $H $H/proj agents-inc doctor
#   Config Valid   ✓  .agents-inc/claude/config.ts is valid        <- the GLOBAL file, under a path the project does not have
#   Layout         ✓  This project is on .agents-inc/claude/
#   No Orphans     !  1 orphaned agent file  - pm.md (not in config)
#   (proj/.claude/skills/web-framework-react is never named)
run.sh $H $H/proj agents-inc compile    # compiles GLOBAL, then "Until then, 1 sub-agent's completion gate will not run" (counts the stranded pm.md)
```

Control: the same project with `HOME` empty (`h14b-home`) gives `Config Valid ✗ … not found` and
`No Orphans ✗ 1 skill and 1 agent installed here, and no configuration declares them`, naming both. Row 14 says
doctor "names every stranded skill and agent as unowned, at both scopes". That only holds when no global install sits
behind the project. The named spec in `commands/doctor-diagnostics` gives the project a home of its own with nothing in it.

### D3 — The settings reader treats a config that "could not be loaded" as absent for two of the three failure shapes (journey 38)

```
cp -a $L/base-eject $L/h38; H=$L/h38; mkdir -p $H/p38e $H/p38s
: > $H/.agents-inc/claude/config.ts                                  # exists, no default export
run.sh $H $H agents-inc doctor   # [ERROR] ~/.agents-inc/claude/config.ts: exists but could not be loaded: the file has no valid default export
run.sh $H $H agents-inc list     # ConfigLoadError … no valid default export, EXIT=1
run.sh $H $H agents-inc search react     # "Found 35 skills matching "react"", EXIT=0, no warning
run.sh $H $H/p38e agents-inc eject templates
#   ✓ Created .agents-inc/claude/config.ts / ✓ Eject complete! / EXIT=0   (invented config names marketplace 'github:agents-inc/skills')
printf "export default { name: 'x', skills: 'not-an-array', agents: [] }\n" > $H/.agents-inc/claude/config.ts
run.sh $H $H/p38s agents-inc eject templates    # ✓ Created .agents-inc/claude/config.ts / ✓ Eject complete! / EXIT=0
```

Compare a syntax error in the same file: `search` exits 1, and `eject templates` exits 5 with `Could not create
.agents-inc/claude/config.ts` and no `Eject complete!`. Row 38 says a config that EXISTS and cannot be read stops the
command "at both readers". The settings reader (`loadSourceConfig`) does that only for the syntax-error shape. For the
schema-violating shape it reads the file leniently: `search` used a `marketplace` the file named. The
full-config reader refuses that same file.

### D4 — `branding` is dropped from the config by every rewrite (journey 42)

```
# global: add "  branding: { name: 'Northwind' }," before marketplace in h42/.agents-inc/claude/config.ts
run.sh $H $H agents-inc doctor | head -2      # Northwind Doctor
# agents-inc edit at HOME, add Clack (Local), confirm  →  "+ Clack [G] … ✓ Done", EXIT=0
grep -c branding $H/.agents-inc/claude/config.ts   # 0
run.sh $H $H agents-inc doctor | head -2      # Agents Inc. Doctor
# init --from: fresh HOME, project config `{ name:'p', skills:[], agents:[], branding:{ name:'Northwind' } }`
run.sh $L/h42brand $L/h42brand/p agents-inc init --from TtcFBJG3   # prints "Northwind initialized successfully!"
grep -c branding $L/h42brand/p/.agents-inc/claude/config.ts         # 0 — next doctor: "Agents Inc. Doctor"
```

A white-labelled install reverts to the shipped name after its first edit, and `init --from` prints the configured
name in the same run that removes it from the file. Row 42 says "the key survives as passthrough data", which is false.

### D5 — The startup band contradicts itself about a stack's missing skill, and a short terminal keeps the wrong line (journey 39)

```
init -m $L/mk39t     # stack names mk-web-state-pinia, which the source does not ship
  Skill 'mk-web-state-pinia' for category 'web-client-state' not found in matrix. It may be a custom or local skill.
  Stack 'band-stack' names 1 skill(s) this marketplace's catalogue does not carry: 'mk-web-state-pinia'. Left out of the stack — selecting it would install nothing.
# at 120x20 the band keeps only the first line plus "... and 1 more"
```

The first line suggests the skill may still be honoured ("custom or local") and uses internal wording ("matrix"). The second says it
was left out. On a short terminal the actionable line is the one evicted. Selecting the stack then produces no toast
(see the corrections).

### D6 — An init that ends COMPLETED_WITH_FAILURES carries a false "No agents found to recompile" (journey 37)

```
mkdir -p $H/sab $H/.claude/agents/cli-developer.md; run.sh $H $H/sab agents-inc init --from TtcFBJG3
  Compiled 8 agents (1 failed)
   ›   Warning: Failed to compile cli-developer: EISDIR: illegal operation on a directory, read
   ›   Warning: No agents found to recompile          <- absent from the clean control; 8 agents were compiled
```

The text comes from `src/cli/lib/agents/agent-recompiler.ts` (`warnings: ["No agents found to recompile"]`).

### D7 — `uninstall` is not refused over rival source folders: it destroys the live folder and leaves the stale one as an "installation" (journey 52)

```
cp -a $L/base-eject $L/h52b; H=$L/h52b; cp -a $H/.agents-inc/claude $H/.claude-src
run.sh $H $H agents-inc compile        # refused: "Refusing to write while two source folders are on disk." EXIT=1
run.sh $H $H agents-inc uninstall --yes
#   (no rival-folder warning) … ✓ Removed 10 CLI-installed skills / ✓ Removed 9 compiled agents /
#   ✓ Removed .agents-inc/claude/ / Agents Inc. has been uninstalled. / ✓ Uninstall complete! / EXIT=0
ls -A $H        # .cache .claude-src .codex proj
run.sh $H $H agents-inc list    # Installation: agents-inc / Skills: 10 / Agents: 0 / Config: …/.claude-src/config.ts
run.sh $H $H agents-inc doctor  # Skills Installed ! 10 skills missing from disk; Agents Compiled ! 9 agents need recompilation
```

`settleSourceLayoutBeforeWriting` is called by eject, edit, compile, update and init, but not by uninstall
(`grep -rn settleSourceLayoutBeforeWriting packages/cli/src/cli/commands`). The run claims an uninstall it did not
complete, and the folder it leaves is the one the refusal's own docstring calls the hazard.

## Observations (not journey claims; for triage)

- O1. Plural agreement: `1 agents rewritten`, `Recompiled agents in 1 registered projects`.
- O2. `compile` prints `Refreshed config-types.ts` even when it wrote nothing (the mtime did not change).
- O3. Doctor still leads `Marketplace Reachable` with `Connected to remote: <…/.cache/agents-inc/sources/…>` (a local
  cache path) above the provenance line. Over an empty dir it reports `Placements Offered ✓ Every configured skill is
placeable` while the other config-dependent rows read `Skipped (config invalid)`. With a foreign
  `~/.claude/skills/my-own-skill` present it reports `239 skills available` against the marketplace's 238.
- O4. `compile`'s refusal over an unreadable config carries no remedy lines. `edit`, `init` and `search` print three
  (`There is no automatic repair…`).
- O5. With a config present, doctor calls a hand-written agent `1 orphaned agent file - my-own-agent.md (not in
config)`, while uninstall says the same file has `no agents-inc marker, so this CLI did not compile it`. No removal is
  offered, so the offer and the refusal still agree.
- O6. The uninstall warning at HOME says `Could not read the project config` for the global one. The global uninstall
  preview does not say that registered projects will be rewritten; it reports `✓ Updated 1 registered project` only afterwards.
- O7. `NO_COLOR=1` is set by the rig, but the wizard still emits 24-bit colour escapes (`ESC[38;2;…m`). Selection on the
  Sources step shows only as bold or dim.
- O8. On the agents step, `s` on an UNselected agent does nothing, with no feedback.
- O9. Rig note: tmux keys sent faster than about 0.3 s apart are dropped by the wizard (15 `Down`s moved the cursor 12 rows).

## Corrections

- Row 38's leg text lists `uninstall` among the commands that `ensureConfigReadable` stops. By hand (and in its own
  spec, and in row 19) `uninstall` deliberately degrades over an unreadable config: it warns and removes everything. The
  row also implies the settings reader refuses every unreadable shape, but it refuses only a syntax error (D3).
- Row 42 says the `branding` key "survives as passthrough data" through the `init --from` rewrite. It does not survive
  that rewrite, nor a wizard `edit` (D4).
- Row 39 names "a source whose stack claims a skill its catalogue does not carry" as the reachable toast producer. By
  hand that shape is reported on the startup band at load time, and selecting the stack raises no toast.
- Row 8 reads COVERED for "stays contained", but its spec compares only the global skill NAMES. The global skill
  directory is rewritten (D1).
- Row 14's project-scope leg is proved by a spec whose HOME is empty. With a live global install behind the project, the
  report differs (D2).
- Row 52 is COVERED by a spec whose write commands are `compile`, `update` and `eject skills`. `uninstall` is a write
  command the guard does not reach (D7).
- Row 10 calls the marketplace-refresh success branch blocked ("needs … the real Claude CLI"). With the rig's real
  `claude` and the public marketplace it ran by hand: `✓ Update complete! 1 marketplace refreshed.`
- The brief: nothing false.

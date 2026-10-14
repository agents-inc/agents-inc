# Journey issues: investigation, 2026-10-02

This covers the 5 FAIL and 9 non-Codex PARTIAL journeys from the manual run on 0.165.0. Codex is left out; the owner
tests it with Codex.

For each issue, the area's developer reproduced it by hand (CLI in tmux, editor in Playwright), its tester wrote a
test that fails on HEAD, the developer fixed it in a scratch copy, and `reviewer` re-proved it independently.

**Status:** all 14 are fixed, uncommitted in the working tree (CLI-902, archived 2026-10-03). Each was done
tests-first and independently verified, and the full gates are green. The record is
`todo/plans/2026-10-02-journey-fixes/progress.md`.

| #   | Issue                                                           | Journeys   | Ruling                                                          |
| --- | --------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| u01 | `share` / `edit --ui` from a project lose global agents' skills | 29, 23, 30 | Bug. Both include global. Every `--from` lists, then asks       |
| u02 | Dropping a project skill overwrites the global copy             | 8          | Bug. Remove the project copy only; global untouched             |
| u03 | Preview: wrong skill descriptions and order                     | 48         | Descriptions: bug. Order: not a bug                             |
| u04 | Preview: missing or differently drawn files                     | 48         | Bug. The preview uses the CLI's own code                        |
| u05 | `doctor` with a deleted project `config.ts`                     | 14         | Label only: say which config was read                           |
| u06 | Unbuilt custom marketplace labelled "Agents Inc"                | 18         | Require a valid `marketplace.json`                              |
| u07 | `init --marketplace` ignored over a global install              | 26         | Bug. Works the same as bare `init`                              |
| u08 | False "duplicate slug" and "assigned to no sub-agent" warnings  | 26         | Bug. Remove both; nothing replaces them                         |
| u09 | Editor skill search 503 locally                                 | 25         | `bun run dev` makes local match prod                            |
| u10 | Empty or invalid `config.ts` read as absent by `search`/`eject` | 38         | Bug. Writes refuse and name the broken config; `doctor` reports |
| u11 | Startup band contradicts itself                                 | 39         | Bug. Drop the old warning                                       |
| u12 | Config rewrites drop `branding`                                 | 42         | Bug. As proposed                                                |
| u13 | `uninstall` over two source folders                             | 52         | Bug. Remove both folders; never refuse                          |
| u14 | `edit` omits the Claude trust line                              | 79         | Bug. `edit` prints it too                                       |

## What gets built

- **u01:**
  - From a project, `share` and `edit --ui` include the global sub-agents and their skills. Neither asks.
  - Every `--from` install lists what goes into the project and what into the global install, then asks "are you
    sure?". `edit --from` already asks before applying; the list joins that question. With no terminal (CI),
    `init --from` prints the lists and carries on.
  - On yes, it installs what is listed. A skill already installed globally is skipped and stays as it is.
  - From a project, `--from` never removes anything global. Today an id with no global entries empties the global
    install, and an id with some removes the global skills it lacks, after listing them.
  - `edit --from` keeps the global sub-agents' skills (the same blind spot as `share`).
- **u02:** a drop removes the project copy only, Plugin or Local, and writes nothing global. Nothing global needs to
  change: the "tombstone" is a line in the project's `config.ts`, and the drop already deletes it. `uninstall` in a
  project already deregisters it from the global install. `s` (fold a project copy into global, changing its mode
  for every project) stays.
- **u03:** descriptions only: about 125 hand-written lines plus one generated table, which loads with the preview,
  so first paint is unchanged. It also fixes the preview going stale after you load a marketplace (round-2 question
  6, which you skipped; included unless you say no).
- **u04, u08, u12, u14:** as patched in round 1.
- **u05:** doctor's line names the config it read, for example "This project: config.ts removed, using the global
  installation's". Nothing else changes.
- **u06:** a custom marketplace without a valid `marketplace.json` is refused, naming `build plugins` and
  `build marketplace`. `doctor` reports it, and the docs say it is required. The wrong label then can't appear. The
  skills repo has one, so your local `init --marketplace` command keeps working.
- **u07:** `init --marketplace Y` works the same as bare `init`. In a project with no installation of its own, under
  a global install, that is the dashboard, where Edit sets the project up. The difference is that the project is set
  up from Y, with the global's sub-agents and skills shown locked. Where the folder already has its own installation
  from another marketplace, it refuses (exit 2). `init --ui --marketplace` refuses for now (CLI-905 makes it
  work). New picks still
  default to global, per your CLI-442 ruling (2026-08-08).
- **u09:** `bun run dev` builds the local skill list the way prod does whenever it is missing or older than 3 days
  (about 3 s, no token), and applies the local database migrations.
- **u10:**
  - Every write refuses when any config this folder uses, project or global, is broken. `eject` joins them.
  - The refusal says which config is broken and to run `uninstall`, then `init`, from that config's folder.
  - `doctor` reports it and finishes. `uninstall` always works.
- **u11:** delete the old warning. That also fixes `compile`'s false "custom or local skill" line.
- **u13:** `uninstall` removes both `.claude-src/` and `.agents-inc/claude/` in one run and never refuses. Files you
  made yourself stay. It also skips the terminal-size wait.
- **Also in scope:**
  - `share` refuses a setup holding ejected skills, saying they can't be shared; only plugins can be. `edit --ui`
    still opens them in the editor.
  - `share` gets the two-folder check.
  - A command that needs a terminal refuses cleanly without one. Today a bare `init` in CI crashes with a stack
    trace.
  - `init --from` and `edit --from` print the marketplace's load warnings.
  - A skill whose SKILL.md frontmatter doesn't parse is warned about. Today every command except `doctor` skips it
    silently.
  - Until CLI-903 lands, `share` warns which skills its id won't install when your global and project come from
    different marketplaces.

## Answered 2026-10-02

- **`init --from` in CI:** option A. It prints the lists and carries on. A command that can't run without a terminal
  "should break because it's not a valid command".
- **What `share` can't carry:** "a share shouldn't be able to share anything ejected ... Just tell them that there
  are ejected skills so they cannot be shared. You should only have plugins."
- **u07:** "This should just work the same as regular init."

## Later (tracker rows)

- **CLI-903: a share carrying more than one marketplace.** A share names one, so with a global from the public
  catalogue and a project from your own, half the skills don't install elsewhere.
- **CLI-904: custom marketplaces beyond today's rules.** Checked on 0.165.0:
  - A custom stack can name its own marketplace's skills. A public skill in it, such as `web-framework-react`, is
    dropped at install: "Left out of the stack — selecting it would install nothing".
  - A custom skill id must start with the marketplace's name (`acme-…`), and `build marketplace` refuses any
    other. That is your CLI-498 ruling: the prefix is what stops two marketplaces naming the same skill.
  - `config/skill-rules.ts` can name only public skills. Custom categories already work.
  - `build marketplace` warns about a stack naming a skill it doesn't ship, and publishes anyway. You ruled: keep
    publishing.

## Your rulings, condensed

**Round 1:**

- **u01:** "`edit --ui` should definitely include the global sub-agents and skills."
- **u02:** the right fix, plus un-tombstone the global skill. Round 2 showed the drop already does that.
- **u03:** "the same descriptions, but the order doesn't matter at all."
- **u04:** "the preview should use the CLI's own code."
- **u05:** "when it reads the global, it should say this is the global; if it reads a project, it should say this is
  a project."
- **u08, u12, u14:** approved. For u12, an inherited name falls back to "Agents Inc.".
- **u09:** "Get local in line with prod."
- **u10:** "As long as write commands refuse, that's fine. You don't want doctor to fail."
- **u11:** "drop the old warning for stacks."
- **u13:** "if I want to uninstall something, I don't care if it's broken, I just want it gone."
- **In scope:** the custom-marketplace `share`, the two-folder check on `share`, the `--from` load warnings,
  `compile`'s false line, and the `edit --from` sibling.

**Round 2:**

- **u01:** "if you press share, it should just share everything ... every time you install a skill with the from
  flag, it should say these skills are going to be installed on the project, these skills on the global, are you
  sure". From a project it "shouldn't change anything on the global scope ... Definitely shouldn't delete Global
  Scope stuff."
- **u02:** removing a skill from a project changes nothing global. Removing a project "should deregister it from the
  global install". Keep `s`: "Why would you want to remove that functionality?"
- **u03:** "It has to be a reasonably easy fix."
- **u05:** "Just say anything. Project here. Config.ts removed."
- **u06:** "Why not just make it a requirement?" An invalid one is refused too.
- **u07:** "You can have a separate global and project install."
- **u08:** no extra line; the `--from` list is enough.
- **u09:** also apply the local migrations.
- **u10:** refuse when either config is broken, say which one, and say where to reinstall from.
- **u11:** custom stacks and skills beyond the naming rule come later (CLI-904).
- **u13:** "remove both."
- **`build marketplace`:** "It should publish anyway". Later (CLI-904).
- **Multi-marketplace share:** later (CLI-903).
- **Unparseable SKILL.md:** "yes, this should be warned."

## Per issue: cause and when it broke

**u01: `share` / `edit --ui` from a project.**

- **Cause:** `readInstalledConfig` (`lib/seed/installation-payload.ts`) reads only the project `config.ts`. Global
  sub-agents' skill rows live in the global one, so the payload carries `assignments: {}`.
- **Fix:** lay the same provider's global stack rows under the project's. The project wins, and masked `[P][G]`
  rows are skipped.
- **Proof:** a project now mints the same id as HOME. Journey 29 rebuilds all 8 agents byte-identical, and 30 keeps
  React.
- **Sibling, confirmed in round 2:** `edit --from` from a project drops the global sub-agents' skill rows too.

**u02: a dropped project half overwrites the global skill.**

- **Cause:** `Edit.applyScopeChanges` treats dropping a `[P][G]` project half as a move, and
  `migrateLocalSkillScope` copies the project folder over `~/.claude/skills/<id>`.
- **Broke:** 0.142.2, when the wizard began keeping the dropped skill selected as global. 0.142.0 is fine.
- **Fix:** delete only the project copy, at project scope, whatever its type. When either half is a plugin, today's
  drop reinstalls the global plugin or exits 5.

**u03: preview descriptions.**

- **Cause:** the editor's built-in catalogue never carries SKILL.md descriptions, so the preview falls back to short
  labels. Rebuilding `catalog.json` would not help: the editor never downloads it for the public catalogue.
- **Fix:** the generator writes each skill's SKILL.md sentence to its own file, which only the preview loads.
- **Caveat:** a custom marketplace shows the right sentences only if its `catalog.json` was built with 0.165.0 or
  later.

**u04: preview files.**

- **Cause:** the preview draws a root only when its half holds content, and renders that half raw. `init --from`
  from a project always writes both pairs, builds the global through `mergeGlobalConfigs` (which drops
  `description`), and writes the carried skill's renamed SKILL.md, `metadata.yaml` and `// Custom` grouping.
- **Fix:** move the CLI's own blank-pair merge and carried-skill rendering into `@workspace/compile`, and have the
  preview use them.
- **Caveat:** six docs name the moved functions' old homes, so the docs have to land with it.

**u05: `doctor` with a deleted project config.**

- **Cause:** `resolveConfigState` takes the global fallback as this directory's config, so Config Valid names the
  global file under the project's path.
- **Fix:** the line names the file actually read. Only doctor changes.

**u06: unbuilt marketplace labelled "Agents Inc".**

- **Cause:** `loadSkillsFromAllSources` names every source with no resolved name `agents-inc`. Today a folder
  without `marketplace.json` installs in Local mode, and every command works.
- **Fix:** refuse a custom marketplace without a valid `marketplace.json`.

**u07: `init --marketplace` ignored.**

- **Cause:** since 0.133.0 (`e7976f3b`), `init` in a folder with no installation of its own opens the global
  install's dashboard, and nothing after that reads the flag. No commit message, changelog or ruling explains the
  change.
- **Broke:** 0.133.0. 0.132.0 honoured the flag.
- **Decision on record:** journey 26's ruling (CLI-498, 2026-08-17) allows a global from X and a project from Y.

**u08: false warnings.**

- **Cause:**
  - Two marketplaces may ship the same short name: "Duplicate slug 'example-skill' ... ignoring
    'acme-example-skill'". Nothing ignores it; both skills work.
  - "Skill 'acme-example-skill' is assigned to no sub-agent": the global web-developer loads it. The check compares
    inherited global skills with the shared setup only.
- **Broke:** the slug half in 0.155.0. The unassigned half never worked.

**u09: local skill search 503.**

- **Cause:** not a product bug. The editor reads one ready-made skill list from the worker (`GET /skills`). A daily
  job builds it and writes it to production storage only, so a local worker's store is always empty.

**u10: an unreadable `config.ts` read as absent.**

- **Cause:** the settings reader `loadSourceConfig` returns "no file" for a file that exports nothing, and checks
  only the settings fields. `search` and `eject` then read past a broken config.
- **Fix:** it checks the full schema and refuses with the full reader's wording. Across 21 file shapes, `search`
  and `eject` now agree with `list`.

**u11: the startup band contradicts itself.**

- **Cause:** stack ids pass through `resolveAgentConfigToSkills`, which warns "may be a custom or local skill". The
  stack-level sentence added in 0.159.0 sits beside it.
- **Fix:** read the stack ids straight from its assignments.

**u12: `branding` dropped.**

- **Cause:** `mergeConfigs` copies back a fixed list of fields from disk, and `branding` isn't on it. The same list
  also drops `skillsDir`, `agentsDir`, `stacksFile`, `categoriesFile` and `rulesFile`.
- **Fix:** keep `branding`, and keep it off the global half.

**u13: `uninstall` over two source folders.**

- **Cause:** `uninstall` removes only the folder it reads and leaves the other, which `list` then reports as an
  installation until a second `uninstall`.

**u14: `edit` omits the trust line.**

- **Cause:** `Edit.applyEdit` compiles but never calls `hostCompileNotices`.
- **Fix:** call it at both endings that write.

## The patches

All in `todo/plans/2026-10-02-journey-fixes/`:

- **Reused as is:** `u04`, `u08`, `u11`, `u12`, `u14`.
- **Reused and extended:**
  - `u01`, plus `round2/u01-edit-from-keeps-global-rows.proto.diff` and the `--from` list;
  - `u02`, plus `round2/u02-plugin-halves.proto.diff`;
  - `u10`, plus either config, the new message and `eject`.
- **Replaced:**
  - u03 by `round2/u03-description-only.diff`;
  - u05 by `round2/u05-label-only.proto.diff`;
  - u06 by `round2/u06-require-marketplace-json.proto.diff`;
  - u07 by new work, honouring the flag instead of refusing;
  - u09 by `round2/u09-dev-builds-skill-index.proto.diff`;
  - u13 by `round2/u13-uninstall-clears-both.diff`.
- **Also in scope:** `round2/share-names-custom-marketplace.diff` and `round2/from-prints-load-warnings.proto.diff`.
- `all-14-combined.diff` is round 1 as it stood. It passed every gate in a scratch copy, but it predates the rulings,
  so the fix re-runs them.
- **Merge note:** u10 needs journey 38's row to name `lifecycle/config-unreadable-under-install`, or spec-gates
  fails.

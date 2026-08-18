---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/content-validator.ts
  - src/cli/commands/doctor.ts
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/agents/list-compiled-agents.ts
standards_docs:
  - .ai-docs/reference/commands/index.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  Both halves the finding named are closed in source. The LISTING —
  `listInstalledArtifacts` in `src/cli/lib/content-validator.ts` now walks agents through
  `listAgentFilesWithOurProvenance`, which is `splitAgentsByProvenance(agentsDir)` and returns
  `marked` alone, so a hand-authored agent file is no longer named by the row; its sibling
  `listSkillDirsWithOurProvenance` applies the same rule on the skill axis, and both doc comments
  state the invariant this finding proposed ("a listing built any other way could offer a file it
  then refused"). The TIP — the `orphans-unowned` row in `src/cli/commands/doctor.ts` no longer
  says the compiled agents outlive `uninstall`; it reads "or 'agents-inc uninstall' removes them,
  the compiled agents included: each file listed carries this CLI's own provenance, which is what
  that command reads when there is no configuration left", and `STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL`
  in `e2e/pages/constants.ts` was re-pointed to the tip's substantive CLAIM ("removes them, the
  compiled agents included") rather than its lead-in, so the assertion can now see the sentence
  move. Two prose residues survive the fix and are reported rather than closed here, because
  neither is this finding's defect and neither is in a file this pass owns: the `checkUnownedInstallation`
  doc comment in `doctor.ts` still ends "`uninstall` cannot identify compiled agents no config
  declares", and `.ai-docs/reference/commands/index.md` -> "No Orphans has two verdicts" still
  states that `uninstall` "identifies compiled agents only through a config, so it clears the
  skills and leaves the agents" and that the row "names them all". Both are the superseded claim,
  now stated by the document this finding's `standards_docs` points at.
---

## What Was Wrong

`doctor`'s no-config `No Orphans` row lists every installed artefact and tips the reader at
`uninstall`. CLI-517 fixed the SKILLS half of that listing: a skill directory is now offered only
when it carries the `forkedFrom` marker, which is exactly what `shouldRemoveSkill` reads before
removing anything.

**The AGENTS half is untouched and has the same defect.** `listInstalledArtifacts` lists every
`*.md` in the agents directory. `uninstall` does not: with no configuration it removes
`target.markedAgents` — the files carrying the compiler's provenance marker — and prints
`Kept N agent(s) … no agents-inc marker, so this CLI did not compile it` for the rest. So a
hand-authored `~/.claude/agents/code-reviewer.md` is named by `doctor` as something no
configuration declares, under a tip pointing at a command that will refuse it.

Observed in a hand-run on 2026-08-17. One project, no `config.ts`, one CLI-installed skill and one
hand-written agent file:

```
    No Orphans              ✗  1 skill and 1 agent installed here, and no configuration declares them
                               - …/.claude/skills/web-framework-react
                               - …/.claude/agents/web-developer.md
```

then, from `uninstall --yes` in the same directory:

```
Kept 1 agent in …/.claude/agents/ — no agents-inc marker, so this CLI did not compile it.
```

**The row's own tip states the opposite of what the code does.** It reads:

> `uninstall` removes the installed skills (the compiled agents outlive it: identifying them needs
> the configuration that is gone)

`identifiableAgents` in `uninstall.tsx` falls back to `markedAgents` precisely so that compiled
agents can be identified WITHOUT a configuration. The parenthetical was true before that fallback
existed and is now wrong in both directions: it under-promises for a marked agent (which
`uninstall` does remove) while the listing above it over-promises for an unmarked one.

`splitAgentsByProvenance` already carries the correct rule in its own doc comment — "a file that
cannot be read yields no marker and lands in `unmarked`, because 'cannot prove it is ours' and 'is
not ours' call for the same answer". Nothing applies it on the reporting side.

## Fix Applied

None — discovery only. CLI-517's ruling is scoped to skill directories ("a directory is ours if it
carries `forkedFrom`"), and the brief's stated preference where the two errors are in tension is
that over-reporting beats going quiet. Fixing the agents half is a behaviour change to the row's
count, its detail lines AND its tip text, which moves `STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL` and
every spec asserting on it — a task rather than a footnote to this one.

## Proposed Standard

`reference/commands/index.md` documents `doctor`'s rows and `uninstall`'s removal rules in the same
file. It should state the invariant the two commands currently break:

> **A row that recommends a command names only what that command would act on.** `doctor`'s
> unowned-installation listing is an offer to `uninstall`, so its membership rule must be
> `uninstall`'s: `forkedFrom` for a skill directory, the compiler's provenance marker for a
> compiled agent. A file in either list that the recommended command would refuse is the CLI
> disagreeing with itself across two of its own screens, and the reader has no way to tell which
> screen is right.

The rule generalises past these two commands: any tip naming a remedy is a claim about another
command's behaviour, and nothing in the codebase checks that claim. The `orphans-unowned` tip is
the live example — it went stale when `identifiableAgents` grew its marker fallback, and no gate
noticed because tip text is asserted by `toContain` on a prefix that never changed.

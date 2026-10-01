---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/e2e/lifecycle/codex-refusal-on-the-read-path.e2e.test.ts
  - packages/cli/e2e/helpers/test-utils.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/test-data.md
date: 2026-09-22
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The code half landed: the control plants its ejected skill where the host under test reads it,
  through `createLocalSkillIn(skillsDir, id, opts?)`, which `createLocalSkill` delegates to. Neither
  Proposed Standard is written, not the control-owes-a-fixture-that-can-succeed rule for
  `standards/e2e/anti-patterns.md` nor the layout-in-the-signature rule for
  `standards/e2e/test-data.md`.
---

## What Was Wrong

`codex-refusal-on-the-read-path.e2e.test.ts` carries one positive control among six refusals:
"does not stop compile reading an offerable Codex configuration in the same folder". It wrote a
`config.ts` naming one eject-mode skill and asserted `compile` exits `EXIT_CODES.SUCCESS`.

It never put that skill on disk. `discoverInstalledSkills` therefore found nothing, no compile pass
had skills, and `runCompilePasses` in `commands/compile.ts` hard-errored `No skills found` — exit 1,
on a fixture that could not have exited anything else.

**The expensive half is not the fixture, it is what its red looked like.** The spec sat beside a
lane that had just landed the Codex sub-agent renderer, and two readings attributed the failure to
that renderer. It is not about Codex at all: the identical configuration under `.agents-inc/claude/`
fails with the same message, and `runCompilePasses` is byte-identical to `HEAD`.

```
# both providers, one eject row naming a skill that is not on disk
PROBE folder=.agents-inc/codex  exit=1  … Error: No skills found. Run 'npx agents-inc init' …
PROBE folder=.agents-inc/claude exit=1  … Error: No skills found. Run 'npx agents-inc init' …
```

The fixture had already been wrong once in the same way — it declared `skills: []` and `agents: []`,
which `declaresNoContent` reads as no installation, so `compile` refused it with
`No installation found` at both providers alike. Both corrections moved the config and neither
touched the disk.

**Why the fixture reached for the wrong directory.** `createLocalSkill(projectDir, id, opts?)`
composes `<projectDir>/.claude/skills/<id>/` — Claude's layout, by name, in its body rather than in
its signature. On Codex an ejected PROJECT skill lives at `<repo>/.agents/skills/<id>/`, which is
what `resolveInstallPaths(projectDir, "project").skillsDir` answers for that host. A helper that can
only describe one host produces fixtures that can only describe one host, and the resulting tree
reads to every command as an empty installation rather than as a mistake.

## Fix Applied

`createLocalSkillIn(skillsDir, id, opts?)` in `e2e/helpers/test-utils.ts` takes the directory;
`createLocalSkill` is unchanged in signature and behaviour and now delegates to it. The control
plants its skill through `codexProjectSkillsDir(projectDir)` and compiles green. Both wrong fixtures
and the cross-provider attribution are recorded in the spec's own docblock rather than corrected
silently, because the next reader of that case needs to know the red was never about the provider.

## Proposed Standard

For `.ai-docs/standards/e2e/anti-patterns.md`:

**A control asserting SUCCESS owes a fixture that can succeed.** A refusal spec's paired positive
case is the only thing separating a correctly-scoped guard from one that swallowed its domain, so a
control that cannot pass for a reason unrelated to the guard is worse than none: it is a standing
red that the next change to land nearby will be blamed for. Before asserting an exit code on a
control, name what the command needs on disk and put it there — for `compile`, at least one skill
discovery can find.

**And when a control does redden, run it against the other arm before attributing it.** This file's
own pair is the instrument: the same fixture under the other provider's folder answered the
question in one run, and no amount of reading the renderer diff would have.

For `.ai-docs/standards/e2e/test-data.md`, beside the existing helper rules:

**A fixture helper that composes a host's path describes only that host.** Where a value is a fact
about the layout rather than about the thing being planted, it belongs in the signature. The
existing rule already says to grep `e2e/helpers/test-utils.ts` before writing a helper; this is its
other half — finding one whose name fits is not enough when its body has a provider baked in.

This does not conflict with `packages/cli/CLAUDE.md`. It is the fixture-side statement of the rule
already there for product code — "ALWAYS use `resolveInstallPaths(projectDir, scope)` with the
explicit scope parameter" — which the e2e helpers were never held to.

## Correction — 2026-09-25

**`status` moved from `resolved` to `partial`: the fix landed and the Proposed Standard did not.**
`README.md` → "Resolution Model (authoritative)" makes that `partial`, and
`grep -rniE 'fixture that can succeed|provider baked in' .ai-docs/standards`, run from
`packages/cli`, answers nothing. The `resolved_by` it carried is recorded here rather than kept
beside a status it no longer pairs with:

```text
resolved_by: >-
  The control now plants its ejected skill where the host under test reads it, through a new
  `createLocalSkillIn(skillsDir, id, opts?)` that `createLocalSkill` delegates to. The spec's
  docblock records both wrong fixtures and the cross-provider control that attributes the red.
```

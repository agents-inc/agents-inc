---
type: architectural-drift
severity: high
affected_files:
  - src/cli/lib/seed/seed-to-wizard.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/configuration/config-writer.ts
standards_docs:
  - .ai-docs/reference/config/scope-split.md
  - .ai-docs/reference/features/seed-contract.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code landed, one doc note pending. The owner ruled `init --from` greenfield-only (2026-08-06),
  which removes the cross-install reach, and the within-payload residual is now a hard error at
  decode naming both the skill and the sub-agent — the "report it" posture proposed below, taken to
  refusal rather than a warning. Still pending: the note this finding asks for in
  `reference/config/scope-split.md`, that the project writer re-filters what `splitConfigByScope`
  put in `projectStack`. Reading the split alone still tells you those rows survive.
---

## What Was Wrong

`init --from` accepts a payload whose `(skill scope, sub-agent scope)` pair the config model
forbids, and then silently drops the curation the pair cannot express.

The config model's rule is one line — `isScopePairCompatible` in
`src/cli/lib/configuration/config-generator.ts`: "Project skills never reach global agents." The
ownership-derived stack builder honours it: `buildAgentStack` filters every assignment through
`isScopeCompatible` before it can land.

`init --from` does not go through that builder. `seedToWizardResult` builds an `assignedStack`
straight from the payload's `assignments` map, and `resolveStackProperty`
(`src/cli/lib/installation/local-installer.ts`) REPLACES the derived stack with it wholesale —
deliberately, because the assignments are the curation a shared configuration exists to carry. No
scope check runs on that path. A payload pairing a project-scoped skill with a global sub-agent
therefore reaches `splitConfigByScope` carrying rows the model says cannot exist.

What happens next loses them without a word:

1. `splitConfigByScope` sends a global agent's non-global assignments to `projectStack` (correct per
   `.ai-docs/reference/config/scope-split.md`).
2. The project config writer then filters `project.stack` to **project-scoped agents only** — the
   `filteredStack` step in `src/cli/lib/configuration/config-writer.ts`, whose own comment says
   "global agents' stack entries live in the global section".
3. Those rows are not in the global section either: the global half of `splitAgentStack` keeps only
   assignments whose skill id is in `globalSkillIds`, and these are project skills.

The user is told nothing. `init --from` reports "Installing N skill(s) across M sub-agent(s)", exits
0, and writes a config whose `stack` key is simply absent.

**Why this is newly reachable.** Before EDITOR-12 the seed decode defaulted a bare sub-agent to
`project`, so a payload's project-scoped skills met project-scoped agents and the pair was always
compatible. The default is now `DEFAULT_SELECTION_OPTIONS.scope` (`global`), so the incompatible
combination is what a payload produces _by default_ the moment a user pins one skill to project
scope while leaving its sub-agent at rest. That is an ordinary editor gesture, not a corner case.

**How it was observed.** All five specs in `e2e/commands/init-from-scenarios-curation.e2e.test.ts`
and the pre-condition in `e2e/commands/eject-preserves-exclusive-stack.e2e.test.ts` failed with
`expected undefined to strictly equal { ... }` on the project config's `stack` — the whole
curation gone, from payloads that had said exactly which sub-agent holds which skill at which load
state.

## Fix Applied

None on the product path — discovery only, made while correcting those specs to the landed ruling.

The specs were fixed by pinning `scope: "project"` on the wire, which is the honest arrangement for
a spec whose subject is the project's own stack. That makes them pass because the payload now asks
for something the model can express; it does not make the dropped-curation path any less reachable
for a user.

## Proposed Standard

A decode may not hand the install pipeline a `(skill, agent)` pair the config model refuses. Pick
one of two postures and write it into `.ai-docs/reference/features/seed-contract.md` beside the
`assignedStack` section, which currently explains why the assigned stack replaces the derived one
without saying what happens to rows the scope model rejects:

- **Report it.** `seedToWizardResult` already has a reporting channel for what a payload asked for
  and this catalog could not do — `skippedSkillIds` / `skippedAgentNames`, surfaced by name because
  "a count cannot be acted on". A third list for scope-incompatible assignments would use the same
  channel and the same reasoning. This is the smaller change and matches the existing skip-don't-
  fail policy.
- **Or resolve it.** Treat a payload that assigns a project-scoped skill to a sub-agent naming no
  scope as evidence the sub-agent belongs in the project, and decode it that way. This has the
  merit of doing what the sharer plainly meant, but it makes the scope default depend on the
  skills around it, which is exactly the kind of multi-tier resolution `packages/cli/CLAUDE.md`
  bans under "Data Integrity".

Either way, the silent third outcome — accept, split, and drop at the writer — is the one that must
not stay. `.ai-docs/reference/config/scope-split.md`'s stack table should also record that the
project writer re-filters what `splitConfigByScope` put in `projectStack`, since reading the split
alone tells you those rows survive.

## Outcome (2026-08-06)

The owner chose neither posture as written and took a third: **refuse**. `init --from` is
greenfield-only, so the cross-install reach is gone, and within a single payload `seedToWizardResult`
now throws — naming every `(skill, sub-agent)` pair the model cannot hold, both halves of each,
because either one is what the sharer might change. The reasoning against "resolve it" stands and is
why no auto-correct was added: making a sub-agent's scope depend on the skills around it is the
multi-tier resolution `packages/cli/CLAUDE.md` bans.

Reporting it as a skip was rejected for a reason worth keeping: `skippedSkillIds` exists for content
this catalog does not HAVE, and a warning there is honest because nothing could have been installed.
An unwritable pair is content the catalog has and cannot place — the user could have had it, by
re-sharing with one field changed — so a warning would be describing a loss it was choosing to take.

Documented in `reference/features/seed-contract.md` under "An unwritable `(skill, sub-agent)` pair
throws"; specced in `seed-to-wizard.test.ts` and `e2e/commands/init-from-greenfield.e2e.test.ts`.

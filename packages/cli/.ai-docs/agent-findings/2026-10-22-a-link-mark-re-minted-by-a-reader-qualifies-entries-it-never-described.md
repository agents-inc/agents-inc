---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/seed/installation-payload.ts
  - apps/editor/src/features/configure/lib/seed.ts
  - apps/editor/src/features/configure/lib/held-global.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: >-
  Only a bare `edit` run in a project marks its link (`editorPayloadForInstallation` in
  installation-payload.ts); `share` and the editor's `toSeedPayload` never do. Pinned by
  installation-payload.test.ts, share.test.ts, edit-ui.test.ts, share-from-project.e2e.test.ts,
  held-global.test.ts and the editor's project-link.spec.ts.
---

## What Was Wrong

`fromProject: true` on a seed payload is one boolean, and the editor reads it as "every global
entry in this link is the global install, so hold it". The payload has no list of which entries
that means. The boolean was correct where it was first set: a bare `edit` minted inside a project,
whose global entries are exactly what that project's run cannot change.

It was then set in two more places, and in each the boolean was read again against a set it never
described:

- `share` minted through the same function as `edit` (`seedPayloadForInstallation`), so a shared
  link was marked too. Its recipient's global install is their own, but the editor held the sharer's
  global entries for them.
- The editor's `toSeedPayload` kept the mark while anything was held. A skill picked new in a held
  session rests at `scope: "global"` (`DEFAULT_SELECTION_OPTIONS`), so it came back held when the
  editor's own link was reopened, with "Installed globally, so this project can't switch it off."
  and nothing installed it. `globalAgentsOf` did the same to a sub-agent switched on in that session.

Every spec stayed green: each pinned the mark being present, which it was.

## Fix Applied

The mark is set at the one call site whose meaning it carries. `editorPayloadForInstallation` marks
a bare `edit`'s payload when it was read from a project's config; `seedPayloadForInstallation`
(`share`'s) and the editor's `toSeedPayload` never mark. A link the editor mints in a held session
now opens with nothing held. Failing specs first: the share envelope, the editor's re-minted link,
and a skill and a sub-agent picked while held reopening free.

## Proposed Standard

`docs/architecture.md`, beside "The contract is `packages/matrix/src/seed.ts`": a payload field
that qualifies a set of entries without listing them (a flag about where or by whom a link was
minted) is set only by the minter it describes. A reader that re-mints the payload does not copy it
forward, because the next payload's entries are not the ones the flag was true of. This does not
conflict with any CLAUDE.md rule; nothing there covers payload fields a reader re-emits.

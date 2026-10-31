---
type: missing-standard
severity: low
affected_files:
  - packages/cli/e2e/commands/update.e2e.test.ts
  - packages/cli/e2e/pages/constants.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/assertions.md
date: 2026-10-30
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  The four negatives on the retired line are deleted with the STEP_TEXT constant mirroring it, the
  unit spec's copy of it and its README roster entry; nothing prints the line, so none could fail.
---

## What Was Wrong

`update` used to end on `marketplacesRefreshed` ("Refreshed N marketplace listings. Installed plugins
were not changed."). CLI-918 made it update plugins too, so the success line became `refreshedAndUpdated`
in `commands/update.ts` ("✓ Refreshed N … and updated N …"). `update.e2e.test.ts` ("Claude CLI not
found" case) guards against a false success claim with
`not.toContain(STEP_TEXT.UPDATE_PLUGINS_UNCHANGED)`. That constant mirrors only the retired line, so the
check can no longer fail: printing the new success line after a failed run would pass it.

Reproduce: `grep -rn "Installed plugins were not changed" src --include='*.ts' | grep -v test` finds only
`marketplacesRefreshed`, and `grep -rn "marketplacesRefreshed(" src | grep -v test` finds only its
definition.

The signal was there: `tested-exports-reach-production.test.ts` went red on `marketplacesRefreshed` the
moment its last caller went. Nothing told the author to follow that red to the message's mirror in
`e2e/pages/constants.ts` and to the negatives built on it.

## Fix Applied

Deleted rather than repointed: `STEP_TEXT.UPDATE_PLUGINS_UNCHANGED` and its e2e README roster entry,
`PLUGINS_UNCHANGED` in `update.test.ts`, and the four `not.toContain` checks on them (`update.e2e.test.ts`,
`update-leaves-installed-plugins-as-they-were.e2e.test.ts` twice, `update.test.ts`), with the test names
that claimed them. Census: `grep -rn "PLUGINS_UNCHANGED" src e2e` finds nothing.

## Proposed Standard

This is the second case of the class in
`2026-10-20-removing-a-default-hook-left-a-negative-about-its-notice-with-no-subject`, whose proposed
sentence never landed in `assertions.md`. Proposed, under "A negative over tool output quotes the tool's
own string": a change that retires or rewords a product message greps `e2e/pages/constants.ts` for its
mirror and visits every `not.toContain` on it. Each negative then guards the intent against the new text,
or it is deleted. Census for any message:
`grep -rn -B2 "STEP_TEXT.<KEY>" e2e src | grep "not.toContain"` (`-B2` because a wrapped `expect` puts
the constant on the line after `not.toContain(`).

No honest gate: messages built by templates, oclif or Ink never appear word for word in `src`, so a
"mirror has a printer" scan both misses and false-flags.

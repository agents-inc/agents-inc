---
type: anti-pattern
severity: medium
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/fixtures/cli.ts
  - e2e/helpers/terminal-session.ts
  - e2e/commands/edit-from.e2e.test.ts
  - package.json
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-19
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  All three spawn doors now spread `NO_BACKGROUND_VERSION_CHECK` from
  `e2e/helpers/test-utils.ts`, which sets `AGENTS_INC_SKIP_NEW_VERSION_CHECK=1`. Proved by
  mechanism rather than by the green test: across a full 811-test e2e run, a 20ms process-table
  scan recorded zero version-refresh children, and the same scanner caught one immediately in a
  control run with the variable removed.
---

## What Was Wrong

Every one of the three sites that spawns the built binary curates the environment it hands over,
and each carries a paragraph explaining a variable it sets or clears — `CC_MARKETPLACE` because a
developer's export would repoint `init`, `VITEST` because it silences the warnings a spec asserts
on, `CLAUDE_CONFIG_DIR` because it beats `HOME`. All three paragraphs are about what goes IN.
Nothing had ever asked what the binary leaves BEHIND once it exits.

It leaves a writer. `@oclif/plugin-warn-if-update-available` is registered in `package.json`'s
`oclif.plugins`, and its `init` hook ends:

```js
if (await refreshNeeded()) await spawnRefresh();
```

`spawnRefresh` calls `spawn(process.execPath, [...], { detached: true, stdio: 'ignore' }).unref()`.
Nothing awaits it. The child's first act is `writeFile(file, JSON.stringify({ current: version }))`
against `<cacheDir>/version` — before its network call, so it lands whether or not the registry is
reachable. Under a fake HOME, `cacheDir` is `<HOME>/.cache/agents-inc`, and where a spec collapses
HOME onto the project directory, that is inside the tree the spec is watching.

So a spec that snapshots a tree, runs the CLI, and snapshots again is racing a process it never
declared. Measured against a temp HOME, five runs out of five: the parent exited at 704–750ms and
the version file appeared at 720–766ms — a 16ms window, reliably on the wrong side of a snapshot
taken immediately after the run returns.

`e2e/commands/edit-from.e2e.test.ts` → "leaves the installation byte-identical" is the one spec
that compares a tree to itself, so it is the one that could see it:

```
+ ".cache/agents-inc/version": { "content": "{\"current\":\"0.155.0\"}" }
```

**It reads as a product regression and is not one.** The refusal removed nothing; a background
process wrote a file the assertion had no reason to expect. The trigger was unrelated: `init.ts`
lost work this session, the parent exited sooner, and that moved where the detached write landed
relative to the two reads. The defect is that the race existed at all, and it existed for the life
of the suite — 810 specs, one temp HOME each, one detached spawn per invocation.

A second-order effect is visible from the process table: those children outlive the directory they
write into. One was still alive minutes after its temp HOME had been deleted, parked on a 5s
registry request that never resolved in this environment, and its argv still named the removed
path. The suite has been leaking one per CLI invocation.

## Fix Applied

`NO_BACKGROUND_VERSION_CHECK` in `e2e/helpers/test-utils.ts`, spread first at each of the three
spawn sites — `runCLI` in the same file, `CLI.run` in `e2e/fixtures/cli.ts`, and `TerminalSession`
in `e2e/helpers/terminal-session.ts`. **There is no single door**, which is worth saying plainly:
the three env blocks are the whole population, they are already near-duplicates of one another,
and a fourth would silently miss this.

The key is `AGENTS_INC_SKIP_NEW_VERSION_CHECK`, computed rather than guessed —
`Config.load(...).scopedEnvVarKey("SKIP_NEW_VERSION_CHECK")` returns it, and
`scopedEnvVarKeys` returns that one name alone because this package declares no `binAliases`. It
was set nowhere before this change.

Verified by mechanism, because a passing spec would only have shown the race landing the other way:

| Measurement                                             | Without the variable   | With it                   |
| ------------------------------------------------------- | ---------------------- | ------------------------- |
| `<HOME>/.cache/agents-inc/version` appears              | 16ms after parent exit | never, waiting 5s (~300×) |
| plugin's own `debug('spawning version refresh')`        | emitted                | absent                    |
| `get-version` process observed in the process table     | yes, pid captured      | none                      |
| version-refresh children during a full 811-test e2e run | —                      | zero, sampled every 20ms  |

The negative carries its own subject guard: the same scanner, run against one invocation with the
variable removed, logged the child with its full argv on the first sample. An empty log from an
instrument never seen to report anything would prove nothing.

**`readTreeSnapshot` was deliberately left alone.** Excluding the oclif cache directory from it was
considered as defence in depth and rejected: the env fix removes the writer at source, while an
exclusion would mask a symptom AND blind the only thing that noticed. That snapshot is now the
detector for this whole class — it is what turned a silent 810-test race into a reproducible red,
and it would redden again if the scoped key stopped being the right one (a rename of `oclif.bin`
does exactly that). A filter in a shared helper answering "found nothing" is also the precise shape
the assertion rules refuse elsewhere; adding one to a helper is worse than having one in a spec,
because every caller inherits it and none of them says so.

## Proposed Standard

**A harness that spawns a binary owes an account of what the binary writes after it exits, not
only of what it is given.** The existing env commentary is a model of the first half and silent on
the second. The concrete rule for `.ai-docs/standards/e2e/README.md` § Critical Rules, beside the
state-change verification rule it qualifies:

> A `readTreeSnapshot` / `readCompiledAgents` comparison asserts that **nothing** wrote to a tree,
> and the CLI is not the only thing that can. Any plugin registered in `oclif.plugins` runs on
> every invocation and may write outside the command's own output — `plugin-warn-if-update-available`
> spawns a detached child that writes `<cacheDir>/version` after the process has exited. A new
> entry in `oclif.plugins` is therefore a change to the E2E harness's environment, and the harness
> must be given whatever switch disables its side effects before the plugin lands. Silence them at
> the spawn site, never by filtering the snapshot: a snapshot that filters is a snapshot that
> cannot report the next one.

The general shape, which is not specific to oclif: **the thing that makes a background writer
invisible is that it is not the subject of any spec.** Nothing owns it, so nothing asserts about
it, so the only way it surfaces is as someone else's flake — attributed, when it finally lands, to
whatever change last moved the timing. The `edit --from` failure was read as a regression in a
command that had not changed.

This does not conflict with any CLAUDE.md NEVER/ALWAYS rule. It extends "ALWAYS verify config AND
filesystem after any operation that changes either" with the case that rule leaves open: the
operation that changed neither, and a third party that changed one anyway.

---
type: convention-drift
severity: high
affected_files:
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/architecture-overview.md
  - .ai-docs/reference/features/built-in-catalogue.md
  - .ai-docs/reference/features/skills-and-matrix.md
  - .ai-docs/reference/features/plugin-system.md
  - .ai-docs/reference/testing/harness-decisions.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`init`'s marketplace flag is `--marketplace` / `-m` and the environment rung is `CC_MARKETPLACE`.
`Init.static flags` (`src/cli/commands/init.tsx`) declares `marketplace` and `from` and nothing else;
`SOURCE_ENV_VAR` (`src/cli/lib/configuration/config.ts`) is `CC_MARKETPLACE`, and `readEnvSource()`
is its only reader. The hook's raw-argv scan (`src/cli/hooks/init.ts`) names three spellings —
`-m`, `--marketplace`, `--marketplace=` — and its own spec binds `-s` as `WITHDRAWN_FLAG_SHORT`.

Six reference documents still describe the withdrawn spellings as live:

| Document                                 | What it still claims                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `reference/boundary-map.md`              | A section headed "`init`'s Flag: `--source`", plus nine further `--source` / `-s` mentions                               |
| `reference/architecture-overview.md`     | The hook "extracts `--source` / `-s` from raw argv"; the precedence block leads with `--source flag > CC_SOURCE env var` |
| `features/built-in-catalogue.md`         | The custom-source row reads `init --source`, `CC_SOURCE` at init                                                         |
| `features/skills-and-matrix.md`          | `"init"` unlocks "the `CC_SOURCE` env var"                                                                               |
| `features/plugin-system.md`              | `build plugins` described as carrying "no `--source`"                                                                    |
| `reference/testing/harness-decisions.md` | "`--source` is `init`'s alone"; a source cannot be selected "with `CC_SOURCE`"                                           |

Two of those are false twice over. `--source` / `-s` are not merely renamed, they are withdrawn with
no alias — oclif refuses them (`Nonexistent flag: --source`, exit 2), which
`e2e/commands/source-flag-is-init-only.e2e.test.ts` and `e2e/commands/help.e2e.test.ts` both assert.
So `architecture-overview.md`'s hook sentence names a flag the hook does not scan for AND a short
form the hook's spec exists to prove is dead, and `boundary-map.md`'s "the one command that declares
`--source` / `-s`" attributes to `init` the one thing `init` refuses.

**The corpus now disagrees with itself, in both directions.** `features/configuration.md` states the
correction outright — "The flag is `--marketplace` and the variable is `CC_MARKETPLACE`. Neither
`--source` nor `CC_SOURCE` exists" — and `reference/commands/index.md` carries a callout saying the
spellings were withdrawn and have no alias. A reader who lands on the refutation and a reader who
lands on `boundary-map.md`'s section heading get opposite answers about the same flag, and neither
page says the other exists.

## Fix Applied

None here. The three E2E standards pages that spelled `--source` (`patterns.md`, `test-structure.md`,
`page-objects.md`) were corrected in the pass that found this, along with `standards/e2e/test-data.md`;
the six reference documents above are a sweep and were left whole rather than patched piecemeal, per
the owner's standing instruction that sweep findings are compiled and root-caused before anything is
changed. The `--source` mentions in `standards/e2e/anti-patterns.md` and `reference/commands/edit.md`
are correct as written and must NOT be swept: both quote the refusal (`Nonexistent flag: --source`)
that a live spec asserts, so the withdrawn name is the subject of the sentence rather than a claim
that it works.

## Proposed Standard

A withdrawn flag is a worse rename than a renamed one, because the two look identical in a grep and
only one of them can be swept by search-and-replace: the surviving mentions split into the ones that
are now false and the ones that are now the _point_ of the sentence. `documentation-bible.md`'s
doc-touching hook table already has a flag-removal row; what it does not say is that a removal sweep
must be read rather than run, and that the deliverable is a decision per hit — false claim, quoted
refusal, or historical note — not a global substitution.

Second, narrower: **a page that states a correction should be findable from the pages it corrects.**
`features/configuration.md` has held the right answer for long enough that six documents could drift
past it. A correction that only the already-informed reader finds is not a correction; the pages that
carry the superseded claim are exactly the ones that need the cross-link, and `related:` is where it
goes.

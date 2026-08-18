---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/seed/fetch-seed.ts
  - packages/cli/e2e/commands/init-from-shared-config.e2e.test.ts
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-510. All three halves together, as the finding said they had to be. `fetch-seed.ts` now
  reads "Configuration '<id>' is not in a format this version of the CLI can install. Shared ids
  are never migrated — re-share the configuration to mint a current one, or update the CLI if
  that id came from a newer version." — the remedy first, no diagnosis of a direction the
  `safeParse` cannot observe. `init-from-shared-config.e2e.test.ts` pins the new sentence on both
  rows that reach it, and the version-refusal spec additionally asserts the remedy is named.
  `seed-contract.md`'s `fetch-seed.ts` failure table and the paragraph under it were rewritten
  from "deliberately specific about the cause" to "names the remedy, and deliberately diagnoses
  no cause", stating that the direction a bump produces in bulk is the older one. Proposed
  standard 3 (the general error-message rule) is NOT landed — see the note at the end.
---

## What Was Wrong

`SEED_VERSION` moved to 5 when EDITOR-03 landed, so under discard-don't-migrate **every id minted
before it stops decoding**. Verified by hand against the built binary, with a v4 payload served by a
stub store:

```
$ node dist/index.js init --from STALEV4
Fetching configuration STALEV4...
 ›   Error: Configuration 'STALEV4' does not match the expected format — it may
 ›    have been created by a newer version.
$ echo $?
1
```

Two of the three things a refusal owes the user are there: it is **loud** (exit 1, `this.error`)
and **nothing is written** — the project directory is still empty afterwards. The sentence itself
is the defect, in two ways:

1. **It names the opposite cause.** "created by a newer version" describes a payload from the
   future meeting an older CLI. The case a version bump actually produces in bulk is the reverse —
   an OLDER id meeting a newer CLI — and that is every id in existence the day v5 ships. A user
   reading it concludes their CLI is out of date and upgrades, which cannot help.
2. **It names no fix.** Under this contract the remedy is always the same and always available:
   re-share the configuration, which mints a new id under the current version. The message never
   says so, and there is nothing else in the output that does.

`seed-contract.md` calls the wording deliberate — _"The schema-failure message is deliberately
specific about the cause. The payload was validated by the worker on the way in ... so a stored
payload that no longer parses means the contract moved underneath it"_ — and it was, for the
direction that was true when it was written. The premise "the contract moved underneath a stored
payload" is exactly what a `SEED_VERSION` bump does, and the sentence draws the wrong conclusion
from it.

The same row also carries a genuinely malformed body and a payload from a genuinely newer CLI, and
the doc records that deliberately (a v1 id and a broken body produce one sentence). That is not
what makes this worth fixing — one sentence for three causes is fine when it names a remedy that
covers all three.

## Fix Applied

**At discovery: none, deliberately.** The wording was a documented invariant with a spec pinned to
it (`init-from-shared-config.e2e.test.ts` asserts the version refusal and the malformed body land on
the same message), so changing it meant changing `fetch-seed.ts`, that spec and the
`seed-contract.md` table row together. CLI-507's brief forbade editing `.ai-docs/**` outside this
directory, so a code-only change would have left the doc asserting a sentence the source no longer
carried — which is worse than the misdirection.

Found while implementing CLI-507, whose own brief asks that v5's invalidation "fail loudly in a way
that names the fix, never silently". It failed loudly. It did not name the fix.

**Landed under CLI-510**, with the three halves changed together — see `resolved_by:`. The wording
is the finding's proposal tightened: "is not in a format this version of the CLI can install"
rather than "does not match the expected format", because a payload that fails one build's schema
and passes another's is not malformed, it is not this one's; and "re-share the configuration to
mint a current one" leads, with the upgrade named second and conditionally.

## Proposed Standard

1. **Reword the schema-failure message so it names the remedy rather than a diagnosis it cannot
   make.** Something in this shape, which covers all three causes that land in the row and gives
   every one of them an action:

   ```
   Configuration '<id>' is not in a format this version can install. Shared ids are never
   migrated — re-share the configuration to mint a new one, or update the CLI if it was
   shared by a newer version.
   ```

2. **Into `seed-contract.md` § "Version Policy: Discard, Do Not Migrate":** a version bump
   invalidates every id already minted, so the refusal a stale id gets is the ONLY user-facing
   consequence of the bump and is part of the bump. Whoever moves `SEED_VERSION` re-reads that
   sentence and checks it still describes the direction the bump creates.

3. **General rule, for `standards/clean-code-standards.md`'s error-message section:** a refusal
   that diagnoses a cause it cannot observe is worse than one that names only the remedy. The CLI
   cannot tell "older payload" from "newer payload" from "corrupt payload" — all three are one
   `safeParse` failure — so the message must not pick one.

**Standards 1 and 2 landed; standard 3 did not.** CLI-510's brief scoped the `.ai-docs/**` edit to
this defect's own sentence, and `standards/clean-code-standards.md` is a different document about a
class of message rather than this one. It is still owed, and the whole of it is the paragraph above.

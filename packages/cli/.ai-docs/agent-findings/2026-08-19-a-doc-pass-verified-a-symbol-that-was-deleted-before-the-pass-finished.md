---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/architecture-overview.md
  - .ai-docs/reference/commands/index.md
  - src/cli/hooks/init.ts
  - src/cli/base-command.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

A documentation pass read `src/cli/hooks/init.ts`, confirmed `extractSourceFlag` was declared there,
and wrote a corrected paragraph naming it. Roughly ten minutes later, in the same session, the symbol
was gone: a concurrent code sweep had reduced the hook to the bare-`cc` dashboard, removing the
pre-parse argv extraction, the `resolveSource` call, the `ConfigWithSource` boundary cast and
`BaseCommand.sourceConfig` with it.

**The verification was correct when it was performed and false when it was committed.** Nothing in
the pass was careless — the file was read in full, the symbol was confirmed against source, and the
sentence was written from what was on disk. The bible's identifier-resolution check
(`grep -rnw '<symbol>' src e2e scripts`) is specified per name, which reads naturally as "check as
you write"; run at that moment it returned the declaration.

The failure is only visible from a check run at the END of the pass. Re-running the camelCase
extraction over every edited document as a final step is what surfaced it:

```
grep -rhoE '`[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*`' <doc> | tr -d '`' | sort -u |
  while read -r s; do grep -rqw "$s" src e2e scripts || echo "$s"; done
```

**Two hazards, and the second is worse.** The first is the dangling symbol, which fails loudly the
first time a reader greps for it. The second is that the surrounding paragraph's _architecture_ also
went stale — `boundary-map.md` § 1.2 documents a trust boundary that no longer exists, and neither
the path nor any other symbol in it changed, so path verification and identifier resolution both
pass over a section describing machinery that was deleted. That is the shape the bible already names
under "A Name in a Document Is a Claim About Source": a rename or deletion leaves every heading,
path and count intact.

A concurrent refactor makes this systematic rather than incidental. A doc agent and a code agent
working the same session are two writers with no shared clock, and the doc agent's inputs are the
code agent's outputs.

## Fix Applied

The symbol this pass introduced was removed rather than left dangling, and § 1.2 now opens with a
stale-section warning naming what replaced the machinery and the grep that re-derives it, because
rewriting the section outright would have meant documenting an uncommitted refactor. The
architecture-side correction belongs to the sweep doing the removal;
`2026-08-09-the-init-hook-resolves-a-source-for-a-reader-that-does-not-exist` already names
`boundary-map.md` and `commands/index.md` in its `standards_docs:` and is the tracking record.

## Proposed Standard

1. **`documentation-bible.md` -> A Name in a Document Is a Claim About Source: state that check 2 is
   a pass-level gate, not a per-edit one.** Extract and resolve every backticked identifier across
   all edited documents as the LAST step before reporting, after the final gate run. A per-name
   check performed while writing cannot see a deletion that lands afterwards, and a long pass over a
   live tree is exactly where that happens.

2. **A doc pass that finds a symbol it verified has since vanished must treat the enclosing SECTION
   as suspect, not just the sentence.** The vanished name is the only signal the reader gets; the
   architecture claims around it changed silently and no check covers them. Re-read the module
   before repairing prose, and where the replacement is uncommitted, say the section is stale and
   name the re-derivation rather than describing a refactor still in flight — a confidently wrong
   description of new machinery is worse than an admitted gap.

3. **Where a brief dispatches doc and code agents over the same files in one session, it should say
   which side owns the doc update for the code being changed.** This brief did so for the files it
   named, and the collision landed on a file it did not — `src/cli/hooks/init.ts` was in neither
   agent's stated territory list.

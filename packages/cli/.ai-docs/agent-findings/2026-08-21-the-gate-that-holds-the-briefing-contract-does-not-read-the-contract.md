---
type: standard-gap
severity: low
affected_files:
  - packages/cli/scripts/check-briefing-contract.ts
  - packages/cli/scripts/check-briefing-contract.test.ts
  - packages/cli/.ai-docs/standards/briefing.md
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-08-21
reporting_agent: general-purpose
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: the link population is now a `linkingDocuments()` set holding the contract alongside the two `CLAUDE.md` files, kept separate from the `BINDING_DOCUMENTS` that `unbound()` judges; two fixture cases and the reverse of this finding's own mutation are the evidence
---

## What Was Wrong

`scripts/check-briefing-contract.ts` exists so that the rules an agent is handed stay reachable from
the files an agent is told to open. Its `BINDING_DOCUMENTS` are the two `CLAUDE.md` files, and its
`dangling()` scan reports any link in those two documents whose target is not on disk.

**`standards/briefing.md` — the document the whole check exists to protect — is not in that set, so
the pointers it writes are unread.** The scan reaches the contract only as a link TARGET, never as a
source of links, which means the file may point a reader anywhere and stay green.

Measured, both directions, on 2026-08-21, **against the tree as it stood before the fix below**:

```
# a link to a path that does not exist, appended to the contract itself
printf '\n[x](../../../../todo/plans/a-file-that-is-not-there.md)\n' >> .ai-docs/standards/briefing.md
bun x vitest run scripts/check-briefing-contract.test.ts     # wholly green

# the same appended line in a document the scan does read
printf '\n[x](./.ai-docs/standards/a-file-that-is-not-there.md)\n' >> CLAUDE.md
bun x vitest run scripts/check-briefing-contract.test.ts     # 1 failed, naming the target
```

Both appends were reverted and the files confirmed byte-identical to their backups.

The reader is not broken — the second run proves it works and names the path. What is narrow is the
population it is pointed at. This is the shape the contract's own rule 5 is about: "the gate holds
that these rules stay reachable" reads as a claim over the contract and its two bindings, and holds
over the two bindings only.

**No live dangle existed**, which is why the severity is low rather than the failure being visible:
the contract cites every path in backticks and writes no markdown file links at all — one match,
and it is an in-page anchor, which the scan correctly declines to judge:

```
grep -onP '\[[^\]]*\]\([^)]*\)' .ai-docs/standards/briefing.md
```

**That command is `-P` deliberately.** `grep` here is ugrep, which matches neither `\(` nor `[(]`
against a literal parenthesis, so the BRE and ERE spellings of this pattern return no output at all
rather than the one anchor — a command that reports "no links" for a file that has one, which is
the shape of failure this whole standard exists to catch. Check with `grep --version` before
trusting a paren-bearing pattern in this repository.

The gap was latent, and it is exactly the kind that surfaces the first time somebody adds a
convenience link to a file another lane later moves.

## Fix Applied

**Two passes.** The lane that found this owned neither checker file, so it reported the change
rather than making it (`standards/briefing.md` rule 11) and landed only the honest statement of
scope in the contract. The lane that owned `scripts/check-briefing-contract.{ts,test.ts}` then
applied the proposal below as written.

`linkingDocuments(bindingDocuments, briefingContract)` is now what the link scan iterates.
`BINDING_DOCUMENTS` is untouched and still the population `unbound()` judges, because the two ask
different questions and merging them would demand the contract link itself.

The scope paragraph in `standards/briefing.md` was rewritten in the same change, since the fix
falsified it — it had said the pointers in that file are not scanned, which was true when written
and is the `premise-expired` shape one layer up from this finding.

Red-then-green, the reverse of the measurement above and run against the real tree:

```
printf '\n[x](../../../../todo/plans/a-file-that-is-not-there.md)\n' >> .ai-docs/standards/briefing.md
bun x vitest run scripts/check-briefing-contract.test.ts   # 1 failed, naming todo/plans/a-file-that-is-not-there.md
```

The append was reverted and the file confirmed byte-identical to its backup with `cmp`.

**One thing the fix surfaced that the proposal did not predict.** Reading the contract as a link
source made a refusal collide: the existing case that deletes the whole standards directory also
deletes the contract inside it, so `NO_BINDING_DOCUMENT` fired where the suite expected
`NO_STANDARDS_DIRECTORY`. The refusals are now ordered by how specific the repair they name is —
the standards directory is read first, so a tree missing that directory says so rather than sending
a reader to restore one file when the directory is gone. That test went red on the fix and green on
the ordering, and it is the only behaviour change beyond the widening.

## Proposed Standard

**Widen the scan's link population without widening its contract population.** The two sets are
different questions and conflating them would break the check: `unbound()` asks which documents must
LINK the contract, and adding `BRIEFING_CONTRACT` to `BINDING_DOCUMENTS` would demand the contract
link itself, which is meaningless and would fail immediately.

The change is one list and one call site in `scripts/check-briefing-contract.ts`:

- keep `BINDING_DOCUMENTS` as the two `CLAUDE.md` files — it is what `unbound()` is judged over;
- add a second exported constant, `LINKING_DOCUMENTS = [...BINDING_DOCUMENTS, BRIEFING_CONTRACT]`,
  and build `links` from that instead;
- the docblock's "A missing input is a refusal rather than a clean run" reasoning already covers the
  new member, since `linksOf` throws `NO_BINDING_DOCUMENT` for a document that is not on disk — and
  a contract that is not on disk must be the loudest failure the check has.

The spec beside it gains one fixture case in the shape it already uses: a broken link written into
the fixture tree's `standards/briefing.md`, asserted as one `BROKEN_LINK` finding naming that
document. The mutation above is the red-first evidence for it, and it is worth writing that way
round — the case currently passes for the wrong reason, so a test added without first watching the
un-widened checker stay green would not have been shown to test anything.

This does not conflict with any CLAUDE.md NEVER/ALWAYS rule. It does NOT extend the check toward
judging what a brief says, which the contract states plainly is not mechanisable; it holds one more
document to the reachability class the check already owns.

# Every brief was wrong, and the agents caught it — turn that into rules

**Status: the rule set LANDED 2026-08-21 as
[`packages/cli/.ai-docs/standards/briefing.md`](../../packages/cli/.ai-docs/standards/briefing.md),
linked from both `CLAUDE.md` files and held reachable by
`packages/cli/scripts/check-briefing-contract.ts` — whose link scan reads the contract itself as
well as the two `CLAUDE.md` files, widened on 2026-08-21 after the gate was found not to read the
document it exists to protect.** Filed 2026-08-19 out of the
guards-are-not-features round. This file is now the evidence and the decision record behind that
standard rather than a plan; what is still owed is at the bottom.

**Read the evidence below as an anecdote, not a measurement — that is the verification's own
finding.** Briefs and agent reports are prompt text and were never written to the tree, so the
"claim in the brief" column of every table here is unverifiable in principle: nothing on disk can
confirm or refute it, and it is exactly the second-hand sourcing this file is about. What the
2026-08-21 pass could re-derive is the "reality" column, which names live symbols and runnable
commands. Those results are recorded per row below.

## The measurement

Across roughly twenty agent dispatches in one session, **every agent that checked a figure in its own
brief found at least one wrong.** Not most. Every one. The briefs were written carefully, by an
orchestrator holding the whole programme in context, citing findings that had themselves been
verified against source days earlier.

None of the errors was caught by review. All of them were caught by an agent re-deriving from source
instead of trusting the sentence it was handed.

That is a strong enough result to build on, and it cuts both ways: it says the briefing layer is
unreliable **and** it says the re-derivation habit works. The second half is the asset.

## The evidence

Grouped by what kind of wrong it was, because the countermeasures differ.

### 1. A count that was true when it was written

| Claim in the brief                                  | Reality                                                     |
| --------------------------------------------------- | ----------------------------------------------------------- |
| "the helper table is now exactly right, 71 exports" | 72 — one had been moved in by another agent an hour earlier |
| "~43 call sites"                                    | 26; the number counted the surrounding lines too            |
| "28 task IDs across ~16 files"                      | 22 across 8 in the scoped trees                             |
| "three scanner files"                               | three files, **six** scanners                               |
| "21 eslint-disable guards"                          | 32 across 13 files                                          |
| "~15 call sites"                                    | 18                                                          |
| "144 `directoryExists` call sites"                  | 330                                                         |
| "158 tests across 8 files"                          | stale in both the total and the membership                  |
| "the finding says 151 D-NNN across 30 files"        | ~31 across 13                                               |
| the helpers table drift itself                      | grew 3 → 7 **while the agent was working on it**            |

The last row is the important one. This class cannot be fixed by being more careful, because the
number is a fact about a moving tree. **A count in a brief is stale by the time it is read.**

**Re-derived 2026-08-21, and the "reality" column has already moved on** — which is the class
demonstrating itself rather than a correction to it. Three of the figures above, re-run from the
repository root on that date:

```
grep -rIo --include='*.ts' --include='*.tsx' 'directoryExists(' packages/cli/src packages/cli/e2e packages/cli/scripts | wc -l   # 329
grep -rIo --include='*.ts' 'runCLI(' packages/cli/e2e | wc -l                                                                   # 55
grep -rIo --include='*.ts' --include='*.tsx' 'eslint-disable' packages/cli/src packages/cli/e2e packages/cli/scripts | wc -l     # 56
```

Not one matches the number written beside it, in either column, two days later. Neither table above
should be repaired — the rule that came out of it is that the number does not belong in the
sentence at all.

### 2. A symbol that moved or died

| Named                                                            | Actual                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `outdatedForkMetadata` (a rule's whole worked example)           | deleted; file gone                                                                         |
| `resolveSlugsOrSkip(rule.needs, …)` with a `continue`            | `resolveEveryNeed`, taking needs whole or not at all — a _stronger_ guarantee              |
| `SkillConfig.source`                                             | `origin`                                                                                   |
| `generateMetadataYaml` in `commands/new/skill.ts`                | neither symbol nor file exists                                                             |
| `writeScopedConfigs`                                             | replaced by `writeScopedFromWizard` — so dead a test holds it as `A_NAME_NOTHING_DECLARES` |
| a types-bible list "with DefinitelyTyped and laundering entries" | no such list exists                                                                        |
| `scope-boundary-preserved` cited as the enum precedent           | the value is `scope-discipline-deferred`                                                   |

**Verified against source 2026-08-21, row by row, and one row was itself wrong.**

| Row                        | What the tree says today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outdatedForkMetadata`     | Confirmed gone from source. Its one surviving mention, in `reference/testing/factories.md`, is correct prose about a removal — the house style CLI-581 is about                                                                                                                                                                                                                                                                                                                                                 |
| `resolveSlugsOrSkip`       | **The row was wrong to present it as dead.** It is declared and called in `src/cli/lib/matrix/skill-resolution.ts` today. What moved is the `needs` path only: `resolveEveryNeed` calls the same helper and then answers `null` unless every slug resolved, so needs are taken whole or not at all, while the other rule kinds still resolve slug-by-slug through it. The correction it recorded still stands — the claim was about the CALL, and a grep for the NAME would have "refuted" a correct correction |
| `SkillConfig.source`       | Confirmed: `src/cli/types/config.ts` declares `origin`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `generateMetadataYaml`     | Confirmed: no such symbol, and `src/cli/commands/new/` holds `marketplace.ts` alone                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `writeScopedConfigs`       | Confirmed dead — surviving only in `changelogs/`, which is a record of past releases and correct as it stands. `writeScopedFromWizard` is live across `src/cli/lib/`                                                                                                                                                                                                                                                                                                                                            |
| `scope-boundary-preserved` | Confirmed not a `root_cause` value. `agent-findings/TEMPLATE.md` now tells the whole story on one line, including the line-break wrap that made the original error ungreppable                                                                                                                                                                                                                                                                                                                                  |

### 3. Framing that was wrong, not just stale

These are the expensive ones, because the sentence reads fine and the work built on it is wrong.

- **"Make the source reader follow `export … from`."** Would have bound the wrong thing: the document
  states what a **directory** exports, and the barrel re-exports 37 of 45. Eight real members would
  have been reported as drift.
- **"The spec asserts install-on-disk and output."** Its on-disk assertion is a **negative** — a
  snapshot proving nothing moved. There is no positive subject in either leg.
- **"Move the row's marker off `TO TEST`."** To `COVERED` would have been wrong; two surfaces are
  still uncovered. It is `PARTIAL`.
- **"The standard says to copy it verbatim."** The standard says nothing about the payload at all.
  The hazard was a **silence**, not a wrong instruction — a different fix.
- **"Nothing is one field from a credential, so it is a judgement call."** The deciding fact is where
  the report _goes_: Sentry's `tunnel` points at our own worker. Adjacency was the wrong test entirely.
- **"This finding is falsely `partial` — Option A shipped."** It did not; what shipped is nearer
  Option C, and the two surfaces the finding was written about are still silent.

### 4. Over-claims — true of most members, asserted of all

- "Every field `marketplaceSchema` constrains is refused before writing." Three of four. The fourth
  (`version`) let an empty string through, producing a manifest the CLI **writes and then cannot
  read**. A shipped defect, found only because an agent checked the fourth case.
- "Every route on the chain needs an `hc` test." One is reached by literal URL and correctly has none.
- "A workspace is consumed as source only if it names nothing ambient." `packages/ui` names DOM
  globals throughout and is consumed as source correctly.
- "`persistedConfigSchema` is safe to join." Documented, reasoned, **and the site was leaking.**

### 5. Errors that were structurally unfindable

- `scope-boundary-preserved` was wrong **and wrapped across a line break**, so `grep` for it returned
  nothing. The one check anyone would run could not see it.
- A citation census scoped to four directories missed `changelogs/` entirely — 32 references —
  because the scope was **copied from the protocol paragraph rather than re-derived**.
- A row-existence check using `grep -qF "<basename>.md"` shipped in **eight** briefs against an index
  whose rows carry no extension. It reported "missing" for every finding in the corpus.

### 6. The orchestrator's own process failures

Recorded because the rules must cover them too, not only the prose.

- A message routed to a finished documentation agent instead of the live developer — and it _resumed_
  that agent onto a file another agent was writing.
- A census taken at the start of a pass used to authorise a batch at the end of it.
- A shell `while read` loop that silently skipped the last line of a file with no trailing newline —
  which happened to be the finding about silent skips.

## What actually worked

Every one of these was observed catching something in this session. They are the raw material for the
rule set.

| Countermeasure                              | The instance that proves it                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Re-derive, never paste**                  | A rule's worked example named a deleted file; pasting would have shipped fiction     |
| **Mutation proof**                          | An assertion "passed" against a confirm screen painting nothing at all               |
| **Subject guard**                           | A negative scan was proved able to report by pointing it at a known-bad input first  |
| **Count the population, not the survivors** | Two `toStrictEqual([])` assertions stayed green with the extractor completely broken |
| **Refuse rather than guess**                | A half-read table cell made the checker report a present name as missing             |
| **Occurrence count, not line count**        | A marker twice on one line reads as unique to `grep -c`                              |
| **Fixture depth ≥ the depth of the danger** | A correct assertion sat green for months over a live leak                            |
| **Name the fact a rule depends on**         | The premise expired and nothing collided with it                                     |
| **Class fix runs its own grep**             | One reported instance; five real ones                                                |

## The work owed — settled 2026-08-21

1. **Verify this evidence.** Done, above, and the verdict is a split: the "claim in the brief"
   column is unverifiable in principle and stays as an anecdote; the source side was re-derived row
   by row, and one row (`resolveSlugsOrSkip`) was wrong in a way that turns out to be the most
   instructive entry in the table.
2. **Settle the taxonomy.** Six categories collapse to four, because the countermeasures do:
   **counts** (rule 2 — carry the command), **names** (rule 3 — the check is the call, not the
   name), **framing and over-claims** (rules 4 and 5 — say which kind of sentence it is, and a
   generalisation is a cardinality claim), and **process** (rules 11 and 12 — owned files, and the
   correction channel). "Structurally unfindable" was not a class of error but a class of CHECK
   failing, so it is written into rule 3 as the truncation and line-wrap hazards rather than kept
   as a category of its own.
3. **Draft the rules, and say for each whether it is mechanisable.** Done. Mechanisability is a
   whole section of the standard, and its headline is that the answer is NO for the brief itself: a
   brief is prompt text, never a tracked file, and no checker can open one. The in-tree surrogates
   are listed there with their owners so a brief-side rule is not re-implemented.
4. **Decide where the rules live.** `packages/cli/.ai-docs/standards/briefing.md` for the body,
   restated in short in BOTH `CLAUDE.md` files — the two documents an agent is instructed to open
   before working. The agent prompts under `packages/cli/src/agents/` were considered and rejected:
   they are a published product surface — `package.json`'s `files` array ships `src/agents/` to
   every install — so a rule about how THIS repository briefs its own agents would be compiled into
   sub-agents on other people's machines.
5. **Rule on the strongest candidate.** ADOPTED as rule 2, in the stronger form the investigation
   proposed: a brief carries neither a number nor a bare claim, but the command that produces one.
   The skimmability cost is real and is bounded by an escape hatch — a load-bearing figure may be
   written as command, output and date together, which is still re-runnable in one paste.

## Related

- `feedback-guards-are-not-features` (memory) — the ruling that started this round.
- `2026-08-19-a-proposed-standard-aged-into-a-wrong-instruction-before-anyone-adopted-it` — the
  same failure one layer down, in findings rather than briefs.
- `root_cause: premise-expired` — added to `TEMPLATE.md` this round for the rule-shaped version.

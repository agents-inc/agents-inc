# Every brief was wrong, and the agents caught it — turn that into rules

**Status: analysis owed, then a rule set.** Filed 2026-08-19 out of the guards-are-not-features round.

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

## The work owed

1. **Verify this evidence.** It is assembled from agent reports, which is exactly the second-hand
   sourcing the whole finding is about. Re-derive each row or drop it.
2. **Settle the taxonomy.** Six categories above; some may collapse. The count/symbol/framing split
   looks real because the countermeasures genuinely differ.
3. **Draft the rules, and say for each whether it is mechanisable.** Provisional split:
   - **Mechanisable now**: counts and memberships (the enumeration registry already does this — it is
     at 79 rows and caught a new symbol within minutes of it landing); symbol existence in finding
     frontmatter; citation resolution.
   - **Mechanisable with work**: an assertion that can never fail; a fixture too shallow for the class
     it guards.
   - **Not mechanisable — a briefing discipline**: framing errors and over-claims. These need a rule
     about how a brief is _written_: state the source, not the summary; give the agent the grep rather
     than its result; mark every figure as "as of" and instruct re-derivation.
4. **Decide where the rules live.** A brief is not a document under `.ai-docs/`, so the bibles may be
   the wrong home. Candidates: a new `standards/briefing.md`, a section in `CLAUDE.md`, or the agent
   prompts themselves — the last being the only place an agent reliably reads.
5. **Rule on the strongest candidate**, which came out of the round unprompted: **a brief may not
   carry a number.** It carries the command that produces it. Cheap, mechanical, and it would have
   killed category 1 outright. The cost is briefs that are harder to skim.

## Related

- `feedback-guards-are-not-features` (memory) — the ruling that started this round.
- `2026-08-19-a-proposed-standard-aged-into-a-wrong-instruction-before-anyone-adopted-it` — the
  same failure one layer down, in findings rather than briefs.
- `root_cause: premise-expired` — added to `TEMPLATE.md` this round for the rule-shaped version.

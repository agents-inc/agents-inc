---
last_validated: 2026-08-21
---

# The Briefing Contract

> How a brief states a fact, and what the agent it is handed to owes back.
> Consult this file when dispatching work to a sub-agent, and when executing a dispatch.

A **brief** is the prompt one agent hands another: a dispatch to a sub-agent, an instruction passed
between sessions, a hand-off written from a tracker row. It is the transfer, not the tracker — the
row stays, the brief is consumed and gone.

**A brief is not a tracked file, so no checker can read one.** That is the fact this whole document
is arranged around: everything below is a discipline, enforced by the agents on both ends of a
hand-off rather than by a gate. What the gate beside it holds is only that these rules stay
reachable — see [What is mechanisable, and what is not](#what-is-mechanisable-and-what-is-not).

**Where the neighbours stop.** `standards/prompt-bible.md` governs a prompt's SHAPE — sections,
XML tags, ordering, the phrasing techniques. `standards/documentation-bible.md` governs the same
accuracy problem in a TRACKED document, and it is further along: "A Count Lives in Exactly One
Document", "A Name in a Document Is a Claim About Source" and "An Absence Names No Symbol" are the
document-side twins of rules 2, 3 and 5 here, with the greps written out. Neither is restated here;
this file governs what a brief may ASSERT.

---

## Why this exists

Across roughly twenty dispatches in one session (2026-08-19), **every agent that checked a figure in
its own brief found at least one wrong**, and none of it was caught by review — all of it by agents
re-deriving from source instead of trusting the sentence they were handed.

**That rate is not re-derivable and must not be quoted as measured.** Briefs and agent reports are
prompt text; they were never written to the tree, so nothing on disk can confirm or refute the
number, and it is second-hand sourcing of exactly the kind these rules exist to distrust. What IS on
disk, and what the rules rest on instead:

- `todo/cli.md` — a census of dispatched rows whose subject had already changed, each
  named with the commit that changed it. Dispatching from those rows cost the work outright.
- `2026-08-21-a-bug-row-naming-a-deleted-symbol-reads-exactly-like-a-live-one` — the same class
  filed with its evidence: a withdrawn subject's row still reads as verified, because it was, against
  a tree that no longer exists.
- `2026-08-19-a-doc-pass-verified-a-symbol-that-was-deleted-before-the-pass-finished` — a claim that
  was correct when it was performed and false when it was committed, ten minutes apart, in one
  session.

Treat the twenty as an anecdote that motivated a standard, and the three above as its evidence.

---

## The rules

### 1. Re-derive before you write, and say what the re-derivation showed

The instruction goes in every brief and the answer comes back in every report. This is the rule that
caught everything the others are written from — it is the asset, not the fallback.

An agent that finds its row does not describe the tree **stops on that row, reports it with
evidence, and moves to the next**. It does not invent work to justify the row, and it does not
quietly widen the row into something that is true.

### 2. A brief carries the command, not its result

No count in a brief. Write the invocation that produces one:

```
grep -rIn --include='*.ts' --include='*.tsx' 'directoryExists(' src e2e scripts | wc -l
```

not "144 call sites". A count is a fact about a moving tree: it is correct when written and wrong
within days, and the reader cannot tell which they are holding. The same session that produced these
rules watched one document's drift list grow while an agent was working on it.

Where a figure is genuinely load-bearing — a budget, a threshold, a before/after — write it as
**command, output and date together**, so a reader can re-run it in one paste and see whether it
still holds. A bare number is the form with no way back to its source.

### 3. A name in a brief is a claim about source — and the check is the CALL, not the name

Every symbol a brief names is greppable, so grep it. Two failures sit either side of the obvious
reading, and both were live in this repository's own evidence tables on 2026-08-21:

- **A name that resolves is not a claim that survived.** `resolveSlugsOrSkip` is declared and called
  in `src/cli/lib/matrix/skill-resolution.ts` today, and the claim written about it — that a rule's
  `needs` are resolved slug-by-slug with the unresolved ones skipped — is still wrong:
  `resolveEveryNeed` calls it for the needs and then answers `null` unless every slug resolved, so
  the needs are taken whole or not at all. The other rule kinds still resolve slug-by-slug through
  the same helper. Grepping the NAME would have "refuted" a correct correction.
- **A name that resolves to nothing is not automatically drift.** This codebase's house style
  explains what was REMOVED, so its best prose names symbols nothing declares —
  `reference/testing/factories.md` names `outdatedForkMetadata` precisely to say the carve-out went.
  `todo/cli.md` carries the ruling: `{@link}` means "resolve this", a backtick does not.

So the check is the call site, not the identifier. And **never judge an absence from a truncated
listing** — `grep -rIl … | head` was what nearly turned the first bullet above into a confident wrong
report. Count occurrences (`grep -rIn -c`), and read the whole list.

### 4. Say which kind of sentence it is

Four kinds travel in one brief and only the first is checkable: an **observation** (I ran this and
saw that), an **inference** (therefore), an **instruction** (do this), a **decision** (the owner
ruled). The expensive errors are inferences wearing an observation's clothes — the sentence reads
fine, nothing in it is false to the eye, and the work built on it is wrong.

A framing error costs more than a stale count because no command settles it. What settles it is
naming the deciding fact: _"the on-disk assertion in that spec is a NEGATIVE"_, _"the standard says
nothing about the payload — the hazard is a silence"_. If the brief cannot name the deciding fact,
it asks a question instead of asserting an answer.

### 5. A generalisation is a cardinality claim

"Every field the schema constrains", "all four routes", "each of the three checkers" — the sentence
has an N in it, so it is checkable, and an unchecked one is a count in disguise. Verify it against
every member or write what was actually checked: _"three of the four; `version` is unchecked"_.

The instance the wording is taken from: a brief asserted that every field `marketplaceSchema`
constrains is refused before writing, and it held for three of four — the fourth admitted an empty
string, producing a manifest the CLI writes and then cannot read. Checking the fourth case is what
found it, and `marketplaceSchema.version` carries `.min(1)` in `src/cli/lib/schemas.ts` today.

`documentation-bible.md` -> "A generalisation over a set is a cardinality claim" is the same rule
for documents and carries the grep.

### 6. Every claim carries where it came from, and an inherited one is re-derived before it is acted on

A brief assembled from earlier agents' reports is a **summary of a summary**. Say which it is, per
claim: measured here and now, or inherited from a named source. An inherited claim is a lead, not a
fact, and the agent acting on it re-derives it first — that is rule 1 applied to the hand-off rather
than to the row.

The provenance may be as light as a parenthetical (_"finding X says …, unverified"_). What it may
not be is absent, because an unattributed claim is indistinguishable from a measured one, and the
reader's only options are to trust it or to re-derive everything.

### 7. Prefer deleting a claim to rewriting it

_Owner ruling, 2026-08-19._ Every rewrite is a new claim that can rot, so a rewrite grows the surface
that produced the defect. If a sentence is not load-bearing, cut it. A claim that carries its own
derivation command may stay; a claim that cannot be checked without leaving the page is a deletion
candidate by default.

### 8. The verifier is never the fixer

_Owner ruling, 2026-08-19._ Separate agents. An agent that verifies a finding and then fixes it has a
reason to confirm it. The adversarial pass that cut a worklist by more than half worked precisely
because its only job was to reject; the moment a pass owns the fix as well, that incentive inverts.

### 9. A verdict carries a reproduction, not a judgement

_Owner ruling, 2026-08-19._ "This is real" is worth nothing downstream — it is one more claim to
inherit. A verdict carries **the command and its output**, which the next reader can check without
trusting the agent that wrote it, and which is the only form that survives a hand-off intact.

### 10. Forward the artefact, do not re-summarise it

Where an agent wrote a file, hand over its **path**. Where it did not, hand over the command. The
orchestrator is a lossy compression stage every time it paraphrases, and the loss is invisible to
both ends.

**This one is a preference, not a measurement.** The observation behind it — that the briefs which
forwarded a path drew the fewest corrections — is an impression from one session. It is cheap, it
costs nothing if wrong, and it is adopted on that basis; what would actually settle it is rule 13's
tally, whose fourth column exists to record which form each brief used.

### 11. Name the owned files whenever more than one agent is working

A brief dispatched into a tree other agents are changing states which files the lane owns, and
instructs: **if you need a change in a file another lane owns, report the exact change — do not make
it.** Two agents editing one file is the cheap failure; the expensive one is a document rewritten
about code another agent is changing in the same hour, which is how a claim goes stale inside a
single session.

For a verify-and-fix pass, **freeze the tree**: verify and fix back to back inside one freeze, then
run the gates once. Verifying today and fixing tomorrow makes the verification stale again.

### 12. Corrections are a required field of the return, not a courtesy

Every agent report answers "what in this brief was wrong" explicitly. **Empty is an answer and must
be written**, because a silent report is indistinguishable from a brief that held.

This is the measuring instrument, and it exists to keep the error rate VISIBLE. The trap it is
written against is real and this repository has already met it one layer down: where a rule is
enforced at several layers, a mutation of the named layer is absorbed by the others and reads as
green (`2026-08-19-a-rule-enforced-at-three-layers-leaves-a-mutation-of-the-named-one-invisible`).
Agents reliably catching orchestrator errors is the same shape — the correction absorbs the signal,
and nobody learns which claims are unreliable. A fix that prevents errors without counting them
leaves us exactly as blind as we started, and feeling better about it.

### 13. A correction that is read once and discarded measures nothing

Rule 12 produces a fact per dispatch; the error rate is a fact about a **programme**, and nothing
turns one into the other unless somebody writes it down. So the orchestrator appends one line per
dispatch to the programme's own progress file under `todo/plans/` — the file that already carries
that programme's sequence and state — holding four things and no more:

| Column                | What it holds                                                                       |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Rows**              | The tracker IDs dispatched in that lane                                             |
| **Corrections**       | What rule 12 returned, `0` written out when the brief held                          |
| **Changed the work?** | Whether any correction altered what was built, rather than a detail nobody acted on |
| **Hand-off**          | Whether the brief forwarded a path or a paraphrase (rule 10)                        |

The third column is the one that carries the weight: a brief wrong about a detail and a brief wrong
about the subject of its row return the same number and are not the same event. The fourth exists
because rule 10 is adopted on one session's impression and this tally is the only thing that can
settle it; without that column, that rule stays an impression permanently.

**The line is the orchestrator's, not the agent's** — sub-agents do not edit `todo/` — and it is
appended as each lane lands rather than assembled at the end, because a tally written from memory at
the end of a programme is the second-hand sourcing this whole document distrusts. A dispatch with no
line is indistinguishable from one that returned nothing, which is rule 12's own failure a level up.

---

## What a brief must contain

| Field                | What it holds                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **Subject**          | The tracker row ID and the path to any plan, rather than a retelling of either                    |
| **Claims**           | Each with its provenance (rule 6) and, where it is a figure or a roster, its command (rules 2, 5) |
| **Re-derivation**    | The standing instruction of rule 1, and what to do when the row does not describe the tree        |
| **Owned files**      | What this lane may edit, and the report-don't-reach rule for everything else (rule 11)            |
| **Lifecycle**        | The repository's agreed order — see the root `CLAUDE.md`, "How work gets implemented"             |
| **Gates**            | The exact commands to run, unfiltered — never a `--project` subset of a repository gate           |
| **Required returns** | Rule 12's corrections field, plus the hardening verdict below                                     |

## What a report must return

| Field                  | What it holds                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **Per row**            | What was found versus what the row claimed; what changed; the red-then-green evidence        |
| **Corrections**        | Rule 12 — everything in the brief that proved false, or an explicit "nothing"                |
| **Hardening verdict**  | What would have caught this, whether it is cheap, and — when nothing honest exists — why not |
| **Cross-lane needs**   | The exact change wanted in a file this lane does not own (rule 11)                           |
| **Owner rulings owed** | Anything that needs a decision, surfaced rather than guessed                                 |

**A hardening verdict of "no honest gate exists, because …" is worth more than a weak guard.** One
gate that holds a class beats many individual assertions, and a guard that can be satisfied without
doing the thing is worse than none — `2026-08-21-the-gate-that-proves-a-door-clears-a-variable-is-satisfied-by-a-comment`
is the local specimen: a scan for a line of code that a COMMENT satisfied just as well.

---

## What is mechanisable, and what is not

**Not mechanisable, and not because nobody has built it yet.** A brief is prompt text. It is never
written to the tree, no checker can open one, and a rule about how a brief is WRITTEN can only be
enforced by the agents at either end of the hand-off. That is why these rules live here and are
linked from both `CLAUDE.md` files rather than from a script.

**The in-tree surrogates**, which cover the same error classes where they land in a tracked file —
each owned elsewhere, listed so a brief-side rule is not re-implemented:

| Class                                     | What already covers it                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| An enumeration in a document goes stale   | `scripts/check-enumeration-drift.ts` — membership in both directions, per row |
| A tracker cites a finding that is gone    | `scripts/check-finding-citations.ts` — `todo/`, `changelogs/`, `e2e/`         |
| A tracker row names a symbol that is gone | `todo/cli.md` — proposed, not built; the useful signal is "used to exist"     |
| A document names a symbol that never was  | `todo/cli.md` — two documents asserting opposite things                       |

**What the gate beside this file does hold** is one class and only one: that these rules stay
reachable. `scripts/check-briefing-contract.ts` refuses a tree where either `CLAUDE.md` has stopped
linking this contract, where a standard is absent from `DOCUMENTATION_MAP.md`, or where either
binding document points an agent at a path that is not on disk. A rule set nobody is handed binds
nobody, and it fails silently — it stays on disk, reads as adopted, and stops arriving.

**And what it does not hold, stated so nobody reads the green run as wider than it is.** It follows
the links of three documents — the two `CLAUDE.md` files and this one — and asks of each only
whether the path is on disk. Whether any of them says something TRUE is outside it, and no brief is
ever opened, because no brief is ever written to the tree. Two of the three are additionally held to
LINK this contract; this file is not among them, because a document linking itself asserts nothing.

**This file's own pointers went unread until 2026-08-21**, when the link population was widened to
include it. Until then a link here to a path that did not exist left the whole suite green, while
the same line in either `CLAUDE.md` reddened it by name. Nothing live was broken by that, because
the rules above cite paths in backticks rather than as links wherever a link would only be
decoration — which is why the gap was latent, and is still the house style now that it is closed.

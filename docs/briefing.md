---
last_validated: 2026-10-15
---

# The Briefing Contract

> How a brief states a fact, and what the agent it is handed to owes back.
> Consult this file when dispatching work to a sub-agent, and when executing a dispatch.

A **brief** is the prompt one agent hands another: a dispatch to a sub-agent, an instruction passed
between sessions, a hand-off written from a tracker row. It is the transfer, not the tracker: the
row stays, the brief is consumed.

**A brief is not a tracked file, so no checker can read one.** These rules bind through the agents
on both ends of a hand-off; the gate beside them holds only that they stay reachable
([What is mechanisable, and what is not](#what-is-mechanisable-and-what-is-not)).

**Where the neighbours stop.** `packages/cli/.ai-docs/standards/prompt-bible.md` governs a
prompt's SHAPE (sections, XML tags, ordering, phrasing techniques).
`packages/cli/.ai-docs/standards/documentation-bible.md` governs the same accuracy problem in a
TRACKED document; its "A Count Lives in Exactly One Document", "A Name in a Document Is a Claim
About Source" and "An Absence Names No Symbol" are the twins of rules 2, 3 and 5, with the greps.
Neither is restated here; this file governs what a brief may ASSERT.

## Why this exists

In one session (2026-08-19, roughly twenty dispatches), every agent that checked a figure in its own
brief found at least one wrong; review caught none, re-deriving from source caught all. That rate
cannot be re-derived (briefs and reports never reach the tree), so it is an anecdote and must not be
quoted as measured. The evidence is two findings, pruned and recorded in
`packages/cli/.ai-docs/agent-findings/INDEX.md`:

- `2026-08-21-a-bug-row-naming-a-deleted-symbol-reads-exactly-like-a-live-one`: a withdrawn
  subject's row still reads as verified, against a tree that no longer exists.
- `2026-08-19-a-doc-pass-verified-a-symbol-that-was-deleted-before-the-pass-finished`: a claim
  correct when performed was false when committed, ten minutes later.

## The rules

### 1. Re-derive before you write, and say what the re-derivation showed

The instruction goes in every brief and the answer comes back in every report; this rule caught
everything the others are written from. An agent whose row does not describe the tree **stops on
that row, reports it with evidence, and moves to the next**. It never invents work to justify the
row, nor quietly widens the row into something true.

### 2. A brief carries the command, not its result

No count in a brief: write the invocation that produces one, not "144 call sites".

```
grep -rIn --include='*.ts' --include='*.tsx' 'directoryExists(' src e2e scripts | wc -l
```

A count is correct when written and wrong within days, and the reader cannot tell which. A figure
that is load-bearing (a budget, a threshold, a before/after) is written as **command, output and
date together**, re-runnable in one paste.

### 3. A name in a brief is a claim about source — and the check is the CALL, not the name

Grep every symbol a brief names. Two failures sit either side of the obvious reading (both live in
this repository's evidence tables on 2026-08-21):

- **A name that resolves is not a claim that survived.** `resolveSlugsOrSkip` is declared and called
  in `packages/cli/src/cli/lib/matrix/skill-resolution.ts`, yet "a rule's `needs` resolve
  slug-by-slug, skipping unresolved ones" is wrong: `resolveEveryNeed` calls it and answers `null`
  unless every slug resolved, so needs are taken whole or not at all (other rule kinds do resolve
  slug-by-slug through it). Grepping the NAME would have "refuted" a correct correction.
- **A name that resolves to nothing is not automatically drift.** House style explains what was
  REMOVED, naming symbols nothing declares. `documentation-bible.md` rules: `{@link}` means "resolve
  this", a backtick does not.

So check the call site, not the identifier. **Never judge an absence from a truncated listing**
(`grep -rIl … | head` nearly made the first bullet a confident wrong report): count occurrences
(`grep -rIn -c`) and read the whole list.

### 4. Say which kind of sentence it is

Four kinds travel in one brief, and only the first is checkable: an **observation** (I ran this and
saw that), an **inference** (therefore), an **instruction** (do this), a **decision** (the owner
ruled). The expensive error is an inference worded as an observation: nothing in it looks false,
and the work built on it is wrong. No command settles such a framing error; naming the deciding fact
does (_"the on-disk assertion in that spec is a NEGATIVE"_, _"the standard says nothing about the
payload — the hazard is a silence"_). A brief that cannot name the deciding fact asks a question
instead of asserting an answer.

### 5. A generalisation is a cardinality claim

"Every field the schema constrains", "all four routes", "each of the three checkers" has an N in
it, so it is checkable; unchecked, it is a count in disguise. Verify every member or write what was
checked: _"three of the four; `version` is unchecked"_. Instance: "every field `marketplaceSchema`
constrains is refused before writing" held for three of four; the fourth admitted an empty string,
a manifest the CLI writes and then cannot read (`marketplaceSchema.version` now carries `.min(1)` in
`packages/cli/src/cli/lib/schemas.ts`). The document-side rule, with its grep, is
`documentation-bible.md` -> "A generalisation over a set is a cardinality claim".

### 6. Every claim carries where it came from, and an inherited one is re-derived before it is acted on

A brief built from earlier agents' reports is a **summary of a summary**. Per claim, say which it
is: measured here and now, or inherited from a named source. An inherited claim is a lead, not a
fact, and the agent acting on it re-derives it first (rule 1, at the hand-off). Provenance may be a
parenthetical (_"finding X says …, unverified"_) but never absent: an unattributed claim is
indistinguishable from a measured one.

### 7. Prefer deleting a claim to rewriting it

_Owner ruling, 2026-08-19._ Every rewrite is a new claim that can rot. Cut a sentence that is not
load-bearing. A claim carrying its own derivation command may stay; one that cannot be checked
without leaving the page is a deletion candidate by default.

### 8. The verifier is never the fixer

_Owner ruling, 2026-08-19._ Separate agents: one that verifies a finding and then fixes it has a
reason to confirm it. A pass works as an adversary only while its sole job is to reject; owning the
fix inverts that incentive.

### 9. A verdict carries a reproduction, not a judgement

_Owner ruling, 2026-08-19._ "This is real" is one more claim to inherit. A verdict carries **the
command and its output**: checkable without trusting its author, and the only form that survives a
hand-off intact.

### 10. Forward the artefact, do not re-summarise it

Where an agent wrote a file, hand over its **path**; where it did not, the command. Each
orchestrator paraphrase is a lossy compression, invisible to both ends. **A preference, not a
measurement**: one session's impression (briefs forwarding a path drew the fewest corrections),
adopted because it costs nothing if wrong; rule 13's fourth column is what would settle it.

### 11. Name the owned files whenever more than one agent is working

A brief dispatched into a tree other agents are changing states which files the lane owns, and
instructs: **if you need a change in a file another lane owns, report the exact change — do not make
it.** (Worse than two agents editing one file: a document rewritten about code another agent is
changing that hour.) For a verify-and-fix pass, **freeze the tree**: verify and fix back to back in
one freeze, then run the gates once; verifying today and fixing tomorrow leaves the verification
stale.

### 12. Corrections are a required field of the return, not a courtesy

Every agent report answers "what in this brief was wrong" explicitly. **Empty is an answer and must
be written**: a silent report is indistinguishable from a brief that held. This field keeps the
error rate VISIBLE. Agents reliably catching orchestrator errors absorb the signal, as a rule
enforced at several layers absorbs a mutation of the named one
(`2026-08-19-a-rule-enforced-at-three-layers-leaves-a-mutation-of-the-named-one-invisible`), and
nobody learns which claims are unreliable. A fix that prevents errors without counting them leaves
us as blind as before.

### 13. A correction that is read once and discarded measures nothing

The error rate is a fact about a **programme**, not a dispatch. So the orchestrator appends one line
per dispatch to the programme's own progress file under `todo/plans/` (the file carrying its
sequence and state), holding four things and no more:

- **Rows**: the tracker IDs dispatched in that lane.
- **Corrections**: what rule 12 returned, `0` written out when the brief held.
- **Changed the work?**: whether any correction altered what was built, rather than a detail nobody
  acted on. This column carries the weight: a brief wrong about a detail and one wrong about its
  row's subject return the same number and are not the same event.
- **Hand-off**: whether the brief forwarded a path or a paraphrase; the only thing that can settle
  rule 10.

**The line is the orchestrator's, not the agent's** (sub-agents do not edit `todo/`). It is appended
as each lane lands, never assembled at the end (a tally from memory is second-hand sourcing). A
dispatch with no line is indistinguishable from one that returned nothing.

## What a brief must contain

- **Subject**: the tracker row ID and the path to any plan, rather than a retelling of either.
- **Claims**: each with its provenance (rule 6) and, for a figure or a roster, its command (rules 2,
  5).
- **Re-derivation**: rule 1's standing instruction, and what to do when the row does not describe
  the tree.
- **Owned files**: what this lane may edit, and report-don't-reach for everything else (rule 11).
- **Lifecycle**: the repository's agreed order, in the root `CLAUDE.md`, "How work gets
  implemented".
- **Gates**: the exact commands to run, unfiltered, never a `--project` subset of a repository gate.
- **Required returns**: rule 12's corrections field, plus the hardening verdict below.

## What a report must return

- **Per row**: what was found versus what the row claimed; what changed; the red-then-green
  evidence.
- **Corrections**: rule 12, everything in the brief that proved false, or an explicit "nothing".
- **Hardening verdict**: what would have caught this, whether it is cheap, and, when nothing honest
  exists, why not.
- **Cross-lane needs**: the exact change wanted in a file this lane does not own (rule 11).
- **Owner rulings owed**: anything that needs a decision, surfaced rather than guessed. A question
  about how the app behaves quotes the sentence the user docs (`apps/www/src/content/docs/docs/`)
  give it, or says they give none, plus a reproduction with its control case; where the code
  contradicts the docs it is a defect report, not a question.

**A hardening verdict of "no honest gate exists, because …" is worth more than a weak guard.** One
gate holding a class beats many individual assertions, and a guard satisfiable without doing the
thing is worse than none (specimen:
`2026-08-21-the-gate-that-proves-a-door-clears-a-variable-is-satisfied-by-a-comment`, a scan for a
line of code that a COMMENT satisfied just as well).

## What is mechanisable, and what is not

**Not mechanisable, and not for want of building it**: a rule about how a brief is WRITTEN can only
be enforced by the agents at either end, so these rules live here, linked from both `CLAUDE.md`
files, not in a script.

**In-tree surrogates** cover the same error classes where they land in a tracked file, each owned
elsewhere, listed so a brief-side rule is not re-implemented:

- An enumeration in a document goes stale: `packages/cli/scripts/check-enumeration-drift.ts`
  (membership in both directions, per row).
- A tracker cites a finding that is gone: `packages/cli/scripts/check-finding-citations.ts`
  (`todo/`, `packages/cli/changelogs/`, `packages/cli/e2e/`).

**The gate beside this file holds one class only: that these rules stay reachable.**
`packages/cli/scripts/check-briefing-contract.ts` refuses a tree where either `CLAUDE.md` has
stopped linking this contract, or where any of the three documents (the two `CLAUDE.md` files and
this one) links a path not on disk. A rule set nobody is handed binds nobody, silently: it stays on
disk, reads as adopted, and stops arriving. It does not check that any of the three says something
TRUE, and opens no brief. This file is not required to link itself (that asserts nothing). Its own
links were first read on 2026-08-21; the gap stayed latent because these rules cite paths in
backticks, not links, wherever a link would only be decoration, which is still the house style.

# Why every brief was wrong, and what to do about it — investigation

**Status: first pass run 2026-08-21.** The measurement was checked as far as it can be, the five
mechanisms below each have a decision with its reason, and what was adopted is written in
[`packages/cli/.ai-docs/standards/briefing.md`](../../packages/cli/.ai-docs/standards/briefing.md).
Scoped 2026-08-19; the owner had wanted it treated properly rather than folded into a working
session, and what is recorded here is a decision record rather than a completed investigation — the
residue is listed under [What is still owed](#what-is-still-owed).

This is the architectural half of [`CLI-566`](../cli.md), which holds the measurement and the
first-pass rule set. **Read that row's evidence table first** — this file assumes it.

---

## The measurement

Across roughly twenty agent dispatches in one session, **every agent that checked a figure in its own
brief found at least one wrong.** Not most. Every one.

None of it was caught by review. All of it was caught by an agent re-deriving from source instead of
trusting the sentence it was handed.

**The first thing this investigation must do is verify that claim**, because it is assembled from
agent reports — which is precisely the second-hand sourcing the finding is about. If the rate is
lower than stated, the conclusion changes.

### What the verification found, 2026-08-21

**The rate cannot be re-derived, and that is a finding rather than an obstacle.** Briefs and agent
reports are prompt text; neither was ever written to the tree, so no command can confirm or refute
"every one of roughly twenty". It must not be quoted as measured, and the standard says so in the
sentence that introduces it.

**The conclusion survives anyway, on evidence that IS on disk**, and none of it depends on an agent
report:

- `todo/cli.md` -> CLI-623 — a census of dispatched rows whose subject had already changed, each
  naming the commit that changed it. Those dispatches cost the work outright.
- `2026-08-21-a-bug-row-naming-a-deleted-symbol-reads-exactly-like-a-live-one` — the same class
  filed with its evidence, including a withdrawn subject whose row still names symbols no file
  declares.
- `2026-08-19-a-doc-pass-verified-a-symbol-that-was-deleted-before-the-pass-finished` — a claim
  correct when performed and false when committed, ten minutes apart, in one session.

**The taxonomy's own tables were re-derived and one row was wrong** — `resolveSlugsOrSkip` is alive
in `src/cli/lib/matrix/skill-resolution.ts`, and the correction recorded about it still stands
because the claim was about the CALL rather than the name. Row-by-row results are in
[`brief-accuracy-rules.md`](./brief-accuracy-rules.md); they are not restated here.

---

## The failure taxonomy, from one session's evidence

### 1. Inherited figures presented as measured

| Claim in a brief                                | Reality                           |
| ----------------------------------------------- | --------------------------------- |
| "the helper table is exactly right, 71 exports" | 72 — one moved in an hour earlier |
| "~43 call sites"                                | 26                                |
| "54 `runCLI` calls"                             | 51                                |
| "twelve `.optional()` in `packages/matrix`"     | 11                                |
| "four live sites in `plugin-settings.ts`"       | 1                                 |
| "71 inline `D-NNN` across 10 files"             | 12 across 5                       |
| "21 eslint-disable guards"                      | 32 across 13                      |
| "144 `directoryExists` call sites"              | 330                               |

**The last row of the class is the important one**: one table's drift grew from 3 names to 7 **while an
agent was working on it**. This class cannot be fixed by care, because the number is a fact about a
moving tree.

### 2. Symbols that moved or died

`outdatedForkMetadata` (a rule's entire worked example, file deleted) · `resolveSlugsOrSkip` (now
`resolveEveryNeed`, with a _stronger_ guarantee) · `SkillConfig.source` (now `origin`) ·
`generateMetadataYaml` (neither symbol nor file exists) · `writeScopedConfigs` (so dead a test holds it
as `A_NAME_NOTHING_DECLARES`) · `scope-boundary-preserved` (an enum value that does not exist, **wrapped
across a line break so `grep` could not find it**).

### 3. Framing errors — the expensive kind

The sentence reads fine and the work built on it is wrong.

- _"Make the source reader follow `export … from`"_ — would have bound the wrong thing; the document
  states what a **directory** exports and the barrel re-exports 37 of 45. **Eight real members would
  have been reported as drift.**
- _"The spec asserts install-on-disk and output"_ — its on-disk assertion is a **negative**.
- _"The standard says to copy it verbatim"_ — the standard says nothing about the payload at all. The
  hazard was a **silence**, which is a different fix.
- _"Nothing is one field from a credential, so it is a judgement call"_ — the deciding fact is where
  the report **goes**, and it goes through our own worker.

### 4. Scope and judgement errors — which agents do NOT catch

- **CLI-577** was filed on an agent's claim without checking. A _different_ agent caught it ninety
  minutes later, and only because it happened to be reading the same specs.
- **A message was misrouted** to a finished agent, resuming it onto a file another agent was writing.
  Nobody caught it.
- **54 findings were parked as "features" that were guards.** No agent caught it. **The owner did.**

### 5. The orchestrator's own process failures

A census taken at the start of a pass used to authorise a batch at the end of it · a `while read` loop
that silently skipped a file with no trailing newline — which happened to be the finding about silent
skips · a citation sweep scoped to four directories that missed a fifth entirely, **because the scope
was copied from a protocol paragraph rather than re-derived**.

---

## What the external research says

Three findings that map directly onto the above.

**Cascading error is the known primary bottleneck**, and the mechanism is ours exactly: at each handoff
you either pass full context (expensive, eventually overflows) or **summarise — which is lossy, and the
errors accumulate**. Reported reduction from summarising is 70–90% of tokens, at the cost of
information loss per hop.

**The handoff needs a contract, not a prose brief.** _Without an explicit handoff contract, one agent's
hallucinated output becomes the next agent's corrupted input, and corruption propagates downstream
through every subsequent agent._

**"Harness engineering" is the distinction worth taking.** Prompt engineering optimises what one model
outputs; harness engineering builds structure around the _transfer_ — contract schemas, verification
layers before information moves, and **claim tracking that records which agent generated which claim
and under what conditions**. That last one is the direct answer to category 1 and 2 above.

Sources to start from:

- [From Prompts to Contracts: Harness Engineering for Auditable Enterprise LLM Agents](https://arxiv.org/pdf/2607.08028)
- [Hallucination as Context Drift: Synchronization Protocols for Multi-Agent LLM Systems](https://arxiv.org/pdf/2606.21666)
- [Multi-Agent Orchestration Patterns for Production](https://beam.ai/agentic-insights/multi-agent-orchestration-patterns-production)
- [Multi-Agent Orchestration: A Practical Architecture](https://www.augmentcode.com/guides/multi-agent-orchestration-architecture-guide)
- [Hallucination Prevention: Strategies for Reliable Agent Output](https://agentplace.io/blog/hallucination-prevention-strategies-for-reliable-agent-output)

---

## Candidate mechanisms, ranked by expected value

### 1. A brief may not carry a number — it carries the command that produces one

Kills category 1 at source. Already the standing recommendation in CLI-566. **Extend it**: a brief may
not carry a _claim_ either; it carries the source of one.

Cost: briefs get harder to skim. Weigh that honestly — a brief nobody reads is worse than one with a
stale figure.

### 2. Provenance tags on every factual claim

`MEASURED(command, when)` or `INHERITED(from)`. Agents verify `INHERITED` before acting on it, and
treat `MEASURED` as true-as-of rather than true. This is claim-level support applied to the brief
rather than to the answer.

**Open question**: does this survive contact with a brief a human writes, or does it only work when a
tool composes the brief?

### 3. Forward the artifact, do not re-summarise it — the one with evidence already

The briefs in this session that wrote a file and handed over its **path** produced the fewest
corrections. The briefs that compressed a prior agent's report into prose produced the most.

**Verify this before building on it** — it is an impression from one session, not a measurement, and it
is exactly the kind of claim this document exists to distrust. If it holds, it is the cheapest change
of the five: the orchestrator stops being a lossy compression stage.

### 4. Make the correction channel a required return field

This session worked because every brief asked agents to report anything in it that was wrong. That is
exhortation, and it is the only reason the error rate is known at all. As a **mandatory field of a
structured return** it cannot be skipped, and it makes the rate measurable rather than anecdotal.

### 5. Staff the scope question separately

Agents verify facts; they do not question scope. The adversarial validation pass in this session cut 47
items to 21 by asking _"is this worth doing?"_ — a different question from _"is this true?"_ — and it
caught nine items that were already done, three that contradicted written conventions, and two that
would have changed signatures nothing calls.

Make that pass routine rather than a one-off.

---

## The decision on each mechanism, 2026-08-21

Recorded here with the reason, so a rejected mechanism reconsidered in six months is not
re-litigated from scratch. "Adopted" means it is written in
[`standards/briefing.md`](../../packages/cli/.ai-docs/standards/briefing.md) as a numbered rule.

| Mechanism                                 | Decision                                         | Reason                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. No number — carry the command          | **Adopted** (rule 2)                             | Kills the largest class at source, costs nothing to comply with, and the skimmability objection is answered by the escape hatch: a load-bearing figure may be written as command, output and date together                                                                                                                                                                                                            |
| 2. Provenance tags on every claim         | **Adopted in prose, notation rejected** (rule 6) | The requirement is right — an unattributed claim is indistinguishable from a measured one. `MEASURED(cmd, when)` / `INHERITED(from)` is not, and the plan's own open question answers itself: a brief here is prose written by an agent, so a syntax nothing parses is a syntax nothing enforces. Revisit if a tool ever composes briefs, because a parseable tag would make rule 13's tally automatic                |
| 3. Forward the artefact, not a summary    | **Adopted as a preference** (rule 10)            | Cheap and costless if wrong, so it is adopted — but the evidence is one session's impression, and the standard says so in the rule itself rather than promoting it to a finding. What would settle it is rule 13's tally, whose fourth column records which form each brief used                                                                                                                                      |
| 4. Corrections as a required return field | **Adopted** (rules 12 and 13)                    | This is the measuring instrument, and the only one. Exhortation is why the rate is known at all; a required field cannot be skipped, and "nothing was wrong" must be written out, because a silent report is indistinguishable from a brief that held. Rule 13 is the half added 2026-08-21: a field answered and then discarded measures nothing, so the returns accumulate per dispatch rather than being read once |
| 5. Staff the scope question separately    | **Half adopted, half owner's**                   | The verifier-is-never-the-fixer half is already ruled and is rule 8. Making an adversarial "is this worth doing?" pass ROUTINE is a scheduling decision with a real cost per programme — it is surfaced for the owner rather than adopted here                                                                                                                                                                        |

**Where they landed.** `standards/briefing.md` carries the rules; both `CLAUDE.md` files restate the
four that bind hardest and link the rest; `DOCUMENTATION_MAP.md` indexes it. The agent prompts under
`packages/cli/src/agents/` were rejected as a home — `package.json`'s `files` array ships
`src/agents/` to every install, so a rule about how this repository briefs its own agents would be
compiled into sub-agents on other people's machines.

**What holds it in place, and what does not.** `packages/cli/scripts/check-briefing-contract.ts`
refuses a tree where either `CLAUDE.md` has stopped linking the contract, where a standard is absent
from the map, or where any of the three documents it reads — the two `CLAUDE.md` files and the
contract itself — points an agent at a path that is not on disk. The contract was outside that link
population until 2026-08-21 and was widened into it by
`2026-08-21-the-gate-that-holds-the-briefing-contract-does-not-read-the-contract`; until then the
document the check exists to protect was a link target and never a source of links.

That is reachability and nothing more: no gate can judge what a brief SAYS, because a brief is never
a tracked file. Saying that plainly is part of the standard rather than a caveat on it.

---

## Three principles the owner adopted 2026-08-19, before the investigation runs

These came out of a three-audit sweep of the session's own output and are **decided, not proposals**.
They apply to any accuracy pass from here.

### 1. The verifier is never the fixer

Separate agents. An agent that verifies a finding and then fixes it has a reason to confirm it. The
adversarial pass earlier in this session cut 47 items to 21 precisely because its only job was to
reject; the moment a pass owns the fix as well, that incentive inverts.

### 2. A verdict carries a reproduction, not a judgement

"This is real" is worth nothing downstream — it is another claim to inherit, which is the whole
problem. A verdict carries **the command and its output**. That is checkable by the next reader
without trusting the agent that wrote it, and it is the only form that survives a handoff intact.

### 3. Prefer deleting a claim to rewriting it

Most failures in the audits were **unverifiable prose** — "the only site", "written once", "nothing
else does this". Every rewrite is a new claim that can rot, so a rewrite grows the surface that
produced the defect. If a sentence is not load-bearing, **cut it**. Shrinking the corpus is the only
move that actually breaks the loop; a claim that carries its own derivation command may stay, and a
claim that cannot be checked without leaving the page is a deletion candidate by default.

### And one condition on running any of it: freeze the tree

The circling has a specific cause. Documents were rewritten **about code other agents were changing
in the same hour**, so claims went stale inside the session — three documents were edited to declare
a defect closed while the same working tree reopened it. Verification on a moving tree regenerates
the problem it is meant to remove.

So: verify and fix **inside one freeze, back to back**, then run the checkers once. Verifying today
and fixing tomorrow makes the verification stale again.

## The failure mode this investigation must avoid in itself

**Defence in depth absorbs its own evidence.** This session established that where a rule is enforced
at several layers, a mutation of the _named_ layer is invisible, because the others absorb it.

The same applies here: if agents reliably catch orchestrator errors, the correction absorbs the signal
and nobody learns which claims are unreliable. **Any mechanism adopted must make the error rate more
visible, not less** — a fix that quietly prevents errors without counting them leaves us exactly as
blind as we started, and feeling better about it.

---

## What "done" looks like

1. The measurement verified or corrected. — **Done 2026-08-21**: verified as far as it can be, and
   the residue is that it cannot be. See the verification section above.
2. A decision on each of the five mechanisms — adopt, reject, or trial — **with the reason recorded**,
   because a rejected mechanism reconsidered in six months should not be re-litigated from scratch.
   — **Done 2026-08-21**, in the table above.
3. Whatever is adopted written where an agent actually reads it. Note that a brief is not a document
   under `.ai-docs/`, so the bibles may be the wrong home entirely — the agent prompts and the
   orchestrator's own instructions may be the only places that bind. — **Done 2026-08-21**: the
   standard plus a restatement in both `CLAUDE.md` files, which are the two documents an agent is
   instructed to open. The shipped agent prompts were rejected for the reason given above.
4. A way to keep measuring the rate afterwards. — **Specified 2026-08-21, and not yet running.**
   Rule 12 makes the correction a required field of every report, which is what produces the
   numbers, and rule 13 says where they accumulate and in what shape — one line per dispatch in the
   programme's progress file, carrying rows, corrections, whether a correction changed the work, and
   which hand-off form the brief used. What has not happened is any line being written: see below.

## What is still owed

- **The tally has a rule and no rows.** Settled 2026-08-21 as `standards/briefing.md` rule 13: the
  destination is the programme's own progress file
  ([`accuracy-programme-progress.md`](./accuracy-programme-progress.md) for the programme running
  now), and the line carries four columns — rows, corrections, whether a correction changed the
  work, and whether the brief forwarded a path or a paraphrase. The fourth was added over what this
  plan proposed, because rule 10 is adopted on one session's impression and nothing else can settle
  it. **What is owed is the SHAPE more than the writing, which is a correction to what this bullet
  first claimed.** That file does record corrections, per step, in prose, and carries the headline
  "Sixteen briefs, sixteen corrections" — so the errors are being caught and written down, which is
  further along than "no tally section" allowed. What prose cannot answer is the two columns rule 13
  adds: without **changed the work?**, a brief wrong about a detail and a brief wrong about the
  subject of its row are the same entry; without **hand-off**, rule 10 stays an impression
  permanently. Opening the tally is the orchestrator's — sub-agents do not edit `todo/`, so a lane
  cannot append its own row.
- **The scope-question pass** — mechanism 5's second half, an owner decision (above).
- **The symbol half of a tracker row**, which is the mechanisable neighbour of all of this and is
  already filed as `todo/cli.md` -> CLI-623. Nothing in this pass touches it, deliberately: it is a
  gate over `todo/`, not over a brief.

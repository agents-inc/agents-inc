# Why every brief was wrong, and what to do about it — investigation

**Status: scoped 2026-08-19, not started.** Deferred deliberately; the owner wants it treated properly
rather than folded into a working session.

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

1. The measurement verified or corrected.
2. A decision on each of the five mechanisms — adopt, reject, or trial — **with the reason recorded**,
   because a rejected mechanism reconsidered in six months should not be re-litigated from scratch.
3. Whatever is adopted written where an agent actually reads it. Note that a brief is not a document
   under `.ai-docs/`, so the bibles may be the wrong home entirely — the agent prompts and the
   orchestrator's own instructions may be the only places that bind.
4. A way to keep measuring the rate afterwards.

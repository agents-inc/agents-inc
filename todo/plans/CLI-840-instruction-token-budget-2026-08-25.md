---
last_validated: 2026-08-25
---

# CLI-840 — the instruction token budget, and what to do about it

**Status: analysis and proposal. Nothing here is ruled on.** Recorded 2026-08-25 at the owner's
request, to be tackled later. The measurements are real; the recommendations are argued opinion and
are marked as such.

## The problem, measured

Every session pays a standing instruction cost before any work begins, and every sub-agent dispatch
pays a second one on top.

|                                     | ~tokens     |
| ----------------------------------- | ----------- |
| root `CLAUDE.md`                    | 2,180       |
| `packages/cli/CLAUDE.md`            | 10,970      |
| **standing total, every session**   | **~13,150** |
| `cli-developer` compiled agent      | 10,750      |
| `cli-researcher`                    | 13,690      |
| `agent-summoner`                    | 19,980      |
| all 11 compiled agents concatenated | ~139,870    |

`packages/cli/CLAUDE.md` carries **82 NEVER/ALWAYS rules**, the longest running 214–248 words each.

**The number that reframes it:** in a compiled `cli-developer`, the `<role>` block — the only thing
distinguishing it from `cli-researcher` — is **4%** of the agent (483 of ~10,750 tokens). The other
96% is scaffolding shared with every sibling.

Re-derive before acting on any of this:

```
wc -w CLAUDE.md packages/cli/CLAUDE.md
grep -c '^- NEVER\|^- ALWAYS' packages/cli/CLAUDE.md
for f in ~/.claude/agents/*.md; do echo "$(basename $f) $(( $(wc -c <$f) / 4 ))"; done
```

## What the failure data says about the premise

The premise — _so many tokens are loaded that it is no wonder rules are skipped_ — is **not
supported by the corpus**, and this is the single most important finding for anyone picking this up.

Across 167 agent findings carrying a structured `root_cause` field:

| root cause                | n     | %      |
| ------------------------- | ----- | ------ |
| enforcement-gap           | 65    | 39%    |
| rule-not-specific-enough  | 38    | 23%    |
| convention-undocumented   | 25    | 15%    |
| missing-rule              | 20    | 12%    |
| rule-not-visible          | **7** | **4%** |
| scope-discipline-deferred | 6     | 4%     |
| premise-expired           | 6     | 4%     |

**Rules being unseen is 4%.** The dominant cause is a rule that was read, correct and specific, and
that nothing mechanically checked.

**The honest caveat, which cuts the other way:** `root_cause` is self-assigned by the agent that
filed the finding, and an agent that skipped a rule is unlikely to file _"I did not read it"_ — it
will file `missing-rule` or `convention-undocumented`. So 4% is a **floor**, not a measurement, and
the bias sits in exactly the category that would support the premise. Treat the distribution as
directional, not decisive.

## Idea 1 — run a compression tool over `CLAUDE.md` and the skills

**Opinion: mostly wrong as stated, with a correct operation hiding inside it.**

Against, in order of weight:

1. **It targets the 4% and pushes against the 23%.** Compression buys visibility; the corpus says
   visibility is barely the problem and _insufficient specificity_ is five times more common.
   Shortening rules makes them less specific by construction.
2. **The live counter-example is one day old.** The narrowest-union rule was WRONG and produced a
   false bug row (CLI-827) that cost a full dispatch. Fixing it made it **longer** — it needed the
   exception, the reason the exception exists, and the instruction to measure both TypeScript
   projects. A compressor run a week earlier would have shortened the broken version and made it
   permanently unfixable by reading.
3. **What makes a rule work is usually one clause naming the deciding fact**, and that clause reads
   as padding to anything counting tokens. Nothing mechanical separates _"this is why you cannot
   just cast it"_ from scene-setting.
4. **Nothing gates the content of `CLAUDE.md` or the partials** (see CLI-831). A 50% rewrite of the
   document that governs every other change, with no way to detect damage, is the worst possible
   place in the system for a large unverifiable edit. The failure would surface as agent behaviour
   weeks later and never be traced back.

**The version worth doing — deduplication, not compression.** Every long rule is long because it
carries an incident narrative, and that narrative is **already stored twice**, in `archive.md` and in
the finding it came from. Keep the imperative and the census command **verbatim**; move the story to
where it already lives and leave a pointer. That is most of the bulk, it is reversible, and nothing
is lost. It is a different operation from "make it concise" and should not be done by a tool that
cannot tell the two apart.

Skills are a separate question with a different risk profile and are not analysed here: a skill is
reference material, and shortening reference material loses cases rather than words.

## Idea 2 — a repeater / re-verify skill at the end of the lifecycle

**Opinion: right, and the better of the two.** It targets the failure mode the corpus and the
2026-08-25 session both actually exhibit — work reported as landed while residue survived, docs debt
deferred, obligations forgotten between the doing and the finishing.

The attention argument is real and is the one thing that genuinely addresses rules being skipped:
instructions given at the start are thousands of tokens away by the end of a long turn, and
re-injecting them at the end is a direct fix. It runs once, so it is cheap relative to its reach.

**Three design changes I would argue for:**

1. **Fresh context, not a self-check.** Every valuable catch on 2026-08-25 came from a _different_
   agent re-deriving — the scaffold bug found by a documentation agent checking a count, the diverged
   bindings found by the positives lane, CLI-827 refuted by its own implementer. An agent that missed
   something usually misses it again for the same reason. This repository already ruled it: **the
   verifier is never the fixer** (2026-08-19). The repeater should be a fresh dispatch carrying the
   original brief and the diff, not a continuation of the agent that did the work.
2. **The stop condition must be mechanical.** "Loop until nothing is missed" terminates on fatigue,
   not on truth — an agent that wants to finish will converge on "nothing missed" regardless. The
   condition should be: the gate commands pass, the census commands of every rule that applied return
   clean, and the tracker and documentation obligations are discharged.
3. **Build the hyper-focused variant first.** A pass carrying _only_ the rules and the diff, with no
   implementation context, is a far better attention setup for rule-checking than a context full of
   the work — which is precisely why narrow single-question dispatches outperformed on 2026-08-25.

**The cost caveat:** a repeater adds a pass to every task. It only pays for itself if it stays
narrow. If it loads the full rule set plus the full diff plus the original brief, it becomes another
15k-token context and the savings evaporate. Load the rules that plausibly apply and pull more only
when a check fails.

## Sequencing — the recommendation held with most conviction

**Do the repeater first, because it generates the evidence that would make compression safe.**

There is currently no data on which of the 82 rules ever fire and which never do. A repeater that
reports _which rules applied and which censuses ran_ produces exactly that, per task, as a
by-product. After some weeks it would be knowable which rules earn their tokens and which have never
once been the deciding factor — and only then is a cut informed rather than blind.

Doing it the other way round means the checker's first job is policing a rule set nobody validated.

## Where the pieces would land

- **Token measurement, `CLAUDE.md` deduplication, agent partials** — `packages/cli`, this tracker.
- **The repeater skill itself** — the skills marketplace repository, so its row belongs in
  [`skills.md`](../skills.md) when it is built. Note the split before starting.
- **The SDLC ordering** the owner described — tests red, implement, green, expressive-TypeScript
  skill, documentation, **then the repeater** — is a change to the process in the root `CLAUDE.md`
  "How work gets implemented" section, so it touches a third place.

## Adjacent rows this depends on or informs

- **CLI-831** — nothing gates methodology-partial content. Any partial edit is unverifiable until
  this exists, which is why it constrains Idea 1.
- **CLI-837** — dynamic skills have never worked (no agent is granted the `Skill` tool). Relevant
  because the ~992-token activation protocol is currently paid for and unusable; the owner ruled on
  2026-08-25 that the protocol **stays** and is needed, so the fix is to grant the tool rather than
  retire the block.
- **CLI-838** — ejected templates in `.claude-src/` shadow `src/`, so this repository's own agents
  compile from stale copies. Any measurement of partial size must account for which file actually
  renders.

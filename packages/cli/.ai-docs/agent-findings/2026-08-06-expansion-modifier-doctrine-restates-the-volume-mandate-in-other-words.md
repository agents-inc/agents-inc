---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/prompt-bible.md
  - src/agents/meta/agent-summoner/playbook.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >
  CLI-415 rewrote the doctrine itself. Owner ruling 2026-08-06: expansion modifiers are a
  CONDITIONAL tool for tasks where the model demonstrably under-delivers, not an ingredient of
  every prompt. `prompt-bible.md` "Technique #6" is now "Conditional Expansion Modifiers for
  Sonnet 4.5" and states the rule rather than only demonstrating it — a "When to Use" list naming
  the trigger, a "The Conditional Rule" paragraph replacing "Critical for Sonnet 4.5", a "Key
  Modifiers That Work" list rebuilt from the proportionality voice, a "Modifiers That Backfire"
  list describing the retired shapes without reproducing them, and an "Application" paragraph that
  drops "EVERY task description" and "This is NOT optional". The evidence the ruling turned on is
  recorded in the technique as a "Case Study — What the Unconditional Form Cost": the reviewer
  agents' standing modifiers produced over-engineered reviews the owner stopped using.
  Ten cross-reference sites were aligned in the same file: the metrics table, the Sonnet-vs-Opus
  table, "Critical Differences from Sonnet 3.5", "Required Adjustments for 4.5", two
  validation-checklist items, Example 2's role block and its "Improvements" bullet, the "Produces
  Minimal Implementations" troubleshooting entry, and the conclusion's principle 6. One site
  outside the bible: `agent-summoner/playbook.md`'s one-line summary of technique 6, which quoted a
  retired phrasing verbatim. Five sites were deliberately left ALONE because they name the
  technique without restating the mandate — the canonical-structure role slot, its ordering
  rationale, the `<role>`-wrapper checklist item, and the two before-example problem lists. Those
  govern the identity line, whose CONTENT CLI-414 already made proportional; the conditionality
  this pass adds governs TASK descriptions, which is why the two do not conflict. Proposed Standard
  items 1 and 2 are closed by this pass; item 3 is a verification habit, not a diff.
---

## What Was Wrong

CLI-414 removed "comprehensive and thorough" from the summoner's playbook, identity partial and
output exemplars, and from the prompt bible's "Optimal structure" worked example. The grep it was
verified with — zero hits for that phrase — cannot see the doctrine that produced the phrase, and
that doctrine is untouched.

`prompt-bible.md` -> "Technique #6: Explicit Expansion Modifiers for Sonnet 4.5" states the same
volume mandate in words the phrase-grep misses:

- its "Key Modifiers That Work" list offers "Include as many relevant features and interactions as
  possible", "Go beyond the basics to create a fully-featured implementation" and — one word-order
  away from the phrase just removed — "Be thorough and comprehensive in your approach";
- its "Application" paragraph is unconditional: add expansion modifiers to EVERY task description,
  "This is NOT optional for Sonnet 4.5";
- "Required Adjustments for 4.5" repeats the same two-line block as a prescribed edit.

`agent-summoner/playbook.md` carries the compressed version in its Essential Techniques list, where
technique 6 is summarised as `"Include as many relevant features as possible" counters conservative
defaults`. Both of the playbook's mandate sites now quote the proportionality line, but they cite
the technique by the name whose definition still says the opposite.

So the mandate survives in a second vocabulary. An author following technique #6 to the letter
writes a volume modifier, is compliant with the bible, and reintroduces at the next agent exactly
what CLI-397 and CLI-414 took out.

## Fix Applied

None — discovery only. CLI-414's scope is the two playbook mandate sites, the summoner's identity
partial, both output exemplars and the bible's worked example. Technique #6 is the doctrine those
sites cite rather than one of the sites, and rewriting a numbered technique in a standards document
changes what every future prompt is measured against — that is the owner's call, not a verification
step smuggled into a text pass.

## Proposed Standard

1. Decide technique #6's post-proportionality form in `prompt-bible.md`. Either it keeps a volume
   framing and the softened prompts are a documented exception, or it becomes a calibration
   technique — "counter the conservative default without inflating the deliverable" — and its "Key
   Modifiers That Work" list and unconditional "EVERY task description" application are rewritten to
   match. Leaving the technique and the prompts it governs in disagreement is the state that
   produced this finding.
2. Whatever is decided, state it as a rule in the technique itself. This is the same conclusion as
   item 2 of `2026-08-06-comprehensive-and-thorough-is-mandated-by-the-summoner-and-the-prompt-bible.md`,
   reached from the opposite end: that finding observed the phrase spreading out of a worked example,
   and this one observes the rule behind the example still mandating it.
3. Verify a mandate's removal by reading the technique it came from, not only by grepping the string.
   A phrase-level grep returning zero is evidence about one wording, not about the rule.

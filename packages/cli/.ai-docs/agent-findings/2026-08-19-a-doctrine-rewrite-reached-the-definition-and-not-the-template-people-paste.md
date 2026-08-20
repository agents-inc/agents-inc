---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/standards/prompt-bible.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-19
reporting_agent: agent-summoner
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The `<task>` slot in the delegation template now carries a conditional placeholder naming
  Technique #6 and stating why omission is the default, in place of the retired volume line.
---

## What Was Wrong

`prompt-bible.md` § 8.5 "Delegation Prompt Template" — the block every delegation prompt is copied
from — carried this in its `<task>` slot:

> **Include all relevant edge cases; go beyond the minimum.**

Technique #6 in the same document lists exactly that shape under "Modifiers That Backfire"
("anything asking to go past the task's basics for its own sake") and says of the whole class: "They
were retired from this bible and from the bundled agent prompts in the reviewer-restraint pass; do
not reintroduce them."

The pass that rewrote the doctrine aligned ten cross-reference sites inside the technique's own
neighbourhood — the metrics table, two model-comparison tables, two validation-checklist items, a
worked example, a troubleshooting entry and the conclusion — and one site outside it. It did not
reach § 8.5, which is six sections away and reads as boilerplate rather than as doctrine. So the
document stated the rule in one place and handed out its violation in another, and the copy-paste
site is the one with the higher duty cycle: the definition is read once, the template is pasted into
every delegation.

The wording is also why it survived. It shares no phrase with "be comprehensive and thorough", so a
sweep verified by phrase-grep — the verification this class keeps being closed with — cannot see it.

## Fix Applied

Replaced with a conditional placeholder in the same angle-bracket style as the template's other
slots, naming the technique and stating why the default is to omit it:

> `<expansion modifier — ONLY if the task is genuinely broad; see Technique #6. Omit it otherwise,`
> `because on a scoped task it is an instruction to exceed the scope and will be obeyed.>`

## Proposed Standard

When a standards document changes a **rule**, the sweep is not the rule's own section plus its
cross-references. It is every place the document hands the reader something to copy: templates,
worked examples, checklists, boilerplate blocks. Those are the sites with the highest duty cycle and
the lowest scrutiny, because a reader pasting a template is not reading the section it sits in.

Read them, do not grep them. A template restates a rule in the shape of an instruction, not in the
shape of the sentence that stated it — which is precisely why a phrase-grep over the retired wording
returns zero while the mandate is still being issued.

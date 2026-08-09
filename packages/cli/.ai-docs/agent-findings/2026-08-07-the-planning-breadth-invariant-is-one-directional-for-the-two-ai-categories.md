---
type: standard-gap
severity: low
affected_files:
  - packages/matrix/src/read-model/preload-defaults.ts
  - packages/matrix/src/read-model/preload-defaults.test.ts
  - packages/matrix/src/read-model/assignment-defaults.test.ts
standards_docs:
  - .ai-docs/reference/features/built-in-catalogue.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The code side landed — the reverse pin was widened and an exact eight-id pin was added to cover
  what the widening lets through. The standard is unwritten: nothing in the docs distinguishes a
  category whose every member is breadth from one the owner merely designated as eligible.
---

## What Was Wrong

The planning column was pinned as a **bidirectional** category invariant, mirroring the reviewer
rule: every `PRELOAD_DEFAULTS` entry in a framework or state category must name `planning`, and no
entry outside those categories may name it. Both directions read the same predicate, so the kind
was the whole rule and a new framework skill joined the column by arriving.

The 2026-08-07 AI breadth ruling does not fit that shape. The AI domain has no framework category,
and what an AI project is built on is the provider SDK plus the orchestration framework — so
`ai-provider` and `ai-orchestration` are its breadth. But `ai-provider` also holds the capability
skills (`claude-vision`, `elevenlabs`, `openai-whisper`), which the ruling deliberately leaves off
the column: which speech model a feature calls is what a spec asks about when it touches that
feature, not what every session opens with.

So the two AI categories are **designated** breadth, not automatic breadth. Widening the reverse pin
("planning nowhere but a framework or a state kind") to admit them is correct. Widening the forward
pin ("every entry in these kinds names planning") would be false — it would demand a planning row on
`ai-provider-elevenlabs` the moment anyone gave that skill a row for any reason.

The gap this leaves: after the widening, a planning row added to a capability skill passes the
reverse pin. The category-level invariant cannot see the distinction the ruling drew, because the
distinction is not a property of the catalog — nothing in the data marks a provider SDK as platform
and a speech model as capability.

## Fix Applied

Both halves, deliberately asymmetric, with the asymmetry written into the test comments:

- Forward pin unchanged — still framework and state kinds only, since those are the kinds where
  every member is breadth.
- Reverse pin widened to `isBreadthSkill(skillId) || isAiPlatformSkill(skillId)`.
- A third pin closes what the widening opens. It compares every AI-domain row naming `planning`
  against the exact eight ids the ruling names, so a ninth AI row gaining `planning` fails by id
  whatever category it sits in.
- The compiled side is pinned the same way: `ai-pm`'s eager column is asserted as exactly those
  eight through `resolveAssignment`, plus a counterweight that the three capability skills are
  reached and lazy.

## Proposed Standard

`built-in-catalogue.md` (or `agent-system.md`, wherever the preload column rules end up) should
name the two shapes and say which pin each gets:

- **Automatic breadth** — every skill in the category is breadth (frameworks, state kinds). Pin both
  directions on the category; ids stay out of the test.
- **Designated breadth** — the owner ruled the category eligible but not every member qualifies
  (`ai-provider`, `ai-orchestration`). Pin the reverse direction on the category and the forward
  direction on an **explicit id list**, because the catalog carries no field that separates the
  members.

The rule to write down is the trigger: any breadth ruling that names ids rather than a kind is a
designated-breadth ruling and needs the id pin, or the category invariant will quietly stop being an
invariant.

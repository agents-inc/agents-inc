---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/agent-partials.test.ts
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The presence roster now runs over REQUIRED_PARTIALS only (identity.md, the one partial
  readAgentFiles reaches through readFile). The two optional partials keep their technique-tag
  and self-wrap assertions, which are conditional on the file existing, and gain a new assertion
  over the liquid guard that makes the optionality real. Shown red before and green after against
  a fixture agent tree with tester/cli-tester/critical-reminders.md removed.
---

## What Was Wrong

`agent-partials.test.ts` asserted, for each of three partials, that the set of agents holding a
copy equalled every generated agent name. Two of those three files are optional everywhere the
product states the contract:

- `readAgentFiles` in `src/cli/lib/compiler.ts` reads `identity.md` and `playbook.md` through
  `readFile` and `critical-requirements.md`, `critical-reminders.md` and `output.md` through
  `readFileOptional(..., "")`.
- `src/agents/_templates/agent.liquid` wraps both sections in `{% if criticalRequirementsTop != "" %}`
  and `{% if criticalReminders != "" %}`, so the whole section — wrapper, content and the `---`
  under it — is dropped for an agent that ships no such file.
- The shipped `agent-summoner` playbook's "The Agent Structure" tells an author in as many words
  that of the five markdown partials only two are required and "the template omits the section
  whose file is absent".

So the suite reddened on an agent authored by following the product's own instructions. The
failure mode is the expensive direction: the gate could only ever fail on correct work, and the
author it fails is the one who read the playbook rather than copied a neighbour.

**A roster is a claim about the contract, and this one was written from the tree instead.** Every
agent on disk happened to hold all three when the gate was written on 2026-08-20 — the census is
`for d in src/agents/*/*/; do ls "$d"; done` and it still returns all three for all eighteen
today — while the optionality it contradicts had been in the compiler and the template since at
least 2026-08-04 (`461f60ca`). Nothing distinguishes "every agent must have this" from "every
agent currently does", and a `toStrictEqual` against the full name list reads identically either
way.

The second-order cost is that the roster silently made a second thing mandatory. The gate also
required `<self_correction_triggers>` in every `critical-requirements.md`; because presence of the
file was mandatory for all eighteen agents, the block was transitively mandatory for all eighteen
too — while `prompt-bible.md` Technique #7's Application reads "There is no floor: an agent whose
moments are all named elsewhere in its own prompt carries none." One assertion mandating a file
had quietly mandated a prompt technique two documents away.

## Fix Applied

The contracts split into `REQUIRED_PARTIALS` and `OPTIONAL_PARTIALS`, named for what
`readAgentFiles` does with each, and the presence roster runs over the required list only.

Deleting the roster for the optional two would have left nothing in its place, so the optional
contracts carry `omitsWhenAbsent` — the exact liquid guard — and a new assertion holds
`agent.liquid` to it. That is the assertion the roster is traded for, and it is the stronger one:
the roster could only ever say "the file is there", whereas the guard is the mechanism that makes
absence legal, and losing it compiles an empty `<critical_reminders>` wrapper around nothing into
every agent that omits the file — a defect no assertion over the partials can reach, because they
only ever open files that exist. Shown red by stripping the guard from a fixture copy of
`agent.liquid`.

Everything conditional on a file existing survives unchanged in mechanism: the technique tag
(`<domain_scope>`, `<self_correction_triggers>`, `<post_action_reflection>`) and the negative
self-wrap check both run over `everyCopyOf(file)`, which reads whatever is on disk. A
`critical-requirements.md` that exists and has lost its triggers block still fails.

## Proposed Standard

For `CLAUDE.md` -> "Test Assertions", beside the existing roster rule ("NEVER assert a directory
listing, roster or generated union by count alone"), which governs HOW to assert a roster and is
silent on WHETHER one is owed:

**NEVER assert a presence roster over files the product treats as optional.** Before pinning "every
X holds Y", find the code that reads Y and the template that renders it. A `readFileOptional` with
a default, or a `{% if %}` around the section, means absence is a supported state and a roster over
it can only fail on correct work — it will redden for the author who followed the shipped
instructions, and the tree being complete today is not evidence that it must be. Where the roster
goes, put the mechanism that makes the absence legal under assertion instead: the guard, the
default, the fallback. That assertion is falsifiable in the direction that matters, and it is the
one thing a per-file read cannot see.

Cross-checked against CLAUDE.md: this does not conflict with the count rule above it (a roster that
IS owed still gets members, never a count) or with "NEVER encode a known gap in an assertion's
ARITY, LENGTH or ABSENCE" — the absence here is a supported product state named in a shipped
playbook, not a defect being pinned.

Census of the class, run 2026-09-03 over every reference to the two optional partials outside
`src/agents/`:

```
grep -rn "critical-reminders\|critical-requirements\|CRITICAL_REMINDERS_MD\|CRITICAL_REQUIREMENTS_MD" \
  --include='*.ts' --include='*.tsx' packages apps | grep -v node_modules | grep -v "/dist/"
```

No sibling carries the same shape. `compiler.test.ts` builds a two-agent fixture where
`api-developer` deliberately ships only `identity.md` and `playbook.md`;
`agent-baseline-is-slim-and-positively-framed.test.ts` renders with both keys `""`;
`generate-compile-package.ts` reads both through `readOptional`; and the lists in `eject.test.ts`
and `utils/messages.ts` enumerate what `eject agent-partials` puts under a reader's control, which
is a different claim from what an agent must hold.

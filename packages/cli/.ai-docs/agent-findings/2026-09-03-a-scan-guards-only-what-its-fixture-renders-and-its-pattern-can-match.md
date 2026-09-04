---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/agent-baseline-is-slim-and-positively-framed.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `SHOUTING` gained a numeral alternative, so the literal it was written for matches; the render it
  scans became `renderBaselineWith`, taking the skill posture as a parameter, and `BASELINE_BRANCHES`
  drives every scan over all three branches of the template's closing chain plus a marker assertion
  per branch that keeps them from passing on an unrendered block. The residue the two fuzzy patterns
  cannot reach without over-firing is held by a third constant, `RETIRED_FORMS` — exact
  case-sensitive substrings of the forms the template deliberately retired, each carrying its
  origin. Shown red by pointing the render at HEAD's `agent.liquid` through a scratch template
  override — twelve of fifteen failed, and all eleven roster entries fired on the dynamic-skills
  branch.
---

## What Was Wrong

Two defects in one guard, and they are the same defect at two levels: **a scan protects only what
its fixture renders and what its pattern can match, and no gate in this repository can see either
limit.** The file passed on the day it was written, and would have gone on passing through a full
revert of the thing it exists to prevent.

### The pattern could not match the literal it was written for

`SHOUTING` was `/\b[A-Z][A-Z']{2,}(?:\s+[A-Z][A-Z']{2,}){3,}\b/` — four or more consecutive
capitalised words. The line that motivated the guard is
`**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**`,
which `agent.liquid` carried twice at HEAD, once opening the body and once closing it. The `5` is
not a capitalised word, so it cut the run into `DISPLAY ALL` and
`CORE PRINCIPLES AT THE START OF EVERY RESPONSE...` — two runs, and the pattern needs four words in
one. Verified before changing anything:

```
node -e 'console.log(/\b[A-Z][A-Z'"'"']{2,}(?:\s+[A-Z][A-Z'"'"']{2,}){3,}\b/.test("**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**"))'
false
```

The guard was written in the same pass that deleted the line, so nothing ever put the two in front
of each other. Every other shouted form in the template — the spelled-out `ALL FIVE` variant, and
`ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN` — matched, which is what made
the pattern look correct.

### The fixture rendered one of the three branches it was scanning

The render passed `dynamicSkills: []` and `preloadedSkillIds: []`, and the template closes with a
three-way chain: `<skill_activation_protocol>` when dynamic skills exist, a preloaded
`<skills_note>` when the frontmatter carries skills, and a no-skills `<skills_note>` otherwise. One
fixture selects one branch, so two thirds of the text the file claims to scan was never read.

The unread third is where the damage lived. HEAD's `<skill_activation_protocol>` block carried
"COMPLETELY WORTHLESS", "LYING TO YOURSELF", "MISS PATTERNS, VIOLATE CONVENTIONS, AND PRODUCE
INFERIOR CODE" and "Do NOT proceed to implementation until ALL relevant skills are loaded" — the
worst prose in the template's history, in the one block neither scan could see.

**What makes this shape hard to notice:** `offendingLines` answers `[]` just as readily for a block
that never rendered as for one that rendered calmly. The assertion is `toStrictEqual([])` either
way, so a fixture that reaches nothing and a template that is clean produce byte-identical output.

## Fix Applied

Five changes, all in the one file.

1. `SHOUTING` is now `/\b[A-Z][A-Z']{2,}(?:\s+(?:\d+\s+)?[A-Z][A-Z']{2,}){3,}\b/` — an interior
   numeral is a separator rather than one of the four words. Four capitalised words are still
   required, so a number cannot pad a three-word run. Match matrix, all six cases run against both
   constants (a census of the cases named in the brief, not a sample of the template):

   | Text                                                           | Old   | New   |
   | -------------------------------------------------------------- | ----- | ----- |
   | `DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE` | miss  | match |
   | `DISPLAY ALL FIVE CORE PRINCIPLES ...`                         | match | match |
   | `ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES ...`     | match | match |
   | `The CLI has 13 commands and 18 flags`                         | quiet | quiet |
   | `Use TypeScript 5 strict mode`                                 | quiet | quiet |
   | `Run npm test 2 times`                                         | quiet | quiet |

   Padding checked separately: `ONE TWO 3 FOUR` and `ONE 2 TWO 3 THREE` both stay quiet.

2. The constant's docblock names the spelling that motivated the change, so a later reader cannot
   simplify the numeral alternative back out without meeting the reason for it.

3. The render became `renderBaselineWith`, taking the four skill fields as a parameter. Three
   builders name the three postures; each returns a fresh object, so no two specs share an array
   by identity.

4. `BASELINE_BRANCHES` drives both scans over all three branches.

5. Each branch also asserts a marker only that branch emits. This is the half that stops the scans
   passing for free — without it, a posture that selected the wrong branch, or a later edit that
   deleted a branch outright, leaves both assertions green. The dynamic-skills marker is
   `<skill_activation_protocol>` itself, which doubles as the positive invariant the owner ruled on
   the same day: the block stays, so a test asserting its ABSENCE would have been wrong.

`BASELINE_BYTE_BUDGET` still measures the no-skills posture only, and its docblock now says why —
a budget taken over a render carrying skills is a fact about a project's configuration rather than
about the template, passing for one stack and failing for another.

**Shown red before being trusted.** HEAD's `agent.liquid` and its six methodology partials were
written into a scratch directory as a per-project template override, and `renderBaselineWith` was
temporarily pointed at it. Nine of the twelve specs failed. The shouting scan's output on the
dynamic-skills branch, verbatim:

```
[
  "**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**",
  "- Proceeding to implementation without loading relevant skills means you will **MISS PATTERNS, VIOLATE CONVENTIONS, AND PRODUCE INFERIOR CODE**",
  "**DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE TO MAINTAIN INSTRUCTION CONTINUITY.**",
  "**ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN. NEVER REPORT SUCCESS WITHOUT VERIFICATION.**",
]
```

The first and third entries are the line the old pattern could not see. The second is reachable
only from the dynamic-skills render. The override was removed and the file restored byte-for-byte
before the gates were run.

## Follow-Up: One Mechanism Was Doing Two Jobs

The first pass measured that three of the four coercive lines in HEAD's skills block slip through
both patterns and declined to widen them — the false-positive pressure is real and permanent. That
measurement was right and the conclusion was incomplete: it is a design fault, not a dead end.

**The two jobs have opposite requirements.** Catching prose nobody has written yet is irreducibly
fuzzy; catching a revert to text we deliberately retired is not, because that set is known, finite
and enumerable, so exact matching achieves zero false positives and a fuzzy pattern is strictly
worse at it. `SHOUTING` and `PROHIBITIONS` are tuned for the first and were being asked to cover the
second.

`RETIRED_FORMS` is the third mechanism: eleven exact case-sensitive substrings, each with a one-line
statement of where it came from. Derived mechanically — render the pre-slimming baseline, subtract
every line the two fuzzy scans already catch, keep the retired coercive forms from what remained.

Eight of the eleven are unreachable by either fuzzy pattern (census, run against both
constants); the other three are kept anyway, so the roster reads as the whole record of what was
taken out rather than as the residue of two patterns whose tuning may move. Every entry fires
against HEAD, so none is dead weight. Verbatim, the dynamic-skills branch:

```
[
  "DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE",
  "ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN",
  "you MUST follow this three-step protocol",
  "Do this for EVERY skill. No exceptions.",
  "CRITICAL WARNING",
  "COMPLETELY WORTHLESS",
  "NOT AVAILABLE TO YOU",
  "DOES NOT EXIST",
  "LYING TO YOURSELF",
  "MISS PATTERNS, VIOLATE CONVENTIONS, AND PRODUCE INFERIOR CODE",
  "The Skill tool exists for a reason. USE IT.",
]
```

All four of the lines the first pass reported as unreachable are now caught. Twelve of fifteen specs
fail against HEAD, up from nine of twelve.

**Deliberately excluded, because a roster that over-claims is worse than a short one.** The
`**CRITICAL: Never speculate…**` and `**CRITICAL: Never report success…**` openers were REWRITTEN
into the positive framing of `operating-principles.liquid` rather than retired, and `PROHIBITIONS`
already holds them. The bare `You MUST read those files` construction is an instance of a general
shape rather than a distinctive line, so an exact substring would pin one sentence and miss the
class. Everything in `improvement-protocol.liquid` is out: the file sits beside the five but no
`{% render %}` tag reaches it, so an entry from it could never fire — a vacuous roster row. The
success-criteria partial's worked examples (`PASS Verified: …`, `Mark as PASS (met) or FAIL (not
met)`) are prose from a deleted document rather than a retired phrasing. Nothing from the seventeen
unmigrated agents is in scope; the guard renders the template baseline only.

### The byte figure this docblock carried did not reproduce

The `BASELINE_BYTE_BUDGET` docblock said the baseline weighed 16,994 B on 2026-09-03, unqualified.
Measured through `renderAgent` against HEAD's template, all three postures:

| Posture             | Stamped bytes |
| ------------------- | ------------: |
| no skills           |        15,410 |
| one preloaded skill |        15,442 |
| one dynamic skill   |        16,950 |

None is 16,994; the nearest is 44 B away. The docblock now states 15,410 B **with the posture** —
the no-skills one, which is what the budget measures — and records the other two, because an
unqualified byte count over a three-branch render names three numbers and settles none.

## Proposed Standard

Two rules, one for each half. Both belong in `CLAUDE.md` under **Test Assertions**, beside
"NEVER let a spec's NAME claim validation that its mocks have removed" — that rule is the same
class arriving from the mocking end (a spec whose subject its own fixture removed), and it could
not reach here because there is no mock.

**NEVER write a guard against a description of the offending text — write it against the text.** A
regression guard is usually written in the pass that DELETES its subject, which is exactly when
"watch it fail" has nothing left to fail against. Reconstruct the retired text from
`git show HEAD:<path>`, feed it through the guard's own constants, and paste what trips into the
finding or the docblock. `CLAUDE.md`'s existing "write the tests first and watch them fail" is
correct and one step too general: it reads as a rule about ordering, and a guard added alongside a
deletion satisfies the ordering while never meeting its subject.

**NEVER let a scan's coverage be a property of one fixture.** Where a spec scans RENDERED output,
enumerate the branches the renderer can take and run the scan over each, and give every branch an
assertion that the block it names actually rendered. A negative scan answers the empty array for a
block that never rendered, so without the positive half the arity of the coverage is invisible:
three branches and one fixture reads exactly like three branches and three.

The second rule extends `standards/e2e/anti-patterns.md` -> **Reachability**, which today covers
"prove the surface is reachable before writing the spec" for keypress paths in E2E flows. The
generalisation is that a template branch is a surface too, its fixture is what reaches it, and the
consequence there is the vacuous pass that section already names. That doc is scoped to E2E and
this file is a unit spec, which is why the primary home is `CLAUDE.md`; a cross-reference in the
Reachability section would be the smaller edit if only one is wanted.

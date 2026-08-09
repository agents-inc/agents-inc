---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/agent-findings/2026-08-07-cli398s-prose-sweep-stopped-at-the-pm-prompts-twenty-reviewer-names-still-dangle.md
  - .ai-docs/agent-findings/2026-08-06-cli398-consolidation-left-dangling-reviewer-names-in-pm-prompts.md
  - src/cli/lib/configuration/config-generator.test.ts
standards_docs:
  - .ai-docs/agent-findings/README.md
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Three times now the reviewer consolidation has been swept, and three times the sweep's own record of
what it touched has been narrower than the tree.

The 2026-08-06 finding claimed a clean tree-wide grep after fixing ten files in four directories; the
2026-08-07 successor caught that and is the reason CLI-431 exists. But the successor made a smaller
version of the same mistake. It reported "roughly twenty hits in fifteen files" and listed fifteen
paths in `affected_files:`. CLI-431's sweep found **35 hits in 20 files**. The five it never named:

| File                                    | Hits |
| --------------------------------------- | ---- |
| `researcher/cli-researcher/identity.md` | 2    |
| `meta/agent-summoner/playbook.md`       | 3    |
| `meta/convention-keeper/identity.md`    | 1    |
| `meta/skill-summoner/identity.md`       | 1    |
| `developer/ai-developer/playbook.md`    | 1    |

The shape of the omission is legible in the list itself: fifteen of the fifteen entries are
`identity.md` or a `playbook.md` whose `identity.md` sibling was already a hit. Nothing in the
successor's prose is wrong — the four bullets naming which agent carried which name are accurate as
far as they go — but `affected_files:` was assembled by reading the grep's summary rather than
pasting its output, and the two files with no `identity.md` hit at all
(`convention-keeper`, `skill-summoner`) fell straight through.

**And one reference lived outside the grep's scope entirely.** Both findings propose the same gate:
`grep -rn "<old-name>" src/agents/` must return nothing. Run against `src/` instead, it also
returns a comment in `src/cli/lib/configuration/config-generator.test.ts` describing a seeded agent
as `web-reviewer` while the code on the next line correctly reads `reviewer` — a leftover from
CLI-398's own rename, in a file CLI-398 edited. A retired agent name is a lie wherever it appears;
`src/agents/` is where the _prompts_ are, not where the _name_ is.

## Fix Applied

Both halves fixed under CLI-431: the five unnamed files were swept along with the fifteen listed
ones, and the test comment now says `reviewer`. The verification was run at the wider scope and at
both ends of the build — `grep -rn` for the five retired reviewer names and the five retired PM
names returns nothing across `src/` and nothing across a rebuilt `dist/`.

The predecessor finding is marked `resolved` and its body now carries the corrected count and the
five missing paths, so the lineage records what the enumeration actually was.

## Proposed Standard

Two changes, both to the shape of the record rather than to anyone's diligence:

1. **`affected_files:` must be the grep's output, pasted.** `README.md`'s "Resolution Model" already
   says a `resolved_by:` verification command is evidence only when it was run. Extend that to the
   discovery side: when a finding's claim is "N hits in M files", `affected_files:` is the file list
   that produced N and M, transcribed — not re-derived from the prose. A hit count and a file list
   that disagree are the signal, and here they disagreed by five files and fifteen hits with nothing
   to notice it.

2. **The rename gate's scope is `src/`, not `src/agents/`.** Both predecessors scope the proposed
   grep to the agent partials because that is where the sweep hurt most. Widen it: the check both
   findings want is `grep -rn "<retired-name>" src/`, and it costs nothing more to run. The lint
   rule they each float as the longer-term fix should be scoped the same way — over `src/**`,
   including comments, not `src/agents/**/*.md`. Note when writing that rule that the retired names
   are substrings of live skill ids' neighbours: `cli-reviewer` must not match
   `meta-reviewing-cli-reviewing`, which is a legitimate skill id and appears in the reviewer
   agent's own `output.md`.

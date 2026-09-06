# Sub-agents — doctrine alignment

Progress file for the programme that brings all **18 shipped sub-agents** in
`packages/cli/src/agents/` in line with the doctrine settled on 2026-09-03, applying what the
parallel [web-skills programme](./web-skills-doctrine-alignment-2026-09-04.md) learned across its two
passes.

**Started 2026-09-04.** One line per dispatch, appended as each lane lands.

---

## The finding that opened it

**The doctrine rewrite reached 2 of 18 agents.** [`summoner-context-engineering-2026-09-03.md`](./summoner-context-engineering-2026-09-03.md)
rewrote `meta/agent-summoner` and `meta/skill-summoner` and stopped there — which its own commit
message says plainly (_"the two summoners are rewritten in the voice the doctrine now asks for"_).
The other sixteen still carry the forms the doctrine retired:

```bash
cd packages/cli/src/agents
for d in */*/; do printf '%-28s %s\n' "$d" \
  "$(grep -c 'You MUST' $d*.md | awk -F: '{s+=$2} END{print s+0}')"; done
```

|                                | Count                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `**(You MUST …)**` occurrences | **228**, across 16 agents (10–22 each)                                                                                                  |
| `CRITICAL:` headings           | 14 agents                                                                                                                               |
| "Failure to follow…" closers   | 15 agents                                                                                                                               |
| Agents clean                   | **2** — `meta/skill-summoner` (0/0/0), `meta/agent-summoner` (its single `You MUST` is the `<voice>` section _naming the retired form_) |

Two probes came back clean and are recorded so nobody re-runs them: **no agent restates
`operating-principles.liquid`**, and the apparent doubled wrapper tags in `agent-summoner/playbook.md`
and `skill-summoner/output.md` are inside fenced diagrams documenting the structure, not real tags.

## What this programme adds beyond the 2026-09-03 rewrite

The skills programme's second pass found that **rewriting introduces worse defects than deleting
does** — two fabricated technical claims shipped by a cleanup pass that self-reported clean. So this
programme runs the substitution lens from the start rather than discovering it halfway through, and
carries four further failure shapes that a "did anything get lost?" reading cannot see:
under-specification, the last surviving copy of an identifier, a rule with its counterweight removed,
and one rule lost to several individually-correct deletions.

---

## Scope

**`packages/cli/src/agents/` only.** `packages/cli/.claude-src/agents/` is a hand-maintained copy
with **no sync script**, and it has already drifted from the shipped tree in five files —
`_templates/methodologies/operating-principles.liquid`, `meta/agent-summoner/playbook.md`,
`meta/skill-summoner/{output,playbook}.md` and `reviewer/reviewer/playbook.md`. In every one,
`src/agents` carries the newer text, so **this repository dogfoods staler copies of its own agents
than it ships.** Syncing is a follow-up decision, recorded below rather than taken.

`_templates/methodologies/operating-principles.liquid` renders into all eighteen, so a word cut there
is cut eighteen times. It is 30 lines and already tight; lanes report changes to it rather than
making them.

---

## Result — measured, all six lanes landed

|                                     | Before                | After              |                                                            |
| ----------------------------------- | --------------------- | ------------------ | ---------------------------------------------------------- |
| **Markdown lines across 18 agents** | 14,236                | **9,026**          | **−37%**                                                   |
| `**(You MUST …)**`                  | 228                   | **1**              | the `<voice>` section naming the retired form to forbid it |
| `CRITICAL:` headings                | 26                    | **0**              |                                                            |
| "Failure to follow…" closers        | 15                    | **0**              |                                                            |
| Largest agent                       | `codex-keeper`, 1,680 | `ai-tester`, 1,119 | `codex-keeper` is now 413                                  |

### Gates, final run

| Gate                                                     | Result                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bun run generate` then `generate:compile:check`         | **`packages/compile matches what the generator emits`** — corpus regenerated once for the whole programme |
| `bun run typecheck`                                      | **✓ No TypeScript errors**, all three projects                                                            |
| `npx prettier --check "packages/cli/src/agents/**/*.md"` | All matched files use Prettier code style                                                                 |
| Three required files per agent                           | **18/18**                                                                                                 |
| Restates `operating-principles.liquid`                   | none                                                                                                      |
| Doubled wrapper tags                                     | none — the two hits are fenced diagrams documenting the structure                                         |

**Amended after the correction round.** Lanes A and D were re-dispatched with the gate correction and
both landed again; the corpus was regenerated a second time and verified to carry their new text
(`grep` for lane A's "the cancellation paths among them" and lane D's "never opens a markdown file"
both hit). `generate:compile:check` passes. Lane D also regained something no gate covers: both
keepers write markdown, so a typecheck-only gate is near-inert for them, and each now states that
limit and takes the verification itself.

One item outstanding and delegated: `OPTIONAL_PARTIAL_SHIPPERS` in
`src/cli/lib/__tests__/agent-partials.test.ts` lists five agents that no longer ship
`critical-reminders.md`. It is a test file, and `packages/cli/CLAUDE.md` forbids editing one directly,
so it went to `cli-tester` with the command to derive the correct list rather than trust the five
names. **That list went stale mid-flight** when lane A restored four of the five — and the discipline
held: the agent derived first, found the tree disagreed with me, and removed `pm` alone before my
correction even arrived. It then **watched the assertion fail before fixing it**, re-inserting `"pm"`
to confirm the specific red (`expected [ …(16) ] to strictly equal [ …(17) ]`) and restoring. Built
first and reported **15 tests collected, 15 passed** — the non-zero count being the evidence that
`assertDistIsFresh` had not swallowed the run into a zero-test pass.

It also caught two things of mine: my derivation command over-collects, because `src/agents/*/*/`
matches `_templates/methodologies/` and yields 19 directories where `AgentName` has 18 members; and
**this file contradicted the filesystem in two places**, still asserting the deletions after I had
retracted them. Both fixed.

---

## Pass 2 — restoration against a baseline

**Pass 1 had no baseline, and that was the gap.** It carried the substitution lens from the start and
that lens worked. But its restoration-shaped catches — four `output.md` fields rescued, four
counterweights preserved, two restored — were all made _from memory of a file the lane had just read,
while rewriting it_. The web-skills programme ran exactly that way and then ran a second pass with a
baseline; that pass restored ~100 items, and one of its lanes described the failure precisely: it had
run the second lens _"only as a by-product"_ of the first and missed a defect **in a file it had
open**. Two questions; one does not answer the other.

It matters more here than there, because the cut was deeper. `codex-keeper` −75% in one pass beats
the skills' deepest single file (−68%), and 583 lines of it went in a single deletion.

Baseline: `git ls-tree HEAD` at the opening commit, extracted to
`.../scratchpad/agents-baseline/` — 108 files, 14,236 markdown lines, nothing committed so HEAD is
clean.

### Restoration tallies

| Lane                        | Restored             | Removals traced          | Ratio                                  |
| --------------------------- | -------------------- | ------------------------ | -------------------------------------- |
| A — developers              | 11                   | 9 traced classes         | restored more than it traced           |
| B — researchers             | 12                   | ~65                      | 1 in 5.4                               |
| C — testers                 | 9                    | ~699 lines traced        | shallow cuts, low yield — as predicted |
| D — keepers                 | 12                   | ~35 sites                | 1 in 3                                 |
| E — pm, reviewer, summoners | 0 (+2 substitutions) | all traced to live homes | none                                   |
| **Total**                   | **44 restored**      |                          | **all 18 agents grew**                 |

### The two deepest recoveries

**A whole document kind, gone from `codex-keeper`.** The baseline's Component Patterns template ended
in a `## Testing Pattern` section — framework, test location, "always use factory functions, never
inline" — and its output-location tree named `reference/test-infrastructure.md`. The compressed row
lists "definition, props, state-access and styling" and stops. `grep -rin test` across the whole agent
returned only "test every pattern claim" and the hand-offs to testers: **nothing told the agent that
tests are documentable at all**, while this repository's own
`.ai-docs/reference/testing/{e2e-infrastructure,factories}.md` are documents it owns. Lane D's note is
the important part — this is _"the only loss in my lane that pass 1's own summary could not have
caught by re-reading its own diff."_

**`status: partial`, without which `convention-keeper`'s normal outcome is a lie.** The agent _reads_
partial findings in two places and was never told it may _write_ one; its only stated outcome was
`resolved`. But `convention-keeper` writes documentation only, so a finding group whose code-side fix
is still pending — which `agent-findings/README.md` names as the mandatory `partial` case, "docs /
standards landed with the code-side fix pending" — left it two choices: leave it `open`, losing what
landed, or mark it `resolved`, **claiming a repair nobody made**. README records that the inverse
direction alone "made a third of the directory ambiguous at a glance". Restored with its reason, plus
the concision bound (`2-4 lines max`) whose removal had left "Concise" with no measure.

### One reason, deleted four times independently

Lane C's headline, and the deduplication shape arriving in a new form. Pass 1 removed _"This preserves
context window for actual test writing"_ from the `<retrieval_strategy>` block of **all four** testers
— the only reason attached to the just-in-time loading rule, gone from every copy. Not three correct
deduplications against each other but four parallel lanes of one lane making the same call four times.
The same deletion also left `</retrieval_strategy>` indented into the preceding list item in all four
files, so the closing tag rendered as list text.

Also recovered there: the **eval suite timeout** (a live-model eval over a dataset blows a default
runner timeout, so the first eval written to that playbook would have failed with nothing saying why),
**test isolation and parallelism** for `api-tester` (the classic shared-test-database flake had no rule
left), and the **per-behaviour cadence** for `web-tester`, without which "extract every behavior, write
comprehensive tests" reads as one batch per feature.

**Pass 1 also resolved a baseline self-contradiction lane C found:** `web-tester`'s `output.md` said
_"The tester's job is to provide the RED phase"_ while its playbook told the same agent to write the
implementation. Pass 1 deleted the wrong half and kept the right one.

### A fourth place content can already live, which the brief did not name

**Lane B's correction, and the most useful methodological find of the pass.** My four-answer table
listed three homes for a removed block — still here, relocated, or correctly removed. There is a
fourth: **a preloaded skill.** `PRELOAD_DEFAULTS` in
`packages/matrix/src/read-model/preload-defaults.ts` line 255 carries
`"meta-methodology-research-methodology": ["researcher", "meta"]`, so all four researchers **and** the
four meta agents compile with it in context from the first token. That skill carries the
Glob→Grep→Read flow, evidence-based `file:line` claims, a structured output format, and **supersets**
of the baseline self-correction triggers and post-action reflection.

So several of pass 1's largest deletions in the researchers — the ASCII Glob/Grep/Read decision tree,
"Research Philosophy", the read-only/verify-path requirements — were removing content the compiled
agent already holds. **Restoring them would have made each agent pay twice**, which is the same error
as restating `operating-principles.liquid`. My brief had listed them as unchecked losses; they are
not losses at all.

**Lane C refined it, and my framing was wrong.** A preloaded skill is not one kind of thing. There are
two, and only one is a true fourth answer:

- **Unconditional, by role** — `research-methodology → ["researcher", "meta"]` reaches every agent of
  that flavour in every project. Content it carries is genuinely already there, and restating it is the
  `operating-principles.liquid` error.
- **Conditional, by stack** — `hasDomainAffinity` gates the rest, so `web-testing-react-testing-library`
  preloads on `web-tester` **only in a React project**. A Vue or Cypress project's `web-tester` gets
  `vue-test-utils` or `cypress-e2e` instead, and deleting content on the strength of the React skill
  leaves those projects with nothing.

Lane C found the live case: `web-tester/playbook.md` §2 and §3 duplicate the RTL skill's query hierarchy
and async sections — ~40 lines, **paid twice and carried worse**, since the skill explains _why_
(`findBy*` reports the DOM it gave up on, where `waitFor` reports only the last error) while the
playbook gives a bare ranked list, and the skill covers `userEvent` needing `setup()` since v14, which
the playbook never mentions. It left them uncut, correctly, because the agent-summoner's own
`<improve_workflow>` says a removal with nothing in its place is brought back as a decision.

Propagated mid-flight to lanes D and E. For lane C it cuts the other way and I told them so: **no
`meta-methodology-*` row reaches the `tester` flavour** — the rows are `research-methodology →
["researcher", "meta"]`, `expressive-typescript → ["developer", "meta"]`, `composable-components →
["developer"]`, `reviewing → ["reviewer"]`. No methodology skill backstops any tester, so duplicated
method deleted there is **more** likely to be a real loss.

**Lane A's characterisation is the finding:** _"every item I restored except the form-validation
checkbox was a name, a path or a symbol dropped from a rule that itself survived."_ Pass 1 was
**calibrated on volume and lost identifiers** — the same class the skills programme named
under-specification, arriving independently in a different corpus.

- **A half-mechanism pass 1 created, now closed.** `planning/pm` writes `.claude/decisions.md` and
  `.claude/patterns.md` and states verbatim _"Two files carry what a specification should not have to
  restate, **and the developer agents read both**."_ Pass 1 deleted the reader half from three
  developers as "contradicted — no CLI code path creates them", which is true and beside the point:
  the writer is an agent, not the CLI. That sentence in `pm` was **false of the whole tree** until
  lane A restored the readers.
- **Three over-genericised `Grep` targets restored**, one of them consequential: pass 1 replaced
  `Grep("new Command")` with "the framework's registration call", which left the **oclif branch with
  nothing checkable at all**. Now `static flags` and `extends Command`, both verified against this
  repo's own oclif tree.
- **`conventions.md` is correctly dead** — `grep -rn '\.claude/'` over the whole fleet finds no
  writer, baseline or current. Three of the four deleted files had one; the fourth did not.
- **The 90-line `output.md` example deletion checks out.** Lane A matched every heading in the
  deleted example against the surviving `<output_format>` field list — Investigation Notes,
  Implementation Plan, Changes Made, Verification, Summary — and **no field lost its home.** Pass 1's
  judgement there was sound.
- **A conflict between two lane reports, resolved against the tree.** Lane E reported that
  `grep -rn "decisions\.md|patterns\.md|progress\.md"` returns only `pm` — that pass 1 had deleted
  the reader half fleet-wide and left `pm` claiming readers that do not exist. Re-run after both lanes
  landed, the grep returns **all four developers plus `pm`**: lane E measured before lane A's
  restorations were on disk. The half-mechanism is closed, and lane E's proposed decision between
  restoring the reads and deleting the convention is moot — restoring was already done. `conventions.md`
  stays correctly dead, having no writer anywhere.
- **Lane E verified all four of my unreviewed summoner edits against source** and found them correct:
  the standards repoint (both ends checked), `bun run generate` (the corpus holds **18 keys against 18
  agent directories**, so "every bundled agent's partials" is exact), and the `Stop: []` clause
  (`declaresOwnGate` is literally a non-empty-array test). One nit it raised and I accept: that clause
  names `declaresOwnGate` without its file, where the `<voice>` rule asks for a file and a symbol.
  **It also corrected me: `skill-summoner` was not byte-identical** — it carries a fourth edit of mine,
  the same standards repoint at `identity.md:20`. There were four unreviewed edits, not three.
- **"Commit working increments" traced and deliberately not restored** — a rule both `CLAUDE.md` files
  contradict, since every writing git command is banned for sub-agents.

**Corrections to my pass-2 brief, from the lanes:** `ai-tester`'s TypeScript corpus is **428 lines in
11 blocks**, not 406. `done/` appeared **11 times** in `convention-keeper`'s baseline, not six — all
correctly removed. The `codex-keeper` table has **seven** rows, not six; the seventh (Command
reference) is a grounded pass-1 _addition_ from `documentation-bible.md`, not a compression to audit.
"Only `web-testing-*`" understates the catalogue — `desktop-`, `mobile-` and `electron-testing`
categories exist; what is absent is any testing skill for the AI, API or CLI domains. And **my check
command was wrong in the silent direction**: `npx prettier --check "src/agents/{your,dirs}/**/*.md"`
run from the repository root matches no files, **reports success and exits 0** — a gate that passes by
matching nothing. Lanes ran it from `packages/cli` and caught it.

My brief also said four developers read the `.claude/*` files; **three** did —
`ai-developer`'s baseline had already been genericised to "the project's documented conventions,
wherever it keeps them" and never named them.

---

## Progress

Status: `pending` → `done`.

### Lane A — developers

| Agent                   | Status | Lines     | `You MUST` |
| ----------------------- | ------ | --------- | ---------- |
| developer/ai-developer  | done   | 865 → 460 | 16         |
| developer/api-developer | done   | 923 → 517 | 10         |
| developer/cli-developer | done   | 824 → 416 | 14         |
| developer/web-developer | done   | 783 → 367 | 14         |

### Lane B — researchers

| Agent                     | Status | Lines      | `You MUST` |
| ------------------------- | ------ | ---------- | ---------- |
| researcher/ai-researcher  | done   | 1092 → 629 | 20         |
| researcher/api-researcher | done   | 597 → 358  | 12         |
| researcher/cli-researcher | done   | 886 → 545  | 16         |
| researcher/web-researcher | done   | 591 → 317  | 10         |

### Lane C — testers

| Agent             | Status | Lines       | `You MUST` |
| ----------------- | ------ | ----------- | ---------- |
| tester/ai-tester  | done   | 1323 → 1119 | 22         |
| tester/api-tester | done   | 688 → 575   | 18         |
| tester/cli-tester | done   | 649 → 532   | 15         |
| tester/web-tester | done   | 849 → 584   | 10         |

### Lane D — keepers

| Agent                  | Status | Lines      | `You MUST` |
| ---------------------- | ------ | ---------- | ---------- |
| meta/codex-keeper      | done   | 1680 → 404 | 11         |
| meta/convention-keeper | done   | 483 → 308  | 14         |

### Lane E — planning and review

| Agent             | Status | Lines     | `You MUST` |
| ----------------- | ------ | --------- | ---------- |
| planning/pm       | done   | 538 → 403 | 12         |
| reviewer/reviewer | done   | 446 → 379 | 13         |

### Lane F — the two already rewritten

Not a rewrite. These were rewritten on 2026-09-03 and are the reference for everything above, so
**the lens they need is the one the skills programme learned late**: a rewrite is where inventions
enter. Verify rather than redo.

| Agent               | Status | Lines | `You MUST`     |
| ------------------- | ------ | ----- | -------------- |
| meta/agent-summoner | done   | 462   | 1 (legitimate) |
| meta/skill-summoner | done   | 557   | 0              |

---

## Dispatch log

- **2026-09-04 — lane D landed** (codex-keeper, convention-keeper). **`codex-keeper` 1,680 → 404 lines (−76%)**, `convention-keeper` 483 → 308 (−36%), all 25 `You MUST` gone. It found the two best defects of the programme, both **rules the tree actively refutes**:
  - **`codex-keeper` — the agent that writes `.ai-docs/reference/` — was instructed to emit source line numbers, in eight places.** `documentation-bible.md` → "No Source Line Numbers — Cite by Symbol" bans them, gives the reason (a line number rots silently while still reading as authoritative) and **ships the check**: `grep -rPc '\.tsx?:[0-9]+' .ai-docs/reference/` returning zero. The agent was told to do the thing its own governing standard greps for, in its philosophy block, its investigation step, a self-correction trigger, two `(line ~450)` exemplars, three `output.md` tables and its "What Makes Documentation AI-Useful" list. All eight gone; the rule now stated once with its reason.
  - **`convention-keeper`'s entire resolution workflow moved findings to a `done/` directory that has never existed.** `.ai-docs/agent-findings/README.md` → "Resolution Model (authoritative)" says the opposite in three bullets: _"Never move files to mark resolution"_, _"No `done/` subdirectory workflow. The directory-as-status model was never adopted (as of iter 83, 45 findings use `status: resolved`, 0 were ever moved)"_, _"Filter by frontmatter, not directory."_ Neither `done/` nor `agent-done/` exists. The agent also **contradicted itself** about the destination — four files said `done/`, the playbook said `.ai-docs/agent-done/`. The first agent to follow it would have broken every `supersedes:`/`superseded_by:` cross-link in a ~300-file corpus, **silently** — and the "never delete findings" counterweight it was paired with is what would have made that read as the careful option.
  - Also deleted: 583 lines of pasted document templates, three of them written for a fabricated MobX/`fabric.js` image editor with no framing that they described anything but the reader's tree; an 82-line `DOCUMENTATION_MAP.md` template whose every feature `documentation-bible.md` bans; and a nine-item cross-reference checklist that had drifted, missing seven standards docs that exist — replaced by `ls .ai-docs/standards/`, which cannot go stale. Three unresolvable references found and removed, including a fabricated `createMockSkill(id, "web/framework")` two-positional signature that does not type-check.
- **2026-09-04 — lane C landed** (the four testers). **3,509 → 2,810 lines, 65 → 0 `You MUST`.** Five unresolvable references fixed: `src/cli/lib/__tests__/helpers.ts` and `integration.test.ts` are both **directories**; `bun test [path]` is Bun's own runner and does not run this package's vitest suite; `screen.getByClassName` **is not a Testing Library API**; and `frontend/performance`/`backend/performance` are skill ids that **do not exist** (the real ones are `web-performance-web-performance` and `api-performance-api-performance`) — and naming a skill in a hand-off is wrong regardless, since skills come from the stack. One wrong-agent hand-off: cli-tester routed **"API endpoints → `web-tester`"**. And the worst defect in the lane: **`web-tester`'s playbook told the tester to "Write minimal code to make tests pass" and "Clean up implementation"** — directly against its own rule "Writing implementation code instead of tests → STOP".
- **2026-09-04 — lane A landed** (the four developers). **3,395 → 1,833 lines, 54 → 0 `You MUST`**. It first deleted all four `critical-reminders.md` as duplicates, then restored them on my instruction — see the orchestrator-errors section, where that round trip is mine rather than the lane's. It caught the same false instruction of mine that lane C did, independently, and applied the playbook over my brief. Five hand-off destinations that did not resolve — _"Backend Reviewer Agent"_, _"Frontend-Reviewer Agent"_, _"AI Reviewer Agent"_, _"Tester Agent"_, _"PM/Architect"_ — verified against `grep -h '^id:' */*/metadata.yaml` and replaced with real ids. Four `.claude/*.md` files cited that no CLI code path creates. And **it caught a defect it introduced itself**, mid-write: it typed `` Tests written before the implementation → `web-tester` `` in cli-developer's identity, where the destination is `cli-tester`, and fixed it before proceeding — the substitution shape exactly, a hand-off pointing at the wrong place while reading perfectly correct.
  - **All four carried an "Extended Analysis Guidance" section** claiming magic phrases map to token budgets — _"consider carefully" — up to 32K tokens_, _"analyze intensely" — extended analysis mode_. `prompt-bible.md` Technique #6 retires that vocabulary, and its own case study describes precisely this survival: _"the sweep that retired the offending phrase verified itself with a zero-hit grep while the technique went on prescribing the same volume in a second vocabulary."_ **These four agents were that second vocabulary.**
- **2026-09-04 — lane B landed** (the four researchers). **3,166 → 1,849 markdown lines, −42%**, every retired form gone, all thirteen of ai-researcher's research modes and all eight of cli-researcher's kept. **Zero substitution defects**, and the lane made a distinction worth keeping: illustrative paths did disappear, but _as a side effect of cutting long trailing examples, not because they were wrong_ — it censused all ~40 before touching anything and found every one honest, either a declared placeholder inside an `<output_format>` template or an illustration under a heading that says "Example Research Output". Where any remain it added a frame that was not there before: _"The paths above illustrate the shape. Write the ones you actually opened."_ A grep for `packages/cli|.ai-docs|.claude-src|bun run|npx agents-inc` across all four returned **nothing** — these agents make no load-bearing claim about this repository at all, so there was nothing to verify.
  - **Lens 1c earned its place twice.** ai-researcher's six catalogue checklists overlapped `output.md`'s tables — the playbook/output duplication the doctrine names — and before deleting them the lane checked all 34 fields against the template one by one. **Four had no home** and would have gone silently: prompt versioning/A-B mechanism, the re-index and delete paths, a tool's result shape, and tool argument validation. All four are now in the output format. Separately, cli-researcher's "Common Research Mistakes" was ~85% a restatement of its self-correction triggers and was **folded rather than dropped**, preserving two unique insights: that read order and precedence order are often the reverse of each other, and that hidden and deprecated commands still run and still constrain new work.
  - **The same boundary error I had just fixed in the summoners, in three more agents.** web-, api- and ai-researcher lumped `convention-keeper` with `codex-keeper` as jointly owning standards; only cli-researcher had it right. All four now carry the split `codex-keeper` states itself. **With the two summoners that is six agents that misrouted standards ownership** — the fleet is now consistent, verified by `grep -rn "codex-keeper" */*/*.md | grep "→"`.
  - **One deliberate non-change, well argued and accepted.** The lane kept `file:line` citations throughout, against the summoner's `<voice>` rule to cite a symbol rather than a line number. Its reasoning: that rule protects long-lived prompts from rot, whereas a researcher's findings are consumed by a developer _in the same session against the same tree_, where line numbers are live and are most of the value. Genericising them would have gutted the role.
  - **Decisions, ruled.** api-researcher's new credential rule (_"Report credential variables by name and read site, never by value"_) **stays** — `ai-researcher` already carries exactly that rule and api-researcher's domain includes configuration and secrets, so this is consistency with a sibling rather than scope creep. `model: opus` with no `effort` **stays on all four**: the owner ruled on 2026-09-03 that all eighteen run on Opus and that is not to be optimised down, and an unset `effort` inherits the session's level, which prompt-bible §4 says is usually right.
    **Corrections:** two. The per-agent line counts in this file are **markdown-only** and do not say so — `metadata.yaml` is exactly 10 lines on all four, so `wc -l` over a directory returns 10 more than the table. And my dispatch's example of a suspect hand-off was real but pointed the wrong way: `convention-keeper` is a genuine agent, present in the generated union; what was wrong was three researchers' account of what it owns.
- **2026-09-04 — lane F landed** (agent-summoner, skill-summoner). **The result the skills programme did not get: the 2026-09-03 rewrite introduced no fabrications.** ~35 references checked beyond the nine pre-verified, every one resolving — including the two most likely to have been invented, which the lane called out as such: `desktop-backend-tauri` really does carry slug `tauri-backend`, and `api-database-drizzle` really does carry category `api-orm`. The whole `metadata.yaml` template in `output.md` matches `agent.schema.json` value for value, and every compile-time claim (the `Skill` grant, `WRITING_TOOLS = ["Write", "Edit"]`, typecheck-only, quiet exit with no `package.json`) checks out against `packages/compile/src/agent-source.ts`. No rewrite was needed and none was made. **Four findings, three applied by me** since lane F correctly declined them as boundary or cross-lane calls:
  - **A broken hand-off both summoners shared.** Both routed `.ai-docs/standards/` to `codex-keeper` — whose own `identity.md:34` hands standards _away_ to `convention-keeper`, which claims them. Verified all three accounts; the summoners were simply pointing at the wrong agent. Both now say `convention-keeper`. Root `CLAUDE.md:82` still says "update the docs, through the `codex-keeper` agent" without distinguishing reference from standards; left alone, since in context it is about reference docs and reads fine.
  - **A live under-specification.** `<improve_workflow>` step 6 said "Recompile and read the result" and named no command, while `packages/compile/src/generated/corpus.ts` embeds every bundled agent's partials **verbatim** — so any Improve pass leaves `generate:compile:check` red. Not hypothetical: it is red in this tree right now, from these very lanes. Step 6 now names `bun run generate` and says why.
  - **A lost counterweight.** The playbook said a declared stop hook "replaces the emitted gate"; `declaresOwnGate` tests `(hooks[event]?.length ?? 0) > 0`, so `Stop: []` states nothing and the gate stands — a caveat the source's own docblock spells out. Added.
  - **Three unverified `cacheTtl` billing claims** — that `5m` is Claude Code's default, that `1h` bills cache writes higher, and that it is ignored on subscription credits. **No provenance anywhere in the repository.** A pricing claim is the class most likely to be wrong and costliest when it is. Left alone, filed below.
    **Corrections:** two, both mine. My brief said all 18 agents have five markdown files — true when written, and a parallel lane had already deleted one. And I framed `generate:compile:check` as a per-lane check when it is tree-wide: with six lanes editing agent sources concurrently it cannot attribute drift, so it is a programme-level gate I run at the end.

---

## Two orchestrator errors, both caught by lanes

**1. I told three lanes the completion gate makes self-verification prose redundant. It does not.**
`COMPLETION_GATE_COMMAND` in `packages/compile/src/agent-source.ts:411` is
`npm run --if-present --silent typecheck`, and its docblock says outright: _"Typecheck only. The gate
runs the project's typecheck script; lint and test are deliberately not in it."_ I wrote "delete it
rather than reword it" to lanes A, C and D. Lanes A and C each caught it independently and applied the
playbook over my brief; I reached D with a correction before it landed. Had all three obeyed, **four
tester agents would have lost the only rule making their reports trustworthy**, and the two keepers —
which write markdown, not TypeScript, so the gate is near-inert for them — would have lost theirs with
nothing in its place. What _is_ genuinely the gate's, and correctly deleted everywhere: the
re-read-the-file-you-just-wrote half, prompt-bible Technique #11.

**2. I over-ruled lane A on `critical-reminders.md`, reversed myself, and then the reversal
arrived too late — which is worse than either position.** Seeing lane C keep its
four, I messaged lane A to restore the four it had deleted, keying on whether the file carried a
`<post_action_reflection>` tag. **That is the wrong test.** The playbook's rule is content, not
presence: _"each of the other three only where the role has something particular to put in it, since
a partial written to fill a slot fills with padding."_ Lane A's four reflection blocks were
byte-identical generic boilerplate — _"Did this achieve the intended goal? … Do I understand the
patterns completely?"_ — while lane C's and lane D's ask role-particular questions, as both doctrine
exemplars do. **Both lanes applied the same rule correctly to different inputs.** Lane A had already pushed back on exactly that ground (_"it needs content the requirements do not
already say — I would not invent it"_) — and then, on my instruction, restored all four anyway,
writing new per-role content rather than putting the boilerplate back: cli's reflection now names the
cancellation paths, ai's names what the pipeline does when the model's output is not what it expected.

**Resolved by measurement rather than by a third reversal.** The `cli-tester` dispatch measured what
I had only suspected: `web-developer/critical-reminders.md` and `api-developer/critical-reminders.md`
were **byte-identical to each other**, which is definitionally not role-particular and is exactly the
padding case the playbook names. Set against `skill-summoner`'s exemplar — _"Do the sources agree, and
where they differ, which is more current?"_ — the contrast is not a judgement call.

The fix was not a third deletion but the smaller correct change: differentiate them, as `cli` and `ai`
already were. Each testing clause now names what that domain's tests are most likely to miss —
web: _"the loading, empty and error states among them"_; api: _"the unauthorised and invalid-input
responses among them"_ — both drawn from each agent's own identity and playbook rather than invented.
**All 17 reflection blocks are now unique** (`md5sum */*/critical-reminders.md | sort -u` → 17/17), no
ledger edit was needed, and no file changed hands a third time.

**Final state, and an honest account of it.** 17 of 18 agents ship the partial; `planning/pm` is the
one that does not, deleted by lane E on merit after checking that each of its seven questions mapped
onto a requirement or an `output.md` checkbox, and moving the one that did not. That is a coherent
fleet. But two of lane A's four — web-developer's and api-developer's — carry a reflection whose only
role-particular clause is "testing means the tests cover the requirements", which is thin. Both have since been
differentiated, so all four now earn their place. **The churn was mine**: a ruling made on the wrong test, reversed in
public, and reversed again too late to reach the lane. The lane's own first instinct was right both
times.

---

## Open decisions

1. **`web-tester` §2/§3 versus the preloaded RTL skill.** Lane C offered two options — delete and let
   the skill own RTL (right for React, silent elsewhere), or keep and pay twice. **There is a third
   that resolves the objection:** state the _principle_ library-neutrally in the playbook — a query
   hierarchy is an accessibility audit that happens to be a test; prefer the query that reports the DOM
   it gave up on — and let whichever testing-library skill the stack preloads carry its own API. React
   projects stop paying twice, Vue and Cypress projects keep the principle, nothing is lost anywhere.
   Not applied: it changes what the playbook covers, which is mission-level.
2. **`convention-keeper`'s identical `file:line` exposure.** It writes into `standards/`, governed by
   the same bible rule, against the same preloaded skill. Lane D put the override clause in
   `codex-keeper` only, to avoid the three-way duplication the brief warns about. One copy or two.
3. **The 154 untouched skills** — below.

## The finding neither programme could see alone

Lane D ran the preloaded-skill check I sent it, found it disposed of **none** of its twelve
restorations — and then found the reverse defect, which has no row in my four-answer table: content
that is neither missing nor duplicated but **contradicted** by a fourth location.

`meta-methodology-research-methodology` is preloaded into `codex-keeper` and `convention-keeper` —
verified on every link: `preload-defaults.ts:255` grants it to the `meta` flavour,
`packages/matrix/src/generated/agents.ts` gives both agents `"flavor": "meta"`, and
`CRAFT_CATEGORIES_BY_FLAVOR` records the owner's 2026-08-30 ruling naming those two agents as the
reason. So it is in their context from the first token. It carries:

1. **`file:line` citations demanded in six places**, including two hard `**(You MUST …)**` requirements
   and a red flag asking for _more_ precise line references — against `documentation-bible.md` §
   "No Source Line Numbers — Cite by Symbol", which bans them and ships the grep. **A `codex-keeper`
   that follows its preloaded skill fails that check on every document it writes.**
2. **`**(You MUST NOT attempt to write or edit any files - you are read-only)**`** — stated **three
   times** (SKILL.md lines 31, 145, 191). Both agents hold `Write` and `Edit`, and writing documents
   is their entire purpose.

Lane D settled (1) inside its own lane with an override clause in `codex-keeper` naming the conflict
and which rule wins. (2) it correctly did not touch — the skill is in another repository.

### Why both programmes missed it

**The skills programme was scoped to `web-*`.** That is 84 of 238 skills. The other **154 were never
touched**, and they still carry the doctrine the whole programme retired:

|                      | Files   |
| -------------------- | ------- |
| `You MUST`           | **158** |
| `CRITICAL:`          | **195** |
| "Failure to follow…" | **145** |

`meta-methodology-research-methodology` is one of them — which is why it still reads in the voice the
agents were just rewritten out of, and why nobody checked it against the standards it contradicts.

**This is the real remaining work**, and it is larger than either pass so far: 154 skills, several of
them preloaded into agents whose behaviour they can override from the first token. The agents are now
clean and the skills they load are not.

---

## Findings for elsewhere

| Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                                                             | Owner                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Three unverified `experimental.cacheTtl` billing claims** in `agent-summoner/playbook.md` `<frontmatter_decisions>`: that `5m` is Claude Code's default, that `1h` "bills cache writes at a higher rate", and that it "is ignored while a subscription runs on usage credits". The tree documents the key and its `5m`/`1h` enum in four places and sources none of the three                                                                                                           | Lane F searched the repository for provenance and found none. By contrast the `Stop`/`SubagentStop` claim beside it **is** sourced — `packages/compile/src/agent-source.ts`'s `GATE_EVENT` docblock records reading it from the shipped binary at version 2.1.259 on 2026-09-03, with the conversion log line quoted | Needs one verification against Claude Code's own documentation. Until then the agent ships a pricing claim it cannot support |
| **No gate can see a retired form in an agent's own markdown.** `RETIRED_FORMS` in `agent-baseline-is-slim-and-positively-framed.test.ts` is scanned against a render with **every content field empty** — correct for what it tests, which is the template's budget. So the 228 `You MUST` this programme removed by hand were invisible to every check in the package: `tsc` does not open a `.md` and ESLint does not lint one. This work is currently unguarded against reintroduction | Lanes C and D found it independently. The helpers to close it already exist — `offendingLines` and `retiredFormsIn` in `__tests__/helpers/text-scans.ts` — and a scan over `src/agents/*/*/*.md` would be about fifteen lines                                                                                        | This repository. Wants a `cli.md` row. Deliberately not built here: "fixes only" keeps guards out of scope                   |
| `.claude-src/agents/` has drifted behind `src/agents/` in five files, with no script to sync them. The repository dogfoods older agents than it ships                                                                                                                                                                                                                                                                                                                                     | `diff -rq packages/cli/src/agents packages/cli/.claude-src/agents`                                                                                                                                                                                                                                                   | This repository. Wants a `cli.md` row: either a sync step in `bun run generate`, or a documented reason the trees differ     |

# Accuracy programme — live progress

**This file is the session's memory.** The programme spans many hours and several context
compactions; anything not written here is lost. Update it as each item lands, before moving on.

## The mandate (owner, 2026-08-18)

1. Work the 28 items in [`accuracy-worklist.md`](./accuracy-worklist.md), in its own sequence.
2. Then **re-run all 39 user journeys by hand** through the real CLI and the real editor.
3. Then work **the remaining STRONG/SOLID findings** — those the worklist filter excluded.
4. Full SDLC for every item: **tests red first → implement → `meta-design-expressive-typescript` →
   hand-run the real thing → docs via `codex-keeper` → update `todo/`**.
5. **No git command that writes. Ever.** Read-only git is fine.
6. The session ends when all of that is complete.

## Scope note the owner should see

The worklist's 138 items came from a filter of "still true today **and** simple". The other 178
STRONG/SOLID findings were excluded for three reasons, and they are not equivalent:

- **already fixed** — no work, but the finding needs retiring;
- **needs an owner ruling** — cannot be done without a decision, will be surfaced not guessed;
- **needs design, or is a feature** — real work, but not a correction.

Step 3 works the second and third groups. Rulings are collected in `todo/cli.md` rather than blocking.

## Owner ruling 2026-08-18 — scope narrowed

**Only bug fixes and refactors. Anything that needs the owner's input, and anything that is a new
feature, is PARKED** — filed in `todo/cli.md`, not built.

The test applied per item:

| Verdict            | What it covers                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **DO**             | A document that is wrong; a string that is wrong; code that misbehaves; dead code removed; a broken implementation replaced |
| **PARK — feature** | A check, guard, test or script that **does not exist yet**. Real value, but it is new capability, not a correction          |
| **PARK — ruling**  | Cannot proceed without a decision that is the owner's                                                                       |

Where an item has both halves, the corrective half is done and the new-mechanism half is parked —
those are marked **SPLIT** below.

### Parked as features (not built)

- **M5** — editor Playwright network guard (also EDITOR-48). No such fixture exists.
- **M6** — roster-invariant test binding `DOMAIN_AGENTS` / `BUILT_IN_AGENT_GROUPS` to `AGENT_NAMES`.
- **CLI-541** — lifecycle-pairing check (`resolved` needs `resolved_by`).
- **CLI-544** — citation resolver over every `YYYY-MM-DD-*.md` token.
- **CLI-535** — the remaining four drift-checker capability gaps. _(Item 2, `ts.isSatisfiesExpression`,
  is DONE not parked: `unwrap()` silently fails to read a syntax it claims to handle, which is a
  defect in an existing function, not new capability.)_
- **M9 (half)** — the export-parity spec. **SPLIT:** repairing the logger mock's missing exports is a
  bug fix and proceeds.
- **M12 (half)** — the spec that keeps dead exports dead. **SPLIT:** the deletions proceed.

### Parked as needing a ruling

- **CLI-538** — is `splitConfigByScope`'s comment stale, or was the clearing intended and never
  written? Not observable today either way.
- **CLI-536** — which of the three type documents the twelve undocumented types belong in.

### Still DO — these are corrections, not features

**M17** replaces a broken implementation rather than adding one: `generate:types:check` and
`generate:schemas:check` already exist and are already in `prepublishOnly`; they verify through
`git diff --exit-code`, which no agent may run and which is blind to an untracked emission. Swapping
that for a byte comparison is a fix to a gate that cannot currently do its job.

**M2, M4, M13, M14, M19, M20** write down rules the repository already decided by incident. They add
no capability and change no behaviour; they are documentation of standing practice, which is the same
class as correcting a wrong document.

## Owner ruling 2026-08-18 — findings are deleted as they close

**A finding whose defect is fixed is deleted, not re-statused.** Likewise any that is stale, already
completed, or false. The graded ledger in `.ai-docs/agent-findings/INDEX.md` is the record that it
existed; the file itself is not.

**The deletion protocol is not optional, and it was learned the hard way.** Deleting 66 findings
earlier today left **64 dangling citations across 39 files**, and the link-integrity scan caught
exactly one of them — 51 were body prose, 11 `affected_files:`, 2 `partial_note:`. So, per deletion:

1. `grep -rF "<basename>" .ai-docs/ src/ e2e/ scripts/` **before** removing anything.
2. Every hit is one of three things and must be judged individually:
   - the citing sentence needs the **fact** the finding carried → write the fact into the sentence;
   - it was a bare cross-link → drop the entry;
   - **the citing sentence is itself now false**, because it described the defect that got fixed →
     correct the sentence. Three were, in the last batch alone.
3. Never leave a reference to a file that no longer exists, and never invent a replacement target.
4. Re-grep afterwards and confirm zero hits outside `INDEX.md`, which records deletions by design.

Each agent closing an item deletes the finding(s) it closes and repairs the citations in the same
pass — a separate cleanup pass is what let the first 64 accumulate.

## Sequence and state

Legend: `[ ]` not started · `[~]` in flight · `[x]` landed · `[!]` blocked/needs ruling

### Phase A — the worklist — **COMPLETE 2026-08-19**

All seventeen sequenced steps landed, minus the items parked as features or rulings. Closing item:
the `localeCompare` → byte-wise swap, which **corrected its own brief**: case and punctuation cannot
discriminate, because `categoryPathSchema` refuses anything but lowercase-kebab — a spec built on a
capitalised category asserts about an input production cannot produce. The real discriminator is the
default **locale**, and five of 87 reverse a real pair among the 102 shipped categories. Proved
through the built binary: same command, `LC_ALL=lt_LT.UTF-8` versus `en_US.UTF-8`, different
committed bytes — **in the user's repo**, since one site writes their `config-types.ts`.

**Sixteen briefs, sixteen corrections.** Every pass found something wrong in what it was handed.

**Phase A's closing cleanup found a hole in the orchestrator's own deletion protocol.** `INDEX.md`
claimed a row naming a deleted file was the finding's surviving record — true only for the 382 graded
on 2026-08-18. **Ten findings written during this programme have no row at all**, so deleting one
erased it completely, and the `grep -rF` step could not catch it: that grep asks what still _points
at_ a file, never what still _remembers_ it. One finding was lost that way before it was noticed.
The protocol now leads with "confirm the finding has a row, and write one if it does not."

It also found § 17.3's own check grep used `grep -v '__tests__'`, which does not exclude `.test.ts`
siblings — so running the rule as written returned a false positive that read as a violation. Third
instance of the pipe-versus-path trap in this programme.

- [x] **1.** D5 `CLAUDE.md` rows + M3. 45s corrected; `src/cli/lib/__tests__/helpers/` named the only home for a tested helper, **proved by probe** — no vitest project collects `e2e/helpers/*.test.ts`. `.scratch*` reserved in the root `.gitignore`, `globalIgnores` and `.prettierignore`. **The briefed mechanism was wrong**: a scratch `.ts` outside the source trees is SKIPPED; only `*.test.ts`/`*.test.tsx` reach outside, because naming an extension is what makes ESLint's walk find them
- [x] **2.** M2 — `documentation-bible.md`, nine rules each carrying its grep. Landed: rules 1–4 as one section `A Name in a Document Is a Claim About Source`; rule 5 inside `An Absence Names No Symbol` (a call-site census is the falsifiable kind of absence); rule 6 into the count section; 7 as a fourth re-validation trigger; 8 extends the line-number ban to `todo/plans/` and `(N lines)`; 9 as a Doc-Touching row + a Format Rules section. Every grep proved against real output
- [x] **3.** D1 — 31 dead hits corrected across 25 files, ~95 live `source` survivors deliberately left. **Found beyond the brief:** `derivePluginRef` does not exist (it is `pluginRefFor`, 6 sites in 4 docs); `boundary-map.md` credited propagation to the wrong function AND the wrong field; its §5.1 listed a `--source` flag, a `CC_SOURCE` env var and a config `source` key, none of which exist. Vendored matrix regenerated. **Kept** `the-marketplace-rename-stopped-at-typed-positions` — not closed: its two standards have not landed and `toHaveConfig`'s source check is a keyless substring scan ~60 specs reach

  **Two corrections it produced that the programme must act on:**
  - The bible's rule 3 says `scope-diff.ts` was the last task-ID offender. Census: **210 citing lines across 89 source files, 57 more across 23 documents**, three of them section _headings_. The rule now carries a false claim → step 6b.
  - `.ai-docs/agent-findings/INDEX.md` has drifted **both ways**: 64 rows name a deleted file, 9 findings on disk have no row, and the header asserts 380 against 320 actual → orchestrator repairs.

- [x] **4.** D2 — three false user-facing CLI strings. `compile` now names `init` (reasoned from doctor's existing `config-empty` ruling: the refusal fires PAST `NO_INSTALLATION`, so a config exists with nothing under it, and `edit` modifies installed skills of which there are none). `eject --output` promises no default and names none of the three destinations. The partials log is built by joining the `STANDARD_FILES` constants `readAgentFiles` reads, so it cannot name a file the compiler does not read. Six registry rows repaired; `STEP_TEXT` 172 → 173
- [x] **5.** M4 — 22 rules into `assertions.md` + `anti-patterns.md`, several merged to avoid two writable copies. Repaired a rule that contradicted one it was writing ("run the test once to see actual values" vs _derived, never observed_). Corrections to the findings: the refusal string is `Local marketplace not found:`, and there are **31** vacuous flag assertions across five files, not 20 — step 9 must use 31
- [x] **6.** D3 + D4 + helper-home. `getScreen()` corrected in the JSDoc and in a **third** copy the brief did not name (`e2e/pages/terminal-screen.ts`, the layer page objects actually read). Matcher docs rewritten per-expectation. **Two brief premises disproved by probe:** the fixture's `AGENT_TEMPLATE` is never rendered (`createLiquidEngine` roots never include a marketplace template dir), and `AgentFrontmatterExpectations` has **ten** fields, not eleven. Four findings deleted, one of them because its central claim is false today
  - Owed: `standards/e2e/README.md` still says `getScreen()` misleads "despite its name **and doc comment**" — the comment now agrees, so that clause is false → step 7
- [ ] **7.** D5 remainder + D8
- [x] **8.** M1 — `unwrap()` now reads through `satisfies`. Three rows registered (`SKILLS`, `E2E_SKILL_TITLES`, `WIZARD_STEP_ORDER`), each rename-proved in both directions with totals unchanged. **`SKILLS` was already short a key** (`authSecurity`) under a "single source of truth" sentence. `WIZARD_STEP_LABELS` deliberately NOT registered — `satisfies Record<WizardStep, string>` is total, so `tsc` already refuses and a row would repeat a check that cannot fail. Four candidates still unregisterable **for document reasons, not checker ones**: no document names their members. Found `AGENT_DEFS` naming `webReviewer`, a key that never existed, surviving as unparseable prose
- [x] **9.** M11 + M10. 31 flag assertions replaced, plus 3 that named no flag at all and got the assertion their own names claim. Config-load softening, both regex extractors, the inert `toHaveLocalSkills` widening, 3 `as unknown as string` (not 1), and the misnamed refusal constant. Five command specs isolated. **Mutation proofs show the OLD assertion staying green on the same mutation the new one catches** — an improvement, not a rewrite
  - **Both brief premises wrong:** `PARSE_REFUSAL` is not reusable (those are UNIT specs; the tree boundary runs both ways) so `parseRefusal(flag)` was built beside the `run()` that produces it; and copying `resolveSource`'s pattern was insufficient because **`os.homedir()` honours a mutated `$HOME` under node but not under bun**, and this package runs both
  - M10's count was 14 in the finding, **5** in the tree — nine fixed in between
  - Found: **22 more vacuous negatives** in sibling paraphrases (`"unexpected argument"` ×15, `"missing required arg"` ×5, `"crash"` ×2), measured against the real binary and documented rather than swept
- [~] **10.** D6 + D7 — config/schema truth; four deleted mechanisms still described _(D6's `splitConfigByScope` half parked as CLI-538, needs a ruling)_
- [~] **11.** M7 + M9-corrective — doctor routing, logger mock exports. _(M6 and M9's parity spec parked as features.)_
- [x] **12.** M8. `build marketplace` now refuses rather than writing a manifest its own reader rejects — owner-name guard, `resolvePublishableName` judging the derived name and the `--name` override by one rule, and a `ManifestState` union (`absent` / `unreadable` / `named`) read off the throw's TYPE with an exhaustive switch. **Found a fourth defect first:** the absence guard named `.claude-plugin/marketplace.json` and TESTED `.claude-plugin/`, so a repo shipping only `plugin.json` read as "present" — fixing the three-state split without it would have introduced a NEW false statement. Round trip hand-proved: a built marketplace is now read back and NAMED by the consumer
  - **Kept** the schema-laxness finding at `partial` — its standard is to tighten `marketplaceSchema`, deliberately out of scope, since that schema parses third-party marketplaces and tightening it changes what LOADS
  - Five specs asserting the old behaviour went red **because** the fix landed → repairs routed to step 9, which holds those paths
- [~] **13.** M12-corrective + M18 — dead exports deleted; discarded error causes _(M12's keep-them-dead spec parked)_
- [x] **14.** M13 + M14. Fourteen rules across `clean-code-standards.md`, `typescript-types-bible.md`, `CLAUDE.md`, `agent-findings/{README,TEMPLATE}.md`, each placed inside existing structure with the argument recorded. **New § 18 Command Layer** — `src/cli/commands/**` had no section at all, a Heading-Diff gap by the bible's own rule. 16 findings deleted with citations repaired, 7 kept with a live half. Every grep re-run verbatim after editing; two self-tested against the pre-fix shape so they are not vacuous
  - **Corrected a finding by compiler probe:** `.find` DOES narrow over a result union for `(f) => !f.ok` and block bodies — a blanket rule would have condemned correct code. The inverse is the real lesson: `no-unnecessary-condition` fires only where inference landed, so a **green lint on `x && !x.ok` is evidence of the bad shape, not its absence**
  - Applied census-vs-sample to itself: the brief said 3 findings misuse `status: partial`; the tight grep returns **22**, and it labelled that a floor
  - Corrected the brief: `ProjectConfig.marketplace` holds the path, `marketplaceName` the name — the orchestrator had them inverted
  - Owed: the `localeCompare` → byte-wise swap in `generate-matrix-package.ts` **and a second site nobody had noticed**, `config-types-writer.ts`. Left because it is implementation code needing a red-first determinism spec → dispatched separately
- [x] **15.** M15 + M16 — the largest lever on agent output quality. All 15 `identity.md` carriers swept, each replacement keeping the domain enumeration and dropping the volume framing. **Synonym greps found three the phrase grep would have left:** `web-tester/identity.md` twice, and — critically — **`prompt-bible.md` § 8.5, the delegation template people paste**, carrying `"go beyond the minimum"` while Technique #6 four sections earlier lists that exact shape under _Modifiers That Backfire_. M15 found **seven** hits, not six: the seventh was `reviewer/playbook.md`, **the file cited as the exemplar of the fix**, still carrying a "for this repository" parenthetical that in an installing project reads as theirs. Proved in the RENDERED compiled output for six agents, not just the source
  - Judgement calls upheld: `convention-keeper` kept its completeness requirement (completeness over the INPUT set is legitimate — a finding skipped is a rule never written); the four `<implementation_scope>` blocks kept, since quoting `"fully-featured"` as a spec INDICATOR is the conditional form Technique #6 endorses
  - `agents-inc` deliberately excluded from the M15 grep — 14 false hits from `$schema` comments would have buried the real ones
- [~] **16.** M19 + M20 — harness notes; reference invariants _(M5 parked as a feature)_
- [x] **17.** M17 — all three staleness gates now answer without git, and the two an agent could not run, can be. **Proved by demonstration, not argument:** (a) a corrupted artefact is named; (b) **the old gate PASSED while an entirely new generated file sat untracked on disk** — `git diff --exit-code` silent, `git status` showing `??`; (c) same source, opposite verdicts, the old gate red purely because a sibling had edited a file in that directory the generator does not own
  - **Nearly deleted a finding on its first proposed standard**, checked the second, found it unlanded, wrote it, then deleted. That is the discipline the brief asked for
  - Behaviour change flagged: `generate:schemas` no longer reformats two hand-maintained schemas it does not own — `format:check` covers them and runs first in `prepublishOnly`

### Phase B — the journeys

**Baseline before starting:** unit 162 files / 6775 passed; e2e 220 files / 810 passed, 0 failed.

**The harness must be run with `node`, not `bun`.** `node-pty` is a native module; under bun it fails
with `ESPIPE: invalid seek` and the failure surfaces as _"timeout waiting for 'Choose a stack'"_ with
an **empty** captured output — indistinguishable from a product hang. Run
`node e2e/helpers/handrun.gen.mjs` after `bun scripts/handrun.mjs` has built the bundle, or fix the
runner to spawn node. **This wasted a full run and reads as a product defect.**

Coverage: the harness holds **31 of 39** rows.

- [x] **31 in the harness — RUN 2026-08-19, `node e2e/helpers/handrun.gen.mjs`.** 20 sections, **91
      verdicts, 0 BROKEN, 0 COULD NOT RUN.** Every section reached completion; the log ends at
      `store closed`, so nothing aborted mid-flight. Journeys covered: 1–20, 22, 23, 24, 28a, 30–34,
      including 13/13a/13b
- [~] **21, 28, 29, 35, 36** — being added. 36 has no spec at all; it is hand-run only, since writing
  its permanent guard is a feature the owner parked
- [x] **25 — WALKABLE, 12/12.** Driven as one run against the real editor, the real worker
      (`workerd`, real content-addressed ids), live GitHub, and the real binary. The payload carries
      the skill's **bytes**, and all eight files were re-fetched independently from
      `raw.githubusercontent.com` and found byte-identical. The install half was then run for real:
      identical on disk except one line of `SKILL.md`, which is the deliberate id rewrite
- [x] **27 — NOT WALKABLE. Shipped defect, filed as EDITOR-49.** The browser half is sound (13/13),
      but **every custom-marketplace id the editor mints is uninstallable**: it stores `owner/repo`
      verbatim and the CLI reads a prefix-less ref as a local path. The refusal even recommends the
      form the editor's own field forbids. Driven red first. **Neither suite sees it** — each tests a
      different legal form, and neither tests the one that crosses the boundary
- [x] **26** — **no run owed.** CLOSED BY CONSTRUCTION: marketplace-namespaced ids make a
      cross-marketplace collision unrepresentable. It is a ruling, not an arc

### Phase C — the remaining STRONG/SOLID findings

- [ ] Enumerate what Phase A did not touch, split by already-fixed / needs-ruling / needs-design,
      and work the last two groups.

## Session constraint — sub-agents cannot load skills

The `Skill` tool is disabled for sub-agents in this session, so they cannot load
`meta-design-expressive-typescript`. **Its principles are inlined into every code-changing brief
instead**, and the orchestrator reviews the diff against them. For config and documentation changes
this is moot; for `src/` changes it is not.

## Phase C — what the rules pass established

**Three rules were refused rather than written, and each refusal was correct.**

- The `eslint-disable` rule **as briefed would have condemned 55 of 57 live directives.** The
  population changed completely since the finding (2 → 57), and an agent following it would delete
  guards covering real `Partial<Record>` slots — a bug. Rewritten to keep the gate and make the
  compiler-error form the bar for anything NEW.
- A corollary claiming `validateSelection` has zero production callers and hardcodes `valid: true` was
  dropped: both false today, and **writing it would have condemned live code**.
- A proposal prescribing a task ID in a negative claim was refused — the bible bans them outright.

**Two greps were built, tested, and deliberately not shipped** (31 and 28 hits, mostly legitimate):
_both rules ship without a check rather than with a bad one._ That is the right precedent, and the
inverse of the § 17.3 check that shipped broken.

**A rule was found to have aged into danger, not just staleness.** _"Assert on `E2E_SKILL.<slug>.id`,
not a literal"_ was written unqualified; `E2E_SKILL.react.id` is now namespaced while `ProjectBuilder`
writes bare ids — so the finding's "byte-identical today" caveat has aged into "a different string
entirely", and the guidance is actively wrong.

**One new document, `standards/editor-and-worker.md`**, on a real thesis: every defect it covers was
green in BOTH workspaces' type systems and BOTH suites, and visible only to a real browser or a second
machine. Owed: its `DOCUMENTATION_MAP.md` row.

## Phase C — the deletion batch

131 findings triaged DELETE. **All 131 deleted 2026-08-19** in three passes — 86 with no surviving
citation, then 33 more once a codex-keeper pass had absorbed every citing sentence. The last twelve went once a codex-keeper pass had landed four standards
edits and absorbed their citations. Corpus 282 → 154. **131 of 131 INDEX rows survive** as the
record, and the only surviving references anywhere are in `changelogs/`, by ruling. The row in
`INDEX.md` is the surviving record and is never removed — only the file goes.

Three things this batch taught, all now in the protocol:

1. **The protocol's own grep scope was the bug.** It names four directories; copying it rather than
   re-deriving it missed `changelogs/` completely — 32 references in eleven files. A repo-wide grep
   costs seconds. The scope is now a result, not an assumption.
2. **`changelogs/` is deliberately out of scope**, and now says so. A release note naming a finding
   is a dated statement about a past version and stays true after the file goes. **One exception:
   a dangling markdown LINK is downgraded to plain text** — keeping the words costs nothing and
   preserves the record, while keeping the brackets offers a pointer that resolves to nothing.
   27 such links across six changelogs were de-linked; some had dangled since a prune weeks
   earlier, and nobody had noticed because no checker reads `changelogs/`.
3. **A raw dangle count reads alarmingly high** until you subtract hits inside files that are
   themselves in the same batch. Raw 36 → live 0.

4. **A census is not a fact, it is a reading.** CLI-539 was rewritten on the strength of one — and
   the rewrite was wrong, because the survivor it named was itself on the deletion list. The triage
   was right and I was not: the snapshot procedure it demanded governed `findings-impact-report.md`,
   a document `INDEX.md` replaced by refusing to write a count at all. There is no longer a count
   that can go stale, which is a better fix than the rule the finding asked for.

And one that is not in the protocol, because it is a shell bug rather than a rule: `while read -r`
**silently skips the last line of a file with no trailing newline**. It skipped exactly one of 86 —
the finding about the deletion protocol's own silent-miss gap.

## Phase D — the guards-are-not-features round

The owner overturned my scoping: **a guard is not a feature.** In scope for a fixes-and-refactors
round are a new test, a lint rule, a checker, a fixture capability and a written standard; out of
scope is only a new user-facing capability. **54 of the 58 parked findings came back**, and two of
them were plain bugs I had filed into the wrong bucket entirely.

The pattern that made the mistake visible in hindsight: I had written _"what remains is the guard,
the test, or the mechanism the finding went on to propose"_ on nearly every row, and then filed the
row as a feature anyway.

### What the round was actually worth

Nine live defects, **none of them known when it began**, every one found while building a guard for
something already believed fixed. The single most instructive: a private marketplace's skill ids
were being joined into a zod issue path and reported through Sentry's `tunnel` — which points at our
own worker, the exact infrastructure the catalogue fetch goes browser-direct to avoid. Three sites.
One of them was **documented as safe** in a standard written the same day.

### The lesson worth keeping, in the engineer's words

> A rule that was wrong when written fails review; a rule whose premise expires passes review
> forever, because the reasoning still reads as sound and only the world has moved.

That is now a `root_cause` value — `premise-expired` — and the countermeasure it proposes is not more
review but naming, inside the rule, the fact the rule depends on, so a change to that fact has
something to collide with.

### The measurement I keep coming back to

**Every agent that checked one of my figures found at least one wrong**, across the whole round: a
membership count stale by one within the hour, a "four documents" that was five, a "three documents"
that was four, an enum precedent naming a value that does not exist, a census scoped to four
directories that missed a fifth entirely. None of it was caught by review. All of it was caught by
agents re-deriving from source instead of trusting the brief — which is the same discipline the
programme spent three phases writing into the documents.

## A silent revert, found only by regenerating

A pass on 2026-08-18 corrected `SkillConfig.source` → `origin` in `src/cli/types/{matrix,skills}.ts`
and regenerated the vendored copies in `packages/matrix`. A later pass reverted a regeneration to keep
a gate green — **and took those corrections down with it.** The CLI-side fix stood; the vendored copies
carried the old name for a day, and nothing said so.

It surfaced only because an unrelated regeneration on 2026-08-19 carried them across as a side effect.
Neither the enumeration registry nor `generate:matrix:check` reports it, because both compare the
generator's output to the vendored copy — and a stale vendored copy that matches a stale generator
input is internally consistent. **The coupling is now a documentation-bible row; the detection is not
solved.**

## Orchestration lessons — mine, not the agents'

**Running eight agents at once cost a correctness scare.** A docs pass read `extractSourceFlag`,
verified it existed, wrote it into corrected prose, and a concurrent sweep deleted it ten minutes
later. Only that pass's **end-of-pass identifier re-run** caught it. The written identifier check is
specified per-name, which reads as check-as-you-write; nothing in it says re-run before reporting.

Two rules follow, and they are the orchestrator's:

1. **A pass that verifies symbols must re-run its identifier check immediately before reporting**, not
   only as it writes. A deletion that lands mid-pass is invisible to a per-name check.
   1a. **The row-existence check I put in eight briefs was broken.** `grep -qF "<basename>.md"` against
   `INDEX.md`, whose 440 rows carry no extension — so it reported "row missing" for every finding in
   the corpus and invited a duplicate row for one already indexed. Caught by an agent, not by me. The
   protocol now strips the extension and says why.
2. **Never hand two agents the same symbol from opposite directions** — one documenting it, one
   deleting it. File ownership was disjoint; _symbol_ ownership was not, and that is the axis that
   mattered.

Three attribution errors earlier in this programme have the same root: my picture of who-holds-what
degrades as concurrency rises. Verify holdings from the tree, never from memory.

## Standing constraints

- `packages/cli/CLAUDE.md`: never write implementation or test code directly — delegate to
  `cli-developer` / `cli-tester`; docs go through `codex-keeper`.
- **No task IDs in `.ai-docs/`** (bible rule 3, live or dead). No source line numbers in `.ai-docs/`.
- Sub-agents never edit `todo/` — the orchestrator does, as each item lands.
- Compact at 500k context used, between units of work rather than mid-dispatch.

## Census of the five uncensused green-for-the-wrong-reason classes — 2026-08-22

One read-only dispatch, five classes. Result: **build two gates, not five.** Class 1 (unreachable
subject) 11 dead symbols carrying 116 test invocations plus 2 branch-level; Class 4 (roster is a
subset) 2; Class 3 (fixture the product refuses) 2; Class 2 (press at a refusing control) 1; Class 5
(half-redirected mock) **0**. Filed CLI-657 … CLI-665; CLI-655 closed on the negative.

**Corrections, four — two the agent's, two mine caught on verification.**

1. My brief overstated Class 2's known count: "five specs" was **four call sites across three
   specs**. The five was toast firings, and I read it as specs.
2. A finding's `resolved_by` claims every `KNOWN GAP` comment is gone. **Six remain** — filed as
   CLI-665.
3. **Mine.** The census's closing recommendation — close `AgentsStep.toggleAgent` and
   `DomainStep.toggleDomain` — is stale by one day. Both are already `confirmed-on-row-text`; CLI-638
   closed them. It read the roster's _evidence for why they were closed_ as evidence they _could be_.
   Caught by reading the roster, not by trusting the report.
4. **Mine, and it would have shipped a broken gate.** The proposed Class-4 recogniser — "a roster
   spec with no glob/readdir in the file" — **misses one of its own two motivating instances**:
   `toast-assertion-surface.test.ts` imports and calls `fg`, but globs the files to scan rather than
   deriving the roster. The gate must key on whether the ROSTER is derived from a walk. Written into
   CLI-664.

**The lesson the census states better than I would**, and it is why three of five classes get no
gate: _every class that was genuinely closed was closed by removing its subject, not by detecting its
symptom_ — constants became functions, a page object became closed-loop, a fixture gained a
deliberate divergence. The two worth gating are the two where no subject can be removed, because
"somebody writes a new one" is the whole failure mode.

**False-positive rates, because a hit list without one is not a census.** Class 1 procedure A 78%
(51 raw → 11); Class 2 **97%** (30 open-loop sites → 1); Class 3 75% (8 flagged → 2); Class 4 20%
(10 gates → 2); Class 5 no rate — a clean negative. Class 2's rate is the one that settles the
question: a syntactic proxy there would condemn 29 correct specs to find one defect.

**Correction, CLI-665 dispatch (2026-08-22).** My brief had the defect inverted, and the agent
refused the premise rather than executing it. I wrote that the finding's frontmatter was wrong about
its body, citing four `KNOWN GAP` comments in `selected-agent-name-excluded.e2e.test.ts`. That file
is **not in the finding's `affected_files` and is not its subject**; the finding's own three specs
carry zero. The frontmatter clause was narrowly accurate and the BODY is the stale half.

**Root cause is mine and it is the same one as before: I verified four load-bearing claims from the
census and treated the rest as carried.** This claim was in the unverified remainder, and I
propagated it into a brief. The census had written it as "the body is right and the frontmatter is
wrong" — a framing, not a measurement — and framings are exactly what does not survive being passed
on. Verify the framing, not only the counts.

## The sixteen `Done` rows — 2026-08-22

Verdicts: **11 LANDED, 3 MOOT, 2 PARTIAL, 0 NOT LANDED.** All sixteen deleted and archived; CLI-598
retired with them. Spawned CLI-669.

**Corrections, and two of the three are mine.**

1. **Mine, and it would have cost the pass its best evidence.** My brief asserted "none of these 16
   appears in `todo/archive.md`". Three do — CLI-352, CLI-346 and CLI-357 are each named INSIDE
   another item's entry. My check was `grep -cF "— <id>**"`, which matches only an item's OWN archive
   line. Those two mentions are what settle CLI-352 and CLI-346, and I told the verifier they did not
   exist.
2. **Mine, and worse than the first.** CLI-598 — the row commissioning the work — already carried the
   three-state model including MOOT, already named the two archive mentions, already had CLI-323
   right, and flagged CLI-357 UNVERIFIED rather than guessing. **My brief was a regression on the row
   it was written from.** Re-deriving is not a licence to discard what the row established; the move
   was to carry its findings forward as claims to test.
3. The brief's three-state model was short one state. **MOOT** — the subject was deleted from the
   tree under another item, so the work can never be performed. Filing those as landed records work
   nobody did; filing them as outstanding puts dead work back in the backlog. The archive entry says
   _moot_, and names the item that removed the subject.

**A method note worth carrying.** The spot-check that read CLI-357 as landed was
`grep -c "no-restricted-syntax"` → 7 — of which two are prose and two belong to unrelated blocks. A
count that looks like evidence and is not, which is the defect class CLI-357 itself was written
against. `ESLint.lintText` against the real config is what actually answered it.

**Correction, CLI-662 dispatch (2026-08-22).** My brief said `PINNED_TO_PROJECT` "already appears as a
shared constant across the `init-from-*` specs". It is 7 local declarations with 0 imports. I took
that phrasing from an earlier **archive entry**, which is where the error originated — a description
that was wrong when written and that I passed on without checking. Archive prose is not evidence.

The brief's first candidate approach was also unviable, and the agent was right to refuse it rather
than execute it. That is the second lane this round to reject a briefed premise on measurement; both
were correct to. **The pattern across both: my errors are in the framings I carry forward from prose,
not in the figures I re-derive.**

**Corrections, CLI-663/664 dispatch (2026-08-22) — six, and four are mine.** I gave
`config-readers-agree.test.ts` at `src/cli/lib/__tests__/` when it lives at
`src/cli/lib/configuration/__tests__/`; I invented `page-army-space-presses.test.ts` as a model, a
typo for a file I had named correctly two paragraphs earlier; I claimed "roughly ten roster gates"
when the enumeration grep returns ~110 constants across 25 files; and I said "everything reads the
one constant today", which was false — a fourth hand-rolled kebab regex was already in the tree, and
finding it is now CLI-675.

**The pattern from CLI-662 repeats exactly.** Every one of those four is a framing or a path I carried
from memory or from prose. The figures I re-derived were right. Re-derive the PATHS too — a wrong
path costs an agent a search, and an invented filename costs it trust in the rest of the brief.

**One result worth keeping on method.** The brief said to prefer deleting a false claim to rewriting
it. The lane instead made the claim TRUE, and that is what surfaced CLI-675. Prefer-deletion is the
default for a claim nobody will act on; a claim worth honouring is worth honouring.

**Corrections, CLI-660/661 dispatch (2026-08-22).** Two line-number drifts in my brief (`wizard.tsx`
guard at 91-94 not 92-95; the spec at 161-181 not 162-181) — both harmless because the agent
re-derived, which is what the contract asks. Everything substantive held.

**The brief was wrong about file ownership in a way that mattered.** I implied `e2e/pages/steps/`
would not need touching. It did, and unavoidably: every press/wait primitive on `BaseStep` is
`protected`, so a spec cannot compose the raw-cursor-then-press-then-wait dance itself. **Naming the
files a lane owns is only useful if the ownership map is derived from what the work requires**, not
from what I expect it to touch. The agent reported the change rather than making it silently, and
then made it because no other lane held that file.

**A cross-lane result worth keeping.** The toast lane's derived gate was already RED on the scope
toast before this lane's constant existed — its second half asserts every painted toast is named by
some sentinel. Two lanes, dispatched independently, closed one gap from opposite ends and neither
was told about the other. That is the case FOR deriving a roster rather than writing one.

**Corrections, docs dispatch (2026-08-22).** My site estimate was low (51 across 16 files, not ~40)
and my symbol list was short by five — four types/functions deleted alongside the twelve, which my
regex therefore could not see. The FILE list was exactly right; every one of the 16 had hits. I also
told the lane two docs were failing `format:check`; both were passing, and the real failure was an
untracked scratch file a concurrent lane had created eleven seconds earlier.

**The estimate being low is the benign direction and the symbol list being short is not.** A low
count costs nothing — the lane re-derived, as instructed. An incomplete symbol list silently scopes
the work: five symbols and six sites would have survived the pass reading as current documentation,
and the final census would still have come back clean, because the census used my regex.
**A census built from the same list as the work cannot detect the list being wrong.**

**Correction, CLI-658 dispatch (2026-08-22) — the largest of the round, and mine.** My brief asserted
"the tree should be clean of this class right now". It holds **24 live instances**. I built that
claim on CLI-657 having deleted twelve symbols, without asking whether the census that FOUND those
twelve could have found the rest.

It could not, and my own brief said so two paragraphs earlier: it warned the reader that a barrel
re-export and a `{@link}` read as production references, and cited `installEject` and
`installPluginConfig` as the two that slipped past for exactly that reason. **What I never asked was
what else the same blind spot was hiding.** Two symbols were repaired by hand and the method was
never re-run. 22 of the 24 were sitting there the whole time.

**The general rule: when a census is corrected by hand, the correction is not the fix — re-running
the corrected method is.** A hand-patched result looks identical to a sound one, and this programme
has now been bitten by that twice (the ugrep hazard was the other). Both times the repair was applied
to the finding and not to the instrument.

This is also the strongest argument yet for sequencing gates AFTER cleanups rather than before. Had
CLI-658 run first, all 24 would have entered the exception table as permitted, and the roster would
have read as a considered decision rather than a backlog.

**Corrections, compiled-agent coverage dispatch (2026-08-22).** Two mine, one environmental.

1. **I briefed a new parser without checking whether one existed.** `agent-assertions.ts` already
   exports `parseCompiledAgent` with ~20 call sites. The agent built the briefed one anyway under a
   distinct name and reported the collision — correct, since the existing one is broken two ways and
   pointing new work at it would have spread the defects. But the brief should have found it: **"does
   this already exist" is a question about the tree, and I have a standing rule to re-derive those.**
2. Wrong directory for `compile.e2e.test.ts` (`e2e/commands/`, not `e2e/integration/`) and one doc
   short on the enumeration gate. Both cost the agent a search.
3. **Not mine, and it changes how I read every gate run today.** The unit suite gives 15 failures
   under `FORCE_COLOR` and 7270 passes without it. My own clean run earlier in the session and this
   lane's runs were taken under different shells and neither of us knew. Filed as CLI-686. **A gate
   whose result depends on the developer's environment is not a gate** — and its failure names a
   missing string, so it reads as a regression rather than as a setup problem.

## Parallelism, corrected by the owner — 2026-08-22

The owner challenged whether these lanes should run concurrently, citing work being overwritten and
tests failing because another lane is mid-run. **Both halves were right, and I had the evidence
already.**

Checked and found a real collision: the `custom: true` lane renames all ten E2E fixture slugs, and
**192 E2E specs reference `E2E_SKILL`**. A concurrent lane's gate is the full E2E suite — it would
have run against half-renamed fixtures and seen failures it could not attribute. Cancelled that lane
and re-dispatched it alone.

**Killing a lane is not free, and I treated it as though it were.** I checked "no files modified in
the last 6 minutes", read that as nothing-to-lose, and killed it — it wrote to
`kebab-name-judges-agree.test.ts` in the seconds between. The edit was coherent (the regex fix and
its pin retired together) but incomplete, and it left `producer-rosters-are-derived` red and the file
prettier-unclean. **Check for a write immediately before the kill, not a minute before.**

**The rule going forward:** parallelise only when lanes touch disjoint files AND no lane has wide
test blast radius. `dist/` is shared no matter how the files are carved up, so any lane running the
E2E suite is exposed to any other lane's rebuild — that is not solvable by ownership lists. Four
lanes today reported transient failures outside their own diffs (`exit 127`,
`Warning: init is not a agents-inc command`, one watching the suite report 3, then 10, then 6, then 0
failures across four runs). The dangerous shape is that these surface as assertion failures rather
than as build errors.

**Corrections, CLI-596/644 dispatch (2026-08-22).** Four, and the first is the worst kind.

1. **`validate` is not a command.** Both my brief AND CLI-596's own tracker row said the strict
   metadata schema is reached through "`validate` and `doctor`". `agents-inc validate` exits
   `UNKNOWN_COMMAND`, and a spec pins that it no longer resolves. **The row has carried that error
   since it was written and I propagated it without checking** — a command name is exactly the kind
   of claim `ls src/cli/commands/` answers in one second.
2. **`getCustomSkillIds` has no readers at all.** I briefed the change as "moving" it; it is exported
   and dead, so it moves nothing. It is now also a live instance of CLI-681's class.
3. Baseline off by one (7211 vs 7210) — the cancelled lane's deleted pin.
4. **The briefed route does not work, and the reason is a bigger defect than the row.** The lane
   implemented it in full, measured it, and reverted — the right order.

**The finding worth carrying: the fixture's borrowed identity was hiding a product defect.** Because
the E2E fixture publishes the public catalogue's own slugs, the entire relationship-rule surface has
only ever been exercised through an identity no third-party marketplace can have. A correctly
namespaced marketplace cannot write a rule about its own skills at all. **A fixture that borrows a
real identity does not just weaken its own specs — it can conceal the defect that makes the real
identity unusable.** That is a stronger version of the standard already written down in
`standards/e2e/test-data.md`, and it is why the row is now BLOCKED rather than ready.

## The relevance sweep — 2026-08-22

Three read-only verifiers over 37 rows before sequencing them. **Result: 12 already DONE, 3 MOOT,
5 WRONG or PARTIAL-with-a-false-half, and every large row's headline figure stale.** Nine of the
eleven figures I quoted from rows were wrong. The rows were describing a tree from days ago.

**The correction that matters most is mine, and it is the third version of the same error.** I have
told every brief today that ugrep returns a silent zero when a `)` sits inside a negated bracket
expression. **It does not.** Isolated against one line:

| pattern           | has `[^)]` | has `[^]]` | ugrep                    |
| ----------------- | ---------- | ---------- | ------------------------ |
| `\[.*\]\([^)]*\)` | yes        | no         | **matches**              |
| `\[[^]]*\]\(.*\)` | no         | yes        | **0, exit 1, no stderr** |

The trigger is **`]` as the first member of a negated class**. `)` is irrelevant. The remedy (`-P` or
`-F`) was always right; only the cause was wrong — **which is worse than no diagnosis, because it
sends the reader straight into the failure**: told to avoid `[^)]`, an author writes `[^]]`.

The history: version one was "ugrep doesn't match a literal parenthesis", spread to four briefs.
Version two is the one above, spread to every brief today. **Both times I corrected the FINDING and
not the INSTRUMENT** — the same root cause as CLI-658, where a hand-patched census hid 22 further
instances. A hazard note is an instrument. Re-isolate it, do not edit its prose.

**Two rows went MOOT mid-verification, twenty minutes apart**, deleted by a concurrent lane while a
verifier was reading them. That is not a failure of either side — it is what verifying a moving tree
costs, and both verifiers caught it because the brief told them to re-run in the live lane's areas
immediately before reporting. Keep that instruction in every brief that overlaps a running lane.

**One verifier declined to run the test suite at all** rather than build a shared `dist/` out from
under the E2E lane, and said so plainly instead of reporting a green it did not have. That is the
right call and the right disclosure.

**Correction, CLI-681 dispatch (2026-08-22) — three mine.** I told the lane marketplace removal was a
real shipped behaviour and that plugin discovery made its seven readers likely-(b). **No command
removes a marketplace at all**, and one of the seven composes a directory only test helpers build. I
also gave the roster as 24 live plus one exception; it was 22 plus one.

**And I broke a gate from the tracker side.** CLI-701's row cited a finding by a filename I invented
rather than read — `…between-the-subject-and-the-matcher` for a file named
`…inside-an-assertion-erases-the-state-the-assertion-is-about`. `check-finding-citations` went red and
the lane had to prove the red was not its own, from `git show HEAD` and an mtime. **Tracker prose is
gated too**, and I have been treating my own writes as exempt from the re-derive rule I put in every
brief.

**Correction, CLI-696/700 dispatch (2026-08-22).** I filed CLI-700 straight from a verifier's report
without re-deriving it. **Its subject has never existed** — not on disk, not in git history — and
`spec-gates` was green the whole time. The executing lane caught it and stopped on the row rather
than widening a roster to clear an imagined red.

**I have now been the source of two bad rows in one day** (this and CLI-701's invented finding
filename). Both came from the same habit: treating a report I received, or a name I remembered, as
established because _I_ was the one writing it down. The re-derive rule is in every brief I send and
I have been exempting myself from it.

**And my CLI-696 framing was wrong in the way that would have produced a useless fix**: I said escape
the pipe. Escaping alone changes nothing, because the reader split on a bare `|` — the page would have
become correct markdown and the gate would still have condemned it. The reader had to become
escape-aware first. **A brief that names the remedy rather than the defect can be followed exactly and
still fix nothing.**

**Two corrections from the CLI-680 dispatch, both mine, both methodological.**

1. **`grep -v agent-findings` filters LINES, not paths.** `grep -rn` prints `path:line:text`, so the
   pipe matched against the whole printed line and silently dropped any hit whose _prose_ mentions the
   directory. That hid a seventh file. **The documentation bible already states this trap verbatim and
   its own census uses `--exclude-dir`** — I handed a lane the exact form its governing standard warns
   against, and have been using it all day. Correct form: `grep -vP '^\.ai-docs/agent-findings/'`.
2. **My CLI-574 rename destroyed the provenance it existed to preserve.** The script wrote
   `(was D-276)` and then ran a global `D-276 → CLI-738` substitution over the same text, rewriting its
   own annotation into `(was CLI-738)`. All 27 rows, every heading. Restored by reversing the id map.
   **The rule: a rename pass must not run a global substitution after writing text that contains the
   old id** — order the annotation last, or exclude it.

Both were caught by the lane _behind_ mine reading a file it had been told was already handled. That
is the third time today a downstream lane has caught an upstream error, and the first two were also
mine. The pattern is not that the lanes are careless — it is that **I do not verify my own writes to
the same standard I demand in every brief.**

**A third CLI-574 correction, and this one leaked 879 files into `git status`.** Renaming
`todo/plans/D-162-skill-olympics/` to `CLI-729-skill-olympics/` left `.gitignore:124` pinned to the
old path, so the entire Skill Olympics corpus — third-party skill text and benchmark artefacts,
deliberately excluded — became untracked-and-visible. Repointed; `git check-ignore` confirms it is
ignored again.

**The rule: renaming a path means finding everything that names it BY PATH, not only by id.** I
checked the tracker's own `[Plan]` links and the plan files' internal citations, and stopped there.
`.gitignore`, `.prettierignore`, and any tooling config keyed to a directory name are the other half,
and none of them is reachable by grepping for the id — the ignore rule names the directory, and the
directory name only _contains_ the id.

Third error from one rename pass, after the destroyed `(was …)` provenance and the line-based
`grep -v`. All three share a shape: **I verified the thing I was changing and not the things that
pointed at it.**

**A false alarm of mine, 2026-08-22.** I killed a lane on a correct parallelism call, then read a
2-line `agent.liquid` diff from an EARLIER session as that lane wiring a 150-line partial into every
compiled agent, and reported a product change that had not happened. The lane had done exactly what
its brief asked: a roster gate with the unwired partial in a documented exception, no product change.

**The error was attributing an uncommitted diff to the lane I had just stopped.** In a tree with this
much uncommitted work from many passes, `git diff` says what changed since HEAD — never who changed
it or when. Mtime and the lane's own file list are the only attribution signals, and I used neither.

The parallelism call itself was right: both lanes ran the full E2E suite, one changed printed output
on shipped commands and the other touched `e2e/pages/constants.ts`. Disjoint files, both wide.

## The second verification sweep — 2026-08-23

Seventeen rows filed from other agents' reports, never independently checked. **Measured rate: 18%
not-as-claimed at the headline, 35% carrying at least one false detail** — lower than the original
backlog's 41%, but far from zero, and two rows were fully DONE before anyone would have worked them.

**Three findings changed the plan rather than a row.**

1. **Four pairs are one change each, not eight lanes.** `ensureBinaryExists()` is a one-line wrapper
   whose whole body is `assertDistIsPresent(CLI_ROOT)`, so retiring one _is_ retiring the other —
   done separately, that is 245 files touched twice. The two reason-field rows land on the same three
   files and need one answer, not two. The two fixture rows are the same tables. And three separate
   defects share one checker file, so they cannot be three lanes.
2. **An ordering constraint nobody had noticed.** The staleness guard trips on an ordinary editor
   save (write-temp-and-rename), so the two large sweeps must run _after_ that is fixed or every save
   during them reddens the guard for the lane itself and for everyone else.
3. **Two rows promise replacement text "recorded in the report" and that text is not in the tree.**
   A fix lane would go looking and find nothing. **A row may cite a measurement, but it cannot cite an
   artefact that does not exist** — if the wording matters, it belongs in the row.

**A self-correction from the verifier worth keeping:** its first census used `\*\*\d+ members\*\*`
and returned zero — a true negative for that pattern and the wrong pattern, because the document
writes `**184 members, exhaustive as listed:**`. It caught this by widening rather than reporting the
clean zero. That is the same shape as the ugrep hazard: **a search that cannot see the thing reads
exactly like a search that found nothing.**

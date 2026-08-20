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

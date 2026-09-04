# Summoner refactor — context engineering for the Claude 5 generation

Progress file for the programme that refactors the **agent-summoner** and **skill-summoner**
sub-agents, the shared `agent.liquid` template and its methodology partials, and the two standards
documents that govern them, against five owner-stated rules.

**Started 2026-09-03.** One line per dispatch, appended as each lane lands — a correction read once
and discarded measures nothing.

---

## The five rules (owner, 2026-09-03) — these overrule contradicting repo conventions

| #   | Rule                                | In one sentence                                                                                                                             |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Positive framing                    | Generated prompts state what to do; prohibitions and micromanagement come out; frontier reasoning is assumed                                |
| 2   | Progressive disclosure / core slim  | Cut the generated baseline by up to 80%; deep knowledge lazy-loads via Skill or a sub-file; no inline examples in tool descriptions         |
| 3   | Cache-friendly configuration        | Byte-identical prefix across sessions; dynamic data relocated to a `<system-reminder>` at the very end                                      |
| 4   | Single writer, clean-context review | Only the primary agent writes; reviewers see the diff plus the rubric. **The isolation half is superseded** — see the worktree ruling below |
| 5   | Deterministic completion gates      | A `Stop` / `SubagentStop` hook runs the gates, exits 2 on failure, and feeds errors back as `additionalContext`                             |

## Owner ruling — skill authoring, 2026-09-03

**All skill authoring belongs to `skill-summoner`.** Asked to confirm that the rewrite's narrowing
was intended, the owner ruled that it was.

This settles a split the original files carried and disagreed about: `agent-summoner`'s pre-rewrite
`identity.md` claimed "Creating new skills (single-file comprehensive structure)" under **You
handle** while routing "Technology-specific skill creation" away, and its playbook and output format
each said something different again. The rewrite resolved that toward `skill-summoner` in review
pass 3, and the ruling confirms it.

**One gap the ruling exposed, now closed.** Both sides had scoped the hand-off to _technology_
skills — `agent-summoner` routed away "Technology-specific skill research", `skill-summoner` claimed
"technology skills" — so a methodology or process skill fell between the two agents. Both now read
as every skill: `skill-summoner`'s identity opens "**Every skill this product authors is yours**"
and `agent-summoner`'s hand-off row reads "Authoring or improving any skill → `skill-summoner`".

## Owner ruling — concision, 2026-09-03

**Say it once, in the fewest words that stay clear.** The rewrite cut STRUCTURE hard — 82% off the
baseline, 60%+ off each summoner — and left a literary register behind. The owner's critique: skills
and sub-agents can be trimmed further on wording alone, before a single section moves.

The rule is now taught in four places rather than asserted here: `agent-summoner`'s `<voice>`
section, `skill-summoner`'s Skill Shape, `prompt-bible.md` §5's Content Quality checklist and
`skill-atomicity-bible.md`'s size guidance — which now says to trim wording BEFORE extracting,
since a file cut to length by extraction alone stays wordy in what remains.

**It is a lens rather than a taste judgement.** Review passes 24 onward carry a `concision` lens
whose finding shape is a quoted passage, its shorter replacement, and both word counts — reportable
only where the shorter version loses no instruction, reason or caveat. It weights by where words are
paid for: `operating-principles.liquid` renders into all eighteen agents, so a word cut there is cut
eighteen times, and the `SKILL.md` skeleton is emitted into every generated skill.

## Owner ruling — precedence, 2026-09-03

**The five rules, and every ruling made under them, override all standards documents wherever they
conflict.** The rule wins and the document is what changes.

This is now stated at the top of all three, with the authority chain spelled out where one already
existed: `skill-atomicity-bible.md` said "when the primer and this bible disagree, the primer wins",
so the chain is **rules → primer → bible**, and the rules outrank both.

It matters because the loop kept finding the same shape: a template stripped of a pattern while the
standard still mandated it, so the next agent authored from that standard carried the pattern back
in. Precedence stated in the standard is what stops a future reader resolving that the wrong way —
and the rules are recorded in this file, so the standards can point at one place rather than
restating them and drifting.

## Owner ruling — worktrees, 2026-09-03

**No agent carries `isolation: worktree`. The owner does not use worktrees.**

This supersedes rule 4's `isolation: worktree` clause, which was the one place the five rules
collided with a standing repository rule. `reviewer` carried the key for part of this programme and
`packages/cli/CLAUDE.md`'s ban was narrowed to permit it; both are withdrawn. The ban is restored
with the ruling recorded beside it.

**The key stays SUPPORTED and unset.** Claude Code's frontmatter documents `isolation`, the CLI
carries it from `metadata.yaml` to the compiled file, and a consuming project may want it —
supporting a key and using it are separate decisions. The verifier/fixer separation now rests
entirely on `reviewer`'s narrowed tool grant, which is the half that matters.

## Owner ruling — added capability, 2026-09-03

**Add what has a reason; leave the rest until it does.** Ruling on a source proposing seven new
frontmatter keys and a `scripts/` level for skills:

| Proposed                                        | Ruling                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `maxTurns`, `background`, `color`, `memory`     | **Not added** — no agent needs them; add when one does        |
| `scripts/` level in skills                      | **Not added** — same                                          |
| `experimental.cacheTtl`                         | **Added**, supported and unset by default                     |
| Conditional branching in the emitted `SKILL.md` | **Added** — asked for after the first ruling                  |
| Output format last in the body                  | **Added** — recency, and a pure reordering of existing blocks |

**`experimental.cacheTtl` is emitted only when an agent declares it.** The source's skeleton had
`default: "1h"`. Verification against the Claude Code contract found `1h` bills cache WRITES at a
higher rate and is ignored outright while a subscription runs on usage credits — so defaulting it
would raise the bill of everyone installing a generated agent, and sometimes buy them nothing. A
generator does not get to spend the installer's money by default.

## The owner's execution instruction (2026-09-03, mid-turn)

Refactor both summoners and every partial they carry, then **review the result five times**,
continuing until a pass returns no changes needed. Each pass is recorded below with its verdict.

**Extended 2026-09-03, after the worktree and cacheTtl rulings landed:** run the five rules over the
changed tree **five more times, continuing until an iteration turns up nothing**, to confirm the
rulings are implemented and aligned rather than merely applied. Passes 21 onward are that round.

**Extended again, same day, on two further owner instructions.** First: confirm no rule was
discarded because an outdated bible said otherwise, and that the bibles now reflect the rules
correctly. Second: judge concision. Passes 24 onward therefore run EIGHT lenses — the original five
plus `precedence`, `bible-fidelity` and `concision` — because the first five only ever asked "is
this text wrong?", and none of them could see a rule dropped by deference or a standard that merely
lacks conflicts without teaching the rule.

---

## The Claude-5 context-engineering brief the owner handed over (2026-09-03, mid-turn)

A six-phase programme with checkpoints, sourced from research on Claude 5 / Opus 5 prompting
guidance. **Roughly 60% of it was already at HEAD**, because it was measured against a tree from
before `0.162.0` and before this programme's own passes. Recorded here so the same brief is not
executed twice, and so the reasons for not executing it are checkable rather than remembered.

**Already landed, verified against the tree.** The self-reminder loop is gone and Technique #1 is
now Deterministic Completion Gates, whose "What It Replaces" names the loop. There are eleven
techniques, not thirteen, so every technique number in the brief points somewhere else. §4 is
"Choosing the Model and the Effort" rather than "Sonnet 4.5 Specific Optimizations".
`claude-architecture-bible.md` has zero live references — one hit, in `changelogs/0.11.0.md`.
`DISPLAY ALL 5 CORE PRINCIPLES`, `ALWAYS RE-READ FILES AFTER EDITING` and "LYING TO YOURSELF" are
all gone. The six partials the brief asks to trim are one partial of 1,683 bytes, which is the
shared-path cut the brief's Phase 2 sets out to achieve. Hook infrastructure exists: `hooks:`
renders from `metadata.yaml`, the schema accepts it, and an agent holding `Write` or `Edit` gets a
`SubagentStop` gate automatically.

**One phase would have regressed a shipped fix.** Phase 2 deletes `<skill_activation_protocol>` on
the ground that "only skill-summoner grants the Skill tool, so this block instructs seventeen agents
to invoke a tool they do not have". `withSkillTool` in `packages/compile/src/agent-source.ts`
appends `Skill` to every agent at compile time, and its docblock records why. Acting on the brief
would have removed the payload and kept the tool.

**Argued rather than applied.** The brief's `PostToolUse` formatter-and-linter hook on every
`Edit`/`Write` deletes instruction-based verification for costing turns, then spends a process
launch per edit; `SubagentStop`, already shipped, fires once per agent instead. And
`model: sonnet` for the researchers and testers contradicts §4's own rule — filed as CLI-874 for
the owner rather than decided here.

**What was genuinely new**, and the only part of the brief acted on: CLI-872 (the skill
`description` carries no trigger conditions while `usageGuidance` beside it does), CLI-873
(enumerate before committing), and three technique headings still carrying unsourced percentages,
which contradicted this document's own Conclusion — those were stripped in pass 30's application.

**The lesson is the briefing standard's first rule.** The brief opens "Measurements taken against
this repo at HEAD" and its figures predate the release at HEAD. Re-derive before you write.

### Owner rulings on that brief, same day

- **"These are researched suggestions, so you should be biased towards implementing them."** My
  first pass audited the brief for staleness and used what it found to shrink the scope — reporting
  three actionable items and several returned as decisions. That calibration was wrong. **Verify the
  facts, not the worth.** A stale measurement makes a figure wrong, never the underlying idea, and a
  collision with one of our own standards means the standard is the younger claim and probably the
  thing to amend. The audit workflow was recalibrated mid-run: `already-true` became the verdict
  needing hard proof, since it is the one that cancels work; a partly-satisfied claim counts as
  build-it scoped to the remainder; and a regression in the brief's **method** never kills the
  brief's **goal** — it means amending the approach.
- **"Just make everything opus 5, that's easier."** Settles the brief's Phase 6 model-tier proposal
  in the opposite direction and retires CLI-874. Sixteen of eighteen were already there — the
  brief's one exact figure — and `meta/convention-keeper` and `tester/api-tester` were the two
  outliers. Recorded in `prompt-bible.md` section 4, because both had plausible-looking reasons to
  be on `sonnet` and a later pass would otherwise "optimise" them back.
- **"We definitely need the dynamic skills block, it's literally the concept of dynamic skills."**
  Closes Phase 2's proposed deletion of `<skill_activation_protocol>`. The brief's premise was false
  — `withSkillTool` grants `Skill` to every compiled agent, so the deletion would have removed the
  payload and kept the tool — and the ruling means it is not re-litigated. It also promotes CLI-872
  from filed to build-it: the block is the concept, and it is being fed `when working with
<category>` where every one of the 238 skills states a real trigger sentence in `usageGuidance`.

---

## Baseline, measured 2026-09-03

Re-derive these before trusting them; every one was measured with the command beside it.

| Figure                                              | Value                       | Command                                                               |
| --------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Sub-agents                                          | 18                          | `ls -d packages/cli/src/agents/*/*/ \| grep -v _templates \| wc -l`   |
| Skills in the marketplace                           | 238                         | `find /home/vince/dev/skills/src -name SKILL.md \| wc -l`             |
| `agent.liquid` literal text (non-Liquid)            | 3,184 B                     | see the python measurement in the session transcript                  |
| Methodology partials rendered into every agent      | 13,810 B (5 of 6)           | `wc -c packages/cli/src/agents/_templates/methodologies/*.liquid`     |
| **Static scaffolding every compiled agent carries** | **~16,994 B ≈ 4.2k tokens** | literal template + rendered partials                                  |
| `improvement-protocol.liquid`, rendered by nothing  | 4,021 B                     | pinned as deliberate by `agent-template-renders-its-partials.test.ts` |
| agent-summoner's own five markdown files            | 60,405 B                    | `cat identity playbook output critical-* \| wc -c`                    |
| skill-summoner's own five markdown files            | 65,725 B                    | same                                                                  |

## Facts established before any edit

- **Nothing in this product generates a `CLAUDE.md`.** `STANDARD_FILES.CLAUDE_MD` has no consumer
  outside its own declaration in `packages/compile/src/paths.ts`. Rule 1's "CLAUDE.md files" maps
  onto the compiled agent bodies and this repository's own instruction files, not a generated one.
- **The CLI reads `.claude/settings.json` and never writes it** (`plugin-settings.ts`). A hook
  delivered through settings would be a new write surface; `hooks:` on agent frontmatter is already
  modelled (`hooksRecordSchema`, shape `{ Event: [{ matcher, hooks: [{type, command}] }] }`) and is
  simply never emitted by `agent.liquid`.
- **The five methodology partials do not exist as skills.** The 0.4.0 changelog's methodology
  skills were retired; only `meta-methodology-research-methodology` survives in `SKILL_IDS`. So
  rule 2's lazy-load target has to be built rather than pointed at.
- **`prompt-bible.md` already carries Technique #10, Positive Framing** — and its own templates
  violate it throughout. Rule 1 is largely enforcement of a standard the repo already adopted.
- Both summoners cite `claude-architecture-bible.md`, which **does not exist** anywhere in the
  tree, and `.claude-src/config.yaml`, which **does not exist** either (the file is `config.ts`).

---

## Dispatch log

| #     | Date       | Lane                                                          | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                        | Corrections reported                                                                                                                                                                                                                                    |
| ----- | ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 2026-09-03 | `summoner-template-audit` — 9 survey lanes + synth            | landed; 10 agents, 1.55M tokens, 0 errors                                                                                                                                                                                                                                                                                                                                                                                                      | Substantial. See below                                                                                                                                                                                                                                  |
| 2     | 2026-09-03 | `summoner-rewrite` — 4 file lanes                             | landed                                                                                                                                                                                                                                                                                                                                                                                                                                         | folded into the passes                                                                                                                                                                                                                                  |
| 3     | 2026-09-03 | `cli-tester` — red test for the frontmatter schema            | landed; 6 specs, 4 red then green                                                                                                                                                                                                                                                                                                                                                                                                              | 4, three substantive                                                                                                                                                                                                                                    |
| 4     | 2026-09-03 | `cli-developer` — schema, sanitizer, docblock                 | landed; all gates green, 7456/7456                                                                                                                                                                                                                                                                                                                                                                                                             | 4, one design-changing                                                                                                                                                                                                                                  |
| 5     | 2026-09-03 | `cli-tester` — stale matrix expectation                       | landed; found a sibling the brief missed                                                                                                                                                                                                                                                                                                                                                                                                       | 1, a self-correction                                                                                                                                                                                                                                    |
| 6     | 2026-09-03 | `cli-tester` — partials gate mandating optionals              | landed; roster replaced by a stronger claim                                                                                                                                                                                                                                                                                                                                                                                                    | 1 — my brief contradicted itself                                                                                                                                                                                                                        |
| 7     | 2026-09-03 | `cli-tester` — guard for the sanitizer enumeration            | landed; found a live third instance on its first run                                                                                                                                                                                                                                                                                                                                                                                           | 3, one a hole in my gate                                                                                                                                                                                                                                |
| 8     | 2026-09-03 | `cli-developer` — misdiagnosing throw, sibling, double report | landed; class closed at two members                                                                                                                                                                                                                                                                                                                                                                                                            | 1 — my caller census was too narrow                                                                                                                                                                                                                     |
| 9     | 2026-09-03 | `cli-developer` — sanitize `hook.type`                        | landed; CLI output byte-identical                                                                                                                                                                                                                                                                                                                                                                                                              | 1 — the hand-run I asked for is unreachable                                                                                                                                                                                                             |
| 10    | 2026-09-03 | `cli-tester` — retire the pin                                 | landed; root gate 12/12                                                                                                                                                                                                                                                                                                                                                                                                                        | 1 — my scoping was too broad                                                                                                                                                                                                                            |
| 11–19 | 2026-09-03 | review follow-ups                                             | **API 529 storm** — ten Opus kills; unblocked by tracing the regression read-only and re-dispatching on Sonnet. Landed since: idempotency fix (e2e 252/254); gate runs `test` (35.8 s → 69.5 s measured); baseline drops the read-back sentence (2,290 B no-skills); editor forwards four of five keys — the fifth is CLI-882; reference/www sweep found `experimental` missing from THREE enumerations, and the census grep itself omitted it | landed; 3 corrections                                                                                                                                                                                                                                   |
| 20    | 2026-09-03 | `cli-tester` — five unit-spec CLAUDE.md violations + gate pin | landed; regex scanner extracted to `helpers/text-scans.ts` with its own spec; 227/7,483                                                                                                                                                                                                                                                                                                                                                        | 1 — the gate BLOCKED this lane on a doc-enumeration red it did not own, and it crossed lane to fix `factories.md` rather than stay stuck. Gate working as designed                                                                                      |
| 21    | 2026-09-03 | `cli-developer` (Sonnet) — remove `test` from the gate        | landed; 9 artefacts recompiled to typecheck + lint                                                                                                                                                                                                                                                                                                                                                                                             | 2 — no two-script form at HEAD to restore (the whole gate is uncommitted), and `node bin/run.js compile` ran a stale `dist/` first: `0 rewritten` while nothing had changed. `bun run build` before any hand-run that follows a `packages/compile` edit |
| 22    | 2026-09-03 | `cli-tester` (Sonnet) — retire the three-script pin           | landed; polled the constant to 0 before deriving, rendered the literal rather than pasting it; 21/21                                                                                                                                                                                                                                                                                                                                           | 1 — its root `bun run test` red was corpus drift from my playbook edit, regenerated before it reported                                                                                                                                                  |
| 23    | 2026-09-03 | `cli-developer` (Sonnet) — remove `lint` from the gate        | landed; typecheck only; 9 artefacts recompiled after `bun run build`; one stale docblock sentence caught on report and sent back                                                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                                                                                                                 |
| 24    | 2026-09-03 | `cli-tester` (Sonnet) — retire the two-script pin             | landed; polled to 0, rendered the literal, byte-diffed against the old one; 21/21; forced compile task uncached                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                                                                                                                                                                 |

### Corrections from dispatches 3–8 — the ones worth keeping

- **Dispatch 3, on the shape of the defect:** the schema gap was not a standing one. The same
  uncommitted change added `isolation` and `experimental` to the template and reached three of the
  four agent-shaped schemas; `agentFrontmatterValidationSchema` was the fourth.
  `grep -n "permissionMode:" src/cli/lib/schemas.ts` is the census that says so, and it returns
  exactly three. **A brief describing a long-standing gap would have sent the fix to the wrong
  place** — the class was one sibling, not a category.
- **Dispatch 3, on the fixtures:** neither `renderAgentMd` nor `renderAgentYaml` fits a frontmatter
  spec. The first takes only `{ tools, body }`; the second emits an `id:`/`title:` **metadata.yaml**
  shape the frontmatter schema rejects outright. My brief named both as ready-made and was wrong
  about each.
- **Dispatch 4, on the sanitizer:** the suggested "spread alongside `isolation`" would not have
  compiled — `sanitizeLiquidSyntax` is `<T extends string>` and `experimental` is an object, so it
  needed a nested helper as `hooks` has. And the argument that settled whether to sanitize an
  enum-constrained field at all was one no schema reasoning could reach: `renderAgent` is also the
  **editor's browser path** through `renderAgentFromCorpus`, which never runs the CLI's parse. A
  type says nothing about what reached the renderer.
- **Dispatch 4, on my own brief:** I placed two known failures on the root prettier command. One was
  a **vitest** failure — prettier does not evaluate a test's expected constant. Misattributing a
  failure to the wrong gate sends a lane to the wrong file.
- **Dispatch 5, a lane correcting itself:** it had reported the stale-description failure as
  "another lane mid-edit" when it was a stale expectation in its own file. The reason is the
  keeper — the diff was two long prose sentences differing by one clause, which **looks** like
  generated-file drift, so a value-shaped failure hides which side is stale.
- **Dispatch 5, a sibling nobody named:** `PM_ENTRY` carried the same pasted-prose defect as
  `AGENT_SUMMONER_ENTRY`, green only because `pm`'s wording had not moved yet. Both now read the
  value from the agent's own `metadata.yaml`, and the expectation was proved to discriminate by
  pointing the generator at a mutated source copy rather than assumed non-tautological.
- **Dispatch 6, a self-contradiction in my own brief:** it argued from Technique #7's "there is no
  floor" that the gate should stop mandating `<self_correction_triggers>`, while its proof
  requirement said a `critical-requirements.md` that exists and has lost the block must still fail.
  The lane implemented the half the proof named and reported the conflict rather than picking
  silently. **A brief that states a rule and then a proof of its opposite is worse than either** —
  the reader cannot tell which is the intent.
- **Dispatch 6, what replaced the roster:** rather than deleting the presence assertion, the optional
  contracts now assert the liquid guard that makes absence legal — `{% if criticalReminders != "" %}`.
  That is strictly stronger than the roster it replaces: a roster only says the file is there, while
  losing the guard compiles an empty `<critical_reminders>` wrapper around nothing into every agent
  that omits the file, which **no assertion over files that exist can reach**. Shown falsifiable
  against a fixture template with the guard removed.
- **Left over, theoretical today:** an agent with genuine role-specific critical requirements and no
  triggers must still either carry the block or drop its whole `critical-requirements.md`. All
  eighteen shipped files carry both, so nothing is affected; making the tag conditional too would
  leave `requires` unasserted for that file, which needs a different mechanism rather than a looser
  assertion.
- **Dispatch 7 closed the gap dispatch 4 reported, and its guard found a live third instance on its
  first run.** `sanitizeHooks` spreads `...action` and overrides `command`, `script` and `prompt`;
  `type` rides the spread, and `agent.liquid` emits the whole map through
  `{{ agent.hooks | json }}`. The class is three, not two. The guard pinned rather than fixed, since
  the file belonged to another lane, and named the pin in the assertion rather than hiding it in a
  shorter roster.
- **Dispatch 7 dated the class.** `git show HEAD:packages/compile/src/agent-source.ts | grep -c
sanitizeHooks` returns 0, as does the same for `sanitizeExperimental` and for `agent.experimental`
  in the committed template. **Both misses and both fixes live entirely in this programme's
  uncommitted tree** — nothing shipped carries them.
- **Dispatch 7 found the second hole in my gate list, the same shape as the first.**
  `npx vitest run` from `packages/cli` collects **nothing** from `packages/compile`.
  `npx vitest list | grep -c agent-source` returns 0 from `packages/cli` and 12 from
  `packages/compile`. I had been running the CLI-scoped command all session and reporting it as the
  gate, while `agent-source.ts` — where `renderAgent`, `COMPLETION_GATE_COMMAND`, the sanitisers and
  the provenance marker all live — sat outside it. **The canonical gate is `bun run test` from the
  repository root**, which is `turbo test`; its dry graph lists `@workspace/compile | test |
vitest run` explicitly, and it is green at 12/12 tasks. Second time a workspace-scoped command has
  been mistaken for the repository's gate — the first was `format:check` at pass 19 — and exactly
  the failure the standing rule names: **final gates are the unfiltered repo gate commands, never a
  subset.**
- **Dispatch 8, my caller census was too narrow to answer my own question.** I told the lane to
  settle the warn-versus-throw duplication from `compileAllAgentPlugins`. That caller alone gives
  the wrong answer for the skill side, because `compileSkillPlugin` has a second caller in the
  command layer with no `try`/`catch`, reaching the user through oclif's fatal handler instead. The
  conclusion held on both paths, for two different reasons. The rule that came out of the callers
  rather than a preference: **a warn beside a throw is duplication when every caller surfaces the
  throw, and is the only report when some caller degrades instead.**
- **Dispatch 8, the sibling was not shaped like the original.** `parseFrontmatter` has six
  production call sites and five skip rather than throw, so its internal `warn` is their only report
  and a discriminated result would have touched all six. The repair there was to delete the false
  claim and nothing else. The instruction not to assume the shape from the defect was load-bearing.

### Corrections from dispatch 1 — the ones that changed the design

- **`cc-contract`:** `stop_hook_active` is NOT in the documented Stop/SubagentStop contract. The
  brief asked about it; the docs do not carry it. Dropped from the design. **Corrected 2026-09-03 by the review's verifier reading the shipped binary: the SubagentStop input schema DOES carry `stop_hook_active`, and the Agent SDK reference types it. The lane's answer was true of the page it read and false of the contract. Filed as CLI-881.** Confirmed present and
  documented: `isolation`, `hooks`, `effort`, `skills`, `permissionMode`, `disallowedTools` on
  sub-agent frontmatter; exit 2 blocks a stop; unknown frontmatter keys are ignored.
- **`generated-claudemd`:** rule 1's "CLAUDE.md files" has no target — nothing in the product
  generates one. Also: of rule 3's four named dynamic placeholders (time, workspace path, version,
  user profile) only the **version** exists in generated model-facing text. The rule overstated the
  tree by three of four.
- **`compile-writepath` + `test-gates`:** relocating the provenance marker to the end of the file
  would break `uninstall`'s orphan sweep, whose contract includes the marker's POSITION. **This
  changed the design** — the marker was de-versioned in place instead, which is rule 3's own
  "replace dynamic placeholders with stable markers" and leaves the sweep untouched.
- **Synthesis:** two hazards no lane could see, both real and both fixed —
  `packages/cli/.claude-src/agents/_templates/` had drifted from `src/agents/_templates/` and
  **shadows it for any compile inside this repo**; and hook command strings, which render as an
  executable, reached frontmatter unsanitized.
- **Wrong in the packet:** `template-anatomy` concluded the maximum defensible cut was 72.1% and
  `compile-writepath` called 80% "arithmetically unreachable". Both assumed the report contract and
  the skill mechanics had to stay inline at full length. Measured after the rewrite: **82.9%**.

---

## What landed

**Template — `src/agents/_templates/agent.liquid`**

| Change                                                                                                                                                       | Rule |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `<core_principles>` + 5 methodology partials → one `<operating_principles>` partial                                                                          | 1, 2 |
| Static baseline 16,994 B (~4,248 tok) → 2,908 B (~727 tok) — **82.9%**, verified 15,426 B rendered → under a 4,000 B budgeted ceiling                        | 2    |
| Volatile skill block relocated into a trailing `<system-reminder>`; `<skill_activation_protocol>` kept as a nested tag so every existing reader still parses | 3    |
| Dead `## Standards and Conventions` heading and the two shouted closers deleted                                                                              | 1, 2 |
| `isolation:` and `hooks:` emitted; `SubagentStop` gate rendered automatically for any agent holding Write or Edit                                            | 4, 5 |
| Six methodology partials deleted, including `improvement-protocol.liquid`, which was rendered by nothing and taught the prohibitions this pass removes       | 1, 2 |

**Compile — `packages/compile/src/agent-source.ts`**

- Provenance marker de-versioned: `provenanceMarker()` and `stampProvenanceMarker(content)` take no
  version. The version reaches the template as `generatorVersion` and renders inside the trailing
  volatile block. `hasProvenanceMarker` still recognises markers past releases wrote.
- `COMPLETION_GATE_COMMAND` — the `SubagentStop` gate, inert without npm/`package.json`/the script,
  exit 2 on failure with the captured output on stderr.
- `sanitizeHooks` — hook event names, matchers, commands, scripts and prompts now pass the
  Liquid-injection boundary the rest of the definition already passed.

**Agents**

- `reviewer` — `Write` and `Edit` dropped. No `isolation` key: it was added during the programme and withdrawn by the worktree ruling above.
- `agent-summoner` and `skill-summoner` — `identity.md`, `critical-requirements.md` and
  `critical-reminders.md` rewritten. `playbook.md` and `output.md` are dispatch 2.

**Standards**

- `prompt-bible.md` — 1,983 → 1,172 lines (68,313 → 50,751 B). Technique #1 self-reminder loop
  replaced by deterministic completion gates; #3 emphatic repetition replaced by stating rules once;
  #11 "think" alternatives deleted as obsolete; canonical structure, ordering rationale, validation
  checklist, worked examples, troubleshooting and the model section rewritten to the new template.
- `skill-atomicity-bible.md` — the Content Standard's `<critical_reminders>` row no longer mandates
  a verbatim repeat, and the line budget now states the cost model that justifies the split.

**Tests**

- New: `agent-baseline-is-slim-and-positively-framed.test.ts` — a byte budget on the rendered
  baseline, a prohibition scan, a shouting scan, and the two cache orderings. All five watched fail
  before the rewrite.
- Updated: the shipped-section roster, the partial-render roster, `expectValidAgentMarkdown`, the
  `Required<AgentConfig>` field roster, and the provenance specs.

**Types and schemas:** `AgentIsolation`, `agentIsolationSchema`, both agent schemas, and
`reference/types/zod-schemas.md`.

---

## Gates, 2026-09-03 — final, run with nothing else writing

Every earlier gate table in this file was taken while lanes were live, and two lanes had their e2e
runs falsified by concurrent `dist/` rebuilds. This one was run after the last lane landed, alone.

| Gate                                                                   | Result                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **`bun run test`** (repo root, `turbo test`, 12 workspaces)            | **12/12** — CLI 227 files / 7,483 tests; compile 68; editor 512 + 1 xfail                         |
| **`bun run test:e2e --filter=agents-inc`** (the CI gate)               | **254/254 files, 940 passed**, 9 expected-fail, 3 todo                                            |
| `bun run typecheck` / `bun run lint` (repo root)                       | 10/10 each                                                                                        |
| `npx prettier --check "**/*.{ts,tsx,md}"` (repo root)                  | clean                                                                                             |
| `npx vitest run --project unit scripts/` (doc-binding checkers)        | 19 files / 424                                                                                    |
| `generate:{compile,matrix,schemas,types}:check` + `.claude-src` mirror | all match                                                                                         |
| Installed `~/.claude/agents/`                                          | 9 writing agents on `Stop` with typecheck only; 0 `SubagentStop`; 0 read-back; 0 `lint`; 0 `test` |

**Four gate holes were found in this programme, all one shape** — a command reported green while the
thing being checked was not in it: `format:check` scoped to one workspace (pass 19), `bun run test`
from `packages/cli` collecting nothing from `packages/compile` (pass 30), `test:e2e` run as four
chosen files instead of the CI command (the review), and — on the final run itself — a shell whose
cwd had drifted to `packages/cli`, so `bun run test` ran that package's `vitest` instead of turbo,
`cd packages/cli` failed, every grep for turbo's task lines matched nothing, and the command **exited
0 with every section blank**. The commands above are the repository's own, run from an absolute
root, with the raw output shown rather than a filtered summary — and that last clause is the fix for
the fourth hole: a gate whose output you cannot see is not a gate you ran.

---

## The owner's review of the work (2026-09-03, seven lanes, every "upheld" attacked)

Run at the owner's request after the correction "read the .ai-docs because you're getting a lot
wrong". **85 judgements: 46 violated, 22 upheld, 13 partially upheld; 5 blocking, 27 important, 27
minor. Three "upheld" verdicts were overturned on verification.** The synthesis step failed on an
API 529 and was re-run; the raw tally is the record until it lands.

**The five blocking findings were all documentation the session wrote contradicting the tree the
session built** — the gate key `SubagentStop` in the agent-summoner playbook and in a published
"verbatim" sample where the compiler emits `Stop`; `reviewer` named as the one agent carrying
`isolation` in two documents where zero agents do; and the compiled body's render order stated
backwards in two reference documents stamped `last_validated: 2026-09-03`. All five fixed the same
hour and verified against the template.

**The gate finding overturned an "upheld".** A review lane ran the four e2e specs the session had
touched and reported the gates green. The verifier ran the actual CI gate —
`bun run test:e2e --filter=agents-inc`, named in `.github/workflows/ci.yml` and `.husky/pre-push`
— and it exits 1. The regression is real and is the session's: `statedUsageFor` made the rendered
`usage` line depend on whether the matrix loaded in THAT pass carries the skill, so `install` writes
the stated guidance and a following `compile` misses the local skill and writes the fallback, and
every agent is rewritten. The old value was a pure function of the category and therefore
idempotent by accident. Three e2e specs that the session never touched are the red tests.

**This is the third gate hole of the session, and the same shape as the first two.** `format:check`
at pass 19, `bun run test` from `packages/cli` at pass 30, and now `test:e2e` run as four
hand-picked files instead of the CI command. Each time the tell was identical: the command was
green while the thing being changed was not in it.

### Ruling: the gate runs typecheck only (2026-09-03, two rulings)

Adding `test` to the completion gate was my call under bias-to-build — rule 5 named "tests" and
nothing recorded a reason to omit it. Measured here it doubled the gate (35.8 s → 69.5 s), and
Claude Code kills a command hook at 600 s and releases the agent with the output discarded, so a
project whose suite runs longer than that gets a gate that silently does nothing. The owner ruled
"remove test", then "running typescript makes sense, but not linting". The gate is typecheck alone —
a type error is the one failure a stopping agent must not report as done, where a lint finding is
the project's own judgement to gate on; a project that wants tests in its gate declares its
own `Stop` hook, which replaces the emitted one. CLI-871's ordering constraint flips accordingly:
the instruction to run tests survives in each agent's prompt, rewritten positively, because no gate
carries it.

### Corrections from dispatches 9–10

- **Dispatch 9: the reproduction I asked for does not exist, and that is the finding.** I briefed a
  hand-run compiling an agent whose `metadata.yaml` carries Liquid syntax in a hook's `type`.
  `agentHookActionSchema` enums that field and `loadAgentsFromDir` catches the parse error and skips
  the **whole file**, so the CLI compiles no such agent at all. The before/after had to be taken on
  `renderAgentFromCorpus`, the editor's browser preview path — which is the asymmetry
  `sanitizeExperimental`'s docblock argues from, now demonstrated rather than argued. The CLI's own
  compiled output is byte-identical across the fix (`0 rewritten, 1 unchanged`, empty diff).
- **Dispatch 10 scoped that claim, and my version of it was wrong in a way that would have caused
  the opposite error.** "The CLI cannot reach this defect" holds only for the six
  closed-vocabulary fields — `model`, `effort`, `permissionMode`, `isolation`,
  `experimental.cacheTtl`, `hooks.action.type`. `name`, `title`, `description` and `tools` are
  `z.string()` on the CLI side too and are reachable by **both** routes. Stated flatly, a future
  reader would have concluded the free-text sanitisation was browser-only and deleted it.
- **A third member of the "green because nothing ran" family.** After a `packages/compile` edit, a
  scoped `npx vitest run <file>` from `packages/cli` aborts on `assertDistIsFresh` — tsup inlines
  that package into `dist/` via `noExternal`, so a compile-side change stales the CLI's build even
  though nothing in `packages/cli/src` moved. **It aborts in the direction that looks like
  success**: zero tests collected reads as a pass on exit code alone. The root turbo task orders
  `^build` ahead of `test`, which is why it is clean.
- **A cache hit is not evidence a suite ran.** The root run reported `Cached: 8 cached, 12 total`,
  so dispatch 10 re-ran `npx turbo test --filter=@workspace/compile --force` and reported
  `Cached: 0 cached` beside the result. Worth copying whenever a green turbo run is the evidence for
  a claim about the tree in front of you.

### The e2e regression, traced read-only while the API was down

My briefs to the compile-idempotency lane said "trace it". Four 529 kills later, I traced it myself
from source and the result changes the brief from a hunt to a fix. `compile` renders agents against
`BUILT_IN_MATRIX`: its only matrix-seating call, `loadSkillsMatrixFromSource` inside
`refreshConfigTypes`, runs **after** `compileAgents`, while every other command goes through
`loadSource`, which seats the merged matrix first. `discoverAllSkills` finds the local skills for
compilation and never seats them. **The gap predates this programme** — the `not found in matrix`
warning in `resolveAgentConfigToSkills` is at `HEAD`, and was silent only because nothing rendered
depended on the matrix under `compile` until `usage` did. The trace is in the scratchpad's
`idempotency-trace.md`, one fact per line with the file that establishes it.

### Corrections from the idempotency landing

- **The fix broke a fixture whose premise it removed, and the lane filed it rather than patching it.**
  `warn-suppression-stops-at-the-harness.e2e.test.ts` writes a well-formed local skill to model
  "installed on disk but absent from the matrix", so the `not found in matrix` advisory fires and the
  spec can prove the harness passes warnings through. `compile` now seats locals before rendering, so
  a well-formed local skill is in the matrix and the advisory correctly stays silent. **A correct fix
  can falsify a test's premise without touching its assertion** — and the tell was that `hasSkill`
  and `statedUsageFor` read the same singleton, so the same seat that made one see local skills made
  the other see them too. Routed to a tester with the instruction to rebuild the fixture around a
  warning that still fires, not to weaken the assertion.
- **A latent loader quirk surfaced and was left alone, correctly.** A hand-written `config.ts` using
  the value-level `import { defineConfig } from "agents-inc/config"` fails against the built binary,
  because `CONFIG_EXPORTS_PATH` resolves relative to whichever bundled chunk holds it. No live path
  emits that import, so nothing catches it; not filed.

### Corrections from the review follow-up lanes

- **A test was patched to compile and silently stopped testing.** When `provenanceMarker()` lost its
  version argument, `preview-matches-install.e2e.test.ts`'s call site was changed to match and its
  unused `CORPUS_CLI_VERSION` import deleted — leaving a spec titled "stamp the version every
  compiled sub-agent carries" asserting a compile-time constant no version could fail. **A signature
  change that makes a call site compile is not the same as making it still test something**; the
  version now lives in the trailing block's `Compiled by` line, and that is what the spec checks.
- **The `check-finding-citations` failure was not a race, and I had reported it as one.** The
  e2e lane cited a finding from a spec — sanctioned by the checker's own message — and the checker's
  `SCOPE_POPULATIONS` pin still said `packages/cli/e2e` cites none. The flap to 25 failures WAS a
  lane mid-write; the steady 1 was the pin. Two different things wearing one symptom.
- **`experimental` was missing from three enumerations in `agent-system.md`, not one — and from the
  census grep meant to catch it.** A re-derive command that omits the field it is checking for
  cannot report that field missing. The same shape as my retired-forms grep earlier today.
- **A doc lane correctly declined to move `last_validated`** on a file it had only partly re-derived,
  even though the stamp already read today's date — because advancing it would claim sections it
  never opened. The bible's rule, applied against its own convenience.

### Two figures the review corrected, and one pointer deliberately not added

- **The roster-wide reduction is ~37.5%, not "up to 80%".** The 80% figure is the shared baseline
  alone — the template plus its one partial, which every agent inherits. Sixteen of eighteen agents'
  own files are byte-identical to `HEAD`, so a compiled `web-tester.md` is still most of its old
  size. Rule 2 as stated binds the whole prompt; the baseline cut is the half this programme owns,
  and CLI-871 is the other half. Both numbers belong in any report of the cut, and only the first
  was being quoted.
- **Progressive disclosure was done as deletion, not relocation, for the baseline — and that is
  deliberate.** The review proposes a one-line pointer in `operating-principles.liquid` to a
  standards file. It would dangle in every consuming project: `prompt-bible.md` ships with the
  repository, not the published package, which is exactly why both summoners qualify every such
  pointer with "where the working tree carries it". A baseline pointer cannot carry that qualifier
  for eighteen roles at once without becoming the branch it was meant to avoid. The retired depth
  is reachable through the summoners, which do carry pointers; the other sixteen gain theirs under
  CLI-871, per role, where the qualifier can be honest.

### Three tensions the review named, and where each decision fell

- **The gate cannot see a no-op edit, and the read-back sentence is being cut anyway.** The review
  reproduced it: `gate exit=0` on a `.ts` file whose edit never landed, because prior valid content
  typechecks and lints clean. So the read-back instruction and the gate are complementary on that one
  failure class, not substitutes — `prompt-bible.md`'s Technique #11 said so before it was retired.
  The cut stands on the owner's researched guidance that explicit verification instructions make
  Opus 5 over-verify, charged eighteen times per invocation; what survives in the baseline is the
  judgement half, "name what would catch a violation". The uncovered class is real and narrow: an
  edit that silently did not land on a file no build reads. It is named in Technique #11's
  replacement text as belonging to the role it affects, stated once, rather than to all eighteen.
- **The test-running prose is the only thing telling agents to run tests, and the gate does not.**
  Fourteen `(You MUST run tests…)` parentheticals and eight self-attestation rows across the
  unmigrated agents are exactly rule 1's micromanagement, and also the sole instruction to run tests.
  The gate briefly gained `test` and the owner reversed it the same day (a slow suite fails the hook
  open), so under CLI-871 that instruction survives per agent, rewritten positively — never deleted.
- **A narrowly scoped session against a broadly stated rule.** The programme scoped itself to the
  two summoners, the template and the standards; rule 1 is written about "generated system prompts",
  a set of eighteen. Every "upheld here, violated there" verdict in the review is that gap. The fix
  is not in this session's work — it is that a brief says "the two summoners" or "all agents" up
  front, so the scoreboard does not have to infer which was meant. Recorded so the next brief does.

## Review passes

The owner asked for five, continuing until a pass returns no changes needed. Each pass is five
independent read-only lenses — conformance, factual accuracy, coherence, completeness, adversarial
use — run against the tree as it then stands. **The verifier is never the fixer:** lenses report
with a quote and a proposed fix, and the orchestrator applies.

| Pass | Date       | Findings                                   | Verdict        |
| ---- | ---------- | ------------------------------------------ | -------------- |
| 1    | 2026-09-03 | 65 — 26 blocking, 25 important, 14 minor   | changes needed |
| 2    | 2026-09-03 | 50 — 7 blocking, 28 important, 15 minor    | changes needed |
| 3    | 2026-09-03 | 36 — 8 blocking, 13 important, 15 minor    | changes needed |
| 4    | 2026-09-03 | 33 — 5 blocking, 16 important, 12 minor    | changes needed |
| 5    | 2026-09-03 | 29 — 0 blocking, 15 important, 14 minor    | changes needed |
| 6    | 2026-09-03 | 28 — 4 blocking, 11 important, 13 minor    | changes needed |
| 7    | 2026-09-03 | 7 lenses' worth, 1 blocking                | changes needed |
| 8    | 2026-09-03 | 4 in the conformance lens, 1 blocking      | changes needed |
| 9    | 2026-09-03 | 5, none blocking — all in the two bibles   | changes needed |
| 10   | 2026-09-03 | 3, none blocking                           | changes needed |
| 11   | 2026-09-03 | 6 — 1 important, 5 minor, none blocking    | changes needed |
| 12   | 2026-09-03 | 24 — 13 important, 11 minor, none blocking | changes needed |
| 13   | 2026-09-03 | 8, none blocking — all in the two bibles   | changes needed |
| 14   | 2026-09-03 | 5 — 1 important, 4 minor, none blocking    | changes needed |
| 15   | 2026-09-03 | 4 — 1 important, 3 minor, none blocking    | changes needed |
| 16   | 2026-09-03 | 5 — all minor, none important or blocking  | changes needed |
| 17   | 2026-09-03 | 3 — the factual lens returned NOTHING      | changes needed |
| 18   | 2026-09-03 | 3 — factual lens empty a second time       | changes needed |
| 19   | 2026-09-03 | 4 — including a hole in my own gate list   | changes needed |
| 20   | 2026-09-03 | 6 — none blocking                          | changes needed |
| 21   | 2026-09-03 | 4 — 3 blocking, all self-inflicted         | changes needed |
| 22   | 2026-09-03 | 3 — 2 important, 1 minor, none blocking    | changes needed |
| 23   | 2026-09-03 | 3 — all minor                              | changes needed |
| 24   | 2026-09-03 | 58 — 6 blocking; first pass of 8 lenses    | changes needed |
| 25   | 2026-09-03 | 63 — 7 blocking                            | changes needed |
| 26   | 2026-09-03 | 4 — 1 blocking                             | changes needed |
| 27   | 2026-09-03 | 4 — 1 blocking                             | changes needed |
| 28   | 2026-09-03 | 3 — none blocking                          | changes needed |
| 29   | 2026-09-03 | 4 — none blocking                          | changes needed |
| 30   | 2026-09-03 | 49 — 5 blocking, 20 important, 24 minor    | changes needed |

### Pass 30 — a deletion I made in pass 29 broke the file it was tidying

The spike from 4 findings to 49 is one pass-29 edit and one lens finally reaching product code.

**Three of the five blocking findings are the same defect, and it was mine.** Pass 29 deleted
`skill-atomicity-bible.md`'s §9 "Examples: Before vs After" on the ground that its five worked
examples re-demonstrated §2's five violation categories. The deletion removed the section heading,
Example 1, and Example 2's `**Before (VIOLATION):**` label and opening fence — and stopped there.
Examples 2 through 5 survived. What that left was worse than either state: a live top-level
`## Integration Guide` section in the bible's own body, listing SCSS Modules, React Query, Zustand
and MSW as a stack. That is verbatim the shape the same document classes as
"Category 3: Integration Guides (HIGH Severity)" and that §6's gate requires removed, presented as
the document's own content — and `skill-summoner/playbook.md` sends an agent into this file calling
it authoritative. The bible's own §11 audit grep, run against the bible, returned the line.

The stray closing fence compounded it: with nothing opening it, it OPENED a block that swallowed the
`**After (ATOMIC):**` label and the whole corrected example, so the counter-example rendered as
guidance and the guidance rendered as code.

**This is the partial-edit class for the fifth time, and the first time it produced a defect worse
than the state it was fixing.** The four before it left something un-updated. This one left a
document asserting the opposite of its own rule. The deletion is now complete — 145 lines gone,
TOC intact at eleven sections, and the audit grep clean.

**The adversarial lens reached product code and found a shipped gap.** `agent.liquid` renders
`isolation:` and `experimental:` into a compiled agent's frontmatter — both added earlier in this
programme — while `agentFrontmatterValidationSchema` is `.strict()` and declares neither. Both
readers of compiled frontmatter parse through it, so `doctor` reports such an agent as invalid and
`compileAgentPlugin` throws. No shipped agent sets either key, which is why twenty-nine passes and
every gate stayed green. The same working-tree change had reached three of the four agent-shaped
schemas and missed the fourth.

**A second contradiction between a gate and the doctrine it enforces.** `agent-partials.test.ts`
asserts that every agent directory holds `critical-requirements.md` and `critical-reminders.md`,
and that every `critical-requirements.md` carries `<self_correction_triggers>` — while the compiler
reads both files with `readFileOptional`, the template guards both sections, the shipped playbook
tells authors they are optional, and Technique #7's Application now states there is no floor. An
agent authored by following the playbook reddens the suite.

### Passes 24–27 — what the three new lenses found

The spike at 24–25 is the new lenses coming online and reaching what twenty-three passes structurally
could not.

**Precedence answered the owner's question directly.** On the named candidate — pass 14 keeping the
`<self_correction_triggers>` blocks — the OUTCOME was right on the merits, but **both recorded
reasons were pure deference** ("the bible keeps Technique #7", "the roster gate requires it"). Worse,
the test written into Technique #7 by that same pass — "a trigger whose moment is already named
elsewhere earns nothing" — was never applied to the blocks it saved; two of `skill-summoner`'s four
failed it and are gone. One decision was wrong outright: **`skill-summoner`'s `description`, the
field the Task tool routes on, still said "technology-specific skills"** — the exact scoping the
skill-authoring ruling closed. Four of pass 24's six blocking findings were that one field.

**Bible fidelity found rule 5 was the weak cell.** Technique #1 was the only place it was taught and
it omitted the fact that decides everything: declaring `hooks:` REPLACES the emitted gate. An author
following it faithfully hand-writes a hooks block and silently loses their gate.

**Concision is paying where it is paid for.** `operating-principles.liquid` is 1,683 B from 1,764,
and that lands eighteen times. It also found `skill-summoner/playbook.md` stating one rationale twice
two paragraphs apart, inside the section whose own rule is "cut the clause that restates the one
before it" — the file breaking the rule it states.

**Two cross-document contradictions no single-file lens could see.** `prompt-bible.md` listed
`<integration>` as an optional SKILL.md tag while `skill-atomicity-bible.md` classes it Category 3;
and that bible modelled an Integration Guide as the CORRECTED output in three worked examples, which
its own §6 gate and §12 grep both reject. A skill written from its example failed its own check.

**And two defects this programme created.** Pass 25's concision cut to the partial stranded a fenced
"canonical wording" quote of it in `prompt-bible.md` — now a citation rather than a copy, which is
the rule `agent-summoner` already teaches. And 24 shouted ALL-CAPS words survived in the two bibles,
two of them mine, in the file that declares ALL-CAPS retired. **The gate cannot see those** — its
shouting pattern needs four consecutive capitalised words and its subject is the rendered baseline,
so single-word emphasis in a standard is outside its reach by design.

### Pass 22 — the branching addition duplicated itself

Asked to add the conditional-branching pattern, I put it in `skill-summoner`'s `output.md` skeleton
AND restored a near-verbatim clause in its `playbook.md` — 0.72 sentence overlap, against the
bible's own "`playbook.md` is the process; `output.md` is the shape emitted. Neither repeats the
other". The `output.md` copy survives, because it is the one fixing the exact bytes emitted.

The other important one: **Technique #10's Application was the one of eleven the rewrite left
unconditionalised.** Every sibling was rewritten to defer to the baseline or make its block
conditional; #10 still told authors to add a `<retrieval_strategy>` block prescribing a search
method a frontier model picks on its own — which §4's "leave the method open" bullet and §5's
Weight checklist both rule out, and which no shipped agent carries.

### Pass 21 — the partial-edit class, this time mine

Moving `output.md` below `<critical_reminders>` for recency took four edits and I made two: the
template and `compiler.test.ts`'s `SHIPPED_TEMPLATE_SECTIONS`. The two documents that describe the
same order were left saying the old one — **`prompt-bible.md` §2, introduced as "what
`agent.liquid` renders", and `agent-summoner/playbook.md`'s compiled-file map**, which is the map an
authoring agent works from. An agent following its own create workflow step 7 would have opened a
correctly-compiled file and reported the section order wrong.

That is the third time this programme has produced the same defect: a change applied where it was
noticed and not where it is also stated. It is the argument for the loop in its purest form, since
the change was made THIS turn and the pass caught it immediately.

**And one false clean.** §6's census carried a `packages/cli/` prefix while the document's own
header declares its commands run from `packages/cli` — so it wrote `No such file or directory` to
stderr, exited 2, and printed nothing on stdout. Empty output there reads as "all sixteen agents
migrated", contradicting the sentence four lines above it. This is the exact failure §8.6 of the
same document describes, and the third false clean this programme has found in its own work.

### Pass 19 — a hole in the verification, not just in the work

**`packages/compile/src/agent-source.ts` had been failing `prettier --check` since this programme
first edited it, and every gate run reported clean.** The reason is that the gate list said
"`bun run format:check` (packages/cli and root)" and only the first half was true: that script is
scoped to `packages/cli`, and the root's own formatting entry point is
`prettier --write "**/*.{ts,tsx}"` — a `--write`, with no `:check` twin. So the file this programme
changed most heavily outside `packages/cli` was covered by neither.

The gate table above now carries both commands, with the second marked as the one that was missing.
**A gate list is a claim about coverage, and this one overstated it for nineteen passes** — the same
defect class the loop kept finding in the prose, arriving in the verification instead.

The substantive finding: **`skill-summoner`'s mode-selection test listed only `.claude/skills/`**,
while its own `output.md` names three locations a skill lives in. Measured here, `.claude/skills/`
holds 1 entry and `~/.claude/skills/` holds 1, against 238 under `src/skills/` in the marketplace
repository — the very tree the Create workflow's step 2 points the agent at. So in the place almost
every real skill lives, the test reported "nothing covers this" for all 238 and routed every Improve
task into Create. Both presence tests now name all three.

### Pass 18 — a rule-4 contradiction in the block I wrote

**The shared baseline told every compiled agent to "repair the ones you safely can"** — including
`reviewer` and the four researchers, the five roles that exist to report rather than change
anything. It is rendered unconditionally into all eighteen, so one compiled prompt carried two
opposed instructions: the baseline saying repair, and `reviewer/critical-requirements.md` saying
"Flag the problem; developers fix it".

The hedge "safely can" did not close it. `reviewer`'s grant is `Read, Grep, Glob, Bash` — no `Write`
or `Edit`, but `Bash` can edit a file, which is the door the narrowed grant was meant to shut. So
the one instruction that could have undone rule 4's whole point was sitting in the block rule 2
added. Now: "list them with their locations, repairing them where repair is the task".

That is the sharpest lesson of the loop. **The baseline is where a rule reaches every agent, so it
is also where a wrong rule reaches every agent** — and it took eighteen passes for a lens to read it
against the roles that receive it rather than on its own terms.

The other two were shape divergences from the file `skill-summoner` calls authoritative: the
Content Standard table listed the table of contents after the patterns while its own worked example
puts it under the Quick Guide, and the emitted skeleton used `**Detailed resources:**` where the
bible and 170 of the 187 marketplace skills that carry the label use `**Detailed Resources:**` —
a skeleton's whole job being to fix the exact bytes emitted.

### Pass 17 — the first lens to find nothing

**The factual lens returned an empty findings array**, having checked all 44 path-like tokens in the
two summoners, every command, every schema field and enum, both known-stale names, and the relative
links. That is the first time any lens has come back with nothing.

The three conformance findings were all in the file this programme has edited most:

- **The only surviving shouted emphasis in either summoner was mine** — "read either for the SHAPE
  of a role. Take the VOICE from …" — in the agent the prompt bible names as a voice exemplar,
  contradicting a rule stated 123 lines lower in the same file. Worth recording: the baseline gate
  cannot see it. Its `SHOUTING` pattern needs four consecutive capitalised words and its subject is
  the rendered baseline, not an agent's own prose. **A gate's subject is part of its claim**, and
  per-agent prose is covered by the §6 census and CLI-871 rather than by that test.
- **A sentence duplicated byte-for-byte across `playbook.md` and `output.md`** — introduced by pass
  16's own fix, which moved the skeleton and left the closing line behind.
- **Step 4's paths were monorepo-only and unhedged**, while the same file hedges that exact concern
  twice elsewhere. A compiled `agent-summoner` runs in whatever project installed the CLI, where
  `packages/cli/src/agents/**` resolves to nothing — so rule 2's mechanism, depth arriving through a
  file the agent reads, delivered nothing at the step that matters most. Now names the compiled
  equivalents under `.claude/agents/` beside the working-tree paths.

### Pass 16 — the first pass with nothing above minor

The structural one was worth having: **`skill-summoner`'s Improve-mode deliverable shape lived in
`playbook.md`**, while its sibling `agent-summoner` carries the equivalent skeleton in `output.md`.
Two agents built to one convention, landing on opposite sides of it — and `identity.md` names that
deliverable as the mode's whole point while `output.md` had no section for it at all. Both
skeletons moved to `output.md`; the playbook now names the shape rather than reproducing it.

The other four were a counting slip ("an agent is a directory of six files … the other three are
optional" — the antecedent is four, and the file silently dropped is `metadata.yaml`, which is
required), one fact stated twice in one file, one stated in two files, and a bulleted list with a
single item introduced by a colon promising several.

### Pass 15 — what it caught

All four were partial-migration residue, and the important one shows why a sweep has to finish:
`prompt-bible.md`'s XML naming list still glossed `<critical_reminders>` as "(for rules at BOTTOM)",
while three other places in the same file — Technique #3's "What It Replaces", §3's Required Tags
block and §5's checklist — say the tag earns its place only by adding something the requirements
block did not state. Four statements, one un-migrated, and it was the shortest and most quotable of
the four. `agent-summoner` sends its agent to that file first.

The other three were the skill bible's Conclusion opener ("Skill atomicity is not optional" — force
from insistence, no action for the reader), its quality-gate header ("NOT complete until ALL boxes
are checked"), and a Compliance-workflow claim in `skill-summoner/playbook.md` stated four times
across three of its six files. In each case the rewrite had edited lines inside the same block and
read past the header — which is the signature the reviewers now recognise on sight.

### Pass 14 — where the loop needed judgement rather than obedience

**Two lenses recommended deleting the `<self_correction_triggers>` blocks from both summoners**, on
the ground that every trigger restates a rule the playbook already states. They were licensed to
say so by a sentence I added in pass 13: "a trigger restating a rule stated nearby earns nothing."

Applying that would have been wrong twice over. All eighteen agents carry the block, and
`agent-partials.test.ts` gates it — every `critical-requirements.md` must — so deleting it from two
of them reddens a roster gate. And `prompt-bible.md` keeps Technique #7 as a technique, so the
recommendation would have hollowed out a construct the same document prescribes.

The wording was the defect, not the blocks. **A trigger is not a duplicate of its workflow step, and
the difference is what earns it its bytes**: a workflow step says what to do at a point in the
process, and a trigger names the observable moment before a mistake and gives the action that
answers it. The workflow is read once at the start; the trigger is what gets re-read mid-task. So a
trigger whose moment is named elsewhere earns nothing, while one compressing a workflow step into
the instant it applies is the technique working. Technique #7 now says that.

Also fixed: the skill directory's location list was stated in two files and **had already
diverged** — `output.md` had lost the global-scope path the playbook carried. Consolidated into
`output.md`, which owns shape, with the missing path carried across. And the Conclusion's
"Validation Metrics" list was a second copy of §1's table figures, sitting directly under the
paragraph explaining that a second copy is what rotted last time.

### Pass 13 — what it caught

**The agent-source files came back mechanically clean** — zero prohibitions, zero
`**(You MUST ...)**` / `CRITICAL:` / `⚠️`, zero shouted runs, and every surviving inline example
fixing an output shape the agent emits. All eight findings were in the two standards documents,
and every one was the residue of a partial sweep: the diff shows `Do NOT use for` → `Leave to` and
`**DO NOT:**` → positive bullets, while eight sibling constructions in the same sections were left.

Three were defects this programme introduced rather than failed to remove:

- **A prescription that contradicts its own exemplar.** Technique #7's Application, added in pass 1,
  asks for "four to six triggers particular to the agent's domain" — and `agent-summoner`, which §6
  of the same file names as one of the two agents to copy phrasing from, ships three. Rule 2 favours
  the agent, so the floor was the wrong half; the count is gone.
- **An orphaned `**DO:**` label**, left heading the only list in §8.3 after pass 1 folded the
  `DO NOT:` list into it — a label naming a distinction the document no longer draws.
- **A grammar regression**: "at natural decision point", from pass 12 truncating a clause.

That is now four consecutive passes finding at least one defect created by an earlier pass's
correction. The rate is falling but it has not reached zero, which is the argument for the loop.

### Pass 12 — what it caught

**The one that mattered was a divergence between the two front doors.** `GeneratedAgentDefinition`
in `scripts/generate-matrix-package.ts` picks the metadata fields the editor's vendored copy
carries, and `isolation` was not among them — so `npx agents-inc compile` emitted
`isolation: worktree` for `reviewer` and the editor's output preview did not. Two renderers, one
configuration, different bytes; the repo has an e2e spec whose whole subject is that they agree.

The fix moved `AgentIsolation` out of `types/agents.ts` and into `types/matrix.ts`, beside
`ModelName`, `EffortLevel` and `PermissionMode` — because `matrix.ts` is the half the matrix package
vendors byte-for-byte, and a vocabulary type that a browser has to spell the same way belongs with
the vocabulary. `agents.ts` re-exports it rather than declaring a second copy. `effort` was missing
from the same Pick and went in with it.

`hooks` was deliberately left out: no agent declares it in metadata, the emitted completion gate
comes from the template rather than from a definition, and vendoring a type nothing sets would
invent a contract nobody asked for.

Also fixed: `prompt-bible.md` carried two freshness signals that disagreed (`**Date:** September
2026` in the body against `last_validated: 2026-04-21` in the frontmatter — the frontmatter is the
staleness signal, so the body line is gone), named three different model generations across one
technique, and its Technique #8 template closed with "Only proceed when you have sufficient
confidence in your current state" — a be-careful reminder of exactly the class §4 of the same file
now tells authors to drop. And `skill-atomicity-bible.md` required a "transformation log" that
exists in no repository — `grep -rn "transformation log"` returns only the file demanding it.

### Pass 11 — what it caught

One real defect and five duplications, all inside the two agents.

**The defect was mine and had a live consequence.** `skill-summoner/identity.md`'s hand-off table
had three of its four rows widened in this rewrite — research gained all four researchers,
implementation all four developers — and the tester row was carried through untouched at
`- Tests → cli-tester`. So the table routed test work for a web, api or ai skill to the CLI tester.
All four testers exist and the sibling agent's equivalent row already listed them.

That is the shape worth noticing: a partial edit is more dangerous than no edit, because the rows
around it look deliberate. The same class produced pass 7's `reference.md` label landing in one of
four places, and pass 5's guard dropped from one of two copies of a rule.

One finding is a good illustration of the bible's own case study coming true: a self-correction
trigger in `agent-summoner` — "Writing 'follow best practices' → replace it with the specific file"
— was copied near-verbatim from `prompt-bible.md` Technique #7's worked example, while that
technique's Application asks for triggers "particular to the agent's domain". The bible's §6 names
exactly this mechanism, a worked example supplying wording that then propagates. Replaced with one
particular to authoring agents.

### Pass 10 — what it caught

Three findings, none blocking, and **two of the three were duplication that this programme's own
earlier fixes introduced**:

- Pass 8 rewrote §8.2's git boilerplate to state both halves, but `prompt-bible.md` §8.6 still held
  up "Never run git commands that modify the staging area or working tree" as the model phrasing for
  a compiled agent — so the file prescribed the positive form in one section and the retired one in
  another. That wording is live in `tester/api-tester/critical-requirements.md`, which is one of the
  sixteen CLI-871 covers.
- Pass 1 folded §8.3's `DO NOT:` list into the `DO:` list above it, and the reframed bullet
  duplicated a bullet that list already carried. One rule, stated twice, introduced by the fix that
  removed the prohibition.

The lesson is worth stating because it recurs: **a fix is a change, and a change needs the same
review as the thing it replaced.** Three of the last four passes found a defect created by an
earlier pass's correction rather than surviving from the original.

### Pass 9 — what it caught

**No blocking findings, and the agent prompts themselves came back clean** — every remaining defect
was in the two standards documents rather than in anything an agent reads.

The finding worth keeping is about the gate rather than the text. **The prohibition scan was
case-sensitive, and every prohibition that survived nine passes of `prompt-bible.md` was spelled
`Do NOT` or `Do not`.** A scan keyed on `DO NOT` reported the file carrying the most residue as
clean — a gate that could not fail on the thing it existed to catch.

Making it blanket case-insensitive then over-fired on two legitimate lines: "a burden they never
agreed to" is description, and the generated-file notice "do not edit" is addressed to a human
opening the file rather than to the agent reading it. So the scan now matches by POSITION — a
prohibition counts where an imperative sits, at the start of a line, sentence, bullet or bold run —
with the shouted ALL-CAPS forms still caught anywhere, since case alone makes those directives.
Both directions are pinned by ten discrimination cases, six that must match and four that must not.

That is the same shape as the repo's own rule about assertion helpers: a matcher whose signature
overstates what it checks is worse than no matcher, because the rigour is assumed.

### Pass 8 — what it caught

Four defects where pass 7 found seven and pass 6 found nine. Two mattered:

- **A paragraph I added in pass 5 sat INSIDE the fenced `SKILL.md` skeleton.** "Name the concern,
  never the neighbour" is instruction to the authoring agent, and everything else inside that fence
  is literal output, so an agent following the skeleton would have emitted it as body prose into
  every generated skill — along with a citation of an internal `.ai-docs` bible that does not exist
  in the project the skill lands in. Moved outside the fence and reframed as the action.
- **`prompt-bible.md` §8.2's delegation boilerplate — the text it says to copy verbatim — carried
  "Do NOT run ANY git commands", which states one half of this repository's git rule and denies the
  other.** `CLAUDE.md` has said since 2026-08-09 that read-only git is allowed and that both halves
  must be stated when delegating. The concrete failure is sharp: `reviewer` now carries
  `isolation: worktree` precisely so it can read a diff in a tree of its own, and a delegation
  opening with that line forbids the `git diff` the isolation exists for. Both halves are now
  stated, at all three sites in the bible and at the matching line in `CLAUDE.md`.

Also fixed: `agent-summoner`'s playbook carried the bare count "the other sixteen", which this
repository's own briefing rule forbids — **a brief carries the command, not its result**. Replaced
with the census command.

### Pass 7 — what it caught

The findings are getting narrower, which is the loop converging rather than running out of subject.
Three worth recording:

- **The census command I wrote in pass 6 returned seventeen, not the sixteen the sentence above it
  claimed.** `agent-summoner/playbook.md` matches the pattern because it QUOTES the retired forms in
  prose. So the command a reader is given to check a claim contradicted the claim. Replaced with the
  recursive form carrying `--exclude-dir` for the two migrated agents, and re-run: sixteen.
- **`prompt-bible.md` Technique #6 still shipped a copy-ready "consider step-by-step inside
  `<thinking>` tags" snippet** — the residue of the `think` → `consider` substitution that §4 of the
  same file retires by name. It sat in a fenced block under a technique an author is told to apply,
  so the next agent authored from the bible would have pasted it in. Deleted.
- **My pass-6 correction to `reference.md`'s description landed in one of four places.** The
  directory tree, the emitted SKILL.md table of contents, and both copies in
  `skill-atomicity-bible.md` still called it the home of "decision frameworks" — directly against
  `SKILL.md` being the decision layer, and the TOC line ships into every generated skill. All four
  now say comparison tables, API lookup and migration notes.

The lesson the third one carries, and it is the same one pass 1 and pass 4 taught at other scales:
**a correction applied where it was found is not a correction applied.** Each of these needed the
grep across every file that states the same thing.

### Pass 6 — what it caught

**The finding that matters most in this whole programme, and it is about scope rather than a bug.**

`prompt-bible.md` §6 said "the eighteen agents under `src/agents/` are the worked examples, and they
are the ones that stay current", and `agent-summoner`'s create workflow named
`reviewer/reviewer/` and `developer/cli-developer/` as the agents to write with open. **Sixteen of
the eighteen have not been migrated to the new voice** — they still carry `**(You MUST ...)**`,
`→ STOP` checkpoints and `## CRITICAL` headings in their `critical-*.md` files:

```
grep -rlE '\*\*\(You MUST|→ STOP|## CRITICAL|⚠️' packages/cli/src/agents/*/*/*.md
```

So both documents were pointing an author at the retired style and calling it the reference. The
claim is now stated accurately — the two summoners are the voice, the other sixteen are current
about the product and stale about the phrasing — and the census command is given rather than a
count. **Migrating the sixteen is filed as CLI-701 rather than done here**, because the owner's task
named the two summoners and the template.

The other blocking findings were the same class as pass 4's primer: gates that would reintroduce
what the pass removed. `skill-atomicity-bible.md`'s quality-gate checklist still carried
"Critical reminders match critical requirements", satisfied by making a skill's reminders mirror its
requirements — the emphatic-repetition pattern the same file's own table had just retired. Deleted.
Its required-fields list also omitted `domain`, which the loader requires.

Two of my own claims were wrong: `reference.md` was described as holding "decision frameworks",
which is the opposite of what `SKILL.md` being the decision layer means; and the template's
"everything above this block is stable" overstates, because the frontmatter's `skills:` key is
per-project stack configuration and cannot move below the body.

### Pass 5 — what it caught

**No blocking findings, and rule 1 is clean.** The remaining defects were duplication and one
systematic error:

- **Every repo-relative path in both summoners was written as if the CLI were the repository root.**
  Since the 2026-08-04 monorepo merge it is not: `.ai-docs/` and `src/agents/` live under
  `packages/cli/`. So the first instruction `agent-summoner` executes — read the prompt bible —
  pointed at a path that does not resolve from the working directory a compiled agent runs in.
  Prefixed throughout. `bun run generate` had the same shape: there is no `generate` script in the
  root `package.json`, so the step now names the directory to run it from.
- **The create workflow contradicted itself and made a step unreachable**: step 2 sent every new
  agent to `.claude-src/agents/`, while step 6 said to regenerate the `AgentName` union — which is
  generated from `src/agents/` and therefore never sees an agent authored at step 2's destination.
  Step 2 is now a branch on which tree the agent belongs to.
- **`skill-atomicity-bible.md`'s "Full Audit Command" was broken shell** and failed silently in the
  direction that matters: `grep` takes the first non-option operand as the pattern and the rest as
  paths, so the nine-string form searched for the styling fragment alone and reported the other
  eight as missing files. Each fragment now carries its own `-e`; verified against a fixture where
  the broken form found nothing and the fixed form finds both planted violations.

Three claims were stale rather than wrong-in-kind and are now derived rather than stated: `doctor`
has no `Sources` row (it is `Marketplaces`), `src/skills/` is in the marketplace repository rather
than this one, and the "222 skills" count is replaced by the command that produces it.

### Pass 4 — what it caught

The adversarial lens rendered `agent.liquid` for eight data shapes — writer with dynamic skills,
read-only with isolation, preloaded-only, `disallowedTools`, own-hooks, empty tools and three
hostile ids — and parsed every emitted frontmatter with the repo's own `yaml` package. All valid.

The findings that mattered were about **authority chains and contradictions the earlier passes could
not see because they were one file further out**:

- **`skill-atomicity-bible.md` hands final authority to `skill-atomicity-primer.md`** — "when the
  primer and this bible disagree, the primer wins" — and the primer still mandated "emphatic
  repetition for critical rules (at top AND bottom)". So the document with the last word was still
  the pre-rewrite one. This is the same failure as pass 1's prompt-bible finding, one level further
  up, and it is the reason a rewrite has to follow the authority chain to its end.
- **`agent-summoner`'s `identity.md` and `metadata.yaml` still claimed skills as its domain**, while
  its playbook hands skill authoring to `skill-summoner` and its output format describes only agent
  shapes. The `description` field is what the Task tool routes on, so the contradiction was live.
- **My own skill template told every generated skill to name the sibling skill that owns an
  adjacent concern** — which is precisely the atomicity bible's Category 3 violation. Now it names
  the concern as a capability and never the neighbour.
- **The template stated the just-in-time rule twice in one compiled file** — once in
  `<operating_principles>` and again in `<skill_activation_protocol>`. Removed from the baseline,
  kept where the skills actually are.

Two claims of mine were simply wrong and are corrected: "everything below `tools` is optional"
(`model` and `effort` sit above it; the required set is `id`, `title`, `description`, `tools`), and
"the config's key order is a decision too" (the config writer canonicalises that order on emission,
so it follows from the catalogue rather than from how the entry was typed).

### Pass 3 — what it caught

**Rule 1 came back mechanically clean across all eighteen files**, and the adversarial lens rendered
every template branch through liquidjs and found no breakage. What remained was rule 2 — the
summoners restating themselves — plus three real contradictions:

- **`agent-summoner/output.md` carried a full skill-authoring shape that its own playbook hands to
  `skill-summoner`.** An agent reading both could not tell whether "write me a skill" was its work
  or a hand-off. Settled toward the hand-off, which is what two of the three files already said.
- **`isolation: worktree` was licensed for any read-only role**, which includes the four
  researchers. A researcher reads the working tree to answer a question about it, and a copy of that
  tree is the wrong thing to answer from. Narrowed to reviewing roles specifically.
- **The skill id template was written `{domain}-{category}-{technology}` in five files** while the
  paragraph beneath it explained that the middle segment is not the category —
  `web-state-zustand` carries `category: web-client-state`. Corrected to `{domain}-{group}-…`
  everywhere, including in `skill-atomicity-bible.md`.

The duplication findings were the bulk: `agent-summoner/critical-requirements.md` was four-fifths a
second statement of `identity.md` and `playbook.md`, and one of those copies had dropped the guard
that made it true in an installing project — a rule stated twice with only one copy correct, which
is the specific way duplication does damage rather than merely costing bytes.

### Pass 2 — what it caught

**The summoner files came back clean on rule 1.** Greps for prohibitions, `**(You MUST ...)**`,
`CRITICAL:`, `⚠️` and shouted runs returned nothing across all twelve markdown and Liquid files.
Every surviving rule-1 violation was in `prompt-bible.md`, in text it tells authors to put INTO
agent prompts — §3 still defined a required `<constraints>` tag as literally "[What NOT to do]",
and Technique #10's copy-ready snippet still opened with "Don't pre-load every potentially relevant
file". That is the shape this work keeps producing: the standard is the last place the old form
survives, and it is the place that reintroduces it.

One more shipped defect, and a latent one that had never fired:

- **The template's `description` was emitted as an unquoted YAML scalar.** A description containing
  a colon — legal per `agent.schema.json`, which constrains it only to a non-empty string — made
  the frontmatter unparseable. No bundled agent's description contains one, so nothing had shown
  it. Now `{{ agent.description | json }}`; verified round-tripping colons, quotes, `#` and `[`.
- **`.ai-docs/` is not in `package.json` `files`.** Both summoners opened with "read
  `prompt-bible.md` first" — an instruction that cannot be followed in a project that merely
  installed the CLI, which is where these agents mostly run. Reframed as conditional on the working
  tree, with the structure the agent actually needs kept in the prompt.
- **My own "closed enum" correction was wrong and would have disabled the agent's main mode.**
  `slug` and `category` are closed enums only for catalogue skills; `custom: true` switches
  validation to `customMetadataValidationSchema`, where both are free. Stating the enum without the
  escape hatch would have blocked every skill for a technology the catalogue does not carry.

Also settled: Compliance mode now names the documentation the user handed over rather than
`.ai-docs/` in three files that disagreed; the Context7 instruction is gone, because
`skill-summoner`'s `tools:` allowlist names no MCP tool and an instruction to use one it cannot
reach is worse than none; and the skill-authoring boundary between the two summoners is settled in
`skill-summoner`'s favour, which is what two of the three files already said.

### Pass 1 — what it caught

Two findings were defects in shipped code rather than in prose, and both made rules 4 and 5 inert:

- **`resolveAgents` and `loadAgentsFromDir` each build their result from an explicit field list**,
  and both dropped `effort`, `disallowedTools`, `permissionMode`, `isolation` and `hooks` between
  `metadata.yaml` and the template. So `isolation: worktree` on the reviewer never reached a
  compiled agent, and a hand-written `hooks` block never replaced the emitted gate. `effort` shows
  the shape best: `resolveAgents` reads `agentConfig.effort ?? definition.effort`, and
  `definition.effort` could never be anything but `undefined` — the fallback half of a documented
  two-source setting had no reachable value, and no bundled agent sets `effort`, so nothing showed
  it. Fixed at both layers, each with a roster test that fails on the next field to be dropped.
- **The template's `{% else %}` branch claimed skills were preloaded when an agent had none at all.**
  Split on `preloadedSkillIds.size`.

Prose defects worth recording because they are the shape this work keeps producing:

- **`prompt-bible.md` had been rewritten only in parts.** Techniques #2, #7 and #10, §3's two tag
  contracts, §8.3's `DO NOT:` block and the whole Conclusion still prescribed the forms the rewrite
  removed — and Technique #10's Application line instructed authors to append a "what to avoid (❌)"
  half to every constraint, which is exactly the rule being removed. Since `agent-summoner` is told
  to read the bible first, the next agent authored from it would have carried all of it back in.
  Technique #10 folded into #3; the Conclusion's "Key Principles to Remember" list deleted outright,
  because every item in it was byte-identical to its pre-rewrite form.
- **The authoring path lost a distinction the original files had.** A project's own agents are read
  from `.claude-src/agents/` by `loadProjectAgents`; `src/agents/` is only this CLI's bundled tree.
  The rewrite collapsed the two.
- **The rewrite lanes gave `skill-summoner` shell commands it cannot run** — it holds no `Bash`, by
  a deliberate grant. Rewritten as Glob and Grep operations rather than widening the grant.
- **Relative links were one directory short** in five places and resolved to nothing.
- **Both `critical-reminders.md` files restated their `critical-requirements.md` rule for rule**,
  and the re-read instruction was stated three to four times per agent while the template already
  renders it — duplication paid on every invocation, which is the rule-2 defect in miniature.

**One ruling was needed and is recorded:** `packages/cli/CLAUDE.md` carried `NEVER use git worktrees
(isolation: "worktree")`, naming the exact key rule 4 asks for. `todo/archive.md`'s 2026-08
concurrency row already carries the owner's ruling that "the correct fix is worktrees rather than a
rule about which trees tolerate it", and flags that line as the document that would have to change.
The bullet is now narrowed to permit it for a compiled **reviewing** agent only — `reviewer` is the
one agent that carries it — while still forbidding worktrees for a session's own dispatch. Widening
it past reviewing agents needs a fresh ruling.
| 3 | — | — | pending |
| 4 | — | — | pending |
| 5 | — | — | pending |

**Stop condition:** a pass that returns no changes needed. Passes continue to five regardless, and
beyond five if the fifth still returns changes.

**Stop condition:** a pass that returns no changes needed. Passes continue to five regardless, and
beyond five if the fifth still returns changes.

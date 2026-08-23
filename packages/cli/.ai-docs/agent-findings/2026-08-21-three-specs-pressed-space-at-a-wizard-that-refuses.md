---
type: anti-pattern
severity: high
affected_files:
  - e2e/pages/steps/build-step.ts
  - e2e/pages/retry-space.ts
  - e2e/pages/constants.ts
  - e2e/lifecycle/scope-change-deselect-integrity.e2e.test.ts
  - e2e/lifecycle/init-global-preselection-confirm.e2e.test.ts
  - e2e/lifecycle/agent-scope-toggle-agents-array.e2e.test.ts
  - src/cli/lib/__tests__/page-object-space-presses.test.ts
  - src/cli/lib/__tests__/helpers/source-call-sites.ts
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  Owner ruled 2026-08-21 to repoint the specs. All four call sites are settled. Two were repointed
  at skills the wizard genuinely toggles — `scope-change-deselect-integrity`
  test 1 now drops the project half of a persisted [P][G] pair on react, and
  `agent-scope-toggle-agents-array` Phase 3 now adds the fixture SPARE, which forced the write path
  for the first time and immediately exposed a missing `setAllLocal()` (see "What Repointing Found").
  One could NOT be repointed and was renamed instead: `init-global-preselection-confirm`'s deselect
  is unreachable for every skill, not merely the one it picked, because `toggleTechnology` refuses
  any globally-active skill at project scope. The fourth (`scope-change-deselect-integrity` test 3)
  deliberately KEEPS its hono refusal, which is now the suite's only exercise of
  ONLY_SKILL_IN_CATEGORY and sits beside a permitted deselect in the same file per CLAUDE.md
  § Test Assertions.
---

## What Was Wrong

`BuildStep.selectSkill` pressed Space and returned. It made no check that the press landed, which
is a defect from two directions at once — and the two are indistinguishable from outside, because a
skill that was never toggled and a skill that was toggled twice leave the same bytes on disk.

**The direction that was already known.** Ink registers a component's `useInput` handler in an
effect, so a keystroke arriving between the render commit and the effect flush is discarded with
nothing on any surface to say so. The build grid remounts on every domain change
(`CategoryGrid key={activeDomain}` in `step-build.tsx`), and `use-category-grid-input.ts` carries a
comment about it ending _"causing the first space press to be silently lost"_. Enter and Tab already
answer this with closed loops — `retryEnterUntil` and `BuildStep.advanceCategoryFocus` — and Space
did not.

**The direction nobody was looking in, which is what this finding is named for.** Closing the loop
made the harness assert, for the first time, that a Space press changed the cell it was aimed at.
Four call sites across three lifecycle specs immediately went red, and none of them was a dropped
keystroke: every one is a toggle the product REFUSES, toasting five times out of five while the
cell stays exactly as it was.

| Spec                                                                 | Skill         | The refusal, verbatim                                |
| -------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| `lifecycle/scope-change-deselect-integrity.e2e.test.ts` (both tests) | `E2E Hono`    | `Cannot deselect the only skill in this category`    |
| `lifecycle/init-global-preselection-confirm.e2e.test.ts`             | `E2E React`   | `Global skills cannot be changed from project scope` |
| `lifecycle/agent-scope-toggle-agents-array.e2e.test.ts`              | `E2E Zustand` | `Global skills cannot be changed from project scope` |

Each spec then asserted an end state that a refused keystroke produces for free:

- The two `scope-change-deselect-integrity` tests are named "deselecting a project-scoped skill
  should not remove it from global config" and "deselecting project skill should preserve global
  config skills array". No deselect happens. `api-framework-hono` is the only skill the matrix gives
  the required exclusive `API Framework` category, so `toggleTechnology` declines it — the scenario
  the names describe is **unreachable at that category**, not merely untested. Both tests then
  assert that the global config is unchanged, which is what "the wizard did nothing" looks like.
- `init-global-preselection-confirm` deselects a globally-installed React during a project edit and
  asserts React reaches the confirm step as one unchanged Global row. Its comment explains that a
  deselected global preselection means _"do not add to the project"_. The product does not
  reinterpret the keystroke that way — it refuses it — so the row is unchanged because nothing was
  ever attempted.
- `agent-scope-toggle-agents-array` Phase 3 says in its own comment that it adds a skill "to force a
  write path execution", and picks `web-state-zustand` "because it is present in the E2E source and
  not in the initial stack". `createDualScopeEnv` installs it at global scope, so the add is refused
  and no write is forced. Phase 4's whole subject is whether a merge defect **amplifies** across
  edit cycles, and it has been reading a config the second edit never rewrote — the
  `standards/e2e/README.md` "Prove the code path fired" rule, failing in the exact shape that rule
  describes.

`ONLY_SKILL_IN_CATEGORY` had no `STEP_TEXT` member at all, so no spec in the suite had ever asserted
that refusal. It has one now.

## Fix Applied

**The harness.** `BuildStep.selectSkill` is closed-loop: it reads the target cell's rendered text,
presses Space, polls for the cell to render something else, and re-presses one that never lands —
bounded by `INTERNAL_RETRIES.MAX_ATTEMPTS`, and reporting the cell and its unchanged text on
exhaustion. The loop lives in `e2e/pages/retry-space.ts` beside `retry-enter.ts`.

**What made the retry safe, which is the whole design.** Enter and Tab are monotonic — "did the next
step paint", "did focus move" — so a re-press cannot un-answer them. Space toggles, so the same loop
written the same way converts a dropped keystroke into a double keystroke, which is strictly worse
than the bug. Three properties keep it safe, and each has a test:

1. The confirmation observes the TARGET STATE of a NAMED subject — one cell's own rendered text,
   matched on the exact label — never "did the frame change". `selectSkill` is the only Space press
   in the framework that knows which skill it means, and it is the only one that got the loop.
2. The target is computed ONCE from the pre-press reading and held. The loop exits on having
   OBSERVED it, so whatever was swallowed or doubled on the way, the cell it leaves behind is the one
   the caller asked for.
3. From the second press on — and only then, because the first press has nothing in flight behind
   it — the confirmation re-reads after `INTERNAL_DELAYS.KEYSTROKE` and answers a cell that came
   straight back with another press. This is the one bounded margin in the design, and it waits on
   the single thing no surface can show: a press already written whose effect has not arrived.

`BuildStep.toggleFocusedSkill` was deliberately NOT given the loop, and says so at length. It cannot
name its subject — under `NO_COLOR` the focused cell has no text signal — and, decisively, a landed
press there does not always change anything: callers press Space on a global-locked row precisely to
assert it is inert.

**The specs.** The four refusing call sites now use `selectSkillAwaiting`, which anchors on the
refusal toast in raw output after a pre-press cursor. Each carries a `KNOWN GAP` comment naming what
the press really does and pointing here. Nothing was weakened: the previously-silent no-op is now a
pinned assertion, and every end-state assertion those specs already made is unchanged.

**The gate.** `src/cli/lib/__tests__/page-object-space-presses.test.ts` rosters every Space press in
`e2e/pages/**`, each with its posture and the reason for it, and separately requires that
`this.session.space()` is written from `BaseStep.pressSpace` and nowhere else. A new step-page-object
method that presses Space fails until it is given a confirmation or written into the roster with the
reason it cannot have one. It reads its call sites through `callSiteOwners`, added to the existing
`__tests__/helpers/source-call-sites.ts` beside `callSiteLines`.

Mutation-checked throughout, and every claim below was watched:

| Mutation                                                              | What went red                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `selectSkill` reverted to its open-loop shape, with the press removed | the badge assertion — a lost press is invisible without the loop |
| the loop's first press suppressed on a real PTY                       | nothing: the retry recovered it and still spent one real press   |
| every press suppressed                                                | the exhaustion report, naming the cell and its unchanged text    |
| a blind extra press added to the loop                                 | the press-count assertion, at three Spaces for one toggle        |
| the confirmation made blind to a landed press                         | the same, for the same reason                                    |
| a new unrostered method pressing Space                                | the gate, with the message telling the author what to do         |
| a page object reaching past `BaseStep.pressSpace`                     | the second gate                                                  |

## Proposed Standard

Two rules, both for `.ai-docs/standards/e2e/`.

**1. A retry is only as safe as the key's monotonicity, and this belongs in
`page-objects.md` beside the closed-loop navigation section.** "Confirm the press and re-press if it
did not land" is correct for Enter and Tab and dangerous for Space. The distinction to write down is
not about the key but about the observable: a monotonic key may be confirmed by asking whether
SOMETHING happened, a toggle must be confirmed against the target state of a named subject, and a
page-object method with no subject to name cannot be closed-loop at all and should say so rather than
approximate one. `page-objects.md` has been updated with this; the paragraph is the proposal.

**2. A page-object method that sends a key must say how it knows the press landed — held by a gate,
not by review.** The keypress rule in `page-objects.md` already demands `waitForWizardFooter()`
BEFORE every press, which closes the race the framework knew about; nothing demanded anything AFTER
one. The roster is the enforcement, and it is deliberately a table of postures rather than a ban:
five of the eight Space presses in the layer are legitimately open-loop today, and two of those five
(`AgentsStep.toggleAgent`, `DomainStep.toggleDomain`) are closeable — the agents and domain LISTS
render `[✓]` checkboxes, so unlike the build grid they have a text-observable selected state.
`DomainStep.deselectAll` already reads that marker before deciding to press. Closing those two is a
separate change with its own call-site sweep and is NOT done here.

**Open, and needing an owner ruling rather than a patch:** the three specs above are green over a
keystroke the product declines. Two of them are named for a deselect that the exclusive-category
guard makes unreachable, and one has a phase that does not do the thing its comment says it exists to
do. Repointing them at a skill the fixture leaves absent would change what they cover and could
redden the merge-corruption assertions they were written for, which is a discovery to make
deliberately rather than as a side effect of a harness change.

## What Repointing Found

Both repointed specs failed on the first run, and neither failure was the assertion that was
repointed — which is the whole argument for the "Prove the code path fired" rule they were
violating.

**`agent-scope-toggle-agents-array`, Scenario B Phase 3.** Selecting the spare made the second edit
write for the first time, and the write immediately hard-errored:

```
Cannot install or uninstall plugin skills: marketplace could not be resolved from
'/tmp/ai-e2e-.../fixture'. Plugin install mode requires a marketplace — fix the marketplace
or switch the affected skills to eject mode.
```

Not a product defect and not a weakening: `createE2ESource` writes no marketplace manifest (that is
`createE2EPluginSource`'s job), so a freshly added skill left on its default plugin origin is an
install the CLI correctly refuses and correctly explains. Every one of the six phases in
`dual-scope-helpers.ts` calls `sources.setAllLocal()` for exactly this reason, and
`edit-curates-a-freshly-installed-stack.e2e.test.ts` states it at its own call. This phase got away
without it for as long as it added nothing. The phase now sets its sources local, and the added
skill is asserted present in the written config — the proof-of-execution the phase never had.

**`init-global-preselection-confirm`'s new control.** The added skill reaches confirm under
**Global**, not Project: an edit opened over a global installation adds at global scope unless the
user presses `s`. The expected value was corrected to the observed one, which makes the control
sharper than intended — both rows now sit in the same scope band, so the assertion isolates the
diff MARKER rather than the scope beside it.

## The Class, and Whether It Is Mechanisable

The class is "a spec whose subject the product refuses". Asked whether a spec that presses a key
and asserts no state change should be required to also assert WHY, the honest answer is **partly**,
and the mechanisable part is already built:

- **What IS mechanisable, and is:** `BuildStep.selectSkill` is closed-loop, so a Space press that
  does not land now throws rather than passing. That is what turned this class from invisible into
  four immediate reds. Any page-object method that can name its subject should be closed-loop, and
  `src/cli/lib/__tests__/page-object-space-presses.test.ts` is the gate that keeps new ones honest.
- **What is NOT:** requiring a no-change assertion to also name a cause cannot be checked from the
  syntax. A test asserting "the config is unchanged" is correct and complete when the guarantee IS
  no change (the whole "must not touch" class), and indistinguishable at the source level from one
  whose subject was silently refused. The two differ only in whether the operation was ATTEMPTED
  and declined, which no scan of the assertion can see.

So the rule that generalises is not about assertions but about page objects, and it is the one this
finding already proposed: **a method that sends a key says how it knows the press landed.** Where
it can name a subject, the closed loop makes the refusal a failure. Where it cannot, the spec's
author has to, and the pairing rule in CLAUDE.md § Test Assertions — a refusal pinned in the same
file as a permitted case — is the review-time backstop. Both of the files repointed here now
satisfy it; `global-skill-toggle-guard.e2e.test.ts` and `global-agent-toggle-guard.e2e.test.ts`
remain all-refusal and are still the open worklist that rule names.

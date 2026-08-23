# Open rulings — parked by the accuracy programme, 2026-08-19

> **ALL TWELVE RULED 2026-08-20.** The owner took them in one pass. Each ruling is recorded in its
> own section below under **RULING**. The sections are otherwise left as written, because each
> carries the evidence the decision was made against, and deleting that would leave the decision
> unexplained.
>
> **Twelve sections, eleven distinct decisions** — two pairs turned out to be the same question
> asked from opposite sides: § 3 is CLI-538 in `cli.md`, and § 5 is CLI-590.
>
> **A ruling is not the work.** This file is the decision record; the implementation each one
> triggers lands against its `cli.md` row.

Twelve findings whose remaining work is a **decision**, not an implementation. Each was verified
against source: the mechanical half has landed in every case, and what survives is a question only
the owner can settle. They are parked rather than closed because the finding files are still on disk
and still describe live behaviour.

**Read the finding before ruling** — each names its own options, and several say outright that the
change cannot be taken unilaterally.

## 1. `2026-04-22-error-swallowing-systemic-gap`

**RULING (owner, 2026-08-20): NOT hard errors — add a completed-with-failures exit path instead.**

Two of the three sites this finding names were already stale when the ruling was made, and that was
verified before deciding: the `Could not update config` site in `edit.tsx` ALREADY hard-errors with
`EXIT_CODES.ERROR`, and `mode-migrator.ts` already has the ordering discipline right (it throws
before deleting anything when the marketplace cannot resolve, and installs each plugin before
deleting its ejected copy).

So only `Agent recompilation failed` survived, and hard-erroring it was rejected on the reasoning
that by the time it fires the config write has already succeeded — recompile is the last step, so
there is nothing left to continue TO. A hard error would relabel a state already committed to disk
rather than prevent it, and the message already names the recovery (`agents-inc compile`).

**The real defect is the exit code.** `this.warn` leaves it at 0, so `agents-inc edit` in a script
or in CI reports SUCCESS while the compiled agents on disk are stale — and that is true of roughly
seven of the thirteen `this.warn` sites in `edit.tsx`, not just this one. The command should finish
its work, print what failed and how to recover, and exit non-zero.

Three of the four warn-and-continue sites are still live, but turning them into hard errors
changes shipped failure behaviour across `edit`, migration and compilation, and amending CLAUDE.md
§ Data Integrity to say which failures are fatal is the owner's call.

**Evidence.** edit.tsx still `this.warn(\`Could not update config: …\`)`and continues; :1352 still warns on`Agent recompilation failed`; mode-migrator.ts/148 still `warnings.push(...)`with the caller only
logging. CLAUDE.md still carries only the plugin-install hard-error rule, and no "Error Handling
Boundaries" section exists anywhere. The one bullet the finding flagged as needing a decision has
since been answered on its own:`propagateGlobalChangesToProjects`(moved to
src/cli/lib/config-gate/propagate.ts) now returns`{ updated, skipped }`and`edit`renders it via`reportPropagatedRecompile`.

## Whether an aborted wizard session must pin `EXIT_CODES.CANCELLED`

**RULING (owner, 2026-08-20): yes — asserted once in the funnel, not at 37 call sites.**

Census re-measured on the day: **37** `abortAndDestroy` sites, not the fourteen the finding claimed.
Only 5 capture the exit code at all, and only 2 assert `CANCELLED` — the other 3 settle for
`not.toBe(SUCCESS)`, and the remaining 32 discard the value.

`abortAndDestroy` already RETURNS the code, so the assertion goes inside it rather than at the call
sites. Accepted knowingly: this lands with a suite run attached rather than as a one-liner, because
no one had ever checked the other paths.

> **The ruling said "the single funnel". That was wrong, and the error was load-bearing.**
> Corrected on execution 2026-08-20: `EditWizard` and `InitWizard` are **separate classes sharing no
> base**, and each carries its own byte-identical `abortAndDestroy`. The prescribed one-file edit
> would have left **every `InitWizard` abort exactly as unchecked as before, while the site count
> read as complete** — the "reads as coverage, provides none" shape, authored into the brief itself.
> Both are now wired.
>
> **The funnel is also not total.** `init-wizard-navigation.e2e.test.ts` aborts via Escape
> (`stack.cancel()` plus a bare `waitForExit()`) and never enters `abortAndDestroy`. It is an
> aborted session by this ruling's own meaning. `.cancel()` has exactly one call site, so the bypass
> is narrow — and narrowness is what hid it. Pinned at the call site.
>
> **Census corrected: 35 call sites, not 37** — the raw grep count includes the two definitions.
>
> **Result: no path failed.** The assertion message appears zero times across a full-suite run, and
> mutating the Escape path printed `expected 4 to be 1`. The product sets `CANCELLED` everywhere;
> nothing was weakened to get green.
>
> **The three weak `not.toBe(SUCCESS)` assertions were REMOVED, not tightened** — with the funnel
> asserting first, a tightened duplicate can never redden, which is the same defect one level down.

The finding this came from has been deleted — both E2E rules it called pending have since landed, and
its subject is closed. What survives is the one question it handed to the owner and nothing else:
**must every aborted wizard session assert `EXIT_CODES.CANCELLED`, across the fourteen `abortAndDestroy` sites?** Today they assert the state, not the code.

## 2. `2026-08-06-relevance-rule-leaves-custom-source-skills-on-no-agent-stack`

**RULING (owner, 2026-08-20): custom marketplaces author their own stacks, exactly as this one
does — and they inherit the taxonomy, so no new mechanism is needed.**

The premise the question rested on was checked and turned out to be narrower than it read.
`source-loader.ts` builds the matrix as `{ ...defaultCategories, ...sourceCategories }`: the CLI's
taxonomy is the BASE and a custom marketplace's `config/skill-categories.ts` merges on top. A
marketplace shipping no categories file inherits the whole default taxonomy.

So `resolveAssignment` already works for free for any custom-marketplace skill sitting in a KNOWN
category — the existing assignment logic is reused rather than replaced. The only residual is a
genuinely NEW category a marketplace invents, which must declare its own `domain`; `doctor` already
catches the omission as `category-missing-domain`. **Nothing to build.**

The behaviour is unchanged and is the ruling as specified; what remains is the deferred CLI-406
question the finding was filed for — whether a custom source's own matrix domain can stand in for
catalog relevance, or whether custom sources must author stack YAML.

**Evidence.** config-generator.ts still answers targeting through `resolveAssignment(taxonomyOrIdOf(...))` from
@workspace/matrix, and the pin survives under a renamed title — config-generator.test.ts "assigns
a skill whose category names no domain to no agent". The interim doc sentence the finding asked
for is absent: reference/features/configuration.md states nothing about non-catalog skills joining
stacks only through explicit assignment.

## 3. `2026-08-18-config-docs-named-nine-symbols-the-source-does-not-have`

**RULING (owner, 2026-08-20): a project owns its own domains — so the CODE is right and the
COMMENT was wrong.** Same decision as CLI-538 in `cli.md`, which is this question from the other
side.

`splitConfigByScope` copies `selectedDomains` onto both partitions and always has. The doc comment
claiming the project half was cleared is deleted, the inline comment now records the ruling, and the
global literal's conditional re-set — a no-op over its own spread, which only read as meaningful
because the comment claimed a clearing — is deleted with it.

The field had **zero test coverage**, which is exactly why the comment could contradict the code
unnoticed: both project writers recompute it before writing, so no emitted config could tell the two
stories apart. A test now pins both partitions.

The documentation half landed and the `unwrap` widening has since landed too, but the code-side
item the `partial_note` calls blocking is untouched and still needs the owner to say which side is
right: `splitConfigByScope`'s doc comment claims the project partition clears `selectedDomains`
and the body keeps it.

**Evidence.** src/cli/lib/configuration/config-generator.ts doc comment "its own key is cleared rather than
duplicated" plus the inline "Project config inherits domains from global at runtime, so it gets
none" — while the project literal at :691-697 is `{ ...config, name, agents, skills, stack }`, so
the spread's `selectedDomains` survives, and the global literal's `...(config.selectedDomains !==
undefined && …)` (:689) is a no-op over the same spread. Proposal 1 is done:
scripts/check-enumeration-drift.ts now reads `ts.isAsExpression(expression) ||
ts.isSatisfiesExpression(expression)`. The two bible proposals remain unwritten.

## 4. `2026-08-16-a-repointed-copy-pin-kept-its-withdrawn-name`

**RULING (owner, 2026-08-20): rename the heading to Marketplace. No written rule, for now.**

The owner considered and overrode the argument for keeping it — that `describe("stored source
resolution")` names a real internal symbol, `resolveSource({ caller: "stored" })`, which genuinely
still exists under that name.

The finding's SECOND half — a standard saying a rename must sweep test names, describe headings and
assertion messages, and that you grep for the NEW value afterwards — was explicitly declined for
now. Do not add it to `clean-code-standards.md` or `standards/e2e/README.md`. The census of surviving
stale vocabulary is still worth having; the rule is not wanted yet.

Every copy pin and the constant rename landed; the one item left is the `describe("stored source
resolution")` heading, which the finding itself defers to the owner — and it may well be correct,
since it names a real internal path rather than withdrawn user copy.

**Evidence.** e2e/commands/compile.e2e.test.ts now assert 'Marketplace: global' / 'Marketplace:
project'; e2e/lifecycle/init-edit-error-guards.e2e.test.ts and
refusal-lands-before-the-spinner.e2e.test.ts both read `LOCAL_MARKETPLACE_NOT_FOUND`, and
`LOCAL_SOURCE_NOT_FOUND` has zero hits in e2e/. The heading survives at compile.e2e.test.ts, and
`resolveSource({ caller: "stored" })` is a genuine symbol (source-loader.ts). Secondary: the two
proposed rules (grep the NEW value after a rename; test names, describe headings and assertion
messages are part of a rename) are in neither clean-code-standards.md nor standards/e2e/README.md.

## 5. `2026-08-18-the-task-id-ban-exempts-findings-but-never-rules-on-agent-suggestions`

**RULING (owner, 2026-08-20): `agent-suggestions/` is exempt, consistently with
`agent-findings/`.** Same decision as CLI-590 in `cli.md`.

Both halves land together — the prose exemption clause in `documentation-bible.md` rule 3 AND
`--exclude-dir=agent-suggestions` in its census grep. The earlier pass was right to refuse to add
the grep exclusion alone: widening an exemption through a command rather than a ruling is worse than
leaving the question visible. Now that the ruling exists, the command may follow it.

Nothing can move until the owner rules whether agent-suggestions/ is exempt from the task-ID ban
like agent-findings/, and whether ID-bearing section headings are in scope (which drags in-repo
anchor links with it).

**Evidence.** documentation-bible.md rule 3's exemption clause at :53 names only 'agent-findings/, whose
filenames and frontmatter are dated evidence by design', and its census command at :64 excludes
`--exclude-dir=agent-findings --exclude=documentation-bible.md`. The string 'agent-suggestions'
has zero hits in documentation-bible.md, so the directory is in scope by omission rather than by
decision — while .ai-docs/agent-suggestions/2026-07-30-identity-key-helper-export-exception.md
uses task IDs as its subject.

## 6. `2026-07-09-marketplace-schema-name-laxer-than-claude-code`

**RULING (owner, 2026-08-20): piggyback on Claude Code — tighten the load side to match.**

The rule, already enforced on the EMIT side by `marketplaceNameNotPublishable`, is kebab-case:
lowercase letters, numbers and hyphens, starting with a letter. `KEBAB_CASE_PATTERN` in `consts.ts`
holds it and is already imported into `schemas.ts`, so the change is one line on
`marketplaceSchema.name`.

**Consequence accepted knowingly:** a third-party marketplace whose name is not kebab-case will now
fail to LOAD where it previously loaded. That is the intent — if a marketplace has to register with
Claude Code, the CLI has no business accepting names Claude Code will reject. The refusal must be
legible rather than a raw regex message.

Only the schema half is left, and the finding itself records why it cannot be taken unilaterally:
tightening `marketplaceSchema.name` changes what third-party marketplaces LOAD, not only what this
CLI emits.

**Evidence.** src/cli/lib/schemas.ts is still `name: z.string().min(1)`; the command half did land —
`loadMarketplaceIdentity` (commands/build/marketplace.ts) refuses via
`marketplaceNameNotPublishable` (utils/messages.ts). Blast radius of the remaining change is a
load-time behaviour decision, i.e. the owner's.

## 7. `2026-07-29-qa-sweep-working-tree-v0144`

**RULING (owner, 2026-08-20): the advisory model is CORRECT and stays. D-269 is closed, not
pending.**

Of the three options the finding named — strict-block / warn-but-allow-with-visible-labels / fixed
F-filter — the second is both the current behaviour and the decision. Traced end to end before
ruling: `advisoryStateFrom` returns incompatible/discouraged/normal; `category-grid.tsx` renders
`(incompatible)` as a LABEL; the navigation hooks contain zero references to incompatibility so
nothing skips or blocks a gated skill; there is NO dependency cascade (deselecting React does not
deselect Next.js); `validateSelection` produces `missingRequirement` errors which
`reportValidationErrors` prints via `this.warn` in BOTH `init` and `edit`; and it installs.

**A stale claim was corrected in the same pass.** This finding asserts "the edit grid makes
requires-gated skills unreachable via navigation". That described the "Filter incompatible" feature,
which **no longer exists** — it is WITHDRAWN, not flag-gated. `FEATURE_FLAGS` has **zero hits
anywhere under `src/`**; the module was deleted in `95738763`. `hotkeys.ts` binds nothing to `f`, and
`e2e/interactive/edit-wizard-navigation.e2e.test.ts` pins the key inert.

**Correcting the correction, because the first version of this ruling had it wrong too:** it was
first written here as "gated off behind `FEATURE_FLAGS.FILTER_INCOMPATIBLE`", which reads as a
feature that could be switched back on. It cannot — there is nothing to switch. The only surviving
mention of that constant is a stale comment on `BUILD_FOOTER` in `e2e/pages/constants.ts`, which is
tracked as part of CLI-599.

Not in scope and not ruled on: the marketplace-content tidy-up in the same finding (45 skills with
over-60-character `cliDescription`), which is the skills repository's, not this one's.

Every confirmed defect in this sweep has landed; what survives is the requires-enforcement model,
which the finding itself flags as a pending product decision, plus marketplace-repo content that
is not this repository.

**Evidence.** Issue 2 fixed and pinned — compile.ts calls `reconcileTypesFromDisk` and reports
`report.propagated.skipped`, with
e2e/lifecycle/compile-at-home-propagates-global-hand-edit.e2e.test.ts. Of the STILL-OPEN list:
`api-email` and `shared-monorepo` are now `exclusive: false` (default-categories.ts, :679),
`api-framework` no longer exists so only one "API Framework" header remains, and the init/edit
asymmetry is gone (both init.tsx and edit.tsx call `reportValidationErrors`). D-269 is still
owner-pending and already tracked at todo/cli.md.

## 8. `2026-07-31-column-geometry-snapshots-regenerated-never-verified`

**RULING (owner, 2026-08-20): yes, and take the FULL DERIVATION — not the cheap trigger.**

The owner's words were that this should have been obvious: if layout snapshots are being generated,
they need to actually be verified.

**The evidence below is STALE and the ruling was smaller than it looks.** Checked on execution
2026-08-20: rule 6.17a **already** carried the verification obligation — a paragraph beginning _"A
snapshot regenerated with `-u` is a proposal, not a verification, and 6.17a is not satisfied by
one"_, already requiring column starts be derived from the width constants, and already naming
`SKILL_NAME_WIDTH`, `INSTALL_MODE_COL_WIDTH` and `SCOPE_COL_WIDTH`. So committing `-u` output was
**not** compliant, contrary to what the section below says.

What actually remained was the **escape hatch in the rule's final sentence**, which still offered
the cheaper leading-whitespace trigger as an alternative. The ruling removes that escape hatch and
states why the proxy is insufficient and what the full derivation costs. That is the whole diff.

Rule 6.17a still carries no verification obligation, and the finding states outright that the
change needs the owner — including a choice between the full derivation and the cheaper
leading-whitespace trigger.

**Evidence.** clean-code-standards.md-328 is 6.17a unchanged: it requires a snapshot per layout branch and says
nothing about `-u` output being a proposal or about deriving column starts from the width
constants. The finding's own Fix Applied ends "No standards doc was edited; the rule change below
needs an owner decision."

## 9. `2026-08-19-a-registered-enumeration-has-an-unregistered-second-copy-in-another-document`

**RULING (owner, 2026-08-20): duplication across documents is allowed — the checker watches
both. No rule forbidding a second copy.**

The owner's reasoning: a rule saying you may not duplicate the contents of a document is not
enforceable in practice; what is wanted is vigilance that neither copy drifts.

**Nothing needed building.** The registry ALREADY expresses this — `STEP_TEXT` is bound to two
documents today by two rows sharing one `source`. The fix is one more row binding
`scope-predicates.ts` to `reference/concepts/scope-system.md` alongside the existing row for
`features/configuration.md`. Do not add a multi-document field; do not change `RegistryEntry`.

The instance is repaired but the class needs the documents' owner to pick between letting a
registry row bind two documents and forbidding the second copy outright — the finding says so
explicitly.

**Evidence.** reference/concepts/scope-system.md now carries the missing `activeAgentNames` row and names
features/configuration.md as the drift-bound owner; scripts/check-enumeration-drift.ts still binds
only one document per row ("the exported functions of configuration/scope-predicates.ts in
reference/features/configuration.md"), so the second table remains unguarded and will drift again
on the ninth export.

## 10. `2026-07-19-e2e-dual-scope-contention-flake-silent-marketplace-catch`

**RULING (owner, 2026-08-20): NO `inputReady` sentinel. Fix the race structurally with the
stable-handler-ref pattern this codebase already proved.**

The sentinel was rejected on the reasoning that a marker painted by the shared `WizardFooter` would
assert the wizard ROOT's handler is live, while the flake is in the STEP's handler — a different
component, a different effect, a different render pass. It would be a signal claiming something it
does not know.

The reasoning given for the second half was that `use-category-grid-input.ts` had already solved it —
store the latest handler in a ref, pass a STABLE handler to `useInput`, and the effect registers once
and never re-registers.

> ### ⚠️ THE SECOND HALF OF THIS RULING IS VOID — PREMISE EXPIRED 2026-08-05
>
> **Executed 2026-08-20 and returned with zero product changes, correctly.** The ref pattern is
> redundant and would have added indirection to seven components for nothing.
>
> **Ink 7 supplies the pattern itself.** `use-category-grid-input.ts`'s comment was true when written
> (2026-02-18, `ink@^5.0.0`) — Ink 5 listed the caller's handler in the registration effect's deps.
> Ink 7 (adopted `fd19b4e4`, 2026-08-05; installed 7.1.1) rewrote it: the handler goes through React
> 19's `useEffectEvent` and the deps are `[options.isActive, internal_eventEmitter]` with no handler
> in them. Verified directly against `node_modules/ink/build/hooks/use-input.js`, not inferred.
>
> **The census in the ruling was also wrong: 1 of 10 uses the pattern, not 3.** `use-panel-scroll.ts`
> refs a DOM element and passes a fresh inline arrow to `useInput`; `use-keyboard-navigation.ts` refs
> the focused INDEX and wraps its handler in a `useCallback` with a five-entry dep array, so its
> identity changes on any inline callback prop. Only `use-category-grid-input.ts` implements it. The
> bad census came from grepping for `useRef` — a proxy for the property rather than the property.
>
> **And the pattern never fixed the case its own comment cites.** A remount builds a new instance, so
> its `useRef`/`useCallback` are new too and the effect still has to flush. A stable handler cannot
> make an effect run earlier. Probe: remount via `key` change plus a keypress at zero delay ran the
> **outgoing** child's handler.
>
> **So the flake this section is about is NOT fixed, and no longer has a proposed fix.** The sentinel
> is rejected, the ref pattern is inert, and the keypress retry is banned. **This needs a fresh
> ruling** — tracked as CLI-601.

**Still standing from the original finding: do not re-attempt the closed-loop keypress retry.** It
was tried and reverted.

Everything mechanical has landed; what is left is a product change to the wizard's footer sentinel
(an inputReady gate) plus a retry the finding itself hands to the owner.

**Evidence.** src/cli/lib/operations/source/ensure-marketplace.ts now binds the error and warns `Could not
resolve a marketplace from '<source>': ${getErrorMessage(error)}`; e2e/vitest.config.ts keeps
maxWorkers: Math.min(16, os.availableParallelism()); `grep -rn inputReady src/ e2e/` returns zero,
and the finding records that gate as "owner deferred" and the closed-loop keypress retry as
tried-and-reverted (do not re-attempt).

## 11. `2026-08-16-source-config-loader-swallows-every-load-failure-into-null`

**RULING (owner, 2026-08-20): hard error, and say the config is unreadable.**

This one was flagged to the owner as a likely confirm-and-close, on the grounds that the code
records the current posture as deliberate. The owner overruled that reading: a config file that
exists and cannot be evaluated should refuse loudly, not read as absent.

A MISSING file still returns null — that is the legitimate state `init` exists for and does not
change. What changes is the EXISTS-but-throws case, today logged under `verbose()` and returned as
null, which lets `resolveSource` walk past to `DEFAULT_SOURCE` and install from a marketplace nobody
named. `configUnreadableError` already exists and is already used by `ensureConfigReadable` for the
other loader; reuse it rather than minting a second vocabulary.

**This is a sentinel-to-throw change**, so CLAUDE.md's rule applies: every call site must record
abort or degrade, with particular care for any call inside a `Promise.all`.

The CLI-501 half is closed and the stale JSDoc it named is gone; what is left is the posture
question — whether a config that cannot be EVALUATED should hard-error or keep reading as absent —
and the code now records the split as deliberate, so the finding's primary advice would overturn a
reasoned decision rather than fix a defect.

**Evidence.** `src/cli/lib/configuration/config.ts` re-raises `ConfigSchemaError` / `ConfigDefaultExportError`
under a comment that deliberately keeps the parse-failure case as "no config" ("A file that could
not be evaluated at all stays the 'no config' this loader has always reported it as"). The residue
the `partial_note` names is already fixed: `config-precedence.test.ts` now reads
"`loadSourceConfig` once turned EVERY load failure into…", and `grep -rn 'every load failure' src
e2e .ai-docs` hits nothing outside this finding.

---
last_validated: 2026-08-18
---

# Agent Findings Index

**The count of findings on disk is deliberately not written here** — it moves whenever a pass closes one or writes one. Re-derive it: `ls .ai-docs/agent-findings/*.md | grep -c '/20'`. This file grades the corpus that existed on 2026-08-18 and records what
became of them, so a row naming a file that is no longer here is the record working as intended —
the file is gone, the judgement is not.

Read it in three parts: the first-pass grades below, the **re-audit** that supersedes them, and
**what has been deleted and added since**, at the end. Where the first pass and the re-audit disagree,
the re-audit wins — it was verified against source with every change independently refuted.

| Grade      | Count | Meaning                                                                 |
| ---------- | ----: | ----------------------------------------------------------------------- |
| **STRONG** |   193 | Real defect, named mechanism, and it generalises past its own instance  |
| **SOLID**  |   125 | Correctly diagnosed, but instance-specific                              |
| **THIN**   |    16 | Restates a known convention, or narrates a pass rather than a discovery |
| **STALE**  |    39 | Subject gone or defect since fixed; file never updated                  |
| **WRONG**  |     1 | Central claim false today                                               |

**The headline is the stale tail of 39, not the 193 strong ones.** Roughly half of every `open` or
`partial` finding that was actually verified had already been fixed — the code landed under a later
ticket and nobody returned to the file. **`status:` is close to noise as a signal**, which matters
because it is the field any rollup would read.

---

## WRONG — 1

Acting on this one introduces a bug, and it can be cited as an approved finding while doing so.

| Finding                                                         | Status | What it claims, and what is actually true                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-04-22-mode-migrator-single-scope-uninstall-cwd-ambiguity` | open   | Prescribes routing the mode migrator through the dual-scope best-effort uninstall. `mode-migrator.ts` deliberately refuses that, with an on-site comment: doing so _"would also drop a same-id plugin registered at the OTHER Claude scope"_. `claudePluginUninstallBestEffort` exists but is confined to `uninstall.tsx` on purpose. |

---

## STALE — 39

Each verified against current source, not inferred from its date. Grouped by why it matters.

### The file contradicts itself — it records a fix as pending that its own proposal landed

| Finding                                                                                           | Status  |                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-08-07-selectionvalidation-valid-is-hardcoded-true-and-two-specs-assert-it-beside-errors`    | open    | Says _"Fix Applied: None — discovery only"_; `matrix-resolver.ts` now reads `valid: errors.length === 0`, its own option 1              |
| `2026-08-10-hotkey-inventory-docs-counted-two-constants-that-do-not-exist`                        | partial | `partial_note` says the two phantom constants are "NOT corrected"; the tables were repaired today                                       |
| `2026-08-16-step-text-exhaustive-count-stale-in-two-docs`                                         | partial | `partial_note` asserts `scripts/` "holds no docs-versus-source scan of any kind"; `check-enumeration-drift.ts` now binds both documents |
| `2026-08-18-editor-e2e-asserts-arrival-never-departure`                                           | open    | All three defects fixed and the standard it asked for exists as `assertions.md` § "Assert the Departure, Not Only the Arrival"          |
| `2026-07-30-doc-hook-table-has-no-row-for-the-installer`                                          | partial | Both proposed rows are in `documentation-bible.md` verbatim                                                                             |
| `2026-07-30-shared-identity-key-helpers-conflict-with-the-no-single-file-export-rule`             | open    | Body says "the conflict is live"; CLAUDE.md carries the exception naming both helpers                                                   |
| `2026-08-07-shipped-cli-tester-prompts-teach-the-await-non-thenable-pattern-the-lint-now-rejects` | open    | Both proposed prompt edits landed                                                                                                       |
| `2026-08-09-format-check-goes-red-whenever-a-real-install-lands-in-the-package-root`              | open    | `.prettierignore` now carries `.claude-src/` and `.claude/`                                                                             |

### The subject no longer exists

| Finding                                                                               | Status  |                                                                              |
| ------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `2026-08-08-import-skill-rejects-local-paths-root-cause-confirmed`                    | open    | `src/cli/commands/import/` is gone; command deleted                          |
| `2026-04-21-todo-id-collisions-in-completed`                                          | open    | `todo/TODO-completed.md` no longer exists                                    |
| `2026-07-20-rendermetadatayaml-cannot-omit-contenthash`                               | open    | The spec and fixture are gone; `update` was rewritten and compares no hashes |
| `2026-08-06-stack-preloads-loses-its-only-writer-when-generate-from-cli-is-deleted`   | open    | `packages/matrix/scripts/` gone, `STACK_PRELOADS` deleted outright           |
| `2026-08-07-two-requires-rules-now-need-two-members-of-one-exclusive-category`        | open    | `api-database` was split into five categories; the rules no longer collide   |
| `2026-07-20-confirmstep-hardcoded-sentinel-and-timeout-blocks-migration`              | open    | `confirmAwaiting(sentinel, timeoutMs)` exists; one named spec deleted        |
| `2026-08-07-the-ninth-file-in-scripts-fails-the-whole-lint-run-with-no-rule-violated` | partial | `scripts/tsconfig.json` exists; the cap workaround is gone                   |

### Fixed under a later ticket

| Finding                                                                                | Status  |                                                                                           |
| -------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `2026-04-18-mergeConfigs-drops-projects-field`                                         | open    | The merger now carries `projects` forward                                                 |
| `2026-04-21-d228-e2e-vacuous-pass-via-home-edit`                                       | open    | Fixed with the merger; the `KNOWN GAP` comment is gone                                    |
| `2026-07-18-mergeconfigs-projects-drop-fixed-docs-stale`                               | open    | Both named artifacts updated                                                              |
| `2026-07-18-propagation-skips-agent-recompile`                                         | open    | `recompilePropagatedProjectAgents` exists and is wired                                    |
| `2026-04-20-d217-installmode-plumbing-dead-in-wrappers`                                | open    | Zero occurrences remain in either wrapper                                                 |
| `2026-04-21-e2e-keypress-rule-coverage-gap-sibling-steps`                              | open    | All seven files call `waitForWizardFooter`; the sweep landed                              |
| `2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive`   | partial | CLAUDE.md carries the full WizardLayout qualifier                                         |
| `2026-07-20-waitforstablerender-renamed-to-waitforwizardfooter`                        | partial | The zero-caller duplicate is gone                                                         |
| `2026-04-21-task-ids-in-test-names-sweep-needed`                                       | open    | Zero matches remain; ESLint enforces the proposed selectors                               |
| `2026-07-17-d167-task-id-recurrence-no-lint-guard`                                     | open    | Three `no-restricted-syntax` selectors now enforce it                                     |
| `2026-07-20-project-context-edit-lacked-scope-authority-gate`                          | partial | The three named setters have zero hits; `setInstallMode` supersedes them                  |
| `2026-07-20-readonly-const-fixtures-unadoptable-at-mutable-matcher-options`            | open    | All four modules now declare `readonly string[]`                                          |
| `2026-07-20-near-duplicate-config-normalizers-block-shared-adoption`                   | open    | `normalizeConfigPreservingOrder` exists and the comparison is made                        |
| `2026-08-06-category-is-dropped-on-the-way-into-marketplace-json`                      | open    | Fixed 2026-08-10; the planted `it.fails` is now a passing `it`                            |
| `2026-08-07-a-skills-category-never-reaches-dist-or-the-marketplace`                   | open    | Same fix; `plugin.json` and marketplace entries carry it                                  |
| `2026-08-08-edit-reports-an-unresolvable-skill-as-removed-while-preserving-it`         | open    | `config-merger.ts` no longer contains the string at all                                   |
| `2026-08-07-eight-reference-docs-still-route-readers-through-a-deleted-command`        | open    | The `validate` sweep landed across nine files                                             |
| `2026-08-07-format-check-is-red-on-markdown-while-lint-is-clean`                       | open    | Prettier clean; `lint-staged` covers markdown                                             |
| `2026-08-07-ci-installs-chromium-after-the-test-job-that-now-needs-it`                 | open    | Fix and comment landed verbatim                                                           |
| `2026-08-07-catalog-regen-needs-three-generators-and-no-entry-point-encodes-the-order` | open    | All three proposals landed in one commit                                                  |
| `2026-08-06-byte-identity-acceptance-pins-generated-headers-to-the-retired-command`    | open    | Both halves closed                                                                        |
| `2026-08-06-commands-project-tests-execute-stale-dist-until-rebuild`                   | open    | A `globalSetup` guard now throws before collection — stronger than the doc note asked for |
| `2026-04-21-r73-atomicity-bible-drift`                                                 | partial | The schema enums now match the catalogue exactly                                          |
| `2026-04-21-ralph76-memory-md-stale-phase-entries`                                     | open    | Out-of-repo grooming advice, and carries a `resolved_by` beside `status: open`            |

---

## STRONG — 193

Real defect, named mechanism, transferable lesson. Chronological.

### April–July

- `2026-04-21-e2e-build-step-keypress-missing-stable-render` — Seven `BuildStep` methods wrote a keystroke with no preceding settle, racing the PTY write against React's commit-to-effect window; post-press waits cannot substitute.
- `2026-04-21-propagation-skipped-observability-gap` — `propagateGlobalChangesToProjects` returns a `skipped` array no caller reads, so a moved or unparseable project drops out of every future global edit invisibly.
- `2026-04-22-edit-mode-scope-awareness-systemic-audit` — Six layers of the edit pipeline answer "am I global?" differently; `cwd`-derived checks fabricate a project install in an unrelated directory.
- `2026-04-22-excluded-agent-tombstone-vs-selected-agents-mismatch` — `agentList` built from `selectedAgents` while `agentScope` excluded tombstones, so it threw — and `edit.tsx` degraded the throw to a warning, silently skipping the config write.
- `2026-04-22-plugin-uninstall-bare-id-asymmetry-with-install` — Install passed `id@marketplace`, four uninstall sites passed a bare id, so uninstalls silently no-opped; both take `string`, so neither types nor mocks caught it.
- `2026-07-09-marketplace-schema-name-laxer-than-claude-code` — The repo's `marketplaceSchema.name` is `min(1)` while Claude Code forbids `/`, `\`, `.` and `..`, so the CLI emits manifests Claude rejects.
- `2026-07-17-d227-preselect-fix-not-e2e-reachable` — A store probe proved `selectStack` wipes `agentConfigs` and preselection rebuilds from a hydrate-time snapshot, so no CLI flow can feed the fixed branch a tombstone.
- `2026-07-17-e2e-helper-tests-have-no-runnable-home` — CLAUDE.md tells authors to put tested helpers under `e2e/helpers/`, but no vitest project's include glob matches them — such a test looks like coverage and never runs.
- `2026-07-18-init-dashboard-plugin-test-vacuous-project-scope` — A test named "at project scope" never set `HOME`, so the harness default collapsed the run into global scope, and its assertion was impossible in either.
- `2026-07-18-scope-guards-read-stale-hydration-snapshot` — Guards read only the frozen hydration snapshot, so after an in-session collapse a second spacebar tombstoned a real global install.
- `2026-07-18-toggle-selection-array-diverges-from-reconciled-active-state` — The UI selection array was computed before and independently of the reconciled config, so a collapsed row rendered unselected while its badge read `G`.
- `2026-07-19-aggressive-regex-corrupts-structured-test-fixtures` — A `perl -0777` non-greedy sweep crossed statement and string-literal boundaries, rewriting two `toContain` expected strings that `tsc` cannot flag.
- `2026-07-19-async-post-mount-seed-read-by-sync-input-handler` — `focusedSkillId` was seeded in a post-mount effect while the `s` handler read it synchronously, so buffered PTY input landed before the effect flushed.
- `2026-07-19-config-text-regex-extraction-vs-structural-load` — About a dozen E2E files each re-implemented the product's config parser in regex, as untested infrastructure gating product assertions.
- `2026-07-19-e2e-dual-scope-contention-flake-silent-marketplace-catch` — Traced a moving suite flake to the async focus seed producing a wrong-cell keystroke, and recorded that a closed-loop retry made it worse because `s`/space are toggles.
- `2026-07-19-ink-prompt-closure-lets-hang-anti-pattern` — `confirmUpdate` mutated closure `let`s then awaited `waitUntilExit()`, but nothing ever called `exit()`, so pressing `y` hung the command.
- `2026-07-19-installer-consuming-operations-layer-cycle` — A lib→operations import formed a load-time cycle the bundled CLI tolerated but Vitest did not: a `{...original}` mock spread snapshots the half-evaluated module and breaks a binding.
- `2026-07-19-post-construction-conditional-mutation-on-serialized-objects` — Three builders appended optional fields by mutation after the literal; for `JSON.stringify`d output, insertion order is the emitted byte layout.
- `2026-07-19-untypechecked-scripts-hid-phantom-tags-and-invalid-skillids` — `scripts/` sat outside every tsconfig and the runner transpiles without checking, hiding a push into a type with no such field and fabricated non-union ids.
- `2026-07-20-as-const-satisfies-on-object-with-getter-widens-return` — `as const satisfies` on an object containing a getter contextually types the accessor, widening its return from the body-inferred union to the whole constraint.
- `2026-07-20-command-delegation-must-carry-caller-intent` — `init` delegated to `edit` with no argv, collapsing three user intents onto one invocation; the difference is not in the state, it is in who asked.
- `2026-07-20-config-merge-functions-disagree-on-source-identity` — `mergeGlobalConfigs` dropped `marketplace` and `source`, so `uninstall --all` matched no plugin keys, skipped the plugin branch, then deleted the only record of them.
- `2026-07-20-e2e-config-load-null-check-silent-fallbacks` — ~18 spec files each re-invented null-narrowing after a config load; two rituals make downstream negative assertions vacuous.
- `2026-07-20-e2e-keypress-guard-sweep-landed-sync-abort-carveout` — Found two classes the original audit missed — loop bodies where one guard misses iterations 2..N, and composition helpers that press — then reverted the dashboard portion after 72 hangs.
- `2026-07-20-e2e-regex-config-extractors-block-structural-load-adoption` — `extractSkillIds` silently captures every `stack.<agent>.<category>[].id` alongside the roster, invisible because the same extractor runs on both sides.
- `2026-07-20-e2e-unretirable-extractors-and-package-json-author-double-cast` — A shape heuristic stands in for an id lookup, and an `as unknown as string` traces to `Partial<typeof FIXTURE>` deriving an override contract from one example value.
- `2026-07-20-edit-hasanychanges-gate-blocks-project-materialisation` — `if (!hasAnyChanges) return` skips the only path that writes a project's config and registers it, so a dashboard→Edit matching global exactly initialises nothing.
- `2026-07-20-empty-union-string-fallback-disables-generated-type-safety` — One generator emitted `never` for an empty union and another the literal `"string"` — a union's absorbing element — collapsing extending types to accept everything.
- `2026-07-20-fixture-category-literals-unvalidated-against-categories-union` — A fixture mapped a skill to a nonexistent category and nothing could catch it, because `SkillMetadataFields.category` is deliberately `string` for error-path fixtures.
- `2026-07-20-matcher-augmentation-inline-shape-defeats-drift-guard` — `setup.ts` claims every matcher shape is imported so drift is a compile error, but one parameter is inline — proven by widening the implementation and getting no error.
- `2026-07-20-migration-path-missing-marketplace-precondition` — A failed plugin install during eject→plugin was downgraded to a warning after the working copy was deleted, hiding that the marketplace was never established.
- `2026-07-20-project-builder-derived-slug-hid-wrong-category` — The e2e project builder split ids on `-` to derive category, silently emitting the nonexistent `web-state` across 91 call sites.
- `2026-07-20-project-materialisation-rode-on-stale-global-config-diff` — Materialisation had no trigger of its own; it rode on a diff kept non-empty by a stale global config, so fixing that bug silently stopped every project after the first registering.
- `2026-07-20-scope-authority-must-follow-work-performed` — Reading "never modify global config from project operations" as an invariant over all global state made an earlier fix silently delete a shipped, lifecycle-tested migration feature.
- `2026-07-20-setup-owned-state-pinned-by-action-scoped-assertions` — Three guard specs asserted the absence of a file the setup helper owned, rather than the immutability of what the guarded action touched.
- `2026-07-20-shared-mutable-constants-and-false-dry` — Two constants exported mutable arrays handed to callers by identity; a JSDoc explaining a cross-module constraint was the tell that the dedup was false DRY.
- `2026-07-20-structural-config-load-erases-writer-compaction` — `loadConfigOrFail` runs `normalizeAgentConfig`, which expands the writer's bare-string compaction, so a shared replacement would have deleted the only coverage that compaction happens.
- `2026-07-20-transient-toast-assertions-need-append-only-raw-surface` — Measured the lock toast at processed=0 / raw=1, and showed the footer sentinel is not a valid gate because toast and footer arrive in unstable order.
- `2026-07-20-two-config-normalisers-sorted-vs-order-preserving` — Two identically-shaped normalisers differed in whether they sort, so the obvious dedup would silently downgrade a byte-equality assertion to a set comparison.
- `2026-07-20-writetestpackagejson-override-type-inferred-from-fixture-value` — `Partial<typeof FIXTURE>` narrows a field to `string` because the fixture holds a string, so the object-form test can only compile through a banned double cast.
- `2026-07-20-page-object-adoption-must-not-silently-change-sentinel-or-budget` — Adopting the shared `confirm()` would simultaneously broaden the accepted sentinel and halve the wait budget; two earlier agents hit this and neither outcome was right.
- `2026-07-25-register-deregister-path-normalization-asymmetry` — `registerProjectPath` stored `realpathSync` while `deregisterProjectPath` filtered on `path.resolve`, a silent no-op wherever an ancestor is a symlink — correct on Linux CI, broken on macOS.
- `2026-07-29-category-exclusivity-enforced-only-in-a-keypress-handler` — Exclusivity was enforced only in `toggleTechnology`, so cross-scope write paths produced React and Angular both active, with `doctor` and `validate` clean.
- `2026-07-29-derived-mask-and-user-tombstone-are-indistinguishable` — A machine-derived conflict mask and a user's deliberate exclusion write byte-identical entries yet need opposite treatment on the next write.
- `2026-07-29-e2e-grid-focus-unobservable-under-no-color-closed-loop-tab-walk` — `focusSkill` dead-reckoned coordinates on the false assumption that arrow-DOWN resets the column; cell focus has no text signal under `NO_COLOR`.
- `2026-07-29-ink-component-colour-assertions-need-forced-chalk-level` — Ink colourises via chalk, which auto-disables on vitest's non-TTY stdout, so a colour assertion is unobservable rather than merely hard.
- `2026-07-29-per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row` — A green spec named "previously installed as project" actually built a project→global migration, because two factories default to opposite scopes.
- `2026-07-29-project-config-written-by-two-paths-only-one-reconciled` — Two sites write a project config with the global inlined; one performed no cross-scope reconciliation at all, producing one id active at both scopes.
- `2026-07-29-sources-tab-session-diff-diverged-from-computescopediff` — The wizard carried two independent implementations of one session diff, keyed differently and with an inverted gate, and a unit spec had calcified the wrong rationale verbatim.
- `2026-07-30-component-tests-assert-text-presence-never-column-position` — The Sources grid's `Scope` header sat 11 columns right of the labels it names, and 56 passing tests could not see it because `toContain` and ordering both survive a column shift.
- `2026-07-30-configloaderror-call-sites-lack-a-declared-posture` — `detectUninstallTarget` loaded the config inside a `Promise.all` with no `.catch`, so a corrupt config aborted `uninstall` before deleting anything.
- `2026-07-30-doc-index-pins-counts-that-only-the-indexed-doc-revalidates` — The bible advertised "All 39 Zod schemas" for a week after the owning doc corrected it to 35, because validation is per-document and the index is read first.
- `2026-07-30-docs-recorded-a-deletion-that-was-later-reverted` — Three docs recorded a component "has no post-mount effect"; one was re-added, and a negative claim matches no grep, so two later sweeps left all four sentences standing.
- `2026-07-30-domain-deselect-has-no-reachable-ui-surface-in-edit` — `toggleDomain`'s only two callers sit on init-only steps and `edit` hydrates at `build` with empty history, so the requested E2E would have had to invent a flow no user can perform.
- `2026-07-30-eslint-disable-directives-were-never-verified` — A `no-var` directive sat one line above a comment instead of the `var`, so it suppressed nothing and became an auto-fixable "unused directive" whose `--fix` would rewrite a TDZ-avoiding `var` into a crash.
- `2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run` — The checklist required "No ESLint errors" in a repo with no config, no dependency, no binary and no script — a gate that could only ever be reported as passed.
- `2026-07-30-finding-proposed-standard-contradicted-a-never-rule` — A finding's Proposed Standard prescribed a two-tier fallback CLAUDE.md bans outright, and an implementer could have cited the approved finding as justification.
- `2026-07-30-index-audit-arithmetic-passed-while-pointer-set-was-misnamed` — A `total == tracked + pointers` invariant passed four audits while two members were swapped, leaving the canonical commands reference untracked.
- `2026-07-30-symlinked-project-path-bugs-are-unreachable-from-e2e` — `process.cwd()` is `getcwd(2)`, which returns the kernel's canonical path, so an E2E spawned through a symlink passes identically against the bug and against the fix.
- `2026-07-31-a-hardcoded-header-lets-its-fixture-omit-the-field-it-will-derive-from` — `enabledSources` had a setter with no caller, so the row was always the hardcoded fallback — and every fixture rendering it was free to omit `source`.
- `2026-07-31-a-precondition-checked-once-before-render-is-not-a-gate` — `ensureTerminalSize` runs once in `init()` and removes its resize listener on success, so shrinking mid-session let the grid paint through the footer.
- `2026-07-31-column-geometry-snapshots-regenerated-never-verified` — Both required snapshots were regenerated with `-u` and came back green over a layout nobody asked for, because a regenerated snapshot agrees with the code by construction.
- `2026-07-31-e2e-fixture-smaller-than-production-changes-the-bug-signature` — The e2e source ships one stack against the marketplace's dozen, so the overflow destroyed a different row and the assertion matching the reported symptom was green on the unfixed binary.
- `2026-07-31-fixed-height-blocks-inside-a-clipped-viewport-must-not-shrink` — Ink's `Box` defaults `flexShrink: 1` and the property is per-item, so a fixed-height header inside a `flexShrink={0}` box was compressed into overprinting that reads as corruption.
- `2026-07-31-getscreen-is-not-viewport-only-so-absence-assertions-are-unsound` — `getScreen()` reads scrollback plus viewport despite its name, so any assertion that text is now absent fails against residue whether or not the product works.
- `2026-07-31-negative-render-assertion-needs-a-positive-subject-guard` — Two confirm-step assertions passed at a scroll offset where the subject never paints, and a mutation breaking scrolling entirely left both green.
- `2026-07-31-two-minimum-terminal-height-declarations-neither-agreeing` — The minimum was declared twice — a named constant with zero importers and a magic literal in the live gate — and the dead constant made the violation look already fixed.
- `2026-07-31-vertical-padding-blanks-a-clipping-viewport-on-a-short-terminal` — `paddingY={1}` is unshrinkable, so at 16 rows it consumed the viewport's last row, `measureElement` read 0, and the panel rendered neither content nor the affordance saying content was hidden.

### August 1–7

- `2026-08-01-agent-matchers-subset-check-reads-as-exact-and-a-zero-caller-matcher-was-broken` — `toHaveAgentDynamicSkills` split on a `---` delimiter that recurs throughout compiled agents, inspecting 1,193 of 39,020 bytes — one arm unsatisfiable, the other vacuous, with zero callers to notice.
- `2026-08-01-as-any-on-valid-union-members-is-noise-that-hides-two-fabrications` — 36 of 38 `as any` casts were on values already in the target union, and that noise hid two fabricated IDs.
- `2026-08-01-e2e-specs-captured-exit-codes-and-config-snapshots-then-asserted-nothing` — Fifteen unused-variable reports marked missing assertions, including a spec that snapshotted both configs, compared neither, and whose two "after" assertions were already true before the wizard started.
- `2026-08-01-exhaustive-enumeration-extended-not-rederived-stayed-short` — `STEP_TEXT` was documented at 72 and 64 against 74 on disk; a recount recorded the day before was still short two members no doc had ever listed.
- `2026-08-01-import-graph-docs-validate-rows-instead-of-diffing-edges` — `dependency-graph.md` carried a phantom edge, missed a real one, and named `loadAllAgents` where source uses `loadMergedAgents` — a real sibling export that silently drops project overrides.
- `2026-08-01-link-integrity-scan-scope-excludes-the-keys-that-dangle` — The link check covers three of the five frontmatter keys holding filenames; widening it found four dangling targets plus three machine-absolute paths.
- `2026-08-01-local-extractor-in-e2e-spec-needs-its-own-tests-to-be-trusted` — `findAssignment` sat on the assertion side, downgrading "equals exactly this array" to "contains an entry like this" at every stack assertion.
- `2026-08-01-unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written` — Of 53 unused test bindings, two marked helpers restating their parameters structurally, holding an inline-test-data violation in place across ~70 call sites.
- `2026-08-05-built-in-agent-partials-instruct-users-to-write-into-repo-internal-paths` — Partials across shipped agents told the end user's compiled agent to write into `.ai-docs/agent-findings/` and to obey a rule "per CLAUDE.md" — paths that exist only in this repository. **Closed and deleted:** the eleven partials it counted had become six across two agents, because four of the six agents it named were consolidated away in the meantime; all six are reworded, and the rule with its grep is `prompt-bible.md` § 8.6.
- `2026-08-05-builtin-agent-rosters-unbound-to-generated-agent-names` — The roster lives in four places of which one is generated; `tsc` catches deletions but nothing catches additions, so six shipped agents were unreachable through the wizard.
- `2026-08-05-tsup-clean-does-not-clear-copied-agents-dir-stale-agents-survive-in-dist` — `clean: true` never reaches the copied agents dir because `onSuccess` merges rather than mirrors, so retired agents survive incremental builds and would publish.
- `2026-08-06-a-sanctioned-boundary-cast-was-the-workaround-for-the-sparse-map-defect` — Twenty-four signatures declared total `Record<AgentName, …>` for maps built by filtering, forcing 53 casts; making the parameters `Partial` deleted every one.
- `2026-08-06-a-stack-overlay-enters-the-generator-as-a-prior-save-so-a-flagless-entry-reads-as-curated` — A stack spread into the generator's explicit tier, so an assignment with no `preloaded` flag read as a deliberate lazy and never reached the defaults.
- `2026-08-06-compatible-with-is-non-reflexive-so-a-selected-skill-judges-itself-incompatible` — `isIncompatibleByFramework` judges a skill against a selection containing it, so one picked alone resolves incompatible — hidden by a blanket downgrade and a grid early return.
- `2026-08-06-demoting-a-meta-rows-reviewer-flavor-removes-its-reach-not-just-its-eagerness` — For meta-domain skills a preload row is the whole of the reach, so "demote to lazy" removed two skills from the reviewer's assignments entirely.
- `2026-08-06-edit-hydration-from-agents-makes-no-op-edits-actually-no-op` — `edit.tsx` hydrated from an optional field, so an absent value seeded the default roster and produced a phantom diff that rewrote config and recompiled on a no-op edit.
- `2026-08-06-expansion-modifier-doctrine-restates-the-volume-mandate-in-other-words` — The removed volume mandate survives verbatim in the prompt bible's synonyms, so the zero-hit phrase grep that verified the removal proved nothing.
- `2026-08-06-generated-drift-checks-use-git-diff-unrunnable-by-sub-agents` — Two `:check` scripts verify through `git diff --exit-code`, which sub-agents are forbidden to run and which cannot see a newly emitted untracked file.
- `2026-08-06-in-process-command-tests-run-against-the-real-home-directory` — The `commands` project isolates `cwd` but not `HOME`, so in-process specs read and write the developer's own `~/.claude` — green on CI, failing only for developers with a global install.
- `2026-08-06-init-from-drops-a-global-sub-agents-stack-rows-for-project-scoped-skills` — `init --from` bypasses the scope filter, so a project-scoped skill paired with a global sub-agent is filtered out of both config halves and the curation vanishes at exit 0.
- `2026-08-06-matrix-schema-typed-every-id-as-string-and-thirteen-read-model-casts-put-them-back` — The schema claimed to fail loudly on a renamed id while typing every id `z.string()`, forcing thirteen uncommented casts back to the generated unions.
- `2026-08-06-nothing-detects-a-workspace-that-stops-extending-the-shared-tsconfig` — `packages/cli/tsconfig.json` extended nothing, so a Node CLI type-checked with DOM globals in scope, invisible to every gate because each gate reads that config.
- `2026-08-06-project-scope-agent-deselect-writes-no-tombstone` — The spec's assertion was satisfied by a skill tombstone minted by an unrelated setup step; the agent deselect it named wrote nothing and the scenario had never occurred.
- `2026-08-06-role-flavor-was-already-anchored-and-the-brief-said-otherwise` — The brief's "known type hole" did not exist; two `@ts-expect-error` directives passing `tsc` were standing proof the type already rejected non-roles.
- `2026-08-06-skills-repo-never-validated-against-its-own-metadata-schema` — Nothing validates the skills repo against its schema: six skills are absent from every generated artifact, 45 exceed the description cap, two directories hold no skill at all.
- `2026-08-06-the-exclusive-category-downgrade-erases-recommendations-not-just-incompatibility` — The pick-one downgrade replaces the whole advisory state, so a skill loses its recommendation in the CLI while the editor still offers it.
- `2026-08-06-the-one-agent-toast-spec-the-raw-wait-sweep-never-converted` — A predecessor's `resolved_by` recorded that an affordance now exists, which was read as every site using it; one spec still read the toast off the processed buffer.
- `2026-08-06-types-bible-has-no-rule-for-a-closed-key-map-asked-with-an-open-id` — Narrowing a map to `Partial<Record<SkillId, …>>` broke eleven sites that legitimately ask with a `string`, and both candidate rules point at casting or re-widening.
- `2026-08-06-types-bible-has-no-rule-for-absent-versus-explicitly-undefined` — `exactOptionalPropertyTypes` splits every optional property into absent-vs-explicitly-undefined with no rule for which fix to reach for; three of seven fixes were against types the repo does not own.
- `2026-08-07-a-let-assigned-in-beforeall-reads-as-definitely-assigned-and-fifty-teardown-guards-paid-for-it` — TypeScript types a `let` assigned in `beforeAll` as definitely assigned, so the lint called 49 real teardown guards redundant.
- `2026-08-07-a-rename-sweeps-affected-files-list-was-a-reading-of-the-grep-not-its-output` — A finding's `affected_files:` listed 15 files for "roughly twenty hits" while the sweep found 35 in 20, because the list was assembled from the grep's summary.
- `2026-08-07-a-saved-stack-entry-is-dropped-when-its-skill-changes-category` — Saved stacks are keyed by category, so when a skill moves category the lookup misses and the user's per-agent curation is silently discarded on the next save.
- `2026-08-07-a-user-facing-report-both-commands-owe-lived-private-on-one-of-them` — `reportValidationErrors` was private to `Edit`, so warnings both commands computed identically were reported by one and silently dropped by the other.
- `2026-08-07-a-vacuous-guard-and-a-real-one-are-indistinguishable-when-the-old-bug-also-prevented-the-change` — The mandated mutation check cannot validate a "leaves this unchanged" guard when the old bug also wrote nothing; the fixture must be mutated instead.
- `2026-08-07-a-workers-app-type-consumed-as-source-redefines-the-browser-apps-dom-globals` — Consuming the worker as source pulls a 14,714-line declaration into the editor's program, where Cloudflare's `Element` displaces the DOM's and surfaces as one error in an unrelated file.
- `2026-08-07-audit-manifest-records-post-apply-verdicts-but-its-checks-assume-a-synchronised-tree` — Nine of twelve audit batches recorded post-apply verdicts while the rules still describe the pre-apply tree; both obvious remedies either falsify the audit or ship a red gate.
- `2026-08-07-built-in-catalogue-relationship-counts-drifted-under-a-fresh-last-validated` — Claimed 28 conflicts against 12, 50 requires against 98 and 129 slugs against 176, all under a `last_validated` stamped as if the whole file had been re-derived.
- `2026-08-07-design-tokens-fail-wcag-aa-contrast-on-every-amber-marked-element` — 13 of 47 stories failed, all `color-contrast` and all from tokens: amber-on-wash at 3.97:1 marks every deliberate user choice, and `opacity-40` composites a disabled label to 2.4:1.
- `2026-08-07-doctor-reports-a-config-that-exists-but-cannot-be-read-as-not-found` — `doctor` prints "not found — run init" for a config that exists but fails to parse, because the three-state load contract collapses to two.
- `2026-08-07-e2e-fixtures-wrote-installed-content-no-real-install-would-produce` — Nine fixtures wrote agent files with no frontmatter and non-hex hashes, and two tests had promoted "doctor happens not to check this" into an asserted invariant.
- `2026-08-07-project-config-declares-required-fields-its-own-loader-does-not-supply` — `loadProjectConfigFromDir` cast a lenient parse to `ProjectConfig` without supplying `agents`, so ~20 guards the compiler called dead were load-bearing.
- `2026-08-07-requires-closure-cannot-carry-the-whitelist-verdicts` — Measured that deleting `compatibleWith` regresses exactly three scenarios, because `requires` asks whether a host is still possible and the whitelist whether it is selected.
- `2026-08-07-the-cli-eslint-config-restates-the-shared-set-so-its-additions-were-never-inherited` — `packages/cli` composed the recommended set itself rather than extending the shared config, so a rule was never enabled and a debt comment calling it "off here" was false.
- `2026-08-07-three-test-limits-were-pinned-to-the-catalogues-size-and-broke-when-it-grew` — Twelve new categories broke three tests: a Tab budget, two specs that fitted the viewport by luck, and a golden whose exemplar the taxonomy dissolved.
- `2026-08-07-tsconfig-include-dot-skips-dot-directories-leaving-config-unchecked` — `"include": ["."]` skips dot-directories, leaving `.storybook/*.ts` unchecked; naming the directory does not help, and tsc exited 0 silently while ESLint failed loudly.
- `2026-08-07-two-generated-artifacts-were-already-stale-and-their-checkers-cannot-say-so` — Two generated artifacts were stale on disk, and their `git diff`-based checkers answer "differs from committed" rather than "is stale".
- `2026-08-07-two-preload-tests-name-categories-a-split-replaced-and-are-red-in-another-agents-file` — A category split left parent ids alive in hand-written classification sets, so unchanged rows read as violations.
- `2026-08-07-two-stack-normalizers-one-name-and-no-rule-for-which-boundary-reconciles-catalog-drift` — Two normalisers read as a general/specific pair but serve opposite trust boundaries — authored stacks must not be re-keyed, persisted config must.
- `2026-08-07-two-type-checked-rules-read-a-type-graph-the-strict-flags-opt-out-under-reports` — 252 of 612 lint reports were artefacts of `noUncheckedIndexedAccess: false`, so acting on them would have deleted exactly the guards restoring the flag needs.
- `2026-08-07-zod-optional-accepts-an-explicit-undefined-so-every-zodtype-annotation-was-a-false-claim` — `z.optional()` accepts and preserves a present-but-undefined key, so all fifteen `z.ZodType<T>` annotations were false under `exactOptionalPropertyTypes`.

### August 8–18

- `2026-08-08-a-name-keyed-guard-list-cannot-fail-on-a-name-nothing-declares` — Three of ten identifier strings in the config-gate leak guards named symbols nothing declares, so those rows were permanently green.
- `2026-08-08-a-new-skill-picked-in-a-project-edit-is-written-into-the-global-install` — `createDefaultSkillConfig` returns a literal `scope: "global"`, so a fresh pick in a project-scope edit installed into `$HOME` and rewrote five global agents.
- `2026-08-08-a-project-edit-cannot-remove-a-skill-it-owns-when-a-global-install-backs-it` — The guard keyed on "an active global install exists" rather than ownership, so a `[P][G]` pair was refused as a unit and project-scope removal had no reachable subject.
- `2026-08-08-a-project-scope-compile-wrote-into-the-global-install-and-into-every-registered-project` — Passes were derived from which installations exist, so a compile inside one project rewrote the global agents and another project's file — byte-identically, hence invisibly.
- `2026-08-08-a-stacks-sub-agent-roster-is-overwritten-by-the-domain-roster-before-install` — `preselectAgentsFromDomains` overwrote `selectedAgents` after the stack step, so a stack installed the eleven-name domain union instead of its twelve declared agents.
- `2026-08-08-a-store-reported-every-first-visit-as-a-configuration-it-could-not-read` — zustand calls `merge` with `undefined` on empty storage, so the editor reported "Discarded unreadable saved configuration" to every first-time visitor.
- `2026-08-08-a-workers-request-may-issue-fifty-subrequests-and-nothing-local-enforces-it` — A cold three-repository crawl cost 59 subrequests against Cloudflare's 50-per-request limit, which neither miniflare, `wrangler dev` nor the fetch-stubbing tests model.
- `2026-08-08-eight-specs-pinned-two-behaviours-no-ruling-had-established` — Six E2E files and two unit cases went red on two owner-ruled fixes; each had been written from the implementation and read as a deliberate contract.
- `2026-08-08-eslint-10-looks-its-config-up-from-the-linted-file-and-three-places-still-said-otherwise` — ESLint 10 resolves flat config from the linted file rather than the cwd, invalidating four documents including a hook note quoting a command that now exits 0.
- `2026-08-08-extending-a-shared-config-does-not-inherit-a-rules-options-if-the-workspace-restates-that-rule` — ESLint gives all of a rule's options to the last block naming it, so extending the shared config would have silently dropped `ignoreRestSiblings`.
- `2026-08-08-honos-rpc-client-deletes-a-trailing-index-segment-so-that-path-is-unreachable-from-the-editor` — Hono's `hc` strips a trailing `/index`, so a route served fine over curl and 404'd from the editor while still type-checking.
- `2026-08-08-init-edit-invalid-source-flag-unreported` — Two guard specs asserting only a non-zero exit and non-empty output were green on Ink's raw-mode crash, never on any source validation.
- `2026-08-08-init-then-edit-merge-cannot-add-a-skill` — The merge spec never completed phase 1, wrote to the wrong directory, and could not add a skill at all — hidden by an `after.length >= before.length` count floor.
- `2026-08-08-one-config-less-file-fails-the-whole-eslint-run-and-nothing-declares-which-workspaces-are-config-less` — ESLint exits 2 for the entire invocation when one passed file has no resolvable config, which only mattered once lint-staged began passing file lists.
- `2026-08-08-parseable-but-incomplete-skill-metadata-still-splits-the-two-compile-passes` — One `compile` run printed "Loaded skill" and "Skipping local skill" about the same file, and 81 of 99 e2e fixtures wrote metadata no product path produces.
- `2026-08-08-ten-findings-carry-frontmatter-no-yaml-parser-can-read-and-the-lifecycle-fields-are-where-it-breaks` — Ten findings' frontmatter fails YAML parsing on a bare colon-space, and every one breaks on the two prose fields the template shows unquoted.
- `2026-08-08-the-editors-vitest-alias-list-claimed-parity-with-its-tsconfig-and-omitted-the-subpath-entry` — Vite matches string aliases by prefix, so a missing subpath entry concatenated imports into `.../src/index.ts/seed` and failed with an unattributable `ENOTDIR`.
- `2026-08-08-the-selection-validator-asserts-on-requirement-targets-only-a-fixture-can-break` — `validateRequirements` calls the throwing `getSkillById`, safe only because another module drops unresolvable needs — an invariant a hand-built mock matrix does not honour.
- `2026-08-08-the-skill-index-freshness-header-is-invisible-to-the-browser-cors-never-exposes-it` — `hono/cors` defaults `exposeHeaders` to empty, so the browser dropped the header while `SELF.fetch`, the RPC client and MSW all read it and stayed green.
- `2026-08-08-two-compile-specs-pin-behaviour-no-ruling-establishes` — A spec's name says the malformed-metadata skill is skipped, its body comment says it is loaded, and its assertion is green against both readings.
- `2026-08-09-a-fixture-that-points-a-command-at-a-source-must-record-it-not-pass-it` — ~180 e2e sites pointed commands at a test source via a flag, describing a run rather than an install; dropping the channel silently re-points specs at the real marketplace.
- `2026-08-09-a-prop-accepted-and-never-rendered-is-a-silent-drop-not-a-stub` — `WizardLayout` declared `startupMessages` and never destructured it, so buffered warnings existed nowhere, while two comments described a block that never existed.
- `2026-08-09-a-removal-reason-asserted-unanchored-is-satisfied-by-the-warning-above-it` — `toContain("not present in")` matched a wizard-store warning six steps earlier and stayed green when the string it existed to pin was changed outright.
- `2026-08-09-a-stale-dist-makes-a-deleted-command-look-tested` — Eleven integration tests passed against a compiled command after its source was deleted, because only `test:e2e` had a build hook.
- `2026-08-09-a-tab-that-scrolls-the-page-loses-its-focus-to-the-filter-bar` — The filter bar grabbed focus on sticking, so tabbing to a control below the fold caused the scroll that stuck the bar and threw the caret back to the search field.
- `2026-08-09-allowdefaultproject-matching-is-runtime-dependent-and-only-lint-staged-runs-eslint-under-node` — A glob matched under bun and failed under node, so only lint-staged reported every script unparseable.
- `2026-08-09-flag-acceptance-tests-assert-a-string-oclif-never-prints` — Four tests asserted `not.toContain("unknown flag")` when oclif prints "Nonexistent flag", so a test named "should accept --refresh" passed for a command that never declared it.
- `2026-08-09-the-e2e-fixtures-2384-warnings-came-from-the-clis-own-rules-not-the-fixture` — The 2384 warnings blamed on the fixture came from the CLI's own default rules — 176 public-catalogue slugs — applied whole to a ten-skill source.
- `2026-08-09-the-generated-matrix-took-its-key-order-from-the-filesystem` — The generator filled its record in `readdirSync` order, so the committed matrix encoded which machine generated it and CI produced a 17,300-line pure-reordering PR.
- `2026-08-09-the-guard-that-polices-every-suite-is-checked-by-no-tsc-program-and-no-eslint-config` — The dist-freshness guard sat in no tsc program and matched no ESLint `files` block, so the file preventing false greens was itself unchecked.
- `2026-08-10-a-known-gap-pinned-as-an-arity-assertion-is-invisible-to-grep` — Three pins encoded a dropped field, and two — a `toHaveLength(1)` and a test named for the field's absence — no grep for the field can find.
- `2026-08-16-a-fixture-wrote-its-skill-id-as-a-display-name-and-the-namespace-broke-the-bound` — `ProjectBuilder` wrote `displayName: skillId`; once ids gained a namespace prefix they broke a `max(30)` bound and `doctor` failed five green-looking specs.
- `2026-08-16-a-parse-boundary-followed-by-safeparse-reads-as-guarded-when-it-is-not` — An unwrapped `parseYaml` above a `safeParse` let one bad `metadata.yaml` kill the whole matrix load unattributably.
- `2026-08-16-a-repointed-copy-pin-kept-its-withdrawn-name` — After a noun rename, a constant held the corrected string under the withdrawn name — invisible to the old-value grep precisely because the value was the half already fixed.
- `2026-08-16-a-vocabulary-negative-is-defeated-by-its-own-fixture-prefix` — A `.not.toMatch(/\bsources?\b/i)` failed on the fixture's own directory prefix, since the refusal echoes the path its sibling spec requires named.
- `2026-08-16-doctor-specs-asserted-the-blanket-skip-and-locked-the-cascade-in` — `doctor` skipped its whole operational layer on any content failure, and two specs pinned that by restating the implementation's own justification as their assertion message.
- `2026-08-16-marketplace-skills-reach-agents-but-can-never-be-eager` — Reach is derivable from taxonomy but the preload table is authored per catalogue id, so a namespaced marketplace skill can hold no row and is lazy by construction.
- `2026-08-16-namespaced-ids-fall-out-of-every-catalogue-keyed-builtin-table` — Namespacing an id removes it from every table keyed by the generated union — a membership test, not a parse — so a custom marketplace's skills reached no sub-agent.
- `2026-08-16-source-config-loader-swallows-every-load-failure-into-null` — Every failure became `verbose` + `null`, making a schema-refused config indistinguishable from a missing one and silently installing from the public marketplace instead.
- `2026-08-16-the-authoring-guide-promised-a-validator-that-did-not-exist` — The guide stated in the present tense that `build marketplace` refuses an out-of-namespace id; nothing did, so a compliant author got exit 0 and a consumer-side collision.
- `2026-08-16-the-fixture-marketplace-had-no-nameable-identity` — The fixture defaulted to a timestamped name, so every spec asserting it read it back off the fixture object and a timestamp satisfied them as well as a constant.
- `2026-08-16-the-marketplace-rename-stopped-at-typed-positions` — A field rename has four surfaces; `tsc` and Zod cover two, leaving untyped `toStrictEqual` literals, fixture template strings and helper options named for the old word.
- `2026-08-16-the-screen-sentinel-pair-is-guarded-in-one-direction-only` — Three comments claim a fast unit guard, but the unit spec compares the product to its own literal — drift in the e2e mirror times out a dozen specs at 45s each.
- `2026-08-16-two-standing-never-rules-hid-behind-as-casts-in-a-test-factory` — Two factories derived slug, domain and category by splitting the skill id behind `as` casts, already producing catalogue-contradicting values for 55 of 74 ids with a green suite.
- `2026-08-17-a-credential-stored-without-its-identity-is-spent-on-whoever-asks-next` — The editor held `{ marketplace, token }` as sibling fields, so a PAT for one private repository was sent to a different one named by a shared link — and written back on success.
- `2026-08-17-a-destructive-apply-must-be-told-what-it-does-not-own` — `authoritativeScope: "owned"` protects the config row at the writer, but file deletion runs off the removal diff — so `edit --from` would delete a globally installed skill's directory.
- `2026-08-17-a-height-class-on-a-flex-grown-pane-is-dead-and-reads-as-applied` — `h-[26rem]` on a `flex-1` child never takes effect; it measured 696px in a pane declared 416px, and the comment above claimed the behaviour it did not produce.
- `2026-08-17-a-named-export-in-a-config-file-loads-as-no-config` — jiti returns the module namespace when a config has no default export, so a named-export config failed the schema on a field the file plainly has.
- `2026-08-17-a-persisted-store-has-no-way-to-hold-state-that-is-not-this-browsers` — Zustand `persist` writes on every `set`, so importing a shared configuration overwrote the visitor's own slot, and guarding the import alone left the guarantee one click deep.
- `2026-08-17-a-second-producer-inherits-the-first-refusals-and-recosts-its-skips` — `edit --from` was built against `init --from`'s happy path, so it carried no home-root refusal and turned that command's free "skipped unplaceable id" into a deletion.
- `2026-08-17-a-spec-that-spawns-a-third-party-binary-must-pin-that-binarys-state` — Three smoke specs registered marketplaces into the developer's real `~/.claude/plugins/`; the spec meant to settle this asserted only `typeof exitCode`.
- `2026-08-17-carried-content-is-detectable-only-by-what-the-install-recorded` — The install recorded the source but not the directory, so a carried skill re-shared as a bare id and installed nothing elsewhere, with no migration possible for old installs.
- `2026-08-17-doctor-judged-a-shared-directory-as-if-it-owned-it` — `doctor` validated every subdirectory of the shared `~/.claude/skills/`, faulting other tools' skills — and `forkedFrom` alone is the wrong ownership test since the marker lives inside the missing file.
- `2026-08-17-getbyrole-cannot-see-the-dialog-underneath-an-open-modal` — Base UI marks the sheet under a second modal `aria-hidden`, so `getByRole` reports "element(s) not found" — indistinguishable from the dialog having closed.
- `2026-08-17-persisted-store-hydrates-before-its-reference-data` — `persist` hydrates at module import, so the prune always validated a marketplace configuration against the vendored public catalogue and dropped it, destructively, one click later.
- `2026-08-17-smoke-tests-are-run-explicitly-with-no-command-that-runs-them` — Four documents said the smoke files are "run explicitly"; no script reached them, so they rotted — one spec named "should add a marketplace" had never once added one.
- `2026-08-17-the-namespace-audit-scoped-e2e-and-left-the-unit-fixtures` — An audit measured a collision guard against e2e fixtures only; the unit layer writes four bare catalogue ids through the same code, and 52 tests failed.
- `2026-08-17-the-stale-id-refusal-names-the-opposite-cause-and-no-fix` — The seed-version refusal blamed "a newer version" — the opposite of what a version bump produces in bulk — and named no remedy, though re-sharing always mints a current id.
- `2026-08-17-the-unowned-install-row-claims-agent-files-uninstall-refuses` — `doctor`'s orphans row listed every agent file and tipped at `uninstall`, which refuses unmarked files, while the tip's parenthetical said the opposite — false both ways.
- `2026-08-17-two-elements-can-both-be-visible-and-still-cover-each-other` — A fixed-position button covered the nav rail's link; the suite had no geometry assertion of any kind, and a viewport-fixed offset cannot address a centred max-width grid at any width.
- `2026-08-18-a-gate-that-filters-its-subject-cannot-report-what-it-skipped` — The from-scratch gate's filter silently dropped six named entries, so a quarter of one journey's cited proof went unjudged while the page read as fully checked.
- `2026-08-18-a-harness-variable-in-the-spawned-binary-made-two-user-facing-warnings-unassertable` — Both e2e runners forwarded `VITEST` to the spawned binary, so a suppression dropped two user-facing warnings in every e2e run.
- `2026-08-18-a-live-command-was-documented-as-deleted-and-nothing-could-have-caught-it` — The commands index said `new marketplace` no longer parses and its directory does not exist, both false; a roster is directory membership, which no registry row can bind.
- `2026-08-18-a-narrowing-probe-handed-a-literal-passes-on-a-syntax-error` — The probe was passed a bogus id where it wanted alias names, rendering unparseable TypeScript, so its exit-code verdict held on both a narrow and a collapsed union.
- `2026-08-18-a-renamed-builder-dangles-in-four-docs-and-only-two-were-checkable` — A builder rename inverted the meaning, and four documents kept the old name while the totals were off by only one, hiding it from count checks.
- `2026-08-18-a-spec-asserted-the-silence-while-the-same-run-logged-the-loss` — A spec asserted a notice hidden over a path that pruned six saved ids, with the app's own `[issue] Pruned saved ids {droppedIds:6}` printed one line above the green tick.
- `2026-08-18-a-store-action-that-changes-nothing-still-writes-the-slot` — Under `persist`, `set` is the write, so recomputing an equal empty state wrote emptiness over the slot during a parked restore — the recovery destroying what it exists to recover.
- `2026-08-18-an-editor-e2e-test-reached-live-github-and-asserted-a-third-partys-file-size` — A spec named "cannot be read is refused" installed no stub, hit live GitHub, and passed on the size refusal — effectively asserting a third party keeps a directory over 256 KB.
- `2026-08-18-config-docs-named-nine-symbols-the-source-does-not-have` — Nine documented symbols do not exist across seven config pages, including two keys the loader actively refuses by name with a rename message.
- `2026-08-18-five-docs-outlived-the-gap-they-described-because-a-gap-names-no-symbol` — A day after a refusal moved to `BaseCommand`, five docs still asserted its absence — a claim no membership check can falsify, since nothing moved and no import appeared.
- `2026-08-18-the-fan-out-line-counts-rewrites-not-projects-reached` — The summary counts projects rewritten, not reached, so asserting the leading number cannot separate "reached two, rewrote neither" from "reached one".
- `2026-08-18-the-skill-index-drops-the-sizes-its-own-refusal-needs` — The index carries no byte count, so oversized skills are refused only at confirm — while the crawl already receives the sizes in the tree response and discards them.
- `2026-08-18-three-of-the-four-escape-shapes-are-judgement-and-one-is-a-selector` — Measured which of four defect shapes a machine can police: 22 of 172 sentinels appear nowhere in source verbatim, and the type-aware rule structurally cannot see `after.length >= 0`.
- `2026-08-18-two-doors-seat-a-catalogue-and-only-one-carried-the-rule` — Seating a catalogue has three doors and only one pruned, so a minted payload named ids from two marketplaces under a single ref.
- `2026-08-18-two-writable-copies-of-the-e2e-rules-had-already-contradicted-each-other-on-spacebar` — Two writable copies of one ruleset disagreed on spacebar over a dual-scope skill row; the store settles it against the bible.

---

## SOLID — 125

Correctly diagnosed and real, but the lesson does not travel past the instance.

### April–July

- `2026-04-17-shared-config-stack-parser` — Four lifecycle tests each hand-rolled a different extractor over the CLI-written config for one well-defined format.
- `2026-04-21-agent-findings-frontmatter-drift-iter45` — A findings audit found a file with no YAML block, an invented `root_cause` value, and audit documents sharing the single-finding schema.
- `2026-04-21-d233-projects-normalization-asymmetry` — Register stored realpaths while deregister compared resolved paths, so symlinked registrations leaked forever.
- `2026-04-21-eject-success-log-stale-partial-names` — `eject`'s success line offers four nouns that map to none of the five partials agents actually eject.
- `2026-04-21-registerProjectPath-sweep-observability-gap` — The stale-registration sweep logs nothing and returns a flag conflating "swept N" with "appended current".
- `2026-04-22-agent-toggle-checkbox-ignores-excluded-tombstone` — The checkbox read `selectedAgents` while the toggle expressed removal as a tombstone, so space looked like a no-op.
- `2026-04-22-error-swallowing-systemic-gap` — Disk-write and registry failures warn and continue, so the config records migrations that never happened.
- `2026-07-17-d227-same-scope-active-tombstone-duplicate` — Preselection emits a fresh active entry beside a tombstone; the merger keeps both and `.find()`-based tests never see the duplicate.
- `2026-07-18-d233-agent-collapse-fix-in-toggleagent-action-not-helper` — Refuted a "still broken" claim: the collapse lives in the action's guard, which short-circuits before the helper is reached.
- `2026-07-18-live-in-session-selected-state-uncovered-badge-only-assertions` — Dual-scope suites asserted only the saved config and re-opened badges, missing that a collapse drops the id from `domainSelections`.
- `2026-07-18-sourceById-collapse-unreachable-in-production` — Verified three ways that an id-keyed map cannot mis-stamp a source: tombstones filtered upstream, last-write-wins safe, unfiltered callers dead.
- `2026-07-19-module-load-time-homedir-capture-latent-mock-bug` — A root constant evaluates `os.homedir()` once at module load, so scope migration ignored test home-dir mocks and wrote to the real home.
- `2026-07-19-parsefrontmatter-crlf-and-invalid-yaml-null` — Two frontmatter extractors diverged: an LF-only regex silently dropped CRLF files, and the two disagreed on throwing versus null.
- `2026-07-19-type-position-vs-emitted-code-string-in-union-sweeps` — A grep-driven union sweep hits three traps: template strings that emit generated code, a same-valued field of another domain, and a literal ternary that widens.
- `2026-07-20-config-load-null-fallback-hides-vacuous-assertions` — `?? []` after a config load makes a negative assertion pass trivially when the config is absent.
- `2026-07-20-config-text-line-scanner-survives-behaviour-preserving-sweep` — A test proves a skill entry exists by filtering raw config lines for two substrings, so a line-break change reads as a product regression.
- `2026-07-20-e2e-agent-name-vs-display-constant-gap` — Skills had a three-form fixture but agents had only a display map, so specs re-declared names locally and readonly tuples were unassignable.
- `2026-07-20-e2e-session-ownership-hazard-in-shared-wizard-helpers` — Two incompatible cleanup conventions coexist, so extracting the byte-similar bodies leaves half the call sites double-destroying.
- `2026-07-20-e2e-shared-fixture-literals-scope-boundary` — The shared fixture has no stated applicability boundary, so adopting it for locally-written skills asserts a tracking relationship that does not exist.
- `2026-07-20-e2e-skill-constant-adoption-boundary` — Three shapes of spec-local skill constant with no rule saying which to replace.
- `2026-07-20-field-name-meaning-mismatch-marketplace-display-name` — A display field was assigned the owner's name and won a `??` chain over the curated label map, so the column rendered a person's name.
- `2026-07-20-filesystem-listings-must-print-on-disk-names` — The "Skills copied to:" block printed display names while the copier names directories by id, listing paths no user can `cd` into.
- `2026-07-20-invalid-by-design-metadata-fixture-is-permanent-renderer-carveout` — A fixture whose purpose is unparseable YAML can never come from a well-formed renderer, yet matches every metadata sweep's grep.
- `2026-07-20-rendermetadatayaml-fixed-field-order-changes-emitted-bytes` — The renderer builds lines positionally, so adopting it changed the bytes written despite every key and value being identical.
- `2026-07-20-single-scope-path-reported-for-scope-split-artifacts` — `agentsDir` was always the project path, so `list` printed "Agents: 9" above a directory holding zero after an all-global install.
- `2026-07-20-step-text-constants-must-mirror-asserted-string-not-rendered-string` — A constant held a prefix of the rendered string, so pointing positive and negative assertions at one constant would weaken whichever lost.
- `2026-07-20-page-object-speculative-api-and-misleading-method-names` — A mirror method added for symmetry had zero adopters, and one method named a toggle the product's idempotent handler does not have.
- `2026-07-24-d226-phase1-launcher-sugar-and-multiphase-home` — `CLI.run` hardcoded `HOME` to the project while the wizard defaulted elsewhere, and each launch allocated a fresh global home.
- `2026-07-24-d226-phase2-wave1-source-switch-lock-and-global-stack` — A project edit renders a global skill read-only, so a source toggle is a silent no-op that still exits 0.
- `2026-07-24-d226-phase2-wave2-uninstall-cwd-only-launcher` — `detectUninstallTarget` resolves from cwd with no scope argument, so uninstall finds nothing and exits 0 after an all-global install.
- `2026-07-24-d226-stepA-breaks-43-miscategorized-tests` — The plan's "~0-5 breakers" estimate was empirically 43 tests across 21 files.
- `2026-07-24-d271-edit-wizard-unnavigable-at-short-terminal` — The launcher hangs at 16 rows because the grid overdraws the sentinel and the position finder cannot parse the garbled frame.
- `2026-07-24-source-grid-clips-without-affordance-or-scroll-access` — The grid clipped with no affordance, welded viewport travel to focus, and omitted `overflow: hidden`, creating a latent measurement loop.
- `2026-07-29-dual-scope-collapse-unreachable-for-eject-pairs` — The builder pins both halves to eject, which a guard refuses, so the spec fails on a swallowed keystroke rather than the render under test.
- `2026-07-29-e2e-getoutput-is-not-a-frame-accumulator` — `getOutput()` reads xterm's processed buffer, which Ink overwrites in place, so a spec pressing a key to reach an earlier render can never retrieve it.
- `2026-07-29-qa-sweep-working-tree-v0144` — A 23-agent live-CLI sweep found `validate` exiting 1 on a healthy install and a documented hand-edit flow that never reconciles registered projects.
- `2026-07-29-settings-expected-keys-drift-from-cli-writes` — A settings key was missing from the expected list, so every run after a plugin install warned about a field the CLI's own operation had written.
- `2026-07-30-configwriteresult-globalconfigpath-declared-never-populated` — A declared optional field was never assigned and never read, so it type-checked as an available value that would hand `undefined` to the first caller to trust it.
- `2026-07-30-d277-global-immutability-collapses-tombstone-provenance` — Removing every route by which a deselect could mint a bare tombstone made a bare mask provably machine-derived.
- `2026-07-30-e2e-doc-inventories-pin-counts-and-names-nothing-verifies` — Every per-directory spec count in the E2E docs was wrong at once, and two docs stated an inverted `HOME=cwd` model that had been removed.
- `2026-07-30-flag-removal-not-covered-by-doc-touching-hook-table` — The hook table fires on a command being added or removed but not on its flags, so the reference advertised a withdrawn flag for two releases.
- `2026-07-30-known-limitations-not-revisited-when-a-fix-narrows-them` — A fix made part of a limitation false while its task stayed open, and nothing re-checks a limitation a fix merely narrows.
- `2026-07-30-negative-exhaustiveness-claims-in-reference-docs-go-stale-silently` — Three claims — "never consumed", "returns void", "two write sites" — all went false, because each asserts something about the whole codebase.
- `2026-07-30-no-default-exports-rule-collides-with-oclif` — The blanket rule has 23 repo-wide violations, all framework-mandated, so promoting it to a lint rule would have agents break command discovery.
- `2026-07-30-sibling-finding-left-open-when-its-duplicate-was-resolved` — The duplicate-detection key includes the date, so two findings on the identical defect filed months apart can never collide.
- `2026-07-31-confirm-step-viewport-is-zero-rows-at-short-so-overflow-spec-is-vacuous` — At 16 rows the clipping viewport measured zero rows, so a bleed assertion was vacuously true at every scroll offset.
- `2026-07-31-display-lookup-fallbacks-hide-invariants-in-ink-render-paths` — A `?? id` fallback collapsed "nothing selected" and "selected but absent" into one expression, though the second is unreachable.
- `2026-07-31-sources-tab-rendering-vocabulary-diverged-from-info-panel` — One helper treated a null baseline as "nothing is new" while another treats it as "everything is new", so on a first init the two surfaces disagreed.

### August

- `2026-08-01-eslint-flags-two-typescript-mandated-constructs-it-cannot-express` — Two lint errors are TypeScript-mandated, and the rule's escape hatch fails with a different compiler error.
- `2026-08-01-reference-docs-name-identifiers-that-no-longer-exist` — A reference doc named a renamed helper, claimed a deleted subscription, and omitted a live gate.
- `2026-08-01-unused-catch-binding-hid-a-discarded-validator-cause` — A validator printed "Failed to parse YAML" with the underlying error discarded, and a no-interpolation template literal marked a second dropped cause.
- `2026-08-05-default-stacks-has-no-doc-hook-and-counts-are-duplicated` — The stacks source appears in no row of the doc-hook table, so every structural-invariant number had rotted, and five union sizes live in two documents.
- `2026-08-05-roster-expectations-pinned-by-count-not-by-name` — An untyped expectation scattered a retired agent's 25 errors across four files instead of the one line holding the stale name.
- `2026-08-05-skill-summoner-partials-self-wrap-tags-the-template-already-adds` — Two partials open and close with tags the template already adds, doubling the wrappers.
- `2026-08-06-a-second-init-from-cannot-retune-an-already-global-sub-agent` — The global merge filters same-named agents out entirely, so a second `init --from` discards the payload's tuning and still exits 0.
- `2026-08-06-built-in-catalogue-invariant-2-described-a-shape-defaultstacks-never-had` — An invariant claimed all 1571 assignments carry an explicit flag against 1552 of which 135 did, and a task brief inherited the wrong figure.
- `2026-08-06-cli-reviewing-preload-row-outlives-the-lazy-checklist-design` — One skill kept its preload row while four newer siblings were lazy by absence, so one category had two loading behaviours separated only by authorship date.
- `2026-08-06-cli398-consolidation-left-dangling-reviewer-names-in-pm-prompts` — All four PM agents' prose still instructed deferral to deleted per-domain reviewers, so every compiled PM shipped an uninvokable handoff.
- `2026-08-06-comprehensive-and-thorough-is-mandated-by-the-summoner-and-the-prompt-bible` — A removed mandate was prescribed twice elsewhere, so the next summoner run would have reverted it. **Closed and deleted:** both sources were rewritten first, then the fifteen `identity.md` carriers that outlived them were swept to the proportionality voice.
- `2026-08-06-domain-agents-union-assumed-disjoint-rosters` — Per-domain rosters were flat-concatenated assuming disjointness; once every domain rostered the shared reviewer, a two-domain pick would carry it twice.
- `2026-08-06-e2e-selected-agent-name-assertion-cannot-fail` — A spec asserted three bare substrings against the whole generated file, all present for unrelated reasons, so it passes whether the union narrows or not.
- `2026-08-06-editor-added-skill-assignments-lose-their-only-category-source` — Re-plumbing a lookup deleted the added-skills branch, so a GitHub-added skill silently assigned to no agent, uncovered by any test.
- `2026-08-06-fresh-pick-scope-default-still-spelled-project-in-factories-e2e-and-docs` — After the default moved to global, two factories, a writer fallback, two specs and a doc still spelled the old value.
- `2026-08-06-relevance-rule-leaves-custom-source-skills-on-no-agent-stack` — A relevance ruling reaches past added ids: a custom source's own skills land on no agent's stack unless that source authors stack YAML.
- `2026-08-06-seed-contract-doc-describes-the-deleted-vendored-copy` — The contract doc still listed a deleted module and instructed readers not to do precisely what shipped.
- `2026-08-06-skill-id-prefix-lies-about-domain-for-meta-config-stack-detect` — One catalogue id is meta-prefixed but sits in a shared category, so any prefix-derived domain routes it to nobody. (The count it quoted has moved with the catalogue; the rule is in `reference/features/skills-and-matrix.md`.)
- `2026-08-06-the-api-framework-category-is-spelled-two-ways-so-a-suffix-rule-misses-four-of-five` — Four API frameworks sit in one category and one in another, so a suffix rule calls four of five non-frameworks.
- `2026-08-06-the-e2e-commands-tree-listing-was-short-by-eleven-files` — A tree listing claimed 31 files against 42 with a whole family missing, and its sibling claimed 54 against 56.
- `2026-08-07-a-selection-golden-exemplar-was-carried-by-a-rule-another-wave-deleted` — A contract's out-of-reach exemplar was held there by one rule; deleting it reddened both runners without weakening the semantics.
- `2026-08-07-apps-server-restates-the-shared-vitest-config-by-hand-with-no-recorded-reason` — A workspace restated three of four shared settings with nothing recording whether that was a decision.
- `2026-08-07-binding-a-workspace-to-the-shared-vitest-config-needs-an-undocumented-allowjs` — The shared config ships JS with no declaration, so every consumer needs `allowJs` and three workspaces each rediscovered it.
- `2026-08-07-cli398s-prose-sweep-stopped-at-the-pm-prompts-twenty-reviewer-names-still-dangle` — A clean-grep claim was generalised from ten fixed files to the whole tree; every other agent still shipped a deleted reviewer's name.
- `2026-08-07-docs-claim-typecheck-runs-at-pre-commit-no-hook-has-ever-run-it` — Two documents state TypeScript is checked on every pre-commit; neither hook has ever invoked it, and the claim was false when written.
- `2026-08-07-domain-order-and-descriptions-byte-duplicates-folded-into-matrix-package` — A package held byte-identical copies with an in-code comment admitting they were hand-synced, and the reason for copying had expired.
- `2026-08-07-message-constants-outlive-the-command-that-printed-them` — Six message strings no command prints, with a `toStrictEqual` key list making the residue read as maintained surface.
- `2026-08-07-retired-agents-survive-in-dist-and-a-hand-verification-can-read-them-as-shipped` — Four deleted agents survived in the build output, and the full suite plus every hand verification ran against them.
- `2026-08-07-the-planning-breadth-invariant-is-one-directional-for-the-two-ai-categories` — One category holds platform SDKs and capability skills together, so the bidirectional pin used for frameworks cannot express the ruling.
- `2026-08-07-the-shared-config-vitest-configs-were-in-no-tsconfig-and-lint-had-been-skipping-them` — Two workspaces had their vitest config in no tsconfig, so neither tsc nor the pre-type-aware ESLint ever checked them.
- `2026-08-07-two-empty-skill-directories-now-sit-beside-a-radio-that-would-admit-them-unaudited` — Two metadata-less husks would silently become a third member of a newly-exclusive radio the moment anyone added metadata.
- `2026-08-07-two-interactive-components-are-pointer-only-command-block-and-segmented` — One component's `copyable` added only a cursor style, and another was independent toggles rather than a radiogroup with roving tabindex.
- `2026-08-07-whitelist-verdicts-fire-against-local-skill-selections` — A lone custom skill made 50 catalogue skills report "only compatible with …", because a custom id no whitelist can name is indistinguishable from a wrong framework.
- `2026-08-08-a-consumers-table-names-five-of-the-ten-modules-that-import-the-predicates` — A "Consumers" table names five of ten importing modules, and the unqualified header is what turns the omissions into a defect.
- `2026-08-08-a-findings-two-specs-was-a-sample-and-the-row-scoped-from-it-inherited-the-undercount` — A finding's "two specs" was a sample, not a census; the fix turned seventeen assertions red.
- `2026-08-08-a-four-outcome-table-describing-three-checkers-was-right-about-two-of-them` — A table claiming to describe "all three cross-workspace checks" was false for one, which returns a different verdict for a missing config.
- `2026-08-08-a-workspace-leaves-a-shared-config-check-by-deleting-its-config-and-only-a-name-pin-notices` — Deleting a config moves a workspace to an exempt outcome, and the two suites' name pins omitted two workspaces.
- `2026-08-08-an-untracked-scratch-directory-inside-the-package-fails-eslint-for-the-whole-package` — A scratch harness in neither ignore list failed lint, and falling outside the config's scope its TypeScript was parsed as JavaScript.
- `2026-08-08-doctor-still-calls-a-loadable-but-content-less-config-not-found` — A detector returns null for a config declaring nothing, so doctor validated the file in one section and called it missing four lines later.
- `2026-08-08-four-commands-each-carried-their-own-copy-of-the-fan-out-summary` — Four commands each printed the propagated-recompile summary themselves, two differing only in singular versus plural.
- `2026-08-08-lattices-rows-and-cells-are-the-third-pointer-only-clickable-in-the-package` — The dialog's only staging control is a cursor-pointer div with no role or tabIndex, forcing its page object onto a CSS selector.
- `2026-08-08-one-component-marks-focus-and-nothing-says-it-is-the-rule` — Only one component declared a focus ring; every other control fell through to a base layer setting outline colour alone.
- `2026-08-08-six-docs-place-the-cross-scope-masking-helpers-in-the-module-they-left` — Seven sites across six docs place six helpers in a module that declares and imports none of them.
- `2026-08-08-step-text-member-count-in-two-docs-is-stale-and-self-certifying` — Two documents claimed 94 members against a live 109, with exhaustive lists short by the same twelve, beneath their own warning about short lists.
- `2026-08-08-the-focus-rule-is-written-and-five-controls-do-not-follow-it` — Auditing every focusable control against the newly written rule found five unmarked, one setting `outline-none` and delegating to wrappers that draw nothing.
- `2026-08-08-the-masking-helpers-were-not-the-only-thing-that-left-local-installer` — A symbol-by-symbol grep found a second, larger set of symbols still documented in the module they left.
- `2026-08-08-the-workers-test-pool-dropped-storage-isolation-and-fetchmock-and-the-suite-never-said-so` — A pool upgrade removed storage isolation and the fetch mock — KV now leaks between tests in a file — while leaving the mock types in the declarations.
- `2026-08-09-doctor-skips-orphan-check-in-the-one-state-that-guarantees-orphans` — The runner substitutes a skip whenever the config is null, which is exactly the state where every installed skill and agent is orphaned.
- `2026-08-09-e2e-source-seams-name-a-cache-helper-nobody-calls-and-an-env-var-that-does-not-exist` — The runner cleared one variable while the product reads another, so a developer's exported override was inherited into every run.
- `2026-08-09-inits-wizard-cannot-see-a-global-roster-the-dashboard-diverts-first` — `init` calls the dashboard check before the wizard and both route through the same detector, so the wizard's hydration branch can never be taken.
- `2026-08-09-logger-manual-mock-omits-log-so-any-test-reaching-it-crashes` — A manual mock declared three of the module's nine exports, so a module calling the missing one failed inside product code, reading as a product defect.
- `2026-08-09-select-domains-is-not-a-step-unique-e2e-sentinel` — A step sentinel also appears inside another step's description, so any unanchored wait on it settles on the wrong frame.
- `2026-08-09-the-built-in-matrix-names-a-skill-the-default-marketplace-does-not-ship` — The built-in matrix names a skill the live marketplace does not carry, so `eject skills` dies with an ENOENT naming a cache path.
- `2026-08-09-the-init-hook-resolves-a-source-for-a-reader-that-does-not-exist` — The init hook resolves a source before every command and writes it onto the config, but the reader has no production consumer.
- `2026-08-09-the-stack-plugin-install-path-has-no-production-caller-and-took-a-required-arg-anyway` — A three-function install path had no caller in source, yet a source-identity ruling was threaded through ~17 spec call sites.
- `2026-08-09-two-real-marketplace-suites-asserted-built-in-stacks-as-the-marketplaces` — Two suites pointed at the skills clone drove the CLI's own defaults because that clone ships no stacks file; only a comment recorded the substitution.
- `2026-08-16-a-landed-defect-kept-a-second-tracker-row-and-was-redispatched-as-a-go-live-blocker` — One defect held two tracker IDs; the survivor was re-promoted citing a marker converted six days earlier.
- `2026-08-16-a-test-comment-asserted-os-homedir-ignores-HOME` — A spec justified a spy with the claim that `os.homedir()` ignores `HOME`, which is false on POSIX and contradicted another finding in the same directory.
- `2026-08-16-built-in-matrix-defensive-copy-omitted-the-slug-map` — A defensive copy covered three collections but not the slug map, so every default-source load shared one map with the module constant for the process's life.
- `2026-08-16-every-cross-reference-finding-is-filed-against-the-categories-file` — All six health-check kinds are filed against one path, so a slug typo sends the author to a file that does not contain it.
- `2026-08-16-hand-maintained-json-schema-requires-a-field-the-type-does-not-have` — A hand-maintained schema declares and requires a field the type has never had; it is derived at runtime instead.
- `2026-08-16-seed-schema-header-claims-a-vendored-copy-that-does-not-exist` — A header says the CLI vendors the file and rests its rationale on that; the CLI imports it and the bundler inlines it, and a task brief was written from the false claim.
- `2026-08-16-the-dynamic-skills-matcher-proves-reach-not-laziness` — The matcher searches the whole agent body and the fixture renders no activation protocol, so it proves reach and is satisfied by a preloaded skill.
- `2026-08-16-the-seed-contract-cannot-carry-half-of-what-a-config-holds` — Six things a config holds that the payload cannot state; one is a real gap because absence and an explicit value resolve differently.
- `2026-08-16-unit-specs-read-the-ambient-config-on-disk` — Three unit specs resolve config from a directory no test owns, so one reads the developer's real config and another the repository's own gitignored one.
- `2026-08-17-a-locally-authored-skill-is-already-distinguishable-without-the-matrix` — A predecessor's "no refusal available" verdict was wrong: the installed metadata already answers CLI-copy versus user-authored offline.
- `2026-08-17-a-plans-line-numbers-rot-while-every-fact-in-it-survives` — A 13-day-old plan kept every symbol name valid while half its line citations rotted, one landing on a declaration naming a different constant.
- `2026-08-17-build-marketplace-writes-a-manifest-its-own-loader-refuses` — A `package.json` with no author writes an empty owner name at exit 0, which the schema refuses — and the consumer reports the file as missing. **Closed and deleted:** the build refuses before it writes, and `resolveMarketplaceLabels` now tells an absent manifest from one it could not read.
- `2026-08-17-catalog-emission-blocked-by-private-relationship-narrowing` — The only correct orchestration was private to one module; the public alternative merges the invoking machine's own skills into a published artefact.
- `2026-08-17-every-extra-passed-to-the-types-writer-is-labelled-custom` — The writer infers "custom" from an argument that on one path is the whole config, so the catalogue's own skills are labelled custom.
- `2026-08-17-exhaustive-tables-drift-because-nothing-re-derives-the-list` — Four exhaustiveness claims in the commands reference had drifted, plus a renamed field quoted as compilable TypeScript.
- `2026-08-17-find-on-a-discriminated-result-array-cannot-narrow-and-needs-a-second-guard` — a `.find` over a result union whose callback destructures the discriminant or reads the index returns the whole union, forcing a second guard; the lint flagged one of two instances, and fires only on the shape that already narrowed. The blanket claim in the title is wrong — TypeScript infers a predicate for a plain single-parameter callback; the measured boundary is `standards/typescript-types-bible.md` § 6a.
- `2026-08-17-two-branches-of-one-writer-answered-the-custom-question-differently` — Two branches of one writer filled the same argument differently, so one installation's generated types read differently depending on which compile produced them.
- `2026-08-18-a-from-scratch-column-can-name-a-fixture-seeded-variant` — A journey's three "from-scratch" specs all begin from a fixture-written config, so under the page's own definition the row has no proof at all.
- `2026-08-18-a-membership-list-nobody-registered-drifted-in-two-documents-at-once` — Eight claims contradicted source, notably one named at five members against seven in two documents while a third had been naming all seven correctly.
- `2026-08-18-the-exhaustive-table-defect-is-not-step-text-specific-and-named-two-deleted-symbols` — A table named two deleted symbols rather than merely omitting live ones, and three further enumerations in the same file were wrong.
- `2026-08-18-the-from-scratch-gate-condemned-three-rows-nobody-had-read` — The newly built gate condemned four journey rows, including one reading COVERED on all four surfaces for an arc no run had ever performed.

---

## THIN — 16

Trivially true, restating a written convention, or narrating a pass rather than reporting a discovery.

- `2026-04-21-changelog-0.42.1-orphan-release-file` — A changelog file holds real content but the index skips its version; no user consequence.
- `2026-04-21-ralph76-memory-md-stale-phase-entries` — An out-of-repo memory file carried stale phase reports; grooming advice, not a product defect.
- `2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse` — Records that a key on a persisted pair is a guarded no-op with a toast rather than the documented collapse.
- `2026-07-20-e2e-spec-files-accumulate-unused-imports-unenforced` — Six dead imports and an orphan JSDoc survived because no ESLint config existed and no tsconfig covered the tree.
- `2026-07-20-fixture-inlining-trades-one-local-helper-for-ten-copies` — Deleting a local arrange helper turned one line per test into eight repeated ten times; two documented rules pull opposite ways.
- `2026-07-20-shared-fixture-const-vs-file-local-const-adoption-boundary` — Adopting a shared fixture where a file-local constant exists is blocked by the no-reassigning-constants rule, with no written answer.
- `2026-07-20-toast-assertions-must-use-cursor-anchored-raw-waits` — Records the sweep that converted four toast reads to cursor-anchored methods — the follow-up its sibling had already specified.
- `2026-07-30-e2e-helper-extraction-threshold-unstated-for-file-writers` — Three extraction thresholds cover assertions and setup but none covers file writers, so a second local copy was literally permitted.
- `2026-08-01-count-ownership-registry-names-a-doc-that-does-not-carry-the-count` — The registry assigns a count to a document that holds the number only inside an HTML comment, with no live drift today.
- `2026-08-05-api-researcher-critical-reminders-missing-post-action-reflection` — One of 25 partials lacked a reflection block.
- `2026-08-06-skills-repo-format-check-red-on-preexisting-meta-reviewing-files` — Six pre-existing files in the skills repository fail prettier, so that repo's format gate was already red.
- `2026-08-07-the-web-pm-playbook-restated-a-methodology-partial-the-template-already-renders` — One playbook restated a partial the template already renders, shipping ~3KB twice.
- `2026-08-07-three-cli-389-batch-files-carry-summary-tallies-that-contradict-their-own-manifest-rows` — Three of twelve batch files carry prose tallies contradicting their own tables.
- `2026-08-07-turbo-build-from-root-fails-without-an-editor-env-file` — The root build fails without an env file, so the gate reds for reasons unrelated to the change under test.
- `2026-08-18-a-finding-quoting-editor-code-is-reformatted-by-the-clis-own-prettier` — A finding quoting editor code failed the format check because the findings directory sits under a workspace whose prettier config adds semicolons.
- `2026-08-18-every-surface-naming-the-marketplace-shows-what-was-typed` — The seat stores the visitor's spelling, so a pasted URL renders verbatim; the finding concludes nothing is wrong.

---

# Re-audit — second pass, 2026-08-18

The grades above came from one pass over what each finding **found**. A second, stricter pass
re-graded them against current source _and_ judged what each finding **recommends** — against the
NEVER rules in both `CLAUDE.md` files, the types bible, the e2e standards and the expressive-TypeScript
conventions. Every proposed change was then handed to an independent agent told to **refute** it, with
instructions to reject when uncertain. **29 changes survived.** They supersede the grades above.

**Seven findings prescribe an action current source contradicts.** That is the finding of this pass.
A right diagnosis with wrong advice is the dangerous combination, because the diagnosis lends the
advice authority — four of the seven would overwrite a correct document with its inverse, and three
would reverse a decision the repository made deliberately.

**Also corrected: this index was incomplete.** Seven findings were missing — four dropped in
transcription and three written during the documentation sweep itself. They are listed at the end.

# Re-Audit Closing Ledger

## 1. Advice that would do damage if followed

Seven findings prescribe an action that current source contradicts. Ranked by blast radius.

**`2026-08-08-edit-reports-an-unresolvable-skill-as-removed-while-preserving-it.md` — silent orphan files.**
Prescribes Option 1: exempt `unresolvableSkillIds` from `removedSkills` in `detectConfigChanges`. But `changes.removedSkills` is also the input to `applyPluginChanges` (edit.tsx:1209), `removeDeletedLocalSkills` (edit.tsx:1277) and `splitRemovalsByScope`'s confirm gate, while `writeConfigAndCompile` drops the config entry via the merger independently of `changes`. Exempting the ids drops the config entry, skips the plugin uninstall and the on-disk deletion, and prints nothing. Its premise is also gone — `config-merger.ts` has no exemption and CLI-450 closed the reporting gap.

**`2026-08-17-a-destructive-apply-must-be-told-what-it-does-not-own.md` — already caused a live doc contradiction.**
Proposed Standard 2 documents the "a shared apply keeps a globally installed entry" invariant as reaching `edit --from`. CLI-519 reversed exactly that: a project-scope `--from` now _removes_ the global install after disclosing its fan-out, `KeptReason` narrowed to `authored | unplaceable`, and `globallyInstalledKept` became `globallyInstalledRemoved(otherProjects)`. Following it is why edit.md:263 and scope-system.md:294 still carry an "Inherited global" kept-reason whose predicate `authority === "owned" && isActiveAt(entry, "global")` exists nowhere in `src/` — and contradicts edit.md:176-189 inside the same file.

**`2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse.md` — writes an inverted rule into `tombstone-pattern.md`.**
Prescribes recording that `s` is a guarded no-op on a persisted `[P][G]` row and that space is the only way to collapse. Source says the opposite: `toggleAgentScope`'s P→G branch unconditionally filters the tombstone (that _is_ the collapse), while `toggleAgent` returns `GLOBAL_AGENTS_LOCKED` on a dual-scope pair. The toast it quotes ("Installed at both scopes — use space to change project scope") was deleted by `a13c69dc` on 2026-07-29 and greps to zero. `tombstone-pattern.md` (227/233/252) already states the correct rule.

**`2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code.md` — same inversion, skill side.**
Its entire Proposed Standard is to rewrite the Undo Path section, which now correctly reads "`s` Is the Sole Dual-Scope Toggle". `toggleSkillScope` carries no persisted-pair guard at all — its P→G arm comment reads "always drop any excluded global tombstone for this id" — and two E2E checks now assert "`s` must collapse the persisted `[P][G]` pair to `[G]`". This file has no INDEX row; its sibling above is still graded THIN for the identical claim.

**`2026-08-07-design-tokens-fail-wcag-aa-contrast-on-every-amber-marked-element.md` — reverses a standing owner ruling.**
Diagnosis is still accurate and live (`--color-brand-ink: #a06a1c`, `opacity-40` dimming in lattice.tsx:58). The remedy — darken to ~#96631a, replace the opacity dimming, delete the `rules` entry in `preview.ts` — is refused in three independent places: `packages/ui/.storybook/preview.ts` ("Do not re-enable the rule expecting a token fix; none is planned"), `todo/www.md:78-82` under "Constraints already settled — do not undo these", and `todo/archive.md:495` closing EDITOR-23 by ruling. Grade stays STRONG; only the action is forbidden.

**`2026-08-07-a-skills-category-never-reaches-dist-or-the-marketplace.md` — writes a false claim into a reference doc.**
Proposed Standard 1 asks `plugin-system.md` to "state plainly that the built plugin and the marketplace entry carry no category". Since `4885e5ae` (2026-08-10) category flows metadata.yaml → plugin.json (skill-plugin-compiler.ts:140) → marketplace.json (marketplace-generator.ts:61), and plugin-system.md lines 77/86-87/317 already document that correctly. The only supporting evidence left is a stale `dist/` predating the commit.

**`2026-07-20-shared-fixture-const-vs-file-local-const-adoption-boundary.md` — mandates a hand-built id.**
Its rule "where a file-local const is kept, it must be initialised from a literal, never from `E2E_SKILL`" collides with `e2eSkillId`, which namespaces every fixture id as `${E2E_MARKETPLACE_NAME}-${bare}`; a literal therefore names a skill the fixture source does not publish. `test-data.md:95-96` already forbids it ("never by hand" / "not on a literal"). Both premises are dead too — `E2E_AGENT[...].name` exists and is used 364 times, and the finding's own named spec now reads `const REACT = E2E_SKILL.react.id`.

### Two UNSAFE flags that the challenger's own reasoning overturns

These arrived marked upheld, but the verification prose refutes the flag. Read them as **safe with a caveat**, not as hazards.

- **`2026-07-30-no-default-exports-rule-collides-with-oclif.md`** — the claim was that a `src/**/*.ts` block would _silently_ drop `VACUOUS_COMPARISONS` and `CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT`. It could not be silent: `spec-gates.test.ts` lints `src/cli/lib/content-validator.ts` inside that exact zone and goes red immediately, and the config-gate deep-import route has its own per-zone gate (L4 in `config-gate-enforcement.test.ts`, whose `GATE_PRIVATE_IMPORT` regex matches the dynamic form). Item 2 is advisory and elliptical anyway. Real action: add the block, spread the shared selectors like every other block does. Separately, the finding's own "Still open" note is stale — § 13.2 now carries the oclif exception.
- **`2026-08-08-a-workspace-leaves-a-shared-config-check-by-deleting-its-config-and-only-a-name-pin-notices.md`** — §2 was _adopted_, not refused: `git show c6a5a482` lands all three paragraphs in one commit. `no-suite`/`no-config` are literal `WorkspaceVerdict` arms only in the vitest and eslint checkers and are absent from the three-armed tsconfig checker, so the sentence has no subject there and cannot write a false escape route. Residual defect is descriptive only: the finding's table wrongly says all three checks have four outcomes.

## 2. Grade corrections

**Demoted to STALE (15)** — fix landed, file never updated; most still read `status: open` / "Fix Applied: None".

- `2026-07-30-component-tests-assert-text-presence-never-column-position` — STRONG → STALE: 6.17a is in clean-code-standards.md:314, quoting this finding's own grounding.
- `2026-07-31-fixed-height-blocks-inside-a-clipped-viewport-must-not-shrink` — STRONG → STALE: component-patterns.md carries the rule, Ink `flexShrink:1` default and the SkillAgentSummary carve-out.
- `2026-08-06-nothing-detects-a-workspace-that-stops-extending-the-shared-tsconfig` — STRONG → STALE: `scripts/check-shared-tsconfig.ts` shipped, wired into `deps:check` and CI, exits 0 live.
- `2026-08-06-skills-repo-never-validated-against-its-own-metadata-schema` — STRONG → STALE: all six slugs land, max `cliDescription` is 60/238, `api-search-getxapi` deleted, `validate-metadata.mjs` runs in skills CI.
- `2026-08-07-doctor-reports-a-config-that-exists-but-cannot-be-read-as-not-found` — STRONG → STALE: `ConfigState` routes unreadable configs to their own finding; `doctor-corrupt-config.e2e.test.ts` passes 10/10.
- `2026-08-16-a-vocabulary-negative-is-defeated-by-its-own-fixture-prefix` — STRONG → STALE: assertions.md:459 carries the section verbatim, mirrored at clean-code-standards 6.20.
- `2026-08-17-a-destructive-apply-must-be-told-what-it-does-not-own` — STRONG → STALE: CLI-519 reversed the invariant (see §1).
- `2026-07-30-known-limitations-not-revisited-when-a-fix-narrows-them` — SOLID → STALE: both proposals in documentation-bible.md (04d97287, a56722c4).
- `2026-08-06-the-api-framework-category-is-spelled-two-ways-so-a-suffix-rule-misses-four-of-five` — SOLID → STALE: category deleted 2026-08-09 (02e4488e); all five are `api-api`, so a suffix rule now misses five of five. The `isFrameworkCategory` proposal is still unimplemented and still sound.
- `2026-08-08-step-text-member-count-in-two-docs-is-stale-and-self-certifying` — SOLID → STALE: `check-enumeration-drift.ts` registers both STEP_TEXT rows (option 2 landed); option 1 stays open on the duplicated numeral.
- `2026-08-16-seed-schema-header-claims-a-vendored-copy-that-does-not-exist` — SOLID → STALE: seed.ts header rewritten, the Trap block is gone from seed-contract.md. (New instance found: monorepo-layout.md:679 still says "the vendoring rule between the two copies".)
- `2026-08-17-every-extra-passed-to-the-types-writer-is-labelled-custom` — SOLID → STALE: `isCustomSkill/Agent/Domain` all derive from the catalogue under CLI-516.
- `2026-07-31-focused-row-padding-defect-codified-as-a-test-rule` — ungraded → STALE: fixed in 0.147.0 (`rowStatusMarker`, `SKILL_NAME_WIDTH` 24→26); file still says "None to the product" / "RED on 0.146.0".
- `2026-07-20-shared-fixture-const-vs-file-local-const-adoption-boundary` — THIN → STALE (and UNSAFE, see §1).
- `2026-08-06-skills-repo-format-check-red-on-preexisting-meta-reviewing-files` — THIN → STALE: `format:check` is green in the skills repo; the six files were formatted by lint-staged in 786f3c8.

**Demoted to WRONG (3)**

- `2026-04-20-newly-toggled-agent-defaults-global-breaks-project-scope-stack` — SOLID → WRONG, ruled 2026-08-19; acting on it introduces a defect. It reports correctly that `applyAgentToggle` adds a newly-toggled agent with `scope: "global"`, and that `isScopePairCompatible` refuses a project skill to a global agent, so the agent lands with an empty stack. **Its prescribed remedy — inherit the install's dominant PROJECT scope — is rejected.** The owner ruled global is the correct default and **an empty stack is the correct outcome**, consistent with the CLI-442 ruling of 2026-08-08 that a fresh pick in a project edit defaults to global. The behaviour is deliberate, not a bug. `init` and `edit` already warn per skill, naming the skill that reached no agent and the agents whose scope blocked it.
- `2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse` — THIN → WRONG: true when written, inverted by `a13c69dc`/D-260.
- `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code` — no INDEX row → WRONG: same inversion, skill side.

**Demoted to THIN: none.**

**Promoted (7)**

- `2026-04-21-task-ids-in-test-names-sweep-needed` — STALE → SOLID: the lint-reachable surfaces are clean, but 143 `D-NNN` occurrences survive in test-body comments across 43 files, which no selector can reach. The sweep did not land.
- `2026-07-30-e2e-helper-extraction-threshold-unstated-for-file-writers` — THIN → SOLID: a genuine hole between three stated thresholds; anti-patterns.md still has no file-writer row and `writeCorruptConfig` now serves six specs.
- `2026-08-18-a-finding-quoting-editor-code-is-reformatted-by-the-clis-own-prettier` — THIN → SOLID: `semi:true` vs the shared `semi:false` is real, `format:check` is the first step of `prepublishOnly`, and both mechanical facts reproduce on prettier 3.9.6.
- `2026-08-07-no-craft-less-meta-skill-is-left-to-pin-the-row-is-the-whole-reach-rule-on` — ungraded → STRONG: verified real, proposal unwritten; one narrative paragraph has drifted (`planning: ["meta-methodology","meta-planning"]`).
- `2026-08-17-the-global-split-carries-the-whole-stack-when-no-global-agent-survives` — ungraded → STRONG: conditional `stack` override above an unconditional `...config` spread; the one-line fix is in the working tree.
- `2026-08-18-the-map-carried-a-covers-cell-and-two-file-counts-nothing-re-derived` — ungraded → SOLID: 380/151 and 266/223 re-derive exactly; the named violation is still in configuration.md:53.
- `2026-08-18-the-wizard-docs-still-describe-a-skillconfig-field-that-was-renamed-to-origin` — ungraded → STRONG (advice WEAK, see §3).

**Unchanged (5):** design-tokens-wcag (STRONG), no-default-exports-oclif (SOLID), workspace-leaves-shared-config-check (SOLID), skills-category-never-reaches-dist (STALE), edit-reports-unresolvable-skill (STALE).

## 3. Sound but unactionable

**A mechanism that cannot see its subject — 1 finding.**
`2026-08-18-the-wizard-docs-still-describe-a-skillconfig-field-that-was-renamed-to-origin`, Proposed Standard 3: use knip to catch page objects for screens no `useInput` binds. knip reports _unimported_ files, and the page object it was aimed at WAS imported — by the one method that drove it, itself dead — so `bunx knip --workspace packages/cli --include files` listed six unused files and never that one. `classMembers` detection is off by default and unconfigured in `knip.jsonc`, so a dead public method is invisible to it as well. Both symbols were removed by hand instead. Everything else in that finding verifies — the documentation half is actionable, the detector half is not.

No finding in this batch failed for "no enforcement point" or "too vague to follow". The nearest miss is the `isFrameworkCategory` helper in the api-framework finding: sound, unimplemented, and actionable once its now-stale premise is rewritten.

## 4. What this says about the corpus

Half the batch — 15 of 29 — was demoted to STALE, and eight of those had been graded STRONG, meaning the first pass was reading well-argued findings whose fixes had already shipped; the frontmatter is self-certifying (`status: open`, "Fix Applied: None") and no `partial_note` in this set survived contact with current source. Nine of 29 carried advice flagged UNSAFE, and seven hold up: four would overwrite a correct doc with its inverse and three would reverse a decision the repo made deliberately — the failure mode is a finding outliving the code it describes, not a finding being wrong when written. Six of 29 (21%) were never in INDEX.md at all, including two STRONG findings and one of the two inverted dual-scope files, so ungraded is not a proxy for unimportant.

---

## Findings this index originally omitted — 7

Four were dropped when the first pass was transcribed; three were written by the documentation sweep
after the slices were cut. Grades are from the re-audit where it judged them.

- `2026-07-18-dual-scope-s-toggle-persisted-pair-doc-vs-code` — **WRONG, advice UNSAFE.** Its whole Proposed Standard would revert a `tombstone-pattern.md` section that now correctly reads "`s` Is the Sole Dual-Scope Toggle".
- `2026-07-30-findings-rollup-has-no-snapshot-rule-and-schema-drifted` — SOLID. The regeneration procedure assumes a static directory that grew mid-pass, and three machine-detectable frontmatter defects sat outside the mandated scan.
- `2026-07-31-focused-row-padding-defect-codified-as-a-test-rule` — **STALE.** Fixed in 0.147.0; the file still says "None to the product" and "RED on 0.146.0".
- `2026-08-07-no-craft-less-meta-skill-is-left-to-pin-the-row-is-the-whole-reach-rule-on` — **STRONG.** Verified real, proposal unwritten; one narrative paragraph has drifted.
- `2026-08-17-the-global-split-carries-the-whole-stack-when-no-global-agent-survives` — **STRONG.** A conditional `stack` override above an unconditional spread; the one-line fix is in the working tree.
- `2026-08-18-the-map-carried-a-covers-cell-and-two-file-counts-nothing-re-derived` — SOLID. 380/151 and 266/223 re-derive exactly; the named violation is still live.
- `2026-08-18-the-wizard-docs-still-describe-a-skillconfig-field-that-was-renamed-to-origin` — **STRONG, advice partly WEAK.** Its documentation half is actionable; its knip-based detector cannot see its subject.

---

# Since the grading — deletions and additions

## Deleted

Every finding graded THIN, STALE or WRONG was deleted on owner instruction, and the accuracy
programme has been deleting each finding as it closes the defect. **A row above naming a file not on
disk is therefore expected**, and is the only surviving record that the finding existed.

**The 2026-08-19 accuracy-programme batch removed 119 files** — 131 triaged, 12 held pending
citation repair in `standards/e2e/`. Every one had a row here already, and every row stayed. The
corpus stood at 282 when the batch began and at 165 when it ended — the difference is smaller than
119 because passes running at the same time were writing new findings. Re-derive the current figure
with the command in the header rather than reading any number here as live.

**Before deleting, confirm the finding HAS a row here — and add one if it does not.**

This protocol was written assuming every finding was graded below, so that a row naming a deleted
file remained as its record. **That is false for anything written after the grading**: those have no
row, and deleting one erases it completely. The `grep -rF` step cannot catch this, because it asks
what still _points at_ the file and never what still _remembers_ it. A finding was deleted that way
in this programme before the gap was noticed.

So the first step is not the grep. It is: **does this finding appear below? If not, write its row
first** — one line naming what it found — and only then delete the file.

**Re-derive the census immediately before acting on it, not once at the start of the pass.** The
directory is not static during a multi-agent session: sibling agents file findings while a pass runs,
so a list enumerated at the start authorises a batch that no longer matches the disk by the time it
executes. This is why the check above is written **per file** rather than against a list captured
earlier — a per-file check re-reads the disk at the moment it matters, and an extracted list cannot.
The one count this file does keep is deliberately absent for the same reason: see the header.

**Check it with the extension STRIPPED**, per file, never against an extracted list:

```
grep -qF "${basename%.md}" .ai-docs/agent-findings/INDEX.md
```

Rows name a finding without its extension — 440 do, 9 do not — so a check carrying `.md` reports
"missing" for every finding in the corpus and invites a duplicate row for one already indexed. And a
check that _extracts_ the names and compares lists has produced a false census four times here, most
recently by truncating three basenames at their first uppercase letter. One literal match, per file.

**Deleting is not free, and the rest of the protocol is not optional either.** The first batch left **64 dangling
citations across 39 files**, of which the link-integrity scan caught exactly one — 51 were body prose,
11 `affected_files:`, 2 `partial_note:`. So: `grep -rF "<basename>" .ai-docs/ src/ e2e/ scripts/`
**before** removing anything, then judge every hit — a fact to write into the citing sentence, a bare
cross-link to drop, or a sentence that is itself now false and must be corrected. Three were, in that
batch alone.

**Those four directories are the scope, and `changelogs/` is deliberately outside it — with one
exception, added 2026-08-19: a dangling markdown LINK is downgraded to plain text.** Keeping the
words costs nothing and preserves the record; keeping the brackets offers a reader a pointer that
resolves to nothing. Twenty-seven such links across six changelogs were de-linked in that batch,
some of them dangling since a prune weeks earlier. Nothing else in a release note is rewritten. A release
note naming a finding records what that release closed; it is a dated statement about a past
version, and it stays true after the file goes. Rewriting one would falsify the record of what the
release said. The 2026-08-19 batch left 32 such references across eleven changelogs, all correct.

**Grep the whole repository anyway, then classify.** The same batch scoped its sweep to those four
directories plus `todo/` and the sibling workspaces, and missed `changelogs/` entirely — a whole
directory, invisible because the scope was copied from this paragraph rather than re-derived. A
repo-wide `grep -rl` with `node_modules`, `.git` and `dist` excluded costs seconds and turns the
scope from an assumption into a result. Sort the hits three ways: live citations to repair,
changelog entries to leave, and hits inside files that are themselves in the same deletion batch —
that last group is the reason a naive count reads alarmingly high.

**Two of the three steps now have a mechanical form, and neither reads git state.**

`scripts/check-finding-citations.ts` is the grep step's `todo/` half, made runnable. It reads every
citation of a finding basename out of `todo/` and `packages/cli/changelogs/` and asserts it resolves
in `agent-findings/` **or** `agent-suggestions/` — the second directory is load-bearing, because a
suggestion is dated and named exactly like a finding, so a scan reading only one of them calls every
citation of the other dangling. `changelogs/` is covered for LINKS only, which is this section's own
ruling written out. **It does not replace the by-hand `grep -rF`**: `.ai-docs/` is deliberately
outside its scope, and not by oversight — this file names deleted findings on purpose, so a scan over
this tree would report its own archive as the defect. What it covers is the one directory the
mandated grep was never briefed on, which is where a dangling citation costs the most.

`scripts/check-findings-frontmatter.ts` is the frontmatter half, and it is wider than the three keys
`TEMPLATE.md` rule 3a names. It fails on **any** value under **any** key that names a file and does
not resolve — so `supersedes:`, `superseded_by:`, `blocked_by:`, `affected_files:` and
`standards_docs:` are covered at once, stated as a property of the value rather than as a list of
keys, which is what keeps a key added tomorrow covered today. It also reports two findings sharing
`(affected_files, root_cause, date)` with no cross-link between them, and any symbol a `partial_note:`
or `resolved_by:` names that the tree no longer declares.

**The step with no mechanical form is the first one, and it is the one that erases a finding
outright: does this file have a row below?** Both scans ask what still POINTS AT a file. Neither can
ask what still REMEMBERS one. Write the row first, then delete.

## Added by the accuracy programme — 47

These postdate the grading and are ungraded; each was written by the pass that found it.

- `2026-08-18-the-bible-names-one-surviving-task-id-and-the-tree-holds-two-hundred` — the bible's task-ID rule named one remaining offender and the tree holds hundreds of citing lines across both source and documents, several of them section headings. A sweep scoped to that sentence reports the class closed. The rule now carries the two greps that re-derive the backlog; read the scale off those, not off this row or that file.
- `2026-08-18-deleting-a-finding-leaves-its-index-row-and-both-directions-have-drifted` — this index drifts both ways when findings are deleted or written, and nothing checks it.
- `2026-08-18-a-findings-citation-carries-the-fact-and-nothing-checks-it-resolves` — most citations are load-bearing prose, so a deletion destroys facts rather than links; the scan reads frontmatter keys and catches 1 in 64.
- `2026-08-18-a-comment-in-a-cli-type-file-is-a-write-into-another-workspace` — `src/cli/types/{skills,matrix}.ts` are vendored byte-for-byte into `packages/matrix`, so editing a **comment** leaves the vendored copies stale and three script tests red.
- `2026-08-18-a-message-that-hands-out-an-invocation-is-only-checked-by-running-it` — specs covering the `compile` refusal stayed green while it named a command that exits 127, because they matched the lead-in rather than asking whether the command exists.
- `2026-08-18-a-scratch-file-joins-the-lint-run-only-when-its-name-ends-test-ts` — a scratch `.ts` outside the source trees is skipped; only `*.test.ts` and `*.test.tsx` reach outside, because naming an extension is what makes ESLint's walk find them.
- `2026-08-18-a-sweep-grep-excluding-findings-by-line-dropped-a-live-hit` — `grep -rn` prints `path:line:text`, so piping to `grep -v` filters the **text** as though it filtered the **path**; it produced a false "zero hits" on real drift.
- `2026-08-18-a-partial-manual-mock-spawns-inline-copies-of-itself` — a manual mock declaring four spies against eight exports makes callers hand-roll their own partial copies.
- `2026-08-18-half-the-health-check-routing-table-cannot-be-reached-through-a-source-on-disk` — three of the six matrix-health findings cannot be produced by a marketplace on disk, so the `never` default is the only thing holding half the routing table.
- `2026-08-18-the-e2e-constants-still-describe-doctors-withdrawn-blanket-skip` — the constants comment asserts a skip the scoping change removed, the constant keeps the old name under the new value, and the behaviour that replaced it has no assertion anywhere.
- `2026-08-18-the-task-id-ban-exempts-findings-but-never-rules-on-agent-suggestions` — the task-ID rule exempts `agent-findings/` and never mentions `agent-suggestions/`, which holds four citations of the same dated-evidence kind, so a census reads that directory as in scope by omission. Carries two corrections to the census above: the source-side file count excludes four `SHA-256`-only files, and there are four ID-bearing headings, two of them in `tombstone-pattern.md`.
- `2026-08-18-the-withdrawn-source-flag-survives-in-six-reference-docs-beside-the-page-that-refutes-it` — `--source` / `-s` were withdrawn without an alias and oclif refuses them, but six reference documents still describe them as live, one as a section heading, while two other pages state the correction outright. A removal sweep has to be read rather than run: the surviving mentions split into false claims and quoted refusals.
- `2026-08-19-a-zero-caller-test-helper-accumulated-five-doc-rows-a-trap-and-a-known-limitation` — a helper with no callers had five documentation rows across three files, one of which promoted it to a repository-wide invariant ("the cache segment is written twice") with a numbered limitation and a named Trap; the Trap's evidence was a spec that does not exist.
- `2026-08-18-a-suites-env-isolation-clears-the-withdrawn-variable-and-never-the-live-one` — `source-loader.test.ts` deletes `CC_SOURCE` four times and never `CC_MARKETPLACE`, the name `readEnvSource()` actually reads, so the isolation is a no-op in both directions and nothing goes red either way.

- `2026-08-19-a-marketplace-with-no-plugins-is-written-and-then-refused` — the surviving half of the producer/consumer disagreement over `marketplace.json`: `build marketplace` writes `"plugins": []` and exits 0 announcing it, while `marketplaceSchema.plugins` is `min(1)`, so the file this CLI called a success is one it will not read back. Two of the schema's three constrained fields are guarded before the write; this is the third.
- `2026-08-19-an-absence-check-tested-the-parent-directory-and-answered-a-different-question` — `fetchMarketplace`'s "not found" guard named `.claude-plugin/marketplace.json` and tested `.claude-plugin/`, so a plugin repository shipping `plugin.json` alone was reported as having a manifest. Harmless while every failure collapsed into one sentence; a new false statement the moment absence had to be reported apart from invalidity. Fixed.
- `2026-08-19-a-doctrine-rewrite-reached-the-definition-and-not-the-template-people-paste` — `prompt-bible.md` § 8.5's delegation template still handed out "include all relevant edge cases; go beyond the minimum" after Technique #6 above it had retired that exact shape and its ten cross-reference sites were aligned. The copy-paste site has the higher duty cycle and shares no phrase with the retired wording, so a phrase-grep verification cannot see it.
- `2026-08-19-the-exemplar-named-as-the-fix-still-tripped-the-grep-written-around-it` — the reviewer partial cited as the exemplar for removing repo-internal paths still named `.ai-docs/agent-findings/` in a parenthetical reading "for this repository" — which resolves, in the installing project, to theirs. Running the check before writing the rule around it returned seven hits, not the six briefed.
- `2026-08-19-a-generator-formatted-its-output-directory-so-its-gate-judged-two-files-it-does-not-own` — both generators ended with `prettier --write <dir>`, so `generate:schemas` reformatted the two hand-maintained schemas it does not own and its gate went red for them; the only statement of that coupling was a `$comment` inside one of the reformatted files, which now outlives the behaviour.
- `2026-08-19-five-producers-assemble-a-stack-and-only-one-ordered-its-keys` — a share round trip reproduced its configuration field for field and compiled a different `web-developer.md`: five modules assemble `config.stack` and only `buildAgentStack` ordered its keys, so `init --from` — which replaces the ownership-derived stack wholesale — emitted the same curation in the payload's order, and the compiled activation table follows that order. `api-developer.md` stayed byte-identical because its one reordered row was preloaded and so lands in frontmatter rather than the table. Fixed at the writer, where the top-level field order was already canonicalised for word-for-word the same reason.
- `2026-08-19-the-editor-mints-a-marketplace-ref-the-cli-reads-as-a-local-path` — the editor's marketplace field carries the placeholder `owner/repo`, stores what is typed verbatim, and mints it as the payload's `marketplace`; `validateSourceFormat` routes anything with no protocol prefix to local-path resolution, so `init --from` refuses with `Local marketplace not found: '<cwd>/acme/private-skills'`. Every custom-marketplace id the editor mints is uninstallable. Neither suite can see it: the editor's fixtures use `acme/skills` and the CLI's use an absolute directory, so both exercise a real form of the field and no run carries the editor's form into the binary. Second consequence, same root cause: the unnormalised ref is also the slot key, so one repository named both ways occupies two entries, each with its own copy of the PAT. Fixed in the editor, which was minting the wrong thing — the CLI's routing is correct and a bare `owner/repo` is a legal relative directory that must go on meaning one. Normalised where a ref ARRIVES rather than where one is minted: the dialog, an arriving payload's ref, and the read of the stored slot all pass through one formatter built on the parser that already stripped these prefixes, so the mint, the storage key and the credential lookup are one string. Stored slots are re-keyed on that read and the shape version bumped so the rewrite is persisted at once; two spellings collapse into one entry, and an empty token can never replace a held one.
- `2026-08-18-a-satisfies-annotation-hid-three-lists-and-one-was-already-a-skill-short` — the drift checker's `unwrap()` read through `as` and parentheses but not `satisfies`, so `[...] as const satisfies readonly T[]` — this codebase's house style for a vocabulary array — enumerated nothing and any row naming one failed hard rather than judging. The shapes it could not read were the ones most worth reading: the first list the widening unblocked, `mock-data.md`'s `SKILLS` table introduced as "the single source of truth for all test ResolvedSkills", named ten of eleven keys, and the missing one was the only shared-domain skill in the fixture set.
- `2026-08-18-the-e2e-fixture-writes-an-agent-template-nothing-ever-renders` — the E2E fixture writes an `agent.liquid` under a comment reading as a standing obligation to mirror production, and `createLiquidEngine` builds its roots from the project and the CLI only, never from a marketplace source, so every E2E-compiled agent comes out of production's template. The fixture's file is also structurally unrenderable — it includes a `_partials` directory that exists nowhere in the tree — and a finding that reasoned from it reached the opposite conclusion about what the dynamic-skills matcher proves.
- `2026-08-19-a-deleted-loader-is-documented-as-live-dead-code-with-an-instruction-not-to-call-it` — `skills-and-matrix.md` documents `loadAndMergeSkillsMatrix` across four passages, one of them the instruction "Dead. Do not call it, and do not add the first caller." The function does not exist; the module exports three under a heading claiming all four; and the auto-synthesis reachability argument leans on a route through it that is now inexpressible rather than merely untaken. A deletion inside an already-hooked directory fires no doc hook, and the entry's own defence reads identically whether the function is dead or gone. Documents corrected; the residue is its second proposed standard, still unimplemented — `matrix-loader.ts`'s exports are not registered in `scripts/check-enumeration-drift.ts`, which would have reported `namedButAbsent` the day the function went.
- `2026-08-19-a-phantom-result-field-survived-the-sweep-that-reported-it-closed` — `ConfigWriteResult.propagatedProjects` appears nowhere in source, yet two reference pages named it and one declared it in a copyable code block, immediately above prose describing the real `propagation: GateReport` field correctly — a page contradicting itself across a blank line, while a third page carried the correction. The same page also credited `init.tsx` and `edit.tsx` with calling `recompilePropagatedProjectAgents`, whose only caller is the config gate's lazy import.
- `2026-08-19-a-proposed-standard-aged-into-a-wrong-instruction-before-anyone-adopted-it` — a finding's Proposed Standard told authors to assert an Ink error boundary's message on `lastFrame()`. True against Ink 5; under Ink 7 the exit path the caught throw triggers writes a bare newline as its own final frame unconditionally, so the painted error is the frame before teardown and the advice produces a red test read as a product regression. Findings are frozen by design, so a Proposed Standard is evidence of a rule rather than the text of one.
- `2026-08-19-a-registered-enumeration-has-an-unregistered-second-copy-in-another-document` — `check-enumeration-drift.ts` binds `scope-predicates.ts`' exports to the table in `features/configuration.md`, which names all eight; `concepts/scope-system.md` carries a second table of the same enumeration that nothing binds, and it named seven. A registry row names one document, so the guarded copy and the unguarded copy can only disagree in one direction, and a pass that runs the checker green has confirmed one document and learned nothing about the others.
- `2026-08-19-a-runtime-claim-was-measured-on-one-of-the-two-runtimes-the-suite-uses` — the `isolated-home` helper's JSDoc and a later finding give flatly opposite answers on whether `os.homedir()` honours `process.env.HOME`, and both measurements are correct: node re-reads `$HOME` on every call, bun resolves it once at startup and ignores later mutation. This package runs its tests under both, so a spec isolating only the environment variable reads the developer's real home under one runtime and the fake one under the other. Each document read alone settles the question; the correct construction is both mechanisms, and neither asks for it.
- `2026-08-19-find-does-narrow-over-a-result-union-and-the-lint-fires-on-the-shape-that-already-did` — a blanket ban proposed on `.find` over a discriminated result array would have condemned correct code. Probed against this repository's compiler: `(f) => !f.ok` and block-bodied callbacks narrow; destructuring the discriminant away or reading the index parameter is what drops the inference. The lint signal inverts too — `no-unnecessary-condition` fires on the second guard precisely where the inference landed, so a green lint on `x && !x.ok` is evidence of the bad shape rather than of its absence.
- `2026-08-19-five-class-fixes-were-scoped-to-the-file-the-defect-was-found-in` — writing five standing findings up as rules meant running each rule's grep over the tree for the first time, and every one returned a live hit: each code-side fix had been scoped to the module the defect was found in rather than to the class it belonged to. Three classes have since closed — byte-wise ordering for committed generator output, `.exactOptional()` at parse boundaries (the § 4a census now returns zero across both `src/cli/` and `packages/matrix/src/`), and an id split into category and slug in an E2E spec — as have both smaller residues. Two are live: `z.string() as z.ZodType<T>` in five positions of `schemas.ts`, which wants an owner ruling on which ids are closed vocabularies before it can be a task, and an unobservable cause named in `resolveSkillForPopulation`. The finding turned out to be its own specimen: its class-3 block named the extent as four sites "all in `plugin-settings.ts`", and a later repair pass read that as the worklist and scoped itself to that one file.
- `2026-08-19-the-deletion-protocols-safety-net-does-not-cover-findings-written-after-the-grading` — the deletion protocol rests on "a row naming a file not on disk is the only surviving record that the finding existed", which holds only for the findings graded on 2026-08-18. Anything written since has a row only if a pass remembered to append one, so deleting one of those erases it entirely, and the protocol's `grep -rF` step cannot catch it because it asks what still points at a file and never what still remembers it. The census was ten when taken and eleven when re-run, the eleventh being the finding itself.
- `2026-08-19-a-doc-pass-verified-a-symbol-that-was-deleted-before-the-pass-finished` — `extractSourceFlag` was read, confirmed in `hooks/init.ts` and written into a corrected paragraph; a concurrent sweep deleted it minutes later, along with the whole pre-parse argv boundary `boundary-map.md` § 1.2 documents. The bible's identifier check is specified per name, which reads as check-as-you-write, and at that moment it passed — only a pass-level re-run at the end can see it. The worse half is silent: the section's architecture claims went stale with no path, count or other symbol changing.
- `2026-08-19-the-owned-count-rule-names-totals-so-four-per-directory-copies-sat-outside-it` — `DOCUMENTATION_MAP.md` owns the E2E file totals and says so, but `e2e-infrastructure.md`'s tree diagram carried four per-directory counts: a slice of an owned aggregate shares no number with it, so a restatement check finds no collision. Three of the four were right on the day, which is what makes the fourth read as one stale figure rather than four copies to delete. The 56-name command list under it was short by one, and the absentee was a spec this same programme added, so the count and the membership drifted together and neither could contradict the other.
- `2026-08-19-three-more-paraphrased-parser-negatives-outlived-the-one-that-was-swept` — sweeping `not.toContain("unknown flag")` off the commands suite was scoped to that one paraphrase, and three siblings sit in the same `it()` blocks: `"unexpected argument"` at fifteen sites, `"missing required arg"` at five and `"crash"` at two, each measured against the real binary and each holding for every outcome. `missing required arg` is the sharpest, because oclif prints the count inside the phrase, so a reader checking it against a remembered message confirms it. In four files a vacuous negative now sits directly beneath a discriminating one and nothing distinguishes them by shape.
- `2026-08-19-the-harness-curated-what-went-into-a-spawned-binary-and-never-what-it-left-behind` — every E2E spawn site documents the variables it sets for the binary and none had asked what the binary writes AFTER it exits: `plugin-warn-if-update-available`'s init hook ends by spawning a detached, unawaited child that writes `<cacheDir>/version`, which under a fake HOME lands inside the tree a spec is watching. Measured at 16ms after the parent exits, so the one spec that snapshots a tree twice had been racing it for the life of the suite and read as a regression in a command that had not changed. Three spawn doors, not one. Fixed at all three; the snapshot helper was deliberately NOT taught to filter the cache dir, because that snapshot is now the only thing that would notice the switch failing.
- `2026-08-19-a-discard-that-reports-at-migrate-time-is-silent-at-merge-time` — zustand's `persist` opens `migrate` only on a version mismatch and hands the raw state to `merge` otherwise, so a persisted store has two discard doors and a rule naming "the discard branch" names neither in particular. `marketplace-store` reports at the door it does not need and is silent at the one it does: `readSavedMarketplaces` answers an unparseable slot with empty state and says nothing, and what that slot holds is a PAT shown once. `config-store`'s `merge` already carries the shape to copy — it distinguishes an absent slot from an unreadable one so the report is not filed against every first visit. Nothing is losing data today; a shape change shipped without a version bump is what makes the silent door the one every browser arrives at.
- `2026-08-19-a-second-partial-manual-mock-survived-because-nothing-compared-it` — the predecessor fixed one manual mock and wrote the class up; the directory it took that instance from held exactly two files, and the second was short by two exports. Closed by the export-parity spec the predecessor had parked, which reads both sides off the modules themselves and asserts that its own roster of mocks IS the glob's output. The durable rule is about fixes rather than mocks: when a finding names a file as an instance of a class, the fix sweeps the class or the finding says why it did not.
- `2026-08-19-the-forgotten-stub-class-was-five-times-larger-than-the-spec-that-reported-it` — installing the default-refuse guard its predecessor proposed reddened four more green tests the same day, all reaching the worker's config mint unstubbed. One reported, five real. The mechanism the predecessor could not name is that a file's stub list is written for the subject the file is named after: in one file the omission is a sibling describe sitting between two that stub, in the other it is two tests that open a dialog for a reason having nothing to do with the network. That measurement is the argument for a structural guard over a review habit.
- `2026-08-19-a-discard-report-copied-verbatim-carries-the-key-the-visitor-typed` — a zod issue path is only safe to report in full when every segment it can produce is the schema's own vocabulary; where the schema is a record keyed by user input, a path segment IS the user input. Fixed in the marketplace store and pinned by an assertion on the output rather than on the expression. The census over the four production sites found a second live one whose own comment states the rule it breaks — the catalog reader joins the whole path of a record keyed by a private marketplace's skill ids.
- `2026-08-19-a-substring-match-over-a-multi-line-refusal-is-satisfied-by-one-line-of-it` — a new spec asserted the one refusal line naming the skill under test and passed over a fixture that had broken every other skill in a 238-skill catalogue, because a per-item refusal makes noise and signal the same KIND of line. The count line is the discriminator and was never read. Second half, extending the installed-content fixture finding in the other direction: a fixture standing in for FETCHED content must satisfy what the CLI reads from it, not merely what a copy needs to start.
- `2026-08-19-zod-path-joins-leak-marketplace-owned-record-keys` — the standards table that decides what a discard may report marked `persistedConfigSchema` "Safe to join: Yes", and a live leak sat under it: the justification argues from `externalSkillId`, while `onlyPersistableSkills` filters external skills OUT and keeps the SEATED catalogue's ids, so the proof inspects precisely the class of id that never reaches the slot. Three sites fixed, and the third is the one no `issue.path` census can reach — `reportPruning` sent a marketplace-owned stack id as a bare VALUE under a comment claiming nothing there describes the user. Two durable rules beside the correction: where the report goes decides that a leak occurred and adjacency to a credential only decides how bad it was; and a guard is only as deep as its fixture, because `catalog.test.ts` held the right assertion and sat green for months over a fixture that broke `skills` at the top level, where a one-segment path can never contain a record key. Supersedes the finding that certified the leaking row. Filed as the first `premise-expired` — the rule was correct when written and the marketplace seat invalidated the fact it rested on, with nothing to notice.
- `2026-08-19-a-reader-that-half-parses-a-cell-manufactures-a-defect-in-a-correct-document` — `check-enumeration-drift.ts`'s `table-rows` reader mapped one row to one member, and a cell naming several survived the greedy end-anchored call-signature strip as the first name alone, so `` `agentsPath(dir)` / `skillsPath(dir)` `` reduced to `agentsPath` and the checker reported `skillsPath` — which the document plainly carried — as unnamed. A checker that reads half a cell and reports the other half as missing is worse than one that refuses, because the repair it invites is editing a correct document. Now `AMBIGUOUS_MEMBER_CELL`, matching the posture `UNNAMEABLE_REEXPORT` already set for `export *`. The document that produced it was rebuilt one export per row, and re-deriving it found a seventy-second export the repaired membership had missed.
- `2026-08-19-the-trackers-cite-findings-by-name-and-no-integrity-check-looks-outside-ai-docs` — nothing outside `.ai-docs/` checked that a finding cited by name still existed. Censused 89 finding-shaped basenames cited from `todo/`; 15 did not resolve, of which two resolve in `agent-suggestions/` and one is a substring of a longer plan filename, leaving **12 genuinely dangling across six documents** — one of them inside the row recording the previous batch's 64. Closed by `scripts/check-finding-citations.ts`, which scans `todo/`, treats `changelogs/` as links-only per the ruling above, and resolves against either findings directory; all twelve were repaired and it now reports `examined=201, dangling=0`. **This row was written after the file was deleted**: the delete ran even though the row-write step had failed, which is precisely the erasure the protocol above exists to prevent.
- `2026-08-19-a-partial-note-claims-a-pending-fix-and-nothing-re-derives-it-against-source` — `2026-04-21-propagation-skipped-observability-gap` has carried `status: partial` and a `partial_note` calling its own Option A pending for roughly four months; the always-visible `warn()` it asked for shipped under a different task, in a different module, as `registeredProjectUpdateSkipped` at `compile.ts` → `reportPropagation` and `uninstall.tsx` → `updateRegisteredProjects`. The same note pins the claim to `writeScopedConfigs`, which no production module declares — `writeScopedFromWizard` replaced it, and the surviving name is a shim inside `local-installer.test.ts` plus the `A_NAME_NOTHING_DECLARES` constant a guard self-test uses for precisely this shape. This is the SINGLE-finding form of the known failure mode: with no second finding over the defect there is nothing to disagree with the note, and every check over this directory is per-file and structural, so none of them reads prose about code. The proposed rule binds the re-derivation to EDITING a finding rather than to resolving one.
- `2026-08-19-a-proposed-standard-about-metadata-yaml-contradicts-a-written-rule` — an unwritten residue of `2026-08-10-a-known-gap-pinned-as-an-arity-assertion-is-invisible-to-grep` would have put "`metadata.yaml` is a generator input rather than a shipped artefact" into `clean-code-standards.md`, where 15.15 already asserts the opposite about the same file. Both are true of different install paths and neither says which it means, which is the actual gap: on the eject path `injectForkedFromMetadata` writes the file and `extractLocalSkill` answers `null` without it, so the skill is not discovered at all; on the plugin path `compileSkillPlugin` reads it as a build input and copies only `SKILL.md`, `SKILL_CONTENT_FILES` and `SKILL_CONTENT_DIRS`, none of which include it — and `computeSkillFolderHash` hashes the same two constants, so a metadata-only edit moves no version. Left unresolved on purpose: whether the plugin path's omission is deliberate is a product question about `share`, `edit --ui` and `uninstall`, and the answer decides whether this is a wording change or a defect report.
- `2026-08-19-a-rule-enforced-at-three-layers-leaves-a-mutation-of-the-named-one-invisible` — a spec commissioned to prove `isScopePairCompatible` was mutated against it and **every filesystem and config assertion stayed green**: two further layers keep a project skill off a global sub-agent independently, and only ONE of the three calls the named function — `splitAgentStack` and `buildCompileAgents` re-express the rule as membership of the global skill-id set, so no grep for callers finds the layers that hold the line. Only the two warning sentinels reddened, and they reddened by going silent, because `findUnassignedSkills` reads the saved `stack` rather than the scope rule. An assertion on the final artefact proves the CONTRACT and nothing about any single enforcement point; the corollary is the useful half — the layer whose red is the only red names the assertion that is load-bearing for it, which here is the one that reads as decorative.
- `2026-08-20-focus-walk-presses-before-it-looks` — `BuildStep.focusSkill` pressed Tab and then read the screen inside a 50-press budget, so it walked a full 33-category lap off a target already focused and, when a repaint landed after the read, passed that target unseen with too little budget left for the second lap. Every spec asserts where focus ENDED, which a walk of the whole grid satisfies, so only the runner's slowness ever showed it — CI 32338714325, failing roughly three attempts in four and absorbed by `retry: 1`. The helper now looks before it presses, confirms each Tab against the screen, and terminates on a real lap rather than a press count; `TerminalSession` gained a keystroke ledger so what a navigation helper SPENDS is observable at all.

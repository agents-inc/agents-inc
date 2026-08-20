# Open rulings — parked by the accuracy programme, 2026-08-19

Twelve findings whose remaining work is a **decision**, not an implementation. Each was verified
against source: the mechanical half has landed in every case, and what survives is a question only
the owner can settle. They are parked rather than closed because the finding files are still on disk
and still describe live behaviour.

**Read the finding before ruling** — each names its own options, and several say outright that the
change cannot be taken unilaterally.

## 1. `2026-04-22-error-swallowing-systemic-gap`

Three of the four warn-and-continue sites are still live, but turning them into hard errors
changes shipped failure behaviour across `edit`, migration and compilation, and amending CLAUDE.md
§ Data Integrity to say which failures are fatal is the owner's call.

**Evidence.** edit.tsx still `this.warn(\`Could not update config: …\`)`and continues; :1352 still warns on`Agent recompilation failed`; mode-migrator.ts/148 still `warnings.push(...)`with the caller only
logging. CLAUDE.md still carries only the plugin-install hard-error rule, and no "Error Handling
Boundaries" section exists anywhere. The one bullet the finding flagged as needing a decision has
since been answered on its own:`propagateGlobalChangesToProjects`(moved to
src/cli/lib/config-gate/propagate.ts) now returns`{ updated, skipped }`and`edit`renders it via`reportPropagatedRecompile`.

## Whether an aborted wizard session must pin `EXIT_CODES.CANCELLED`

The finding this came from has been deleted — both E2E rules it called pending have since landed, and
its subject is closed. What survives is the one question it handed to the owner and nothing else:
**must every aborted wizard session assert `EXIT_CODES.CANCELLED`, across the fourteen `abortAndDestroy` sites?** Today they assert the state, not the code.

## 2. `2026-08-06-relevance-rule-leaves-custom-source-skills-on-no-agent-stack`

The behaviour is unchanged and is the ruling as specified; what remains is the deferred CLI-406
question the finding was filed for — whether a custom source's own matrix domain can stand in for
catalog relevance, or whether custom sources must author stack YAML.

**Evidence.** config-generator.ts still answers targeting through `resolveAssignment(taxonomyOrIdOf(...))` from
@workspace/matrix, and the pin survives under a renamed title — config-generator.test.ts "assigns
a skill whose category names no domain to no agent". The interim doc sentence the finding asked
for is absent: reference/features/configuration.md states nothing about non-catalog skills joining
stacks only through explicit assignment.

## 3. `2026-08-18-config-docs-named-nine-symbols-the-source-does-not-have`

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

Only the schema half is left, and the finding itself records why it cannot be taken unilaterally:
tightening `marketplaceSchema.name` changes what third-party marketplaces LOAD, not only what this
CLI emits.

**Evidence.** src/cli/lib/schemas.ts is still `name: z.string().min(1)`; the command half did land —
`loadMarketplaceIdentity` (commands/build/marketplace.ts) refuses via
`marketplaceNameNotPublishable` (utils/messages.ts). Blast radius of the remaining change is a
load-time behaviour decision, i.e. the owner's.

## 7. `2026-07-29-qa-sweep-working-tree-v0144`

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

Rule 6.17a still carries no verification obligation, and the finding states outright that the
change needs the owner — including a choice between the full derivation and the cheaper
leading-whitespace trigger.

**Evidence.** clean-code-standards.md-328 is 6.17a unchanged: it requires a snapshot per layout branch and says
nothing about `-u` output being a proposal or about deriving column starts from the width
constants. The finding's own Fix Applied ends "No standards doc was edited; the rule change below
needs an owner decision."

## 9. `2026-08-19-a-registered-enumeration-has-an-unregistered-second-copy-in-another-document`

The instance is repaired but the class needs the documents' owner to pick between letting a
registry row bind two documents and forbidding the second copy outright — the finding says so
explicitly.

**Evidence.** reference/concepts/scope-system.md now carries the missing `activeAgentNames` row and names
features/configuration.md as the drift-bound owner; scripts/check-enumeration-drift.ts still binds
only one document per row ("the exported functions of configuration/scope-predicates.ts in
reference/features/configuration.md"), so the second table remains unguarded and will drift again
on the ninth export.

## 10. `2026-07-19-e2e-dual-scope-contention-flake-silent-marketplace-catch`

Everything mechanical has landed; what is left is a product change to the wizard's footer sentinel
(an inputReady gate) plus a retry the finding itself hands to the owner.

**Evidence.** src/cli/lib/operations/source/ensure-marketplace.ts now binds the error and warns `Could not
resolve a marketplace from '<source>': ${getErrorMessage(error)}`; e2e/vitest.config.ts keeps
maxWorkers: Math.min(16, os.availableParallelism()); `grep -rn inputReady src/ e2e/` returns zero,
and the finding records that gate as "owner deferred" and the closed-loop keypress retry as
tried-and-reverted (do not re-attempt).

## 11. `2026-08-16-source-config-loader-swallows-every-load-failure-into-null`

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

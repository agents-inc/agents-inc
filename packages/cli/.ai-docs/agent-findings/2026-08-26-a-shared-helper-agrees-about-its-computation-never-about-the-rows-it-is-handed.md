---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/features/configure/lib/output-preview.ts
  - packages/cli/e2e/assertions/four-surfaces.ts
  - packages/cli/e2e/fixtures/dual-scope-helpers.ts
  - packages/cli/e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts
  - packages/cli/scripts/check-enumeration-drift.ts
  - packages/cli/src/cli/base-command.ts
  - packages/cli/src/cli/commands/compile.ts
  - packages/cli/src/cli/commands/doctor.ts
  - packages/cli/src/cli/commands/edit.tsx
  - packages/cli/src/cli/lib/__tests__/integration/stack-agent-roster.integration.test.ts
  - packages/cli/src/cli/lib/agents/agent-recompiler.ts
  - packages/cli/src/cli/lib/config-gate/index.ts
  - packages/cli/src/cli/lib/config-gate/propagate.ts
  - packages/cli/src/cli/lib/configuration/config-merger.ts
  - packages/cli/src/cli/lib/configuration/config-types-io.ts
  - packages/cli/src/cli/lib/configuration/index.ts
  - packages/cli/src/cli/lib/configuration/scope-predicates.ts
  - packages/cli/src/cli/lib/installation/local-installer.ts
  - packages/cli/src/cli/stores/wizard-store.ts
  - packages/compile/src/config-types-source.ts
  - packages/compile/src/scope-predicates.ts
  - packages/compile/src/seed-to-config.ts
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-08-26
reporting_agent: web-developer
category: architecture
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Both instances are fixed in the product. The RULE half is not landed: nothing mechanically holds
  the editor's preview and the CLI's writer to one answer, and the finding names what such a gate
  would need rather than shipping one.
---

## What Was Wrong

A helper is extracted into a shared package so two callers cannot disagree. The extraction
guarantees they compute the same function. **It guarantees nothing about the arguments they hand
it**, and where the two runtimes populate those arguments differently, the shared helper produces
two different answers while reading as the thing that made disagreement impossible.

Two live instances, both in the output preview, both found on 2026-08-26. They differ in mechanism
and are the same defect.

### Instance 1 — a scope-blind predicate handed scope-specific rows

`activeAgentNames` (`packages/compile/src/scope-predicates.ts`) is deliberately scope-blind. Its
own docblock says so twice over — _"every active (non-excluded) agent, at either scope"_ — and it
then states why it is exported ahead of a second caller:

> the emitted `SelectedAgentName` union and the wizard's agent hydration must derive the same set
> from the same rows, and two surfaces each writing their own filter is the drift this replaces.

The CLI hands it the rows the sentence describes. `regenerateConfigTypes`
(`packages/cli/src/cli/lib/configuration/config-types-io.ts`) loads back the `config.ts` it has
just written and passes `loadedConfig.config.agents` — and because a project's `config.ts` is
produced by the INLINING writer, that array carries the inherited global rows ahead of the
project's own.

The editor's preview handed it `projectSplit.agents` — the project's own rows only. So a union the
sibling `config.ts` still declares agents for named a strict subset of them, and on the preview's
own default scenario the drawn `config.ts` listed five sub-agents while the union beside it listed
one. Measured against a real dual-scope install of the same shape, the two files were:

```
# a real CLI install (setupDualScope), <project>/.claude-src/config-types.ts
export type SelectedAgentName = "web-developer" | "api-developer";

# the preview, same agent scopes
export type SelectedAgentName = "api-developer";
```

The docblock is not merely silent about this — it is the thing that made the mistake look correct.
"the same set from the same rows" is a promise about the FUNCTION; a reader takes it as a promise
about the SYSTEM, and then only checks that both surfaces call the shared symbol.

### Instance 2 — a shared reader of a field only one runtime populates

`sourceForSkill` (`packages/compile/src/seed-to-config.ts`) resolves a plugin skill's marketplace
from `skill.availableSources`, documented as _"populated by multi-source-loader"_ — a CLI-side
loader. In a browser nothing populates it:

```
grep -c availableSources packages/matrix/src/vendor/generated/matrix.ts   →  0
grep -c availableSources packages/api-mocks/src/fixtures.ts              →  0
```

So every skill's `origin` resolves to `DEFAULT_PUBLIC_SOURCE_NAME` and the preview's plugin
reference note told a visitor seated on their own marketplace that their skill _"resolves from the
**agents-inc** marketplace"_. Same class: one shared function, one argument, two runtimes, and the
answer is right in the one where the field is filled and vacuous in the other. Nothing about the
extraction is wrong; the extraction simply never covered the input.

### Why nothing caught either

**Instance 1 lived inside a KNOWN GAP whose comment named one reason.**
`packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts` skips the project
`config-types.ts`, and its comment gave a single, correct, narrow cause: the import specifier is
`path.relative(<project>/.claude-src, $HOME/.claude-src)`, unknowable in a browser. Every reader
takes a named exclusion as an exhaustive one. What the gap actually excluded was the whole file —
the import block plus every alias `generateProjectConfigTypesSource` emits — of which exactly one
line is genuinely unknowable.

The other side of the bilateral contract has the mirror hole:
`packages/compile/src/contract/emission-scenarios.test.ts` renders every scenario's types half
with the STANDALONE `generateConfigTypesSource`, including the project-root scenario. So
`generateProjectConfigTypesSource` — the writer that emits `SelectedAgentName` — is called by
neither runner, while both runners' docblocks correctly describe an arrangement they call
bilateral.

**And the CLI's own gate for this exact invariant cannot see the editor.**
`packages/cli/e2e/lifecycle/global-agent-propagation-type-consistency.e2e.test.ts` pins precisely
the property that broke — a project's active agent rows and its `SelectedAgentName` union must
match as sets — and it stayed green throughout, because it drives a real CLI. The invariant was
written down, tested, and violated by the surface the test could not reach.

## Fix Applied

**Instance 1.** `projectPair` in `apps/editor/src/features/configure/lib/output-preview.ts` now
derives the union from `extras.extraAgentNames` — the inlined view `projectTypesExtras` already
builds — instead of `activeAgentNames(projectSplit.agents)`. That is the CLI's own derivation:
`buildProjectTypesExtras(inlinedProjectView(split, effectiveGlobal))` in `config-gate/propagate.ts`
over `[...effectiveGlobal.agents, ...split.agents]`, filtered to the active rows and deduped.
`formatUnion` preserves order, so the global-first sequence matches the file the inlining writer
draws. The reason moved into `projectPair`'s docblock rather than sitting as an inline comment, and
`activeAgentNames` is no longer imported by that module.

Verified against the real thing rather than a literal: a `setupDualScope` install and the preview
over the same agent scopes now produce byte-identical `AgentName`, `SelectedAgentName` and
`ProjectAgentName` lines. `ProjectAgentName` was never affected — `activeProjectAgentNames` filters
to `scope === "project"`, which is what that union means.

**Instance 2.** `pluginReferenceNote` no longer interpolates `skill.origin`. A named
`seatedMarketplacePhrase` reads `activeMarketplace()` from `catalog-store` — the SEATED marketplace,
the first of the three that store's own note distinguishes — and renders two arms. `null` is the
vendored public catalogue, whose name is honestly reachable and is the one the CLI records. Anything
else is a REF (`github:acme/skills`, a URL, a path); `seedPayloadSchema` says where it declares the
field that _"the name its manifest gives it is read from the fetched marketplace.json"_, and this
app fetches `catalog.json` and never that — so the ref is rendered AS a ref ("the marketplace at
`github:acme/skills`") rather than dropped into the slot a name belongs in. Deliberately not
`marketplace-store`, which owns CHOSEN and SAVED rather than SEATED and which imports
`@/lib/observability/report`, the module this file's header rules out.

**The KNOWN GAP comment was widened** to say that it excludes the whole file rather than one line,
to name the aliases inside it, to record that instance 1 lived there, and to state in as many words
that nothing mechanically holds the two derivations together.

**Not fixed, reported instead — a third site of instance 2's class, same module:**
`ejectedCatalogueNote` renders `Source: ${primarySourceName(skill)}/src/skills/<id>`, and
`primarySourceName` is the editor's own mirror of `sourceForSkill`, reading the same
structurally-empty `availableSources`. It names `agents-inc` for an acme-seated visitor exactly as
the plugin note did. Left alone under an explicit scope instruction; naming it here is the other
half of that instruction.

## Proposed Standard

**For `packages/cli/CLAUDE.md`, beside the existing export-before-a-second-caller exception** (which
already licenses exporting `skillSlotKey` / `agentSlotKey` "so two surfaces cannot disagree"), one
clause:

> Exporting a helper so two surfaces agree closes the disagreement about the COMPUTATION and none
> of the disagreement about the INPUT. Where the callers are in different runtimes, say in the
> helper's docblock which rows each one is expected to hand it, and name the one gate that would
> notice if they diverged — or say that none exists.

**For any KNOWN GAP written in prose** (the assertion-shaped case is already covered by CLAUDE.md's
"NEVER encode a known gap in an assertion's ARITY, LENGTH or ABSENCE"):

> A comment naming a reason for an exclusion is read as naming the only reason. State the EXTENT
> first — what is not checked — and the cause second. "The import specifier is unknowable" and "the
> whole file is uncompared, and one line of it is unknowable" are different claims, and only the
> second tells a reader there is room for a defect.

**Cross-checked against CLAUDE.md and it does not conflict** with the export rule, the
`sourceForSkill`-must-not-be-exported constraint recorded in
`2026-08-26-a-sentinel-is-a-legal-value-of-the-field-and-an-invalid-coordinate` (the fix above adds
no export to a drift-bound module), or the display-name-in-a-path ban.

**Declines to propose a grep-based checker, and says why.** "A shared helper whose two callers feed
it different rows" is not a lexical property — every call site looks identical, and the difference
is in what the argument was built from three functions earlier. The gate that WOULD close it is a
test, and its shape is known and its cost is the reason it is not landed here: one comparison
running the editor's `projectPair` and a real CLI install over one configuration. Neither suite can
reach the other today — `buildOutputPreview` seats the browser catalogue through
`@/stores/catalog-store`, and `preview-matches-install.e2e.test.ts` installs from the E2E fixture
marketplace — so it needs either a parameterised catalogue on the preview or a fixture the two
suites share.

**Every count in this finding is a census, not a sample.** The `affected_files` list is the output
of, pasted:

```
grep -rln "activeAgentNames\|activeProjectAgentNames\|activeSkillScopeMap\|activeAgentScopeMap\|effectivelyExcludedSkillIds\|isProjectOwned\|isGlobalTombstone\|isActiveAt" apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules | sort
```

It is the class's SURFACE rather than its defect list: 22 files call the shared scope predicates and
exactly one of them was in a second runtime, which is the whole reason the class was invisible.

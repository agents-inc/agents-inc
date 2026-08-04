---
type: convention-drift
severity: high
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-merger.ts
  - src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/DOCUMENTATION_MAP.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: partial
partial_note: "mergeGlobalConfigs now carries marketplace/source (fill-only precedence). The broader gap — no documented rule for how the three config-merge functions treat source-identity metadata, and the scalar marketplace field being unable to represent a multi-marketplace global config — is still open."
---

## What Was Wrong

Three functions participate in producing a written config, and each treats the
source-identity metadata (`marketplace`, `source`) differently. Nothing documents
the intended rule, so the behaviour drifted apart silently:

| Function                                   | `marketplace`                                              | `source`                                     |
| ------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------- |
| `splitConfigByScope` (config-generator.ts) | carried onto both partitions via `...config`               | carried onto both partitions via `...config` |
| `mergeConfigs` (config-merger.ts)          | existing wins (explicit `if (existingConfig.marketplace)`) | incoming wins (no preservation branch)       |
| `mergeGlobalConfigs` (local-installer.ts)  | **dropped entirely**                                       | **dropped entirely**                         |

`mergeGlobalConfigs` returned `{ ...existing, skills, agents, stack, domains, selectedAgents }`.
Because it spread only `existing`, and on a project-scope init `existing` is the
blank config `ensureBlankGlobalConfig()` wrote moments earlier, the global config
written during every project init had neither field — even though
`splitConfigByScope` had correctly placed both on the global partition one step
earlier.

The user-visible consequence is destructive rather than cosmetic. `uninstall`
resolves which plugins it owns via `getCliInstalledPluginKeys`, whose primary key
is `<id>@<skill.source>` — the wizard's source _label_, not the marketplace the
plugin was registered under. Only the `config.marketplace` variant key produces
`<id>@<marketplace>`, which is the key the Claude plugin registry actually uses.
With `marketplace` missing, a global `uninstall --yes --all` matches nothing,
skips the plugin branch entirely, and then deletes `.claude-src/` — destroying the
only record of plugins that remain registered and enabled.

A second, latent trap: `needsGlobalWrite` is gated on the merge's `changed` flag.
Carrying the fields without also extending `changed` would have made the fix
inert on any init after the first, because a run whose only delta is the
newly-known marketplace would compute `changed === false` and skip the write.

Worth recording for whoever revisits this: `marketplace` and `source` are scalar,
but the merged global config is multi-marketplace by construction — the merge
never removes skills, so after a second project init from a different marketplace
the skills array holds plugins from both, and whichever single label is recorded
orphans the other's registry key. No precedence choice is correct in that case;
the field shape is the limitation.

## Fix Applied

`mergeGlobalConfigs` now computes and returns both fields with **fill-only**
precedence — existing wins, incoming is used only when the global config has no
value yet — and `changed` accounts for a newly-filled value so the global write is
not skipped.

Fill-only was chosen deliberately over the "incoming wins" variant the test author
hypothesised, for three reasons:

1. It is the function's own stated policy. The existing stack-merge comment cites
   commit 403df46 — "never modify global config from project-level operations" —
   and repointing global source identity because some project was initialised is
   exactly that.
2. It matches `mergeConfigs`, which already preserves `existingConfig.marketplace`
   on the home-root install path, so the two paths now agree.
3. Changing global source identity remains reachable through the sanctioned
   global-scope operation (`init` run from `~`), which writes the global config
   directly and bypasses this merge.

Three unit tests were added to `local-installer.test.ts` pinning: incoming fills
an empty field (and marks the merge dirty), existing survives a differing
incoming, and both stay `undefined` when neither side records one.

Not fixed here (outside this task's file ownership): the skipped test
`e2e/lifecycle/config-scope-integrity.e2e.test.ts :: "should include source field
in both global and project configs after scope split"` targets exactly this
defect. Its `it.skip` TODO misattributes the cause to an ENOENT in the skill
copier; the real cause was this merge. It should be un-skipped, and its fixture
swapped to `createE2EPluginSource()` so a marketplace genuinely exists.

## Proposed Standard

Add to `CLAUDE.md` under **Data Integrity**:

> - NEVER return a hand-listed subset of `ProjectConfig` fields from a merge
>   function. Config merges must account for every field explicitly — carry it,
>   or document on-site why it is dropped. Silently omitting a field from the
>   returned object is indistinguishable from a bug and survives review because
>   the omission is invisible at the call site.
> - When a merge function's result gates a write (`changed`, `dirty`), every
>   field the merge can alter must participate in that flag. A field carried but
>   not counted is inert.

And a short section in the config documentation (indexed from
`.ai-docs/DOCUMENTATION_MAP.md`) stating the authoritative precedence rule for
source-identity metadata across all three merge points, so the next author does
not have to re-derive it: **project-context merges are fill-only for
`marketplace`/`source`; only a global-scope operation may repoint them.**

Longer term, consider whether `marketplace` belongs on the config root at all
given the multi-marketplace case above, or whether per-skill `source` (once it
records the real marketplace name) should become the single authority and the
root field be retired.

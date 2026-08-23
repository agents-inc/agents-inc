---
type: standard-gap
severity: medium
affected_files:
  - e2e/fixtures/project-builder.ts
  - e2e/fixtures/plugin-install-state.ts
  - e2e/interactive/edit-wizard-plugin-migration.e2e.test.ts
  - src/cli/lib/installation/mode-migrator.ts
  - src/cli/utils/exec.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The departure is now asserted on the plugin REGISTRY, by a round trip that installs for real
  first. The `settings.json` half is still unassertable and is pinned as a KNOWN GAP at the site,
  because `claude plugin uninstall` does not clear `enabledPlugins` — an owner ruling is owed on
  whether the migration should clear it itself.
---

# Hand-written plugin state is not uninstallable, so no fixture can pin a departure by itself

## What Was Wrong

`ProjectBuilder.pluginProject` wrote a config claiming plugin origin and never wrote
`enabledPlugins`, so `toHavePlugin` — which reads `.claude/settings.json` and nothing else — was
false before any command ran. `not.toHavePlugin` therefore held for free on every project built
there, and a hardening pass that added one, mutated away the `claudePluginUninstall` call and
watched it stay green removed its own assertion rather than ship a vacuous one.

Widening the fixture is necessary and is not sufficient, which is the part the tracker row did not
have. Measured against **Claude Code 2.1.239**, hand-written state cannot be uninstalled at all:

```
# settings.json alone
$ claude plugin uninstall "foo-skill@e2e-test-fixture" --scope project
✘ Failed to uninstall plugin "foo-skill@e2e-test-fixture": Plugin ... not found in installed plugins
# settings.json + installed_plugins.json record, scope "user"    -> same message
# settings.json + installed_plugins.json record, scope "project" -> same message
```

`claudePluginUninstall` in `src/cli/utils/exec.ts` swallows exactly that wording by design
("Ignore 'not installed' errors"), so the migration completes, reports success, and the key stays.
An assertion placed on a hand-built fixture would have accused the product of the fixture's gap.

**And a real install exposes a genuine inconsistency.** With phase one performing an actual
`claude plugin install` and phase two switching the same skill back to eject, the registry entry is
removed and `.claude/settings.json` keeps `enabledPlugins` naming the plugin. The project is left
declaring an enabled plugin that is no longer installed, with `origin: "eject"` in config.ts beside
it.

## Fix Applied

- `ProjectBuilder.pluginProject` writes `enabledPlugins` for every skill it declares, through
  `pluginKeyFor` — now exported from `plugin-install-state.ts` so the two fixtures and every
  assertion spell the key once. `unresolvableSkills` deliberately get no key: they are config
  entries with no files, a state no install ever reached.
- `edit-wizard-plugin-migration.e2e.test.ts` gains a round trip that installs for real, then
  switches back, sharing ONE global home across both wizards (a wizard that allocates its own home
  removes it in `destroy()`). It asserts the registry departure with the post-install guard beside
  it, and mutation-checked: with phase two not switching, it reddens naming that plugin.
- The `settings.json` half is a commented `// KNOWN GAP:` at that site, with the measurement.

## Proposed Standard

> **A fixture that hand-writes third-party state can pin an ARRIVAL and cannot pin a DEPARTURE.**
> Removal is the third-party binary's own operation, and it will decline to remove state it has no
> record of installing. So a departure assertion needs a real install upstream of it in the same
> test — which also supplies the positive subject guard the negative needs. Where the real install
> is unaffordable, say on site that the direction is unasserted rather than asserting the half that
> passes.

This belongs in `standards/e2e/assertions.md` beside _Assert the Departure, Not Only the Arrival_,
which states the obligation and does not say what makes it reachable.

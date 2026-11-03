---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/init.tsx
  - src/cli/lib/hosts/codex-host.ts
  - src/cli/lib/hosts/plugin-host.ts
standards_docs:
  - CLAUDE.md
date: 2026-11-03
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The defect is fixed. init.tsx's take-back now reads pluginsHeld, which throws where listPlugins
  answers none. The proposed CLAUDE.md rule is not written.
---

## What Was Wrong

`init --from`'s take-back decided which plugins it had installed by diffing the host's
`listPlugins` before and after. Codex's `listPlugins` degrades: where a marketplace is unreadable it
warns once and answers `[]`. The take-back caught only a throw, so it read the degraded `[]` as
"nothing held" and uninstalled a plugin that may well have been there before the run.

CLAUDE.md's sentinel-versus-throw rule covers a function changed from returning a sentinel to
throwing. This was the reverse case. A function that already degrades to a value
indistinguishable from a real answer was consumed by a caller whose decision is destructive.

## Fix Applied

`PluginHost.pluginsHeld` (Claude: its registry read; Codex: the raw listing, which throws). The
take-back reads it and treats a throw as "cannot tell", which keeps the plugin. The run reports it
with `pluginKeptAfterRefusedSave`.

Search for siblings, run over `src/cli`:

- `grep -rn '\.listPlugins(' src/cli` (tests excluded) found one other caller,
  `lib/plugins/plugin-discovery.ts`. It is read-only discovery and already maps a throw to null.
- `grep -rn 'heldBefore\|marketplacesHeld\|pluginsHeld\|takingBack\|TakenBack' src/cli` found no
  other take-back.

## Proposed Standard

Add to CLAUDE.md's sentinel-versus-throw rule: a caller that removes or overwrites on an empty
answer must read an accessor that throws where the host cannot say. It must never read one that
degrades to empty. The unit test
`init-from-keeps-a-codex-plugin-it-cannot-tell-it-held.test.ts` reddens if the take-back goes back
to `listPlugins`.

## A Kept Plugin Keeps Its Marketplace

The first fix kept the plugin but still removed the marketplace the run had registered. Claude's
`marketplace remove` uninstalls that marketplace's plugins, so on Claude the plugin went anyway and
the "Kept the plugin" line was false. `removeNewMarketplace` in `src/cli/commands/init.tsx`
leaves a newly registered marketplace while any plugin from it is kept. A take-back step that
removes a container must ask what the container holds that another step keeps. The fake-Claude and
real-Claude cases in `e2e/commands/init-from-refused-save-takes-back-its-plugins.e2e.test.ts` named
"…it cannot tell Claude held before the run…" redden if the marketplace is removed again.

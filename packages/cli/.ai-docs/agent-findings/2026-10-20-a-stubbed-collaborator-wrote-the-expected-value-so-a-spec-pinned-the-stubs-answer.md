---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/installation/local-installer.test.ts
  - src/cli/lib/installation/local-installer-build.test.ts
  - src/cli/lib/operations/project/write-project-config.test.ts
  - src/cli/lib/operations/project/compile-agents.test.ts
  - src/cli/lib/operations/project/compile-agents-all-scopes.test.ts
  - src/cli/lib/operations/project/recompile-project-agents.test.ts
  - src/cli/lib/operations/project/load-agent-defs.test.ts
  - src/cli/lib/operations/project/detect-project.test.ts
  - src/cli/lib/operations/skills/copy-local-skills.test.ts
  - src/cli/lib/operations/skills/discover-skills.test.ts
  - src/cli/lib/operations/source/load-source.test.ts
  - src/cli/lib/operations/source/ensure-marketplace.test.ts
  - src/cli/lib/installation/mode-migrator.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The REPO-44 step 7 prune of lib/operations and lib/installation rewrote every listed spec
  against real disk. The vi.mock calls left in either directory mock lib/hosts/host-for (the
  PluginHost seam), plus one logger automock in installation.test.ts that no spec asserts through.
---

## What Was Wrong

Two shapes, both in `lib/operations` and `lib/installation`, both green under every gate.

**The expected value was the stub's answer.** `local-installer.test.ts` mocked `../resolver` so
`buildSkillRefsFromConfig` answered `[]`, and the spec "should build compile agents for agents in
the definition record" expected `{ "web-developer": { skills: [] } }` for an agent whose stack
assigns `web-framework-react`. The real resolver answers one reference for that stack. The spec
pinned the opposite of the product's answer. The same file mocked the config generator to answer
a sentinel skill no selection named, and 7 `writeProjectConfig` expectations asserted that
sentinel. Any refactor that built the config another way would have reddened all 7 while the
written config stayed correct.

**The assertion was the call.** The other listed specs mocked a project module and asserted its
arguments, call counts or order (`toHaveBeenCalledWith`, `toHaveBeenNthCalledWith`,
`.not.toHaveBeenCalled()`) instead of what landed on disk or came back. `write-project-config.test.ts` mocked five
collaborators and `fs`. `load-source.test.ts` asserted `enableBuffering`/`drainBuffer`/`disableBuffering`
calls rather than whether a warning reached the terminal. One mocked state was unreachable for
real: `detect-project.test.ts` handed back an installation with no loadable config, which
`detectInstallationInDir` never returns.

## Fix Applied

Every listed spec now runs on real disk (`createTestSource`, `writeTestTsConfig`, a fake home) and
asserts files, configs and return values. Specs whose behaviour another real-disk spec already held
were deleted, each with its covering spec named in the report. The only doubles left are the
`PluginHost` seam to the coding agent's CLI, `os`/env, the console, and one logger automock in
`installation.test.ts` that no spec asserts through. The `buildCompileAgents`
suite moved to `local-installer-build.test.ts` on the real resolver. `setConfigMetadata` and
`describeScope` lost the `export` that only their specs used, and are now tested through
`buildAndMergeConfig`/`writeProjectConfig` and `sourceScopesInPlay`. The verbose trail of
`discover-skills` and `mode-migrator` is read at the console with verbose mode on, not through a
mocked `verbose`. `ensure-marketplace` asserts what the host was told to do (refresh, register),
not which name it was asked about.

Hand mutations of the sources (mutate, build, run, restore) were run against the rewritten specs.
One survived on the first pass: the "requested at its scope" spec read only the output folder, so a dropped
filter let `pm` compile into the global folder unseen. The spec now asserts the compiled roster
and the global folder. Two more survived the rewrite: `compileAgents` dropping the skills it is
handed, and dropping the caller's scope map in an unfiltered pass. The deleted specs had caught
both only by asserting the arguments passed to the mocked `recompileAgents`. Two
`compile-agents.test.ts` specs now catch them from the compiled file and the folder it lands in.
One mutant still survives, and is left: `writeProjectConfig` treating home as a project seeds a
blank global pair that the home write then overwrites. Only `GateReport.changes` differs, and only
on a first home install. `init` and `edit` do not read that field at home, and a first install has
no registered project to propagate to.

## Proposed Standard

Beside CLAUDE.md › "Test Assertions" › the mocked-collaborator rule
(`2026-08-25-a-mocked-collaborator-can-make-loads-and-validates-assert-neither`): **an expected
value may not come from a stub of a project module.** If the value a spec asserts is what a
`vi.mock` factory or `mockReturnValue` produced, the spec tests the stub. Drive the collaborator for
real, or stub only at a seam the project declares (`PluginHost`, the network, the clock). Worklist
command, a census rather than a sample, since it includes legitimate seam and logger doubles:
`grep -rlE 'vi\.mock\("\.\.?/' src --include='*.test.ts' --include='*.test.tsx'` answered 48 files
on 2026-10-20.

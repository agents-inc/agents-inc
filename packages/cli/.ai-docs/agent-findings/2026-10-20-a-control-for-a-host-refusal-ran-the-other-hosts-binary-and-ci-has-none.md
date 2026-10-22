---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/codex-offered-placements.e2e.test.ts
  - e2e/commands/marketplace-name-refusal.e2e.test.ts
  - e2e/lifecycle/real-marketplace.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/patterns.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The codex-offered-placements control is fixed and green with no claude binary. Open are the
  marketplace-name-refusal sibling, whose name claims an install it does not check, and any gate
  that runs the e2e suite with claude off PATH before a push.
---

## What Was Wrong

`codex-offered-placements.e2e.test.ts` pairs Codex's `plugin + project` refusal with a Claude
control: same seed, other host, so the refusal cannot be a guard that swallowed plugin mode. The
control's subject is only that Claude's pre-flight admits the cell. It ran a full non-TTY
`init --from` anyway, which goes past the pre-flight into `ensureMarketplace` and spawns
`claude plugin marketplace add`. It had no `claudeAvailable` gate, although `patterns.md`
("Plugin mode tests that run a real install require the Claude CLI binary ... Use
`describe.skipIf`") requires one.

On CI there is no `claude`, so the control exited 1 with `spawn claude ENOENT`. On a dev machine
it passed. Toggling one variable at a time showed `claude` absent from PATH is the whole cause.
TERM and CI play no part.

It stayed latent from 2026-10-01 until 2026-10-16 because no main push reached CI's e2e step:
`gh api .../actions/runs/<id>/jobs` shows check-cli failing at `bun run test` in 37215204138,
38620569681 and 38621807704. The first two runs to reach `bun run test:e2e` (38983124504, 38987062289) both failed here.

A control only needs to show that the guard admits the other case. Wherever it runs past that
point, it picks up the other host's dependencies, which the refusal never had.

## Fix Applied

The control now runs under a PTY with `--provider claude`, waits for `Install this
configuration?`, and asserts the project listing, the question, and no `plugin+project` refusal.
It then denies, expects `CANCELLED`, and asserts the four surfaces the refusal test asserts absent.
No host binary is spawned. The full-install leg was deleted. A plugin-mode project `init --from` on
Claude is already held behind `it.skipIf(!claudeAvailable)` in
`lifecycle/claude-install-byte-identity.e2e.test.ts`.

Mutation-checked: swapping the control's provider to codex reddens it on the listing assertion.

Census of e2e specs that seed or request a plugin install with neither a `claudeAvailable` gate nor
a Codex host:

```
for f in $(grep -rlE 'install: "plugin"|installMode: "plugin"|--plugin' e2e --include='*.e2e.test.ts'); do
  grep -qE 'claudeAvailable|isClaudeCLIAvailable' $f || grep -qE 'OnCodex|PROVIDER_CODEX' $f || echo $f; done
```

That command returned four files on 2026-10-20. `build`'s `--plugin` builds rather than installs.
`init-from-external-skills` reaches only a refusal. `real-marketplace` was gated on the skills
source alone and failed on `spawn claude ENOENT` where `../skills` exists without `claude`; it now
also skips without `claude`. `marketplace-name-refusal`'s "is installed by init --from as the
plugin asked for once its name is its own" omits the exit code, so on CI it passes while the
command exits 1 on `spawn claude ENOENT`. Its name claims an install that it does not check.
Discovery only.

## Proposed Standard

`patterns.md`, beside the `describe.skipIf` rule: "A control paired with a refusal stops where the
refusal decides, at the pre-flight. For `--from` that means the confirm question under a PTY,
denied. A leg past that point is gated, or it belongs to a spec that is." This is a proposal and
conflicts with nothing in CLAUDE.md, whose same-file pairing rule this keeps.

Nothing static catches this cheaply. Inferring that a spec reaches a Claude plugin install needs
dataflow over seeds and runners, and a name-based scan would pass without the property. What
catches it is running the e2e suite once with `claude` stripped from PATH, as a pre-push habit or
a script. Whether that becomes a gate is the owner's call.

---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/hosts/plugin-host.ts
  - src/cli/lib/hosts/claude-host.ts
  - src/cli/lib/hosts/host-for.ts
  - src/cli/lib/hosts/offered-placements.ts
  - src/cli/lib/plugins/plugin-discovery.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/lib/hosts/__tests__/the-claude-vocabulary-stays-behind-the-seam.test.ts
standards_docs:
  - .ai-docs/reference/concepts/plugin-hosts.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-09-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The READ path goes through the seam — `getVerifiedPluginInstallPaths` moved to
  `plugins/plugin-discovery.ts` and calls `hostAt(projectDir).listPlugins(projectDir)`, so
  `listPlugins` has a production caller and the retired registry reader that chose its own
  directory becomes `listPluginInstallsForProject`, which `claudeListPlugins` alone reads. The roster is
  binding — `hostFor` wraps every host it answers with `bindsItsOfferedPlacements`, so
  `installPlugin` refuses a plugin cell `offeredPlacements` does not carry and names the cells it
  does. The census case that claimed to check the argument validators now lists all three and
  matches a synchronous declaration. Each is mutation-checked; the numbers are in the body.
---

## What Was Wrong

Three defects with one shape: **a declaration nothing reads through is indistinguishable from a
finished one**, and no gate in this package can see the difference.

**1. A seam member with no caller.** C3 declared `PluginHost.listPlugins` and moved no reader onto
it. The plugin READ path — `discoverAllPluginSkills`, `listPluginNames` and the
`getVerifiedPluginInstallPaths` behind both, which `doctor` also calls directly — went on reading
`~/.claude/plugins/installed_plugins.json` and `<project>/.claude/settings.json` by hand. Every
caller above it (`multi-source-loader`, `agent-recompiler`, `discover-skills`, `edit`, `uninstall`,
`doctor`) therefore read as host-agnostic while being wired to one host. The census:

```
grep -rn "\.listPlugins(" packages/cli/src --include='*.ts' --include='*.tsx' \
  | grep -v '__tests__\|\.test\.'
```

printed nothing. Two gates already stand over this seam and neither can report it: the ESLint
`no-restricted-imports` group and the vocabulary census both ask whether a caller NAMES a Claude
function, and this caller named none — it composed the same two paths out of `CLAUDE_DIR` and
`PLUGINS_SUBDIR`.

**2. A roster nothing consults.** `offeredPlacements` exists, in its own words, "so the installer
reads the roster off the host instead of asking which provider it is holding". No caller consulted
it for a refusal and the contract did not require a host to refuse a placement it does not offer.
The same shape one level down: for the one host this release ships every cell is offered, so the
roster could never be contradicted and read as correct for that reason.

_The review row this came from said "no caller consults it", and that half was wrong:
`pluginScopesToSweep` in `commands/uninstall.tsx` reads it to decide how wide a removal sweep is.
What held is the other half — nothing made it BINDING._

**3. A spec name claiming more than it checks.** In
`hosts/__tests__/the-claude-vocabulary-stays-behind-the-seam.test.ts`, the case named _"leaves the
spawn wrapper **and the argument validators** where every host reaches them"_ read a roster holding
one name, `execCommand`, and matched it with `export async function <name>` — which could not have
matched a synchronous `export function validatePluginPath` even if the validators had been listed.
Reproduced by deleting all three validators from a copy of `utils/exec.ts`: the assertion's
predicate still answered `['execCommand']` and the case passed. This is the repository's own
anti-pattern (`standards/e2e/anti-patterns.md` -> "Never name a spec for a source whose data the
fixture does not ship"), and it landed on the one case whose subject is the class a host extraction
is most likely to break — every validator is now called from the host module alone.

## Fix Applied

All three, in `lib/hosts/**` and `lib/plugins/**`, with each change mutation-checked rather than
asserted. Red-then-green, all samples of one run:

- **Discovery off the seam** (revert `plugin-discovery.ts` to reading the two files by hand):
  **10 of 15** cases in `plugin-discovery.test.ts` red. The spec now mocks
  `lib/hosts/host-for.js` through the shared `createMockPluginHost`, so a discovery path wired
  around the seam cannot pass it.
- **The placement guard refusing nothing:** 1 red. **Refusing everything:** 6 red — the allowed
  case and both roster cases in the contract spec, plus all three installing cases in
  `the-claude-host-spawns-what-it-spawns-today.test.ts`, which go through `hostFor("claude")` and
  so prove the door really does wrap the host it answers.
- **The validator roster** (a validator moved out of `exec.ts` into the host that calls it): 1 red,
  naming the missing validator, where the old roster stayed green.

Two measured changes to the seam went in with them, because they are the members a Codex host
needs most and the seam is where they had to change rather than be implemented. `isAvailable` and
`listPlugins` now take `HostCallOptions`, re-derived against the pinned `@openai/codex` 0.155.1 on
2026-09-22 with `HOME` and `CODEX_HOME` pinned to a scratch tree and `TMPDIR` moved out of it, one
run each: `codex --version` wrote `$CODEX_HOME/tmp/arg0/codex-arg08a6Nd7` before reading an
argument, so that host's availability probe is a WRITE; and `codex plugin list --json` answered
identically from two different project directories while answering `{"installed":[]}` under a
second `CODEX_HOME` from the first one, so its listing is a function of `CODEX_HOME` and of nothing
else. Dropping the option in the Claude implementation reddens 1 unit case and 1 smoke case against
the real `claude` 2.1.278.

**One correction to the seam's own prose fell out of the same measurement.** `HostPlugin.enabled`
said Codex's "per-project enablement is the only per-project control it has". Measured as a paired
control in one `CODEX_HOME` — global `config.toml` saying `enabled = true` throughout, the
project's own `.codex/config.toml` saying `enabled = false` throughout, and only
`[projects."<abs path>"] trust_level = "trusted"` in the GLOBAL config added and removed between
the two runs — the project's switch won when the project was trusted and was ignored when it was
not, and the listing says nothing about which of the two answered.

## Proposed Standard

**A seam is not landed until something reads through every member of it, and the check is the CALL
rather than the name.** The two gates this seam already has are both name-scans: a caller that
composes the host's paths out of shared constants names nothing and passes both. Neither an ESLint
import ban nor a substring census can see a member with no caller, because a property on a value
object is not an exported callable —
`src/cli/lib/__tests__/tested-exports-reach-production.test.ts`, which does report an exported
function the suite invokes and the package never does, cannot see `listPlugins` for exactly that
reason.

The cheapest honest guard is the one applied here rather than a new scan: **make the CALLER's spec
mock the seam.** `plugin-discovery.test.ts` mocked `./plugin-settings` and would have gone on
passing for any wiring at all; mocking `lib/hosts/host-for.js` makes 10 of its 15 cases fail the
moment discovery reads around the seam. A spec that mocks the collaborator a step is supposed to
introduce is what makes the introduction load-bearing.

**Where to write it:** `.ai-docs/reference/concepts/plugin-hosts.md` -> "Who calls it" already
carries the re-derivation grep for `hostAt`/`hostFor`; it should carry the per-MEMBER one beside
it, since a door with callers and a member with none is the state this finding is about:

```
grep -rn "\.listPlugins(\|\.offeredPlacements\b\|\.isAvailable(" packages/cli/src/cli \
  --include='*.ts' --include='*.tsx' | grep -v 'hosts/\|__tests__\|\.test\.'
```

Checked against `CLAUDE.md`'s NEVER/ALWAYS rules and `standards/e2e/anti-patterns.md`: it conflicts
with neither. It extends the existing "Prove the surface is reachable before writing the spec" from
a spec's subject to a seam's members.

**A second, narrower rule, for the roster half:** a data member declared as the source of a refusal
is not one until a caller refuses from it, and for a single-implementation seam that refusal has no
reachable case — so the guard is applied at the DOOR, once, and the pair (refused, allowed) is
pinned over a second in-file implementation. What no spec in this package can hold today, measured:
`hostFor` returning an unwrapped host reddens **0** specs across all four files in
`lib/hosts/__tests__/`. That omission becomes reachable with C4's three-cell Codex host, and the
spec holding the door's wiring belongs with it.

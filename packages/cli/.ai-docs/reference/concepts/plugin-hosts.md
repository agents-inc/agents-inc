---
scope: reference
area: concepts
keywords:
  [
    PluginHost,
    hostFor,
    hostAt,
    claudeHost,
    codexHost,
    offeredPlacements,
    bindsItsOfferedPlacements,
    refuseUnofferedPlacement,
    refuseUnofferedPlacements,
    installsProjectScopedPlugins,
    InstallPlacement,
    HostPlugin,
    PluginRemovalOutcome,
    listPlugins,
    installPlugin,
    uninstallPlugin,
    addMarketplace,
    refreshMarketplace,
    marketplaceExists,
    isAvailable,
    execCommand,
    validateMarketplaceSource,
    validatePluginName,
    validatePluginPath,
    provider,
    codex,
  ]
related:
  - reference/concepts/source-folder-layout.md
  - reference/features/plugin-system.md
  - reference/codex-hand-check.md
last_validated: 2026-09-22
---

# The plugin host seam

The one interface between this CLI and whichever host's plugin machinery it is driving, what each
host spells differently, and where a caller gets one from.

## Why there is a seam at all

Until C3 the CLI called Claude Code's plugin commands from eight production files, each of which
spelled "install a skill" in one host's vocabulary. Nothing there was wrong; what it could not do is
be pointed at a second host. `src/cli/lib/hosts/` is now the only place those calls live.

| Module                               | What it holds                                                             |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `lib/hosts/plugin-host.ts`           | `PluginHost` and its four types — declarations only, no behaviour         |
| `lib/hosts/claude-host.ts`           | Claude Code behind it: every `claude plugin` invocation the CLI makes     |
| `lib/hosts/codex-host.ts`            | Codex behind it (`codexHost`): every `codex plugin` invocation            |
| `lib/hosts/host-for.ts`              | `hostFor(provider)` and `hostAt(root)` — the two doors                    |
| `lib/hosts/offered-placements.ts`    | What makes `offeredPlacements` binding, applied to every host at the door |
| `lib/hosts/configured-placements.ts` | `unofferablePlacementsFound` — the same refusal over a loaded config      |
| `utils/exec.ts`                      | `execCommand` and the three argument validators, which are every host's   |

**The seam is written in this product's words, never in a host's.** Scope is `SkillScope`
(`global`, `project`); mode is `INSTALL_MODES` (`plugin`, `eject`). Claude's own plugin scope
vocabulary is `user` and `project`, and `toClaudePluginScope` — which lives in `claude-host.ts`
because it is a fact about one binary — is the whole of the translation. A member named after the
binary it was extracted from would be the same coupling one indirection further away.

## The members

| Member                         | Kind     | Notes                                                                                                                                                                                                    |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                     | string   | The only member that names a provider, because it IS it                                                                                                                                                  |
| `offeredPlacements`            | array    | The mode/scope cells this host offers — 4 for Claude                                                                                                                                                     |
| `installsProjectScopedPlugins` | boolean  | Source of a refusal; cannot disagree with the cell above                                                                                                                                                 |
| `isAvailable`                  | function | Whether the host's binary is there and runnable                                                                                                                                                          |
| `marketplaceExists`            | function | By NAME                                                                                                                                                                                                  |
| `addMarketplace`               | function | By SOURCE — the one verb that does not take a name                                                                                                                                                       |
| `refreshMarketplace`           | function | Claude runs `marketplace update`. Codex (`refreshCodexMarketplace`) runs `marketplace upgrade` for a git-sourced marketplace and reinstalls each of its plugins for a local one, where `upgrade` exits 1 |
| `installPlugin`                | function | Takes a `SkillScope`, not a host's scope word                                                                                                                                                            |
| `uninstallPlugin`              | function | Answers `removed` \| `absent`, throws for anything else                                                                                                                                                  |
| `listPlugins`                  | function | Answers `{ pluginKey, installPath, enabled }`                                                                                                                                                            |

**Every member that touches an installation takes `HostCallOptions`**, the two that only READ
included. `isAvailable` and `listPlugins` were declared without it and gained it on 2026-09-22,
re-derived against the pinned `@openai/codex` 0.155.1 with `HOME` and `CODEX_HOME` pinned to a
scratch tree and `TMPDIR` moved out of it:

- `codex --version` wrote `$CODEX_HOME/tmp/arg0/codex-arg08a6Nd7` before it read an argument, so on
  that host the availability probe is a WRITE — a probe with no way to name an installation writes
  the developer's own on every run;
- `codex plugin list --json` listed the same plugins from two different project directories and
  answered `{"installed":[]}` under a second `CODEX_HOME` from the first one. The subcommand takes
  no project or scope argument at all (`-m/--marketplace`, `--available`, `--json`).

So on Codex the listing's MEMBERSHIP is a function of `CODEX_HOME` and the probe writes into it,
and without the option neither member could be pointed at a test's installation. For Claude the
probe changes no file — `claude --version` under a pinned scratch `HOME` and `CLAUDE_CONFIG_DIR`
wrote nothing, measured 2026-09-21 — and the listing reads the registry under the pinned tree
instead of the user's own.

**The `enabled` switch is NOT a function of `CODEX_HOME`, and reading the bullet above as though it
were is what made the Codex host ask from the wrong place.** Taking "no project argument" to mean
"the directory cannot matter", its first draft pinned every call to the home directory — so the
field the seam was widened to carry answered the global switch to every caller and could never
report the one state it exists for. The correction is in `codexListPlugins`: a WRITE is made from
the home directory, a LISTING from the project.

**`projectDir` on `listPlugins` carries the other half**, and both hosts use it: Claude reads that
project's `settings.json` for the enabled switch, and Codex reads the project's own
`.codex/config.toml` for it — but only where the GLOBAL config carries
`[projects."<abs path>"] trust_level = "trusted"`. Measured as a paired control in one `CODEX_HOME`
on 2026-09-22, with only that entry added and removed between runs: trusted, the project's
`enabled = false` won; untrusted, it was ignored and the global `enabled = true` answered. The
listing does not say which of the two decided it, so no caller may read `enabled: true` as "this
project has it switched on".

The roster is pinned by name and by kind in
`src/cli/lib/hosts/__tests__/a-plugin-host-answers-one-contract.test.ts`, which runs the contract
against a fake in-file host as well as against Claude's — so a member only Claude could implement
fails there rather than at the next host.

## What the seam carries that the old call sites could not

| Difference, measured on Codex 0.155.1                        | What answers it                                      |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| Codex installs plugins globally only                         | `offeredPlacements` + `installsProjectScopedPlugins` |
| `codex plugin remove` cannot be trusted for its exit code    | `PluginRemovalOutcome`                               |
| Codex keeps disabled plugins in its listing                  | `HostPlugin.enabled`                                 |
| `CLAUDE_CONFIG_DIR` against `CODEX_HOME`                     | `HostCallOptions.configDir`, on every member         |
| `marketplace update` against `marketplace upgrade`, git-only | the member is `refreshMarketplace`                   |

**`PluginRemovalOutcome` is the one that changes a caller today.** `claudePluginUninstall` returned
`void` and swallowed both spellings of "there was no such plugin", so `uninstall` reported a count
of removals it never observed (D11(b)). It now answers `removed` or `absent` and throws only for a
failure that is neither. Both spellings stay in the list — dropping either turns an ordinary second
uninstall into a thrown error.

**Its readers landed on 2026-09-22, and until they did the sentence above was about intent.** The
member was declared and discarded at both call sites — `removePluginWhereverItIsFiled` in
`commands/uninstall.tsx` dropped the answer and the command counted `entry.names`, and
`uninstallPluginSkills` pushed every id it asked about. Both now report what the host observed:
`uninstall` prints its per-plugin line and its count only for a removal it saw, and says nothing
rather than `Uninstalled 0 plugins` when it saw none. This is the shape the finding beside this page
is about — a declared member with no caller reads exactly like a finished one — one member further
along from `listPlugins`.

## `offeredPlacements` is binding, and that is a separate mechanism

The roster was declared so a refusal could read data off the host instead of being written as
`if (provider === "codex")` in the installer — and nothing consulted it, so it was neither. A roster
nobody reads is not a rule: the installer goes on trying whatever it is asked for, and the roster
reads as correct because nothing ever contradicts it.

`bindsItsOfferedPlacements` in `lib/hosts/offered-placements.ts` is applied by `hostFor` to every
host it answers, so `installPlugin` refuses a plugin cell the roster does not carry and names the
cells it does:

```
Refusing to install web-framework-react@a-marketplace as plugin+project: the codex host offers
plugin+global, eject+global, eject+project. Nothing has been changed.
```

It is applied at the DOOR rather than inside a host, because a rule each host re-implements is a
rule the next host forgets. `refuseUnofferedPlacement` is exported beside it for the install
pre-flight, which owes the same refusal earlier — before a config is written rather than after the
first skill has been installed.

**And the READ path owes it too, which is a hole `cp` can reach.** Nothing ties a folder's contents
to its name and the ruling forbids the `provider` field that would, so a user who copies
`.agents-inc/claude/` to `.agents-inc/codex/` has a Codex installation holding a configuration that
never met the install pre-flight. `refuseUnofferedPlacements(skills, host)` — the plural, beside the
singular — walks a loaded config's non-excluded rows. `unofferablePlacementsFound` in
`lib/hosts/configured-placements.ts` calls it at each scope, against that scope's OWN host, for
`compile`, `doctor`, `edit`, `update` and `share`. One message rather than two
spellings, because both readings come off the same roster.
`e2e/lifecycle/codex-refusal-on-the-read-path.e2e.test.ts` pairs the refusal with the same row on
Claude, where the cell exists.

## Two members degrade rather than throw, and the rest do not

A marketplace whose SOURCE has gone away fails both of Codex's listing verbs outright — measured on
the pinned 0.155.1 by adding a local marketplace and moving its directory:

```
$ codex plugin marketplace list --json     # exit 1, no JSON
Error: failed to load marketplace(s):
- `c4-measure-marketplace` at <gone>: marketplace root does not contain a supported manifest
$ codex plugin list --json                 # exit 1, no JSON
Error: failed to load configured marketplace snapshot(s): …
```

The failure is total over the registry and has nothing to do with this CLI: one entry a user added
by hand and later deleted takes down every read the host makes. `plugin marketplace add` and
`plugin remove` both still exit 0 in that state, measured. So `marketplaceExists` answers `false`
and `listPlugins` answers `[]`, each after a `warn()` quoting Codex's own words — the refusal names
the marketplace and the path, and neither is derivable from anything the CLI holds. Every other
member goes on throwing: a write whose correctness is decided by a listing must not be told the
listing was empty, or a removal reports `absent` for a plugin it never looked at.

**What the specs hold, and the one thing they do not — measured, not guessed.** The contract spec
pins the pair (refused, and allowed) over an in-file three-cell host, and it is mutation-checked
both ways on 2026-09-22: a guard that refuses nothing reddens 1 case, and a guard that refuses
everything reddens 6 — including all three installing cases in the Claude wire spec, which go
through `hostFor("claude")` and so prove the door really does wrap the host it answers. That
omission is held now, and until C4 it was not: `hostFor` returning an unwrapped host reddened **0**
specs while Claude was the only host, because Claude offers every cell and the roster could never
be wrong out loud. Re-measured 2026-09-22 with the Codex host in place — `hostFor` answering
`codexHost()` unwrapped reddens **1**, `spawns nothing at all for the placement Codex does not
offer`, which is the first assertion in this directory that can see the door's wiring at all.

## Both hosts refuse the same argument values

`exec.ts` keeps three validators — `validateMarketplaceSource`, `validatePluginName`,
`validatePluginPath` — precisely because they are not any one host's, and a value each host refuses
differently is a value the CLI accepts or rejects depending on which provider a folder names. Two
such gaps were closed on 2026-09-22, both small and both invisible beside neighbours that read as
the rule:

- `refreshMarketplace` handed its name straight to `plugin marketplace upgrade` while
  `claudePluginMarketplaceUpdate` had always called `validatePluginName` first. It was the one
  value on the Codex host reaching an argument vector unchecked.
- `uninstallPlugin` held its reference to `validatePluginPath` where `claudePluginUninstall` holds
  it to `validatePluginName`. A reference is `<name>@<marketplace>` and needs neither the colon nor
  the tilde the path check admits, so one argument was refused on one host and spawned on the
  other. Reverting that fix reddened nothing until the paired spec beside it was written, which is
  the reason it is named here rather than left as a tidy-up.

A third was closed on 2026-09-23, and it is a different shape: not one host refusing what the
other accepts, but BOTH refusing a value neither should. `validateMarketplaceSource` held every
source to `SAFE_PLUGIN_PATH_PATTERN`, which admits no space — and a marketplace source is either
a reference a user types (`owner/repo`) or a DIRECTORY on this machine, whose name is the
filesystem's to decide. Under a home directory called `/Users/My Name` the CLI refused a directory
both host CLIs accept. The pattern now applies to a reference only; a source that names a directory
keeps the length bound and the control-character refusal and nothing else, because `execCommand`
spawns with an argv array and never passes `shell`, so there is no shell to re-read it.
`hosts/__tests__/a-marketplace-directory-with-a-space-reaches-the-host.test.ts` pins both halves.

## Do not try to generalise by swapping the binary name

Codex's plugin verbs are `add` / `remove` / `list` / `marketplace {add,list,upgrade,remove}` — not
`install` / `uninstall` / `marketplace update`. A shared argv builder with the binary name swapped
produces a command neither host has. Each host builds its own argv, and
`src/cli/lib/hosts/__tests__/the-claude-host-spawns-what-it-spawns-today.test.ts` records every one
of Claude's — command, arguments, working directory and `CLAUDE_CONFIG_DIR` — as literals, so an
argv that moves is a red spec rather than an invisible change on a machine with no `claude` binary.

## Getting a host: two doors, two questions

```typescript
hostAt(projectDir); // the host the installation under this directory belongs to
hostFor(provider); // the host for a provider this run has been TOLD
```

`hostAt` is `providerInUse` from `install-layout.ts` with a host on the end of it, and is what
almost every caller uses: the folder is the only record of a provider — there is no field in
`config.ts` and nothing in a shared payload carries one. `hostFor` exists for the caller that has
been told instead, which is `--provider` on a greenfield `init --from`: there the folder has not
been created yet, so no amount of reading disk can answer.

**Both doors answer both providers, and the refusal that stood here until C4 is gone.** It read
_"Codex is refused by name, in both doors"_ and named `refuseAProviderWithNoHost` in
`install-layout.ts` beside it; both were deleted with C4 rather than widened, because a refusal
naming one provider and a `PROVIDERS` roster naming two is a disagreement waiting to be resolved in
the wrong direction. The window they covered was real — answering Claude's host for a Codex
installation would have installed Claude's plugins into it, exited 0 and left every test green — and
what closed it was building the host.

**`hostAt` reads the run's own choice before it reads the folder**, which is what `--provider` sets
through `chooseProviderForThisRun` in `install-layout.ts`. The flag answers the two questions a
folder cannot: a greenfield install has no folder, and a scope holding `.agents-inc/claude/` beside
`.agents-inc/codex/` has two. With no flag nothing changes, so every existing invocation still reads
the disk.

## Who calls it

| Caller                                             | Members used                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lib/operations/skills/install-plugin-skills.ts`   | `installPlugin`                                                                       |
| `lib/operations/skills/uninstall-plugin-skills.ts` | `uninstallPlugin`                                                                     |
| `lib/operations/source/ensure-marketplace.ts`      | `marketplaceExists`, `addMarketplace`, `refreshMarketplace`                           |
| `lib/installation/mode-migrator.ts`                | `installPlugin`, `uninstallPlugin`                                                    |
| `commands/edit.tsx`                                | `installPlugin`, `uninstallPlugin`                                                    |
| `commands/update.ts`                               | `provider`, `isAvailable`, `refreshMarketplace`                                       |
| `commands/uninstall.tsx`                           | `isAvailable`, `uninstallPlugin`, `offeredPlacements`, `installsProjectScopedPlugins` |
| `compile`, `doctor`, `edit`, `update`, `share`     | `offeredPlacements`, through `hosts/configured-placements.ts`                         |
| `lib/plugins/plugin-discovery.ts`                  | `listPlugins` — the whole plugin READ path                                            |
| `commands/init.tsx`, `base-command.ts`             | none directly — they resolve a host and hand it to `ensureMarketplace`                |

**`plugin-discovery.ts` is the READ path and was wired straight to Claude until 2026-09-22.** C3
declared `listPlugins` and moved no reader onto it, so the member had no production caller at all
while `getVerifiedPluginInstallPaths` went on reading `~/.claude/plugins/installed_plugins.json`
and `<project>/.claude/settings.json` by hand — and every caller above it (`multi-source-loader`,
`agent-recompiler`, `discover-skills`, `edit`, `uninstall`, `doctor`) read as host-agnostic while
being wired to one host. The verbs and their signatures did not change; where the two files are
read did.

`ensureMarketplace` is the only one handed a host rather than reading one off a folder: a
marketplace is user-level state under one HOME, its verbs take a name and a source and nothing
else, and it is given no directory at all. `requireMarketplaceOrExit` on `base-command.ts` is what
passes it through, and every one of its four call sites holds the install root the run is about.

**Re-derive rather than trusting the table** — from `packages/cli`:

```
grep -rln "hostAt\|hostFor" src/cli --include='*.ts' --include='*.tsx' | grep -v "hosts/\|__tests__" | grep -v '\.test\.'
```

## The enforcement

Two gates, and they fail apart.

- **An ESLint `no-restricted-imports` group** refuses `claudePluginInstall` and the rest — plus
  `isClaudeCLIAvailable`, because a caller holding the availability probe has decided which host it
  is talking to — outside `src/cli/lib/hosts/`. It reports a caller as it is being written, with
  `hostFor` named in the message. `src/cli/lib/__tests__/claude-plugin-imports-are-funnelled.test.ts`
  runs it against a planted violation and an allowed case in every zone the config declares.
- **A census over the product tree**
  (`lib/hosts/__tests__/the-claude-vocabulary-stays-behind-the-seam.test.ts`) reports a caller that
  already exists. It is a substring scan and cannot tell an import from a comment; the rule reads
  the import and cannot see a name reached any other way.

The census reads `src/` only. The `e2e/` tree reaches `claude-host.ts` directly and deliberately:
`e2e/global-setup.ts` sweeps marketplaces a run leaves behind, and `claudePluginMarketplaceList`
and `claudePluginMarketplaceRemove` are on no host interface, because no command removes a
marketplace. A spec about what the CLI does _through_ the seam uses `hostFor("claude")` —
`e2e/smoke/plugin-host-contract.smoke.test.ts` is the one that does, and it is the only layer that
can tell whether the real binary still answers the way the `absent` classification assumes.

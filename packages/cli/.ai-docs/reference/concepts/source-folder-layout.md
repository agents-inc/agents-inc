---
scope: reference
area: concepts
keywords:
  [
    source-folder,
    SOURCE_ROOT_DIR,
    LEGACY_SOURCE_DIR,
    CLAUDE_SRC_DIR,
    sourceDir,
    sourceDirName,
    sourceFolderInUse,
    sourceRootOf,
    resolveSourceDir,
    relativeConfigPath,
    sourceFolderName,
    unusedSourceFolderName,
    plannedSourceFolderMove,
    everySourceFolderName,
    providerInUse,
    chooseProviderForThisRun,
    detectInstallations,
    PROVIDERS,
    Provider,
    install-layout,
    rival-folders,
    config-types,
  ]
related:
  - reference/concepts/plugin-hosts.md
  - reference/features/configuration.md
  - reference/concepts/scope-system.md
last_validated: 2026-09-22
---

# The source folder, and moving one by hand

Where a scope keeps its agents-inc source, which folder this release creates, and the manual
procedure for moving an installation from the old name to the new one — **there is no command that
does it**.

## The two names

| Folder                    | What it is                                                                   |
| ------------------------- | ---------------------------------------------------------------------------- |
| `.agents-inc/<provider>/` | What every new installation is created in, at both scopes. `claude`, `codex` |
| `.claude-src/`            | What every installation made before the rename carries. Claude only          |

An installation on `.claude-src/` is **read and written there indefinitely.** Nothing expires, no
release moves it, and no command in this CLI moves one. `doctor`'s `Layout` row says which folder
each scope is on; that is the whole of what the product says about it.

The resolver is `resolveSourceDir` / `sourceFolderInUse` in
`src/cli/lib/installation/install-layout.ts`, and its preference order is what makes a half-finished
move recoverable: a folder holding a `config.ts` wins before a folder merely holding content, so the
live installation keeps being read while a new folder is being assembled beside it.

## Two folders on disk is refused, not merged

A scope holding BOTH of Claude's folders — `.claude-src/` and `.agents-inc/claude/` — stops
`init`, `edit`, `compile`, `eject` and `update` (each calls `settleSourceLayoutBeforeWriting`) with
`WRITE_REFUSED_RIVAL_SOURCE_FOLDERS`, and `doctor` still reports on it. The reason is the preference
order above: with two folders the resolver reads whichever holds a `config.ts`, and that can
perfectly well be the stale one — so a write that went ahead would land in a folder nothing
compiles, beside a folder holding sub-agents the user is about to stop seeing.

Nothing merges them. The refusal names the folder being read and asks for the manual merge, because
that is a decision only the person looking at the two folders can take.

## Two PROVIDERS in one scope is a different state, and it is allowed

`.agents-inc/claude/` beside `.agents-inc/codex/` is **not** the state above and is not refused.
Two source-folder NAMES for one installation is a broken move; two PROVIDER folders is two
installations, which is a supported thing to have. Each provider family inherits and propagates
only within itself.

| State in one scope                                                    | What happens                                                                                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude-src/` beside `.agents-inc/claude/`                           | the five write commands above refuse; `doctor` reports                                                                                                                                       |
| `.agents-inc/claude/` (or `.claude-src/`) beside `.agents-inc/codex/` | both are live. `edit`, `uninstall`, `share`, `eject`, `compile` and `update` refuse to GUESS, naming `--provider`; `doctor` reports the finding and `list` names both above the one it shows |

The legacy name is Claude's alone — `legacyFolderFor` in `install-layout.ts` answers `null` for
every other provider, so `SourceFolder.both` is never true for Codex — which is why a `.claude-src/`
beside `.agents-inc/codex/` is two installations rather than a rival pair.

The second refusal is `refuseAnAmbiguousInstallation` in
`src/cli/lib/installation/provider-flag.ts`, and `ambiguityFinding` beside it is the reporting form
`doctor` uses — a read-only command that refused would leave a user unable to LOOK at the one state
they most need to see. `otherInstallationsInThisScope`, the third form in that module, is `list`'s:
it names both installations and says which one the report below it is, because `list` neither acts
on one nor describes them all. All three read `installationsInPlay` in that module: the project's
installations first, and the global's only where the project has none, out of
`detectInstallations` in `src/cli/lib/installation/detect-installations.ts`, which answers every
installation it can see.

**Nothing ties a folder's contents to its name.** There is no `provider` field in `config.ts`, so a
Claude configuration copied into `.agents-inc/codex/` is a Codex installation that never met the
Codex install's pre-flight. `refuseUnofferedPlacements` in
`src/cli/lib/hosts/offered-placements.ts` is called from the config-READ path for that reason, not
only from `init`.

## Moving a scope by hand

Do this in the scope's own root — the project directory, or `$HOME` for the global installation.

```sh
mkdir -p .agents-inc
mv .claude-src .agents-inc/claude
npx agents-inc compile
```

`compile` is not optional, and neither is running it from the same directory. It is what repairs the
first gotcha below.

### Gotcha 1 — `config-types.ts`'s relative import gains a level

A project whose machine also has a global installation gets a `config-types.ts` that imports the
global one by **relative path**, built by `computeGlobalTypesImportPath` in
`src/cli/lib/configuration/config-types-io.ts` as `path.relative(projectSourceDir, globalSourceDir)`.

`.claude-src/` sits one level under the project root; `.agents-inc/claude/` sits two. So a move adds
a level and every specifier written before it is off by one `../`:

| Project on           | Global on     | Specifier                               |
| -------------------- | ------------- | --------------------------------------- |
| `.claude-src`        | `.claude-src` | `../../<home>/.claude-src/config-types` |
| `.agents-inc/claude` | `.claude-src` | one `../` deeper                        |

Both ends are resolved rather than assumed, so a project and a global on different layouts each
contribute their own depth. `npx agents-inc compile` recomputes and rewrites the specifier; a
project moved without it type-checks against nothing and the editor reports an unresolved import.

**Move the global scope and every registered project's specifier is falsified too.** `compile` run
at `$HOME` rewrites the pair of each registered project on the same provider —
`reconcileTypesFromDisk` → `propagateGlobalChangesToProjects` → `writeProjectConfigPair`, which
recomputes the specifier — and a project it has not registered needs its own `compile`, in its own
directory. `doctor`, run at `$HOME`, lists the registered projects still on the old folder under
`REGISTRY_IS_NOT_AN_INVENTORY`, and that list is the registry rather than an inventory of the
machine, so it under-reports by however many installs were never registered.

### Gotcha 2 — a `.gitignore` covering `.agents-inc/` hides the moved config from git

If the repository's `.gitignore` carries a bare `.agents-inc/` rule — the natural thing to write for
a tool directory — then after the move the configuration is ignored where it was tracked before. The
next `git add -A` records the **deletion and nothing else**, and the configuration leaves the
repository with nobody seeing it go.

Check before moving, and again after:

```sh
git check-ignore -v .agents-inc/claude/config.ts
```

A bare directory rule cannot be negated from inside — git does not re-include a path under an
excluded directory — so the narrowing that works is the star form:

```gitignore
.agents-inc/*
!.agents-inc/claude/
!.agents-inc/codex/
```

Then **commit the deletion and the addition together.** A commit that stages only the deletion is
how a migrated configuration leaves a repository without anyone reviewing it.

## What the CLI does say about all this

| Surface                        | Where it lives                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `doctor`'s `Layout` row        | `layoutFindingFor` in `src/cli/lib/installation/layout-findings.ts`, one per scope |
| The rival-folder write refusal | `refuseRivalSourceFolders` in `src/cli/base-command.ts`                            |
| The scopes both of them read   | `sourceScopesInPlay` in `src/cli/lib/installation/source-scopes.ts`                |

`doctor` also reports a third state this page has not covered: an installed agent whose own prompt
names the folder this installation is NOT on. `agent-summoner`'s playbook tells an agent where to
author new sub-agents, so a copy compiled under the other layout writes files that silently never
compile. The remedy is the same `compile`.

## Specs

- `e2e/commands/doctor-layout-row.e2e.test.ts` — the `Layout` row, every reported state paired with
  the state that must not report it.
- `e2e/commands/rival-source-folders-refuse-writes.e2e.test.ts` — the refusal, each write command
  paired with the same command on a one-folder scope.
- `src/cli/lib/installation/install-layout.test.ts` — the preference order, rung by rung.

## History

`migrate`, a command that performed this move, existed in the working tree on 2026-09-20 and was
deleted the same day by owner ruling — _"We don't have a migrate command and I didn't tell you to
make one"_ → _"Delete all of it."_ It had been adopted from a plan's recommendation rather than
asked for. Its forwarding stub, `--adopt` merge, registered-project rewrite and git-visibility probe
went with it, and this page is what replaces the invocation.

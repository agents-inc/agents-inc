# D-310: A global installation contains only global-scoped skills — enforce it at the install boundary

Filed 2026-08-04.

**The invariant:** a global installation contains only global-scoped skills.

It is already enforced in the wizard, and not enforced at the install boundary — so any route that
bypasses the wizard bypasses the rule. Two such routes exist. This item is those two enforcement
points, plus one stale entry left on this machine by their absence.

The wizard side of the invariant is `init.tsx:279`: the interactive producer computes
`const isGlobalRoot = isHomeDirectory(projectDir)` and threads it into the wizard session, where
global mode does not let a skill be set to project scope. `selectionFromSharedConfig`
(`init.tsx:313-354`) computes nothing of the sort, and no layer below it re-checks — which is what
makes the two points below load-bearing rather than belt-and-braces.

**Why the boundary and not the config:** `toClaudePluginScope` maps
`scope === "global" ? "user" : "project"` (`src/cli/lib/plugins/plugin-ref.ts:24-26`). The scope
recorded on disk is the scope the config _declares_, never the target the install actually resolved
to. Nothing downstream can notice a declared scope that contradicts where the install landed, so
whatever the boundary lets through becomes the truth.

---

## Enforcement point 1 — the payload

**When `--from` installs into the global scope and the incoming shared configuration contains any
project-scoped skill, the CLI errors and installs nothing.** The message tells the user those skills
have to be installed from inside a project.

Hard error, not a warning and not a prompt. The trigger is the presence of **any** project-scoped
skill — a wholly project-scoped payload and a mixed one are the same case.

**Where the values are.** The payload states each skill's scope directly —
`seedSkillSchema.scope: z.enum(["project", "global"])` (`src/cli/lib/seed/seed-schema.ts:37`) — and
`seedToWizardResult` copies it onto the `SkillConfig` verbatim: `scope: entry.scope`
(`src/cli/lib/seed/seed-to-wizard.ts:152`). No step between the wire and the installer reads it
again, so the check has everything it needs the moment `seedToWizardResult` returns.

**Where global-ness is.** `run()` already holds `const projectDir = process.cwd()`
(`init.tsx:243`), and `isHomeDirectory` (`src/cli/lib/installation/is-home-directory.ts:13`) is the
existing, symlink-safe answer — the same one `init.tsx:279` uses on the wizard route.

**Placement.** Nothing may be written: the refusal has to land before `writeProjectConfig` and
before the first `claudePluginInstall`, i.e. before `handleInstallation` (`init.tsx:263`). It also
has to precede the `Installing N skill(s) across M sub-agent(s)` log at `init.tsx:342-346` —
refusing after that line tells the user an install is starting and then aborts it.

**Exit code.** `EXIT_CODES.ERROR`, matching the two sibling refusals in the same command: the empty
selection at `init.tsx:260` and the fetch failure at `init.tsx:320`.

**Message.** Name the offending skill ids, as `selectionFromSharedConfig` already does for skipped
ids (`init.tsx:331-340`) — "3 skills were skipped" cannot be acted on, the ids can.

---

## Enforcement point 2 — the location

**The home directory is never a valid _project_ directory.** Resolving it as one is refused, with a
message saying the home directory is the global scope.

**Requirement, not an aside: this must fire only when resolving `$HOME` as a project, never when
installing globally from `$HOME`.** Running the CLI's global install while sitting in the home
directory is completely normal and must keep working. The guard's subject is the _role_ the
directory is being resolved into, not the directory the user happens to be standing in.

**The dotfiles case, and why it does not block this.** Some people keep `$HOME` as a git repository
for dotfiles, and such a directory passes every normal test for "a project directory". It still
cannot be one here, because a project install there writes `~/.claude` and `~/.claude-src` —
precisely what a global install writes. The proof is `resolvePluginCwd`
(`src/cli/utils/exec.ts:135-137`): it sends `user` scope to `os.homedir()` and everything else to
`projectDir`, so when `projectDir` **is** `os.homedir()` both branches execute in the same
directory. The two installs are the same thing on disk regardless of what we call them. The
collision is unavoidable, and that is the argument for declaring `$HOME` global rather than trying
to support both.

**Why the collision exists at all.** `GLOBAL_INSTALL_ROOT` is `os.homedir()`
(`src/cli/consts.ts:32`), and the project directory is resolved from the working directory wherever
it is not passed explicitly:

- `src/cli/lib/plugins/plugin-finder.ts:29` (`getCollectivePluginDir`) and `:34`
  (`getProjectPluginsDir`) — `const dir = projectDir ?? process.cwd();`
- `src/cli/lib/plugins/plugin-info.ts:41` (`getPluginInfo`) — same line
- `src/cli/lib/installation/installation.ts:103` (`detectInstallation`) and `:114`
  (`getInstallationOrThrow`) — `projectDir: string = process.cwd()`
- `src/cli/lib/operations/project/detect-project.ts:24` — `const resolvedDir = projectDir ?? process.cwd();`
- `src/cli/lib/loading/source-loader.ts:98` and `src/cli/components/wizard/wizard.tsx:258` — the
  `|| process.cwd()` form of the same thing

The config layer already answers this question correctly wherever it is asked: `isHomeDirectory`
gates the config path (`src/cli/lib/configuration/project-config.ts:114`), the types writer
(`config-types-writer.ts:366` and `:378`), the write gate (`src/cli/lib/config-gate/index.ts:201`),
source management (`configuration/source-manager.ts:76`), the loaders
(`loading/source-loader.ts:102`, `loading/multi-source-loader.ts:186`) and the local installer
(`installation/local-installer.ts:525` and `:598`). What is missing is a refusal at the point where
the directory is accepted as a project in the first place.

**Shape of the fix, not a design.** Either refuse to resolve the global root into a project
directory at all, or record scope from the resolved install target rather than from the working
directory. The trade-off is unexamined — the first is a refusal a user could hit legitimately, the
second changes what an existing project-scoped record means. Settle it before writing code.

---

## How this class of failure shows up on disk — the 2026-08-01 incident

Background, not the spine of the item. This is what it looks like once a project scope has been
recorded against the global root.

**The run**, from the session record rather than inference:

- Session `2348a551-fefb-4149-b49b-f993c0dd448f`, cwd `/home/vince`, `2026-08-01T18:00:54` to
  `18:01:06` (`~/.claude/projects/-home-vince/2348a551-fefb-4149-b49b-f993c0dd448f.jsonl`).
- Command:
  `AGENTS_INC_API_URL=http://localhost:8787 node /home/vince/dev/cli/dist/index.js init --from 26-9qPud`
- Output: `Selected 2 skills`, `Installing 2 skill(s) across 4 sub-agent(s)`,
  `Install mode: Plugin (native install)`, `Installed web-framework-react@agents-inc`,
  `Installed web-meta-framework-nextjs@agents-inc`, `Installed 2 skill plugins`.
- `~/.claude/plugins/installed_plugins.json` records `web-meta-framework-nextjs@agents-inc` at
  `2026-08-01T18:01:01.610Z` with `"scope": "project"` and `"projectPath": "/home/vince"`.

**Whether enforcement point 1 would have caught this run is unresolvable from the surviving
evidence, and nobody should re-derive it.** The session output records no scope information, and the
configuration came from a localhost server whose data is gone. An earlier analysis in this
investigation asserted the payload was not project-scoped and that point 1 therefore would not have
fired; that was never verified. Since `toClaudePluginScope` derives the recorded scope from the
declared one, a project-scoped skill in that payload would have been recorded exactly as this one
was — so point 1 may well have caught it.

**What it cost.** On `2026-08-02T22:51` a genuine global install rewrote the global configuration:
it removed the old globally-scoped plugins and rebuilt `enabledPlugins` (React's second manifest
entry carries that timestamp and `"scope": "user"`). `web-meta-framework-nextjs` was filed
project-scoped, so the removal never matched it and its `enabledPlugins` entry survived. React,
installed in the same original run, is fine.

The user-visible symptom is in the wizard: the Meta-Framework grid reads `enabledPlugins` and shows
Next.js as globally selected, `config.ts` does not contain it, and the confirm step therefore
reports it as a change the user is making — when they never selected it.

**Registration dedup, an observation rather than a caveat.** The 2026-08-01 run installed both
skills, but the manifest holds no new React entry from it: React's two entries are a 2026-07-10
project install at `/home/vince/dev/turborepo-monorepo` and the 2026-08-02 user install. React was
therefore already registered and the run skipped re-registering it; Next.js was new and took the
working-directory-derived scope. Registration deduplicates, which is why one skill from a two-skill
run carries the defect and the other does not.

---

## Cleanup: one stale `enabledPlugins` entry

`web-meta-framework-nextjs@agents-inc` is still `true` in `~/.claude/settings.json`. Removing it by
hand is trivial — but a user who hits this has no way to know it happened, and no way to name what
they are looking at.

A `doctor` check for **entries present in `enabledPlugins` and absent from `config.ts`** would
surface exactly this class. **Do not implement it as part of this item**; record it as the surfacing
mechanism the defect argues for. Cross-ref D-210 (merge `validate` into `doctor`), which is where a
new check would land.

---

## Verified state, 2026-08-04

- `~/.claude/settings.json` `enabledPlugins` holds **38** `@agents-inc` entries set to `true`;
  `~/.claude-src/config.ts` holds **37** global skills. The difference is exactly
  `web-meta-framework-nextjs`, and nothing in `config.ts` is missing from `enabledPlugins`.
- `~/.claude/plugins/cache/agents-inc/` holds 51 skill directories; 14 have no `config.ts` entry.
  Twelve of those are correctly marked `.orphaned_at` and absent from the manifest — un-swept
  downloads, not this bug.
- Of the remaining two: `web-meta-framework-nextjs` is un-orphaned, in the manifest and enabled —
  the genuine stale entry. `web-styling-scss-modules` is also un-orphaned and in the manifest, but
  as a legitimate project install for `/home/vince/dev/turborepo-monorepo`; it is **not** enabled
  globally.
- The only project-scoped manifest records are six at `/home/vince/dev/turborepo-monorepo` dated
  2026-07-10, and `web-meta-framework-nextjs` at `/home/vince` dated 2026-08-01.

---

## Tests

**Point 1 — the payload**

- A `--from` payload with one project-scoped skill, run from the global root: exit code is
  `EXIT_CODES.ERROR`, the message names that skill, `~/.claude-src/config.ts` and
  `~/.claude/settings.json` are byte-identical afterwards, and `claudePluginInstall` is never called.
- The same payload run from a project directory installs normally.
- An all-global payload run from the global root installs normally — the guard must not fire on the
  case it exists to protect.
- A mixed payload is refused on the same terms as a wholly project-scoped one.

**Point 2 — the location**

- Resolving `$HOME` as a project directory is refused, and the message says the home directory is
  the global scope.
- **A global install run from `$HOME` still succeeds.** This is the regression the guard is most
  likely to cause, so it needs its own spec rather than riding on an existing one.
- `$HOME` containing a `.git` directory changes nothing: still refused as a project, still fine as a
  global install.

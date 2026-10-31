# CLI-1006 — several marketplaces in one configuration

Owner, 2026-10-30: "we will not do this now"; "it will be done after everything else". The direction is
the CLI-1006 row in [`../cli.md`](../cli.md). Until it starts, a bug from mixing marketplaces is listed
here and not fixed.

Source: the 2026-10-30 sweep (three finders, one verifier that re-ran the repros),
`r44/resume-1029/cli/CLI-1006-sweep/` (session r44); `verify/` holds the verifier's runs. Re-derive
every claim when the work starts; files and functions are named, the tree will have moved.

## Bugs it fixes or partly fixes

Logged:

- **CLI-1005** (fixes): a link shared from a project under a private global installs none of the
  private skills. Its own one-marketplace-per-link fix is replaced.
- **CLI-999** (fixes): a home-folder ejected private skill is skipped, and `doctor` fails, in a
  public-catalogue project; the same skill as a plugin is listed. Closed 2026-10-30 without a
  change; covered here.
- **CLI-998** (moot): `edit --from`'s missing notice has nothing to report once each skill names its
  marketplace, unless `edit --from` stays on one marketplace (see CLI-916 below).
- **CLI-917** (partly): a link's stack is looked up in one marketplace only. The refusal text lands
  now as the owner's answer.

New, found by the sweep and confirmed by reproduction:

- **Home-folder `edit` drops ejected private skills** (fixes): a global from a private marketplace
  whose skills are all ejected opens the editor on the public catalogue with nothing selected. So
  "from the home folder, as today" is not a working baseline. `seedPayloadForInstallation`
  (`lib/seed/installation-payload.ts`) names no marketplace.
- **Bare `edit` does not warn about a skill the editor will drop** (fixes); `share` warns about the
  same skill. `openInEditor` (`commands/edit.tsx`) never reads `leftBehind`; `caveatsAbout`
  (`commands/share.ts`) does.
- **A folder marketplace opens the editor on a load that cannot work** (partly): `edit` prints the
  link with no warning, and the editor's Marketplace dialog rejects the path. `share` warns
  (`isAFolder`); `edit` does not.
- **A public skill added to a private global from a project breaks `doctor` and `edit` at home**
  (partly): `edit --from` writes it into a global config that names only the private marketplace.
  `doctor` then fails at home ("Skills Resolved ✗ … (not found)", exit 1).
- **`doctor` checks only the project's marketplace** (enables): an unreachable global marketplace
  shows up as unknown skill ids. See `checkSourceReachable` (`commands/doctor.ts`) and
  `validateRegisteredSources` (`lib/content-validator.ts`).
- **The marketplace line on `list` and the install summaries names the wrong marketplace** when skills
  come from two (enables). See `ListView` (`commands/list.tsx`) and `formatSkillMarketplaces`
  (`components/common/summary-panel.tsx`).
- **Ejecting a global private plugin into a project fails with a misleading message** (partly): it
  fails with ENOENT on a path in the public catalogue's folder, exit 1. See
  `copySkillToLocalFlattened` (`lib/skills/skill-copier.ts`).
- **The composer suggests only public skills, then shows none** with a private marketplace loaded
  (partly). See `trustedIds` (`apps/server/src/compose.ts`) and `groupsFor` (editor
  `compose-proposal.ts`).
- Unconfirmed, from code only: turning an ejected skill from another marketplace back into a plugin
  asks the installation's marketplace for it (`installMigratedPlugins`, `mode-migrator.ts`).

## Features it covers

- **CLI-903** and **CLI-906** (fixes): a link, and an installation's config, record several
  marketplaces. CLI-1006 cannot be built without something like CLI-906's `{ name, url }` list,
  since a skill's `origin` holds only a name.
- **CLI-904** (enables): a private marketplace's stack including public skills.
- One setup built from public and private skills side by side in the editor.

The sweep checked and rejected four: CLI-719, CLI-905, EDITOR-22 and `search` across marketplaces.
Each is buildable today or is not something CLI-1006 needs.

## Rulings and contracts it would undo — to put to the owner when it starts

- **CLI-916**, landed: `edit --from` reads the installation's own marketplace, and a marketplace a
  link names "is never fetched". The user's pick of a marketplace's variant needs it fetched.
- **The editor's one-marketplace model**: the owner's 2026-10-22 answers (one saved configuration per
  marketplace; a stack from another marketplace makes that marketplace active), EDITOR-41's switch
  dialog, and `seatCatalog` dropping unknown ids. Card q-e2b-confirm closed with this deferral.
- **CLI-498**: two marketplaces cannot ship a skill under the same id. Ejected copies of one id from
  two marketplaces would also land in the same `.claude/skills/<id>` folder.
- **The docs**: "every installation reads one marketplace" and "one marketplace per installation" in
  `apps/www` (use-a-private-marketplace, capabilities, architecture, config-reference, the `edit`
  section of commands).
- **The link format change** (a `SEED_VERSION` bump) silently empties every stack saved in the
  browser (`readSavedStacks` drops what does not decode), and older links answer HTTP 500 until
  CLI-1005's refusal lands.

## Not yet looked at

- A project config that lists no skills or sub-agents but names a marketplace (`eject` writes one into an empty project): read that marketplace, or the global's as with no config? The CLI-1000 tester's question (2026-10-31); CLI-1000 left it reading the named one. `r44/resume-1029/cli/CLI-1000/` (session r44).

- `doctor` files a catalogue-collision refusal (`refuseCatalogueCollisions`, `lib/loading/source-loader.ts`, a plain Error) against `config/skill-categories.ts` as "failed to load categories/rules" (CLI-1011 developer, from code, not reproduced).
- Codex (`lib/hosts`): whether it can register plugins from several marketplaces in one install.
- Skills the user wrote themselves have no marketplace, and bare `edit` leaves them out today.
- The link's `external` map already carries a repo and path per skill; compare it with a
  per-skill marketplace.
- Bare `init`, `init --ui`, `compile`, and `edit`'s own screens under a mixed setup.
- Unit and e2e assertions that pin one marketplace per link or config (`seatCatalog`,
  `droppedNotice`, `share`'s left-behind warning, the per-marketplace saved slots).
- `init.tsx` builds CLI-1001's "plugins this run newly installed" list from one marketplace.
- A link whose marketplace is the empty string (CLI-916-917 researcher, rows E1 and E2).

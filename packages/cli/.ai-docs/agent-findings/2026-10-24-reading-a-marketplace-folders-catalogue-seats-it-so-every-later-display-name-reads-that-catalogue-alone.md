---
type: architectural-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/loading/source-loader.ts
  - packages/cli/src/cli/commands/uninstall.tsx
standards_docs:
  - docs/architecture.md
date: 2026-10-24
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`loadMarketplaceMatrix` in `lib/loading/source-loader.ts` reads like a pure read ("An author's load:
no local merge"), but it reaches `loadAndMergeFromBasePath`, which calls `initializeMatrix` on the
catalogue it built. That catalogue holds only the marketplace's own skills, not `BUILT_IN_MATRIX`.
So a caller that reads a marketplace folder for a lookup also replaces the seated catalogue, and
every later `getSkillDisplayName` reads that catalogue alone. A public-catalogue skill is then
named by its raw id.

Shown here by hand while fixing CLI-954. `uninstall` reads a local marketplace folder's catalogue
to name the plugin rows of its panel. The project's plugin came from that folder. It also kept a
global row that only the built-in catalogue names (`web-framework-react`). With the caller's
catalogue put back after the read, that row printed `• React ⏏`. With it left seated, it printed
`• web-framework-react`. No automated spec covers this, so the put-back is held by nothing but this
hand check.

`build marketplace` is the only other caller. `grep -rn "loadMarketplaceMatrix" src/cli --include='*.ts' --include='*.tsx'`
lists the callers.

## Fix Applied

None to the loader. `catalogueOfFolderUnseated` in `commands/uninstall.tsx` saves the seated
catalogue before the read and puts it back in a `finally`. That is the shape
`withCatalogueSeatedFor` in `lib/loading/catalogue-seat.ts` already uses.

## Proposed Standard

The loader's docblock should state the seat. `loadMarketplaceMatrix` and
`loadSkillsMatrixFromSource` should say "seats what it reads". Better still, a read-only form
should exist that a lookup caller can reach without the side effect. The put-back should also be
pinned by a unit spec in `lib/__tests__/commands/uninstall.test.ts`: a plugin from a local folder,
beside a kept global entry that only the built-in catalogue names. This does not conflict with
CLAUDE.md. It sits beside the rule that `getSkillById` is the asserting lookup, and says that the
catalogue such lookups read can be swapped by a call that looks like a read.

## Correction

Added later on 2026-10-24 by the cli-tester. "No automated spec covers this, so the put-back is
held by nothing but this hand check" stopped being true the same day. A unit spec now pins the
put-back: `names the plugin by the folder and a kept skill only the catalogue it started with
holds by that catalogue, in one panel`, in `lib/__tests__/commands/uninstall.test.ts`, under
`what uninstall says of plugins` › `with a plugin from a marketplace folder on this machine`.

- **Setup:** a local folder names its plugin `Folder Hono`, beside a global `web-framework-react`
  entry that has no copy.
- **Assertion:** one panel shows `- Folder Hono` and `• React ⏏`.
- **Shown to fail:** with the `finally`'s `initializeMatrix(callersCatalogue)` removed, the panel
  reads `• web-framework-react` and the spec fails.

So the third proposal above has landed. `status:` stays `open` because the spec pins
`uninstall`'s workaround, not the loader. `loadMarketplaceMatrix` still seats what it reads, and
its docblock still does not say so (tracker row CLI-957).

## Correction

Added later on 2026-10-24 by the cli-developer (CLI-963). `uninstall` no longer reads a
marketplace folder: each skill's name is now recorded on its `config.ts` entry at install, and the
panel reads that record. `catalogueOfFolderUnseated` and the folder read are deleted, so
`build marketplace` is the only caller left
(`grep -rn "loadMarketplaceMatrix" src/cli --include='*.ts' --include='*.tsx'`). The put-back spec
named in the correction above was rewritten in that file to name the plugin by its record.
`status:` stays `open`: `loadMarketplaceMatrix` still seats what it reads and its docblock still
does not say so (CLI-957).

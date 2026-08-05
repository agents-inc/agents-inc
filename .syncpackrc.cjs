/**
 * `bun run deps:check` runs `syncpack lint` across the whole monorepo.
 *
 * `source` is deliberately left out so that syncpack falls back to the
 * `workspaces` globs in the root package.json. Spelling the globs out here as
 * well would be a second statement of which directories are workspaces, free
 * to drift from the first.
 *
 * No version groups. Two used to live here, both existing to hide the
 * CLI-versus-web version split; the split was unified on 2026-08-05 and the
 * groups went with it, so every disagreement between any two workspaces is
 * reported again. Do not add a group to silence a report — align the versions
 * instead, taking the newer one.
 */
module.exports = {}

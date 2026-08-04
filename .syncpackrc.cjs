/**
 * `bun run deps:check` runs `syncpack lint` across the whole monorepo.
 *
 * `source` is deliberately left out so that syncpack falls back to the
 * `workspaces` globs in the root package.json. The usual house style is to
 * spell the globs out here with a recursive wildcard under `packages`, but
 * that would also pull in `packages/cli/alias/package.json`, which is not a
 * workspace: it is published by hand in lockstep with the CLI, and its
 * `@agents-inc/cli: "*"` dependency is meant to stay exactly as it is.
 */
module.exports = {
  versionGroups: [
    {
      /**
       * The CLI and the web side genuinely disagree, and that is the current
       * decision, not an oversight. The CLI is on React 18, Vitest 4,
       * TypeScript 5.7 and ESLint 9; the web app is on React 19, Vitest 3,
       * TypeScript 6 and ESLint 10. Bun installs both copies side by side, so
       * nothing is broken by the split — it was left alone during the monorepo
       * merge so that if the CLI misbehaved afterwards, the move was the only
       * possible cause.
       *
       * Giving @agents-inc/cli a version group of its own means its
       * dependencies are only ever compared against themselves, so the
       * CLI-versus-web differences stop being reported. Everything else stays
       * in the default group, so a genuine disagreement between two web
       * packages is still caught.
       *
       * DELETE THIS GROUP once the versions are unified — see REPO-06 in
       * todo/repo.md. Leaving it in place afterwards would silently let the
       * CLI drift again.
       */
      label: "@agents-inc/cli keeps its own dependency versions (see REPO-06 in todo/repo.md)",
      packages: ["@agents-inc/cli"],
      dependencies: ["**"],
    },
  ],
};

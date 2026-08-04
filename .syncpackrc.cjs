/**
 * `bun run deps:check` runs `syncpack lint` across the whole monorepo.
 *
 * `source` is deliberately left out so that syncpack falls back to the
 * `workspaces` globs in the root package.json. Spelling the globs out here as
 * well would be a second statement of which directories are workspaces, free
 * to drift from the first.
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
       * Giving agents-inc a version group of its own means its dependencies
       * are only ever compared against themselves, so the CLI-versus-web
       * differences stop being reported. Everything else stays in the default
       * group, so a genuine disagreement between two web packages is still
       * caught.
       *
       * DELETE THIS GROUP once the versions are unified — see REPO-06 in
       * todo/repo.md. Leaving it in place afterwards would silently let the
       * CLI drift again.
       */
      label: "agents-inc keeps its own dependency versions (see REPO-06 in todo/repo.md)",
      packages: ["agents-inc"],
      dependencies: ["**"],
    },
    {
      /**
       * The root package declares react and @types/react at 18 and imports
       * neither. They are there to hold bun's single root node_modules slot for
       * the CLI, whose Ink dependency takes react from whatever is hoisted —
       * the reasoning is on the `//devDependencies` key in package.json.
       *
       * Without this group the default group compares that deliberate 18
       * against the web side's 19 and reports it as drift, which is the one
       * thing it is not. Named this narrowly — two dependencies, one package —
       * so every other root version is still compared normally.
       *
       * DELETE THIS GROUP with the pin it protects — see REPO-06 in
       * todo/repo.md.
       */
      label: "the root's react pin holds bun's hoist slot, it is not drift (see REPO-06 in todo/repo.md)",
      packages: ["agents-inc-monorepo"],
      dependencies: ["react", "@types/react"],
    },
  ],
};

import { defineConfig } from "tsup";
import fg from "fast-glob";
import fs from "fs-extra";
import path from "path";

export default defineConfig({
  entry: [
    "src/cli/index.ts", // oclif entry point
    "src/cli/config-exports.ts", // library export for agents-inc/config
    "src/cli/commands/**/*.{ts,tsx}", // oclif commands (some use JSX)
    "src/cli/hooks/**/*.ts", // oclif hooks
    "src/cli/components/**/*.tsx", // Ink components
    "src/cli/stores/**/*.ts", // Zustand stores
    // Tests live beside the code they cover, so the directory globs above
    // sweep them up — and dist/ publishes wholesale. Sixteen compiled test
    // files shipped with every release until packaging.test.ts pinned this.
    "!src/cli/**/*.test.{ts,tsx}",
    "!src/cli/**/__tests__/**",
    "!src/cli/**/__mocks__/**",
  ],
  format: ["esm"],
  platform: "node",
  // @workspace/matrix is private, unpublished and ships as TypeScript, so nothing it exports can
  // be resolved at runtime from an installed tarball — it has to be inlined here. It is a
  // devDependency, which tsup already bundles by default; naming it is what makes that load-bearing
  // rather than incidental, because promoting it to `dependencies` would silently externalise it
  // and break `init --from` in the published CLI.
  noExternal: ["@workspace/matrix"],
  // Ink 7 raised the runtime floor to Node 22. Must stay in step with `engines.node` in
  // package.json — this drifted once already, when `engines` was raised and this was not.
  target: "node22",
  clean: true,
  sourcemap: true,
  shims: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Note: We need to handle multiple entry points - outDir will create structure
  outDir: "dist",
  onSuccess: async () => {
    // Belt over the entry negations above. The same tsup has three times been
    // observed emitting the compiled tests despite them — never reproducible
    // on demand, provenance never pinned, most recently inside a publish gate
    // (packaging.test.ts is the tripwire that caught every occurrence).
    // Whatever the trigger is, deleting the artifacts here makes the
    // no-shipped-tests invariant unconditional instead of probabilistic.
    const strayTests = await fg(["**/*.test.js", "**/*.test.js.map", "**/*.test.d.ts"], {
      cwd: "dist",
      absolute: true,
    });
    for (const stray of strayTests) {
      await fs.remove(stray);
    }
    if (strayTests.length > 0) {
      console.log(`Removed ${strayTests.length} stray compiled test artifacts from dist/`);
    }

    // Both copies below remove the destination first. `clean: true` clears only
    // tsup's own outputs, and `fs.copy` merges — it never drops a destination
    // entry the source no longer has. So a deleted agent survived every
    // incremental build, and dist/ publishes wholesale: five retired reviewer
    // directories and four retired PM directories were each observed sitting on
    // a path `loadAllAgents()` really does glob, carrying ids no longer in the
    // AgentName union. E2E builds the dist it then runs against, so no other
    // gate could see them. packaging.test.ts asserts the mirror.

    // Copy config/ (stacks.ts etc.) to dist/config/
    // so it's available regardless of how PROJECT_ROOT resolves at runtime
    const srcConfig = "config";
    const destConfig = path.join("dist", "config");

    if (await fs.pathExists(srcConfig)) {
      await fs.remove(destConfig);
      await fs.copy(srcConfig, destConfig);
      console.log("Copied config/ to dist/config/");
    }

    // Copy src/agents/ (agent partials + templates) to dist/src/agents/
    // so eject command can find them regardless of how PROJECT_ROOT resolves
    const srcAgents = path.join("src", "agents");
    const destAgents = path.join("dist", "src", "agents");

    if (await fs.pathExists(srcAgents)) {
      await fs.remove(destAgents);
      await fs.copy(srcAgents, destAgents);
      console.log("Copied src/agents/ to dist/src/agents/");
    }
  },
});

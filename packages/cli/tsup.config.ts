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
  // @workspace/matrix, @workspace/compile and @workspace/api are private, unpublished and ship as
  // TypeScript, so nothing they export can be resolved at runtime from an installed tarball — all
  // three have to be inlined here. They are devDependencies, which tsup already bundles by default;
  // naming them is what makes that load-bearing rather than incidental, because promoting any of
  // them to `dependencies` would silently externalise it and break `init --from` in the published
  // CLI. `@workspace/api` was inlined only incidentally until it was named here on 2026-08-29.
  noExternal: ["@workspace/matrix", "@workspace/compile", "@workspace/api"],
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

    // The `fs.remove` before the copy below is not redundant with `clean: true`.
    // tsup's clean globs `**/*` over the whole outDir and unlinks every match
    // whatever emitted it — but it only unlinks, so directories are left
    // standing, and `**/*` matches no dotfile. `fs.copy` then merges rather than
    // mirrors: it never drops a destination entry the source no longer has. So a
    // retired agent's directory outlives the source that produced it, and dist/
    // publishes wholesale. E2E builds the dist it then runs against, so no other
    // gate sees it. packaging.test.ts asserts the mirror, and compares entries
    // with `onlyFiles: false` and `dot: true` — which is what makes a surviving
    // empty directory a failure rather than a tidy-up.

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

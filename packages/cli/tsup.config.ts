import { defineConfig } from "tsup";
import fg from "fast-glob";
import fs from "fs-extra";
import path from "path";

export default defineConfig({
  entry: [
    "src/cli/index.ts",
    "src/cli/config-exports.ts",
    "src/cli/commands/**/*.{ts,tsx}",
    "src/cli/hooks/**/*.ts",
    "src/cli/components/**/*.tsx",
    // dist/ publishes wholesale, so tests beside the code must be excluded.
    "!src/cli/**/*.test.{ts,tsx}",
    "!src/cli/**/__tests__/**",
    "!src/cli/**/__mocks__/**",
  ],
  format: ["esm"],
  platform: "node",
  // Private TypeScript-only workspaces; promoting one to `dependencies` would externalise it.
  noExternal: ["@workspace/matrix", "@workspace/compile", "@workspace/api"],
  // Must match `engines.node` in package.json.
  target: "node22",
  clean: true,
  sourcemap: true,
  shims: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  outDir: "dist",
  onSuccess: async () => {
    // tsup has intermittently emitted compiled tests despite the negations above.
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

    // Remove first: fs.copy merges, so a retired agent's directory would survive into dist/.
    const srcAgents = path.join("src", "agents");
    const destAgents = path.join("dist", "src", "agents");

    if (await fs.pathExists(srcAgents)) {
      await fs.remove(destAgents);
      await fs.copy(srcAgents, destAgents);
      console.log("Copied src/agents/ to dist/src/agents/");
    }
  },
});

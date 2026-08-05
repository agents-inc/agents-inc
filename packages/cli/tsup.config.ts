import { defineConfig } from "tsup";
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
    // Copy config/ (stacks.ts etc.) to dist/config/
    // so it's available regardless of how PROJECT_ROOT resolves at runtime
    const srcConfig = "config";
    const destConfig = path.join("dist", "config");

    if (await fs.pathExists(srcConfig)) {
      await fs.copy(srcConfig, destConfig);
      console.log("Copied config/ to dist/config/");
    }

    // Copy src/agents/ (agent partials + templates) to dist/src/agents/
    // so eject command can find them regardless of how PROJECT_ROOT resolves
    const srcAgents = path.join("src", "agents");
    const destAgents = path.join("dist", "src", "agents");

    if (await fs.pathExists(srcAgents)) {
      await fs.copy(srcAgents, destAgents);
      console.log("Copied src/agents/ to dist/src/agents/");
    }
  },
});

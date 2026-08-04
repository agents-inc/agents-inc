import { defineConfig } from "tsup";
import fs from "fs-extra";
import path from "path";

export default defineConfig({
  entry: [
    "src/cli/index.ts", // oclif entry point
    "src/cli/config-exports.ts", // library export for @agents-inc/cli/config
    "src/cli/commands/**/*.{ts,tsx}", // oclif commands (some use JSX)
    "src/cli/hooks/**/*.ts", // oclif hooks
    "src/cli/components/**/*.tsx", // Ink components
    "src/cli/stores/**/*.ts", // Zustand stores
  ],
  format: ["esm"],
  platform: "node",
  target: "node18",
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

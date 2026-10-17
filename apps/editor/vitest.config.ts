import { nodeConfig } from "@workspace/vitest-config/node"
import { mergeConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// Mirrors tsconfig.app.json's paths, which vitest does not read.
const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(nodeConfig, {
  test: { setupFiles: ["./vitest.setup.ts"] },
  resolve: {
    alias: {
      // Before the bare alias: string aliases match by prefix.
      "@workspace/matrix/": resolve("../../packages/matrix/src/"),
      "@workspace/matrix": resolve("../../packages/matrix/src/index.ts"),
      "@workspace/ui": resolve("../../packages/ui/src"),
      "@": resolve("./src"),
    },
  },
})

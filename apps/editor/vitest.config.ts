import { nodeConfig } from "@workspace/vitest-config/node"
import { mergeConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// The same aliases `tsconfig.app.json` declares — vitest does not read them.
const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(nodeConfig, {
  resolve: {
    alias: {
      "@workspace/matrix": resolve("../../packages/matrix/src/index.ts"),
      "@workspace/ui": resolve("../../packages/ui/src"),
      "@": resolve("./src"),
    },
  },
})

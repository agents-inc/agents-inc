import { nodeConfig } from "@workspace/vitest-config/node"
import { mergeConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

// The same aliases `tsconfig.app.json` declares — vitest does not read them.
const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(nodeConfig, {
  // Every file in this suite gets the mocked worker, not only the ones that
  // call it: the guarantee worth having is that none of them reach the network,
  // and that is only a guarantee if it holds where nobody thought to ask.
  test: { setupFiles: ["./vitest.setup.ts"] },
  resolve: {
    alias: {
      // The subpath entry is `tsconfig.app.json`'s `@workspace/matrix/*`, and it
      // comes first because a string alias matches by prefix: with the bare one
      // above it, `@workspace/matrix/seed` resolves to `…/src/index.ts/seed`.
      // The trailing slash is what keeps the bare specifier out of this entry.
      "@workspace/matrix/": resolve("../../packages/matrix/src/"),
      "@workspace/matrix": resolve("../../packages/matrix/src/index.ts"),
      "@workspace/ui": resolve("../../packages/ui/src"),
      "@": resolve("./src"),
    },
  },
})

import { fileURLToPath } from "node:url"

import { nodeConfig } from "@workspace/vitest-config/node"
import { mergeConfig } from "vitest/config"

// vitest.config.ts's `unit` project alone: its `storybook` project runs in a browser, which
// Stryker's vitest runner cannot drive. Stryker runs from the repo root, so the root is set back.
// syntax-theme.test.ts reads its subject's text, which in Stryker's copy is the instrumented file.
// It stays in: the instrumenter adds no import line, and that text is the same for every mutant.
export default mergeConfig(nodeConfig, {
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { name: "unit" },
})

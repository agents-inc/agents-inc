import { defineConfig } from "vitest/config"

// For pure logic — derivations, schemas, read models. No DOM, because nothing
// these tests touch needs one: anything that renders is covered end-to-end in
// a real browser instead, where a jsdom approximation would only be a weaker
// version of the same assertion.
export const nodeConfig = defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Explicit imports rather than globals. These files sit beside the source
    // they cover, and a bare `expect` appearing in `src/` with no import is
    // exactly the kind of ambient magic that makes a codebase hard to read.
    globals: false,
    clearMocks: true,
  },
})

export default nodeConfig

import { defineConfig } from "vitest/config"

// Pure logic only; anything that renders is tested in a real browser.
export const nodeConfig = defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    clearMocks: true,
  },
})

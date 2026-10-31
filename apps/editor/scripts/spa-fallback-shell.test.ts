import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { build, type Plugin } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { spaFallbackShell } from "./spa-fallback-shell"

const BUDGET_FAILURE = "First paint is 513.0 KB gzipped"

const NO_SHELL = "spa-fallback-shell: no index.html"

const overBudget = (): Plugin => ({
  name: "over-budget",
  generateBundle() {
    throw new Error(BUDGET_FAILURE)
  },
})

const failureOf = (built: Promise<unknown>): Promise<string> =>
  built.then(
    () => "",
    (error: unknown) => String(error)
  )

describe("the fallback-page step of a build served from a prefix", () => {
  let root: string

  const buildEditor = (plugins: Plugin[], input?: string) =>
    build({
      root,
      configFile: false,
      logLevel: "silent",
      base: "/editor/",
      plugins,
      build: {
        outDir: "dist/editor",
        ...(input !== undefined && { rolldownOptions: { input } }),
      },
    })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "spa-fallback-shell-"))
    writeFileSync(
      join(root, "index.html"),
      '<script type="module" src="./main.js"></script>\n'
    )
    writeFileSync(join(root, "main.js"), 'console.log("first paint")\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("copies the built index.html to the uploaded root", async () => {
    await buildEditor([spaFallbackShell()])

    expect(existsSync(join(root, "dist", "index.html"))).toBe(true)
  })

  it("lets a failed build report its own error and copies nothing", async () => {
    const failure = await failureOf(
      buildEditor([overBudget(), spaFallbackShell()])
    )

    expect(failure).toContain(BUDGET_FAILURE)
    expect(failure).not.toContain(NO_SHELL)
    expect(existsSync(join(root, "dist", "index.html"))).toBe(false)
  })

  it("fails a successful build that wrote no index.html", async () => {
    const failure = await failureOf(
      buildEditor([spaFallbackShell()], join(root, "main.js"))
    )

    expect(failure).toContain(NO_SHELL)
  })
})

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { build, type Plugin } from "vite"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest"

import { spaFallbackShell } from "./spa-fallback-shell"

const BUDGET_FAILURE = "First paint is 513.0 KB gzipped"

const NO_SHELL = "spa-fallback-shell: no index.html"

const OVERWRITES_PROJECT_PAGE =
  "spa-fallback-shell: the fallback page would overwrite index.html"

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

const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "spa-fallback-shell-"))
  onTestFinished(() => rmSync(folder, { recursive: true, force: true }))
  return folder
}

const withFile = (folder: string, name: string) => {
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, name), "kept\n")
  return join(folder, name)
}

const filesIn = (folder: string) =>
  Object.fromEntries(
    readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map(({ name }) => [name, readFileSync(join(folder, name), "utf8")])
  )

describe("the fallback-page step of a build served from a prefix", () => {
  let root: string

  const buildEditor = (
    plugins: Plugin[],
    { input, outDir = "dist/editor" }: { input?: string; outDir?: string } = {}
  ) =>
    build({
      root,
      configFile: false,
      logLevel: "silent",
      base: "/editor/",
      plugins,
      build: {
        outDir,
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
      buildEditor([spaFallbackShell()], { input: join(root, "main.js") })
    )

    expect(failure).toContain(NO_SHELL)
  })

  it("clears what an earlier build left in the uploaded folder", async () => {
    const stale = withFile(join(root, "dist", "old-release"), "chunk.js")

    await buildEditor([spaFallbackShell()])

    expect(existsSync(stale)).toBe(false)
  })

  it("refuses an output at the project's root, naming the index.html it would overwrite, and changes no project file", async () => {
    withFile(root, "notes.md")
    const before = filesIn(root)

    const failure = await failureOf(
      buildEditor([spaFallbackShell()], { outDir: "build" })
    )

    expect(failure).toContain(OVERWRITES_PROJECT_PAGE)
    expect(filesIn(root)).toStrictEqual(before)
  })

  it("leaves the folders beside an output built into another project's dist", async () => {
    const elsewhere = join(temporaryFolder(), "dist")
    const neighbour = withFile(join(elsewhere, "docs"), "index.html")

    await buildEditor([spaFallbackShell()], {
      outDir: join(elsewhere, "editor"),
    })

    expect(existsSync(neighbour)).toBe(true)
  })
})

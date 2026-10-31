/**
 * Copies the built index.html to the assets root, where Cloudflare's SPA
 * fallback looks for it; under /editor a hard refresh would otherwise 404.
 */

import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs"
import { basename, dirname, relative, resolve } from "node:path"

import type { Plugin, ResolvedConfig } from "vite"

const SHELL = "index.html"

export function spaFallbackShell(): Plugin {
  let config: ResolvedConfig

  return {
    name: "spa-fallback-shell",
    apply: "build",

    configResolved(resolved) {
      config = resolved
    },

    /**
     * `emptyOutDir` cleans only `dist/editor`, but all of `dist` is uploaded.
     */
    buildStart() {
      if (!servesFromPrefix(config)) return

      staleSiblingsOf(outputDirectory(config)).forEach(remove)
    },

    /**
     * After Vite writes: emitting it would rewrite the URLs the copy must keep.
     * Not `closeBundle`, which also runs after a failed build and whose throw
     * would replace that build's error.
     */
    writeBundle() {
      if (!servesFromPrefix(config)) return

      const outDir = outputDirectory(config)
      const built = resolve(outDir, SHELL)
      const shell = resolve(dirname(outDir), SHELL)

      // Throw rather than skip: a missing shell is how the 404 would ship
      // green.
      if (!existsSync(built)) throw noShellToCopy(built, config.root)

      copyFileSync(built, shell)
      console.log(
        `spa-fallback-shell: ${within(config.root, built)} → ${within(config.root, shell)}`
      )
    },
  }
}

function servesFromPrefix(config: ResolvedConfig): boolean {
  return config.base !== "/"
}

function outputDirectory(config: ResolvedConfig): string {
  return resolve(config.root, config.build.outDir)
}

function staleSiblingsOf(outDir: string): string[] {
  const uploaded = dirname(outDir)
  if (!existsSync(uploaded)) return []

  return readdirSync(uploaded)
    .filter((entry) => entry !== basename(outDir))
    .map((entry) => resolve(uploaded, entry))
}

function remove(path: string): void {
  rmSync(path, { recursive: true, force: true })
}

function noShellToCopy(built: string, root: string): Error {
  return new Error(
    `spa-fallback-shell: no ${SHELL} at ${within(root, built)} —` +
      ` the Worker's single-page-application fallback has nothing to serve`
  )
}

function within(root: string, path: string): string {
  return relative(root, path)
}

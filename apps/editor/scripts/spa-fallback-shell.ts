/**
 * The one file that makes a hard refresh work once the editor lives under
 * `/editor`.
 *
 * WHY IT EXISTS. `apps/editor/wrangler.jsonc` sets
 * `not_found_handling: "single-page-application"`, and Cloudflare's asset
 * worker implements that by looking for `index.html` at the ROOT of the assets
 * directory — `case "single-page-application": exists("/index.html")` in
 * miniflare's `assets.worker.js`, which is the same resolution code the edge
 * runs. It does not look beside the request, and it does not know about
 * `base`.
 *
 * So with `build.outDir: "dist/editor"` and `assets.directory: "./dist"`, the
 * shell the browser needs sits at `dist/editor/index.html` and the lookup
 * misses: a visitor who refreshes on `agentsinc.sh/editor/settings` asks for an
 * asset that does not exist, falls through to `/index.html`, finds nothing, and
 * gets a bare 404 — precisely the failure that setting exists to prevent, and
 * one no test in this repository could see, because every local runner serves
 * the built files itself rather than through Cloudflare's resolver.
 *
 * WHAT IT DOES. Copies the built `index.html` up one level, so the root lookup
 * finds it. The copy is never reachable at `/`: the Worker answers only the
 * Route `agentsinc.sh/editor*`, so nothing can request the apex from it. It
 * serves purely as the fallback shell, and because it is a byte copy its
 * script tags still point at `/editor/assets/…`, which resolve.
 *
 * WHY IT IS GUARDED ON `base`. With no base path the shell is already at the
 * root of the output and the copy would write the file over itself. The guard
 * is the condition rather than the directory layout, because that is the thing
 * that actually decides whether a prefix is in play.
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
     * `emptyOutDir` NO LONGER CLEANS WHAT IS UPLOADED, and that is a hazard this
     * arrangement introduced. Vite empties `outDir` — now `dist/editor` — while
     * `assets.directory` is its parent, `dist`, so everything else under `dist`
     * is uploaded untouched. A build from before the prefix existed leaves a
     * whole `dist/assets/` tree behind, and it ships.
     *
     * Nothing reaches those files (the Route matches only `/editor*`, so
     * `/assets/*` belongs to the apex Worker), so this is dead weight rather
     * than a broken page — but dead weight that grows every time the output
     * layout changes, and a stale directory that cannot be reached is exactly
     * the kind of thing nobody thinks to look for. CI never sees it, because a
     * fresh checkout has no `dist`; a developer running `bun run deploy` does.
     */
    buildStart() {
      if (!servesFromPrefix(config)) return

      staleSiblingsOf(outputDirectory(config)).forEach(remove)
    },

    /**
     * `closeBundle` rather than `generateBundle`, because this copies a file
     * Vite has already written rather than adding one to the bundle — emitting
     * it would put it through the asset pipeline and rewrite the very URLs the
     * copy exists to preserve.
     */
    closeBundle() {
      if (!servesFromPrefix(config)) return

      const outDir = outputDirectory(config)
      const built = resolve(outDir, SHELL)
      const shell = resolve(dirname(outDir), SHELL)

      // A build with no HTML entry is a real arrangement (library mode), not a
      // failure — but silently skipping a MISSING shell in an app build is how
      // the 404 above ships green, so it is said out loud either way.
      if (!existsSync(built)) throw noShellToCopy(built, config.root)

      copyFileSync(built, shell)
      console.log(
        `spa-fallback-shell: ${within(config.root, built)} → ${within(config.root, shell)}`
      )
    },
  }
}

/**
 * Whether a path prefix is in play at all, which is the single condition both
 * hooks turn on. `base` rather than the directory layout, because `base` is what
 * actually decides it — `outDir` can be nested for reasons of its own.
 */
function servesFromPrefix(config: ResolvedConfig): boolean {
  return config.base !== "/"
}

/** Absolute, because `build.outDir` is declared relative to the project root. */
function outputDirectory(config: ResolvedConfig): string {
  return resolve(config.root, config.build.outDir)
}

/**
 * Everything in the UPLOADED directory that this build did not just write —
 * `assets.directory` is `outDir`'s parent, so its other children ship untouched.
 * Absolute paths, so the caller needs none of this reasoning to delete them.
 */
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

/** Paths are reported relative to the project, which is how the docs name them. */
function within(root: string, path: string): string {
  return relative(root, path)
}

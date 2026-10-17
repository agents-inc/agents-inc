/**
 * Refuses the upload unless the built bundle names the API `.env.production`
 * declares. VITE_API_URL is inlined at build time, so a wrong value would
 * otherwise ship silently. Positive check: the dev default is in every bundle,
 * so "no localhost" would misfire.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import type { Dirent } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const EDITOR = fileURLToPath(new URL("../", import.meta.url))
const REPO_ROOT = join(EDITOR, "../..")
const DIST = join(EDITOR, "dist")
const ENV_PRODUCTION = join(EDITOR, ".env.production")

const TEXT_FORMATS = [".js", ".html", ".css"]

/** An address, not any value: the minified schema mentions VITE_API_URL too. */
const NAMES_AN_API = /VITE_API_URL\s*[:=]\s*["'`]?(https?:\/\/[^"'`\s,}]+)/g

function main(): void {
  const declared = declaredApiUrl()
  const built = textFilesUnder(DIST)
  if (built.length === 0) refuse(`nothing built at ${label(DIST)}`)

  const naming = built.filter(namesTheApi(declared))
  if (naming.length === 0) refuseUpload(declared, built)

  console.log(
    `deployable bundle: ${naming.length} of ${built.length} built files name ${declared}`
  )
}

/** No default: it would be a second copy of the production address. */
function declaredApiUrl(): string {
  if (!existsSync(ENV_PRODUCTION)) {
    refuse(
      `${label(ENV_PRODUCTION)} is missing — it is the committed declaration of` +
        ` the API the deployed editor calls, and nothing else states it`
    )
  }

  const [declared] = apisNamedIn(
    assignmentsIn(readFileSync(ENV_PRODUCTION, "utf8"))
  )
  if (declared === undefined)
    refuse(`${label(ENV_PRODUCTION)} does not set VITE_API_URL`)

  return declared
}

/** Assignments only, so the file's own comments cannot count. */
function assignmentsIn(envFile: string): string {
  return envFile
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
}

function textFilesUnder(directory: string): string[] {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(isBuiltText)
    .map((entry) => join(entry.parentPath, entry.name))
}

function isBuiltText(entry: Dirent): boolean {
  return (
    entry.isFile() && TEXT_FORMATS.some((format) => entry.name.endsWith(format))
  )
}

function namesTheApi(declared: string): (file: string) => boolean {
  return (file) => readFileSync(file, "utf8").includes(declared)
}

function apisNamedIn(text: string): string[] {
  const captured = [...text.matchAll(NAMES_AN_API)].map(([, api]) => api)
  return [...new Set(captured.filter(isCaptured))]
}

/** The group always matches; `matchAll`'s type does not know that. */
function isCaptured(api: string | undefined): api is string {
  return api !== undefined
}

function refuseUpload(declared: string, built: string[]): never {
  const found = apisNamedIn(
    built.map((file) => readFileSync(file, "utf8")).join("\n")
  )

  console.error(
    `deployable bundle: this build does not talk to the production API.\n\n` +
      `  ${label(ENV_PRODUCTION)} declares  ${declared}\n` +
      `  the bundle in ${label(DIST)} names ${describe(found)}\n\n` +
      `Vite freezes VITE_API_URL into the bundle, so this would have shipped to\n` +
      `agentsinc.sh and every request from every visitor would have gone there.\n\n` +
      `Something outranked ${label(ENV_PRODUCTION)} during the build — a shell\n` +
      `VITE_API_URL, or a local .env.production.local. Clear it and rebuild:\n` +
      `  bun run build\n`
  )
  process.exit(1)
}

function describe(apis: string[]): string {
  return apis.length === 0 ? "no API at all" : apis.join(", ")
}

function label(path: string): string {
  return relative(REPO_ROOT, path)
}

function refuse(reason: string): never {
  console.error(`deployable bundle: ${reason}`)
  process.exit(1)
}

main()

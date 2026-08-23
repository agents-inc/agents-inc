/**
 * The last thing that looks at the editor's bundle before Cloudflare serves it
 * to the public.
 *
 * WHY THIS EXISTS. `VITE_API_URL` is not read at runtime — Vite inlines it as
 * a string literal at build time, so the address the live site talks to is
 * decided by whatever environment the build happened to run in and is then
 * frozen into the artefact. That makes it the one setting a deploy can get
 * catastrophically wrong while every gate stays green: a bundle pointing at
 * `http://localhost:8787` compiles, type-checks, lints and uploads perfectly,
 * and is only discovered by a visitor whose browser cannot reach the developer
 * laptop it was told to ask.
 *
 * This is not hypothetical. `todo/repo.md`'s REPO-09 records it happening: a
 * local `.env` made during the repository merge pointed the editor at
 * localhost, and the response was to delete the file and write the hazard down
 * as a setup step. `apps/editor/.env.production` is the fix — a production
 * build now takes the real address from a committed file that outranks any
 * local `.env`, so the dev value can no longer reach a production build at
 * all. This script is the proof that it did not, checked against the bytes
 * about to be uploaded rather than against the intent that produced them.
 *
 * WHAT IT CHECKS, as one claim about the artefact:
 *
 *   THE BUILT BUNDLE NAMES THE API THAT `.env.production` DECLARES. One
 *   assertion, deliberately positive. There is exactly one place that literal
 *   can come from — Vite's inlining of `VITE_API_URL` — so if it is in the
 *   bundle, that is what the site will call, and if it is absent the build ran
 *   against some other environment and must not be uploaded.
 *
 * WHY NOT THE OBVIOUS CHECK — "refuse if the bundle contains localhost". It
 * false-positives on a correct build. `src/env.schema.ts` carries
 * `DEV_DEFAULTS = { VITE_API_URL: "http://localhost:8787" }`, and `src/env.ts`
 * imports `parseEnv` into the browser, so that literal is in every bundle
 * whether or not the app uses it — measured on the 2026-08-08 `dist/`, where
 * `http://localhost:8787` appeared twice: once as the dev default and once as
 * the inlined value. A rule that cannot separate those two is a rule that gets
 * switched off the first time it cries wolf, so the assertion is inverted
 * instead and the localhost readings are kept as diagnostics on failure only.
 *
 * WHY IT REFUSES A DEPLOY THAT MEANT WELL. Setting `VITE_API_URL` in the shell
 * and deploying will fail here. That is correct rather than unhelpful: this
 * repository has one deploy target for the editor — the `agents-inc-editor`
 * Worker on the `agentsinc.sh` apex, see `wrangler.jsonc` — so every `deploy`
 * is a production deploy and a bundle aimed anywhere else has no business
 * being uploaded. Build against a local worker with `.env.production.local`,
 * which is gitignored, and do not deploy that build.
 *
 * Runs from `apps/editor`'s `deploy` script, so it needs `vite build` first —
 * the root `turbo.json` declares `deploy` as `dependsOn: ["build"]`, which is
 * what guarantees the `dist/` read here is the one about to go up.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import type { Dirent } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const EDITOR = fileURLToPath(new URL("../", import.meta.url))
const REPO_ROOT = join(EDITOR, "../..")
const DIST = join(EDITOR, "dist")
const ENV_PRODUCTION = join(EDITOR, ".env.production")

/** What Vite inlines into: the text formats, not the fonts and images beside them. */
const TEXT_FORMATS = [".js", ".html", ".css"]

/**
 * Every spelling of the variable that could appear in a built file — the
 * bundler's object literal (`VITE_API_URL:"…"`) and the env-file assignment
 * (`VITE_API_URL=…`). Used to read the production declaration and, on failure,
 * to report what the artefact names instead.
 *
 * An address, not any value: the schema declaration minifies to
 * `VITE_API_URL:Sf().url()` and sits in the bundle beside the real thing, so
 * without the scheme the failure report names a mangled Zod call as if it were
 * somewhere the site might talk to.
 */
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

/**
 * The single source of truth for where the deployed editor sends its requests.
 * A missing or empty declaration is a refusal rather than a default: a default
 * here would be a second place the production address lives, which is the whole
 * defect this file exists to end.
 */
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

/**
 * The prose in `.env.production` names addresses too. Reading the whole file
 * would let a comment out-rank the setting it explains.
 */
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

/** The group is not optional in the pattern; `matchAll`'s type does not know that. */
function isCaptured(api: string | undefined): api is string {
  return api !== undefined
}

/**
 * The whole point of the file, so it says what would have happened rather than
 * only that a string was absent.
 */
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

/** Paths are quoted relative to the repository root, which is how the docs name them. */
function label(path: string): string {
  return relative(REPO_ROOT, path)
}

/** Every way of judging nothing, said out loud. A quiet pass over an empty read is the defect. */
function refuse(reason: string): never {
  console.error(`deployable bundle: ${reason}`)
  process.exit(1)
}

main()

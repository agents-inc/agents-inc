import { execFile, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import {
  CATALOG_URL,
  answerFor,
  configHandlers,
  githubNotFound,
  storedConfigHandlerFor,
  workerRequestFrom,
} from "@workspace/api-mocks"
import { MATRIX, matrixSchema } from "@workspace/matrix"
import { HttpResponse, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"
import type { Matrix, SeedPayload } from "@workspace/matrix"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

// THE OTHER HALF OF THE PREVIEW'S CLAIM, RUN FOR REAL.
//
// The output preview says it draws what `agents-inc init --from <id>` writes.
// Every other spec in this directory checks the preview against itself or
// against `@workspace/compile` called directly, so none of them can see the
// preview and the install disagree — which is where every defect in
// todo/plans/2026-10-02-journey-fixes' u03 and u04 sat. This module runs the
// CLI this repository builds against the same id the browser opens, so a spec
// can hold the two outputs against each other.
//
// What the CLI reaches is stood in for by ONE local server, in the two roles
// the browser's are stubbed in: the worker (`GET /configs/<id>`, answered by
// `@workspace/api-mocks`' own handlers through `answerFor`, exactly as
// packages/cli's `seed-config-store.ts` answers them) and GitHub (the tarball
// giget downloads a `github:` marketplace from). GitHub is reached through
// `GIGET_GITHUB_URL`, which is giget's own setting for a GitHub host other
// than github.com — so the marketplace the CLI installs from is named exactly
// as the payload names it, `github:<owner>/<repo>`, and nothing about the
// install is redirected but the host.
//
// The marketplace is BUILT, not written out: its source goes through
// `build plugins` and `build marketplace`, so the `catalog.json` the browser
// seats is the one an author publishes, and the tarball the CLI unpacks is the
// repository that published it.
//
// The public catalogue is the one exception, and the seat every visitor starts
// on: a payload naming no marketplace installs from the CLI's default, which
// the same GitHub stand-in serves once such a payload is published — see
// `buildPublicCatalogue`.

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..")
const CLI_PACKAGE = path.join(REPO_ROOT, "packages/cli")
const CLI_BIN = path.join(CLI_PACKAGE, "bin/run.js")

// oclif resolves every command from `dist/commands`, so an unbuilt CLI fails
// every spawn with a message about a command not found. Refused here instead,
// in the sentence that says what to do.
const BUILT_COMMAND = path.join(CLI_PACKAGE, "dist/commands/init.js")

// The marketplace's repository, as the browser's catalogue route and giget's
// tarball route both name it, and as a payload carries it.
const MARKETPLACE_OWNER = "harbor"
const MARKETPLACE_REPO = "skills"
export const MARKETPLACE_REF = `github:${MARKETPLACE_OWNER}/${MARKETPLACE_REPO}`

// The marketplace's own name, which `build marketplace` reads off package.json
// and which prefixes every id it ships (CLI-498).
const MARKETPLACE_NAME = "harbor"

// giget's default ref for a `github:` source that names none.
const DEFAULT_REF = "main"

/** One skill the marketplace ships, as its author wrote it. */
type AuthoredSkill = {
  id: string
  category: string
  domain: string
  slug: string
  displayName: string
  /** The wizard's short label — `cliDescription` in metadata.yaml. */
  label: string
  /** What SKILL.md says, which is what a compiled sub-agent's activation table shows. */
  description: string
  usageGuidance?: string
}

// Two skills in two exclusive categories, so a payload can hold both. Each
// label differs from its SKILL.md sentence on purpose: a compiled sub-agent
// shows the sentence, and a preview drawing the label is drawing a file no
// install writes.
export const HARBOR_WIDGETS = {
  id: `${MARKETPLACE_NAME}-web-framework-widgets`,
  category: "web-framework",
  domain: "web",
  slug: "harbor-widgets",
  displayName: "Harbor Widgets",
  label: "Harbor's component library",
  description:
    "How Harbor builds a widget, from props to tests. Load when writing or reviewing a Harbor widget.",
  usageGuidance: "Use when building a Harbor widget",
} as const satisfies AuthoredSkill

export const HARBOR_STORE = {
  id: `${MARKETPLACE_NAME}-web-state-store`,
  category: "web-client-state",
  domain: "web",
  slug: "harbor-store",
  displayName: "Harbor Store",
  label: "Harbor's state library",
  description:
    "Harbor's client store, its slices and its selectors. Load when adding state to a Harbor app.",
} as const satisfies AuthoredSkill

// A stack with a description, because where that sentence lands is one of
// the things the two writers disagreed about.
export const HARBOR_STACK = {
  id: "harbor-house-stack",
  name: "Harbor House Stack",
  description: "What every Harbor web app starts from.",
} as const

const AUTHORED_SKILLS: readonly AuthoredSkill[] = [HARBOR_WIDGETS, HARBOR_STORE]

const skillMd = (skill: AuthoredSkill) =>
  `---\nname: ${skill.id}\ndescription: ${skill.description}\n---\n\n# ${skill.displayName}\n`

const metadataYaml = (skill: AuthoredSkill) =>
  [
    `domain: ${skill.domain}`,
    `author: "@${MARKETPLACE_NAME}"`,
    `displayName: ${skill.displayName}`,
    `category: ${skill.category}`,
    `slug: ${skill.slug}`,
    `cliDescription: "${skill.label}"`,
    ...(skill.usageGuidance === undefined
      ? []
      : [`usageGuidance: "${skill.usageGuidance}"`]),
    `contentHash: "a1b2c3d"`,
    "",
  ].join("\n")

const stacksTs = () =>
  `export default ${JSON.stringify(
    {
      stacks: [
        {
          ...HARBOR_STACK,
          agents: {
            "web-developer": {
              [HARBOR_WIDGETS.category]: [
                { id: HARBOR_WIDGETS.id, preloaded: true },
              ],
              [HARBOR_STORE.category]: [
                { id: HARBOR_STORE.id, preloaded: false },
              ],
            },
          },
        },
      ],
    },
    null,
    2
  )};\n`

const packageJson = () =>
  `${JSON.stringify({
    name: MARKETPLACE_NAME,
    version: "1.0.0",
    description: "Harbor's skills",
    author: `Harbor <skills@${MARKETPLACE_NAME}.test>`,
  })}\n`

// The CLI's default marketplace, which a payload naming none installs from.
const PUBLIC_OWNER = "agents-inc"
const PUBLIC_REPO = "skills"

const installsFromPublicCatalogue = (payload: SeedPayload) =>
  payload.marketplace === undefined

/** The public catalogue's checkout, on disk — what the tarball holds. */
type PublicCatalogue = { dir: string; cleanup: () => Promise<void> }

type PublicSkill = NonNullable<
  (typeof MATRIX.skills)[keyof typeof MATRIX.skills]
>

const yamlScalar = (value: string) => JSON.stringify(value)

const publicSkillMd = (id: string, description: string) =>
  `---\nname: ${id}\ndescription: ${yamlScalar(description)}\n---\n\n# ${id}\n`

// The wire catalogue carries no author, and the copied metadata.yaml is held
// to nothing but the handle pattern every published one meets.
const PUBLIC_AUTHOR = "@agents-inc"

const publicMetadataYaml = (skill: PublicSkill, domain: string) =>
  [
    `domain: ${domain}`,
    `author: ${yamlScalar(PUBLIC_AUTHOR)}`,
    `displayName: ${yamlScalar(skill.displayName)}`,
    `category: ${skill.category}`,
    `slug: ${skill.slug}`,
    `cliDescription: ${yamlScalar(skill.description)}`,
    ...(skill.usageGuidance === undefined
      ? []
      : [`usageGuidance: ${yamlScalar(skill.usageGuidance)}`]),
    `contentHash: "a1b2c3d"`,
    "",
  ].join("\n")

/** The domain a skill's category is filed under in the public catalogue. */
const publicDomainOf = (skill: PublicSkill) => {
  const domain = MATRIX.categories[skill.category]?.domain
  if (domain === undefined) {
    throw new Error(`The public catalogue files ${skill.id} under no domain`)
  }
  return domain
}

/**
 * One catalogue skill where the CLI's eject reads it, `src/skills/<id>/`, its
 * SKILL.md stating `sentence`.
 */
const writePublicSkill = async (
  dir: string,
  skill: PublicSkill,
  sentence: string
) => {
  const skillDir = path.join(dir, "src/skills", skill.id)

  await mkdir(skillDir, { recursive: true })
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    publicSkillMd(skill.id, sentence)
  )
  await writeFile(
    path.join(skillDir, "metadata.yaml"),
    publicMetadataYaml(skill, publicDomainOf(skill))
  )
}

/**
 * The public catalogue as the CLI's default source reads it.
 *
 * Not built, because the CLI does not build it: for its default marketplace it
 * takes the matrix from its own vendored `BUILT_IN_MATRIX` — which
 * `@workspace/matrix` vendors for the editor as `MATRIX` — and reads only each
 * skill's files off the checkout: the directory an eject copies, and the
 * SKILL.md whose description a compiled sub-agent's activation table shows. So
 * every catalogue skill is written at the path its id spells, `src/skills/<id>`,
 * and its SKILL.md states the sentence `generate:types` copied out of the real
 * one into the vendored table the preview reads.
 *
 * The table is imported here rather than at the top of the module, so the
 * crossings that never install from the public catalogue load without it.
 */
const buildPublicCatalogue = async (): Promise<PublicCatalogue> => {
  const { ACTIVATION_DESCRIPTIONS } =
    await import("@workspace/matrix/activation-descriptions")
  const root = await mkdtemp(path.join(tmpdir(), "editor-crossing-public-"))
  const dir = path.join(root, PUBLIC_REPO)

  await Promise.all(
    Object.values(MATRIX.skills).map((skill) =>
      writePublicSkill(
        dir,
        skill,
        ACTIVATION_DESCRIPTIONS[skill.id] ?? skill.description
      )
    )
  )

  return { dir, cleanup: () => rm(root, { recursive: true, force: true }) }
}

/** What one spawned run of the CLI said, and how it ended. */
export type CliRun = { exitCode: number | null; output: string }

// Long enough for a cold `init --from` on a loaded machine, short enough that a
// CLI waiting on something it will never get fails the spec rather than its
// whole timeout.
const CLI_RUN_LIMIT_MS = 60_000

/**
 * The CLI as a user runs it, in an environment holding nothing of the machine
 * running the suite.
 *
 * Built from nothing rather than from `process.env`, for the reason
 * packages/cli's `CLI.run` clears its list one name at a time: every variable
 * the CLI or giget reads is a knob a developer's shell may carry, and a run
 * whose result depends on one belongs to the machine rather than to the code.
 * `AGENTS_INC_API_URL` is always set, because left unset the CLI reaches the
 * production worker.
 */
const runCli = (
  args: readonly string[],
  { cwd, home, standIn }: { cwd: string; home: string; standIn?: string }
): Promise<CliRun> => {
  if (!existsSync(BUILT_COMMAND)) {
    throw new Error(
      `The crossing specs run the CLI this repository builds, and ${BUILT_COMMAND} does not exist. Run \`bun run build\` in packages/cli first.`
    )
  }

  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    // Both beat HOME in the tools that read them, so both are pinned under it.
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    CODEX_HOME: path.join(home, ".codex"),
    // oclif's update check spawns a detached child that writes into HOME after
    // the run returns. packages/cli's `NO_BACKGROUND_VERSION_CHECK` says why.
    AGENTS_INC_SKIP_NEW_VERSION_CHECK: "1",
    NO_COLOR: "1",
    // An unreachable address unless a stand-in is named: never the real worker.
    AGENTS_INC_API_URL: standIn ?? "http://127.0.0.1:9",
    ...(standIn !== undefined && { GIGET_GITHUB_URL: standIn }),
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_BIN, ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))

    const limit = setTimeout(() => child.kill("SIGKILL"), CLI_RUN_LIMIT_MS)
    child.on("close", (exitCode) => {
      clearTimeout(limit)
      resolve({ exitCode, output })
    })
  })
}

/** The marketplace, built and on disk, and the catalogue it published. */
export type BuiltMarketplace = {
  /** The repository's working tree after both builds — what the tarball holds. */
  dir: string
  /** `.claude-plugin/catalog.json`, which is what the browser fetches. */
  catalog: Matrix
  cleanup: () => Promise<void>
}

/**
 * Writes the marketplace's source and builds it the way its author would:
 * `build plugins`, then `build marketplace`.
 */
export const buildMarketplace = async (): Promise<BuiltMarketplace> => {
  const root = await mkdtemp(path.join(tmpdir(), "editor-crossing-market-"))
  const dir = path.join(root, MARKETPLACE_REPO)

  await Promise.all(
    AUTHORED_SKILLS.map(async (skill) => {
      const skillDir = path.join(dir, "src/skills", skill.id)
      await mkdir(skillDir, { recursive: true })
      await writeFile(path.join(skillDir, "SKILL.md"), skillMd(skill))
      await writeFile(path.join(skillDir, "metadata.yaml"), metadataYaml(skill))
    })
  )
  await mkdir(path.join(dir, "config"), { recursive: true })
  await writeFile(path.join(dir, "config/stacks.ts"), stacksTs())
  await writeFile(path.join(dir, "package.json"), packageJson())

  for (const command of [
    ["build", "plugins"],
    ["build", "marketplace"],
  ]) {
    const run = await runCli(command, { cwd: dir, home: root })
    if (run.exitCode !== 0) {
      throw new Error(`\`${command.join(" ")}\` failed:\n${run.output}`)
    }
  }

  // Parsed rather than cast, through the schema the editor's own fetch reads
  // it with: a catalogue the build wrote and the browser refuses is a finding
  // about the two of them, and it should surface here, by name.
  const catalog = matrixSchema.parse(
    JSON.parse(
      await readFile(path.join(dir, ".claude-plugin/catalog.json"), "utf8")
    )
  )

  return {
    dir,
    catalog,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

/**
 * The browser's half of the same marketplace: its catalogue answered on the
 * contents API for this repository and no other.
 */
export const stubBuiltMarketplace = (page: Page, catalog: Matrix) =>
  stubWith(page, [
    http.get<{ owner: string; repo: string }>(CATALOG_URL, ({ params }) =>
      params.owner === MARKETPLACE_OWNER && params.repo === MARKETPLACE_REPO
        ? HttpResponse.json(catalog)
        : githubNotFound()
    ),
  ])

/** The worker and GitHub, as the spawned CLI reaches them. */
export type StandIns = {
  url: string
  /**
   * Serve `payload` under `id`, exactly as the browser's stub serves it — and,
   * for a payload naming no marketplace, the public catalogue it installs from.
   */
  publish: (id: string, payload: SeedPayload) => Promise<void>
  close: () => Promise<void>
}

const NOT_MODELLED = 501

const tarballPath = (owner: string, repo: string) =>
  `/repos/${owner}/${repo}/tarball/${DEFAULT_REF}`

// A tarball and its identity. giget and the CLI's own cache both ask for the
// etag, and a fixed one is what lets a second load in the same HOME read the
// cached copy.
type Tarball = { body: Buffer; etag: string }

const packTarball = async (dir: string): Promise<Buffer> => {
  // One top-level entry, the shape a git host's tarball has and the one giget
  // strips on extract.
  const { stdout } = await promisify(execFile)(
    "tar",
    ["-czf", "-", "-C", path.dirname(dir), path.basename(dir)],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  )
  return stdout
}

const readBody = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })

/**
 * Starts the stand-ins, serving `marketplace` as GitHub would, and the public
 * catalogue from the first publish of a payload that installs from it.
 */
export const startStandIns = async (
  marketplace: BuiltMarketplace
): Promise<StandIns> => {
  const tarballs = new Map<string, Tarball>([
    [
      tarballPath(MARKETPLACE_OWNER, MARKETPLACE_REPO),
      { body: await packTarball(marketplace.dir), etag: '"harbor-skills-1"' },
    ],
  ])
  const published = new Map<string, SeedPayload>()
  const cleanups: (() => Promise<void>)[] = []

  const servePublicCatalogue = async () => {
    const catalogue = await buildPublicCatalogue()
    cleanups.push(catalogue.cleanup)
    tarballs.set(tarballPath(PUBLIC_OWNER, PUBLIC_REPO), {
      body: await packTarball(catalogue.dir),
      etag: '"agents-inc-skills-1"',
    })
  }
  let publicCatalogueServed: Promise<void> | undefined

  const serve = async (request: IncomingMessage, response: ServerResponse) => {
    const tarball = tarballs.get(request.url ?? "")
    if (tarball) {
      response.writeHead(200, {
        "content-type": "application/gzip",
        etag: tarball.etag,
      })
      response.end(request.method === "HEAD" ? undefined : tarball.body)
      return
    }

    const answer = await answerFor(
      [
        ...[...published].map(([id, payload]) =>
          storedConfigHandlerFor(id, payload)
        ),
        ...configHandlers,
      ],
      workerRequestFrom(request, await readBody(request))
    )

    if (!answer.served) {
      response.writeHead(NOT_MODELLED, { "content-type": "text/plain" })
      response.end(`No stand-in answers ${request.method} ${request.url}`)
      return
    }

    response.writeHead(answer.status, answer.headers)
    response.end(Buffer.from(answer.body))
  }

  const server = createServer((request, response) => {
    serve(request, response).catch((error: unknown) => {
      response.writeHead(500, { "content-type": "text/plain" })
      response.end(String(error))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    publish: async (id, payload) => {
      published.set(id, payload)
      if (installsFromPublicCatalogue(payload)) {
        await (publicCatalogueServed ??= servePublicCatalogue())
      }
    },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await Promise.all(cleanups.map((cleanup) => cleanup()))
    },
  }
}

/** What one install left on disk, keyed the way the preview names a file. */
export type Installed = CliRun & {
  /** `~/…` for a file under HOME, `./…` for one under the project. */
  files: Record<string, string>
}

// Where the CLI keeps what it fetched — giget's tarball and the CLI's unpacked
// copy of the marketplace. Neither is part of the install; both are a cache the
// next command reads.
const FETCH_CACHE_DIR = ".cache/"

// The project's own manifest, which the spec writes so the directory reads as
// a project. The install did not write it.
const PROJECT_MANIFEST = "package.json"

const filesUnder = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))

const readTree = async (dir: string, base: string, leaveOut: string[]) =>
  Object.fromEntries(
    await Promise.all(
      (await filesUnder(dir))
        .filter((file) => !leaveOut.some((left) => file.startsWith(left)))
        .map(
          async (file) =>
            [
              `${base}${file.split(path.sep).join("/")}`,
              await readFile(path.join(dir, file), "utf8"),
            ] as const
        )
    )
  )

/**
 * `agents-inc init --from <id>`, run from a project directory on a machine
 * with nothing installed — the premise the preview's footer states.
 */
export const installFrom = async (
  standIns: StandIns,
  id: string
): Promise<Installed> => {
  const root = await mkdtemp(path.join(tmpdir(), "editor-crossing-install-"))
  const home = path.join(root, "home")
  const project = path.join(root, "project")
  await mkdir(home, { recursive: true })
  await mkdir(project, { recursive: true })
  await writeFile(
    path.join(project, PROJECT_MANIFEST),
    `${JSON.stringify({ name: "crossing-project" })}\n`
  )

  try {
    const run = await runCli(["init", "--from", id], {
      cwd: project,
      home,
      standIn: standIns.url,
    })

    return {
      ...run,
      files: {
        ...(await readTree(home, "~/", [FETCH_CACHE_DIR])),
        ...(await readTree(project, "./", [PROJECT_MANIFEST])),
      },
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

// `bun run db:generate:check`: regenerates migrations on top of a copy of the
// committed ones (they are cumulative, so not from scratch). A new file in the
// copy is a schema change with no migration.

/**
 * drizzle-kit exits 0 on a schema it cannot load, so the clean verdict is read
 * off this line rather than the exit code.
 */
const NOTHING_TO_MIGRATE = "No schema changes, nothing to migrate"

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MIGRATIONS_DIR = join(SERVER_ROOT, "migrations")
const DRIZZLE_CONFIG = join(SERVER_ROOT, "drizzle.config.ts")

type Verdict = { current: true } | { current: false; why: string }

const posixRelative = (from: string, to: string) =>
  relative(from, to).split(sep).join("/")

/**
 * The project's drizzle config with only `out` moved (drizzle-kit refuses
 * `--config` with other flags). `out` must be cwd-relative: drizzle-kit
 * prefixes it with `./`.
 */
const scratchConfig = (outDir: string) =>
  `import config from ${JSON.stringify(DRIZZLE_CONFIG)}

export default { ...config, out: ${JSON.stringify(
    posixRelative(SERVER_ROOT, outDir)
  )} }
`

const fileTree = (root: string): Map<string, string> =>
  new Map(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolute = join(entry.parentPath, entry.name)
        return [posixRelative(root, absolute), readFileSync(absolute, "utf8")]
      })
  )

const driftBetween = (committed: string, regenerated: string): string[] => {
  const before = fileTree(committed)

  return [...fileTree(regenerated)]
    .filter(([path, content]) => before.get(path) !== content)
    .map(([path]) => path)
    .sort()
}

/**
 * stdin is closed so a rename prompt fails the run instead of hanging CI.
 */
const verdictFrom = (scratch: string): Verdict => {
  const regenerated = join(scratch, "migrations")
  cpSync(MIGRATIONS_DIR, regenerated, { recursive: true })

  const configPath = join(scratch, "drizzle.config.ts")
  writeFileSync(configPath, scratchConfig(regenerated))

  const generate = spawnSync(
    "bunx",
    ["drizzle-kit", "generate", "--config", configPath],
    { cwd: SERVER_ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
  )
  const output = generate.stdout + generate.stderr

  if (generate.status !== 0) {
    return {
      current: false,
      why: `drizzle-kit could not answer whether migrations are current:\n${output}`,
    }
  }

  const drifted = driftBetween(MIGRATIONS_DIR, regenerated)

  if (drifted.length > 0) {
    return {
      current: false,
      why: [
        "apps/server/migrations is out of date:",
        ...drifted.map((file) => `  ${file}`),
        "",
        "Run `bun run db:generate` in apps/server and commit everything it writes.",
      ].join("\n"),
    }
  }

  if (!generate.stdout.includes(NOTHING_TO_MIGRATE)) {
    return {
      current: false,
      why: `drizzle-kit changed nothing and did not say the schema is current:\n${output}`,
    }
  }

  return { current: true }
}

// `process.exit` skips `finally`, so exit only after cleanup.
const scratch = mkdtempSync(join(tmpdir(), "drizzle-generate-check-"))

let verdict: Verdict
try {
  verdict = verdictFrom(scratch)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (!verdict.current) {
  console.error(verdict.why)
  process.exit(1)
}

console.log("  ✓ migrations/ matches what the schema would generate")

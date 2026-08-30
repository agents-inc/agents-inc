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

// `bun run db:generate:check` — the gate that catches a schema edit which never
// had `drizzle-kit generate` run over it.
//
// migrations/ is generated output, but unlike every other generated tree in
// this repository it is APPEND-ONLY and cumulative: drizzle-kit diffs the
// schema against the snapshot in migrations/meta/ and writes what has changed
// since. So it cannot be checked by regenerating from scratch and comparing —
// from scratch there is no snapshot, and everything looks new.
//
// What it can be checked by is regenerating ON TOP OF A COPY. Given the
// committed migrations, `drizzle-kit generate` either says there is nothing to
// do — which is what a committed schema and committed migrations agreeing looks
// like — or writes a file, and a file appearing in the copy is a migration
// missing from the tree.
//
// The failure this closes is quiet by construction. A worker ships code, not
// schema: an index, a `notNull`, a unique constraint or a foreign key added to
// src/db/*.schema.ts type-checks, lints and passes the whole suite, because the
// suite applies the COMMITTED migrations and the tables it makes are the ones
// the tests then use. Nothing goes wrong until the deploy runs
// `wrangler d1 migrations apply` and the edge gets code expecting a column that
// no migration ever added.

/**
 * What drizzle-kit says when it has diffed the schema against the snapshot and
 * found nothing to do, and the only evidence that it got that far.
 *
 * DRIZZLE-KIT EXITS 0 ON A SCHEMA IT CANNOT LOAD. An unresolvable import inside
 * src/db/*.schema.ts prints a MODULE_NOT_FOUND stack to stderr and returns
 * success, having read no tables and written no files — measured against
 * drizzle-kit 0.31. To a checker comparing directories that is
 * indistinguishable from agreement: the copy is untouched, there is no drift,
 * and the answer is green. So the clean verdict is read off this line rather
 * than inferred from an exit code and an empty diff.
 *
 * A release that rewords it fails this check instead of passing it, which is
 * the direction for a dependency on someone else's wording to rot in.
 */
const NOTHING_TO_MIGRATE = "No schema changes, nothing to migrate"

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MIGRATIONS_DIR = join(SERVER_ROOT, "migrations")
const DRIZZLE_CONFIG = join(SERVER_ROOT, "drizzle.config.ts")

/** Why the migrations cannot be called current, or that they are. */
type Verdict = { current: true } | { current: false; why: string }

const posixRelative = (from: string, to: string) =>
  relative(from, to).split(sep).join("/")

/**
 * The project's own drizzle config with only `out` moved, written beside the
 * scratch copy.
 *
 * `--out` cannot do this: drizzle-kit refuses `--config` together with any
 * other flag, and the flags-only form then needs `schema` and `dialect` spelled
 * out here — a second copy of drizzle.config.ts that would drift from it in
 * silence. Importing the real one keeps this to the single field being changed.
 *
 * `out` is written RELATIVE to the working directory because drizzle-kit
 * resolves it that way — it prefixes the value with `./` — so an absolute path
 * is read as a path under the cwd and the run dies on a snapshot it cannot
 * find. `schema` is resolved the same way, which is what lets the config sit in
 * a temporary directory while still describing this workspace.
 */
const scratchConfig = (outDir: string) =>
  `import config from ${JSON.stringify(DRIZZLE_CONFIG)}

export default { ...config, out: ${JSON.stringify(
    posixRelative(SERVER_ROOT, outDir)
  )} }
`

/** Every file under `root`, keyed by its POSIX path relative to it. */
const fileTree = (root: string): Map<string, string> =>
  new Map(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolute = join(entry.parentPath, entry.name)
        return [posixRelative(root, absolute), readFileSync(absolute, "utf8")]
      })
  )

/** The files regenerating changed or added, relative to what is committed. */
const driftBetween = (committed: string, regenerated: string): string[] => {
  const before = fileTree(committed)

  return [...fileTree(regenerated)]
    .filter(([path, content]) => before.get(path) !== content)
    .map(([path]) => path)
    .sort()
}

/**
 * Regenerates onto a copy of the committed migrations and says what happened.
 *
 * stdin is closed rather than inherited, deliberately. drizzle-kit ASKS when it
 * cannot tell a rename from a drop and an add, and a checker that waits for an
 * answer nobody is there to give would hang a CI job rather than fail it. With
 * no stdin the prompt cannot be answered and drizzle-kit exits non-zero, which
 * is reported as what it is: a migration this tool will not write unattended.
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

// The verdict is reached, the scratch directory removed, and only then is the
// exit code chosen. `process.exit` does not run `finally`, so exiting from
// inside the block below would leave a temporary directory behind on exactly
// the runs that fail — every one of them, on every developer machine and every
// CI job.
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

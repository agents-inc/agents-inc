// Pulls the skill catalog out of packages/cli — the sibling package in this repo — into this one.
//
//   bun run generate                                # reads ../cli, no setup
//   AGENTS_INC_CLI=/path/to/cli bun run generate    # the exception: a checkout elsewhere
//
// Two outputs:
//   src/vendor/**      — copied verbatim, never hand-edited
//   src/generated/**   — derived here because the CLI does not generate it yet (CLI todo/D-239)
//
// Requires bun, not node: it imports the CLI's TypeScript sources directly.
// One repository is also what lets CI check freshness with a plain diff — regenerate, diff,
// fail — instead of the cross-repo dispatch and pull request this used to need.
// Temporary: this goes away once the CLI publishes @agents-inc/skills-matrix.

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CLI_ROOT = process.env.AGENTS_INC_CLI ?? resolve(PACKAGE_ROOT, "../cli")

/** Copied as-is from the CLI's src/cli/types/. */
const VENDORED_FILES = [
  "matrix.ts",
  "skills.ts",
  "agents.ts",
  "config.ts",
  "stacks.ts",
  "generated/matrix.ts",
  "generated/source-types.ts",
]

const copyVendoredTypes = () => {
  const from = join(CLI_ROOT, "src/cli/types")
  const to = join(PACKAGE_ROOT, "src/vendor")

  for (const file of VENDORED_FILES) {
    const target = join(to, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(from, file), target)
  }
  return VENDORED_FILES.length
}

const isDirectory = (path) => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Every src/agents/<flavor>/<agent>/metadata.yaml, skipping _templates. */
const findAgentMetadata = (agentsRoot) =>
  readdirSync(agentsRoot)
    .filter(
      (flavor) =>
        !flavor.startsWith("_") && isDirectory(join(agentsRoot, flavor))
    )
    .flatMap((flavor) =>
      readdirSync(join(agentsRoot, flavor))
        .map((agent) => ({
          flavor,
          agent,
          path: join(agentsRoot, flavor, agent, "metadata.yaml"),
        }))
        .filter(
          ({ path }) =>
            !isDirectory(path) && statSync(path, { throwIfNoEntry: false })
        )
    )

const toDefinition = ({ flavor, agent, path }) => {
  const meta = parseYaml(readFileSync(path, "utf8"))
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    model: meta.model,
    tools: meta.tools ?? [],
    disallowedTools: meta.disallowedTools,
    permissionMode: meta.permissionMode,
    outputFormat: meta.outputFormat,
    flavor,
    path: `${flavor}/${agent}`,
  }
}

const serializeDefinition = (definition) => {
  const fields = Object.entries(definition)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`
    )
    .join("\n")
  return `  ${JSON.stringify(definition.id)}: {\n${fields}\n  },`
}

const AGENTS_HEADER = `// AUTO-GENERATED from packages/cli/src/agents/*/*/metadata.yaml in this repo.
// Do not edit manually — run \`bun run generate\` in packages/matrix.
// Fills the AGENT_DEFINITIONS gap described in the CLI's todo/D-239.

import type { AgentName } from "../vendor/generated/source-types"
import type { ModelName, PermissionMode } from "../vendor/matrix"

/** Agent metadata as shipped by the CLI's per-agent metadata.yaml files. */
export type GeneratedAgentDefinition = {
  id: AgentName
  title: string
  description: string
  model?: ModelName
  tools: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  outputFormat?: string
  /** Agent role, from the CLI's src/agents/<flavor>/ directory. */
  flavor: string
  /** Path relative to the CLI's src/agents/. */
  path: string
}
`

const generateAgentDefinitions = () => {
  const definitions = findAgentMetadata(join(CLI_ROOT, "src/agents"))
    .map(toDefinition)
    .sort((a, b) => a.id.localeCompare(b.id))

  const target = join(PACKAGE_ROOT, "src/generated/agents.ts")
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(
    target,
    `${AGENTS_HEADER}
export const AGENT_DEFINITIONS = {
${definitions.map(serializeDefinition).join("\n")}
} as const satisfies Record<AgentName, GeneratedAgentDefinition>
`
  )
  return definitions.length
}

const PRELOADS_HEADER = `// AUTO-GENERATED from packages/cli/src/cli/lib/configuration/default-stacks.ts in this repo.
// Do not edit manually — run \`bun run generate\` in packages/matrix.
//
// Why this file exists: the CLI's stack sources mark individual skills as preloaded
// (embedded in sub-agent front-matter rather than loaded on demand), but resolving a
// stack into BUILT_IN_MATRIX.suggestedStacks flattens SkillAssignment[] down to
// SkillId[] and drops the flag. Without this, applying a stack in the web UI would
// show every skill as not-preloaded and disagree with what the CLI installs.
//
// Granularity note: the CLI tracks preloading per (agent, skill) pair. The UI shows one
// Pre toggle per skill, so a skill preloaded by ANY agent in the stack is preloaded here.

import type { SkillId } from "../vendor/generated/source-types"
`

/** Skills a stack marks preloaded, flattened across agents to match the UI's per-skill toggle. */
const generateStackPreloads = async () => {
  const { defaultStacks } = await import(
    join(CLI_ROOT, "src/cli/lib/configuration/default-stacks.ts")
  )

  const preloadsByStack = defaultStacks.map((stack) => {
    const preloaded = Object.values(stack.agents)
      .flatMap((categories) => Object.values(categories).flat())
      .filter((assignment) => assignment.preloaded)
      .map((assignment) => assignment.id)
    return [stack.id, [...new Set(preloaded)].sort()]
  })

  const entries = preloadsByStack
    .map(
      ([id, skillIds]) =>
        `  ${JSON.stringify(id)}: ${JSON.stringify(skillIds)},`
    )
    .join("\n")

  writeFileSync(
    join(PACKAGE_ROOT, "src/generated/stack-preloads.ts"),
    `${PRELOADS_HEADER}
export const STACK_PRELOADS: Record<string, readonly SkillId[]> = {
${entries}
}
`
  )
  return preloadsByStack.reduce(
    (total, [, skillIds]) => total + skillIds.length,
    0
  )
}

if (!isDirectory(CLI_ROOT)) {
  console.error(
    `CLI package not found at ${CLI_ROOT} — it is packages/cli in this repo, so this should need no setup. Set AGENTS_INC_CLI only to read from a checkout elsewhere.`
  )
  process.exit(1)
}

console.log(`vendored ${copyVendoredTypes()} type files from ${CLI_ROOT}`)
console.log(`generated ${generateAgentDefinitions()} agent definitions`)
console.log(`generated ${await generateStackPreloads()} stack preload flags`)

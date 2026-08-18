/**
 * Writes every generated file in `packages/matrix`: the type copies under `src/vendor/` and the
 * agent definitions in `src/generated/agents.ts`. This package is their single writer.
 *
 * It used to emit a third file, `src/generated/stack-preloads.ts`, carrying the load flags the
 * built-in stacks hand-wrote — flattened per skill, since the UI had one toggle per skill. Both
 * the flags and the flattening are gone: a stack states which skills a sub-agent gets, and
 * `PRELOAD_DEFAULTS` answers how each pair loads, so the read model resolves per `(skill, agent)`
 * and there is nothing left to generate.
 *
 * Run: bun run generate:matrix — or generate:matrix:check, which reports drift and writes
 * nothing. Both go through scripts/run-generate-matrix-package.ts: nothing runs at module scope
 * here, so importing this file writes no files.
 *
 * Every input is in this repository — this package's types and its agent metadata — which is
 * what lets CI check the output by regenerating it, unlike generate:types.
 */
import { matrixSchema } from "@workspace/matrix/matrix-schema";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import { STANDARD_FILES } from "../src/cli/consts.ts";
import { typedEntries } from "../src/cli/utils/typed-object.ts";

import type { AgentYamlConfig } from "../src/cli/types/index.ts";

/** Where the generator reads from when no other root is given. */
const CLI_ROOT = path.resolve(import.meta.dirname, "..");

/** Read paths, relative to the CLI root. */
const CLI_TYPES_DIR = "src/cli/types";
const CLI_AGENTS_DIR = "src/agents";

/** Agent roles starting with this are scaffolding, not agents (`_templates`). */
const RESERVED_FLAVOR_PREFIX = "_";

/** Emitted paths, relative to the matrix package root and POSIX-separated. */
const VENDOR_DIR = "src/vendor";
const AGENTS_FILE = "src/generated/agents.ts";

/** Copied verbatim out of the CLI's src/cli/types/, and emitted in this order. */
const VENDORED_TYPE_FILES = [
  "matrix.ts",
  "skills.ts",
  "agents.ts",
  "config.ts",
  "stacks.ts",
  "generated/matrix.ts",
  "generated/source-types.ts",
];

/** One file the generator owns. `path` is relative to the matrix package root. */
type EmittedFile = { path: string; content: string };

/** `cliRoot` is a parameter so the suite can drive the generator against a fixture checkout. */
type GeneratorRoots = { matrixRoot: string; cliRoot?: string };

/** An agent's metadata.yaml, and where under src/agents/ it was found. */
type AgentSource = { flavor: string; agent: string; metadataPath: string };

/** What one AGENT_DEFINITIONS entry carries: the metadata fields, plus where the agent lives. */
type GeneratedAgentDefinition = Pick<
  AgentYamlConfig,
  | "id"
  | "title"
  | "description"
  | "model"
  | "tools"
  | "disallowedTools"
  | "permissionMode"
  | "outputFormat"
> & { flavor: string; path: string };

// -- Vendored types ----------------------------------------------------------

function vendoredTypeFiles(cliRoot: string): EmittedFile[] {
  return VENDORED_TYPE_FILES.map((relativePath) => ({
    path: `${VENDOR_DIR}/${relativePath}`,
    content: readFileSync(path.join(cliRoot, CLI_TYPES_DIR, relativePath), "utf-8"),
  }));
}

// -- Agent definitions -------------------------------------------------------

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
`;

const directoryNames = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

/** Every src/agents/<flavor>/<agent>/metadata.yaml, skipping the reserved template directory. */
function findAgentSources(cliRoot: string): AgentSource[] {
  const agentsRoot = path.join(cliRoot, CLI_AGENTS_DIR);

  return directoryNames(agentsRoot)
    .filter((flavor) => !flavor.startsWith(RESERVED_FLAVOR_PREFIX))
    .flatMap((flavor) =>
      directoryNames(path.join(agentsRoot, flavor)).map((agent) => ({
        flavor,
        agent,
        metadataPath: path.join(agentsRoot, flavor, agent, STANDARD_FILES.AGENT_METADATA_YAML),
      })),
    )
    .filter((source) => existsSync(source.metadataPath));
}

function toAgentDefinition({ flavor, agent, metadataPath }: AgentSource): GeneratedAgentDefinition {
  // Parse boundary: these are the CLI's own metadata.yaml files, shaped by src/schemas/agent.schema.json.
  const metadata = parseYaml(readFileSync(metadataPath, "utf-8")) as AgentYamlConfig;

  return {
    id: metadata.id,
    title: metadata.title,
    description: metadata.description,
    ...(metadata.model !== undefined && { model: metadata.model }),
    tools: metadata.tools,
    ...(metadata.disallowedTools !== undefined && { disallowedTools: metadata.disallowedTools }),
    ...(metadata.permissionMode !== undefined && { permissionMode: metadata.permissionMode }),
    ...(metadata.outputFormat !== undefined && { outputFormat: metadata.outputFormat }),
    flavor,
    path: `${flavor}/${agent}`,
  };
}

/** One entry of the emitted object literal — fields in declaration order, absent ones omitted. */
function serializeAgentDefinition(definition: GeneratedAgentDefinition): string {
  const fields = typedEntries(definition)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");

  return `  ${JSON.stringify(definition.id)}: {\n${fields}\n  },`;
}

function agentDefinitionsFile(cliRoot: string): EmittedFile {
  const definitions = findAgentSources(cliRoot)
    .map(toAgentDefinition)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    path: AGENTS_FILE,
    content: `${AGENTS_HEADER}
export const AGENT_DEFINITIONS = {
${definitions.map(serializeAgentDefinition).join("\n")}
} as const satisfies Record<AgentName, GeneratedAgentDefinition>
`,
  };
}

// -- Entry points ------------------------------------------------------------

/** Every file the generator owns, in emission order. */
function emittedFiles(cliRoot: string): EmittedFile[] {
  return [...vendoredTypeFiles(cliRoot), agentDefinitionsFile(cliRoot)];
}

function writeEmittedFile(matrixRoot: string, file: EmittedFile): void {
  const target = path.join(matrixRoot, file.path);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, file.content);
}

/** A file that does not exist counts as drifted — the committed catalog is incomplete. */
function matchesCommitted(matrixRoot: string, file: EmittedFile): boolean {
  const target = path.join(matrixRoot, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

/**
 * Where `matrix` stops being a matrix, as `path: message` lines — empty when it is one.
 *
 * The file comparison above proves the vendored copy matches `src/cli/types/generated/matrix.ts`
 * byte for byte. It cannot say that file still holds a catalogue: a type generator emitting a
 * differently-shaped one is vendored just as faithfully, and the failure surfaces in
 * `packages/matrix` at import time, a package away from what moved. `matrixSchema` is the wire
 * contract `catalog.json` and the vendored artefact both answer to, so asking it here makes the
 * generator's own gate the place that reports it.
 */
export function matrixShapeIssues(matrix: unknown): string[] {
  const result = matrixSchema.safeParse(matrix);
  if (result.success) return [];

  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

export function generate({ matrixRoot, cliRoot = CLI_ROOT }: GeneratorRoots): {
  written: string[];
} {
  const files = emittedFiles(cliRoot);

  for (const file of files) {
    writeEmittedFile(matrixRoot, file);
  }

  return { written: files.map((file) => file.path) };
}

export function check({ matrixRoot, cliRoot = CLI_ROOT }: GeneratorRoots): {
  clean: boolean;
  drifted: string[];
} {
  const drifted = emittedFiles(cliRoot)
    .filter((file) => !matchesCommitted(matrixRoot, file))
    .map((file) => file.path);

  return { clean: drifted.length === 0, drifted };
}

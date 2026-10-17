/**
 * The single writer of `packages/matrix`'s generated files: the type copies under `src/vendor/`
 * and the agent definitions in `src/generated/agents.ts`. Importing this file writes nothing.
 */
import { matrixSchema } from "@workspace/matrix/matrix-schema";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import { STANDARD_FILES } from "../src/cli/consts.ts";
import { bytewise } from "../src/cli/utils/string.ts";
import { typedEntries } from "../src/cli/utils/typed-object.ts";

import type { AgentYamlConfig } from "../src/cli/types/index.ts";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");

const CLI_TYPES_DIR = "src/cli/types";
const CLI_AGENTS_DIR = "src/agents";

/** Agent roles starting with this are scaffolding, not agents (`_templates`). */
const RESERVED_FLAVOR_PREFIX = "_";

const VENDOR_DIR = "src/vendor";
const AGENTS_FILE = "src/generated/agents.ts";

const VENDORED_TYPE_FILES = [
  "matrix.ts",
  "skills.ts",
  "agents.ts",
  "config.ts",
  "stacks.ts",
  "generated/matrix.ts",
  "generated/source-types.ts",
  "generated/activation-descriptions.ts",
];

/** `path` is relative to the matrix package root. */
type EmittedFile = { path: string; content: string };

type GeneratorRoots = { matrixRoot: string; cliRoot?: string };

type AgentSource = { flavor: string; agent: string; metadataPath: string };

type GeneratedAgentDefinition = Pick<
  AgentYamlConfig,
  | "id"
  | "title"
  | "description"
  | "model"
  | "effort"
  | "tools"
  | "disallowedTools"
  | "permissionMode"
  | "isolation"
  | "experimental"
  | "outputFormat"
> & { flavor: string; path: string };

function vendoredTypeFiles(cliRoot: string): EmittedFile[] {
  return VENDORED_TYPE_FILES.map((relativePath) => ({
    path: `${VENDOR_DIR}/${relativePath}`,
    content: readFileSync(path.join(cliRoot, CLI_TYPES_DIR, relativePath), "utf-8"),
  }));
}

const AGENTS_HEADER = `// AUTO-GENERATED from packages/cli/src/agents/*/*/metadata.yaml in this repo.
// Do not edit manually — run \`bun run generate\` in packages/matrix.
// Fills the AGENT_DEFINITIONS gap the shared matrix package left open.

import type { AgentName } from "../vendor/generated/source-types"
import type { AgentIsolation, CacheTtl, EffortLevel, ModelName, PermissionMode } from "../vendor/matrix"

/** Agent metadata as shipped by the CLI's per-agent metadata.yaml files. */
export type GeneratedAgentDefinition = {
  id: AgentName
  title: string
  description: string
  model?: ModelName
  effort?: EffortLevel
  tools: string[]
  disallowedTools?: string[]
  permissionMode?: PermissionMode
  /** Runs the agent in a git worktree of its own. Carried so a browser render matches the CLI's. */
  isolation?: AgentIsolation
  experimental?: { cacheTtl?: CacheTtl }
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
  // Parse boundary: the CLI's own metadata.yaml.
  const metadata = parseYaml(readFileSync(metadataPath, "utf-8")) as AgentYamlConfig;

  return {
    id: metadata.id,
    title: metadata.title,
    description: metadata.description,
    ...(metadata.model !== undefined && { model: metadata.model }),
    ...(metadata.effort !== undefined && { effort: metadata.effort }),
    tools: metadata.tools,
    ...(metadata.disallowedTools !== undefined && { disallowedTools: metadata.disallowedTools }),
    ...(metadata.permissionMode !== undefined && { permissionMode: metadata.permissionMode }),
    ...(metadata.isolation !== undefined && { isolation: metadata.isolation }),
    ...(metadata.experimental !== undefined && { experimental: metadata.experimental }),
    ...(metadata.outputFormat !== undefined && { outputFormat: metadata.outputFormat }),
    flavor,
    path: `${flavor}/${agent}`,
  };
}

function serializeAgentDefinition(definition: GeneratedAgentDefinition): string {
  const fields = typedEntries(definition)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries drops `| undefined` from the value type, but a slot can still be explicitly undefined
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");

  return `  ${JSON.stringify(definition.id)}: {\n${fields}\n  },`;
}

function agentDefinitionsFile(cliRoot: string): EmittedFile {
  const definitions = findAgentSources(cliRoot)
    .map(toAgentDefinition)
    // Byte order keeps the committed output machine-independent.
    .sort((a, b) => bytewise(a.id, b.id));

  return {
    path: AGENTS_FILE,
    content: `${AGENTS_HEADER}
export const AGENT_DEFINITIONS = {
${definitions.map(serializeAgentDefinition).join("\n")}
} as const satisfies Record<AgentName, GeneratedAgentDefinition>
`,
  };
}

function emittedFiles(cliRoot: string): EmittedFile[] {
  return [...vendoredTypeFiles(cliRoot), agentDefinitionsFile(cliRoot)];
}

function writeEmittedFile(matrixRoot: string, file: EmittedFile): void {
  const target = path.join(matrixRoot, file.path);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, file.content);
}

function matchesCommitted(matrixRoot: string, file: EmittedFile): boolean {
  const target = path.join(matrixRoot, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

/** Byte-faithful vendoring cannot tell whether the matrix still has the wire shape; this can. */
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

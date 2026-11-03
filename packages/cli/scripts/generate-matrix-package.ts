/**
 * The single writer of `packages/matrix`'s generated files: the type copies under `src/vendor/`
 * and the agent definitions in `src/generated/agents.ts`. Importing this file writes nothing.
 */
import { matrixSchema } from "@workspace/matrix/matrix-schema";
import { readFileSync } from "fs";
import path from "path";

import { DIRS } from "../src/cli/consts.ts";
import { bytewise } from "../src/cli/utils/string.ts";
import { typedEntries } from "../src/cli/utils/typed-object.ts";

import type { AgentYamlConfig } from "../src/cli/types/index.ts";

import {
  compareWithCommitted,
  writeEmittedFiles,
  type CheckResult,
  type EmittedFile,
} from "./emitted-files.ts";
import {
  findAgentSources,
  readAgentMetadata,
  type AgentSource,
} from "./generate-compile-package.ts";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");

const CLI_TYPES_DIR = "src/cli/types";

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

type GeneratorRoots = { matrixRoot: string; cliRoot?: string };

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

function toAgentDefinition(source: AgentSource): GeneratedAgentDefinition {
  const { flavor, agent } = source;
  const metadata = readAgentMetadata(source);

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
  const definitions = findAgentSources(path.join(cliRoot, DIRS.agents))
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

/** Byte-faithful vendoring cannot tell whether the matrix still has the wire shape; this can. */
export function matrixShapeIssues(matrix: unknown): string[] {
  const result = matrixSchema.safeParse(matrix);
  if (result.success) return [];

  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

export function generate({ matrixRoot, cliRoot = CLI_ROOT }: GeneratorRoots): {
  written: string[];
} {
  return { written: writeEmittedFiles(matrixRoot, emittedFiles(cliRoot)) };
}

export function check({ matrixRoot, cliRoot = CLI_ROOT }: GeneratorRoots): CheckResult {
  return compareWithCommitted(matrixRoot, emittedFiles(cliRoot));
}

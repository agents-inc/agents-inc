/**
 * Vendors the agent partials and Liquid templates into `packages/compile` as string data, so the
 * editor's browser preview renders what the CLI compiles. Importing this file writes nothing.
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

import { DIRS, STANDARD_FILES } from "../src/cli/consts.ts";
import { toPosixPath } from "../src/cli/utils/posix-path.ts";
import { bytewise } from "../src/cli/utils/string.ts";

import type { AgentYamlConfig } from "../src/cli/types/index.ts";

import {
  compareWithCommitted,
  writeEmittedFiles,
  type CheckResult,
  type EmittedFile,
} from "./emitted-files.ts";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");

/** Agent roles starting with this are scaffolding, not agents (`_templates`). */
const RESERVED_FLAVOR_PREFIX = "_";

/** The templates directory's own name inside `src/agents`, stripped from every emitted key. */
const TEMPLATES_PREFIX = `${path.basename(DIRS.templates)}/`;

const LIQUID_EXTENSION = ".liquid";

const CORPUS_FILE = "src/generated/corpus.ts";

/** `cliRoot` is a parameter so the suite can drive the generator against a fixture checkout. */
type GeneratorRoots = { compileRoot: string; cliRoot?: string };

export type AgentSource = {
  flavor: string;
  agent: string;
  agentDir: string;
  metadataPath: string;
};

type AgentPartials = {
  identity: string;
  playbook: string;
  output: string;
  criticalRequirementsTop: string;
  criticalReminders: string;
};

const CORPUS_HEADER = `// AUTO-GENERATED from packages/cli/src/agents/ in this repo.
// Do not edit manually — run \`bun run generate\` in packages/compile.
// \`bun run generate:compile:check\` in packages/cli is the gate that catches drift.

import type { AgentName } from "../types.js"

/** The five markdown partials one sub-agent is assembled from, as the compile reads them. */
export type CorpusAgentPartials = {
  identity: string
  playbook: string
  output: string
  criticalRequirementsTop: string
  criticalReminders: string
}
`;

const directoryNames = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

export function findAgentSources(agentsRoot: string): AgentSource[] {
  return directoryNames(agentsRoot)
    .filter((flavor) => !flavor.startsWith(RESERVED_FLAVOR_PREFIX))
    .flatMap((flavor) =>
      directoryNames(path.join(agentsRoot, flavor)).map((agent) => ({
        flavor,
        agent,
        agentDir: path.join(agentsRoot, flavor, agent),
        metadataPath: path.join(agentsRoot, flavor, agent, STANDARD_FILES.AGENT_METADATA_YAML),
      })),
    )
    .filter((source) => existsSync(source.metadataPath));
}

function readOptional(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
}

/** Mirrors `readAgentFiles` in src/cli/lib/compiler.ts, including its role-level output.md fallback. */
function readAgentPartials(source: AgentSource, agentsRoot: string): AgentPartials {
  const ownOutput = readOptional(path.join(source.agentDir, STANDARD_FILES.OUTPUT_MD));

  return {
    identity: readFileSync(path.join(source.agentDir, STANDARD_FILES.IDENTITY_MD), "utf-8"),
    playbook: readFileSync(path.join(source.agentDir, STANDARD_FILES.PLAYBOOK_MD), "utf-8"),
    output:
      ownOutput || readOptional(path.join(agentsRoot, source.flavor, STANDARD_FILES.OUTPUT_MD)),
    criticalRequirementsTop: readOptional(
      path.join(source.agentDir, STANDARD_FILES.CRITICAL_REQUIREMENTS_MD),
    ),
    criticalReminders: readOptional(
      path.join(source.agentDir, STANDARD_FILES.CRITICAL_REMINDERS_MD),
    ),
  };
}

function liquidTemplatePaths(agentsRoot: string): string[] {
  return readdirSync(agentsRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(LIQUID_EXTENSION))
    .map((entry) => toPosixPath(path.relative(agentsRoot, path.join(entry.parentPath, entry.name))))
    .sort(bytewise);
}

/** Rooted at the templates directory with the extension kept, as liquidjs resolves a render name. */
function templateKey(relativePath: string): string {
  return relativePath.startsWith(TEMPLATES_PREFIX)
    ? relativePath.slice(TEMPLATES_PREFIX.length)
    : relativePath;
}

function serializeAgentPartials(id: string, partials: AgentPartials): string {
  const fields = Object.entries(partials)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");

  return `  ${JSON.stringify(id)}: {\n${fields}\n  },`;
}

export function readAgentMetadata(source: AgentSource): AgentYamlConfig {
  // Parse boundary: the CLI's own metadata.yaml.
  return parseYaml(readFileSync(source.metadataPath, "utf-8")) as AgentYamlConfig;
}

function corpusFile(cliRoot: string): EmittedFile {
  const agentsRoot = path.join(cliRoot, DIRS.agents);

  const agents = findAgentSources(agentsRoot)
    .map((source) => ({
      id: readAgentMetadata(source).id,
      partials: readAgentPartials(source, agentsRoot),
    }))
    // Byte order keeps the committed output machine-independent.
    .sort((a, b) => bytewise(a.id, b.id));

  const templates = liquidTemplatePaths(agentsRoot).map((relativePath) => ({
    key: templateKey(relativePath),
    content: readFileSync(path.join(agentsRoot, relativePath), "utf-8"),
  }));

  return {
    path: CORPUS_FILE,
    content: `${CORPUS_HEADER}
export const AGENT_CORPUS = {
${agents.map(({ id, partials }) => serializeAgentPartials(id, partials)).join("\n")}
} as const satisfies Record<AgentName, CorpusAgentPartials>

/** Keyed the way the Liquid engine resolves a template: rooted at the templates directory. */
export const CORPUS_TEMPLATES: Record<string, string> = {
${templates.map(({ key, content }) => `  ${JSON.stringify(key)}: ${JSON.stringify(content)},`).join("\n")}
}

/**
 * The release these bytes were vendored from.
 *
 * A compiled sub-agent's first body line names the version that wrote it, and a browser has no
 * manifest to read one out of. The preview stamps this, so its claim is true rather than a guess
 * — and bumping the CLI without regenerating turns \`generate:compile:check\` red.
 */
export const CORPUS_CLI_VERSION = ${JSON.stringify(readOwnVersion())}
`,
  };
}

/** Read from the generator's own root, not `cliRoot`: fixture roots hold only src/agents/. */
function readOwnVersion(): string {
  const manifest = readFileSync(path.join(CLI_ROOT, STANDARD_FILES.PACKAGE_JSON), "utf-8");
  // Parse boundary: this package's own manifest.
  return (JSON.parse(manifest) as { version: string }).version;
}

function emittedFiles(cliRoot: string): EmittedFile[] {
  return [corpusFile(cliRoot)];
}

export function generate({ compileRoot, cliRoot = CLI_ROOT }: GeneratorRoots): {
  written: string[];
} {
  return { written: writeEmittedFiles(compileRoot, emittedFiles(cliRoot)) };
}

export function check({ compileRoot, cliRoot = CLI_ROOT }: GeneratorRoots): CheckResult {
  return compareWithCommitted(compileRoot, emittedFiles(cliRoot));
}

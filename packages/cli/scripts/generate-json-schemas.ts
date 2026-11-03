/**
 * Generates the JSON Schemas in `src/schemas/` from Zod. `project-config.schema.json` and
 * `project-source-config.schema.json` are hand-maintained and not touched here.
 */
import { z } from "zod";
import {
  agentYamlGenerationSchema,
  agentFrontmatterValidationSchema,
  customMetadataValidationSchema,
  strictHooksRecordSchema,
  marketplaceSchema,
  metadataValidationSchema,
  pluginManifestValidationSchema,
  skillFrontmatterValidationSchema,
  stackConfigValidationSchema,
  stacksConfigSchema,
} from "../src/cli/lib/schemas.ts";
import { CATEGORIES } from "../src/cli/types/generated/source-types.ts";
import { isRecord } from "../src/cli/utils/type-guards.ts";

import {
  compareWithCommitted,
  formatEmittedFiles,
  writeEmittedFiles,
  type CheckResult,
  type EmittedFile,
} from "./emitted-files.ts";

const JSON_PARSER = "json";

const STACK_AGENT_KEYS_PATH = [
  "properties",
  "stacks",
  "items",
  "properties",
  "agents",
  "additionalProperties",
  "propertyNames",
];

type GeneratorRoots = { schemasDir: string };

type SchemaEntry = {
  filename: string;
  schema: z.ZodType;
  metadata: {
    $id: string;
    title: string;
    description: string;
  };
  postProcess?: (schema: Record<string, unknown>) => void;
};

/**
 * Zod leaves a stack sub-agent's category keys open; the schema lists the built-in ones, so an
 * editor flags any other.
 */
function listBuiltInCategoriesAsStackAgentKeys(schema: Record<string, unknown>): void {
  objectAt(schema, STACK_AGENT_KEYS_PATH).enum = [...CATEGORIES];
}

function objectAt(root: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return keys.reduce((node, key) => {
    const child = node[key];
    if (!isRecord(child)) throw new Error(`The schema has no object at ${keys.join(".")}`);
    return child;
  }, root);
}

const SCHEMA_ENTRIES: SchemaEntry[] = [
  {
    filename: "agent.schema.json",
    schema: agentYamlGenerationSchema,
    metadata: {
      $id: "schemas/agent.schema.json",
      title: "Agent Definition",
      description: "Schema for agent metadata.yaml files defining Claude Code agents.",
    },
  },
  {
    filename: "agent-frontmatter.schema.json",
    schema: agentFrontmatterValidationSchema,
    metadata: {
      $id: "schemas/agent-frontmatter.schema.json",
      title: "Agent Frontmatter",
      description: "Schema for agent .md file frontmatter fields.",
    },
  },
  {
    filename: "hooks.schema.json",
    schema: strictHooksRecordSchema,
    metadata: {
      $id: "schemas/hooks.schema.json",
      title: "Hooks Configuration",
      description: "Schema for agent hook definitions.",
    },
  },
  {
    filename: "marketplace.schema.json",
    schema: marketplaceSchema,
    metadata: {
      $id: "schemas/marketplace.schema.json",
      title: "Marketplace",
      description: "Schema for marketplace.json plugin listings.",
    },
  },
  {
    filename: "metadata.schema.json",
    schema: metadataValidationSchema,
    metadata: {
      $id: "schemas/metadata.schema.json",
      title: "Skill Metadata",
      description: "Schema for skill metadata.yaml files.",
    },
  },
  {
    filename: "custom-metadata.schema.json",
    schema: customMetadataValidationSchema,
    metadata: {
      $id: "schemas/custom-metadata.schema.json",
      title: "Custom Skill Metadata",
      description:
        "Schema for custom skill metadata.yaml files with relaxed category and slug validation.",
    },
    // Custom skills may carry extra fields.
    postProcess: (schema) => {
      delete schema.additionalProperties;
    },
  },
  {
    filename: "plugin.schema.json",
    schema: pluginManifestValidationSchema,
    metadata: {
      $id: "schemas/plugin.schema.json",
      title: "Plugin Manifest",
      description: "Schema for plugin.json manifest files.",
    },
  },
  {
    filename: "skill-frontmatter.schema.json",
    schema: skillFrontmatterValidationSchema,
    metadata: {
      $id: "schemas/skill-frontmatter.schema.json",
      title: "Skill Frontmatter",
      description: "Schema for SKILL.md file frontmatter fields.",
    },
  },
  {
    filename: "stacks.schema.json",
    schema: stacksConfigSchema,
    metadata: {
      $id: "schemas/stacks.schema.json",
      title: "Stacks Configuration",
      description: "Schema for config/stacks.ts defining agent groupings.",
    },
    postProcess: listBuiltInCategoriesAsStackAgentKeys,
  },
  {
    filename: "stack.schema.json",
    schema: stackConfigValidationSchema,
    metadata: {
      $id: "schemas/stack.schema.json",
      title: "Stack Config",
      description: "Schema for individual stack config.yaml files.",
    },
  },
];

function schemaDocument(entry: SchemaEntry): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(entry.schema, { target: "draft-07" });

  const output: Record<string, unknown> = {
    $schema: jsonSchema.$schema,
    $id: entry.metadata.$id,
    title: entry.metadata.title,
    description: entry.metadata.description,
    ...Object.fromEntries(Object.entries(jsonSchema).filter(([key]) => key !== "$schema")),
  };

  entry.postProcess?.(output);

  return output;
}

const schemaFile = (entry: SchemaEntry): EmittedFile => ({
  path: entry.filename,
  content: `${JSON.stringify(schemaDocument(entry), null, 2)}\n`,
});

function emittedFiles(): Promise<EmittedFile[]> {
  return formatEmittedFiles(SCHEMA_ENTRIES.map(schemaFile), JSON_PARSER);
}

export async function generate({ schemasDir }: GeneratorRoots): Promise<{ written: string[] }> {
  return { written: writeEmittedFiles(schemasDir, await emittedFiles()) };
}

export async function check({ schemasDir }: GeneratorRoots): Promise<CheckResult> {
  return compareWithCommitted(schemasDir, await emittedFiles());
}

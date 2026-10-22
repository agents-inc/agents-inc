/**
 * Generates the JSON Schemas in `src/schemas/` from Zod. `project-config.schema.json` and
 * `project-source-config.schema.json` are hand-maintained and not touched here.
 */
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
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

import type { Options as PrettierOptions } from "prettier";

const JSON_PARSER = "json";

const STACK_SUBCATEGORY_ENUM = [...CATEGORIES];

/** `path` is relative to the schemas directory. */
type EmittedFile = { path: string; content: string };

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
 * Adds the category enum to stackAgentConfig's propertyNames. The Zod side validates keys with
 * superRefine (z.record(z.enum()) would make every key mandatory), which JSON Schema cannot express.
 */
function injectSubcategoryPropertyNames(obj: unknown): void {
  if (Array.isArray(obj)) {
    for (const item of obj) injectSubcategoryPropertyNames(item);
    return;
  }
  if (!isRecord(obj)) return;

  const propNames = obj.propertyNames;
  const additionalProps = obj.additionalProperties;
  if (
    obj.type === "object" &&
    isRecord(propNames) &&
    propNames.type === "string" &&
    !propNames.enum &&
    isRecord(additionalProps) &&
    additionalProps.anyOf
  ) {
    // The skill id pattern is what identifies a stackAgentConfig.
    const json = JSON.stringify(additionalProps);
    if (json.includes("(web|api|cli|mobile|infra|meta|security)-.+-.+")) {
      propNames.enum = STACK_SUBCATEGORY_ENUM;
    }
  }

  for (const value of Object.values(obj)) {
    injectSubcategoryPropertyNames(value);
  }
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
    postProcess: injectSubcategoryPropertyNames,
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

/** Resolved from this file, not the destination, so a fixture dir in os.tmpdir() formats the same. */
async function packagePrettierOptions(): Promise<PrettierOptions> {
  const options = await resolveConfig(import.meta.filename);
  if (options === null) {
    throw new Error(
      `No Prettier config resolved from ${import.meta.filename} — the emitted bytes would not ` +
        "match the committed schemas.",
    );
  }
  return options;
}

async function emittedFiles(): Promise<EmittedFile[]> {
  const options = await packagePrettierOptions();

  return Promise.all(
    SCHEMA_ENTRIES.map(async (entry) => ({
      path: entry.filename,
      content: await format(`${JSON.stringify(schemaDocument(entry), null, 2)}\n`, {
        ...options,
        parser: JSON_PARSER,
      }),
    })),
  );
}

function writeEmittedFile(schemasDir: string, file: EmittedFile): void {
  writeFileSync(path.join(schemasDir, file.path), file.content);
}

function matchesCommitted(schemasDir: string, file: EmittedFile): boolean {
  const target = path.join(schemasDir, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

export async function generate({ schemasDir }: GeneratorRoots): Promise<{ written: string[] }> {
  const files = await emittedFiles();

  mkdirSync(schemasDir, { recursive: true });
  for (const file of files) {
    writeEmittedFile(schemasDir, file);
  }

  return { written: files.map((file) => file.path) };
}

export async function check({ schemasDir }: GeneratorRoots): Promise<{
  clean: boolean;
  drifted: string[];
}> {
  const drifted = (await emittedFiles())
    .filter((file) => !matchesCommitted(schemasDir, file))
    .map((file) => file.path);

  return { clean: drifted.length === 0, drifted };
}

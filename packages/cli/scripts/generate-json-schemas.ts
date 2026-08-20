/**
 * Generates JSON Schema files from Zod schemas — the writer of every generated file in
 * `src/schemas/`. The two hand-maintained schemas beside them, `project-config.schema.json` and
 * `project-source-config.schema.json`, have no `SCHEMA_ENTRIES` entry and are neither emitted nor
 * judged here; `format:check` is what keeps them Prettier-clean.
 *
 * Run: bun run generate:schemas — or generate:schemas:check, which reports drift and writes
 * nothing. Both go through scripts/run-generate-json-schemas.ts: nothing runs at module scope
 * here, so importing this file writes no files.
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

import type { Options as PrettierOptions } from "prettier";

/** Prettier's parser for the `.json` files this generator emits. */
const JSON_PARSER = "json";

/** All valid category values for stack configs */
const STACK_SUBCATEGORY_ENUM = [...CATEGORIES];

/** One file the generator owns. `path` is relative to the schemas directory. */
type EmittedFile = { path: string; content: string };

/** `schemasDir` is a parameter so the suite can drive the generator against a fixture directory. */
type GeneratorRoots = { schemasDir: string };

type SchemaEntry = {
  filename: string;
  schema: z.ZodType;
  metadata: {
    $id: string;
    title: string;
    description: string;
  };
  /** Optional post-processor to fix generated JSON schema quirks */
  postProcess?: (schema: Record<string, unknown>) => void;
};

/**
 * Injects propertyNames enum constraints for stackAgentConfig objects.
 *
 * The Zod schema uses z.record(z.string()).superRefine() for runtime key validation
 * (because z.record(z.enum()) requires ALL enum values as mandatory properties).
 * But z.toJSONSchema() cannot represent superRefine constraints, so we inject the
 * propertyNames enum into the generated JSON schema for IDE validation.
 *
 * Targets objects that have:
 * - type: "object"
 * - propertyNames: { type: "string" } (plain string, no enum yet)
 * - additionalProperties with skill assignment patterns (anyOf with SkillId pattern)
 */
function injectSubcategoryPropertyNames(obj: unknown): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) injectSubcategoryPropertyNames(item);
    return;
  }
  const record = obj as Record<string, unknown>;

  // Detect stackAgentConfig objects: have propertyNames: { type: "string" } and
  // additionalProperties with the skill assignment anyOf pattern
  const propNames = record.propertyNames as Record<string, unknown> | undefined;
  const additionalProps = record.additionalProperties as Record<string, unknown> | undefined;
  if (
    record.type === "object" &&
    propNames &&
    propNames.type === "string" &&
    !propNames.enum &&
    additionalProps &&
    additionalProps.anyOf
  ) {
    // Check if additionalProperties contains the skill ID pattern (confirms this is a stackAgentConfig)
    const json = JSON.stringify(additionalProps);
    if (json.includes("(web|api|cli|mobile|infra|meta|security)-.+-.+")) {
      propNames.enum = STACK_SUBCATEGORY_ENUM;
    }
  }

  // Recurse into all values
  for (const value of Object.values(record)) {
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
    // Custom skills may have extra fields — remove top-level additionalProperties: false
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
    // stackAgentConfigSchema uses superRefine for runtime key validation (not representable
    // in JSON schema), so inject propertyNames enum for IDE validation
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

// -- Emission ----------------------------------------------------------------

/** One entry's JSON Schema, with the metadata overlay and any post-processing applied. */
function schemaDocument(entry: SchemaEntry): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(entry.schema, { target: "draft-07" });

  // Overlay metadata
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

/**
 * This package's own Prettier settings, resolved from this file rather than from the destination.
 *
 * The emitted bytes are a property of the generator, not of where they land: resolving from the
 * output directory would give a fixture in `os.tmpdir()` a different config — or none — and the
 * check would then compare formatted committed files against unformatted emitted ones.
 */
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

/** Every file the generator owns, formatted exactly as it is committed. */
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

/** A file that does not exist counts as drifted — the committed set is incomplete. */
function matchesCommitted(schemasDir: string, file: EmittedFile): boolean {
  const target = path.join(schemasDir, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

// -- Entry points ------------------------------------------------------------

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

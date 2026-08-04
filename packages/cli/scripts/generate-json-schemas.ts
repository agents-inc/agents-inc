/**
 * Generates JSON Schema files from Zod schemas.
 * Run: npx tsx scripts/generate-json-schemas.ts
 */
import { z } from "zod";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
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

const SCHEMAS_DIR = path.resolve(import.meta.dirname, "../src/schemas");

/** All valid category values for stack configs */
const STACK_SUBCATEGORY_ENUM = [...CATEGORIES];

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

function generate(): void {
  mkdirSync(SCHEMAS_DIR, { recursive: true });

  let generated = 0;

  for (const entry of SCHEMA_ENTRIES) {
    const jsonSchema = z.toJSONSchema(entry.schema, { target: "draft-07" });

    // Overlay metadata
    const output: Record<string, unknown> = {
      $schema: jsonSchema.$schema,
      $id: entry.metadata.$id,
      title: entry.metadata.title,
      description: entry.metadata.description,
      ...Object.fromEntries(Object.entries(jsonSchema).filter(([key]) => key !== "$schema")),
    };

    if (entry.postProcess) {
      entry.postProcess(output);
    }

    const filePath = path.join(SCHEMAS_DIR, entry.filename);
    writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n");
    generated++;
    console.log(`  ✓ ${entry.filename}`);
  }

  console.log(`\n  Generated ${generated} schema files in src/schemas/\n`);

  // Format generated files with prettier
  console.log("Formatting schema files...\n");
  execSync(`npx prettier --write "${SCHEMAS_DIR}/"`, { stdio: "inherit" });
}

generate();

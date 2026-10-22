import path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  buildAgentConfigs,
  buildPreRenameProjectConfig,
  buildPreRenameSkillEntryConfig,
  buildProjectConfig,
  buildSourceConfig,
} from "./__tests__/factories/config-factories.js";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "./__tests__/factories/plugin-factories.js";
import { readTestJson } from "./__tests__/helpers/config-io.js";
import { buildSkillConfigs } from "./__tests__/helpers/skill-config-builders.js";
import { EJECT_SOURCE } from "../consts";
import { AGENT_DEFS } from "./__tests__/mock-data/mock-agents.js";
import { AGENT_ISOLATIONS, CACHE_TTLS } from "../types/matrix";
import type { AgentYamlConfig } from "../types";
import {
  VALID_EMBEDDED_SKILL_METADATA_FILE,
  VALID_SKILL_CATEGORIES_FILE,
} from "./__tests__/mock-data/mock-source-files.js";
import {
  agentFrontmatterValidationSchema,
  agentYamlConfigSchema,
  describeMetadataSchemaFailure,
  formatZodIssues,
  localRawMetadataSchema,
  marketplaceSchema,
  metadataValidationSchema,
  projectConfigLoaderSchema,
  projectSourceConfigSchema,
  skillMetadataLoaderSchema,
  skillCategoriesFileSchema,
  skillRulesFileSchema,
  splitMetadataValidationIssues,
  validateNestingDepth,
  validateSkillMetadata,
  warnUnknownFields,
} from "./schemas";

vi.mock("../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/logger")>()),
  warn: vi.fn(),
}));

import { warn } from "../utils/logger";

/** Written out: a test reading the keys off the type would agree with whatever it said. */
const PRE_RENAME_CONFIG_KEY = "source";
const RENAMED_CONFIG_KEY = "marketplace";
const MARKETPLACE_NAME_KEY = "marketplaceName";
/** A sub-agent source no config may name: definitions ship with the CLI, so nothing reads it. */
const REMOVED_AGENTS_SOURCE_KEY = "agentsSource";
/** A sub-agent partials folder no config may name: the partials ship with the CLI too. */
const REMOVED_AGENTS_DIR_KEY = "agentsDir";
/** The source-layout key a marketplace repository's skills are loaded through. */
const SKILLS_DIR_KEY = "skillsDir";
const RENAMED_SKILL_KEY = "origin";

/** Rejected by a declared `z.string()` field and accepted by `.passthrough()` — the difference. */
const NON_STRING_FIELD_VALUE = 123;

const SCHEMAS_DIR = path.resolve(import.meta.dirname, "../../schemas");
const PROJECT_CONFIG_SCHEMA_PATH = path.join(SCHEMAS_DIR, "project-config.schema.json");
const PROJECT_SOURCE_CONFIG_SCHEMA_PATH = path.join(
  SCHEMAS_DIR,
  "project-source-config.schema.json",
);

type JsonSchemaFile = {
  properties: Record<string, unknown>;
  required?: string[];
};

describe("schema utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateNestingDepth", () => {
    it("should accept flat objects", () => {
      expect(validateNestingDepth({ a: 1, b: "hello" }, 10)).toBe(true);
    });

    it("should accept flat arrays", () => {
      expect(validateNestingDepth([1, 2, 3], 10)).toBe(true);
    });

    it("should accept primitives", () => {
      expect(validateNestingDepth("hello", 10)).toBe(true);
      expect(validateNestingDepth(42, 10)).toBe(true);
      expect(validateNestingDepth(null, 10)).toBe(true);
      expect(validateNestingDepth(true, 10)).toBe(true);
    });

    it("should accept nested objects within depth limit", () => {
      const nested = { a: { b: { c: "value" } } };
      expect(validateNestingDepth(nested, 5)).toBe(true);
    });

    it("should reject objects exceeding depth limit", () => {
      const deeplyNested = { a: { b: { c: { d: { e: "too deep" } } } } };
      expect(validateNestingDepth(deeplyNested, 3)).toBe(false);
    });

    it("should handle depth limit of 0", () => {
      expect(validateNestingDepth("hello", 0)).toBe(true);
      expect(validateNestingDepth({ a: 1 }, 0)).toBe(false);
    });

    it("should handle depth limit of 1 for flat objects", () => {
      expect(validateNestingDepth({ a: 1, b: 2 }, 1)).toBe(true);
      expect(validateNestingDepth({ a: { b: 1 } }, 1)).toBe(false);
    });

    it("should check arrays within objects", () => {
      const value = { plugins: [{ name: "a" }, { name: "b" }] };
      expect(validateNestingDepth(value, 3)).toBe(true);
      expect(validateNestingDepth(value, 1)).toBe(false);
    });

    it("should handle deeply nested arrays", () => {
      const deep = [[[["too deep"]]]];
      expect(validateNestingDepth(deep, 2)).toBe(false);
      expect(validateNestingDepth(deep, 5)).toBe(true);
    });

    it("should handle realistic marketplace.json structure", () => {
      const marketplace = {
        name: "test-marketplace",
        version: "1.0.0",
        owner: { name: "test", email: "test@example.com" },
        plugins: [
          {
            name: "plugin-a",
            source: "./plugins/a",
            author: { name: "@author" },
            keywords: ["web", "react"],
          },
        ],
      };
      expect(validateNestingDepth(marketplace, 10)).toBe(true);
    });

    it("should reject maliciously deeply nested JSON", () => {
      let deep: unknown = "payload";
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep };
      }
      expect(validateNestingDepth(deep, 10)).toBe(false);
    });
  });

  describe("warnUnknownFields", () => {
    it("should not warn when all fields are expected", () => {
      warnUnknownFields({ name: "test", version: "1.0" }, ["name", "version"], "test.json");

      expect(warn).not.toHaveBeenCalled();
    });

    it("should warn about unknown fields", () => {
      warnUnknownFields(
        { name: "test", malicious: "data", extra: 42 },
        ["name", "version"],
        "test.json",
      );

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Unknown fields in test.json: malicious, extra"),
      );
    });

    it("should not warn for empty objects", () => {
      warnUnknownFields({}, ["name"], "test.json");

      expect(warn).not.toHaveBeenCalled();
    });

    it("should handle no expected keys", () => {
      warnUnknownFields({ a: 1 }, [], "test.json");

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("a"));
    });

    it("should include context in warning message", () => {
      warnUnknownFields({ unknown: true }, ["name"], "marketplace.json");

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("marketplace.json"));
    });
  });
});

describe("projectConfigLoaderSchema", () => {
  describe("stack field with mixed skill assignment formats", () => {
    it("should accept bare string skill IDs (format 1)", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": "web-framework-react",
            "web-styling": "web-styling-scss-modules",
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept array of objects with preloaded (format 2)", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "shared-methodology": [
              { id: "meta-methodology-investigation-requirements", preloaded: true },
              { id: "meta-methodology-anti-over-engineering", preloaded: true },
            ],
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept single object with preloaded (format 3)", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": { id: "web-framework-react", preloaded: true },
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept mixed formats within the same agent config", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": "web-framework-react",
            "shared-methodology": [
              { id: "meta-methodology-investigation-requirements", preloaded: true },
              { id: "meta-methodology-anti-over-engineering", preloaded: true },
            ],
            "web-styling": { id: "web-styling-scss-modules", preloaded: true },
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept mixed formats across multiple agents", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer", "api-developer"]),
        stack: {
          "web-developer": {
            "web-framework": "web-framework-react",
          },
          "api-developer": {
            "api-api": { id: "api-framework-hono", preloaded: true },
            "api-orm": [{ id: "api-database-drizzle" }],
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept any string as skill ID in lenient loader schema", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": "custom-skill-id",
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept stack with no agents", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {},
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept config without stack field", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept array with mixed string and object elements", () => {
      const config = {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "shared-methodology": [
              "meta-methodology-investigation-requirements",
              { id: "meta-methodology-anti-over-engineering", preloaded: true },
            ],
          },
        },
      };

      const result = projectConfigLoaderSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});

describe("a sub-agent's Codex model in config.ts", () => {
  const PINNED_CODEX_MODEL = "gpt-5.6-terra";

  function configWithAgent(entry: Record<string, unknown>) {
    return {
      name: "codex-model",
      agents: [{ name: "web-developer", scope: "project", ...entry }],
    };
  }

  it("keeps an offered id beside the Claude model", () => {
    const result = projectConfigLoaderSchema.safeParse(
      configWithAgent({ model: "haiku", codexModel: PINNED_CODEX_MODEL }),
    );

    expect(result.data?.agents?.[0]).toStrictEqual({
      name: "web-developer",
      scope: "project",
      model: "haiku",
      codexModel: PINNED_CODEX_MODEL,
    });
  });

  it.each(["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"])(
    "accepts %s",
    (codexModel) => {
      expect(projectConfigLoaderSchema.safeParse(configWithAgent({ codexModel })).success).toBe(
        true,
      );
    },
  );

  it("refuses an id it does not offer at the same place an unknown model is refused", () => {
    const badModel = projectConfigLoaderSchema.safeParse(configWithAgent({ model: "nope" }));
    const badCodexModel = projectConfigLoaderSchema.safeParse(
      configWithAgent({ codexModel: "nope" }),
    );

    expect(badModel.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual([
      "agents.0.model",
    ]);
    expect(badCodexModel.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual([
      "agents.0.codexModel",
    ]);
  });

  it("refuses a Claude selector as a Codex model", () => {
    expect(
      projectConfigLoaderSchema.safeParse(configWithAgent({ codexModel: "opus" })).success,
    ).toBe(false);
  });
});

/**
 * Only whether a key is declared: a declared `z.string()` refuses a number `.passthrough()` admits.
 */
describe("the marketplace fields the loader schemas name", () => {
  it("types marketplaceName rather than admitting it as an unrecognised passthrough key", () => {
    const result = projectConfigLoaderSchema.safeParse({
      ...buildProjectConfig(),
      marketplaceName: NON_STRING_FIELD_VALUE,
    });

    expect(
      result.success,
      "a declared string field must reject a number; passthrough would accept it",
    ).toBe(false);
  });

  it("types marketplaceName on the source config schema too", () => {
    const result = projectSourceConfigSchema.safeParse(
      buildSourceConfig({ marketplaceName: NON_STRING_FIELD_VALUE }),
    );

    expect(
      result.success,
      "a declared string field must reject a number; passthrough would accept it",
    ).toBe(false);
  });

  it("holds a skill entry's provenance under origin", () => {
    const result = projectConfigLoaderSchema.safeParse(
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
      }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.skills?.map((skill) => skill.origin)).toStrictEqual([EJECT_SOURCE]);
  });
});

/** A marketplace name is Claude Code's plugin namespace, so loading enforces kebab-case too. */
describe("the name a marketplace may be loaded under", () => {
  /** `marketplaceSchema.plugins.min(1)` requires one before `name` is reached. */
  const ONE_PLUGIN = [createMockMarketplacePlugin("web-framework-react")];

  const SCOPED_PACKAGE_NAME = "@acme/skills";
  const TITLE_CASED_NAME = "Acme Skills";
  const LEADING_DIGIT_NAME = "2acme";
  const KEBAB_NAME = "acme-skills";

  /** A literal, not imported: the refusal must NOT hand the pattern back. */
  const RAW_PATTERN_FRAGMENT = "^[a-z]";

  function refusalFor(name: string): string {
    const result = marketplaceSchema.safeParse({ ...createMockMarketplace(ONE_PLUGIN), name });

    expect(result.success, `'${name}' must not load as a marketplace name`).toBe(false);
    return formatZodIssues(result.error?.issues ?? []);
  }

  it("loads a kebab-case name, which is what the publisher writes", () => {
    const result = marketplaceSchema.safeParse({
      ...createMockMarketplace(ONE_PLUGIN),
      name: KEBAB_NAME,
    });

    expect(
      result.success,
      "without this the refusals below could all be one guard that admits nothing",
    ).toBe(true);
  });

  it("refuses an npm scoped name, which is the shape build marketplace already refuses to emit", () => {
    expect(refusalFor(SCOPED_PACKAGE_NAME)).toContain("kebab-case");
  });

  it("refuses a name carrying capitals and spaces", () => {
    expect(refusalFor(TITLE_CASED_NAME)).toContain("kebab-case");
  });

  it("refuses a name that does not start with a letter", () => {
    expect(refusalFor(LEADING_DIGIT_NAME)).toContain("kebab-case");
  });

  it("keeps refusing an empty name, which is a different fault with the same field", () => {
    expect(refusalFor("")).toContain("name");
  });

  it("states the rule and where to fix it rather than handing back the pattern", () => {
    const refusal = refusalFor(SCOPED_PACKAGE_NAME);

    expect(refusal, "the field the reader has to go and edit").toContain("name");
    expect(refusal, "what a valid name looks like, not just that this one is invalid").toContain(
      "lowercase letters, numbers and hyphens, starting with a letter",
    );
    expect(
      refusal,
      "a regex is what the CLI checks with, not something a marketplace author can act on",
    ).not.toContain(RAW_PATTERN_FRAGMENT);
  });
});

describe("a config carrying a field name from before the rename", () => {
  it("is refused by the project config schema, which names the old key and the new one", () => {
    const result = projectConfigLoaderSchema.safeParse(buildPreRenameProjectConfig());

    expect(result.success, "an old key must not survive as a passthrough key").toBe(false);
    const issues = formatZodIssues(result.error?.issues ?? []);
    expect(issues).toContain(PRE_RENAME_CONFIG_KEY);
    expect(issues).toContain(RENAMED_CONFIG_KEY);
  });

  it("is refused when a skill entry carries the old key, naming it and its replacement", () => {
    const result = projectConfigLoaderSchema.safeParse(buildPreRenameSkillEntryConfig());

    expect(result.success, "an old key must not survive as a passthrough key").toBe(false);
    const issues = formatZodIssues(result.error?.issues ?? []);
    expect(issues).toContain(PRE_RENAME_CONFIG_KEY);
    expect(issues).toContain(RENAMED_SKILL_KEY);
  });

  it("is refused by the source config schema, which reads the very same file", () => {
    const result = projectSourceConfigSchema.safeParse(buildPreRenameProjectConfig());

    expect(result.success, "an old key must not survive as a passthrough key").toBe(false);
    const issues = formatZodIssues(result.error?.issues ?? []);
    expect(issues).toContain(PRE_RENAME_CONFIG_KEY);
    expect(issues).toContain(RENAMED_CONFIG_KEY);
  });
});

/** The same discriminator: a declared `z.string()` refuses the number `.passthrough()` admits. */
describe("the source-layout fields the source config schema names", () => {
  it("types skillsDir, which the source loader reads a marketplace's skills through", () => {
    const result = projectSourceConfigSchema.safeParse(
      buildSourceConfig({ [SKILLS_DIR_KEY]: NON_STRING_FIELD_VALUE }),
    );

    expect(
      result.success,
      "a declared string field must reject a number; passthrough would accept it",
    ).toBe(false);
  });

  it("declares no agentsDir, so a config still naming one loads it as an unread passthrough key", () => {
    const result = projectSourceConfigSchema.safeParse(
      buildSourceConfig({ [REMOVED_AGENTS_DIR_KEY]: NON_STRING_FIELD_VALUE }),
    );

    expect(
      result.success,
      "sub-agent partials ship with the CLI, so the schema types no folder for them",
    ).toBe(true);
  });
});

describe("the hand-maintained JSON schemas", () => {
  it("names marketplace and marketplaceName on the project config schema, and no source", async () => {
    const schema = await readTestJson<JsonSchemaFile>(PROJECT_CONFIG_SCHEMA_PATH);

    expect(Object.keys(schema.properties)).toContain(RENAMED_CONFIG_KEY);
    expect(Object.keys(schema.properties)).toContain(MARKETPLACE_NAME_KEY);
    expect(Object.keys(schema.properties)).not.toContain(PRE_RENAME_CONFIG_KEY);
  });

  it("requires the marketplace ref under its new name", async () => {
    const schema = await readTestJson<JsonSchemaFile>(PROJECT_CONFIG_SCHEMA_PATH);

    expect(schema.required).toContain(RENAMED_CONFIG_KEY);
    expect(schema.required).not.toContain(PRE_RENAME_CONFIG_KEY);
  });

  it("names marketplace and marketplaceName on the project source config schema, and no source", async () => {
    const schema = await readTestJson<JsonSchemaFile>(PROJECT_SOURCE_CONFIG_SCHEMA_PATH);

    expect(Object.keys(schema.properties)).toContain(RENAMED_CONFIG_KEY);
    expect(Object.keys(schema.properties)).toContain(MARKETPLACE_NAME_KEY);
    expect(Object.keys(schema.properties)).not.toContain(PRE_RENAME_CONFIG_KEY);
  });

  it("declares no agentsSource on either config schema, beside the marketplace they declare", async () => {
    for (const schemaPath of [PROJECT_CONFIG_SCHEMA_PATH, PROJECT_SOURCE_CONFIG_SCHEMA_PATH]) {
      const declared = Object.keys((await readTestJson<JsonSchemaFile>(schemaPath)).properties);

      expect(declared, `${path.basename(schemaPath)} declares the marketplace`).toContain(
        RENAMED_CONFIG_KEY,
      );
      expect(declared, `${path.basename(schemaPath)} names no sub-agent source`).not.toContain(
        REMOVED_AGENTS_SOURCE_KEY,
      );
    }
  });

  it("declares no agentsDir on the source config schema, beside the skillsDir it declares", async () => {
    const declared = Object.keys(
      (await readTestJson<JsonSchemaFile>(PROJECT_SOURCE_CONFIG_SCHEMA_PATH)).properties,
    );

    expect(declared).toContain(SKILLS_DIR_KEY);
    expect(declared, "sub-agent partials ship with the CLI").not.toContain(REMOVED_AGENTS_DIR_KEY);
  });
});

describe("branding via projectSourceConfigSchema", () => {
  it("should accept branding naming the CLI", () => {
    const result = projectSourceConfigSchema.safeParse({
      branding: { name: "Acme Dev Tools" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.branding).toStrictEqual({ name: "Acme Dev Tools" });
  });

  /** `toStrictEqual`, because the subject is that the unpublished key is silently stripped. */
  it("drops a tagline, which the schema no longer publishes", () => {
    const result = projectSourceConfigSchema.safeParse({
      branding: { name: "Acme Dev Tools", tagline: "Build faster with Acme" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.branding).toStrictEqual({ name: "Acme Dev Tools" });
  });

  it("should accept empty branding object", () => {
    const result = projectSourceConfigSchema.safeParse({ branding: {} });
    expect(result.success).toBe(true);
  });

  it("should reject non-string branding name", () => {
    const result = projectSourceConfigSchema.safeParse({
      branding: { name: 123 },
    });
    expect(result.success).toBe(false);
  });

  /** `additionalProperties: false`, so an editor flags a `tagline`. */
  it("publishes only a name under branding", async () => {
    const schema = await readTestJson<JsonSchemaFile>(PROJECT_SOURCE_CONFIG_SCHEMA_PATH);
    const branding = schema.properties["branding"] as JsonSchemaFile | undefined;

    expect(Object.keys(branding?.properties ?? {})).toStrictEqual(["name"]);
  });
});

describe("projectSourceConfigSchema with branding", () => {
  it("should accept config with branding", () => {
    const result = projectSourceConfigSchema.safeParse({
      marketplace: "github:myorg/skills",
      branding: { name: "Acme Dev Tools" },
    });
    expect(result.success).toBe(true);
  });

  it("should accept config without branding", () => {
    const result = projectSourceConfigSchema.safeParse({
      marketplace: "github:myorg/skills",
    });
    expect(result.success).toBe(true);
  });
});

describe("custom: true in schemas", () => {
  it("should accept custom: true in skillMetadataLoaderSchema", () => {
    const result = skillMetadataLoaderSchema.safeParse({
      category: "web-framework",
      domain: "web",
      custom: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.custom).toBe(true);
  });

  it("should accept metadata without custom field", () => {
    const result = skillMetadataLoaderSchema.safeParse({
      category: "web-framework",
      domain: "web",
    });
    expect(result.success).toBe(true);
    expect(result.data?.custom).toBeUndefined();
  });

  it("should accept custom: true in agentYamlConfigSchema", () => {
    const result = agentYamlConfigSchema.safeParse({
      id: "web-developer",
      title: "Web Developer",
      description: "Builds web UIs",
      tools: ["Read", "Write"],
      custom: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept custom: true in metadataValidationSchema", () => {
    const result = metadataValidationSchema.safeParse({
      ...VALID_EMBEDDED_SKILL_METADATA_FILE,
      author: "@acme",
      displayName: "My Custom Skill",
      cliDescription: "A custom skill for deployment",
      usageGuidance: "Use when deploying services to staging or production.",
      custom: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid category definition via skillCategoriesFileSchema", () => {
    const result = skillCategoriesFileSchema.safeParse(VALID_SKILL_CATEGORIES_FILE);
    expect(result.success).toBe(true);
  });

  /** A shipped `required` flag must arrive stripped: downstream reads the parsed object. */
  it("should carry a parsed category without a required flag", () => {
    const parsed = skillCategoriesFileSchema.parse(VALID_SKILL_CATEGORIES_FILE);

    expect(parsed.categories["web-framework"]).toStrictEqual({
      id: "web-framework",
      displayName: "Framework",
      description: "Web frameworks",
      domain: "web",
      exclusive: true,
      order: 1,
    });
  });
});

describe("splitMetadataValidationIssues", () => {
  function failStrictParse(rawMetadata: unknown): z.ZodError {
    const result = metadataValidationSchema.safeParse(rawMetadata);
    expect(result.success, "fixture must fail strict validation").toBe(false);
    if (result.success) throw new Error("unreachable");
    return result.error;
  }

  it("should route over-length cliDescription to warnings with the actual length", () => {
    const rawMetadata = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, cliDescription: "x".repeat(75) };

    const { errors, warnings } = splitMetadataValidationIssues(
      failStrictParse(rawMetadata),
      rawMetadata,
    );

    expect(errors).toStrictEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("cliDescription");
    expect(warnings[0]).toContain("75 characters");
    expect(warnings[0]).toContain("60");
  });

  it("should keep empty cliDescription as an error", () => {
    const rawMetadata = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, cliDescription: "" };

    const { errors, warnings } = splitMetadataValidationIssues(
      failStrictParse(rawMetadata),
      rawMetadata,
    );

    expect(warnings).toStrictEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("cliDescription");
  });

  it("should split mixed issues: hard failures stay errors while over-length stays a warning", () => {
    const rawMetadata = {
      ...VALID_EMBEDDED_SKILL_METADATA_FILE,
      author: "no-at-sign",
      cliDescription: "x".repeat(90),
    };

    const { errors, warnings } = splitMetadataValidationIssues(
      failStrictParse(rawMetadata),
      rawMetadata,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("author");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("90 characters");
  });
});

describe("category validation", () => {
  describe("skillMetadataLoaderSchema", () => {
    it("should accept any kebab-case category in lenient loader", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "foo-bar",
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should accept custom: false with kebab-case category", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "acme-core",
        custom: false,
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should accept custom: true with kebab-case category", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "acme-core",
        custom: true,
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should reject custom: true with non-kebab-case category", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "NOT KEBAB",
        custom: true,
        domain: "web",
      });
      expect(result.success).toBe(false);
    });

    it("should reject custom: true with uppercase category", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "Acme-Core",
        custom: true,
        domain: "web",
      });
      expect(result.success).toBe(false);
    });

    it("should accept non-custom skill with valid built-in category", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "web-framework",
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should accept metadata without category field", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        author: "@test",
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should reject an empty category", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        category: "",
        domain: "web",
      });
      expect(
        result.success,
        "a category field present and blank names no placement — omitting it and emptying it are different claims",
      ).toBe(false);
    });

    it("should reject metadata without domain field", () => {
      const result = skillMetadataLoaderSchema.safeParse({
        author: "@test",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("localRawMetadataSchema", () => {
    it("should accept any kebab-case category in lenient loader", () => {
      const result = localRawMetadataSchema.safeParse({
        displayName: "Test Skill",
        slug: "react",
        category: "foo-bar",
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should accept custom: false with kebab-case category", () => {
      const result = localRawMetadataSchema.safeParse({
        displayName: "Test Skill",
        slug: "react",
        category: "acme-core",
        custom: false,
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should accept custom: true with kebab-case category", () => {
      const result = localRawMetadataSchema.safeParse({
        displayName: "Test Skill",
        slug: "react",
        category: "acme-core",
        custom: true,
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should reject custom: true with non-kebab-case category", () => {
      const result = localRawMetadataSchema.safeParse({
        slug: "react",
        category: "NOT KEBAB",
        custom: true,
        domain: "web",
      });
      expect(result.success).toBe(false);
    });

    it("should reject custom: true with uppercase category", () => {
      const result = localRawMetadataSchema.safeParse({
        slug: "react",
        category: "Acme-Core",
        custom: true,
        domain: "web",
      });
      expect(result.success).toBe(false);
    });

    it("should accept non-custom skill with valid built-in category", () => {
      const result = localRawMetadataSchema.safeParse({
        displayName: "Test Skill",
        slug: "react",
        category: "web-framework",
        domain: "web",
      });
      expect(result.success).toBe(true);
    });

    it("should reject metadata without category field", () => {
      const result = localRawMetadataSchema.safeParse({
        slug: "my-skill",
        displayName: "my-skill",
        domain: "web",
      });
      expect(result.success).toBe(false);
    });

    it("should reject an empty category", () => {
      const result = localRawMetadataSchema.safeParse({
        displayName: "Test Skill",
        slug: "react",
        category: "",
        domain: "web",
      });
      expect(
        result.success,
        "a blank category is a placement nothing can honour, so the file describes no skill",
      ).toBe(false);
    });

    it("should reject metadata without domain field", () => {
      const result = localRawMetadataSchema.safeParse({
        slug: "my-skill",
        displayName: "my-skill",
      });
      expect(result.success).toBe(false);
    });

    it("should reject metadata without slug field", () => {
      const result = localRawMetadataSchema.safeParse({
        displayName: "my-skill",
        domain: "web",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("skillCategoriesFileSchema", () => {
  it("should accept built-in category keys", () => {
    const result = skillCategoriesFileSchema.safeParse({
      version: "1.0.0",
      categories: {
        "web-framework": {
          id: "web-framework",
          displayName: "Framework",
          description: "Web frameworks",
          exclusive: true,
          order: 1,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing version", () => {
    const result = skillCategoriesFileSchema.safeParse({
      ...VALID_SKILL_CATEGORIES_FILE,
      version: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("should accept custom category keys with custom domain", () => {
    const result = skillCategoriesFileSchema.safeParse({
      version: "1.0.0",
      categories: {
        "acme-pipeline": {
          id: "acme-pipeline",
          displayName: "CI/CD Pipeline",
          description: "Deployment pipeline skills",
          domain: "acme",
          exclusive: false,
          order: 1,
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("lenient schemas accept custom values without pre-registration", () => {
  it("should accept custom agent names in agentYamlConfigSchema", () => {
    const result = agentYamlConfigSchema.safeParse({
      id: "acme-deployer",
      title: "Acme Deployer",
      description: "Handles Kubernetes deployments",
      tools: ["Bash", "Read", "Write"],
      custom: true,
    });
    expect(result.success).toBe(true);
  });

  it("should accept custom skill IDs in projectConfigLoaderSchema skills array", () => {
    const result = projectConfigLoaderSchema.safeParse({
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      skills: [
        ...buildSkillConfigs(["web-framework-react"]),
        { id: "acme-pipeline-deploy", scope: "project", origin: "eject" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should accept custom domains in projectConfigLoaderSchema domains array", () => {
    const result = projectConfigLoaderSchema.safeParse({
      name: "test-project",
      agents: buildAgentConfigs(["web-developer"]),
      domains: ["web", "acme"],
    });
    expect(result.success).toBe(true);
  });
});

describe("formatZodIssues", () => {
  it("should format a single issue with path and message", () => {
    const issues: z.ZodIssue[] = [
      {
        code: "invalid_type" as const,
        expected: "string",
        path: ["name"],
        message: "Expected string",
      },
    ];
    expect(formatZodIssues(issues)).toBe("name: Expected string");
  });

  it("should join multiple issues with semicolons", () => {
    const issues: z.ZodIssue[] = [
      { code: "invalid_type" as const, expected: "string", path: ["name"], message: "Required" },
      { code: "invalid_type" as const, expected: "string", path: ["email"], message: "Required" },
    ];
    expect(formatZodIssues(issues)).toBe("name: Required; email: Required");
  });

  it("should handle nested paths", () => {
    const issues: z.ZodIssue[] = [
      {
        code: "invalid_type" as const,
        expected: "string",
        path: ["author", "name"],
        message: "Expected string",
      },
    ];
    expect(formatZodIssues(issues)).toBe("author.name: Expected string");
  });

  it("should handle empty path", () => {
    const issues: z.ZodIssue[] = [{ code: "custom" as const, path: [], message: "Invalid input" }];
    expect(formatZodIssues(issues)).toBe("Invalid input");
  });

  it("should handle empty issues array", () => {
    expect(formatZodIssues([])).toBe("");
  });
});

/** Loader and read-back schema must agree; refusals belong on the loader, which knows the file. */
describe("the agent metadata a compiled agent is written from, against the schema that reads it back", () => {
  const AGENT_METADATA = {
    id: AGENT_DEFS.webDev.name,
    title: AGENT_DEFS.webDev.title,
    description: AGENT_DEFS.webDev.description,
    tools: AGENT_DEFS.webDev.tools,
  };

  const COMPILED_FRONTMATTER = {
    name: AGENT_DEFS.webDev.name,
    description: AGENT_DEFS.webDev.description,
  };

  const HOOK_EVENT = "SubagentStop";

  const DECLARED_HOOKS = {
    [HOOK_EVENT]: [{ matcher: "Write", hooks: [{ type: "command", command: "npm run lint" }] }],
  } as const satisfies NonNullable<AgentYamlConfig["hooks"]>;

  /** The same intent with the `hooks:` wrapper forgotten; every key is one the action declares. */
  const ACTIONS_WITHOUT_A_DEFINITION = {
    [HOOK_EVENT]: [{ type: "command", command: "npm run lint" }],
  };

  const NO_ACTIONS_DECLARED = [["hooks", HOOK_EVENT, 0, "hooks"]];

  const UNRECOGNIZED_KEY = "unrecognized_keys";

  /** A near miss of `cacheTtl`: mistyped options are what strictness reports. */
  const UNDOCUMENTED_EXPERIMENTAL_KEY = "cacheTtlSeconds";

  it("carries every hook action the metadata declares", () => {
    const parsed = agentYamlConfigSchema.parse({ ...AGENT_METADATA, hooks: DECLARED_HOOKS });

    expect(
      parsed.hooks,
      "the actions a user wrote must survive the load — the template emits what this returns, and nothing downstream can put back a command that was dropped here",
    ).toStrictEqual(DECLARED_HOOKS);
  });

  it("refuses a hooks block declaring no actions, where the file declaring it is", () => {
    const readBack = agentFrontmatterValidationSchema.safeParse({
      ...COMPILED_FRONTMATTER,
      hooks: ACTIONS_WITHOUT_A_DEFINITION,
    });
    const loaded = agentYamlConfigSchema.safeParse({
      ...AGENT_METADATA,
      hooks: ACTIONS_WITHOUT_A_DEFINITION,
    });

    expect(
      readBack.error?.issues.map((issue) => issue.path),
      "the reading side stopped refusing this shape, so the loader below has nothing to agree with",
    ).toStrictEqual(NO_ACTIONS_DECLARED);
    expect(
      loaded.error?.issues.map((issue) => issue.path),
      "the loader accepts a hooks block the frontmatter reader refuses — it strips the actions to an empty definition and lets the refusal arrive two layers later, against a compiled file the user never wrote",
    ).toStrictEqual(NO_ACTIONS_DECLARED);
  });

  it("accepts every cache TTL the experimental options document", () => {
    const refused = CACHE_TTLS.filter(
      (cacheTtl) =>
        !agentYamlConfigSchema.safeParse({ ...AGENT_METADATA, experimental: { cacheTtl } }).success,
    );

    expect(
      refused,
      "a refused TTL makes an agent declaring it unloadable, so nothing it asks for reaches the template",
    ).toStrictEqual([]);
  });

  it("refuses an experimental option the vocabulary does not document", () => {
    const result = agentYamlConfigSchema.safeParse({
      ...AGENT_METADATA,
      experimental: { [UNDOCUMENTED_EXPERIMENTAL_KEY]: CACHE_TTLS[0] },
    });

    expect(
      result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path })),
      "the experimental map is strict only at the two schemas that read a compiled agent, so a mistyped option is emptied here and the reader is handed a map with nothing left to refuse",
    ).toStrictEqual([{ code: UNRECOGNIZED_KEY, path: ["experimental"] }]);
  });

  it("judges isolation against the whole documented vocabulary", () => {
    const refused = AGENT_ISOLATIONS.filter(
      (isolation) => !agentYamlConfigSchema.safeParse({ ...AGENT_METADATA, isolation }).success,
    );

    expect(
      refused,
      "a mode the vocabulary documents is refused at load, so an agent declaring it never reaches the template that emits it",
    ).toStrictEqual([]);
  });
});

/** The issue a stale key raises, as `config.ts`'s reader reports it: where, and in which words. */
describe("the issue a stale key in config.ts is reported at", () => {
  function pathsAndMessages(result: {
    error?: z.ZodError;
  }): { path: PropertyKey[]; message: string }[] {
    return (result.error?.issues ?? []).map(({ path, message }) => ({ path, message }));
  }

  it("reports a stale top-level key at its own path, with the sentence naming its rename", () => {
    const result = projectConfigLoaderSchema.safeParse(buildPreRenameProjectConfig());

    expect(pathsAndMessages(result)).toStrictEqual([
      {
        path: [PRE_RENAME_CONFIG_KEY],
        message:
          '"source" was renamed to "marketplace". Rename the key in this config — the CLI does not read "source" any more and will not fall back to it.',
      },
    ]);
  });

  it("reports a stale key in a skill entry under that entry's index", () => {
    const result = projectConfigLoaderSchema.safeParse(buildPreRenameSkillEntryConfig());

    expect(pathsAndMessages(result)).toStrictEqual([
      {
        path: ["skills", 0, PRE_RENAME_CONFIG_KEY],
        message:
          '"source" was renamed to "origin". Rename the key in this config — the CLI does not read "source" any more and will not fall back to it.',
      },
    ]);
  });

  it("refuses a skill entry that is not an object as a shape error, without failing to read it", () => {
    const config = { ...buildProjectConfig(), skills: ["web-framework-react"] };

    const result = projectConfigLoaderSchema.safeParse(config);

    expect(result.success).toBe(false);
    expect(pathsAndMessages(result).map(({ path }) => path)).toStrictEqual([["skills", 0]]);
  });
});

/** The words a relationship rule naming a skill outside the catalogue is refused in. */
describe("the refusal of a relationship rule naming a skill the catalogue does not carry", () => {
  const REFUSAL_TAIL =
    " is not a slug the public catalogue carries, and a relationship rule may only name skills the public catalogue carries — this marketplace's own skills cannot be named in one yet. Name a catalogue slug, or leave 'relationships' out: it is optional, and a marketplace shipping no relationship rules loads and installs like any other.";

  function conflictMessages(skills: unknown[]): string[] {
    const result = skillRulesFileSchema.safeParse({
      version: "1.0.0",
      relationships: {
        conflicts: [{ skills, reason: "they overlap" }],
        discourages: [],
        requires: [],
        alternatives: [],
      },
    });
    return (result.error?.issues ?? []).map(({ message }) => message);
  }

  it("quotes the slug it does not know", () => {
    expect(conflictMessages(["acme-widget", "react"])).toStrictEqual([
      `'acme-widget'${REFUSAL_TAIL}`,
    ]);
  });

  it("calls a value that is not a string 'That value'", () => {
    expect(conflictMessages([NON_STRING_FIELD_VALUE, "react"])).toStrictEqual([
      `That value${REFUSAL_TAIL}`,
    ]);
  });
});

describe("the refusal of a metadata.yaml slug the catalogue does not carry", () => {
  const REFUSAL_TAIL =
    " is not a slug the public catalogue carries. A published skill's slug is held to that catalogue unless the skill declares it is not from it — add 'custom: true' beside it in this metadata.yaml and the slug is read as your marketplace's own, any kebab-case name. That declaration is how a skill outside the catalogue's vocabulary is carried; a skill the catalogue does carry names its catalogue slug and leaves it off.";

  function slugMessages(slug: unknown): string[] {
    const result = metadataValidationSchema.safeParse({
      ...VALID_EMBEDDED_SKILL_METADATA_FILE,
      slug,
    });
    return (result.error?.issues ?? []).map(({ message }) => message);
  }

  it("quotes the slug it does not know and points at custom: true", () => {
    expect(slugMessages("acme-widget")).toStrictEqual([`'acme-widget'${REFUSAL_TAIL}`]);
  });

  it("calls a slug that is not a string 'That value'", () => {
    expect(slugMessages(NON_STRING_FIELD_VALUE)).toStrictEqual([`That value${REFUSAL_TAIL}`]);
  });
});

describe("describeMetadataSchemaFailure", () => {
  function describeFailure(rawMetadata: Record<string, unknown>): string {
    const result = metadataValidationSchema.safeParse(rawMetadata);
    return describeMetadataSchemaFailure(result.error?.issues ?? [], rawMetadata);
  }

  it("names one absent field as missing", () => {
    const { category: _category, ...withoutCategory } = VALID_EMBEDDED_SKILL_METADATA_FILE;

    expect(describeFailure(withoutCategory)).toBe("missing required field: category");
  });

  it("names absent fields together, then each malformed one, separated by semicolons", () => {
    const {
      category: _category,
      displayName: _displayName,
      ...rest
    } = VALID_EMBEDDED_SKILL_METADATA_FILE;

    expect(describeFailure({ ...rest, usageGuidance: "too short" })).toBe(
      "missing required fields: displayName, category; usageGuidance: Too small: expected string to have >=10 characters",
    );
  });

  it("does not call a key the schema refuses as unknown a missing field", () => {
    expect(describeFailure({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, extraKey: true })).toBe(
      'Unrecognized key: "extraKey"',
    );
  });
});

describe("splitMetadataValidationIssues beyond cliDescription", () => {
  it("keeps an over-length field other than cliDescription as an error", () => {
    const rawMetadata = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, displayName: "d".repeat(31) };
    const result = metadataValidationSchema.safeParse(rawMetadata);
    if (result.success) throw new Error("fixture must fail strict validation");

    const { errors, warnings } = splitMetadataValidationIssues(result.error, rawMetadata);

    expect(warnings).toStrictEqual([]);
    expect(errors).toStrictEqual([formatZodIssues(result.error.issues)]);
  });

  it("splits the issues of a null document without reading a field off it", () => {
    const result = metadataValidationSchema.safeParse(null);
    if (result.success) throw new Error("fixture must fail strict validation");

    const { errors, warnings } = splitMetadataValidationIssues(result.error, null);

    expect(warnings).toStrictEqual([]);
    expect(errors).toStrictEqual([formatZodIssues(result.error.issues)]);
  });
});

describe("the nesting check over an array", () => {
  it("refuses an array when any one element nests too deeply", () => {
    expect(validateNestingDepth([1, { a: { b: { c: 1 } } }], 2)).toBe(false);
  });
});

describe("which schema judges a skill's metadata", () => {
  /** A slug no catalogue carries: only the relaxed schema accepts it. */
  const OWN_SLUG_METADATA = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, slug: "acme-react" };

  it("judges metadata by the relaxed schema only when it says custom: true", () => {
    expect(validateSkillMetadata({ ...OWN_SLUG_METADATA, custom: true }).success).toBe(true);
    expect(validateSkillMetadata({ ...OWN_SLUG_METADATA, custom: false }).success).toBe(false);
    expect(validateSkillMetadata(OWN_SLUG_METADATA).success).toBe(false);
  });

  it("refuses metadata that is not an object, rather than throwing", () => {
    expect(validateSkillMetadata(null).success).toBe(false);
  });

  describe("a directory a shared configuration carried", () => {
    /** 32 characters: a name the editor showed whole. */
    const LONG_DISPLAY_NAME = "Web Application Security Testing";
    /** 51 characters: the id the editor mints for a 30-character name under `web-tooling`. */
    const LONG_SLUG = "external-web-tooling-verification-before-completion";
    /** An ejected copy's provenance: no directory inside its source. */
    const EJECTED_FROM = {
      skillId: LONG_SLUG,
      contentHash: "abc1234",
      date: "2026-10-21",
      source: "github:obra/superpowers",
    };
    const CARRIED_FROM = { ...EJECTED_FROM, path: "skills/verification-before-completion" };
    const CUSTOM_METADATA = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, custom: true };
    const CARRIED_METADATA = { ...CUSTOM_METADATA, forkedFrom: CARRIED_FROM };

    it("is judged without a maximum on its display name", () => {
      const judged = validateSkillMetadata({ ...CARRIED_METADATA, displayName: LONG_DISPLAY_NAME });

      expect(judged.error?.issues.map((issue) => issue.path.join(".")) ?? []).toStrictEqual([]);
    });

    it("is judged without a maximum on its slug", () => {
      const judged = validateSkillMetadata({ ...CARRIED_METADATA, slug: LONG_SLUG });

      expect(judged.error?.issues.map((issue) => issue.path.join(".")) ?? []).toStrictEqual([]);
    });

    it.each([
      ["a custom skill with no provenance", CUSTOM_METADATA],
      [
        "an ejected copy, whose provenance names no directory",
        { ...CUSTOM_METADATA, forkedFrom: EJECTED_FROM },
      ],
    ])("keeps both maximums for %s", (_subject, metadata) => {
      const judged = validateSkillMetadata({
        ...metadata,
        displayName: LONG_DISPLAY_NAME,
        slug: LONG_SLUG,
      });

      expect(judged.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual([
        "displayName",
        "slug",
      ]);
    });

    it("still refuses an empty display name and a slug that is not kebab-case", () => {
      const judged = validateSkillMetadata({
        ...CARRIED_METADATA,
        displayName: "",
        slug: "External_Thing",
      });

      expect(judged.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual([
        "displayName",
        "slug",
      ]);
    });
  });
});

describe("relationship rules naming more than one skill", () => {
  it("accepts a conflict among three, a requirement on two, and two alternatives", () => {
    const result = skillRulesFileSchema.safeParse({
      version: "1.0.0",
      relationships: {
        conflicts: [
          {
            skills: ["react", "vue-composition-api", "svelte"],
            reason: "one framework per project",
          },
        ],
        discourages: [],
        requires: [
          {
            skill: "zustand",
            needs: ["react", "vue-composition-api"],
            reason: "it binds a framework",
          },
        ],
        alternatives: [{ purpose: "client state", skills: ["zustand", "pinia"] }],
      },
    });

    expect(result.error?.issues ?? []).toStrictEqual([]);
  });
});

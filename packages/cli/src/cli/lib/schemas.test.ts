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
import { buildSkillConfigs } from "./__tests__/helpers/wizard-simulation.js";
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
  categoryPathSchema,
  formatZodIssues,
  localRawMetadataSchema,
  marketplaceSchema,
  metadataValidationSchema,
  projectConfigLoaderSchema,
  projectSourceConfigSchema,
  skillMetadataLoaderSchema,
  skillCategoriesFileSchema,
  splitMetadataValidationIssues,
  validateNestingDepth,
  warnUnknownFields,
} from "./schemas";

vi.mock("../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/logger")>()),
  warn: vi.fn(),
}));

import { warn } from "../utils/logger";

/**
 * The three key names the rename moves between, written out here because the assertions are
 * about the KEYS themselves — a test that read them off the type would agree with whatever
 * the type happened to say.
 */
const PRE_RENAME_CONFIG_KEY = "source";
const RENAMED_CONFIG_KEY = "marketplace";
const MARKETPLACE_NAME_KEY = "marketplaceName";
const RENAMED_SKILL_KEY = "origin";

/** Rejected by a declared `z.string()` field and accepted by `.passthrough()` — the difference. */
const NON_STRING_FIELD_VALUE = 123;

const SCHEMAS_DIR = path.resolve(import.meta.dirname, "../../schemas");
const PROJECT_CONFIG_SCHEMA_PATH = path.join(SCHEMAS_DIR, "project-config.schema.json");
const PROJECT_SOURCE_CONFIG_SCHEMA_PATH = path.join(
  SCHEMAS_DIR,
  "project-source-config.schema.json",
);

/** The two hand-maintained schema files, read for the field names they publish to editors. */
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
      // At depth 0, only primitives should pass
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
      // This is about 4 levels deep, should pass with limit of 10
      expect(validateNestingDepth(marketplace, 10)).toBe(true);
    });

    it("should reject maliciously deeply nested JSON", () => {
      // Build a 15-level deep structure
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
            // Format 1: bare string
            "web-framework": "web-framework-react",
            // Format 2: array of objects
            "shared-methodology": [
              { id: "meta-methodology-investigation-requirements", preloaded: true },
              { id: "meta-methodology-anti-over-engineering", preloaded: true },
            ],
            // Format 3: single object
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

      // Lenient loader accepts any string; strict validation happens at build time
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

/**
 * Whether `marketplace` holds a REF or a NAME is invisible to a schema — both are strings —
 * so the meaning of that key is pinned where it is read, in the resolveSource specs. What a
 * schema CAN answer is whether a key is declared at all, which is what these ask: a declared
 * `z.string()` refuses a number where `.passthrough()` waves it through.
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

/**
 * A marketplace's name is the namespace Claude Code registers its plugins under, so what this
 * schema will LOAD has to be what that registration will accept. The rule was already written and
 * already enforced one direction only: `build marketplace` refuses to PUBLISH a non-kebab name
 * (`marketplaceNameNotPublishable` in `utils/messages.ts`), while the load side took any non-empty
 * string — so a third-party manifest naming `@acme/skills` read clean here and named plugins that
 * could never install. Owner ruling 2026-08-20: piggyback on what Claude Code accepts, both ways.
 *
 * A third-party marketplace whose name is not kebab-case now fails to load where it used to load.
 * That is the intent, which is why the refusal is asserted as prose a reader can act on rather
 * than as a boolean.
 */
describe("the name a marketplace may be loaded under", () => {
  /** The one plugin `marketplaceSchema.plugins.min(1)` requires before `name` is ever reached. */
  const ONE_PLUGIN = [createMockMarketplacePlugin("web-framework-react")];

  /** An npm scoped package name: legitimate on npm, and not a name a marketplace may carry. */
  const SCOPED_PACKAGE_NAME = "@acme/skills";
  const TITLE_CASED_NAME = "Acme Skills";
  const LEADING_DIGIT_NAME = "2acme";
  const KEBAB_NAME = "acme-skills";

  /**
   * A fragment every kebab-case regex opens with, mirrored as a LITERAL rather than imported
   * from `consts.ts`. The assertion is that the refusal does NOT hand the pattern back, and a
   * test reading the very constant the product reads would move with it and stop asserting.
   */
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
});

describe("branding via projectSourceConfigSchema", () => {
  it("should accept branding naming the CLI", () => {
    const result = projectSourceConfigSchema.safeParse({
      branding: { name: "Acme Dev Tools" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.branding).toStrictEqual({ name: "Acme Dev Tools" });
  });

  /**
   * `branding` is the ONE field this schema publishes, and the assertion is `toStrictEqual`
   * rather than a check on `name`, because stripping is the whole subject: `brandingConfigSchema`
   * is a bare `z.object`, so an unpublished key is dropped silently rather than refused, and a
   * `name`-only assertion passes whether or not the drop happened.
   *
   * A configured `tagline` used to survive this parse and reach `ResolvedBranding`, where nothing
   * read it — the field promised a wizard header the product never rendered.
   */
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

  /**
   * The published artefact, checked separately from the parser because they are generated from
   * one source and read by different consumers — an editor validating a user's `config.ts`
   * against the JSON schema sees `additionalProperties: false`, so for that reader a leftover
   * `tagline` is an ERROR rather than the silent drop the parser performs.
   */
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

  /**
   * The whole parsed category, not one field of it. A `required` flag a marketplace still ships
   * has to arrive on the other side of this schema STRIPPED rather than carried, because what a
   * source declares and what the CLI acts on are different questions — and every surface
   * downstream reads the parsed object rather than the file.
   */
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
  /** Parses raw metadata with the strict schema and asserts it failed. */
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
  it("should accept custom categories in categoryPathSchema via kebab-case fallback", () => {
    const result = categoryPathSchema.safeParse("acme-pipeline");
    expect(result.success).toBe(true);
  });

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

  it("should still reject uppercase categories", () => {
    expect(categoryPathSchema.safeParse("Acme-Pipeline").success).toBe(false);
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

/**
 * The three keys `agent.liquid` writes conditionally, judged on the side that READS the
 * `metadata.yaml` a user hand-authors.
 *
 * A compiled agent is written by one schema and read back by another: `agentYamlConfigSchema`
 * loads the `metadata.yaml`, `agent.liquid` emits `isolation:`, `experimental:` and `hooks:` from
 * what that load returned, and `agentFrontmatterValidationSchema` parses the result back —
 * `validateAgentFrontmatter` in `lib/plugins/plugin-validator.ts` behind `doctor`, and
 * `parseAgentFrontmatter` in `lib/agents/agent-plugin-compiler.ts` behind `compileAgentPlugin`.
 * The two schemas therefore have to name one contract per key, and for two of the three they did
 * not.
 *
 * The refusals are the subject rather than the acceptances, and they belong HERE rather than only
 * on the reading side, because the loader is the only boundary that still knows which file the
 * value came from: `loadAgentsFromDir` names `metadata.yaml`'s full path in its warning, while a
 * refusal arriving at the frontmatter reader names a compiled `.md` the user never wrote and a
 * value the loader has already emptied.
 */
describe("the agent metadata a compiled agent is written from, against the schema that reads it back", () => {
  /** Every fixture below is this agent plus exactly one of the three keys. */
  const AGENT_METADATA = {
    id: AGENT_DEFS.webDev.name,
    title: AGENT_DEFS.webDev.title,
    description: AGENT_DEFS.webDev.description,
    tools: AGENT_DEFS.webDev.tools,
  };

  /** The frontmatter the template writes for {@link AGENT_METADATA}, minus the key under test. */
  const COMPILED_FRONTMATTER = {
    name: AGENT_DEFS.webDev.name,
    description: AGENT_DEFS.webDev.description,
  };

  const HOOK_EVENT = "SubagentStop";

  /** A hooks block in the shape Claude Code documents: a matcher, and the actions it fires. */
  const DECLARED_HOOKS = {
    [HOOK_EVENT]: [{ matcher: "Write", hooks: [{ type: "command", command: "npm run lint" }] }],
  } as const satisfies NonNullable<AgentYamlConfig["hooks"]>;

  /**
   * The same intent written one level flat — the action list hung straight off the event, with no
   * definition around it. Not a foreign shape: it is what a hooks block looks like with the
   * `hooks:` wrapper forgotten, and every key in it is a key the action schema declares.
   */
  const ACTIONS_WITHOUT_A_DEFINITION = {
    [HOOK_EVENT]: [{ type: "command", command: "npm run lint" }],
  };

  /** Where a definition carrying no actions is refused, in both schemas' path vocabulary. */
  const NO_ACTIONS_DECLARED = [["hooks", HOOK_EVENT, 0, "hooks"]];

  /** Zod's own issue code for a key a `.strict()` object does not name. */
  const UNRECOGNIZED_KEY = "unrecognized_keys";

  /** A near miss of `cacheTtl`, because a mistyped option name is what strictness exists to report. */
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

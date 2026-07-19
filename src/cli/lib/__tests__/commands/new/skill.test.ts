import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { fileExists, directoryExists } from "../../test-fs-utils";
import { writeTestTsConfig } from "../../helpers/config-io.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { buildSourceConfig } from "../../factories/config-factories.js";
import { EXIT_CODES } from "../../../exit-codes";
import {
  toTitleCase,
  generateSkillCategoriesTs,
  generateSkillRulesTs,
} from "../../../skills/generators";
import { generateSkillMd, generateMetadataYaml } from "../../../../commands/new/skill";
import { validateKebabCaseName } from "../../../validate-kebab-name";
import {
  LOCAL_SKILLS_PATH,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  PLUGIN_MANIFEST_DIR,
  STANDARD_FILES,
} from "../../../../consts";
import type { CategoryPath } from "../../../../types";

const TEST_CONTENT_HASH = "abc1234";

describe("validateKebabCaseName (skill names)", () => {
  it("should return null for valid kebab-case name", () => {
    expect(validateKebabCaseName("my-skill", "Skill")).toBeNull();
  });

  it("should return null for single word lowercase name", () => {
    expect(validateKebabCaseName("react", "Skill")).toBeNull();
  });

  it("should return null for name with numbers", () => {
    expect(validateKebabCaseName("web3-utils", "Skill")).toBeNull();
  });

  it("should return error for uppercase characters", () => {
    const result = validateKebabCaseName("MySkill", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("kebab-case");
  });

  it("should return error for spaces", () => {
    const result = validateKebabCaseName("my skill", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("kebab-case");
  });

  it("should return error for empty string", () => {
    const result = validateKebabCaseName("", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("required");
  });

  it("should return error for whitespace-only string", () => {
    const result = validateKebabCaseName("   ", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("required");
  });

  it("should return error for name starting with number", () => {
    const result = validateKebabCaseName("3d-utils", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("kebab-case");
  });

  it("should return error for name starting with hyphen", () => {
    const result = validateKebabCaseName("-my-skill", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("kebab-case");
  });

  it("should return error for trailing hyphen", () => {
    const result = validateKebabCaseName("my-skill-", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("kebab-case");
  });

  it("should return error for consecutive hyphens", () => {
    const result = validateKebabCaseName("my--skill", "Skill");
    expect(result).not.toBeNull();
    expect(result).toContain("kebab-case");
  });
});

describe("toTitleCase", () => {
  it("should convert kebab-case to Title Case", () => {
    expect(toTitleCase("web-framework")).toBe("Web Framework");
  });

  it("should handle single word", () => {
    expect(toTitleCase("react")).toBe("React");
  });

  it("should handle multiple hyphens", () => {
    expect(toTitleCase("my-cool-patterns")).toBe("My Cool Patterns");
  });
});

describe("generateSkillMd", () => {
  it("should contain frontmatter with skill name", () => {
    const content = generateSkillMd("my-skill");
    expect(content).toContain("---");
    expect(content).toContain("name: my-skill");
  });

  it("should contain description field in frontmatter", () => {
    const content = generateSkillMd("my-skill");
    expect(content).toContain("description:");
  });

  it("should contain title-cased heading", () => {
    const content = generateSkillMd("web-framework");
    expect(content).toContain("# Web Framework");
  });

  it("should not include author in name field", () => {
    const content = generateSkillMd("my-skill");
    expect(content).toContain("name: my-skill");
    expect(content).not.toContain("(@");
  });
});

describe("generateMetadataYaml", () => {
  it("should contain category field", () => {
    const content = generateMetadataYaml("my-skill", "@local", "local", TEST_CONTENT_HASH, "web");
    expect(content).toContain("category: local");
  });

  it("should contain author field", () => {
    const content = generateMetadataYaml("my-skill", "@vince", "local", TEST_CONTENT_HASH, "web");
    expect(content).toContain('author: "@vince"');
  });

  it("should contain title-cased displayName", () => {
    const content = generateMetadataYaml(
      "web-framework",
      "@local",
      "local",
      TEST_CONTENT_HASH,
      "web",
    );
    expect(content).toContain("displayName: Web Framework");
  });

  it("should use provided category", () => {
    const content = generateMetadataYaml(
      "my-skill",
      "@local",
      "web-framework",
      TEST_CONTENT_HASH,
      "web",
    );
    expect(content).toContain("category: web-framework");
  });

  it("should include yaml-language-server schema comment at the top", () => {
    const content = generateMetadataYaml("my-skill", "@local", "local", TEST_CONTENT_HASH, "web");
    expect(content).toMatch(
      /^# yaml-language-server: \$schema=https:\/\/raw\.githubusercontent\.com\/agents-inc\/cli\/main\/src\/schemas\/custom-metadata\.schema\.json\n/,
    );
  });

  it("should always include custom: true", () => {
    const content = generateMetadataYaml("my-skill", "@local", "local", TEST_CONTENT_HASH, "web");
    expect(content).toContain("custom: true");
  });

  it("should place custom: true before category", () => {
    const content = generateMetadataYaml("my-skill", "@local", "local", TEST_CONTENT_HASH, "web");
    const customIndex = content.indexOf("custom: true");
    const categoryIndex = content.indexOf("category: local");
    expect(customIndex).toBeLessThan(categoryIndex);
  });

  it("should contain contentHash field", () => {
    const content = generateMetadataYaml("my-skill", "@local", "local", TEST_CONTENT_HASH, "web");
    expect(content).toContain(`contentHash: ${TEST_CONTENT_HASH}`);
  });

  it("should contain domain field", () => {
    const content = generateMetadataYaml(
      "my-skill",
      "@local",
      "web-framework",
      TEST_CONTENT_HASH,
      "web",
    );
    expect(content).toContain("domain: web");
  });

  it("should use provided domain regardless of category prefix", () => {
    const content = generateMetadataYaml(
      "my-skill",
      "@local",
      "devops-iac" as CategoryPath,
      TEST_CONTENT_HASH,
      "api",
    );
    expect(content).toContain("domain: api");
  });
});

// D-212: `cc new skill` is gated behind FEATURE_FLAGS.NEW_SKILL_COMMAND (default false).
// These tests exercise the CLI layer via runCliCommand, which loads the compiled
// dist bundle where the flag is inlined -- vi.mock cannot reach it. Re-enable once
// D-212 is resolved and the flag flips back to true.
describe.skip("new:skill command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("new-skill-test-home-"));
    await writeTestTsConfig(projectDir, buildSourceConfig({ skills: [] }));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("argument validation", () => {
    it("should reject missing name argument", async () => {
      const { error } = await runCliCommand(["new:skill"]);

      // oclif should report missing required arg
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should reject non-kebab-case name with uppercase", async () => {
      const { error } = await runCliCommand(["new:skill", "MySkill"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should reject name with spaces", async () => {
      const { error } = await runCliCommand(["new:skill", "my skill"]);

      // oclif may treat the second word as an extra arg or validation fails
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });

  describe("file creation", () => {
    it("should create SKILL.md and metadata.yaml in .claude/skills/{name}/", async () => {
      await runCliCommand(["new:skill", "my-test-skill", "--domain", "web"]);

      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "my-test-skill");
      const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
      const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);

      expect(await directoryExists(skillDir)).toBe(true);
      expect(await fileExists(skillMdPath)).toBe(true);
      expect(await fileExists(metadataPath)).toBe(true);
    });

    it("should write correct SKILL.md content", async () => {
      await runCliCommand(["new:skill", "my-test-skill", "--domain", "web"]);

      const skillMdPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "my-test-skill",
        STANDARD_FILES.SKILL_MD,
      );
      const content = await readFile(skillMdPath, "utf-8");

      expect(content).toContain("name: my-test-skill");
      expect(content).toContain("# My Test Skill");
      expect(content).toContain("description:");
    });

    it("should write correct metadata.yaml content", async () => {
      await runCliCommand(["new:skill", "my-test-skill", "--domain", "web"]);

      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "my-test-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      const content = await readFile(metadataPath, "utf-8");

      expect(content).toContain("custom: true");
      expect(content).toContain("domain: web");
      expect(content).toContain("category: dummy-category");
      expect(content).toContain("displayName: My Test Skill");
      expect(content).toContain("contentHash:");
      expect(content).not.toContain("version:");
    });
  });

  describe("flags", () => {
    it("should accept --author flag and use it in metadata", async () => {
      await runCliCommand(["new:skill", "custom-skill", "--author", "@vince", "--domain", "web"]);

      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "custom-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      const content = await readFile(metadataPath, "utf-8");

      expect(content).toContain('author: "@vince"');
    });

    it("should accept --category flag and use it in metadata", async () => {
      await runCliCommand(["new:skill", "custom-skill", "--category", "web-framework"]);

      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "custom-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      const content = await readFile(metadataPath, "utf-8");

      expect(content).toContain("category: web-framework");
    });

    it("should accept --domain flag and use it in metadata", async () => {
      await runCliCommand(["new:skill", "custom-skill", "--domain", "api"]);

      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "custom-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      const content = await readFile(metadataPath, "utf-8");

      expect(content).toContain("domain: api");
    });

    it("should default domain to dummy when --domain not provided", async () => {
      await runCliCommand(["new:skill", "custom-skill", "--category", "devops-iac"]);

      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "custom-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      const content = await readFile(metadataPath, "utf-8");

      expect(content).toContain("domain: dummy");
    });
  });

  describe("existing skill handling", () => {
    it("should error if skill directory already exists without --force", async () => {
      // Create the skill directory first
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "existing-skill");
      await mkdir(skillDir, { recursive: true });

      const { error } = await runCliCommand(["new:skill", "existing-skill", "--domain", "web"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should overwrite existing skill with --force flag", async () => {
      // Create the skill directory first
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "existing-skill");
      await mkdir(skillDir, { recursive: true });

      const { error } = await runCliCommand([
        "new:skill",
        "existing-skill",
        "--force",
        "--domain",
        "web",
      ]);

      // Should not exit with error
      expect(error?.oclif?.exit).toBeUndefined();

      // Files should exist after overwrite
      const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
      expect(await fileExists(skillMdPath)).toBe(true);
    });
  });

  describe("marketplace detection", () => {
    it("should create skill in src/skills/ when marketplace.json exists", async () => {
      const marketplaceJsonDir = path.join(projectDir, PLUGIN_MANIFEST_DIR);
      await mkdir(marketplaceJsonDir, { recursive: true });
      await writeFile(path.join(marketplaceJsonDir, "marketplace.json"), '{"name":"test"}');

      const { stdout } = await runCliCommand(["new:skill", "my-market-skill", "--domain", "web"]);

      expect(stdout).toContain("Detected marketplace context");

      const skillDir = path.join(projectDir, SKILLS_DIR_PATH, "my-market-skill");
      expect(await directoryExists(skillDir)).toBe(true);
      expect(await fileExists(path.join(skillDir, STANDARD_FILES.SKILL_MD))).toBe(true);
      expect(await fileExists(path.join(skillDir, STANDARD_FILES.METADATA_YAML))).toBe(true);
    });

    it("should create skill in .claude/skills/ when marketplace.json does not exist", async () => {
      await runCliCommand(["new:skill", "my-local-skill", "--domain", "web"]);

      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "my-local-skill");
      expect(await directoryExists(skillDir)).toBe(true);
      expect(await fileExists(path.join(skillDir, STANDARD_FILES.SKILL_MD))).toBe(true);
      expect(await fileExists(path.join(skillDir, STANDARD_FILES.METADATA_YAML))).toBe(true);

      const marketplaceSkillDir = path.join(projectDir, SKILLS_DIR_PATH, "my-local-skill");
      expect(await directoryExists(marketplaceSkillDir)).toBe(false);
    });
  });

  describe("config file updates in marketplace context", () => {
    it("should create config files when running in marketplace context", async () => {
      const marketplaceJsonDir = path.join(projectDir, PLUGIN_MANIFEST_DIR);
      await mkdir(marketplaceJsonDir, { recursive: true });
      await writeFile(path.join(marketplaceJsonDir, "marketplace.json"), '{"name":"test"}');

      await runCliCommand([
        "new:skill",
        "my-market-skill",
        "--category",
        "web-testing",
        "--domain",
        "web",
      ]);

      const categoriesPath = path.join(projectDir, SKILL_CATEGORIES_PATH);
      const rulesPath = path.join(projectDir, SKILL_RULES_PATH);

      expect(await fileExists(categoriesPath)).toBe(true);
      expect(await fileExists(rulesPath)).toBe(true);

      const categoriesContent = await readFile(categoriesPath, "utf-8");
      expect(categoriesContent).toContain('"web-testing"');
      expect(categoriesContent).toContain('"domain": "web"');

      const rulesContent = await readFile(rulesPath, "utf-8");
      expect(rulesContent).toContain('"relationships"');
    });

    it("should NOT create config files for local skills", async () => {
      await runCliCommand(["new:skill", "my-local-skill", "--domain", "web"]);

      const categoriesPath = path.join(projectDir, SKILL_CATEGORIES_PATH);
      const rulesPath = path.join(projectDir, SKILL_RULES_PATH);

      expect(await fileExists(categoriesPath)).toBe(false);
      expect(await fileExists(rulesPath)).toBe(false);
    });

    it("should append to existing config files without duplicating entries", async () => {
      const marketplaceJsonDir = path.join(projectDir, PLUGIN_MANIFEST_DIR);
      await mkdir(marketplaceJsonDir, { recursive: true });
      await writeFile(path.join(marketplaceJsonDir, "marketplace.json"), '{"name":"test"}');

      // Create first skill to generate config files
      await runCliCommand([
        "new:skill",
        "first-skill",
        "--category",
        "web-testing",
        "--domain",
        "web",
      ]);

      // Create second skill with a different category
      await runCliCommand([
        "new:skill",
        "second-skill",
        "--category",
        "api-database",
        "--domain",
        "api",
      ]);

      const categoriesContent = await readFile(
        path.join(projectDir, SKILL_CATEGORIES_PATH),
        "utf-8",
      );
      expect(categoriesContent).toContain('"web-testing"');
      expect(categoriesContent).toContain('"api-database"');

      const rulesContent = await readFile(path.join(projectDir, SKILL_RULES_PATH), "utf-8");
      expect(rulesContent).toContain('"version"');
      expect(rulesContent).toContain('"relationships"');
    });

    it("should not duplicate existing category entries", async () => {
      const marketplaceJsonDir = path.join(projectDir, PLUGIN_MANIFEST_DIR);
      await mkdir(marketplaceJsonDir, { recursive: true });
      await writeFile(path.join(marketplaceJsonDir, "marketplace.json"), '{"name":"test"}');

      // Create two skills with the same category
      await runCliCommand([
        "new:skill",
        "skill-one",
        "--category",
        "web-framework",
        "--domain",
        "web",
      ]);
      await runCliCommand([
        "new:skill",
        "skill-one",
        "--category",
        "web-framework",
        "--domain",
        "web",
        "--force",
      ]);

      const categoriesContent = await readFile(
        path.join(projectDir, SKILL_CATEGORIES_PATH),
        "utf-8",
      );
      // Should only appear once as a category key in JSON
      const matches = categoriesContent.match(/"web-framework":/g);
      expect(matches).toHaveLength(1);
    });
  });
});

describe("generateSkillCategoriesTs", () => {
  it("should contain version field", () => {
    const content = generateSkillCategoriesTs("web-framework", "web");
    expect(content).toContain('"version": "1.0.0"');
  });

  it("should contain category entry with correct id", () => {
    const content = generateSkillCategoriesTs("web-framework", "web");
    expect(content).toContain('"web-framework"');
    expect(content).toContain('"id": "web-framework"');
  });

  it("should derive displayName from category part", () => {
    const content = generateSkillCategoriesTs("web-framework", "web");
    expect(content).toContain('"displayName": "Framework"');
  });

  it("should include the explicitly provided domain", () => {
    const content = generateSkillCategoriesTs("api-database", "api");
    expect(content).toContain('"domain": "api"');
  });

  it("should include domain even for non-standard prefixes", () => {
    const content = generateSkillCategoriesTs("dummy-category" as CategoryPath, "dummy");
    expect(content).toContain('"domain": "dummy"');
  });

  it("should set default values for exclusive, required, order", () => {
    const content = generateSkillCategoriesTs("web-framework", "web");
    expect(content).toContain('"exclusive": true');
    expect(content).toContain('"required": false');
    expect(content).toContain('"order": 99');
  });

  it("should derive displayName for multi-segment category", () => {
    const content = generateSkillCategoriesTs("web-error-handling", "web");
    expect(content).toContain('"displayName": "Error Handling"');
  });

  it("should handle all known domain prefixes", () => {
    for (const domain of ["web", "api", "mobile", "cli", "shared"]) {
      const content = generateSkillCategoriesTs(`${domain}-testing` as CategoryPath, domain);
      expect(content).toContain(`"domain": "${domain}"`);
    }
  });

  it("should be valid TypeScript with export default", () => {
    const content = generateSkillCategoriesTs("web-framework", "web");
    expect(content).toContain("export default");
  });
});

describe("generateSkillRulesTs", () => {
  it("should contain version field", () => {
    const content = generateSkillRulesTs();
    expect(content).toContain('"version": "1.0.0"');
  });

  it("should contain relationships section", () => {
    const content = generateSkillRulesTs();
    expect(content).toContain('"relationships"');
  });

  it("should include comment explaining rules format", () => {
    const content = generateSkillRulesTs();
    expect(content).toContain("// Skill rules configuration");
  });

  it("should be valid TypeScript with export default", () => {
    const content = generateSkillRulesTs();
    expect(content).toContain("export default");
  });
});

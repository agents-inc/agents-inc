import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { validateSource } from "./source-validator";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import {
  DIRS,
  MARKETPLACE_JSON,
  PLUGIN_MANIFEST_DIR,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STACKS_FILE_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  marketplaceManifestPath,
} from "../consts";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "./__tests__/factories/plugin-factories.js";
import { firstElement } from "./__tests__/helpers/element-at.js";
import { useFakeHome } from "./__tests__/helpers/isolated-home";
import { setVerbose } from "../utils/logger";
import { SKILL_SLUGS } from "../types/generated/source-types";
import {
  renderConfigTs,
  renderAgentYaml,
  renderSkillMd,
  renderUnparseableMetadataYaml,
  renderUnparseableSkillMd,
} from "./__tests__/content-generators";
import { renderUnparseableConfigTs } from "./__tests__/factories/unloadable-config-factories";
import {
  VALID_EMBEDDED_SKILL_METADATA_FILE,
  VALID_SKILL_CATEGORIES_FILE,
  VALID_SKILL_RULES_FILE,
  VALID_STACK_CONFIG_FILE,
  VALID_STACKS_CONFIG_FILE,
} from "./__tests__/mock-data/mock-source-files.js";

/** The yaml parser's own words for what renderUnparseableMetadataYaml() writes. */
const PARSER_REASON = "Nested mappings are not allowed";

/** A name Claude Code will not register plugins under, then the accepted spelling. */
const MANIFEST_NAME_REFUSED = "Acme_Skills";
const MANIFEST_NAME_ACCEPTED = "acme-skills";

/** The manifest as a reader of the report has to type it, which is the form `file` carries. */
const MARKETPLACE_MANIFEST_PATH = path.join(PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);

/** Two slugs a marketplace author writes for skills they ship, which no catalogue carries. */
const MARKETPLACE_OWN_SLUG = "acme-react";
const OTHER_MARKETPLACE_OWN_SLUG = "acme-vue";

/** Read off the union, so a refusal handing the whole union back reddens whatever it holds. */
const A_CATALOGUE_SLUG: string = firstElement(SKILL_SLUGS);

/** `build plugins` writes what `build marketplace` lists. */
const BUILDS_IN_ORDER = /build plugins[\s\S]*build marketplace/;

/** The three ways a marketplace can lack a valid manifest, each a different route through the load. */
const MANIFEST_DEFECTS = ["absent", "unparseable", "refused by the schema"] as const;

/** "absent" writes nothing; a marketplace listing no plugin is the shape the schema refuses. */
async function writeManifestDefect(
  sourceDir: string,
  defect: (typeof MANIFEST_DEFECTS)[number],
): Promise<void> {
  if (defect === "absent") return;
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    defect === "unparseable" ? "{ this is not json" : JSON.stringify(createMockMarketplace([])),
  );
}

async function writeMarketplaceManifest(sourceDir: string, name: string): Promise<void> {
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace([createMockMarketplacePlugin("web-framework-react")]),
      name,
    }),
  );
}

describe("source-validator", () => {
  describe("validateSource", () => {
    let tempDir: string;
    let sourceDir: string;
    let skillsDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir("source-validator-");
      sourceDir = path.join(tempDir, "source");
      skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
    });

    afterEach(async () => {
      await cleanupTempDir(tempDir);
    });

    it("should handle source with zero skills gracefully", async () => {
      const result = await validateSource(sourceDir);

      expect(result.skillCount).toBe(0);
      expect(result.issues.every((i) => !i.message.includes("does not exist"))).toBe(true);
    });

    it("should report specific error for malformed YAML in metadata", async () => {
      const skillDir = path.join(skillsDir, "web", "framework", "react");
      await mkdir(skillDir, { recursive: true });

      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        "category: web-framework\n  bad-indent: [\nunmatched bracket",
      );

      const result = await validateSource(sourceDir);

      expect(result.errorCount).toBe(1);
      const yamlErrors = result.issues.filter((i) => i.message.includes("Failed to parse YAML"));
      expect(yamlErrors).toHaveLength(1);
      expect(yamlErrors[0]?.severity).toBe("error");
    });

    describe("a skill directory holding half of its pair", () => {
      const skillDir = (): string => path.join(skillsDir, "web-framework-react");

      beforeEach(async () => {
        await mkdir(skillDir(), { recursive: true });
      });

      it("refuses SKILL.md with no metadata.yaml beside it, naming the directory", async () => {
        await writeFile(
          path.join(skillDir(), STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );

        const result = await validateSource(sourceDir);

        expect(result.issues.filter((issue) => issue.file === skillDir())).toStrictEqual([
          {
            severity: "error",
            file: skillDir(),
            message: "Missing metadata.yaml — skill directory has SKILL.md but no metadata",
          },
        ]);
      });

      it("refuses metadata.yaml with no SKILL.md beside it, naming the directory", async () => {
        await writeFile(
          path.join(skillDir(), STANDARD_FILES.METADATA_YAML),
          stringifyYaml(VALID_EMBEDDED_SKILL_METADATA_FILE),
        );

        const result = await validateSource(sourceDir);

        expect(result.issues.filter((issue) => issue.file === skillDir())).toStrictEqual([
          {
            severity: "error",
            file: skillDir(),
            message: "Missing SKILL.md — skill directory has metadata.yaml but no SKILL.md",
          },
        ]);
      });
    });

    describe("snake_case keys in metadata.yaml", () => {
      const METADATA_PATH = path.join(
        "src",
        STANDARD_DIRS.SKILLS,
        "web-framework-react",
        STANDARD_FILES.METADATA_YAML,
      );

      async function writeSkillWithMetadataText(metadataText: string): Promise<void> {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), metadataText);
      }

      const snakeCaseFindings = async () =>
        (await validateSource(sourceDir)).issues.filter((issue) =>
          issue.message.includes("snake_case"),
        );

      it("refuses each snake_case key, naming the key and the file", async () => {
        await writeSkillWithMetadataText(
          stringifyYaml({
            ...VALID_EMBEDDED_SKILL_METADATA_FILE,
            display_name: "react",
            usage_guidance: "use for React",
          }),
        );

        expect(await snakeCaseFindings()).toStrictEqual([
          {
            severity: "error",
            file: METADATA_PATH,
            message: "Key 'display_name' uses snake_case — use camelCase instead",
          },
          {
            severity: "error",
            file: METADATA_PATH,
            message: "Key 'usage_guidance' uses snake_case — use camelCase instead",
          },
        ]);
      });

      it("calls a key snake_case only where an underscore joins two lowercase letters", async () => {
        await writeSkillWithMetadataText(
          stringifyYaml({
            ...VALID_EMBEDDED_SKILL_METADATA_FILE,
            UPPER_CASE: "a",
            A_b: "b",
            _leading: "c",
            trailing_: "d",
          }),
        );

        expect(await snakeCaseFindings()).toStrictEqual([]);
      });

      it.each([
        ["empty", ""],
        ["a list", stringifyYaml(["display_name"])],
      ])("reads a metadata.yaml that is %s without a snake_case finding", async (_shape, text) => {
        await writeSkillWithMetadataText(text);

        expect(await snakeCaseFindings()).toStrictEqual([]);
      });
    });

    describe("cliDescription severity routing", () => {
      it("should report over-length cliDescription as a warning carrying the actual length", async () => {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, cliDescription: "x".repeat(75) }),
        );

        const result = await validateSource(sourceDir);

        const cliDescriptionIssues = result.issues.filter((i) =>
          i.message.includes("cliDescription"),
        );
        expect(cliDescriptionIssues).toHaveLength(1);
        expect(cliDescriptionIssues[0]?.severity).toBe("warning");
        expect(cliDescriptionIssues[0]?.message).toContain("75 characters");
        expect(result.errorCount).toBe(0);
      });

      it("should report empty cliDescription as an error", async () => {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, cliDescription: "" }),
        );

        const result = await validateSource(sourceDir);

        const cliDescriptionIssues = result.issues.filter((i) =>
          i.message.includes("cliDescription"),
        );
        expect(cliDescriptionIssues).toHaveLength(1);
        expect(cliDescriptionIssues[0]?.severity).toBe("error");
      });
    });

    /** A marketplace's own slug in metadata.yaml; the accepted case proves `custom: true` works. */
    describe("a slug metadata.yaml declares", () => {
      async function writeSkillWithMetadata(fields: Record<string, unknown>): Promise<void> {
        const skillDir = path.join(skillsDir, "acme-web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("acme-web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, ...fields }),
        );
      }

      it("names the mechanism that carries it when the catalogue does not", async () => {
        await writeSkillWithMetadata({ slug: MARKETPLACE_OWN_SLUG });

        const result = await validateSource(sourceDir);

        const slugErrors = result.issues.filter(
          (issue) => issue.severity === "error" && issue.message.includes("slug"),
        );
        expect(slugErrors).toHaveLength(1);
        expect(slugErrors[0]?.message, "the slug the author wrote must be named").toContain(
          MARKETPLACE_OWN_SLUG,
        );
        expect(
          slugErrors[0]?.message,
          "the one way through is the whole of what the reader needs, and nothing said it",
        ).toContain("custom: true");
        expect(
          result.issues.map((issue) => issue.message).join("\n"),
          "a catalogue of names the author did not write is not an answer to what they did",
        ).not.toContain(A_CATALOGUE_SLUG);
      });

      it("is accepted under that mechanism, so the message names a real way through", async () => {
        await writeSkillWithMetadata({ slug: MARKETPLACE_OWN_SLUG, custom: true });

        const result = await validateSource(sourceDir);

        expect(
          result.issues.filter((issue) => issue.severity === "error"),
          "a skill declaring itself the marketplace's own is judged by the relaxed schema",
        ).toStrictEqual([]);
      });
    });

    describe("directory name vs skill id", () => {
      it("should pass when directory name equals the skill id and displayName is a human name", async () => {
        const skillDir = path.join(skillsDir, "web-framework-react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml({ ...VALID_EMBEDDED_SKILL_METADATA_FILE, displayName: "React" }),
        );

        const result = await validateSource(sourceDir);

        const dirNameIssues = result.issues.filter((i) => i.message.includes("does not match"));
        expect(dirNameIssues).toStrictEqual([]);
        expect(result.errorCount).toBe(0);
      });

      it("should warn when directory name does not equal the skill id", async () => {
        const skillDir = path.join(skillsDir, "react");
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd("web-framework-react", "React"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml(VALID_EMBEDDED_SKILL_METADATA_FILE),
        );

        const result = await validateSource(sourceDir);

        expect(
          result.issues.filter((i) => i.message.includes("does not match skill id")),
        ).toStrictEqual([
          {
            severity: "warning",
            file: path.join("src", STANDARD_DIRS.SKILLS, "react", STANDARD_FILES.SKILL_MD),
            message: "Directory name 'react' does not match skill id 'web-framework-react'",
          },
        ]);
      });
    });

    it("should not crash when source has skills dir but no agent directories", async () => {
      const result = await validateSource(sourceDir);

      expect(result).toStrictEqual(
        expect.objectContaining({
          issues: expect.any(Array),
          skillCount: expect.any(Number),
          errorCount: expect.any(Number),
          warningCount: expect.any(Number),
        }),
      );
    });

    describe("stack config validation", () => {
      it("should report zero issues when src/stacks/ is absent", async () => {
        const result = await validateSource(sourceDir);

        const stackIssues = result.issues.filter((i) => i.file.startsWith(DIRS.stacks));
        expect(stackIssues).toStrictEqual([]);
      });

      it("should report zero issues for valid stack config.yaml and embedded-skill metadata", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(VALID_STACK_CONFIG_FILE),
        );

        const embeddedSkillDir = path.join(stackDir, "skills", "react");
        await mkdir(embeddedSkillDir, { recursive: true });
        await writeFile(
          path.join(embeddedSkillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml(VALID_EMBEDDED_SKILL_METADATA_FILE),
        );

        const result = await validateSource(sourceDir);

        const stackIssues = result.issues.filter((i) => i.file.startsWith(DIRS.stacks));
        expect(stackIssues).toStrictEqual([]);
      });

      it("should report error when stack config.yaml has schema violation", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        const invalidStackConfig = { ...VALID_STACK_CONFIG_FILE, version: undefined };
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(invalidStackConfig),
        );

        const result = await validateSource(sourceDir);

        const configPath = path.join(DIRS.stacks, "test-stack", STANDARD_FILES.CONFIG_YAML);
        const versionErrors = result.issues.filter(
          (i) => i.file === configPath && i.message.includes("version"),
        );
        expect(versionErrors.length).toBeGreaterThan(0);
        expect(versionErrors[0]?.severity).toBe("error");
      });

      it("should report error when embedded-skill metadata.yaml has schema violation", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(VALID_STACK_CONFIG_FILE),
        );

        const embeddedSkillDir = path.join(stackDir, "skills", "react");
        await mkdir(embeddedSkillDir, { recursive: true });
        const invalidMetadata = { ...VALID_EMBEDDED_SKILL_METADATA_FILE, author: "no-at-sign" };
        await writeFile(
          path.join(embeddedSkillDir, STANDARD_FILES.METADATA_YAML),
          stringifyYaml(invalidMetadata),
        );

        const result = await validateSource(sourceDir);

        const metadataPath = path.join(
          DIRS.stacks,
          "test-stack",
          "skills",
          "react",
          STANDARD_FILES.METADATA_YAML,
        );
        const authorErrors = result.issues.filter(
          (i) => i.file === metadataPath && i.message.includes("author"),
        );
        expect(authorErrors.length).toBeGreaterThan(0);
        expect(authorErrors[0]?.severity).toBe("error");
      });

      it("should name the parser's reason when an embedded-skill metadata.yaml is unparseable", async () => {
        const stackDir = path.join(sourceDir, DIRS.stacks, "test-stack");
        await mkdir(stackDir, { recursive: true });
        await writeFile(
          path.join(stackDir, STANDARD_FILES.CONFIG_YAML),
          stringifyYaml(VALID_STACK_CONFIG_FILE),
        );

        const embeddedSkillDir = path.join(stackDir, "skills", "react");
        await mkdir(embeddedSkillDir, { recursive: true });
        await writeFile(
          path.join(embeddedSkillDir, STANDARD_FILES.METADATA_YAML),
          renderUnparseableMetadataYaml(),
        );

        const result = await validateSource(sourceDir);

        const metadataPath = path.join(
          DIRS.stacks,
          "test-stack",
          "skills",
          "react",
          STANDARD_FILES.METADATA_YAML,
        );
        const parseErrors = result.issues.filter((i) => i.file === metadataPath);
        expect(parseErrors).toHaveLength(1);
        expect(parseErrors[0]?.severity).toBe("error");
        expect(
          parseErrors[0]?.message,
          "a parse refusal that names no cause leaves the author nothing to act on",
        ).toContain(PARSER_REASON);
      });
    });

    describe("source-side agent metadata validation", () => {
      it("should report zero issues when src/agents/ is absent", async () => {
        const result = await validateSource(sourceDir);

        const agentIssues = result.issues.filter((i) => i.file.startsWith(DIRS.agents));
        expect(agentIssues).toStrictEqual([]);
      });

      it("should report zero issues for valid agent metadata.yaml", async () => {
        const agentDir = path.join(sourceDir, DIRS.agents, "developer", "web-developer");
        await mkdir(agentDir, { recursive: true });
        await writeFile(
          path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
          renderAgentYaml("web-developer"),
        );

        const result = await validateSource(sourceDir);

        const agentIssues = result.issues.filter((i) => i.file.startsWith(DIRS.agents));
        expect(agentIssues).toStrictEqual([]);
      });

      it("should report error when agent metadata.yaml has schema violation", async () => {
        const agentDir = path.join(sourceDir, DIRS.agents, "developer", "web-developer");
        await mkdir(agentDir, { recursive: true });
        // Missing required 'tools' field (schema requires min(1))
        const invalidAgent = {
          id: "web-developer",
          title: "Web Developer",
          description: "Builds web apps",
        };
        await writeFile(
          path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
          stringifyYaml(invalidAgent),
        );

        const result = await validateSource(sourceDir);

        const agentPath = path.join(
          DIRS.agents,
          "developer",
          "web-developer",
          STANDARD_FILES.AGENT_METADATA_YAML,
        );
        const toolsErrors = result.issues.filter(
          (i) => i.file === agentPath && i.message.includes("tools"),
        );
        expect(toolsErrors.length).toBeGreaterThan(0);
        expect(toolsErrors[0]?.severity).toBe("error");
      });
    });

    describe("TS config file validation", () => {
      it("should report zero issues when config/ directory is absent", async () => {
        const result = await validateSource(sourceDir);

        const configFilePaths = [SKILL_CATEGORIES_PATH, SKILL_RULES_PATH, STACKS_FILE_PATH];
        const configIssues = result.issues.filter(
          (i) =>
            configFilePaths.includes(i.file) &&
            !i.message.includes("Cross-reference validation skipped"),
        );
        expect(configIssues).toStrictEqual([]);
      });

      it("should report zero issues for valid config/skill-categories.ts, skill-rules.ts, stacks.ts", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        await writeFile(
          path.join(sourceDir, SKILL_CATEGORIES_PATH),
          renderConfigTs(VALID_SKILL_CATEGORIES_FILE),
        );
        await writeFile(
          path.join(sourceDir, SKILL_RULES_PATH),
          renderConfigTs(VALID_SKILL_RULES_FILE),
        );
        await writeFile(
          path.join(sourceDir, STACKS_FILE_PATH),
          renderConfigTs(VALID_STACKS_CONFIG_FILE),
        );

        const result = await validateSource(sourceDir);

        const configFilePaths = [SKILL_CATEGORIES_PATH, SKILL_RULES_PATH, STACKS_FILE_PATH];
        const configIssues = result.issues.filter((i) => configFilePaths.includes(i.file));
        expect(configIssues).toStrictEqual([]);
      });

      it("should report error when config/skill-categories.ts default export fails schema", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        // Missing required 'version' field
        await writeFile(
          path.join(sourceDir, SKILL_CATEGORIES_PATH),
          renderConfigTs({ categories: {} }),
        );

        const result = await validateSource(sourceDir);

        const categoriesErrors = result.issues.filter(
          (i) => i.file === SKILL_CATEGORIES_PATH && i.severity === "error",
        );
        expect(categoriesErrors.length).toBeGreaterThan(0);
      });

      it("should name the missing default export when config/stacks.ts exports only named bindings", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        await writeFile(path.join(sourceDir, STACKS_FILE_PATH), "export const stacks = {};\n");

        const result = await validateSource(sourceDir);

        const stacksErrors = result.issues.filter(
          (i) => i.file === STACKS_FILE_PATH && i.severity === "error",
        );
        expect(stacksErrors.map((i) => i.message)).toStrictEqual(["Config has no default export"]);
      });

      it("should report an empty config file as empty rather than as a missing default export", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        await writeFile(path.join(sourceDir, STACKS_FILE_PATH), "");

        const result = await validateSource(sourceDir);

        const stacksErrors = result.issues.filter(
          (i) => i.file === STACKS_FILE_PATH && i.severity === "error",
        );
        expect(stacksErrors.map((i) => i.message)).toStrictEqual(["Config is empty"]);
      });

      it("should keep naming the field the schema refused when a default export is present", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        // A default export the schema rejects: the message must name the field, not the export.
        await writeFile(path.join(sourceDir, SKILL_RULES_PATH), renderConfigTs({ version: 1 }));

        const result = await validateSource(sourceDir);

        const rulesErrors = result.issues.filter(
          (i) => i.file === SKILL_RULES_PATH && i.severity === "error",
        );
        expect(rulesErrors).toHaveLength(1);
        expect(rulesErrors[0]?.message).toContain("version");
        expect(rulesErrors[0]?.message).not.toContain("default export");
      });

      /**
       * A rule naming the author's own slug must not be answered with the catalogue's slug list.
       */
      it("should say why a rule may not name this marketplace's own skill, not list the catalogue", async () => {
        const configDir = path.join(sourceDir, "config");
        await mkdir(configDir, { recursive: true });
        await writeFile(
          path.join(sourceDir, SKILL_RULES_PATH),
          renderConfigTs({
            ...VALID_SKILL_RULES_FILE,
            relationships: {
              conflicts: [
                { skills: [MARKETPLACE_OWN_SLUG, OTHER_MARKETPLACE_OWN_SLUG], reason: "Both" },
              ],
              discourages: [],
              requires: [],
              alternatives: [],
            },
          }),
        );

        const result = await validateSource(sourceDir);

        const rulesErrors = result.issues.filter(
          (i) => i.file === SKILL_RULES_PATH && i.severity === "error",
        );
        expect(rulesErrors).toHaveLength(1);
        expect(rulesErrors[0]?.message, "the slug the author wrote must be named").toContain(
          MARKETPLACE_OWN_SLUG,
        );
        expect(rulesErrors[0]?.message, "the rule the slug broke must be stated").toContain(
          "public catalogue",
        );
        expect(
          result.issues.map((i) => i.message).join("\n"),
          "a catalogue of names the author did not write is not an answer to what they did",
        ).not.toContain(A_CATALOGUE_SLUG);
      });
    });

    /** `doctor` must not call a marketplace healthy when nothing can be installed from it. */
    describe("the name marketplace.json publishes under", () => {
      it("should be an error against the manifest when Claude Code would not register it", async () => {
        await writeMarketplaceManifest(sourceDir, MANIFEST_NAME_REFUSED);

        const result = await validateSource(sourceDir);

        const manifestErrors = result.issues.filter(
          (i) => i.file === MARKETPLACE_MANIFEST_PATH && i.severity === "error",
        );
        expect(manifestErrors).toHaveLength(1);
        expect(
          manifestErrors[0]?.message,
          "the refusal must state the rule, not the regex",
        ).toContain("kebab-case");
        expect(
          result.issues.map((i) => i.file),
          "no other file may be blamed for a defect written in the manifest",
        ).not.toContain(SKILL_CATEGORIES_PATH);
      });

      it("should raise nothing against a manifest whose name Claude Code accepts", async () => {
        await writeMarketplaceManifest(sourceDir, MANIFEST_NAME_ACCEPTED);

        const result = await validateSource(sourceDir);

        expect(result.issues.filter((i) => i.file === MARKETPLACE_MANIFEST_PATH)).toStrictEqual([]);
        expect(result.errorCount).toBe(0);
      });
    });

    /**
     * Filed against the manifest a reader opens; louder for a consumer, who cannot load it at all.
     */
    describe("whether marketplace.json is there and valid", () => {
      it.each(MANIFEST_DEFECTS)(
        "should be an error against the manifest for a consumer when it is %s",
        async (defect) => {
          await writeManifestDefect(sourceDir, defect);

          const result = await validateSource(sourceDir, "consumer");

          const manifestIssues = result.issues.filter((i) => i.file === MARKETPLACE_MANIFEST_PATH);
          expect(
            manifestIssues.map((i) => i.severity),
            "a marketplace a consumer cannot load is one error, against its manifest",
          ).toStrictEqual(["error"]);
          expect(
            firstElement(manifestIssues).message,
            "the finding must name the builds that write the file",
          ).toMatch(BUILDS_IN_ORDER);
          expect(
            result.issues.map((i) => i.file),
            "no other file may be blamed for a defect that is the manifest's",
          ).not.toContain(SKILL_CATEGORIES_PATH);
        },
      );

      it("should be a warning against the manifest for the author of a repository nobody has built", async () => {
        const result = await validateSource(sourceDir);

        expect(
          result.issues.filter((i) => i.file === MARKETPLACE_MANIFEST_PATH).map((i) => i.severity),
          "an author's unbuilt repository is one build from fixed, which is a warning",
        ).toStrictEqual(["warning"]);
      });
    });

    /** The load already says each health finding; filing them as rows must not say them again. */
    describe("under --verbose", () => {
      useFakeHome(() => tempDir);

      afterEach(() => {
        setVerbose(false);
        vi.restoreAllMocks();
      });

      it("skips tagging skills with their sources, which no finding reads, as --verbose shows", async () => {
        await writeMarketplaceManifest(sourceDir, MANIFEST_NAME_ACCEPTED);
        setVerbose(true);
        const said = vi.spyOn(console, "log").mockImplementation(() => {});

        await validateSource(sourceDir);

        expect(said).toHaveBeenCalledWith(`  Using local marketplace: ${sourceDir}`);
        expect(said).not.toHaveBeenCalledWith(expect.stringContaining("Tagged"));
      });
    });

    describe("a health finding", () => {
      const SAID_ONCE_CATEGORY = "web-styling";
      const FINDING = `Category '${SAID_ONCE_CATEGORY}' has no domain`;

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("is said once, and still filed as a finding", async () => {
        const { domain: _domain, ...categoryWithNoDomain } =
          VALID_SKILL_CATEGORIES_FILE.categories["web-framework"];
        await mkdir(path.join(sourceDir, "config"), { recursive: true });
        await writeFile(
          path.join(sourceDir, SKILL_CATEGORIES_PATH),
          renderConfigTs({
            ...VALID_SKILL_CATEGORIES_FILE,
            categories: {
              ...VALID_SKILL_CATEGORIES_FILE.categories,
              [SAID_ONCE_CATEGORY]: { ...categoryWithNoDomain, id: SAID_ONCE_CATEGORY },
            },
          }),
        );
        await writeMarketplaceManifest(sourceDir, MANIFEST_NAME_ACCEPTED);
        const said = vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await validateSource(sourceDir);

        expect(said.mock.calls).toStrictEqual([[expect.stringContaining(`[matrix] ${FINDING}`)]]);
        expect(
          result.issues.filter((issue) => issue.message.includes(FINDING)),
          "said once is not filed never: the row still carries it",
        ).toStrictEqual([
          {
            severity: "warning",
            file: SKILL_CATEGORIES_PATH,
            message: expect.stringContaining(FINDING),
          },
        ]);
      });
    });
  });
});

describe("validateSource findings, word for word", () => {
  const SKILL_ID = "web-framework-react";
  const SKILL_MD_PATH = path.join("src", STANDARD_DIRS.SKILLS, SKILL_ID, STANDARD_FILES.SKILL_MD);
  /** A source with no manifest also files that warning; it is not this describe's subject. */
  const NO_MANIFEST_WARNING = expect.objectContaining({
    severity: "warning",
    file: MARKETPLACE_MANIFEST_PATH,
  });

  let tempDir: string;
  let sourceDir: string;
  let skillDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("source-validator-findings-");
    sourceDir = path.join(tempDir, "source");
    skillDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS, SKILL_ID);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml(VALID_EMBEDDED_SKILL_METADATA_FILE),
    );
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("refuses a marketplace directory that does not exist with that one error", async () => {
    const missing = path.join(tempDir, "missing");

    expect(await validateSource(missing)).toStrictEqual({
      issues: [
        { severity: "error", file: missing, message: "Marketplace directory does not exist" },
      ],
      skillCount: 0,
      errorCount: 1,
      warningCount: 0,
    });
  });

  it("warns that it cannot check a directory name when SKILL.md's frontmatter does not parse", async () => {
    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderUnparseableSkillMd(SKILL_ID),
    );

    expect(await validateSource(sourceDir)).toStrictEqual({
      issues: [
        {
          severity: "warning",
          file: SKILL_MD_PATH,
          message:
            "Cannot verify directory name 'web-framework-react': missing or invalid SKILL.md frontmatter",
        },
        NO_MANIFEST_WARNING,
      ],
      skillCount: 1,
      errorCount: 0,
      warningCount: 2,
    });
  });

  it("warns that it cannot check a directory name when SKILL.md cannot be read, naming why", async () => {
    const skillMd = path.join(skillDir, STANDARD_FILES.SKILL_MD);
    await writeFile(skillMd, renderSkillMd(SKILL_ID));
    await chmod(skillMd, 0o000);

    try {
      expect((await validateSource(sourceDir)).issues).toStrictEqual([
        {
          severity: "warning",
          file: SKILL_MD_PATH,
          message: `Cannot verify directory name 'web-framework-react': EACCES: permission denied, open '${skillMd}'`,
        },
        NO_MANIFEST_WARNING,
      ]);
    } finally {
      await chmod(skillMd, 0o644);
    }
  });

  it("names a config file that fails to load by its relative path, then the loader's reason", async () => {
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(SKILL_ID));
    await mkdir(path.join(sourceDir, "config"), { recursive: true });
    await writeFile(path.join(sourceDir, STACKS_FILE_PATH), renderUnparseableConfigTs());

    const stacksErrors = (await validateSource(sourceDir)).issues.filter(
      (issue) => issue.file === STACKS_FILE_PATH,
    );

    expect(stacksErrors).toStrictEqual([
      {
        severity: "error",
        file: STACKS_FILE_PATH,
        message: expect.stringMatching(/^Failed to load config\/stacks\.ts: ParseError/),
      },
    ]);
  });
});

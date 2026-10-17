import path from "path";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { parse as parseYaml } from "yaml";

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { installedSkillTree } from "@workspace/compile/carried-skill";

import { registerExternalSkills, writeExternalSkills } from "./external-skills.js";
import { seedToInstallSelection } from "./seed-to-selection.js";
import { STANDARD_FILES } from "../../consts.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { parseFrontmatter } from "../loading/loader.js";
import { getCategoryDomain, initializeMatrix } from "../matrix/matrix-provider.js";
import { validateSkillMetadata } from "../schemas.js";
import { defaultUsageGuidance } from "../stacks/stacks-loader.js";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../__tests__/factories/seed-factories.js";
import { createMockSkill, sa } from "../__tests__/factories/skill-factories.js";
import {
  renderMetadataYaml,
  renderMetadataYamlWithUnreadableProvenance,
  renderSkillMd,
  renderUnparseableMetadataYaml,
} from "../__tests__/content-generators.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { FALLBACK_USAGE } from "../__tests__/mock-data/mock-skills.js";
import { SKILLS, TEST_CATEGORIES } from "../__tests__/test-fixtures.js";
import { cleanupTempDir, createTempDir, fileExists } from "../__tests__/test-fs-utils.js";

import type { LocalSkillMetadata } from "../skills/skill-metadata.js";
import type { MergedSkillsMatrix, SkillId, SkillSlug } from "../../types/index.js";
import type { SeedExternalSkill } from "@workspace/matrix/seed";

// Boundary cast: a carried skill's id is outside the generated union by construction.
const EXTERNAL_ID = "external-web-framework-brainstorming" as SkillId;
const SECOND_EXTERNAL_ID = "external-web-framework-worktrees" as SkillId;
const WEB_DEV = "web-developer";

const PINNED_TO_PROJECT = { scope: "project" } as const;

/** An ejected skill's metadata: `forkedFrom` has no `path`, as `copySkillTo` writes it. */
const EJECTED_SKILL_METADATA = renderMetadataYaml({
  author: "@acme",
  displayName: "Acme House Style",
  category: "web-framework",
  contentHash: "abc1234",
  forkedFrom: { skillId: SECOND_EXTERNAL_ID, contentHash: "abc1234", date: "2026-01-01" },
});

/** Fresh per spec: registration writes into the matrix it is given. */
function catalogueWithFrameworkCategory(): MergedSkillsMatrix {
  return createMockMatrix(SKILLS.react, {
    categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }),
  });
}

describe("registerExternalSkills", () => {
  let matrix: MergedSkillsMatrix;
  let projectDir: string;

  beforeEach(async () => {
    matrix = catalogueWithFrameworkCategory();
    initializeMatrix(matrix);
    projectDir = await createTempDir("cc-external-register-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("seats the payload's own catalogue entry under the category the sharer confirmed", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({ scope: "project", assignments: { [WEB_DEV]: "lazy" } }),
      },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
      agents: { [WEB_DEV]: PINNED_TO_PROJECT },
    });

    registerExternalSkills(payload, matrix, projectDir);

    expect(matrix.skills[EXTERNAL_ID]).toMatchObject({
      id: EXTERNAL_ID,
      slug: EXTERNAL_ID,
      displayName: "Brainstorming",
      description: "Structured brainstorming for hard problems",
      category: "web-framework",
      local: true,
      custom: true,
      localPath: path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID),
    });
  });

  it("seats an entry the decode that runs immediately after it can still read", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }) },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    registerExternalSkills(payload, matrix, projectDir);

    expect(() => seedToInstallSelection(payload, matrix)).not.toThrow();
  });

  it("returns the scope each entry names, so its bytes are written where its skill row says", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ scope: "global" }) },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    const installs = registerExternalSkills(payload, matrix, projectDir);

    expect(installs.map((install) => [install.id, install.scope])).toStrictEqual([
      [EXTERNAL_ID, "global"],
    ]);
  });

  it("leaves content no skill row selects out of the install", () => {
    const payload = buildSeedPayload({
      skills: {},
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    const installs = registerExternalSkills(payload, matrix, projectDir);

    expect(installs).toStrictEqual([]);
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });

  it("does not seat a skill whose category this catalogue does not declare", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill({ categoryId: "web-not-a-category-here" }),
      },
    });

    const installs = registerExternalSkills(payload, matrix, projectDir);

    expect(installs).toStrictEqual([]);
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });

  it("gives the seated skill the same reach a catalogue skill has", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({
          scope: "project",
          assignments: { [WEB_DEV]: "preloaded" },
        }),
      },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
      agents: { [WEB_DEV]: PINNED_TO_PROJECT },
    });

    registerExternalSkills(payload, matrix, projectDir);
    const { result, skippedSkillIds } = seedToInstallSelection(payload, matrix);

    expect(skippedSkillIds).toStrictEqual([]);
    expect(result.skills).toStrictEqual(buildSkillConfigs([EXTERNAL_ID]));
    expect(result.assignedStack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(EXTERNAL_ID, true)] },
    });
  });

  it("refuses a carried skill claiming an id the catalogue already owns, naming every one", () => {
    const catalogue = createMockMatrix(SKILLS.react, SKILLS.vue, {
      categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }),
    });
    initializeMatrix(catalogue);
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill(),
        [SKILLS.vue.id]: buildSeedSkill(),
      },
      external: {
        [SKILLS.react.id]: buildSeedExternalSkill(),
        [SKILLS.vue.id]: buildSeedExternalSkill(),
      },
    });

    expect(() => registerExternalSkills(payload, catalogue, projectDir)).toThrow(
      new RegExp(`${SKILLS.react.id}[\\s\\S]*${SKILLS.vue.id}`),
    );
    // Both incumbents survive, so the guard ran before anything was seated.
    expect([catalogue.skills[SKILLS.react.id], catalogue.skills[SKILLS.vue.id]]).toStrictEqual([
      SKILLS.react,
      SKILLS.vue,
    ]);
  });

  it("refuses a carried skill claiming a shipped catalogue id the loaded matrix does not carry", () => {
    // The payload chooses which catalogue loads, so the shipped one is checked too.
    const otherMarketplace = createMockMatrix(SKILLS.vue, {
      categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }),
    });
    initializeMatrix(otherMarketplace);
    const payload = buildSeedPayload({
      skills: { [SKILLS.react.id]: buildSeedSkill() },
      external: { [SKILLS.react.id]: buildSeedExternalSkill() },
    });

    // Not seated here, or the refusal would be the loaded-matrix arm's.
    expect(
      otherMarketplace.skills[SKILLS.react.id],
      "the matrix the payload steered must not carry the impersonated id",
    ).toBeUndefined();
    expect(() => registerExternalSkills(payload, otherMarketplace, projectDir)).toThrow(
      SKILLS.react.id,
    );
    expect(otherMarketplace.skills[SKILLS.react.id]).toBeUndefined();
  });

  it("seats a carried skill over this installation's own copy, so re-applying is not a collision", () => {
    // A second `edit --from` apply finds its own earlier copy seated and `local`.
    // Boundary cast below: a carried skill's slug is its id, as `externalSlug` makes it.
    const carried = buildSeedExternalSkill();
    const withOwnCopy = createMockMatrix(
      createMockSkill(EXTERNAL_ID, {
        category: "web-framework",
        slug: EXTERNAL_ID as SkillSlug,
        local: true,
        custom: true,
      }),
      { categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }) },
    );
    initializeMatrix(withOwnCopy);
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: { [EXTERNAL_ID]: carried },
    });

    expect(registerExternalSkills(payload, withOwnCopy, projectDir).map(({ id }) => id)) //
      .toStrictEqual([EXTERNAL_ID]);
    expect(withOwnCopy.skills[EXTERNAL_ID]).toMatchObject({
      displayName: carried.displayName,
      description: carried.description,
    });
  });

  it("refuses to install an added skill as a plugin, naming every one", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({ install: "plugin" }),
        [SECOND_EXTERNAL_ID]: buildSeedSkill({ install: "plugin" }),
      },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill(),
        [SECOND_EXTERNAL_ID]: buildSeedExternalSkill(),
      },
    });

    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      new RegExp(`${EXTERNAL_ID}[\\s\\S]*${SECOND_EXTERNAL_ID}`),
    );
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });
});

describe("writeExternalSkills", () => {
  let matrix: MergedSkillsMatrix;
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    matrix = catalogueWithFrameworkCategory();
    initializeMatrix(matrix);
    tempDir = await createTempDir("cc-external-write-");
    projectDir = path.join(tempDir, "project");
    // Global scope resolves through $HOME; unstubbed, it would write into the real ~/.claude.
    vi.stubEnv("HOME", tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function install(
    external: SeedExternalSkill,
    scope: "project" | "global",
  ): Promise<string> {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ scope }) },
      external: { [EXTERNAL_ID]: external },
    });
    await writeExternalSkills(registerExternalSkills(payload, matrix, projectDir));
    return path.join(resolveInstallPaths(projectDir, scope).skillsDir, EXTERNAL_ID);
  }

  async function standingSkillDir(id: SkillId, metadata: string | null): Promise<string> {
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, id);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(id));
    if (metadata !== null) {
      await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), metadata);
    }
    return skillDir;
  }

  it("writes the whole directory it was given, nesting and all", async () => {
    const skillDir = await install(
      buildSeedExternalSkill({
        files: {
          "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
          "reference/api.md": "# API\n",
        },
      }),
      "project",
    );

    expect(await readFile(path.join(skillDir, "reference/api.md"), "utf8")).toBe("# API\n");
    expect(await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8")).toContain(
      "Structured brainstorming",
    );
  });

  it("writes a global-scoped skill into the user's own skills directory", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "global");

    expect(skillDir).toBe(path.join(tempDir, ".claude", "skills", EXTERNAL_ID));
    expect(await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8")).toContain(
      EXTERNAL_ID,
    );
  });

  it("names the skill by the id it installs under, so a sub-agent's reference resolves", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // Loaders read the id off frontmatter `name`, so it must be the minted id.
    const frontmatter = parseFrontmatter(
      await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8"),
    );
    expect(frontmatter?.name).toBe(EXTERNAL_ID);
    expect(frontmatter?.description).toBe("Structured brainstorming");
  });

  it("registers the skill on disk as well as in memory, under the same taxonomy", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata).toMatchObject({
      displayName: "Brainstorming",
      slug: EXTERNAL_ID,
      category: "web-framework",
      domain: "web",
      custom: true,
    });
  });

  it("writes a metadata.yaml this installation's own validator accepts", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    // `doctor` validates this file, so defaults are written rather than left out.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );

    const validated = validateSkillMetadata(metadata);
    expect(validated.success ? [] : validated.error.issues.map((issue) => issue.path.join("."))) //
      .toStrictEqual([]);
  });

  it("keeps what the repository shipped where the payload has nothing to say", async () => {
    const shipped = "Use when a decision has more than one defensible answer";
    const skillDir = await install(
      buildSeedExternalSkill({
        files: {
          "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME),
          "metadata.yaml": `usageGuidance: "${shipped}"\nauthor: "@jesse"\n`,
        },
      }),
      "project",
    );

    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata).toMatchObject({ usageGuidance: shipped, author: "@jesse" });
  });

  it("stamps the provenance that says this directory is the CLI's copy, not the user's own", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata.forkedFrom).toMatchObject({
      skillId: EXTERNAL_ID,
      source: "github:obra/superpowers",
      path: "skills/brainstorming",
    });
  });

  it("states when to reach for the skill in the same sentence the stack loader falls back to", async () => {
    const skillDir = await install(
      buildSeedExternalSkill({ categoryId: "web-framework" }),
      "project",
    );

    // `FALLBACK_USAGE` mirrors the product's wording rather than importing it.
    const metadata: LocalSkillMetadata = parseYaml(
      await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8"),
    );
    expect(metadata.usageGuidance).toBe(FALLBACK_USAGE["web-framework"]);
  });

  it("refuses to write over a skill directory no shared configuration carried, naming every one", async () => {
    const handAuthored = await standingSkillDir(EXTERNAL_ID, null);
    const ejected = await standingSkillDir(SECOND_EXTERNAL_ID, EJECTED_SKILL_METADATA);
    // Project scope on both, matching the standing directories.
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill({ scope: "project" }),
        [SECOND_EXTERNAL_ID]: buildSeedSkill({ scope: "project" }),
      },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill(),
        [SECOND_EXTERNAL_ID]: buildSeedExternalSkill(),
      },
    });

    await expect(writeExternalSkills(registerExternalSkills(payload, matrix, projectDir))) //
      .rejects.toThrow(new RegExp(`${EXTERNAL_ID}[\\s\\S]*${SECOND_EXTERNAL_ID}`));

    expect(await readFile(path.join(handAuthored, STANDARD_FILES.SKILL_MD), "utf8")).toBe(
      renderSkillMd(EXTERNAL_ID),
    );
    expect(await fileExists(path.join(handAuthored, STANDARD_FILES.METADATA_YAML))).toBe(false);
    expect(await readFile(path.join(ejected, STANDARD_FILES.METADATA_YAML), "utf8")).toBe(
      EJECTED_SKILL_METADATA,
    );
  });

  it("writes over the directory a previous apply carried, so re-applying is not a refusal", async () => {
    const skillDir = await install(buildSeedExternalSkill(), "project");

    await install(
      buildSeedExternalSkill({
        files: { "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Revised upstream") },
      }),
      "project",
    );

    expect(await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf8")).toContain(
      "Revised upstream",
    );
  });

  it("answers with a re-written skill only where what a load reads of it changed", async () => {
    const write = (external: SeedExternalSkill) =>
      writeExternalSkills(
        registerExternalSkills(
          buildSeedPayload({
            skills: { [EXTERNAL_ID]: buildSeedSkill({ scope: "project" }) },
            external: { [EXTERNAL_ID]: external },
          }),
          matrix,
          projectDir,
        ),
      );
    vi.useFakeTimers({ toFake: ["Date"] });
    onTestFinished(() => {
      vi.useRealTimers();
    });

    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const first = await write(buildSeedExternalSkill());
    // A later write moves the stamp's date and position; neither is something a load reads.
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const same = await write(buildSeedExternalSkill());
    const revised = await write(
      buildSeedExternalSkill({
        files: { "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Revised upstream") },
      }),
    );

    expect(first).toStrictEqual([EXTERNAL_ID]);
    expect(same).toStrictEqual([]);
    expect(revised).toStrictEqual([EXTERNAL_ID]);
  });

  it("refuses a file path that escapes the skill's own directory", async () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill({
          files: {
            "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME),
            "../../../escaped.md": "owned",
          },
        }),
      },
    });
    const installs = registerExternalSkills(payload, matrix, projectDir);

    await expect(writeExternalSkills(installs)).rejects.toThrow("escaped.md");
  });

  /** Holds the editor's `installedSkillTree` preview byte-for-byte against a real install. */
  describe("the directory the output preview draws for it", () => {
    const INSTALL_DAY = "2026-10-01";
    const SHIPPED_FIELDS = {
      author: "@jesse",
      category: "web-framework",
      contentHash: "abc1234",
      usageGuidance: "Use when a decision has more than one defensible answer",
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(`${INSTALL_DAY}T12:00:00Z`));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const SHIPPED_CASES = [
      { shipping: "no metadata.yaml", metadata: undefined },
      { shipping: "a metadata.yaml of its own", metadata: renderMetadataYaml(SHIPPED_FIELDS) },
      { shipping: "a metadata.yaml with provenance of its own", metadata: EJECTED_SKILL_METADATA },
      { shipping: "a metadata.yaml no parser can read", metadata: renderUnparseableMetadataYaml() },
      {
        shipping: "a metadata.yaml whose provenance the schema refuses",
        metadata: renderMetadataYamlWithUnreadableProvenance(SHIPPED_FIELDS),
      },
    ] as const;

    for (const { shipping, metadata } of SHIPPED_CASES) {
      it(`is the directory the install writes, for a skill shipping ${shipping}`, async () => {
        const external = buildSeedExternalSkill({
          files: {
            "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
            "visual-companion.md": "# Visual companion\n",
            ...(metadata !== undefined && { "metadata.yaml": metadata }),
          },
        });
        const domain = getCategoryDomain(external.categoryId);
        if (domain === undefined) {
          throw new Error(`the test catalogue places ${external.categoryId} in no domain`);
        }

        const skillDir = await install(external, "project");
        const drawn = await installedSkillTree({
          id: EXTERNAL_ID,
          skill: external,
          domain,
          usageGuidance: defaultUsageGuidance(external.categoryId),
          date: INSTALL_DAY,
        });
        const written = Object.fromEntries(
          await Promise.all(
            Object.keys(drawn).map(
              async (file) => [file, await readFile(path.join(skillDir, file), "utf8")] as const,
            ),
          ),
        );

        expect((await readdir(skillDir)).sort()).toStrictEqual(Object.keys(drawn).sort());
        expect(written).toStrictEqual(drawn);
      });
    }
  });
});

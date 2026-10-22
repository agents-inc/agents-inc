import os from "os";
import path from "path";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { parse as parseYaml } from "yaml";

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { installedSkillTree } from "@workspace/compile/carried-skill";

import {
  carriedSkillsThatDiffer,
  readCarriedSkills,
  registerExternalSkills,
  writeExternalSkills,
} from "./external-skills.js";
import { readForkedFromMetadata } from "../skills/skill-metadata.js";
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

/** Payload keys a hostile link can carry: one climbs out of the skills folder, one nests in it. */
const PARENT_ESCAPING_ID = "../victim";
const NESTED_ID = "house/react";
/** Sets the window title, which a terminal does wherever the directory is named. */
const TERMINAL_CONTROL_ID = "external-x\u001b]0;PWNED\u0007";

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

  it("refuses a carried skill whose id names no single directory, naming every one, before seating any", () => {
    const payload = buildSeedPayload({
      skills: {
        [EXTERNAL_ID]: buildSeedSkill(),
        [PARENT_ESCAPING_ID]: buildSeedSkill(),
        [NESTED_ID]: buildSeedSkill(),
      },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill(),
        [PARENT_ESCAPING_ID]: buildSeedExternalSkill(),
        [NESTED_ID]: buildSeedExternalSkill(),
      },
    });

    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      new RegExp(`${JSON.stringify(PARENT_ESCAPING_ID)}[\\s\\S]*${JSON.stringify(NESTED_ID)}`),
    );
    // The well-named one is refused with them, so nothing reaches the decode.
    expect(matrix.skills[EXTERNAL_ID]).toBeUndefined();
  });

  it("refuses a carried skill whose id holds a terminal control, naming it with the control spelled out", () => {
    const payload = buildSeedPayload({
      skills: { [TERMINAL_CONTROL_ID]: buildSeedSkill() },
      external: { [TERMINAL_CONTROL_ID]: buildSeedExternalSkill() },
    });

    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      `  "external-x\\u001b]0;PWNED\\u0007"\n`,
    );
    expect(matrix.skills).not.toHaveProperty([TERMINAL_CONTROL_ID]);
  });

  it("refuses such an id where no skill row selects it, as minting a link refuses it", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: {
        [EXTERNAL_ID]: buildSeedExternalSkill(),
        [PARENT_ESCAPING_ID]: buildSeedExternalSkill(),
      },
    });

    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      JSON.stringify(PARENT_ESCAPING_ID),
    );
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
    // A day later, so a write that moved the stamp's date would show.
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

  /** A file's bytes and when they were written, so a rewrite of identical bytes shows too. */
  async function asWritten(file: string) {
    return { content: await readFile(file, "utf8"), modifiedAtMs: (await stat(file)).mtimeMs };
  }

  /** The two files a default carried skill installs as. */
  async function manifestAndMetadata(skillDir: string) {
    return {
      manifest: await asWritten(path.join(skillDir, STANDARD_FILES.SKILL_MD)),
      metadata: await asWritten(path.join(skillDir, STANDARD_FILES.METADATA_YAML)),
    };
  }

  describe("a carried skill written again", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("touches no file, and keeps the date its stamp records, when nothing about it changed", async () => {
      const skillDir = await install(buildSeedExternalSkill(), "project");
      expect((await readdir(skillDir)).sort()).toStrictEqual(
        [STANDARD_FILES.SKILL_MD, STANDARD_FILES.METADATA_YAML].sort(),
      );
      const before = await manifestAndMetadata(skillDir);
      vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));

      await install(buildSeedExternalSkill(), "project");

      expect(await manifestAndMetadata(skillDir)).toStrictEqual(before);
      expect((await readForkedFromMetadata(skillDir))?.date).toBe("2026-10-01");
    });

    it("writes its metadata in the order of the first write when the share it came back in carries the installed copy", async () => {
      // As its SKILL.md describes it, which is the description a share reads back.
      const skillDir = await install(
        buildSeedExternalSkill({ description: "Structured brainstorming" }),
        "project",
      );
      const firstWrite = await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8");
      const provenance = await readForkedFromMetadata(skillDir);
      if (provenance === null) throw new Error(`no provenance written into ${skillDir}`);
      const shared = await readCarriedSkills([{ id: EXTERNAL_ID, skillDir, provenance }]);
      const reshared = shared.external[EXTERNAL_ID];
      if (reshared === undefined) throw new Error(`${EXTERNAL_ID} did not read back as shareable`);
      vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));

      await install(reshared, "project");

      expect(await readFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), "utf8")).toBe(
        firstWrite,
      );
    });

    it("rewrites only the file whose content changed, and dates the stamp anew", async () => {
      const skillDir = await install(buildSeedExternalSkill(), "project");
      const before = await manifestAndMetadata(skillDir);
      vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));

      await install(
        buildSeedExternalSkill({
          files: { "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Revised upstream") },
        }),
        "project",
      );

      const after = await manifestAndMetadata(skillDir);
      expect(after.manifest.content).toContain("Revised upstream");
      expect(after.metadata.content).not.toBe(before.metadata.content);
      expect((await readForkedFromMetadata(skillDir))?.date).toBe("2026-10-02");
    });
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

/** The words each refusal is in, the seat a carried skill takes, and the reads its share does. */
describe("carried skills — refusals, seats and reads", () => {
  let matrix: MergedSkillsMatrix;
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    matrix = catalogueWithFrameworkCategory();
    initializeMatrix(matrix);
    tempDir = await createTempDir("cc-external-carried-");
    projectDir = path.join(tempDir, "project");
    vi.stubEnv("HOME", tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await cleanupTempDir(tempDir);
  });

  function installsFor(external: SeedExternalSkill) {
    return registerExternalSkills(
      buildSeedPayload({
        skills: { [EXTERNAL_ID]: buildSeedSkill({ scope: "project" }) },
        external: { [EXTERNAL_ID]: external },
      }),
      matrix,
      projectDir,
    );
  }

  async function ownedDirOf(skillDir: string) {
    const provenance = await readForkedFromMetadata(skillDir);
    if (provenance === null) throw new Error(`no provenance written into ${skillDir}`);
    return { id: EXTERNAL_ID, skillDir, provenance };
  }

  it("refuses carried skills asked for as plugins in these words", () => {
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill({ install: "plugin" }) },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      new Error(
        [
          "This configuration cannot be installed: these skills travel inside it, so no marketplace serves them and they cannot be installed as plugins:",
          `  ${EXTERNAL_ID}`,
          "Re-share it with each skill above set to eject, which is the only way a carried skill installs.",
        ].join("\n"),
      ),
    );
  });

  it("refuses an id the loaded catalogue holds even when no shipped catalogue does, in these words", () => {
    const holding = createMockMatrix(
      createMockSkill(EXTERNAL_ID, { category: "web-framework", slug: EXTERNAL_ID as SkillSlug }),
      { categories: buildCategoryMap({ "web-framework": TEST_CATEGORIES.framework }) },
    );
    initializeMatrix(holding);
    const payload = buildSeedPayload({
      skills: { [EXTERNAL_ID]: buildSeedSkill() },
      external: { [EXTERNAL_ID]: buildSeedExternalSkill() },
    });

    expect(() => registerExternalSkills(payload, holding, projectDir)).toThrow(
      new Error(
        [
          "This configuration cannot be installed: these skills travel inside it under ids a catalogue already owns:",
          `  ${EXTERNAL_ID}`,
          "A skill id is the directory the skill installs into, so each would be written over the catalogue's own copy of that skill. Re-share it with each skill above added again, which mints an id — 'external-<category>-<name>' — that no catalogue owns.",
        ].join("\n"),
      ),
    );
  });

  it("refuses an id naming no single directory in these words", () => {
    const payload = buildSeedPayload({
      skills: { [PARENT_ESCAPING_ID]: buildSeedSkill() },
      external: { [PARENT_ESCAPING_ID]: buildSeedExternalSkill() },
    });

    expect(() => registerExternalSkills(payload, matrix, projectDir)).toThrow(
      new Error(
        [
          "This configuration cannot be installed: these skills travel inside it under ids that are not a single directory name:",
          '  "../victim"',
          "A skill id is the directory the skill is written into, so an id holding a path separator, or naming '.' or '..', would be written somewhere other than a directory of its own, and one holding a control character would hand it to the terminal wherever that directory is named. Re-share it with each skill above added again, which mints an id — 'external-<category>-<name>' — that names one directory.",
        ].join("\n"),
      ),
    );
  });

  it("seats a carried skill under the skills folder and reachable by its own id as slug", () => {
    installsFor(buildSeedExternalSkill());

    expect(matrix.skills[EXTERNAL_ID]?.path).toBe(`.claude/skills/${EXTERNAL_ID}/`);
    expect(matrix.slugMap.slugToId[EXTERNAL_ID as SkillSlug]).toBe(EXTERNAL_ID);
  });

  it("refuses a destination no shared configuration carried, naming it and its directory", async () => {
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(EXTERNAL_ID));

    await expect(writeExternalSkills(installsFor(buildSeedExternalSkill()))).rejects.toThrow(
      new Error(
        [
          "This configuration cannot be installed: these skills travel inside it under ids this installation already keeps a skill directory for, and no shared configuration put those directories there:",
          `  ${EXTERNAL_ID}  ->  ${skillDir}`,
          "A skill id is the directory the skill installs into, so each would be written over a skill written here by hand or ejected from a marketplace. Move or rename the directory above, or re-share the configuration with each skill added again, which mints an id — 'external-<category>-<name>' — that nothing here holds.",
        ].join("\n"),
      ),
    );
  });

  it("answers a changed skill when only its metadata moved", async () => {
    await writeExternalSkills(installsFor(buildSeedExternalSkill()));

    expect(
      await writeExternalSkills(installsFor(buildSeedExternalSkill({ displayName: "Renamed" }))),
    ).toStrictEqual([EXTERNAL_ID]);
  });

  it("answers what a write would change without writing it, and leaves no scratch behind", async () => {
    vi.spyOn(os, "tmpdir").mockReturnValue(tempDir);
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID);

    const before = await carriedSkillsThatDiffer(installsFor(buildSeedExternalSkill()));
    expect(await fileExists(skillDir)).toBe(false);

    await writeExternalSkills(installsFor(buildSeedExternalSkill()));
    const after = await carriedSkillsThatDiffer(installsFor(buildSeedExternalSkill()));

    expect({ before, after }).toStrictEqual({ before: [EXTERNAL_ID], after: [] });
    expect(
      (await readdir(tempDir)).filter((entry) => entry.startsWith("agents-inc-carried-")),
    ).toStrictEqual([]);
  });

  it("answers nothing for no carried skills", async () => {
    expect(await carriedSkillsThatDiffer([])).toStrictEqual([]);
  });

  it("makes no scratch folder for no carried skills, so a temp folder it cannot use costs nothing", async () => {
    vi.spyOn(os, "tmpdir").mockReturnValue(path.join(tempDir, "no-such-temp-folder"));

    expect(await carriedSkillsThatDiffer([])).toStrictEqual([]);
  });

  it("reads an installed carried skill back whole, dotfiles included", async () => {
    const files = {
      "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
      ".prettierrc": "{}\n",
    };
    await writeExternalSkills(installsFor(buildSeedExternalSkill({ files })));
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID);

    const reading = await readCarriedSkills([await ownedDirOf(skillDir)]);

    expect(reading.uncarryable).toStrictEqual([]);
    expect(Object.keys(reading.external[EXTERNAL_ID]?.files ?? {}).sort()).toStrictEqual(
      [".prettierrc", STANDARD_FILES.METADATA_YAML, STANDARD_FILES.SKILL_MD].sort(),
    );
  });

  it("names a carried skill whose SKILL.md gives no description as unshareable", async () => {
    await writeExternalSkills(installsFor(buildSeedExternalSkill()));
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID);
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "# No frontmatter here\n");

    const reading = await readCarriedSkills([await ownedDirOf(skillDir)]);

    expect(reading).toStrictEqual({
      external: {},
      uncarryable: [
        `${EXTERNAL_ID} travels inside a shared configuration, and no description can be read from its SKILL.md`,
      ],
    });
  });

  it("names every reason a carried skill's entry would be refused, semicolon-separated", async () => {
    await writeExternalSkills(installsFor(buildSeedExternalSkill()));
    const skillDir = path.join(resolveInstallPaths(projectDir, "project").skillsDir, EXTERNAL_ID);
    const owned = await ownedDirOf(skillDir);

    const reading = await readCarriedSkills([
      { ...owned, provenance: { ...owned.provenance, source: "github:", path: "" } },
    ]);

    expect(reading.uncarryable).toStrictEqual([
      `${EXTERNAL_ID} travels inside a shared configuration, and Too small: expected string to have >=1 characters; Too small: expected string to have >=1 characters`,
    ]);
  });
});

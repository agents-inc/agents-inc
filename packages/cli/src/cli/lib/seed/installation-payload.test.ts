import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

import { MAX_EXTERNAL_SKILL_BYTES, SEED_VERSION } from "@workspace/matrix/seed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedPayloadForInstallation } from "./installation-payload.js";
import { registerExternalSkills, writeExternalSkills } from "./external-skills.js";
import {
  CLAUDE_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { initializeMatrix } from "../matrix/matrix-provider.js";
import { injectForkedFromMetadata } from "../skills/skill-metadata.js";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../__tests__/factories/seed-factories.js";
import { sa } from "../__tests__/factories/skill-factories.js";
import { renderMetadataYaml, renderSkillMd } from "../__tests__/content-generators.js";
import { buildSkillConfig } from "../__tests__/helpers/skill-config-builders.js";
import { SKILLS, TEST_CATEGORIES } from "../__tests__/test-fixtures.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { ERROR_MESSAGES } from "../../utils/messages.js";

import type { SkillConfig, SkillId, SkillScope } from "../../types/index.js";
import type { FixtureProjectConfig } from "../__tests__/helpers/skill-config-builders.js";
import type { SeedExternalSkill } from "@workspace/matrix/seed";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";

const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";
const PRIVATE_MARKETPLACE = "acme-internal";
const HAND_AUTHORED_ID = "web-framework-house-style";

describe("seedPayloadForInstallation", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-installation-payload-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    // The loader falls back to $HOME, so stub it to keep the developer's own install out.
    vi.stubEnv("HOME", tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function installConfig(overrides: Partial<FixtureProjectConfig>): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(overrides));
  }

  /** Widened to the fixture shape: one spec names a user-authored id outside the union. */
  function installedOverrides(
    overrides?: Partial<FixtureProjectConfig>,
  ): Partial<FixtureProjectConfig> {
    return {
      skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: EJECT_SOURCE })],
      agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
      ...overrides,
    };
  }

  it("maps the installation this directory records onto the wire contract", async () => {
    await installConfig(installedOverrides());

    const prepared = await seedPayloadForInstallation(projectDir);

    expect(prepared.ok).toBe(true);
    expect(prepared.ok && prepared.payload).toStrictEqual({
      v: SEED_VERSION,
      matrixVersion: expect.any(String) as string,
      stackId: null,
      skills: {
        [REACT_ID]: { install: "eject", scope: "global", assignments: { [WEB_DEV]: "lazy" } },
      },
      agents: { [WEB_DEV]: { on: true, scope: "global" } },
    });
    expect(prepared.ok && prepared.skills).toBe(1);
    expect(prepared.ok && prepared.agents).toBe(1);
  });

  it("reports a directory with nothing installed rather than throwing", async () => {
    const prepared = await seedPayloadForInstallation(projectDir);

    expect(prepared.ok).toBe(false);
    expect(prepared.ok ? "" : prepared.error).toContain(ERROR_MESSAGES.NO_INSTALLATION);
  });

  it("reports a configuration whose every entry is a tombstone as nothing to carry", async () => {
    await installConfig({
      skills: [
        buildSkillConfig(REACT_ID, { scope: "global", origin: EJECT_SOURCE, excluded: true }),
      ],
      agents: buildAgentConfigs([WEB_DEV], { scope: "global", excluded: true }),
    });

    const prepared = await seedPayloadForInstallation(projectDir);

    expect(prepared.ok).toBe(false);
    expect(prepared.ok ? "" : prepared.error).toContain(ERROR_MESSAGES.NO_INSTALLATION);
  });

  describe("the curation a project inherits from HOME", () => {
    const WEB_TESTER = "web-tester";
    const ZUSTAND_ID = SKILLS.zustand.id;
    const ZUSTAND_CATEGORY = SKILLS.zustand.category;

    async function installGlobalConfig(overrides: Partial<FixtureProjectConfig>): Promise<void> {
      await writeTestTsConfig(tempDir, buildProjectConfig(overrides));
    }

    function publicSkill(id: SkillId, scope: SkillScope): SkillConfig {
      return buildSkillConfig(id, { scope, origin: DEFAULT_PUBLIC_SOURCE_NAME });
    }

    it("carries a global sub-agent's row, which only HOME's config records", async () => {
      const globalEntries = {
        skills: [publicSkill(REACT_ID, "global")],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      };
      await installGlobalConfig({
        ...globalEntries,
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID, true)] } },
      });
      await installConfig(globalEntries);

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && prepared.payload.skills).toStrictEqual({
        [REACT_ID]: { install: "plugin", scope: "global", assignments: { [WEB_DEV]: "preloaded" } },
      });
    });

    it("leaves HOME's row for a skill the project masks with its own half, and still mints", async () => {
      // [P][G] pair: the global React masked by a tombstone, the project's own React beside it.
      await installGlobalConfig({
        skills: [publicSkill(REACT_ID, "global"), publicSkill(ZUSTAND_ID, "global")],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: {
          [WEB_DEV]: {
            [REACT_CATEGORY]: [sa(REACT_ID, true)],
            [ZUSTAND_CATEGORY]: [sa(ZUSTAND_ID, true)],
          },
        },
      });
      await installConfig({
        skills: [
          publicSkill(ZUSTAND_ID, "global"),
          { ...publicSkill(REACT_ID, "global"), excluded: true },
          publicSkill(REACT_ID, "project"),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      });

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && prepared.payload.skills).toStrictEqual({
        [ZUSTAND_ID]: {
          install: "plugin",
          scope: "global",
          assignments: { [WEB_DEV]: "preloaded" },
        },
        [REACT_ID]: { install: "plugin", scope: "project", assignments: {} },
      });
    });

    it("keeps HOME's row off a sub-agent the project masks with a half of its own", async () => {
      // [P][G] pair: the global web-developer masked by a tombstone; web-tester is the control.
      await installGlobalConfig({
        skills: [publicSkill(REACT_ID, "global")],
        agents: buildAgentConfigs([WEB_DEV, WEB_TESTER], { scope: "global" }),
        stack: {
          [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID, true)] },
          [WEB_TESTER]: { [REACT_CATEGORY]: [sa(REACT_ID)] },
        },
      });
      await installConfig({
        skills: [publicSkill(REACT_ID, "global")],
        agents: [
          ...buildAgentConfigs([WEB_TESTER], { scope: "global" }),
          ...buildAgentConfigs([WEB_DEV], { scope: "global", excluded: true }),
          ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
        ],
      });

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && prepared.payload.skills).toStrictEqual({
        [REACT_ID]: { install: "plugin", scope: "global", assignments: { [WEB_TESTER]: "lazy" } },
      });
    });

    it("takes a global sub-agent's row from HOME's config, which is the one that compiles it", async () => {
      // A hand-written row for a global sub-agent in the project's file; it loads nothing here.
      const globalEntries = {
        skills: [publicSkill(REACT_ID, "global")],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      };
      await installGlobalConfig({
        ...globalEntries,
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID, true)] } },
      });
      await installConfig({
        ...globalEntries,
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
      });

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && prepared.payload.skills[REACT_ID]?.assignments).toStrictEqual({
        [WEB_DEV]: "preloaded",
      });
    });

    it("inherits from its own provider's global config, never from another provider's", async () => {
      // Two providers' global configs; a Codex project inherits only from Codex's.
      const globalEntries = {
        skills: [publicSkill(REACT_ID, "global")],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      };
      await installGlobalConfig({
        ...globalEntries,
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID, true)] } },
      });
      await writeTestTsConfig(
        tempDir,
        buildProjectConfig({
          ...globalEntries,
          stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
        }),
        sourceFolderInUse(tempDir, "codex").relName,
      );
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig(globalEntries),
        sourceFolderInUse(projectDir, "codex").relName,
      );

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && prepared.payload.skills[REACT_ID]?.assignments).toStrictEqual({
        [WEB_DEV]: "lazy",
      });
    });
  });

  describe("what the round trip owns", () => {
    async function writeHandAuthoredSkill(skillId: string): Promise<void> {
      const skillDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(skillId));
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({ category: REACT_CATEGORY, slug: "house-style", contentHash: "aaa" }),
      );
    }

    async function writeEjectedSkill(skillId: SkillId): Promise<void> {
      await writeHandAuthoredSkill(skillId);
      await injectForkedFromMetadata(
        path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId),
        skillId,
        "abc1234",
      );
    }

    it("leaves a hand-authored skill out of the payload, and its assignments with it", async () => {
      await writeHandAuthoredSkill(HAND_AUTHORED_ID);
      await installConfig(
        installedOverrides({
          skills: [
            buildSkillConfig(REACT_ID, { origin: EJECT_SOURCE }),
            buildSkillConfig(HAND_AUTHORED_ID, { origin: EJECT_SOURCE }),
          ],
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
          stack: {
            [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID), sa(HAND_AUTHORED_ID)] },
          },
        }),
      );
      await writeEjectedSkill(REACT_ID);

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok).toBe(true);
      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([REACT_ID]);
      expect(prepared.ok && prepared.payload.skills[REACT_ID]?.assignments).toStrictEqual({
        [WEB_DEV]: "lazy",
      });
      expect(prepared.ok && prepared.skills).toBe(1);
    });

    it("carries a plugin skill without asking the disk about it", async () => {
      await installConfig(
        installedOverrides({
          skills: [buildSkillConfig(REACT_ID, { origin: DEFAULT_PUBLIC_SOURCE_NAME })],
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
          stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
        }),
      );

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([REACT_ID]);
      expect(prepared.ok && prepared.payload.skills[REACT_ID]?.install).toBe("plugin");
    });
  });

  describe("what the round trip carries", () => {
    const CARRIED_ID = "external-web-framework-brainstorming";
    const CARRIED_REPO = "obra/superpowers";
    const CARRIED_PATH = "skills/brainstorming";
    const CARRIED_CATEGORY = "web-framework";
    /** Longer than `doctor`'s label limit, so the install writes a shortened `cliDescription`. */
    const LONG_DESCRIPTION =
      "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes";
    const EDITED_DESCRIPTION = "Use when a fix has failed twice and the cause is still unknown";

    function carriedSkillDir(): string {
      return path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, CARRIED_ID);
    }

    /** Installs one added skill exactly as `init --from` does. */
    async function installCarriedSkill(
      overrides?: Partial<SeedExternalSkill>,
    ): Promise<SeedExternalSkill> {
      const matrix = createMockMatrix(SKILLS.react, {
        categories: buildCategoryMap({ [CARRIED_CATEGORY]: TEST_CATEGORIES.framework }),
      });
      initializeMatrix(matrix);

      const external = buildSeedExternalSkill({
        categoryId: CARRIED_CATEGORY,
        repo: CARRIED_REPO,
        path: CARRIED_PATH,
        ...overrides,
      });
      const payload = buildSeedPayload({
        skills: { [CARRIED_ID]: buildSeedSkill({ scope: "project" }) },
        external: { [CARRIED_ID]: external },
      });

      await writeExternalSkills(registerExternalSkills(payload, matrix, projectDir));
      return external;
    }

    async function installCarriedConfig(): Promise<void> {
      await installConfig({
        skills: [buildSkillConfig(CARRIED_ID, { scope: "project", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { [CARRIED_CATEGORY]: [sa(CARRIED_ID)] } },
      });
    }

    it("carries an added skill's own bytes back, rebuilt from the directory the install wrote", async () => {
      const external = await installCarriedSkill({
        description: "Structured brainstorming",
        files: {
          [STANDARD_FILES.SKILL_MD]: renderSkillMd("brainstorming", "Structured brainstorming"),
        },
      });
      await installCarriedConfig();

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok).toBe(true);
      expect(prepared.ok && prepared.payload.external?.[CARRIED_ID]).toMatchObject({
        displayName: external.displayName,
        description: external.description,
        categoryId: CARRIED_CATEGORY,
        repo: CARRIED_REPO,
        path: CARRIED_PATH,
      });
      // The manifest was renamed to the recorded id, so the bytes carried are the on-disk ones.
      expect(
        prepared.ok && prepared.payload.external?.[CARRIED_ID]?.files[STANDARD_FILES.SKILL_MD],
      ).toBe(await readFile(path.join(carriedSkillDir(), STANDARD_FILES.SKILL_MD), "utf8"));
      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([CARRIED_ID]);
    });

    it("carries an added skill's whole description back, though its short label was cut", async () => {
      await installCarriedSkill({
        description: LONG_DESCRIPTION,
        files: { [STANDARD_FILES.SKILL_MD]: renderSkillMd("brainstorming", LONG_DESCRIPTION) },
      });
      await installCarriedConfig();
      // Subject guard: the install shortened the label, so it cannot be the description's source.
      expect(
        await readFile(path.join(carriedSkillDir(), STANDARD_FILES.METADATA_YAML), "utf8"),
      ).not.toContain(LONG_DESCRIPTION);

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok).toBe(true);
      // Sending the label would shorten the skill once per round trip.
      expect(prepared.ok && prepared.payload.external?.[CARRIED_ID]?.description).toBe(
        LONG_DESCRIPTION,
      );
    });

    it("carries the description the skill's SKILL.md states now, edited since install", async () => {
      await installCarriedSkill({
        description: LONG_DESCRIPTION,
        files: { [STANDARD_FILES.SKILL_MD]: renderSkillMd("brainstorming", LONG_DESCRIPTION) },
      });
      await installCarriedConfig();
      await writeFile(
        path.join(carriedSkillDir(), STANDARD_FILES.SKILL_MD),
        renderSkillMd(CARRIED_ID, EDITED_DESCRIPTION),
      );

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok && prepared.payload.external?.[CARRIED_ID]?.description).toBe(
        EDITED_DESCRIPTION,
      );
    });

    it("carries every file under the skill, not the manifest alone", async () => {
      await installCarriedSkill({
        files: {
          [STANDARD_FILES.SKILL_MD]: renderSkillMd("brainstorming", "Structured brainstorming"),
          "reference/prompts.md": "# Prompts\n",
        },
      });
      await installCarriedConfig();

      const prepared = await seedPayloadForInstallation(projectDir);

      // Nesting lives in the key, so reference files land in the right place.
      expect(
        prepared.ok && Object.keys(prepared.payload.external?.[CARRIED_ID]?.files ?? {}).sort(),
      ).toStrictEqual([STANDARD_FILES.SKILL_MD, "metadata.yaml", "reference/prompts.md"].sort());
    });

    it("leaves an ordinary ejected catalogue skill's bytes at home", async () => {
      const skillDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, REACT_ID);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(REACT_ID));
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({ category: REACT_CATEGORY, slug: "react", contentHash: "aaa" }),
      );
      await injectForkedFromMetadata(skillDir, REACT_ID, "abc1234", {
        source: "github:agents-inc/skills",
      });
      await installConfig(
        installedOverrides({
          skills: [buildSkillConfig(REACT_ID, { scope: "project", origin: EJECT_SOURCE })],
          agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
          stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
        }),
      );

      const prepared = await seedPayloadForInstallation(projectDir);

      // A catalogue id travels without bytes: the receiver already resolves it.
      expect(prepared.ok).toBe(true);
      expect(prepared.ok && prepared.payload.external).toBeUndefined();
      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([REACT_ID]);
    });

    it("refuses a carried skill whose directory has outgrown what one may weigh", async () => {
      await installCarriedSkill();
      await writeFile(
        path.join(carriedSkillDir(), "generated.md"),
        "x".repeat(MAX_EXTERNAL_SKILL_BYTES),
      );
      await installCarriedConfig();

      const prepared = await seedPayloadForInstallation(projectDir);

      // The cap is the contract's; sharing the id without its content would be worse.
      expect(prepared.ok).toBe(false);
      expect(prepared.ok ? "" : prepared.error).toContain(CARRIED_ID);
      expect(prepared.ok ? "" : prepared.error).toContain(String(MAX_EXTERNAL_SKILL_BYTES));
    });

    it("refuses a carried skill whose provenance names a directory but no repository", async () => {
      await installCarriedSkill();
      // Half an address cannot be described, so it is refused.
      await injectForkedFromMetadata(carriedSkillDir(), CARRIED_ID as SkillId, "abc1234", {
        path: CARRIED_PATH,
      });
      await installCarriedConfig();

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok).toBe(false);
      expect(prepared.ok ? "" : prepared.error).toContain(CARRIED_ID);
      expect(prepared.ok ? "" : prepared.error).toContain("repository");
    });
  });

  it("names what the contract cannot carry, in place of a payload", async () => {
    await installConfig(
      installedOverrides({
        skills: [buildSkillConfig(REACT_ID, { scope: "global", origin: PRIVATE_MARKETPLACE })],
      }),
    );

    const prepared = await seedPayloadForInstallation(projectDir);

    expect(prepared.ok).toBe(false);
    expect(prepared.ok ? "" : prepared.error).toContain(PRIVATE_MARKETPLACE);
  });
});

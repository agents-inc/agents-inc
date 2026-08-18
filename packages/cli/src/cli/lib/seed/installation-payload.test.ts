import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

import { MAX_EXTERNAL_SKILL_BYTES, SEED_VERSION } from "@workspace/matrix/seed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedPayloadForInstallation } from "./installation-payload.js";
import { registerExternalSkills, writeExternalSkills } from "./external-skills.js";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts.js";
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
import {
  renderConfigTs,
  renderMetadataYaml,
  renderSkillMd,
} from "../__tests__/content-generators.js";
import { buildSkillConfig } from "../__tests__/helpers/wizard-simulation.js";
import { SKILLS, TEST_CATEGORIES } from "../__tests__/test-fixtures.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { ERROR_MESSAGES } from "../../utils/messages.js";

import type { SkillId } from "../../types/index.js";
import type { FixtureProjectConfig } from "../__tests__/helpers/wizard-simulation.js";
import type { SeedExternalSkill } from "@workspace/matrix/seed";

/**
 * The half `share` and `edit --ui` have in common: the installation this directory records,
 * read and mapped onto the wire contract, with every local failure reported as a message
 * rather than thrown — nothing has been written by the time it runs, so the caller's only
 * job is to explain.
 */

const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";
const PRIVATE_MARKETPLACE = "acme-internal";
/** A skill the user wrote themselves — no catalogue knows it, and nothing forked it. */
const HAND_AUTHORED_ID = "web-framework-house-style";

describe("seedPayloadForInstallation", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-installation-payload-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    // The loader falls back to $HOME when the cwd carries no config, so an unstubbed HOME would
    // let the developer's own installation decide what these runs read.
    vi.stubEnv("HOME", tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function installConfig(overrides: Partial<FixtureProjectConfig>): Promise<void> {
    const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
    await mkdir(claudeSrcDir, { recursive: true });
    await writeFile(
      path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
      renderConfigTs(buildProjectConfig(overrides)),
    );
  }

  /**
   * The one installed configuration these specs read, unless a spec varies it.
   *
   * Widened to the fixture shape because one spec below names a skill the user wrote: a
   * fabricated id is outside the generated union by construction, and per CLAUDE.md it widens
   * rather than casting itself into a union it is not in.
   */
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
    // The counts the caller narrates with are read off the payload, so what is announced and
    // what is posted cannot disagree.
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

  /**
   * `forkedFrom` decides who owns a skill, and the round trip leaves what it does not own alone.
   *
   * The CLI stamps that key into every skill it ejects; a skill the user wrote by hand into
   * `.claude/skills/` carries none. So the question "is this directory the CLI's copy, or the
   * user's own work?" is already answered on disk, offline, by the same read `uninstall` makes
   * before it deletes anything — no matrix load required.
   *
   * Enforced HERE rather than in either command, because `share` and `edit --ui` mint an id from
   * the same directory: a rule one applied and the other did not would make the two disagree
   * about a single project.
   */
  describe("what the round trip owns", () => {
    /** A skill directory as the user wrote it: no provenance, because nothing forked it. */
    async function writeHandAuthoredSkill(skillId: string): Promise<void> {
      const skillDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skillId);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(skillId));
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({ category: REACT_CATEGORY, slug: "house-style", contentHash: "aaa" }),
      );
    }

    /** The same directory after the CLI put it there: the eject stamps its origin into it. */
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

      // Not refused, not carried: a skill the user wrote is simply outside the round trip, so
      // nothing about leaving it home is lossy — it was never in scope.
      expect(prepared.ok).toBe(true);
      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([REACT_ID]);
      // The stack row naming it goes too, or the receiver would be told to assign a skill the
      // payload never carries.
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

      // A marketplace skill has no local directory to hold provenance and needs none: the
      // marketplace is what installs it again, and the question this filter asks is only about
      // the copies the CLI itself writes.
      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([REACT_ID]);
      expect(prepared.ok && prepared.payload.skills[REACT_ID]?.install).toBe("plugin");
    });
  });

  /**
   * The mirror of the half `init --from` already has: a payload carries an added skill's whole
   * directory because no catalogue can resolve its id, so sharing the installation it produced
   * has to carry that directory a second time or mint an id nobody can install whole.
   *
   * Every spec here installs through the inbound path rather than writing a directory by hand.
   * The two halves have to agree about what an added skill's install looks like on disk, and a
   * fixture that spelled that out itself could agree with neither.
   */
  describe("what the round trip carries", () => {
    /** The id an added skill is minted under at intake, and the address its bytes came from. */
    const CARRIED_ID = "external-web-framework-brainstorming";
    const CARRIED_REPO = "obra/superpowers";
    const CARRIED_PATH = "skills/brainstorming";
    const CARRIED_CATEGORY = "web-framework";

    /** Where the install below puts it: project scope, so under this project's own skills. */
    function carriedSkillDir(): string {
      return path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, CARRIED_ID);
    }

    /**
     * Installs one added skill exactly as `init --from` does — seat the catalogue entry, write
     * the bytes, stamp the provenance — and returns the entry the payload carried it as.
     */
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

    /** The configuration such an install leaves behind: one ejected entry, one sub-agent. */
    async function installCarriedConfig(): Promise<void> {
      await installConfig({
        skills: [buildSkillConfig(CARRIED_ID, { scope: "project", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
        stack: { [WEB_DEV]: { [CARRIED_CATEGORY]: [sa(CARRIED_ID)] } },
      });
    }

    it("carries an added skill's own bytes back, rebuilt from the directory the install wrote", async () => {
      const external = await installCarriedSkill();
      await installCarriedConfig();

      const prepared = await seedPayloadForInstallation(projectDir);

      expect(prepared.ok).toBe(true);
      // Everything a catalogue entry needs travels again, because the receiver has to build one
      // from it a second time: the names the sharer saw, the placement they confirmed, and the
      // address the bytes came from.
      expect(prepared.ok && prepared.payload.external?.[CARRIED_ID]).toMatchObject({
        displayName: external.displayName,
        description: external.description,
        categoryId: CARRIED_CATEGORY,
        repo: CARRIED_REPO,
        path: CARRIED_PATH,
      });
      // The bytes as they stand on disk, not as they arrived: the manifest was renamed to the id
      // this install recorded, and a copy of the original would install a skill Claude Code knows
      // as something else.
      expect(
        prepared.ok && prepared.payload.external?.[CARRIED_ID]?.files[STANDARD_FILES.SKILL_MD],
      ).toBe(await readFile(path.join(carriedSkillDir(), STANDARD_FILES.SKILL_MD), "utf8"));
      // And the skill row still names it, because content is where the bytes are and presence in
      // `skills` is still what selects them.
      expect(prepared.ok && Object.keys(prepared.payload.skills)).toStrictEqual([CARRIED_ID]);
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

      // A skill is its SKILL.md AND everything under it. Nesting lives in the key, so a tree that
      // arrives flat is one whose reference files the receiver writes into the wrong place.
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

      // The receiver resolves this id against a catalogue it already has, so its bytes have
      // nothing to add and every one of them would be paid for in the link somebody pastes. A
      // skill an OLDER build carried records no directory either, and travels the same way: the
      // policy is discard, not migrate, and re-adding the skill is what records the address.
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

      // The cap is the contract's, not this module's, and a directory that has grown past it
      // since install is a real case: a payload nobody can store is worse than a refusal, and
      // silently sharing the id without its content is the defect this carry-back exists to end.
      expect(prepared.ok).toBe(false);
      expect(prepared.ok ? "" : prepared.error).toContain(CARRIED_ID);
      expect(prepared.ok ? "" : prepared.error).toContain(String(MAX_EXTERNAL_SKILL_BYTES));
    });

    it("refuses a carried skill whose provenance names a directory but no repository", async () => {
      await installCarriedSkill();
      // Half an address. The install writes both together, so a directory holding one of them is
      // one nothing here can describe — and a payload that named the id while carrying no content
      // is the very silence this row closes.
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

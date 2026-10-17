import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import type { FixtureProjectConfig } from "../helpers/test-utils.js";
import { BRANDING, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * `branding.name` reaches every heading. Each spec asserts the configured name and the shipped
 * default with no `branding` key; neither half means anything alone.
 */

/** The config's own `name`, not the branding. */
const PROJECT_NAME = "branding-fixture";

type BrandedProject = {
  project: ProjectHandle;
  env: { HOME: string };
};

type DeclaredContent = Pick<FixtureProjectConfig, "skills" | "agents">;

const NOTHING_DECLARED: DeclaredContent = { skills: [], agents: [] };

/**
 * `detectInstallation` answers null for a config declaring no content, so the dashboard needs one
 * skill and one sub-agent.
 */
const DASHBOARD_CONTENT: DeclaredContent = {
  skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project" }),
  agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
};

/**
 * Ejected at global scope: eject keeps the Claude CLI out, and the decode refuses a project skill
 * on a default-scoped sub-agent.
 */
const SEED_PAYLOAD = buildSeedPayload({
  skills: {
    [E2E_SKILL.react.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
    }),
  },
});

/** Eight characters, as the wire requires. */
const SEED_ID = "Brand001";

describe("the name a run prints itself under", () => {
  let tempDir: string;
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  /**
   * HOME is kept apart from the project: `branding` falls back to the global config, which would
   * otherwise answer for the project's own. `marketplace` is an empty local directory so `doctor`
   * makes no network round trip.
   */
  async function writeBrandedProject(
    brandingName: string | undefined,
    declares: DeclaredContent,
  ): Promise<BrandedProject> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    const marketplaceDir = path.join(tempDir, "marketplace");
    await mkdir(home, { recursive: true });
    await mkdir(marketplaceDir, { recursive: true });

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: PROJECT_NAME,
        marketplace: marketplaceDir,
        ...declares,
        ...(brandingName !== undefined && { branding: { name: brandingName } }),
      }),
    );

    return { project: { dir: projectDir }, env: { HOME: home } };
  }

  async function buildProject(brandingName?: string): Promise<BrandedProject> {
    return writeBrandedProject(brandingName, NOTHING_DECLARED);
  }

  /** An empty working directory under a branded HOME, so only the global config applies. */
  async function buildProjectUnderBrandedHome(brandingName?: string): Promise<BrandedProject> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await writeProjectConfig(
      home,
      buildProjectConfig({
        name: PROJECT_NAME,
        ...NOTHING_DECLARED,
        ...(brandingName !== undefined && { branding: { name: brandingName } }),
      }),
    );

    return { project: { dir: projectDir }, env: { HOME: home } };
  }

  async function buildInstalledProject(brandingName?: string): Promise<BrandedProject> {
    const built = await writeBrandedProject(brandingName, DASHBOARD_CONTENT);
    await createLocalSkill(built.project.dir, E2E_SKILL.react.id);
    await writeAgentFile(built.project.dir, E2E_AGENT["web-developer"].name, {
      frontmatter: true,
    });
    return built;
  }

  async function runBothWays(
    args: string[],
    build: (brandingName?: string) => Promise<BrandedProject> = buildProject,
  ): Promise<{ configured: string; unconfigured: string }> {
    const branded = await build(BRANDING.WHITE_LABEL_NAME);
    const { output: configured } = await CLI.run(args, branded.project, { env: branded.env });
    await cleanupTempDir(tempDir);

    const plain = await build();
    const { output: unconfigured } = await CLI.run(args, plain.project, { env: plain.env });

    return { configured, unconfigured };
  }

  it("heads doctor with the configured name, and with the shipped one when none is configured", async () => {
    const { configured, unconfigured } = await runBothWays(["doctor"]);

    expect(configured).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
    expect(
      configured,
      "the shipped name is replaced, not printed beside the configured one",
    ).not.toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);

    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.DOCTOR_HEADING_NOUN}`);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  it("heads eject with the configured name, and with the shipped one when none is configured", async () => {
    const { configured, unconfigured } = await runBothWays(["eject", "agent-partials"]);

    expect(configured).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.EJECT_HEADING_NOUN}`);
    expect(configured).not.toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.EJECT_HEADING_NOUN}`);

    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.EJECT_HEADING_NOUN}`);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  it("opens and signs off uninstall with the configured name, and with the shipped one when none is configured", async () => {
    const { configured, unconfigured } = await runBothWays(["uninstall", "--yes"]);

    expect(configured).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.UNINSTALL_HEADING_NOUN}`);
    expect(configured).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.UNINSTALL_SIGN_OFF}`);
    expect(configured).not.toContain(BRANDING.DEFAULT_NAME);

    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.UNINSTALL_HEADING_NOUN}`);
    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.UNINSTALL_SIGN_OFF}`);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  it("titles the dashboard with the configured name, and with the shipped one when none is configured", async () => {
    const { configured, unconfigured } = await runBothWays([], buildInstalledProject);

    expect(configured.split("\n")).toContain(BRANDING.WHITE_LABEL_NAME);
    expect(unconfigured.split("\n")).toContain(BRANDING.DEFAULT_NAME);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  /** The only leg that reaches the global config: the working directory holds none. */
  it("names the tool from a global config when the working directory holds no config of its own", async () => {
    const branded = await buildProjectUnderBrandedHome(BRANDING.WHITE_LABEL_NAME);
    const { output: configured } = await CLI.run(["uninstall", "--yes"], branded.project, {
      env: branded.env,
    });
    await cleanupTempDir(tempDir);

    const plain = await buildProjectUnderBrandedHome();
    const { output: unconfigured } = await CLI.run(["uninstall", "--yes"], plain.project, {
      env: plain.env,
    });

    expect(configured).toContain(
      `${BRANDING.WHITE_LABEL_NAME} ${STEP_TEXT.UNINSTALL_NOT_INSTALLED}`,
    );
    expect(configured).not.toContain(BRANDING.DEFAULT_NAME);

    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${STEP_TEXT.UNINSTALL_NOT_INSTALLED}`);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  /** `--from` is the only route to `init`'s closing line. */
  it(
    "signs off init with the configured name, and with the shipped one when none is configured",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      store.publish(SEED_ID, SEED_PAYLOAD);
      const branded = await buildProject(BRANDING.WHITE_LABEL_NAME);
      const configured = await runInitFrom(
        store,
        SEED_ID,
        { ...branded.project, globalHome: branded.env.HOME },
        sourceDir,
      );
      await cleanupTempDir(tempDir);

      store.publish(SEED_ID, SEED_PAYLOAD);
      const plain = await buildProject();
      const unconfigured = await runInitFrom(
        store,
        SEED_ID,
        { ...plain.project, globalHome: plain.env.HOME },
        sourceDir,
      );

      expect(configured.exitCode, `init --from output:\n${configured.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(configured.output).toContain(`${BRANDING.WHITE_LABEL_NAME} ${STEP_TEXT.INIT_SUCCESS}`);
      expect(configured.output).not.toContain(BRANDING.DEFAULT_NAME);

      expect(unconfigured.exitCode, `init --from output:\n${unconfigured.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(unconfigured.output).toContain(`${BRANDING.DEFAULT_NAME} ${STEP_TEXT.INIT_SUCCESS}`);
      expect(unconfigured.output).not.toContain(BRANDING.WHITE_LABEL_NAME);
    },
  );
});

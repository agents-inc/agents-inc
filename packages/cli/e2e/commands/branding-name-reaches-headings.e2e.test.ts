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
import type { ProjectHandle } from "../pages/wizard-result.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * `branding.name` is a declared field of the project config, admitted by the loader schema and
 * published in `src/schemas/project-source-config.schema.json` — and until this spec nothing read
 * it. Every heading the CLI printed came off the shipped default, so a user who white-labelled
 * their configuration changed nothing about what their terminal said.
 *
 * **Every `it` here asserts both halves, and neither means anything alone.** The configured half
 * on its own passes on a heading hardcoded to the fixture name; the default half on its own passes
 * on wiring that never landed. Together they say the heading follows the config.
 *
 * The default half is the one that has to keep being true: a user with no `branding` key must see
 * exactly the line they see today, which is the whole of what makes this a wiring change rather
 * than a rename.
 */

/** The `name` field every fixture config here carries — the config's own name, not the branding. */
const PROJECT_NAME = "branding-fixture";

/** One project directory and the isolated HOME every command against it is run under. */
type BrandedProject = {
  project: ProjectHandle;
  env: { HOME: string };
};

/** What a fixture configuration declares — empty for every command but the dashboard. */
type DeclaredContent = Pick<FixtureProjectConfig, "skills" | "agents">;

const NOTHING_DECLARED: DeclaredContent = { skills: [], agents: [] };

/**
 * The one skill and one sub-agent the dashboard needs declared before it will render.
 * `detectInstallation` answers `null` for a configuration declaring no content, and a bare
 * invocation then falls straight through to oclif's help.
 */
const DASHBOARD_CONTENT: DeclaredContent = {
  skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project" }),
  agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
};

/**
 * The shared configuration `init --from` installs, ejected at global scope like every other
 * `--from` spec: the E2E source is local and carries no marketplace, so plugin mode legitimately
 * refuses it, and a project-scoped skill assigned to a sub-agent resting at the shared default is
 * a pair the decode refuses outright.
 */
const SEED_PAYLOAD = {
  v: 5,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {
    [E2E_SKILL.react.id]: {
      install: "eject",
      scope: "global",
      assignments: { "web-developer": "lazy" },
    },
  },
  agents: {},
};

/** The id the store publishes {@link SEED_PAYLOAD} under. Eight characters, as the wire requires. */
const SEED_ID = "Brand001";

describe("the name a run prints itself under", () => {
  let tempDir: string;
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    // The `init --from` leg is the only one that needs either, and both are built once: the
    // other four legs run against a config and an empty marketplace directory alone.
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
   * Builds a project whose config carries `branding.name` when one is given, and no `branding`
   * key at all when it is not — the two states this file is about.
   *
   * HOME is kept distinct from the project directory throughout. `branding` resolves through the
   * project config and falls back to the GLOBAL one, so a shared HOME would let a global config
   * answer for the project's own and make the default half of every pair unfalsifiable.
   *
   * `marketplace` points at an empty local directory so `doctor` reaches its verdict without a
   * network round trip. It reports that marketplace as carrying no skills, which is true and is
   * not what any assertion here is about — the heading is printed before the first check runs.
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

    await writeProjectConfig(projectDir, {
      name: PROJECT_NAME,
      marketplace: marketplaceDir,
      ...declares,
      ...(brandingName !== undefined && { branding: { name: brandingName } }),
    });

    return { project: { dir: projectDir }, env: { HOME: home } };
  }

  /** A project declaring nothing — every command here but the dashboard runs against one. */
  async function buildProject(brandingName?: string): Promise<BrandedProject> {
    return writeBrandedProject(brandingName, NOTHING_DECLARED);
  }

  /**
   * An EMPTY working directory under a HOME that carries the branded configuration. The project
   * has no `.claude-src/` of its own, so the only rung left is the global one.
   */
  async function buildProjectUnderBrandedHome(brandingName?: string): Promise<BrandedProject> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await writeProjectConfig(home, {
      name: PROJECT_NAME,
      ...NOTHING_DECLARED,
      ...(brandingName !== undefined && { branding: { name: brandingName } }),
    });

    return { project: { dir: projectDir }, env: { HOME: home } };
  }

  /** The same project with its declared skill and sub-agent actually on disk, so counts exist. */
  async function buildInstalledProject(brandingName?: string): Promise<BrandedProject> {
    const built = await writeBrandedProject(brandingName, DASHBOARD_CONTENT);
    await createLocalSkill(built.project.dir, E2E_SKILL.react.id);
    await writeAgentFile(built.project.dir, E2E_AGENT["web-developer"].name, {
      frontmatter: true,
    });
    return built;
  }

  /**
   * Runs `args` twice — once against a config naming {@link BRANDING.WHITE_LABEL_NAME} and once
   * against a config with no `branding` key — and returns what each run said.
   */
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

  /**
   * `uninstall` prints the name twice — the heading it opens with and the line it signs off with —
   * and the sign-off is the one that reads as a claim about the product rather than a title, so
   * both are asserted.
   */
  it("opens and signs off uninstall with the configured name, and with the shipped one when none is configured", async () => {
    const { configured, unconfigured } = await runBothWays(["uninstall", "--yes"]);

    expect(configured).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.UNINSTALL_HEADING_NOUN}`);
    expect(configured).toContain(`${BRANDING.WHITE_LABEL_NAME} ${BRANDING.UNINSTALL_SIGN_OFF}`);
    expect(configured).not.toContain(BRANDING.DEFAULT_NAME);

    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.UNINSTALL_HEADING_NOUN}`);
    expect(unconfigured).toContain(`${BRANDING.DEFAULT_NAME} ${BRANDING.UNINSTALL_SIGN_OFF}`);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  /**
   * The dashboard is the bare invocation's whole output, and its first line is the name alone —
   * no noun follows it, so the assertion is the line itself.
   */
  it("titles the dashboard with the configured name, and with the shipped one when none is configured", async () => {
    const { configured, unconfigured } = await runBothWays([], buildInstalledProject);

    expect(configured.split("\n")).toContain(BRANDING.WHITE_LABEL_NAME);
    expect(unconfigured.split("\n")).toContain(BRANDING.DEFAULT_NAME);
    expect(unconfigured).not.toContain(BRANDING.WHITE_LABEL_NAME);
  });

  /**
   * The GLOBAL rung of the resolution, which no other leg here reaches: the working directory
   * holds nothing at all, so the only configuration in play is the one under HOME. It is also the
   * one state where `uninstall` prints "is not installed in this project" — a sentence about the
   * product that sits between the same run's heading and its `No changes made.`, so a shipped name
   * there would contradict the configured name directly above it.
   */
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

  /**
   * `init`'s closing line, which is the most prominent claim the CLI makes about itself. Driven
   * through `--from` because it is the one non-interactive route to it — the wizard route reaches
   * the identical `reportSuccess`.
   */
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

import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { cleanupTempDir, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";

// A plugin source: a local source without marketplace.json hard-errors on plugin install.
const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("slug-based relationship rules", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let fixture: E2EPluginSource | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
    if (fixture) await cleanupTempDir(fixture.tempDir);
    fixture = undefined;
  });

  async function installStackFrom(source: E2EPluginSource): Promise<ProjectHandle> {
    env = await createTestEnvironment();
    const site = { dir: env.projectDir, home: env.fakeHome };
    await installFromSeed(
      store,
      "Relation1",
      e2eStackPayload({ install: "plugin" }),
      site,
      source.sourceDir,
    );
    return { dir: site.dir, globalHome: site.home };
  }

  describe("conflict rules", () => {
    it(
      "should detect unresolved conflict references via doctor",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // `angular-standalone` is not in the E2E source, so it must be flagged as unresolved.
        fixture = await createE2EPluginSource({
          relationships: {
            conflicts: [
              {
                skills: [E2E_SKILL.react.slug, "angular-standalone"],
                reason: "React and Angular are mutually exclusive frameworks",
              },
            ],
          },
        });

        const project = await installStackFrom(fixture);

        const { output } = await CLI.run(["doctor"], project);

        expect(output).toContain(STEP_TEXT.UNRESOLVED_SLUG);
        expect(output).toContain("angular-standalone");
      },
    );
  });

  describe("require rules", () => {
    it(
      "should detect unresolved require references via doctor",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // A valid SkillSlug, so the rules pass the schema, but absent from the E2E source.
        fixture = await createE2EPluginSource({
          relationships: {
            requires: [
              {
                skill: E2E_SKILL.zustand.slug,
                needs: ["angular-standalone"],
                reason: "Zustand needs Angular (testing unresolved reference)",
              },
            ],
          },
        });

        const project = await installStackFrom(fixture);

        const { output } = await CLI.run(["doctor"], project);

        expect(output).toContain(STEP_TEXT.UNRESOLVED_SLUG);
        expect(output).toContain("angular-standalone");
      },
    );
  });

  describe("valid source slugs are not reported as unresolved", () => {
    it(
      "should not flag E2E source slugs as unresolved references",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        fixture = await createE2EPluginSource({
          relationships: {
            conflicts: [
              {
                skills: [E2E_SKILL.react.slug, E2E_SKILL.hono.slug],
                reason: "Test conflict with valid slugs only",
              },
            ],
            requires: [
              {
                skill: E2E_SKILL.zustand.slug,
                needs: [E2E_SKILL.react.slug],
                reason: "Zustand requires React",
              },
            ],
          },
        });

        const project = await installStackFrom(fixture);

        const { output } = await CLI.run(["doctor"], project);

        // An unresolved slug passes through raw into the warning; a resolved one becomes its
        // SkillId, which must never appear as an unresolved reference.
        expect(output).not.toContain(`unresolved reference '${E2E_SKILL.react.id}'`);
        expect(output).not.toContain(`unresolved reference '${E2E_SKILL.zustand.id}'`);
        expect(output).not.toContain(`unresolved reference '${E2E_SKILL.hono.id}'`);
      },
    );
  });

  describe("discourages rules", () => {
    it(
      "should detect unresolved discourages references via doctor",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        fixture = await createE2EPluginSource({
          relationships: {
            discourages: [
              {
                skills: [E2E_SKILL.react.slug, "angular-standalone"],
                reason: "React and Angular are discouraged together",
              },
            ],
          },
        });

        const project = await installStackFrom(fixture);

        const { output } = await CLI.run(["doctor"], project);

        expect(output).toContain(STEP_TEXT.UNRESOLVED_SLUG);
        expect(output).toContain("angular-standalone");
      },
    );
  });
});

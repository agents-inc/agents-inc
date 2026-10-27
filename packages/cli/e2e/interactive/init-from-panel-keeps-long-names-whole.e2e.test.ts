import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, readTreeSnapshot, writeProjectConfig } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { TreeSnapshotEntry } from "../helpers/test-utils.js";

/**
 * The panel's header puts each label in a row beside its value. The configuration installs only
 * copies into the project, so the one marketplace the header names is that of the global plugin the
 * project inherits. Its kebab-case name has no space to wrap at and is longer than the line beside
 * its label at either width, so the Marketplace row is the subject; the short Stack row under it is
 * the control. Pinned from the top border to the blank line under the Stack row.
 *
 * The global install is written as its config only: the panel draws inherited rows from the config,
 * and a declined run reaches no plugin.
 */

const LONG_MARKETPLACE =
  "acme-corporation-internal-agent-skills-marketplace-for-platform-engineering-teams-and-contractors";

const PANEL_ID = "LongNames1";

type InstallSurfaces = {
  project: Record<string, TreeSnapshotEntry>;
  home: Record<string, TreeSnapshotEntry>[];
};

describe("init --from <id> at a terminal, beside a marketplace name longer than its line", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(PANEL_ID, e2eStackPayload({ scope: "project" }));
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** Not HOME whole: the project sits inside it, and a load's cache is not an install. */
  async function snapshotInstallSurfaces(environment: TestEnvironment): Promise<InstallSurfaces> {
    const [project, ...home] = await Promise.all([
      readTreeSnapshot(environment.projectDir),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE)),
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
    ]);
    return { project, home };
  }

  /** Asks, is declined, and answers what the terminal shows; a declined install writes nothing. */
  async function declinedPanelAt(size: { cols: number; rows: number }): Promise<string> {
    env = await createTestEnvironment();
    await writeProjectConfig(
      env.fakeHome,
      buildProjectConfig({
        name: "global-plugin-install",
        marketplaceName: LONG_MARKETPLACE,
        skills: buildSkillConfigs([E2E_SKILL.pinia.id], {
          scope: "global",
          origin: LONG_MARKETPLACE,
        }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      }),
    );
    const before = await snapshotInstallSurfaces(env);

    prompt = new InteractivePrompt(
      ["init", "--from", PANEL_ID, "--marketplace", E2E_SOURCE.sourceDir],
      env.projectDir,
      { ...size, env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome } },
    );
    await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);
    expect(
      prompt.getOutput(),
      "init --from at a terminal must ask before it installs a shared configuration",
    ).toContain(STEP_TEXT.SHARED_CONFIG_INSTALL_CONFIRM);

    await prompt.deny();
    expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT), prompt.getOutput()).toBe(
      EXIT_CODES.CANCELLED,
    );
    expect(
      await snapshotInstallSurfaces(env),
      "a declined install writes nothing at either scope",
    ).toStrictEqual(before);
    return prompt.getScreen();
  }

  it(
    "keeps the Marketplace label and its gap, and wraps the name under itself, at 80 columns",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const screen = await declinedPanelAt(TERMINAL_SIZE.NARROWEST);

      expect(screen).toContain(
        [
          "┌──────────────────────────────────────────────────────────────────────────────┐",
          "│  Marketplace acme-corporation-internal-agent-skills-marketplace-for-platfor  │",
          "│              m-engineering-teams-and-contractors                             │",
          "│  Stack E2E Test Stack                                                        │",
          "│                                                                              │",
        ].join("\n"),
      );
    },
  );

  it(
    "keeps the Marketplace label and its gap, and wraps the name under itself, at 100 columns",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const screen = await declinedPanelAt(TERMINAL_SIZE.MIDDLE);

      expect(screen).toContain(
        [
          "┌──────────────────────────────────────────────────────────────────────────────────────────────────┐",
          "│  Marketplace acme-corporation-internal-agent-skills-marketplace-for-platform-engineering-teams-  │",
          "│              and-contractors                                                                     │",
          "│  Stack E2E Test Stack                                                                            │",
          "│                                                                                                  │",
        ].join("\n"),
      );
    },
  );
});

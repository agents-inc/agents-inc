import { readdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { EXIT_CODES } from "../../exit-codes";
import { EJECT_SOURCE } from "../../../consts";

/** Where a Codex installation's config sits under a project; a literal, as a person types it. */
const CODEX_INSTALLATION_FOLDER = ".agents-inc/codex";

/** Codex offers no project-scoped plugins, so this row was never installed by it. */
const UNPLACEABLE_FINDING =
  "Refusing to install web-framework-react as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.";

/**
 * A config copied into a Codex installation's folder can name a placement Codex never offers: the
 * commands that act on what the config says refuse before they act, with the host's own finding.
 */
describe("a command acting on a config its host cannot place", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-unplaceable-config-test-"));
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
      }),
      CODEX_INSTALLATION_FOLDER,
    );
  });

  afterEach(async () => {
    await cleanup();
  });

  it.each([["update"], ["share"], ["compile"], ["edit"]])(
    "%s refuses with the host's finding and leaves the project as it was",
    async (command) => {
      const before = await readdir(projectDir, { recursive: true });

      const { error } = await runCliCommand([command]);

      expect(error?.message).toBe(UNPLACEABLE_FINDING);
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(await readdir(projectDir, { recursive: true })).toStrictEqual(before);
    },
  );

  it("acts on a placement the host offers", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: EJECT_SOURCE,
        }),
      }),
      CODEX_INSTALLATION_FOLDER,
    );

    const { stdout, error } = await runCliCommand(["update"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain("No plugin marketplaces are configured — nothing to refresh.");
  });
});

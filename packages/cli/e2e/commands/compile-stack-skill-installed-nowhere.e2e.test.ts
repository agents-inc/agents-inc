import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  flattenCliOutput,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * `compile` over a stack skill installed nowhere prints only the "configured but was not found"
 * line, which also guards the absence of the "not found in matrix" one.
 */

/** A real catalogue skill the E2E fixture does not ship. */
const INSTALLED_NOWHERE = "web-styling-tailwind";

const WEB_DEV = E2E_AGENT["web-developer"].name;

describe("compile over a stack naming a skill installed nowhere", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "says the skill was not found, and nothing about a custom or local copy",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: E2E_SOURCE.sourceDir,
        skills: [E2E_SKILL.react.id],
        unresolvableSkills: [INSTALLED_NOWHERE],
        agents: [WEB_DEV],
        stack: {
          [WEB_DEV]: {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            "web-styling": [{ id: INSTALLED_NOWHERE }],
          },
        },
      });
      tempDir = path.dirname(project.dir);
      const configBefore = await readTestFile(configTsPath(project.dir));

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(said, "the true line about the skill is still said").toContain(
        `'${INSTALLED_NOWHERE}' ${STEP_TEXT.SKILL_NOT_FOUND_WARNING}`,
      );
      expect(
        said,
        "no line may hold out a custom or local copy of a skill installed nowhere",
      ).not.toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);

      expect(
        await readTestFile(configTsPath(project.dir)),
        "compile must not rewrite config.ts",
      ).toBe(configBefore);
      await expect(project).toHaveCompiledAgentContent(WEB_DEV, {
        contains: [E2E_SKILL.react.id],
        notContains: [INSTALLED_NOWHERE],
      });
    },
  );
});

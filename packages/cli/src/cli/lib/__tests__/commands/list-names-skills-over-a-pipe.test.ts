import path from "path";
import { readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { writeTestSkill } from "../helpers/disk-writers.js";
import { firstElement } from "../helpers/element-at.js";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { createTestSkill } from "../factories/skill-factories.js";
import {
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  type TestSkill,
} from "../fixtures/create-test-source.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { SINGLE_REACT_MATRIX } from "../mock-data/mock-matrices";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import type { SkillConfig } from "../../../types/config.js";

/**
 * Over a pipe `list` names the skills its panel draws (CLI-978, owner 2026-10-24: "Yes: list them
 * by display name in plain text"): one line each under the `Skills:` count, with its scope, in the
 * panel's order — project rows, then global rows, each in config order — and by the panel's name:
 * the one its install recorded, else the built-in catalogue's, else the id. An entry the project
 * excluded is not listed, and a skill at both scopes is listed at each. Run through `runCliCommand`
 * on a pipe, so the catalogue is the one `dist/` ships. The terminal half is
 * `list-names-skills-by-display-name.test.ts`.
 */

/** Literal: a test reading the folder off the product would move with it. */
const CLAUDE_FOLDER = ".agents-inc/claude";

/** No catalogue lists a marketplace's namespaced id, and neither id spells its name. */
const HOUSE_REACT = firstElement(
  inTestMarketplace([
    createTestSkill("web-framework-react", "A house React guide", { displayName: "House React" }),
  ]),
);
const HOUSE_HONO = firstElement(
  inTestMarketplace([
    createTestSkill("api-framework-hono", "A house Hono guide", { displayName: "House Hono" }),
  ]),
);

/** The name a copy of `web-framework-react` gives itself, which the catalogue calls "React". */
const COPY_DISPLAY_NAME = "Acme React";

/** The entry an install writes, recording the name the skill's marketplace gave it. */
function recordedEntry(skill: TestSkill, entry: Partial<Pick<SkillConfig, "scope" | "origin">>) {
  return buildSkillConfig(skill.id, { ...entry, displayName: skill.displayName });
}

const PROJECT_AND_GLOBAL_AGENTS = [
  ...buildAgentConfigs(["web-developer"], { scope: "project" }),
  ...buildAgentConfigs(["api-developer"], { scope: "global" }),
];

describe("what list names each skill over a pipe", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-list-piped-names-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  function configPathIn(baseDir: string): string {
    return path.join(baseDir, CLAUDE_FOLDER, "config.ts");
  }

  it("lists each skill by the name its install recorded, with its scope, project rows first as the panel draws them", async () => {
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        recordedEntry(HOUSE_HONO, { scope: "global" }),
        recordedEntry(HOUSE_REACT, { scope: "project" }),
      ],
    });

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "each line under the count names one skill as its install recorded it").toBe(
      [
        "",
        "Installation: installation",
        "  Mode:    Eject",
        "  Skills:  2",
        "    House React (project)",
        "    House Hono (global)",
        "  Agents:  0",
        `  Config:  ${configPathIn(projectDir)}`,
        "",
        "",
      ].join("\n"),
    );
  });

  it("lists plugin skills at either scope by the name their install recorded", async () => {
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        recordedEntry(HOUSE_REACT, { scope: "project", origin: TEST_MARKETPLACE_NAME }),
        recordedEntry(HOUSE_HONO, { scope: "global", origin: TEST_MARKETPLACE_NAME }),
      ],
    });

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "a plugin leaves no copy, so only the install's record can name its line").toBe(
      [
        "",
        "Installation: installation",
        "  Mode:    Plugin",
        "  Skills:  2",
        "    House React (project)",
        "    House Hono (global)",
        "  Agents:  0",
        `  Config:  ${configPathIn(projectDir)}`,
        "",
        "",
      ].join("\n"),
    );
  });

  it("names a skill whose install recorded no name by the built-in catalogue, else by its id, and never by its copy's metadata.yaml", async () => {
    initializeMatrix(SINGLE_REACT_MATRIX);
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        buildSkillConfig("web-framework-react", { scope: "project" }),
        buildSkillConfig(HOUSE_HONO.id, { scope: "global" }),
      ],
    });
    const copyDir = await writeTestSkill(
      path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS),
      "web-framework-react",
      {
        extraMetadata: { displayName: COPY_DISPLAY_NAME },
      },
    );
    expect(
      await readFile(path.join(copyDir, STANDARD_FILES.METADATA_YAML), "utf-8"),
      "the copy names itself, so a catalogue-named line means list read no copy",
    ).toContain(`displayName: ${COPY_DISPLAY_NAME}\n`);

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "an unrecorded line reads as the panel's row does, whatever its copy says").toBe(
      [
        "",
        "Installation: installation",
        "  Mode:    Eject",
        "  Skills:  2",
        "    React (project)",
        `    ${HOUSE_HONO.id} (global)`,
        "  Agents:  0",
        `  Config:  ${configPathIn(projectDir)}`,
        "",
        "",
      ].join("\n"),
    );
  });

  it("lists a skill installed at both scopes at each, in config order, and leaves out the global install the project excluded", async () => {
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        buildSkillConfig("web-testing-vitest", { scope: "project" }),
        buildSkillConfig("web-framework-react", { scope: "project" }),
        buildSkillConfig("web-testing-vitest", { scope: "global" }),
        buildSkillConfig("web-framework-react", { scope: "global", excluded: true }),
      ],
    });

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(
      stdout,
      "the lines are the panel's rows: one per scope a skill is active at, none for an excluded entry",
    ).toBe(
      [
        "",
        "Installation: installation",
        "  Mode:    Eject",
        "  Skills:  2",
        "    Vitest (project)",
        "    React (project)",
        "    Vitest (global)",
        "  Agents:  0",
        `  Config:  ${configPathIn(projectDir)}`,
        "",
        "",
      ].join("\n"),
    );
  });

  it("lists the global installation's skills from a folder holding none of its own", async () => {
    await writeTestTsConfig(fakeHome, {
      ...buildProjectConfig({
        name: "global-installation",
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      }),
      skills: [
        recordedEntry(HOUSE_REACT, { scope: "global" }),
        buildSkillConfig("web-testing-vitest", { scope: "global" }),
      ],
    });

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "a folder inheriting the global installation lists what that one holds").toBe(
      [
        "",
        "Installation: global-installation",
        "  Mode:    Eject",
        "  Skills:  2",
        "    House React (global)",
        "    Vitest (global)",
        "  Agents:  0",
        `  Config:  ${configPathIn(fakeHome)}`,
        "",
        "",
      ].join("\n"),
    );
  });
});

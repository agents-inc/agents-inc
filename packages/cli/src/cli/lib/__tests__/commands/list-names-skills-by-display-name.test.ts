import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { firstElement } from "../helpers/element-at.js";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { createTestSkill } from "../factories/skill-factories.js";
import {
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  type TestSkill,
} from "../fixtures/create-test-source.js";
import { renderMetadataYaml, renderSkillMd } from "../content-generators";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import type { SkillConfig } from "../../../types/config.js";

/**
 * At a terminal `list` names each skill as its install recorded it — the `displayName` on its
 * config.ts entry, which CLI-963 writes at install and loads back — and an entry recording none by
 * the built-in catalogue, else by its id, as 0.173.0 does. It reads no copy's metadata.yaml for a
 * name: one record names every summary. Run through `runCliCommand`, so the catalogue is the one
 * `dist/` ships, not a test one.
 *
 * The plugin spec was written after the product already passed it, so it was checked by deleting
 * the recorded name from its entries: both rows went to the wrapped id.
 */

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

/** A copy of a skill the built-in catalogue names "React", naming itself otherwise. */
const RENAMED_REACT_COPY = createTestSkill("web-framework-react", "A renamed React guide", {
  displayName: "Acme React",
});

const COPY_HASH = "abc1234";
const FORKED_ON = "2026-01-01";

/** The entry an install writes, recording the name the skill's marketplace gave it. */
function recordedEntry(skill: TestSkill, entry: Partial<Pick<SkillConfig, "scope" | "origin">>) {
  return buildSkillConfig(skill.id, { ...entry, displayName: skill.displayName });
}

/** A copy as eject leaves it: its SKILL.md, and a metadata.yaml naming it and where it came from. */
async function writeEjectedCopy(baseDir: string, skill: TestSkill): Promise<void> {
  const copyDir = path.join(baseDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, skill.id);
  await mkdir(copyDir, { recursive: true });
  await writeFile(
    path.join(copyDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd(skill.id, skill.description),
  );
  await writeFile(
    path.join(copyDir, STANDARD_FILES.METADATA_YAML),
    renderMetadataYaml({
      author: skill.author,
      category: skill.category,
      domain: skill.domain,
      slug: skill.slug,
      displayName: skill.displayName,
      contentHash: COPY_HASH,
      forkedFrom: { skillId: skill.id, contentHash: COPY_HASH, date: FORKED_ON },
    }),
  );
}

const PROJECT_AND_GLOBAL_AGENTS = [
  ...buildAgentConfigs(["web-developer"], { scope: "project" }),
  ...buildAgentConfigs(["api-developer"], { scope: "global" }),
];

describe("what list names each skill at a terminal", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  standAtTerminal();

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-list-names-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  it("names each skill by the name its install recorded, at either scope, where no catalogue lists it and no copy is on disk", async () => {
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        recordedEntry(HOUSE_REACT, { scope: "project" }),
        recordedEntry(HOUSE_HONO, { scope: "global" }),
      ],
    });

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "only the install's record can name these rows").toBe(
      [
        "",
        " Mode Eject",
        "",
        " Skills                                            │  Agents",
        "                                                   │",
        "  Project                                          │   Project",
        " • House React ⏏                                   │  • web-developer",
        "                                                   │",
        "  Global                                           │   Global",
        " • House Hono ⏏                                    │  • api-developer",
        "",
        "",
      ].join("\n"),
    );
  });

  it("names a skill whose install recorded no name by the built-in catalogue, else by its id, and never by its copy's metadata.yaml", async () => {
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        buildSkillConfig(RENAMED_REACT_COPY.id, { scope: "project" }),
        buildSkillConfig(HOUSE_HONO.id, { scope: "global" }),
      ],
    });
    await writeEjectedCopy(projectDir, RENAMED_REACT_COPY);
    await writeEjectedCopy(fakeHome, HOUSE_HONO);

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "an unrecorded row reads as 0.173.0 drew it, whatever its copy says").toBe(
      [
        "",
        " Mode Eject",
        "",
        " Skills                                            │  Agents",
        "                                                   │",
        "  Project                                          │   Project",
        " • React ⏏                                         │  • web-developer",
        "                                                   │",
        "  Global                                           │   Global",
        " • test-fixture-api-fra                            │  • api-developer",
        "   mework-hono ⏏                                   │",
        "",
        "",
      ].join("\n"),
    );
  });

  it("names a plugin skill from a marketplace the built-in catalogue does not list by the name its install recorded", async () => {
    await writeTestTsConfig(projectDir, {
      ...buildProjectConfig({ name: "installation", agents: PROJECT_AND_GLOBAL_AGENTS }),
      skills: [
        recordedEntry(HOUSE_REACT, { scope: "project", origin: TEST_MARKETPLACE_NAME }),
        recordedEntry(HOUSE_HONO, { scope: "global", origin: TEST_MARKETPLACE_NAME }),
      ],
    });

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout, "a plugin leaves no copy, so only the install's record can name its row").toBe(
      [
        "",
        " Mode Plugin",
        "",
        " Skills                                            │  Agents",
        "                                                   │",
        "  Project                                          │   Project",
        " • House React                                     │  • web-developer",
        "                                                   │",
        "  Global                                           │   Global",
        " • House Hono                                      │  • api-developer",
        "",
        "",
      ].join("\n"),
    );
  });
});
